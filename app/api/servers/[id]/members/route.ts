import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
import { normalizePermissions, SERVER_PERMISSIONS } from "@/lib/permissions";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params; await requireServerPermission(id, "user.read");
    const { data, error } = await supabaseAdmin().from("server_members").select("*").eq("server_id", id).eq("active", true).order("created_at");
    if (error) throw error;
    const users = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emails = new Map(users.data.users.map((user) => [user.id, user.email || user.id]));
    return NextResponse.json({ members: data.map((member) => ({ ...member, permissions: normalizePermissions(member.permissions), email: emails.get(member.user_id) || member.user_id })), permissions: SERVER_PERMISSIONS });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params; const result = await requireServerPermission(id, "user.create");
    const body = await request.json() as { email?: string; userId?: string; permissions?: Record<string, boolean> };
    const email = body.email?.trim().toLowerCase(); const admin = supabaseAdmin();
    let userId = body.userId;
    if (!userId && email) {
      const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = users.data.users.find((user) => user.email?.toLowerCase() === email)?.id;
      if (!userId) { const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { invited: true } }); if (invited.error) throw invited.error; userId = invited.data.user.id; }
    }
    if (!userId) return NextResponse.json({ error: "Indica un correo o userId válido" }, { status: 400 });
    const { data, error } = await admin.from("server_members").upsert({ server_id: id, user_id: userId, permissions: normalizePermissions(body.permissions), invited_by: result.userId, active: true }, { onConflict: "server_id,user_id" }).select("*").single();
    if (error) throw error;
    await admin.from("notifications").insert({ user_id: userId, type: "server_access", title: "Acceso a un servidor", body: `Te agregaron al servidor ${result.server.name}`, metadata: { server_id: id } });
    return NextResponse.json({ member: data }, { status: 201 });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params; await requireServerPermission(id, "user.update");
    const body = await request.json() as { userId?: string; permissions?: Record<string, boolean> };
    if (!body.userId || !body.permissions) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    const { data, error } = await supabaseAdmin().from("server_members").update({ permissions: normalizePermissions(body.permissions), active: true }).eq("server_id", id).eq("user_id", body.userId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ member: data });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await requireServerPermission(id, "user.delete");
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId es obligatorio" }, { status: 400 });
    const { error } = await supabaseAdmin().from("server_members").delete().eq("server_id", id).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
