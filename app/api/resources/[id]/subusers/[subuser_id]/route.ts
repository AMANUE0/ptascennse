import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireServerPermission, permissionResponse } from "@/lib/server-permissions";
import { normalizePermissions } from "@/lib/permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; subuser_id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const { id, subuser_id } = await context.params;
    await requireServerPermission(id, "user.update");
    const body = await request.json() as { permissions?: Record<string, boolean>; active?: boolean };
    if (!body.permissions || typeof body.permissions !== "object") return NextResponse.json({ error: "permissions es obligatorio" }, { status: 400 });
    const { data, error } = await supabaseAdmin().from("server_members").update({
      permissions: normalizePermissions(body.permissions),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    }).eq("server_id", id).eq("user_id", subuser_id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ subuser: data ? { ...data, permissions: normalizePermissions(data.permissions) } : data });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id, subuser_id } = await context.params;
    await requireServerPermission(id, "user.delete");
    const { error } = await supabaseAdmin().from("server_members").delete().eq("server_id", id).eq("user_id", subuser_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
