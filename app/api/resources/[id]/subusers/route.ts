import { notifyPanel } from "@/lib/lifecycle";
import { validateDelegation, resolveMember } from "@/lib/member-access";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireServerPermission, permissionResponse } from "@/lib/server-permissions";
import { normalizePermissions, SERVER_PERMISSIONS } from "@/lib/permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function findUserId(email?: string, userId?: string) {
  if (userId) return userId;
  if (!email?.trim()) return undefined;
  const result = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw result.error;
  const existing = result.data.users.find((item) => item.email?.toLowerCase() === email.trim().toLowerCase());
  if (existing) return existing.id;
  const invited = await supabaseAdmin().auth.admin.inviteUserByEmail(email.trim().toLowerCase(), { data: { invited: true } });
  if (invited.error) throw invited.error;
  return invited.data.user?.id;
}

export async function GET(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    await requireServerPermission(id, "user.read");
    const { data, error } = await supabaseAdmin().from("server_members").select("*").eq("server_id", id).order("created_at");
    if (error) throw error;
    return NextResponse.json({ subusers: data.map((item) => ({ ...item, permissions: normalizePermissions(item.permissions) })), permissions: SERVER_PERMISSIONS });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const owner = await requireServerPermission(id, "user.create");
    const body = await request.json() as { email?: string; userId?: string; permissions?: Record<string, boolean> };
    validateDelegation(owner, "", body.permissions);
    const userId = (await resolveMember(body.email, body.userId)).id;
    const existing = await supabaseAdmin().from("server_members").select("user_id").eq("server_id", id).eq("user_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) await requireServerPermission(id, "user.update");
    if (!userId) return NextResponse.json({ error: "Debes indicar email o userId" }, { status: 400 });
    const { data, error } = await supabaseAdmin().from("server_members").upsert({
      server_id: id, user_id: userId, invited_by: owner.userId, permissions: validateDelegation(owner, userId, body.permissions), active: true,
    }, { onConflict: "server_id,user_id" }).select("*").single();
    if (error) throw error;
    await supabaseAdmin().from("notifications").insert({
      user_id: userId, type: "server_access", title: "Acceso a un servidor",
      body: `Te agregaron al servidor ${owner.server.name}`, metadata: { server_id: id },
    });
    notifyPanel();
    return NextResponse.json({ subuser: data }, { status: 201 });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
