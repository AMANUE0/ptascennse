import { currentUser } from "@/lib/server-auth";
import { ADMIN_EMAIL } from "@/lib/supabase";

export async function requireAdmin() {
  const user = await currentUser();
  const role = user?.app_metadata?.role;
  return user && (role === "admin" || user.email?.toLowerCase() === ADMIN_EMAIL) ? user : null;
}
