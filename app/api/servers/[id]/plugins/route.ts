import { NextResponse } from "next/server";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServer, resolveServerPath } from "@/lib/server-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const mode = query.get("mode") || "installed";
    const { server } = await requireServerPermission(id, "files.list");
    if (!server) throw new Error("Server not found");
    const modded = !["paper", "velocity"].includes(server.type.toLowerCase());
    const contentFolder = modded ? "mods" : "plugins";
    if (mode === "catalog") {
      const search = query.get("search") || "minecraft";
      const kind = query.get("kind") || (modded ? "mod" : "plugin");
      const page = Math.max(1, Number(query.get("page") || "1"));
      const response = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(search)}&facets=${encodeURIComponent(`[[\"project_type:${kind}\"]]`)}&limit=24&offset=${(page - 1) * 24}`, { headers: { "User-Agent": "CraftPanel/1.0" } });
      if (!response.ok) throw new Error(`Modrinth respondió ${response.status}`);
      const data = await response.json() as { hits?: { project_id: string; title: string; description: string; icon_url?: string; slug: string; downloads: number }[]; total?: number; total_hits?: number };
      return NextResponse.json({ page, total: data.total ?? data.total_hits ?? 0, plugins: (data.hits || []).map((plugin) => ({ id: plugin.project_id, name: plugin.title, description: plugin.description, icon: plugin.icon_url || "", slug: plugin.slug, downloads: plugin.downloads })) });
    }
    if (mode === "versions") {
      const project = query.get("project");
      if (!project) throw new Error("project is required");
      const serverLoader = server.type.toLowerCase() === "velocity" ? "velocity" : modded ? server.type.toLowerCase() : "paper";
      const response = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(project)}/version`, { headers: { "User-Agent": "CraftPanel/1.0" } });
      if (!response.ok) throw new Error(`Modrinth respondió ${response.status}`);
      const versions = await response.json() as { id: string; name: string; version_number: string; game_versions: string[]; loaders: string[] }[];
      const compatible = versions.filter((version) => {
        const supportsSoftware = version.loaders.length === 0 || version.loaders.some((loader) => loader === serverLoader || (serverLoader === "paper" && ["paper", "bukkit", "spigot"].includes(loader)));
        const supportsMinecraft = version.game_versions.length === 0 || version.game_versions.includes(server.version) || version.game_versions.includes("*");
        return supportsSoftware && supportsMinecraft;
      });
      const list = (compatible.length ? compatible : versions).map((version) => ({ id: version.id, name: version.name, version: version.version_number, gameVersions: version.game_versions, loaders: version.loaders, compatible: compatible.some((item) => item.id === version.id) }));
      return NextResponse.json({ server: { type: server.type, version: server.version }, versions: list });
    }

    const directory = await resolveServerPath(id, contentFolder, true);
    await mkdir(directory.path, { recursive: true });
    const entries = await readdir(directory.path, { withFileTypes: true });
    const plugins = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar")).map(async (entry) => {
      const info = await stat(path.join(directory.path, entry.name));
      return { name: entry.name, size: info.size, modifiedAt: info.mtime.toISOString() };
    }));
    return NextResponse.json({ plugins });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}

export async function POST(request: Request, { params }: Context) {
    try {
      const { id } = await params;
      const data = await request.json() as { project?: string; version?: string };
      if (!data.project || !data.version) return NextResponse.json({ error: "project y version son requeridos" }, { status: 400 });
      const { server } = await requireServerPermission(id, "files.create");
      if (!server) throw new Error("Server not found");
      const response = await fetch(`https://api.modrinth.com/v2/version/${encodeURIComponent(data.version)}`, { headers: { "User-Agent": "CraftPanel/1.0" } });
      if (!response.ok) throw new Error(`Modrinth respondió ${response.status}`);
      const version = await response.json() as { game_versions?: string[]; loaders?: string[]; files?: { url: string; filename: string; primary?: boolean }[] };
      const loader = server.type.toLowerCase() === "velocity" ? "velocity" : !["paper", "velocity"].includes(server.type.toLowerCase()) ? server.type.toLowerCase() : "paper";
      const softwareOk = !version.loaders?.length || version.loaders.includes(loader) || (loader === "paper" && version.loaders.some((item) => ["paper", "bukkit", "spigot"].includes(item)));
      const gameVersionOk = !version.game_versions?.length || version.game_versions.includes(server.version) || version.game_versions.includes("*");
      if (!softwareOk || !gameVersionOk) throw new Error(`La versión seleccionada no es compatible con ${server.type} ${server.version}`);
      const file = version.files?.find((entry) => entry.primary) || version.files?.[0];
      if (!file) throw new Error("Esta versión no tiene un archivo descargable");
      const directory = await resolveServerPath(id, !["paper", "velocity"].includes(server.type.toLowerCase()) ? "mods" : "plugins", true);
      await mkdir(directory.path, { recursive: true });
      const download = await fetch(file.url);
      if (!download.ok) throw new Error(`La descarga falló (${download.status})`);
      await writeFile(path.join(directory.path, path.basename(file.filename)), Buffer.from(await download.arrayBuffer()));
      return NextResponse.json({ ok: true, filename: path.basename(file.filename) }, { status: 201 });
    } catch (error) {
      const result = permissionResponse(error);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await requireServerPermission(id, "files.delete");
    const name = new URL(request.url).searchParams.get("name");
    if (!name || name.includes("/") || name.includes("\\") || !name.toLowerCase().endsWith(".jar")) {
      return NextResponse.json({ error: "Nombre de plugin inválido" }, { status: 400 });
    }
    const { server } = await requireServerPermission(id, "files.delete");
    const target = await resolveServerPath(id, `${!["paper", "velocity"].includes(server.type.toLowerCase()) ? "mods" : "plugins"}/${name}`);
    const { rm } = await import("node:fs/promises");
    await rm(target.path, { force: false });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
