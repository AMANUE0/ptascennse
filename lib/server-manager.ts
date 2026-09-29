import { pendingAction, notifyPanel } from "./lifecycle";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { access, appendFile, mkdir, readFile, readdir, writeFile, stat, lstat, rm, copyFile, rename, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ServerStatus = "Online" | "Detenido" | "Iniciando";
export type ServerRecord = {
  id: string;
  userId?: string;
  name: string;
  type: string;
  version: string;
  ram: string;
  java: string;
  command: string;
  status: ServerStatus;
  pendingAction?: import("./lifecycle").LifecycleAction | null;
  address: string;
  directory: string;
  port: number;
  jar: string;
  cpu: string;
  storageGb: number;
};
type StoredRecord = Omit<ServerRecord, "status" | "address" | "directory"> & {
  downloadUrl?: string;
  createdAt: string;
};
type ManagedProcess = { child: ChildProcessWithoutNullStreams; startedAt: number; output: string[]; ready: boolean };

// ============================================================================
// SECTION: Paths, In-Memory State & Environment Guards
// ============================================================================
// - Rutas ancladas a import.meta.url (no process.cwd frágil)
// - Estado en memoria (Map/Set globales) — NO compatible con multi-worker
// - Warning de entorno inseguro (serverless/cluster/producción)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CRAFTPANEL_ROOT || path.resolve(__dirname, "..");
const dataDirectory = process.env.CRAFTPANEL_DATA_DIR ? path.resolve(process.env.CRAFTPANEL_DATA_DIR) : path.join(root, "data");
const recordsFile = path.join(dataDirectory, "servers.json");
const managedDirectory = process.env.CRAFTPANEL_MANAGED_DIR ? path.resolve(process.env.CRAFTPANEL_MANAGED_DIR) : path.join(root, "managed-servers");
const managerState = globalThis as typeof globalThis & { craftpanelManager?: {
  processes: Map<string, ManagedProcess>; lastOutput: Map<string, string[]>; starting: Set<string>;
  startingProcesses: Map<string, ChildProcessWithoutNullStreams>; stopTimers: Map<string, NodeJS.Timeout>;
  recoveredProcesses: Map<string, { pid: number; startedAt: number }>;
} };
const { processes, lastOutput, starting, startingProcesses, stopTimers, recoveredProcesses } = managerState.craftpanelManager ||= {
  processes: new Map<string, ManagedProcess>(), lastOutput: new Map<string, string[]>(), starting: new Set<string>(), startingProcesses: new Map<string, ChildProcessWithoutNullStreams>(), stopTimers: new Map<string, NodeJS.Timeout>(), recoveredProcesses: new Map<string, { pid: number; startedAt: number }>(),
};
const execFileAsync = promisify(execFile);
let storeLock: Promise<void> = Promise.resolve();

{
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE || process.env.FUNCTIONS_EMULATOR);
  const hasClusterHint = Boolean(process.env.NODE_WORKER_ID || process.env.CLUSTER_WORKER || process.env.WORKER_ID);
  const unsafeMulti = isServerless || hasClusterHint || process.env.NODE_ENV === "production";
  if (unsafeMulti && process.env.CRAFTPANEL_IGNORE_STATE_WARNING !== "1") {
    const msg = [
      "[CraftPanel] ADVERTENCIA: El gestor de servidores almacena el estado de procesos en memoria.",
      isServerless ? "  - Entorno serverless detectado: los procesos perderán estado entre invocaciones." : "",
      hasClusterHint ? "  - Modo cluster/worker detectado: cada worker tendrá su propia vista del estado (arranques duplicados posibles)." : "",
      !isServerless && !hasClusterHint ? "  - En producción con múltiples procesos debes coordinar acceso a servidores o usar un solo worker." : "",
      "  - Define CRAFTPANEL_IGNORE_STATE_WARNING=1 para silenciar este aviso.",
    ].filter(Boolean).join("\n");
    console.warn(msg);
  }
}

async function ensureStore() {
  await mkdir(dataDirectory, { recursive: true });
  await mkdir(managedDirectory, { recursive: true });
  try {
    await access(recordsFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(recordsFile, "[]\n", "utf8");
  }

}

// ============================================================================
// SECTION: Downloads (Server Jar Resolvers)
// ============================================================================
// - Proveedores: Paper, Velocity, Vanilla, Fabric, Quilt, Forge, NeoForge
// - Cada resolver devuelve URL de descarga directa
// - downloadJar() guarda el jar como server.jar en el directorio del servidor

async function resolveDownload(type: string, version: string) {
  const normalized = type.toLowerCase();
  if (normalized === "paper" || normalized === "velocity") {
    const project = normalized;
    const buildsResponse = await fetch(`https://fill.papermc.io/v3/projects/${project}/versions/${encodeURIComponent(version)}/builds`);
    if (!buildsResponse.ok) throw new Error(`No existe ${type} para Minecraft ${version}`);
    const builds = await buildsResponse.json() as { downloads?: Record<string, { url?: string }> }[];
    const build = builds.find((item) => Object.values(item.downloads || {}).some((download) => download.url));
    const downloadUrl = build ? Object.values(build.downloads || {}).find((download) => download.url)?.url : undefined;
    if (!downloadUrl) throw new Error(`No hay builds disponibles para ${type} ${version}`);
    return downloadUrl;
  }
  if (normalized === "vanilla") {
    const manifestResponse = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    if (!manifestResponse.ok) throw new Error("No se pudo consultar el catálogo oficial de Minecraft");
    const manifest = await manifestResponse.json() as { versions?: { id: string; url: string }[] };
    const entry = manifest.versions?.find((item) => item.id === version);
    if (!entry) throw new Error(`No existe la versión vanilla ${version}`);
    const metadataResponse = await fetch(entry.url);
    if (!metadataResponse.ok) throw new Error("No se pudo consultar la versión vanilla");
    const metadata = await metadataResponse.json() as { downloads?: { server?: { url?: string } } };
    if (!metadata.downloads?.server?.url) throw new Error(`Mojang no publica server jar para ${version}`);
    return metadata.downloads.server.url;
  }
  if (normalized === "fabric") return `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/0.16.10/1.0.3/server/jar`;
  if (normalized === "quilt") return `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(version)}/0.28.1/1.0.1/server/jar`;
  if (normalized === "forge") {
    const promotions = await fetch("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
    if (!promotions.ok) throw new Error("No se pudo consultar Forge");
    const data = await promotions.json() as { promos?: Record<string, string> };
    const forgeVersion = data.promos?.[`${version}-recommended`] || data.promos?.[`${version}-latest`];
    if (!forgeVersion) throw new Error(`No existe una build Forge para Minecraft ${version}`);
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeVersion}/forge-${version}-${forgeVersion}-installer.jar`;
  }
  if (normalized === "neoforge") {
    const major = version.split(".").slice(1).join("");
    return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${major}.0/neoforge-${major}.0-installer.jar`;
  }
  throw new Error(`La descarga automática para ${type} todavía requiere un proveedor configurado.`);
}

async function downloadJar(url: string, directory: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Descarga del servidor falló (${response.status})`);
  const target = path.join(directory, "server.jar");
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

// ============================================================================
// SECTION: Store (servers.json Records)
// ============================================================================
// - Persistencia en data/servers.json
// - Lock simple para actualizaciones serializadas
// - view() proyecta StoredRecord → ServerRecord (añade estado en memoria)

async function readRecords(): Promise<StoredRecord[]> {
  await ensureStore();
  const raw = await readFile(recordsFile, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("data/servers.json must contain an array");
  return parsed as StoredRecord[];
}

async function writeRecords(records: StoredRecord[]) {
  await ensureStore();
  await writeFile(recordsFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

async function updateRecords(mutator: (records: StoredRecord[]) => StoredRecord[]) {
  let result!: StoredRecord[];
  const previous = storeLock;
  storeLock = previous.then(async () => {
    result = mutator(await readRecords());
    await writeRecords(result);
  });
  await storeLock;
  return result;
}

function view(record: StoredRecord): ServerRecord {
  const running = processes.has(record.id);
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    type: record.type,
    version: record.version,
    pendingAction: pendingAction(record.id) || (running && !processes.get(record.id)?.ready ? "start" : null),
    status: starting.has(record.id) || (running && !processes.get(record.id)?.ready) ? "Iniciando" : running || recoveredProcesses.has(record.id) ? "Online" : "Detenido",
    address: "127.0.0.1",
    ram: record.ram,
    java: record.java,
    command: record.command ?? "",
    directory: path.join(managedDirectory, `${safeDirectoryName(record.name)}-${record.id}`),
    port: record.port ?? 25565,
    jar: record.jar ?? "server.jar",
    cpu: record.cpu ?? "all",
    storageGb: record.storageGb ?? 20,
  };
}

// ============================================================================
// SECTION: Process Recovery & CPU Limits
// ============================================================================
// - Reconocimiento de procesos Java ya existentes (Windows: netstat + tasklist)
// - reconcileRecord() actualiza recoveredProcesses al inicio
// - applyCpuLimit() usa PowerShell en Windows para ProcessAffinity

async function discoverJavaProcess(port: number) {
  if (process.platform !== "win32") return undefined;
  try {
    const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
    const match = stdout.split(/\r?\n/).find((line) => {
      const parts = line.trim().split(/\s+/);
      return parts[0] === "TCP" && parts[1]?.endsWith(`:${port}`) && parts[3] === "LISTENING";
    });
    const pid = match ? Number(match.trim().split(/\s+/).at(-1)) : 0;
    if (!pid) return undefined;
    const { stdout: tasklist } = await execFileAsync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    return /"java(?:\.exe)?"/i.test(tasklist) ? pid : undefined;
  } catch {
    return undefined;
  }
}

async function reconcileRecord(record: StoredRecord) {
  if (processes.has(record.id) || starting.has(record.id)) return;
  const stored = await readPidState(record);
  if (stored && await isJavaPidAlive(stored.pid)) {
    recoveredProcesses.set(record.id, { pid: stored.pid, startedAt: stored.startedAt });
    return;
  }
  if (stored) await clearPidState(record);
  const pid = await discoverJavaProcess(record.port);
  if (pid) {
    recoveredProcesses.set(record.id, { pid, startedAt: Date.now() });
    await writePidState(record, { pid, startedAt: Date.now() });
  } else recoveredProcesses.delete(record.id);
}

async function applyCpuLimit(child: ChildProcessWithoutNullStreams, cpu: string) {
  const count = Number(cpu);
  if (process.platform !== "win32" || !child.pid || !Number.isInteger(count) || count < 1) return;
  const mask = (2 ** Math.min(count, 30)) - 1;
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${child.pid}).ProcessorAffinity = ${mask}`]).catch(() => undefined);
}

// ============================================================================
// SECTION: Filesystem Safety & Server CRUD
// ============================================================================
// - Safe naming (safeDirectoryName) y containment (resolveServerPath)
// - Resolución de puertos libres + búsqueda de jar
// - CRUD público: listServers, getServer, createServer, deleteServer, updateServerConfig
// - Operaciones de archivos: listServerFiles, getServerDirectory
//
// NOTA: createServer() incluye lógica de creación inicial de carpetas y
// descarga inicial del jar; los paths NO deben escaparse de managedDirectory.

function safeDirectoryName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "server";
}

export async function listServers(userId?: string, includeLegacy = false) {
  const records = await readRecords();
  const visible = userId ? records.filter((record) => record.userId === userId || (includeLegacy && !record.userId)) : records;
  await Promise.all(visible.map(reconcileRecord));
  return visible.map(view);
}

export async function claimLegacyServers(userId: string) {
  await updateRecords((records) => records.map((record) => record.userId ? record : { ...record, userId }));
}

export async function getServer(id: string, userId?: string, includeLegacy = false) {
  const record = (await readRecords()).find((item) => item.id === id);
  if (record && userId && record.userId !== userId && !(includeLegacy && !record.userId)) return undefined;
  if (record) await reconcileRecord(record);
  return record ? view(record) : undefined;
}

export async function deleteServer(id: string, userId?: string, includeLegacy = false) {
  if (processes.has(id) || startingProcesses.has(id)) throw new Error("Detén el servidor antes de eliminarlo");
  const records = await readRecords();
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error("Server not found");
  if (userId && record.userId !== userId && !(includeLegacy && !record.userId)) throw new Error("Server not found");
  await rm(directoryFor(id, record), { recursive: true, force: true });
  await updateRecords((items) => items.filter((item) => item.id !== id));
}

export async function createServer(input: {
  userId?: unknown;
  name?: unknown; type?: unknown; version?: unknown; ram?: unknown;
  java?: unknown; command?: unknown; downloadUrl?: unknown; port?: unknown; jar?: unknown;
  cpu?: unknown; storageGb?: unknown;
}) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : "";
  const version = typeof input.version === "string" ? input.version.trim() : "";
  if (!name || !type || !version) throw new Error("name, type and version are required");
  const requestedPort = typeof input.port === "number" && Number.isInteger(input.port) ? input.port : undefined;
  const port = await findAvailablePort(requestedPort ?? 25565);
  const record: StoredRecord = {
    id: randomUUID(),
    userId: typeof input.userId === "string" && input.userId.trim() ? input.userId.trim() : undefined,
    name, type, version,
    ram: typeof input.ram === "string" && input.ram.trim() ? input.ram.trim() : "2 GB",
    java: typeof input.java === "string" && input.java.trim() ? input.java.trim() : "java",
    command: typeof input.command === "string" ? input.command.trim() : "",
    port,
    jar: typeof input.jar === "string" && input.jar.trim() ? input.jar.trim() : "server.jar",
    cpu: typeof input.cpu === "string" && input.cpu.trim() ? input.cpu.trim() : "all",
    storageGb: typeof input.storageGb === "number" && input.storageGb > 0 ? input.storageGb : 20,
    downloadUrl: typeof input.downloadUrl === "string" && input.downloadUrl.trim() ? input.downloadUrl.trim() : await resolveDownload(type, version),
    createdAt: new Date().toISOString(),
  };
  const directory = path.join(managedDirectory, `${safeDirectoryName(name)}-${record.id}`);
  await mkdir(directory, { recursive: true });
  if (!record.downloadUrl) throw new Error("No se pudo resolver la descarga del servidor");
  await downloadJar(record.downloadUrl, directory);
  await updateRecords((records) => [...records, record]);
  return view(record);
}

async function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(start: number) {
  const records = await readRecords();
  let port = Math.max(1, Math.min(65535, start));
  for (let attempts = 0; attempts < 65535; attempts += 1) {
    const reserved = records.some((record) => record.port === port);
    if (!reserved && await isPortAvailable(port)) return port;
    port = port === 65535 ? 1 : port + 1;
  }
  throw new Error("No hay puertos disponibles");
}

async function findJar(directory: string) {
  const files = await readdir(directory, { withFileTypes: true });
  const jar = files.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"));
  return jar ? path.join(directory, jar.name) : undefined;
}

function directoryFor(id: string, record: StoredRecord) {
  return path.resolve(managedDirectory, `${safeDirectoryName(record.name)}-${id}`);
}

/** Resolve a user-supplied path while preventing traversal and symlink escapes. */
export async function resolveServerPath(id: string, relative = "", allowMissing = false) {
  const record = (await readRecords()).find((item) => item.id === id);
  if (!record) throw new Error("Server not found");
  const base = directoryFor(id, record);
  const candidate = path.resolve(base, relative || ".");
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) throw new Error("Invalid path");
  const baseReal = await realpathSafe(base);
  if (!allowMissing) {
    const real = await realpathSafe(candidate);
    if (real !== baseReal && !real.startsWith(`${baseReal}${path.sep}`)) throw new Error("Invalid path");
    return { record, base: baseReal, path: real };
  }
  const parentReal = await realpathSafe(path.dirname(candidate));
  if (parentReal !== baseReal && !parentReal.startsWith(`${baseReal}${path.sep}`)) throw new Error("Invalid path");
  try {
    const existing = await realpathSafe(candidate);
    if (existing !== baseReal && !existing.startsWith(`${baseReal}${path.sep}`)) throw new Error("Invalid path");
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid path") throw error;
  }
  return { record, base: baseReal, path: candidate };
}

async function realpathSafe(target: string) {
  try { return (await import("node:fs/promises")).realpath(target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return path.resolve(target);
    throw error;
  }
}

export async function updateServerConfig(id: string, patch: Partial<Pick<StoredRecord, "name" | "ram" | "java" | "command" | "jar" | "port" | "cpu" | "storageGb">>) {
  const records = await readRecords();
  const current = records.find((item) => item.id === id);
  if (!current) throw new Error("Server not found");
  const next = { ...current };
  if (typeof patch.name === "string" && patch.name.trim()) next.name = patch.name.trim();
  if (typeof patch.ram === "string") next.ram = patch.ram.trim();
  if (typeof patch.jar === "string") next.jar = patch.jar.trim();
  if (typeof patch.cpu === "string") next.cpu = patch.cpu;
  if (typeof patch.storageGb === "number" && patch.storageGb > 0) next.storageGb = patch.storageGb;
  if (patch.port !== undefined) {
    if (!Number.isInteger(patch.port) || patch.port < 1 || patch.port > 65535) throw new Error("port must be between 1 and 65535");
    next.port = patch.port;
  }

  const oldDir = directoryFor(id, current);
  const newDir = directoryFor(id, next);
  if (oldDir !== newDir) {
    if (processes.has(id)) throw new Error("Stop the server before changing its name");
    await rename(oldDir, newDir);
  }
  const properties = path.join(newDir, "server.properties");
  try {
    const text = await readFile(properties, "utf8");
    const lines = text.split(/\r?\n/).filter((line) => !/^server-port\s*=/.test(line));
    lines.push(`server-port=${next.port}`);
    await writeFile(properties, `${lines.filter(Boolean).join("\n")}\n`, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await updateRecords((items) => items.map((item) => item.id === id ? next : item));
  return view(next);
}

export async function listServerFiles(id: string, relative = "") {
  const resolved = await resolveServerPath(id, relative);
  const entries = await readdir(resolved.path, { withFileTypes: true });
  return entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file", size: entry.isFile() ? undefined : undefined }));
}

export async function getServerDirectory(id: string) {
  const record = (await readRecords()).find((item) => item.id === id);
  if (!record) throw new Error("Server not found");
  return directoryFor(id, record);
}

// ============================================================================
// SECTION: Config Files (server.properties / velocity.toml)
// ============================================================================
// - server.properties (Java Edition): parseo simple key=value con comments
// - velocity.toml: parser manual de TOML subset para el proxy Velocity
// - Ambos writers preservan lo más posible del archivo existente (no full rewrite)

export async function updateServerProperties(id: string, values: Record<string, string | number | boolean>) {
  const resolved = await resolveServerPath(id, "server.properties", true);
  let text = "";
  try { text = await readFile(resolved.path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) entries.set(match[1].trim(), match[2]);
  }
  for (const [key, value] of Object.entries(values)) entries.set(key, String(value));
  await writeFile(resolved.path, `${Array.from(entries, ([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
  return Object.fromEntries(entries);
}

export async function readServerProperties(id: string) {
  const resolved = await resolveServerPath(id, "server.properties", true);
  try {
    const text = await readFile(resolved.path, "utf8");
    return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      return match ? [[match[1].trim(), match[2]]] : [];
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function readVelocityConfig(id: string) {
  const resolved = await resolveServerPath(id, "velocity.toml", true);
  try {
    const text = await readFile(resolved.path, "utf8");
    const value = (key: string, fallback: string) => text.match(new RegExp(`^${key}\\s*=\\s*(?:"([^"]*)"|([^\\s#]+))`, "m"))?.[1] || text.match(new RegExp(`^${key}\\s*=\\s*(?:"([^"]*)"|([^\\s#]+))`, "m"))?.[2] || fallback;
    const serversSection = text.split(/^\[servers\]\s*$/m)[1]?.split(/^\[/m)[0] || "";
    const servers = Array.from(serversSection.matchAll(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"/gm)).map((match, index) => ({ name: match[1], address: match[2], priority: index + 1 }));
    const tryMatch = serversSection.match(/^try\s*=\s*\[([\s\S]*?)\]/m);
    const order = Array.from(tryMatch?.[1]?.matchAll(/"([^"]+)"/g) || [], (match) => match[1]);
    servers.sort((a, b) => (order.indexOf(a.name) < 0 ? 999 : order.indexOf(a.name)) - (order.indexOf(b.name) < 0 ? 999 : order.indexOf(b.name)));
    servers.forEach((item, index) => { item.priority = index + 1; });
    return { text, bind: value("bind", "0.0.0.0:25565"), motd: value("motd", ""), onlineMode: value("online-mode", "true") === "true", playerInfoForwarding: value("player-info-forwarding-mode", "modern").toLowerCase(), forceKeyAuthentication: value("force-key-authentication", "true") === "true", preventClientProxyConnections: value("prevent-client-proxy-connections", "false") === "true", announceForge: value("announce-forge", "false") === "true", kickExistingPlayers: value("kick-existing-players", "false") === "true", pingPassthrough: value("ping-passthrough", "disabled").toLowerCase(), servers };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { text: "", bind: "0.0.0.0:25565", motd: "", onlineMode: true, playerInfoForwarding: "modern", forceKeyAuthentication: true, preventClientProxyConnections: false, announceForge: false, kickExistingPlayers: false, pingPassthrough: "disabled", servers: [] };
    throw error;
  }
}

export async function writeVelocityConfig(id: string, config: { bind: string; motd?: string; onlineMode: boolean; playerInfoForwarding: string; forceKeyAuthentication?: boolean; preventClientProxyConnections?: boolean; announceForge?: boolean; kickExistingPlayers?: boolean; pingPassthrough?: string; forwardingSecret: string; servers: { name: string; address: string; priority: number }[] }) {
  const { configureNetwork } = await import("./network-provision");
  return (await configureNetwork(id, config)).config.text;
}

// ============================================================================
// SECTION: Java Executable & Command Line Helpers
// ============================================================================
// - parseCommand: shellquote simple para comandos custom del usuario
// - javaMemory: normaliza strings de RAM (ej: "4G" → "-Xmx4G")
// - resolveJavaExecutable: validación estricta (realpath, containment, allowlist)
//
// ⚠️ SECURITY: resolveJavaExecutable() es parte de la surface RCE — NO relajar.

function parseCommand(command: string) {
  const matches = command.match(/"[^"]*"|'[^']*'|\S+/g);
  return (matches ?? []).map((part) => part.replace(/^["']|["']$/g, ""));
}

function javaMemory(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(/GB$/i, "G").replace(/MB$/i, "M");
  return normalized || "2G";
}

export async function resolveJavaExecutable(value: string) {
  const trimmed = (value || "java").trim();
  if (!trimmed || /[\r\n\0]/.test(trimmed) || trimmed.includes("..")) throw new Error("La ruta de Java no es válida");
  const base = path.basename(trimmed).toLowerCase();
  if (base !== "java" && base !== "java.exe") throw new Error("Solo se permite el binario Java");
  if (trimmed === "java" || trimmed === "java.exe") return trimmed;
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(trimmed);
  if (!path.isAbsolute(trimmed) && !isWindowsPath) throw new Error("Usa java o una ruta absoluta al binario Java");
  const allowedPatterns = (process.env.CRAFTPANEL_JAVA_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (process.platform === "win32" && path.extname(trimmed).toLowerCase() !== ".exe") {
    throw new Error("En Windows solo se permite java.exe (no .bat, .cmd, .ps1)");
  }
  let resolved: string;
  try {
    resolved = await realpath(trimmed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("La ruta de Java no existe");
    throw error;
  }
  const forbiddenRoots = [path.resolve(root), dataDirectory, managedDirectory];
  for (const forbidden of forbiddenRoots) {
    const forbiddenReal = await realpathSafe(forbidden);
    if (resolved === forbiddenReal || resolved.startsWith(`${forbiddenReal}${path.sep}`)) {
      throw new Error("No se permite usar un ejecutable Java dentro de los directorios gestionados por el panel");
    }
  }
  if (allowedPatterns.length > 0) {
    const matches = allowedPatterns.some((pattern) => {
      const normalized = pattern.replace(/[\\/]+$/, "");
      const resolvedPattern = path.resolve(normalized);
      return resolved === resolvedPattern || resolved.startsWith(`${resolvedPattern}${path.sep}`);
    });
    if (!matches) throw new Error(`La ruta de Java no está en la allowlist (CRAFTPANEL_JAVA_ALLOWLIST: ${allowedPatterns.join(", ")})`);
  }
  await access(resolved);
  return resolved;
}

// ============================================================================
// SECTION: Process Lifecycle (start/stop/kill/command)
// ============================================================================
// - PID state persistido en .craftpanel-process.json para recovery post-restart
// - startServer: descarga jar (si hace falta), escribe eula, spawn Java, attach pipes
// - stopServer: /stop → grace timer 60s → kill vía taskkill si aún corre
// - sendCommand: escribe stdin al child vivo
// - appendPanelMessage: helper para pre-normalizar líneas de consola

function pidFileFor(record: StoredRecord) {
  return path.join(directoryFor(record.id, record), ".craftpanel-process.json");
}

async function writePidState(record: StoredRecord, state: { pid: number; startedAt: number }) {
  await writeFile(pidFileFor(record), `${JSON.stringify(state)}\n`, "utf8");
}

async function readPidState(record: StoredRecord): Promise<{ pid: number; startedAt: number } | undefined> {
  try {
    const parsed = JSON.parse(await readFile(pidFileFor(record), "utf8")) as { pid?: number; startedAt?: number };
    const pid = Number.isInteger(parsed.pid) && parsed.pid && parsed.pid > 0 ? parsed.pid : undefined;
    if (pid === undefined) return undefined;
    const startedAt = Number.isFinite(parsed.startedAt) ? (parsed.startedAt as number) : Date.now();
    return { pid, startedAt };
  } catch {
    return undefined;
  }
}

async function clearPidState(record: StoredRecord) {
  await rm(pidFileFor(record), { force: true }).catch(() => undefined);
}

async function isJavaPidAlive(pid: number) {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
      return /"java(?:\.exe)?"/i.test(stdout);
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function startServer(id: string) {
  const record = (await readRecords()).find((item) => item.id === id);
  if (!record) throw new Error("Server not found");
  await reconcileRecord(record);
  if (processes.has(id) || recoveredProcesses.has(id)) return view(record);
  if (starting.has(id)) return view(record);
  starting.add(id); notifyPanel();
  const directory = path.join(managedDirectory, `${safeDirectoryName(record.name)}-${id}`);
  try {
    await mkdir(directory, { recursive: true });
    let jar = await findJar(directory);
    if (!jar) {
      const downloadUrl = record.downloadUrl || await resolveDownload(record.type, record.version);
      jar = await downloadJar(downloadUrl, directory);
      if (!record.downloadUrl) {
        await updateRecords((records) => records.map((item) => item.id === id ? { ...item, downloadUrl } : item));
      }
    }
    if (record.jar) {
      try {
        const configuredJar = await resolveServerPath(id, record.jar);
        if ((await stat(configuredJar.path)).isFile()) jar = configuredJar.path;
      } catch { /* use the first discovered jar when configured one is absent */ }
    }
    if (!jar) throw new Error("No hay un server.jar válido para arrancar");
    const args = [`-Xms${javaMemory(record.ram)}`, `-Xmx${javaMemory(record.ram)}`, "-jar", path.basename(jar), "nogui"];
    const executable = await resolveJavaExecutable(record.java);
    const launch = () => spawn(executable, args, { cwd: directory, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let child = launch();
    startingProcesses.set(id, child);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 1000);
      child.once("spawn", () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } });
      child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    });
    await applyCpuLimit(child, record.cpu);
    // Paper creates eula.txt and server.properties itself on its first run. Let
    // that real bootstrap finish, then accept the EULA and launch normally.
    if (jar && record.type.toLowerCase() === "paper" && !(await access(path.join(directory, "eula.txt")).then(() => true).catch(() => false))) {
      const bootstrapOutput: string[] = [];
      const captureBootstrap = (chunk: Buffer) => {
        const text = chunk.toString();
        bootstrapOutput.push(...text.split(/\r?\n/).filter(Boolean));
        if (bootstrapOutput.length > 200) bootstrapOutput.splice(0, bootstrapOutput.length - 200);
        lastOutput.set(id, [...bootstrapOutput]);
        void appendFile(path.join(directory, "server.log"), text);
      };
      child.stdout.on("data", captureBootstrap);
      child.stderr.on("data", captureBootstrap);
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code && code !== 0) reject(new Error(bootstrapOutput.at(-1) || `El proceso terminó con código ${code}`));
          else resolve();
        });
      });
      if (!starting.has(id)) throw new Error("El arranque fue cancelado");
      await writeFile(path.join(directory, "eula.txt"), "eula=true\n", "utf8");
      const propertiesFile = path.join(directory, "server.properties");
      try {
        const text = await readFile(propertiesFile, "utf8");
        const lines = text.split(/\r?\n/).filter((line) => !/^server-port\s*=/.test(line));
        lines.push(`server-port=${record.port ?? 25565}`);
        await writeFile(propertiesFile, `${lines.filter(Boolean).join("\n")}\n`, "utf8");
      } catch { /* Paper may not use server.properties (or has not written it yet). */ }
      child = launch();
      startingProcesses.set(id, child);
      await applyCpuLimit(child, record.cpu);
    }
    const managed: ManagedProcess = { child, ready: false, startedAt: Date.now(), output: [...(lastOutput.get(id) ?? [])] };
    processes.set(id, managed);
    recoveredProcesses.delete(id);
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      managed.output.push(...text.split(/\r?\n/).filter(Boolean));
      if (!managed.ready && /Done \([^)]+\)/.test(managed.output.slice(-4).join("\n"))) { managed.ready = true; notifyPanel(); }
      if (managed.output.length > 200) managed.output.splice(0, managed.output.length - 200);
      lastOutput.set(id, [...managed.output]);
      void appendFile(path.join(directory, "server.log"), text);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => { managed.output.push(error.message); lastOutput.set(id, [...managed.output]); });
    child.once("exit", () => {
      lastOutput.set(id, [...managed.output]);
      processes.delete(id); notifyPanel();
      stopTimers.delete(id);
      void clearPidState(record);
    });
    if (child.pid) await writePidState(record, { pid: child.pid, startedAt: managed.startedAt });
    starting.delete(id);
    startingProcesses.delete(id);
    return view(record);
  } finally {
    starting.delete(id);
    startingProcesses.delete(id); notifyPanel();
  }
}

export async function stopServer(id: string, force = false) {
  const managed = processes.get(id);
  const booting = startingProcesses.get(id);
  const recovered = !managed && !booting ? recoveredProcesses.get(id) : undefined;
  if (!managed && !booting && !recovered) return getServer(id);
  if (recovered) {
    if (process.platform === "win32") await execFileAsync("taskkill", ["/PID", String(recovered.pid), "/T", "/F"]).catch(() => undefined);
    recoveredProcesses.delete(id);
    appendPanelMessage(id, "§cProceso recuperado finalizado por el panel.");
    return getServer(id);
  }
  if (!managed && booting) {
    if (process.platform === "win32" && booting.pid) await execFileAsync("taskkill", ["/PID", String(booting.pid), "/T", "/F"]).catch(() => undefined);
    else booting.kill("SIGKILL");
    startingProcesses.delete(id);
    starting.delete(id);
    appendPanelMessage(id, "§cProceso de arranque finalizado.");
    return getServer(id);
  }
  if (!managed) return getServer(id);
  if (force) {
    if (process.platform === "win32" && managed.child.pid) {
      await execFileAsync("taskkill", ["/PID", String(managed.child.pid), "/T", "/F"]).catch(() => undefined);
    } else managed.child.kill("SIGKILL");
  } else {
    if (!managed.child.stdin.destroyed) managed.child.stdin.write((await getServer(id))?.type.toLowerCase() === "velocity" ? "shutdown\n" : "stop\n");
    stopTimers.set(id, setTimeout(() => {
      if (processes.has(id)) {
        if (process.platform === "win32" && managed.child.pid) void execFileAsync("taskkill", ["/PID", String(managed.child.pid), "/T", "/F"]).catch(() => undefined);
        else managed.child.kill("SIGTERM");
      }
    }, 10_000));
  }
  if (processes.has(id)) {
    await new Promise<void>((resolve) => {
      const finish = () => resolve();
      managed.child.once("exit", finish);
      setTimeout(finish, force ? 1_000 : 11_000);
    });
  }
  return getServer(id);
}

export async function sendCommand(id: string, command: string) {
  if (!command.trim()) throw new Error("command is required");
  const managed = processes.get(id);
  if (!managed) throw new Error("El servidor fue detectado como proceso externo. Reinícialo desde el panel para habilitar comandos.");
  managed.child.stdin.write(`${command.trim()}\n`);
  return getServer(id);
}

export function appendPanelMessage(id: string, message: string) {
  const managed = processes.get(id);
  const output = managed?.output ?? lastOutput.get(id) ?? [];
  const line = `[CraftPanel] ${message}`;
  output.push(line);
  if (output.length > 200) output.splice(0, output.length - 200);
  if (managed) managed.output = output;
  lastOutput.set(id, [...output]);
}

// ============================================================================
// SECTION: Runtime Metrics
// ============================================================================
// - Devuelve estado en vivo: server record, uptime, memory del proceso, host stats
// - Windows: usa tasklist CSV para obtener memoria del PID Java
// - Incluye recentOutput (últimas 200 líneas) para TerminalView

export async function getMetrics(id: string) {
  const record = (await readRecords()).find((item) => item.id === id);
  if (!record) return undefined;
  await reconcileRecord(record);
  const managed = processes.get(id);
  const recovered = recoveredProcesses.get(id);
  let processStats: { memoryBytes?: number; cpuPercent?: number } = {};
  if (managed?.child.pid && process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("tasklist", ["/FI", `PID eq ${managed.child.pid}`, "/FO", "CSV", "/NH"]);
      const match = stdout.match(/"[^"]+","[^"]+","[^"]+","[^"]+","([\d,]+) K"/);
      if (match) processStats.memoryBytes = Number(match[1].replace(/,/g, "")) * 1024;
    } catch { /* process may have exited between checks */ }
  }
  return {
    server: view(record),
    running: Boolean(managed || recovered),
    pid: managed?.child.pid ?? recovered?.pid ?? null,
    uptimeSeconds: managed ? Math.floor((Date.now() - managed.startedAt) / 1000) : recovered ? Math.floor((Date.now() - recovered.startedAt) / 1000) : 0,
    memory: process.memoryUsage(),
    process: processStats,
    host: { cpuCount: cpus().length, totalMemory: totalmem() },
    recentOutput: managed?.output ?? lastOutput.get(id) ?? [`[CraftPanel] Proceso Java externo detectado en el puerto ${record.port}.`],
  };
}
