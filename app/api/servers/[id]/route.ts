import { beginAction, endAction, type LifecycleAction } from "@/lib/lifecycle";
import { NextResponse } from "next/server";
import { appendPanelMessage, deleteServer, sendCommand, startServer, stopServer } from "@/lib/server-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { server } = await requireServerPermission((await params).id, "server.read");
    return server ? NextResponse.json({ server }) : NextResponse.json({ error: "Server not found" }, { status: 404 });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}

export async function POST(request: Request, { params }: Context) {
  let lockedId: string | undefined;
  try {
    const id = (await params).id;
    const body = await request.json() as { action?: string; command?: string };
    const permission = body.action === "start" ? "control.start" : body.action === "stop" || body.action === "kill" ? "control.stop" : body.action === "restart" ? "control.restart" : body.action === "command" ? "control.console" : undefined;
    if (!permission) return NextResponse.json({ error: "action must be start, stop, restart, kill or command" }, { status: 400 });
    await requireServerPermission(id, permission);
    if (body.action !== "command") { beginAction(id, body.action as LifecycleAction); lockedId = id; }
    if (body.action === "start" || body.action === "restart") {
      appendPanelMessage(id, body.action === "restart" ? "§eReiniciando servidor..." : "§aIniciando servidor...");
      if (body.action === "restart") { const stopped = await stopServer(id); if (stopped?.status !== "Detenido") throw new Error("El servidor todavía se está deteniendo"); }
      try {
        const server = await startServer(id);
        return NextResponse.json({ server });
      } catch (error) {
        const message = error instanceof Error ? error.message : "error desconocido";
        appendPanelMessage(id, `§cError al iniciar: ${message}`);
        throw error;
      }
    }
    if (body.action === "stop" || body.action === "kill") {
      appendPanelMessage(id, body.action === "kill" ? "§cKill: finalizando proceso..." : "§6Deteniendo servidor...");
      return NextResponse.json({ server: await stopServer(id, body.action === "kill") });
    }
    if (body.action === "command") return NextResponse.json({ server: await sendCommand(id, body.command ?? "") });
    return NextResponse.json({ error: "action must be start, stop, restart, kill or command" }, { status: 400 });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  } finally { if (lockedId) endAction(lockedId); }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    await requireServerPermission((await params).id, "server.delete");
    await deleteServer((await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
