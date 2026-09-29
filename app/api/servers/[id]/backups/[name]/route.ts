import { NextResponse } from "next/server";
import { backupPath } from "@/lib/backup-manager";
import { readFile } from "node:fs/promises";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
type Context = { params: Promise<{ id: string; name: string }> };
export async function GET(_: Request, { params }: Context) {
  try { const { id, name } = await params; await requireServerPermission(id, "backup.download"); const file = await readFile(await backupPath(id, name)); return new NextResponse(file, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` } }); }
  catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
