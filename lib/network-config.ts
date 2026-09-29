import * as TOML from "@iarna/toml";
import { parseDocument } from "yaml";

export type ProxyConfig = { bind: string; motd?: string; onlineMode: boolean; playerInfoForwarding: string; forceKeyAuthentication?: boolean; preventClientProxyConnections?: boolean; announceForge?: boolean; kickExistingPlayers?: boolean; pingPassthrough?: string; forwardingSecret?: string; servers: { name: string; address: string; priority: number; serverId?: string }[] };
export function velocityText(source: string, config: ProxyConfig) {
  const document = source.trim() ? TOML.parse(source) : { "config-version": "2.7" };
  if (!["modern", "legacy", "none"].includes(config.playerInfoForwarding)) throw new Error("El modo automático admite Modern, Legacy o None");
  if (!/^(?:[\w.-]+|\[[a-fA-F0-9:]+\]):\d+$/.test(config.bind)) throw new Error("Bind no válido");
  const port = Number(config.bind.split(":").at(-1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Puerto del proxy no válido");
  document.bind = config.bind;
  document["online-mode"] = config.onlineMode;
  document["player-info-forwarding-mode"] = config.playerInfoForwarding;
  document["forwarding-secret-file"] = "forwarding.secret";
  if (config.motd !== undefined) document.motd = config.motd;
  for (const [key, value] of Object.entries({ "force-key-authentication": config.forceKeyAuthentication, "prevent-client-proxy-connections": config.preventClientProxyConnections, "announce-forge": config.announceForge, "kick-existing-players": config.kickExistingPlayers, "ping-passthrough": config.pingPassthrough?.toUpperCase() })) {
    if (value !== undefined) document[key] = value;
  }
  const ordered = [...config.servers].sort((a,b) => a.priority-b.priority);
  const names = new Set<string>();
  for (const server of ordered) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(server.name) || server.name === "try" || names.has(server.name.toLowerCase())) throw new Error("Los nombres de la network deben ser únicos y contener solo letras, números, guiones o guiones bajos");
    names.add(server.name.toLowerCase());
  }
  document.servers = { ...Object.fromEntries(ordered.map(s => [s.name,s.address])), try: ordered.map(s => s.name) };
  // Remove only stale forced-host targets, preserving unrelated proxy settings.
  const hosts = document["forced-hosts"];
  if (hosts && typeof hosts === "object" && !Array.isArray(hosts)) for (const [host, targets] of Object.entries(hosts)) {
    if (Array.isArray(targets)) (hosts as TOML.JsonMap)[host] = targets.filter(t => typeof t === "string" && ordered.some(s => s.name === t));
  }
  return TOML.stringify(document);
}
export function propertiesText(source: string, values: Record<string, string | number | boolean>) {
  const remaining = new Map(Object.entries(values));
  const lines = source.split(/\r?\n/).filter(line => {
    const key = line.match(/^\s*([^#!\s=:]+)\s*[:=]/)?.[1];
    return !key || !remaining.has(key);
  });
  return lines.join("\n").trimEnd() + "\n" + [...remaining].map(([key,value]) => `${key}=${value}`).join("\n") + "\n";
}
export function yamlText(source: string, updates: [string[], unknown][]) {
  const document = parseDocument(source || "{}");
  if (document.errors.length) throw new Error("Configuración YAML inválida: " + document.errors[0].message);
  for (const [keys,value] of updates) document.setIn(keys,value);
  return document.toString();
}
export function tomlText(source: string, values: Record<string, TOML.JsonMap[string]>) {
  const document = source.trim() ? TOML.parse(source) : {};
  for (const [key,value] of Object.entries(values)) {
    const existing = document[key];
    document[key] = existing && value && typeof existing === "object" && typeof value === "object" && !Array.isArray(existing) && !Array.isArray(value)
      ? { ...existing, ...value } : value;
  }
  return TOML.stringify(document);
}
