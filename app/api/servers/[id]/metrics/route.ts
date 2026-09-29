import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/server-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireServerPermission(id, "server.read");
    const metrics = await getMetrics(id);
    return metrics ? NextResponse.json(metrics) : NextResponse.json({ error: "Server not found" }, { status: 404 });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
