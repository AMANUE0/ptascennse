import { NextResponse } from "next/server";
import { createNetwork, listNetworks } from "@/lib/network-manager";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "nodejs";
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede gestionar networks" }, { status: 403 });
  return NextResponse.json({ networks: await listNetworks() });
}
export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede gestionar networks" }, { status: 403 });
  try { return NextResponse.json({ network: await createNetwork(await request.json()) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la network" }, { status: 400 }); }
}
