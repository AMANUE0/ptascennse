import { NextResponse } from "next/server";
import { getServer, readVelocityConfig, writeVelocityConfig } from "@/lib/server-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const { server } = await requireServerPermission((await params).id, "allocation.read");
    if (!server || server.type.toLowerCase() !== "velocity") return NextResponse.json({ error: "Network solo está disponible para proxies Velocity" }, { status: 400 });
    const config = await readVelocityConfig(server.id);
    return NextResponse.json({ config });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const id = (await params).id;
    const { server } = await requireServerPermission(id, "allocation.update");
    if (!server || server.type.toLowerCase() !== "velocity") throw new Error("Network solo está disponible para proxies Velocity");
    const data = await request.json();
    const config = await writeVelocityConfig(id, {
      bind: String(data.bind || `0.0.0.0:${server.port}`),
      motd: typeof data.motd === "string" ? data.motd : undefined,
      onlineMode: Boolean(data.onlineMode),
      playerInfoForwarding: String(data.playerInfoForwarding || "modern"),
      forceKeyAuthentication: data.forceKeyAuthentication === undefined ? undefined : Boolean(data.forceKeyAuthentication),
      preventClientProxyConnections: data.preventClientProxyConnections === undefined ? undefined : Boolean(data.preventClientProxyConnections),
      announceForge: data.announceForge === undefined ? undefined : Boolean(data.announceForge),
      kickExistingPlayers: data.kickExistingPlayers === undefined ? undefined : Boolean(data.kickExistingPlayers),
      pingPassthrough: typeof data.pingPassthrough === "string" ? data.pingPassthrough : undefined,
      forwardingSecret: String(data.forwardingSecret || ""),
      servers: Array.isArray(data.servers) ? data.servers.filter((item: unknown): item is { name: string; address: string; priority?: number } => Boolean(item && typeof item === "object" && "name" in item && "address" in item)).map((item: { name: string; address: string; priority?: number }) => ({ ...item, priority: Number(item.priority) || 0 })) : [],
    });
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
