import { lockConfiguration } from "./lifecycle";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { getServer, listServers, resolveServerPath, readVelocityConfig } from "./server-manager";
import { velocityText, propertiesText, yamlText, tomlText, type ProxyConfig } from "./network-config";
import { pendingAction, notifyPanel } from "./lifecycle";

let queue = Promise.resolve();
const read = async (file: string) => { try { return await readFile(file,"utf8"); } catch(e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } };
type Change = { file: string; before: string | null; after: string | null };
export async function configureNetwork(proxyId: string, config: ProxyConfig, authorize?: (id: string) => Promise<unknown>) {
  const operation = queue.then(() => apply(proxyId, config, authorize));
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}
async function apply(proxyId: string, config: ProxyConfig, authorize?: (id: string) => Promise<unknown>) {
  const proxy = await getServer(proxyId);
  if (!proxy || proxy.type.toLowerCase() !== "velocity") throw new Error("Se necesita un proxy Velocity");
  if (proxy.status !== "Detenido" || pendingAction(proxyId)) throw new Error("Detén el proxy antes de configurar la network");
  const all = await listServers();
  const backends = config.servers.map(entry => {
    const server = entry.serverId ? all.find(s => s.id === entry.serverId) : all.find(s => entry.address === `127.0.0.1:${s.port}`);
    if (!server || server.id === proxyId || server.type.toLowerCase() === "velocity") throw new Error(`Servidor de destino inválido: ${entry.name}`);
    return { entry, server };
  });
  if (new Set(backends.map(b => b.server.id)).size !== backends.length) throw new Error("Hay servidores repetidos en la network");
  for (const { server } of backends) {
    await authorize?.(server.id);
    if (server.status !== "Detenido" || pendingAction(server.id)) throw new Error(`Detén ${server.name} antes de configurar la network`);
  }
  for (const other of all.filter(s => s.type.toLowerCase() === "velocity" && s.id !== proxyId)) {
    const existing = await readVelocityConfig(other.id);
    if (backends.some(({server}) => existing.servers.some(s => s.address === `127.0.0.1:${server.port}`))) throw new Error(`Un servidor ya pertenece al proxy ${other.name}; desvincúlalo primero`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(proxyId)) throw new Error("Identificador de proxy inválido");
  const dataDirectory = process.env.CRAFTPANEL_DATA_DIR || path.join(process.env.CRAFTPANEL_ROOT || process.cwd(),"data");
  // Keep restoration metadata outside files editable by server subusers.
  const manifestPath = path.join(dataDirectory,"network-state",`${proxyId}.json`);
  const previousManifest = await read(manifestPath);
  const saved: Record<string, Record<string, string | null>> = previousManifest ? JSON.parse(previousManifest) : {};
  const detached = Object.keys(saved).filter(id => !backends.some(b => b.server.id === id));
  for (const id of detached) {
    await authorize?.(id);
    const server = await getServer(id);
    if (server && (server.status !== "Detenido" || pendingAction(id))) throw new Error(`Detén ${server.name} antes de desconectarlo`);
  }
  const unlock = lockConfiguration([proxyId, ...backends.map(b => b.server.id), ...detached]);
  try {
  const changes: Change[] = [];
  const stage = async (id: string, relative: string, transform: (source: string) => string) => {
    const resolved = await resolveServerPath(id, relative, true);
    const before = await read(resolved.path);
    if (id !== proxyId) { saved[id] ||= {}; if (!(relative in saved[id])) saved[id][relative] = before; }
    changes.push({ file: resolved.path, before, after: transform(before || "") });
  };
  for (const id of detached) {
    if (await getServer(id)) for (const [relative, original] of Object.entries(saved[id])) {
      const target = (await resolveServerPath(id,relative,true)).path;
      changes.push({ file: target, before: await read(target), after: original });
    }
    delete saved[id];
  }
  const secretPath = (await resolveServerPath(proxyId,"forwarding.secret",true)).path;
  const secret = config.forwardingSecret?.trim() || (await read(secretPath))?.trim() || randomBytes(32).toString("hex");
  if (!/^[\x21-\x7e]{16,256}$/.test(secret)) throw new Error("La clave del proxy debe tener entre 16 y 256 caracteres sin espacios");
  const normalized = { ...config, forwardingSecret: secret, servers: backends.map(({entry,server}) => ({ ...entry, address: `127.0.0.1:${server.port}` })) };
  // Validate every file and backend before writing any configuration.
  await stage(proxyId,"velocity.toml",source => velocityText(source,normalized));
  await stage(proxyId,"forwarding.secret",() => secret + "\n");
  for (const { server } of backends) {
    const mode = config.playerInfoForwarding;
    const type = server.type.toLowerCase();
    const minor = Number(server.version.split(".")[1]);
    if (mode === "modern" && server.version.startsWith("1.") && minor < 13) throw new Error(`${server.name} necesita Legacy por su versión de Minecraft`);
    if (!["paper", "fabric", "forge"].includes(type) && mode !== "none") throw new Error(`No se puede configurar automáticamente ${server.type} con ${mode}`);
    await stage(server.id,"server.properties",source => propertiesText(source, { "server-ip": "127.0.0.1", "server-port": server.port, "online-mode": false, "enforce-secure-profile": false }));
    if (type === "paper") {
      await stage(server.id,"spigot.yml",source => yamlText(source, [[["settings","bungeecord"],mode === "legacy"]]));
      const old = server.version.startsWith("1.") && (minor < 19);
      await stage(server.id,old ? "paper.yml" : "config/paper-global.yml", source => yamlText(source, [
        [[...(old ? ["settings","velocity-support"] : ["proxies","velocity"]),"enabled"],mode === "modern"],
        [[...(old ? ["settings","velocity-support"] : ["proxies","velocity"]),"online-mode"],config.onlineMode],
        [[...(old ? ["settings","velocity-support"] : ["proxies","velocity"]),"secret"],secret],
      ]));
    } else if (mode !== "none") {
      if (mode !== "modern") throw new Error(`${server.name}: usa Modern para servidores con mods`);
      const modsPath = (await resolveServerPath(server.id,"mods",true)).path;
      const mods = await readdir(modsPath).catch((e: NodeJS.ErrnoException) => { if(e.code === "ENOENT") return []; throw e; });
      const mod = type === "fabric" ? /fabricproxy-lite.*\.jar$/i : /(?:proxy.compatible.forge|pcf)[\w.-]*\.jar$/i;
      if (!mods.some(name => mod.test(name))) throw new Error(`${server.name}: instala ${type === "fabric" ? "FabricProxy-Lite" : "Proxy Compatible Forge"} compatible con ${server.version} antes de conectar la network`);
      if (type === "fabric") await stage(server.id,"config/FabricProxy-Lite.toml",source => tomlText(source,{ secret }));
      else {
        const legacy = (await read((await resolveServerPath(server.id,"config/pcf-common.toml",true)).path)) !== null;
        await stage(server.id,legacy ? "config/pcf-common.toml" : "config/proxy-compatible-forge.toml",source => tomlText(source,legacy ? { forwardingSecret: secret } : { forwarding: { secret, mode: "MODERN" } }));
      }
    }
  }
  changes.push({ file: manifestPath, before: previousManifest, after: JSON.stringify(saved,null,2) + "\n" });
  const applied: Change[] = [];
  try {
    for (const change of changes) {
      await mkdir(path.dirname(change.file),{recursive:true});
      applied.push(change);
      if (change.after === null) await rm(change.file,{force:true}); else await writeFile(change.file,change.after,"utf8");
    }
  } catch (error) {
    const rollback = await Promise.allSettled(applied.reverse().map(change => change.before === null ? rm(change.file,{force:true}) : writeFile(change.file,change.before,"utf8")));
    if (rollback.some(result => result.status === "rejected")) throw new Error("Falló la escritura y la restauración de algunos archivos; revisa las configuraciones antes de iniciar");
    throw error;
  }
  notifyPanel();
  return { config: await readVelocityConfig(proxyId), configuredServers: backends.map(({server}) => ({ id: server.id, name: server.name })), restartRequired: true };
  } finally { unlock(); }
}
