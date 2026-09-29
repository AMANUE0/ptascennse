export const SERVER_PERMISSIONS = [
  "server.read", "server.update", "server.delete",
  "control.start", "control.stop", "control.restart", "control.console",
  "files.list", "files.read", "files.create", "files.update", "files.delete", "files.sftp",
  "database.read", "database.create", "database.update", "database.delete",
  "backup.read", "backup.create", "backup.download", "backup.restore", "backup.delete",
  "schedule.read", "schedule.create", "schedule.update",
  "allocation.read", "allocation.update",
  "user.read", "user.create", "user.update", "user.delete",
] as const;

export type ServerPermission = (typeof SERVER_PERMISSIONS)[number];
export type PermissionMap = Partial<Record<ServerPermission, boolean>>;

const legacyPermissionMap: Record<string, ServerPermission[]> = {
  view: ["server.read"],
  terminal: ["control.console"],
  files: ["files.list", "files.read", "files.create", "files.update", "files.delete"],
  lifecycle: ["control.start", "control.stop", "control.restart"],
};

export function normalizePermissions(input: unknown): PermissionMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const normalized: PermissionMap = {};
  for (const permission of SERVER_PERMISSIONS) {
    if (source[permission] === true) normalized[permission] = true;
  }
  for (const [legacyKey, permissions] of Object.entries(legacyPermissionMap)) {
    if (source[legacyKey] === true) {
      for (const permission of permissions) normalized[permission] = true;
    }
  }
  return normalized;
}

export function hasPermission(permissions: PermissionMap, permission: ServerPermission) {
  return permissions[permission] === true;
}