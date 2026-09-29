import { notifyPanel } from "@/lib/lifecycle";
﻿import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
import { normalizePermissions, SERVER_PERMISSIONS } from "@/lib/permissions";
import { resolveMember, validateDelegation } from "@/lib/member-access";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params; await requireServerPermission(id, "user.read");
    const admin = supabaseAdmin();
    const { data, error } = await admin.from("server_members").select("*").eq("server_id", id).eq("active", true).order("created_at");
    if (error) throw error;
    const members = await Promise.all(data.map(async member => {
      const result = await admin.auth.admin.getUserById(member.user_id);
      return { ...member, permissions: normalizePermissions(member.permissions), email: result.data.user?.email || member.user_id };
    }));
    return NextResponse.json({ members, permissions: SERVER_PERMISSIONS });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params; const access = await requireServerPermission(id, "user.create");
    const body = await request.json();
    const permissions = validateDelegation(access, "", body.permissions);
    const user = await resolveMember(body.email, body.userId);
    validateDelegation(access, user.id, permissions);
    const admin = supabaseAdmin();
    const existing = await admin.from("server_members").select("user_id").eq("server_id", id).eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) await requireServerPermission(id, "user.update");
    const { data, error } = await admin.from("server_members").upsert({ server_id: id, user_id: user.id, permissions, invited_by: access.userId, active: true }, { onConflict: "server_id,user_id" }).select("*").single();
    if (error) throw error;
    await admin.from("notifications").insert({ user_id: user.id, type: "server_access", title: "Acceso a un servidor", body: `Te agregaron al servidor ${access.server.name}`, metadata: { server_id: id } });
    notifyPanel();
    return NextResponse.json({ member: { ...data, email: user.email } }, { status: 201 });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params; const access = await requireServerPermission(id, "user.update");
    const body = await request.json();
    if (typeof body.userId !== "string" || !body.permissions) throw new Error("Faltan datos");
    const permissions = validateDelegation(access, body.userId, body.permissions);
    const { data, error } = await supabaseAdmin().from("server_members").update({ permissions, active: true }).eq("server_id", id).eq("user_id", body.userId).select("*").single();
    if (error) throw error;
    notifyPanel();
    return NextResponse.json({ member: data });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params; const access = await requireServerPermission(id, "user.delete");
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) throw new Error("userId es obligatorio");
    validateDelegation(access, userId, {});
    const { error } = await supabaseAdmin().from("server_members").delete().eq("server_id", id).eq("user_id", userId);
    if (error) throw error;
    notifyPanel();
    return NextResponse.json({ ok: true });
  } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
