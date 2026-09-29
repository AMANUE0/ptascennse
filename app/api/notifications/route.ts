import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ notifications: data });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: string; all?: boolean };
  const admin = supabaseAdmin();
  const query = admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id);
  const { error } = body.all ? await query : await query.eq("id", body.id || "");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
