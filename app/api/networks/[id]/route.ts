import { NextResponse } from "next/server";
import { deleteNetwork, updateNetwork } from "@/lib/network-manager";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede gestionar networks" }, { status: 403 });
  try { const { id } = await params; return NextResponse.json({ network: await updateNetwork(id, await request.json()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar" }, { status: 400 }); }
}
export async function DELETE(_: Request, { params }: Context) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede gestionar networks" }, { status: 403 });
  try { await deleteNetwork((await params).id); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar" }, { status: 400 }); }
}
