import { isAdminUser } from "@/lib/admin-auth";
import { currentUser } from "@/lib/server-auth";
import { getServer, type ServerRecord } from "@/lib/server-manager";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePermissions, type ServerPermission } from "@/lib/permissions";

export class PermissionDeniedError extends Error {
  status: 401 | 403 | 404;
  constructor(message: string, status: 401 | 403 | 404) {
    super(message);
    this.name = "PermissionDeniedError";
    this.status = status;
  }
}

type Access = { userId: string; server: ServerRecord; owner: boolean; permissions: Record<string, boolean> };

export async function requireServerPermission(resourceId: string, permission?: ServerPermission): Promise<Access> {
  const user = await currentUser();
  if (!user) throw new PermissionDeniedError("Debes iniciar sesión", 401);
  const isAdmin = isAdminUser(user);
  const server = await getServer(resourceId);
  if (!server) throw new PermissionDeniedError("No tienes acceso a este servidor", 404);
  const owner = server.userId === user.id;
  if (owner || isAdmin) return { userId: user.id, server, owner: true, permissions: {} };
  const { data, error } = await supabaseAdmin()
    .from("server_members")
    .select("permissions, active")
    .eq("server_id", resourceId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new PermissionDeniedError("No tienes acceso a este servidor", 404);
  const permissions = normalizePermissions(data.permissions);
  if (permission && permissions[permission] !== true) {
    throw new PermissionDeniedError("No tienes permisos suficientes para realizar esta acción", 403);
  }
  return { userId: user.id, server, owner: false, permissions };
}

export function permissionResponse(error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return { error: error.message, status: error.status };
  }
  return { error: error instanceof Error ? error.message : "Request failed", status: 400 };
}
