import { NextResponse } from "next/server";
import { createBackup, listBackups } from "@/lib/backup-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) { try { const id = (await params).id; await requireServerPermission(id, "backup.read"); return NextResponse.json({ backups: await listBackups(id) }); } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); } }
export async function POST(_: Request, { params }: Context) { try { const id = (await params).id; await requireServerPermission(id, "backup.create"); return NextResponse.json({ backup: await createBackup(id) }); } catch (error) { const result = permissionResponse(error); return NextResponse.json({ error: result.error }, { status: result.status }); } }
