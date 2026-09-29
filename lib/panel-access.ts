export type PanelPermission = "files.read" | "files.create" | "files.update" | "files.delete" | "backup.create" | "backup.download" | "allocation.update";

type StoredAccess = { isSubuser?: boolean; permissions?: Record<string, boolean> };

function readAccess(): StoredAccess | undefined {
  if (typeof window === "undefined") return undefined;
  try { return JSON.parse(window.sessionStorage.getItem("craftpanel:selected-server-access") || "null") as StoredAccess | undefined; }
  catch { return undefined; }
}

export function canPanelPermission(permission: PanelPermission) {
  const access = readAccess();
  return !access?.isSubuser || access.permissions?.[permission] === true;
}