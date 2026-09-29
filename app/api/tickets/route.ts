import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("hosting_tickets").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ tickets: data });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  try {
    const body = await request.json() as { subject?: string; department?: string; priority?: string; serverId?: string; message?: string };
    const subject = body.subject?.trim();
    const message = body.message?.trim();
    if (!subject || subject.length < 3) throw new Error("Escribe un asunto válido");
    if (!message) throw new Error("Escribe el mensaje inicial");
    const admin = supabaseAdmin();
    const { data: ticket, error: ticketError } = await admin.from("hosting_tickets").insert({
      user_id: user.id,
      subject,
      department: body.department || "support",
      priority: body.priority || "normal",
      server_id: body.serverId || null,
    }).select("*").single();
    if (ticketError || !ticket) throw new Error(ticketError?.message || "No se pudo crear el ticket");
    const { error: messageError } = await admin.from("hosting_ticket_messages").insert({ ticket_id: ticket.id, author_id: user.id, body: message });
    if (messageError) throw new Error(messageError.message);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el ticket" }, { status: 400 });
  }
}
