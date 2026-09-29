import { normalizePermissions } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { claimLegacyServers, listServers } from "@/lib/server-manager";
import { currentUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  const isAdmin = isAdminUser(user);
  if (isAdmin) await claimLegacyServers(user.id);
  if (isAdmin) return NextResponse.json({ servers: await listServers(user.id, true) });
  const [owned, memberships] = await Promise.all([
    listServers(user.id),
    supabaseAdmin().from("server_members").select("server_id, permissions").eq("user_id", user.id).eq("active", true),
  ]);
  if (memberships.error) return NextResponse.json({ error: memberships.error.message }, { status: 502 });
  const memberIds = new Set((memberships.data || []).map((membership) => membership.server_id));
  const shared = (await listServers()).filter((server) => memberIds.has(server.id));
  const membershipsByServer = new Map((memberships.data || []).map((membership) => [membership.server_id, membership]));
  return NextResponse.json({
    servers: [...owned, ...shared.filter((server) => !owned.some((item) => item.id === server.id)).map((server) => ({
      ...server,
      isSubuser: true,
      permissions: normalizePermissions(membershipsByServer.get(server.id)?.permissions),
    }))],
  });
}
export async function POST(request: Request) {
  return NextResponse.json({ error: "Los servidores solo se crean mediante una compra aprobada en Mercado Pago" }, { status: 405 });
}
