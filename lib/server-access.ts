import { isAdminUser } from "@/lib/admin-auth";
import { currentUser } from "@/lib/server-auth";
import { getServer, type ServerRecord } from "@/lib/server-manager";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function ownedServer(id: string): Promise<{ userId: string; server: ServerRecord }> {
  const user = await currentUser();
  if (!user) throw new Error("Debes iniciar sesión");
  const isAdmin = isAdminUser(user);
  let server = await getServer(id, user.id, isAdmin);
  if (!server && !isAdmin) {
    const membership = await supabaseAdmin().from("server_members").select("server_id").eq("server_id", id).eq("user_id", user.id).maybeSingle();
    if (membership.error) throw new Error(membership.error.message);
    if (membership.data) server = await getServer(id);
  }
  if (!server) throw new Error("Server not found");
  return { userId: user.id, server };
}
