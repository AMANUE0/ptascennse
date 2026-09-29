import { normalizePermissions } from "./permissions";
import { PermissionDeniedError } from "./server-permissions";
import { supabaseAdmin } from "./supabase-admin";

export function validateDelegation(access: { owner: boolean; userId: string; server: { userId?: string }; permissions: Record<string, boolean> }, target: string, input: unknown) {
  if (target === access.server.userId) throw new PermissionDeniedError("El propietario ya tiene todos los permisos", 403);
  if (!access.owner && target === access.userId) throw new PermissionDeniedError("No puedes modificar tu propio acceso", 403);
  const permissions = normalizePermissions(input);
  if (!access.owner && Object.keys(permissions).some(key => !access.permissions[key])) throw new PermissionDeniedError("No puedes otorgar permisos que no tienes", 403);
  return permissions;
}

export async function resolveMember(email?: string, userId?: string) {
  const admin = supabaseAdmin();
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) throw new Error("Usuario no encontrado");
    return data.user;
  }
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Indica un correo válido");
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find(user => user.email?.toLowerCase() === normalized);
    if (user) return user;
    if (data.users.length < 200) break;
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalized, { data: { invited: true } });
  if (error || !data.user) throw error || new Error("No se pudo invitar al usuario");
  return data.user;
}
