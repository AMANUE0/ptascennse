import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  const { data, error } = await supabaseAdmin().from("hosting_tickets").select("*, hosting_ticket_messages(*)").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ tickets: data });
}
export async function POST(request: Request) {
  const user = await requireAdmin(); if (!user) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  try {
    const body = await request.json() as { ticketId?: string; body?: string; status?: string };
    if (!body.ticketId || !body.body?.trim()) return NextResponse.json({ error: "Faltan ticketId y respuesta" }, { status: 400 });
    const admin = supabaseAdmin();
    const { error: messageError } = await admin.from("hosting_ticket_messages").insert({ ticket_id: body.ticketId, author_id: user.id, body: body.body.trim() });
    if (messageError) throw messageError;
    const { error: ticketError } = await admin.from("hosting_tickets").update({ status: body.status || "answered", updated_at: new Date().toISOString() }).eq("id", body.ticketId);
    if (ticketError) throw ticketError;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo responder" }, { status: 400 }); }
}
