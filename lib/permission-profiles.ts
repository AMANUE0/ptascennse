import { SERVER_PERMISSIONS, type PermissionMap } from "./permissions";

export const permissionProfiles = [
  { id: "admin", name: "Administrador", description: "Control completo del servidor", permissions: [...SERVER_PERMISSIONS] },
  { id: "manager", name: "Manager", description: "Operación, archivos y respaldos", permissions: SERVER_PERMISSIONS.filter(p => !p.startsWith("user.") && p !== "server.delete") },
  { id: "operator", name: "Operador", description: "Consola y controles de encendido", permissions: ["server.read", "control.start", "control.stop", "control.restart", "control.console"] },
  { id: "viewer", name: "Observador", description: "Consulta sin modificar el servidor", permissions: ["server.read"] },
] as const;

export function profilePermissions(id: string): PermissionMap {
  return Object.fromEntries((permissionProfiles.find(p => p.id === id)?.permissions || []).map(p => [p, true]));
}

export const permissionGroups: Record<string, string> = { server: "Servidor", control: "Controles", files: "Archivos", database: "Bases de datos", backup: "Respaldos", schedule: "Tareas", allocation: "Network", user: "Equipo" };
export const permissionActions: Record<string, string> = { read: "Ver", update: "Editar", delete: "Eliminar", start: "Iniciar", stop: "Detener", restart: "Reiniciar", console: "Consola", list: "Listar", create: "Crear", sftp: "SFTP", download: "Descargar", restore: "Restaurar" };
