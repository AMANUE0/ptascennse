import { NextResponse } from "next/server";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { server } = await requireServerPermission(id, "server.read");
    return server ? NextResponse.json({ status: server.status, server }) : NextResponse.json({ error: "Server not found" }, { status: 404 });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
