import { NextResponse } from "next/server";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile, rename } from "node:fs/promises";
import { resolveServerPath } from "@/lib/server-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status });

async function body(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("multipart/form-data")) return { form: await request.formData() };
  return { json: await request.json() as Record<string, unknown> };
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const relative = query.get("path") || "";
    const target = query.get("file");
    await requireServerPermission(id, target ? "files.read" : "files.list");
    const resolved = await resolveServerPath(id, target || relative);
    if (target) return new Response(await readFile(resolved.path, "utf8"), { headers: { "content-type": "text/plain; charset=utf-8" } });
    const entries = await readdir(resolved.path, { withFileTypes: true });
    return json({ path: relative, entries: await Promise.all(entries.map(async (entry) => {
      const full = await resolveServerPath(id, relative ? `${relative}/${entry.name}` : entry.name);
      const info = await stat(full.path);
      return { name: entry.name, type: entry.isDirectory() ? "directory" : "file", size: entry.isFile() ? info.size : undefined, modifiedAt: info.mtime.toISOString() };
    })) });
  } catch (error) { const result = permissionResponse(error); return json({ error: result.error }, result.status); }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params; const data = await request.json() as { path?: string; content?: string };
    await requireServerPermission(id, "files.update");
    if (typeof data.path !== "string" || typeof data.content !== "string") return json({ error: "path and content are required" }, 400);
    const target = await resolveServerPath(id, data.path, true);
    await writeFile(target.path, data.content, "utf8");
    return json({ ok: true });
  } catch (error) { const result = permissionResponse(error); return json({ error: result.error }, result.status); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params; const parsed = await body(request);
    if (parsed.form) {
      await requireServerPermission(id, "files.create");
      const form = parsed.form; const directory = String(form.get("path") || "");
      const file = form.get("file"); if (!(file instanceof File)) return json({ error: "multipart field file is required" }, 400);
      const target = await resolveServerPath(id, directory ? `${directory}/${file.name}` : file.name, true);
      await writeFile(target.path, Buffer.from(await file.arrayBuffer())); return json({ ok: true }, 201);
    }
    const data = parsed.json || {}; const action = data.action;
    await requireServerPermission(id, action === "copy" || action === "move" ? "files.update" : "files.create");
    if (action === "mkdir" || action === "create") {
      if (typeof data.path !== "string") return json({ error: "path is required" }, 400);
      const target = await resolveServerPath(id, data.path, true);
      if (action === "mkdir" || data.type === "directory") await mkdir(target.path, { recursive: false });
      else await writeFile(target.path, typeof data.content === "string" ? data.content : "", "utf8");
      return json({ ok: true }, 201);
    }
    if (action === "copy" || action === "move") {
      if (typeof data.from !== "string" || typeof data.to !== "string") return json({ error: "from and to are required" }, 400);
      const source = await resolveServerPath(id, data.from); const destination = await resolveServerPath(id, data.to, true);
      if (action === "move") await rename(source.path, destination.path); else await cp(source.path, destination.path, { recursive: true, errorOnExist: true });
      return json({ ok: true });
    }
    return json({ error: "unsupported action" }, 400);
  } catch (error) { const result = permissionResponse(error); return json({ error: result.error }, result.status); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params; const relative = new URL(request.url).searchParams.get("path");
    await requireServerPermission(id, "files.delete");
    if (!relative) return json({ error: "path is required" }, 400);
    const target = await resolveServerPath(id, relative);
    await rm(target.path, { recursive: true, force: false }); return json({ ok: true });
  } 
  catch (error) { const result = permissionResponse(error); return json({ error: result.error }, result.status); }
}
