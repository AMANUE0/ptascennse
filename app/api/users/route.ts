import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede gestionar usuarios" }, { status: 403 });
  let admin;
  try { admin = supabaseAdmin(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Configura Supabase" }, { status: 500 }); }
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message.toLowerCase().includes("invalid api key") ? "La clave secreta de Supabase no es válida. Actualiza SUPABASE_SECRET_KEY y reinicia Next.js." : error.message }, { status: 502 });
  return NextResponse.json({ users: data.users.map((user) => ({ id: user.id, email: user.email, permissions: user.user_metadata?.permissions || {} })) });
}
export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede invitar usuarios" }, { status: 403 });
  const { email, permissions } = await request.json() as { email?: string; permissions?: Record<string, boolean> };
  if (!email?.includes("@")) return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  let admin;
  try { admin = supabaseAdmin(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Configura Supabase" }, { status: 500 }); }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { invited: true, permissions: permissions || { view: true, terminal: false, files: false, lifecycle: false } } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { status: 201 });
}
export async function PATCH(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo el administrador puede cambiar permisos" }, { status: 403 });
  const { id, permissions } = await request.json() as { id?: string; permissions?: Record<string, boolean> };
  if (!id || !permissions) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  let admin;
  try { admin = supabaseAdmin(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Configura Supabase" }, { status: 500 }); }
  const { data, error } = await admin.auth.admin.updateUserById(id, { user_metadata: { invited: true, permissions } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email, permissions } });
}
