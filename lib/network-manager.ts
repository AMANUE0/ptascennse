import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServer } from "./server-manager";

export type NetworkRecord = { id: string; name: string; proxyId: string; serverIds: string[]; createdAt: string };
const file = path.join(process.cwd(), "data", "networks.json");
let lock: Promise<void> = Promise.resolve();

async function readNetworks(): Promise<NetworkRecord[]> {
  await mkdir(path.dirname(file), { recursive: true });
  try { return JSON.parse(await readFile(file, "utf8")) as NetworkRecord[]; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(file, "[]\n", "utf8");
    return [];
  }
}
async function writeNetworks(networks: NetworkRecord[]) {
  await writeFile(file, `${JSON.stringify(networks, null, 2)}\n`, "utf8");
}
async function mutate(mutator: (items: NetworkRecord[]) => NetworkRecord[]) {
  let result: NetworkRecord[] = [];
  const previous = lock;
  lock = previous.then(async () => { result = mutator(await readNetworks()); await writeNetworks(result); });
  await lock;
  return result;
}

export async function listNetworks() {
  const networks = await readNetworks();
  return Promise.all(networks.map(async (network) => ({
    ...network,
    proxy: await getServer(network.proxyId),
    servers: await Promise.all(network.serverIds.map((id) => getServer(id))),
  })));
}

export async function createNetwork(input: { name?: unknown; proxyId?: unknown; serverIds?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const proxyId = typeof input.proxyId === "string" ? input.proxyId : "";
  const serverIds = Array.isArray(input.serverIds) ? input.serverIds.filter((id): id is string => typeof id === "string") : [];
  if (!name || !proxyId) throw new Error("name y proxyId son requeridos");
  const proxy = await getServer(proxyId);
  if (!proxy || proxy.type.toLowerCase() !== "velocity") throw new Error("La network necesita un proxy Velocity válido");
  const validServers = await Promise.all(serverIds.map((id) => getServer(id)));
  if (validServers.some((server) => !server)) throw new Error("Uno de los servidores no existe");
  const network: NetworkRecord = { id: randomUUID(), name, proxyId, serverIds: Array.from(new Set(serverIds)), createdAt: new Date().toISOString() };
  await mutate((items) => [...items, network]);
  return (await listNetworks()).find((item) => item.id === network.id);
}

export async function updateNetwork(id: string, patch: { name?: unknown; proxyId?: unknown; serverIds?: unknown }) {
  const networks = await readNetworks();
  const current = networks.find((item) => item.id === id);
  if (!current) throw new Error("Network not found");
  const next = { ...current };
  if (typeof patch.name === "string" && patch.name.trim()) next.name = patch.name.trim();
  if (typeof patch.proxyId === "string") next.proxyId = patch.proxyId;
  if (Array.isArray(patch.serverIds)) next.serverIds = Array.from(new Set(patch.serverIds.filter((value): value is string => typeof value === "string")));
  await createNetworkValidation(next);
  await mutate((items) => items.map((item) => item.id === id ? next : item));
  return (await listNetworks()).find((item) => item.id === id);
}
async function createNetworkValidation(network: NetworkRecord) {
  const proxy = await getServer(network.proxyId);
  if (!proxy || proxy.type.toLowerCase() !== "velocity") throw new Error("La network necesita un proxy Velocity válido");
  if ((await Promise.all(network.serverIds.map((id) => getServer(id)))).some((server) => !server)) throw new Error("Uno de los servidores no existe");
}
export async function deleteNetwork(id: string) {
  const found = (await readNetworks()).some((item) => item.id === id);
  if (!found) throw new Error("Network not found");
  await mutate((items) => items.filter((item) => item.id !== id));
}
