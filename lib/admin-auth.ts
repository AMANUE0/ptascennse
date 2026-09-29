import { currentUser } from "@/lib/server-auth";

type AuthUser = {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
};

export function adminEmails() {
  return (process.env.CRAFTPANEL_ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user: AuthUser | null | undefined) {
  if (!user) return false;
  if (user.app_metadata?.role === "admin") return true;
  const email = user.email?.toLowerCase();
  return Boolean(email && adminEmails().includes(email));
}

export async function requireAdmin() {
  const user = await currentUser();
  return user && isAdminUser(user) ? user : null;
}
