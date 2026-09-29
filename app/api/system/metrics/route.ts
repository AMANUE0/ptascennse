import { NextResponse } from "next/server";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { listServers } from "@/lib/server-manager";
import { currentUser } from "@/lib/server-auth";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response(JSON.stringify({ error: "Debes iniciar sesión" }), { status: 401, headers: { "content-type": "application/json" } });
  const isAdmin = Boolean(await requireAdmin());
  const [servers, disk] = await Promise.all([listServers(user.id, isAdmin), statfs(path.resolve(process.cwd()))]);
  const totalStorage = disk.blocks * disk.bsize;
  const freeStorage = disk.bavail * disk.bsize;
  const cpuUsage = process.platform === "win32" ? Math.min(100, Math.round((loadavg()[0] || 0) / cpus().length * 100)) : Math.min(100, Math.round((loadavg()[0] / cpus().length) * 100));
  return NextResponse.json({ activeServers: servers.filter((server) => server.status === "Online" || server.status === "Iniciando").length, cpuUsage, cpuCount: cpus().length, memory: { total: totalmem(), free: freemem(), used: totalmem() - freemem() }, storage: { total: totalStorage, free: freeStorage, used: totalStorage - freeStorage } });
}
