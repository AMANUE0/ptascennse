import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listServers } from "@/lib/server-manager";

export const runtime = "nodejs";
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  try {
    const admin = supabaseAdmin();
    const [{ data: users }, orders, tickets] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("hosting_orders").select("*").order("created_at", { ascending: false }).limit(20),
      admin.from("hosting_tickets").select("id,subject,status,user_id,created_at,updated_at").order("updated_at", { ascending: false }).limit(50),
    ]);
    if (orders.error) throw orders.error; if (tickets.error) throw tickets.error;
    const byId = new Map((users?.users || []).map((user) => [user.id, user]));
    const servers = await listServers();
    return NextResponse.json({
      servers: servers.map((server) => { const owner = byId.get(server.userId || ""); return { id: server.id, name: server.name, status: server.status, owner: owner?.user_metadata?.fullName || owner?.email || "Sin propietario", email: owner?.email || "—" }; }),
      purchases: orders.data || [],
      tickets: (tickets.data || []).map((ticket) => ({ ...ticket, email: byId.get(ticket.user_id)?.email || "—" })),
    });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el resumen" }, { status: 502 }); }
}
