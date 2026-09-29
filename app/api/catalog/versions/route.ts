import { NextResponse } from "next/server";
export const runtime = "nodejs";
type Version = { id: string; name: string };
export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type")?.toLowerCase() || "paper";
  try {
    if (type === "paper" || type === "velocity") {
      const response = await fetch(`https://fill.papermc.io/v3/projects/${type}/versions`);
      if (!response.ok) throw new Error("No se pudo consultar PaperMC");
      const payload = await response.json() as { versions?: ({ id?: string; version?: { id?: string } } | string)[] } | (string | { id?: string; version?: { id?: string } })[];
      const data = Array.isArray(payload) ? payload : payload.versions || [];
      return NextResponse.json({ versions: data.map((item) => {
        if (typeof item === "string") return { id: item, name: item };
        const id = item.id || item.version?.id || "";
        return { id, name: id };
      }).filter((item) => item.id) });
    }
    if (type === "forge") {
      const response = await fetch("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
      if (!response.ok) throw new Error("No se pudo consultar Forge");
      const data = await response.json() as { promos?: Record<string, string> };
      const versions = new Set(Object.keys(data.promos || {}).map((key) => key.replace(/-(recommended|latest)$/, "")));
      return NextResponse.json({ versions: Array.from(versions).map((id) => ({ id, name: id })) });
    }
    const response = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    if (!response.ok) throw new Error("No se pudo consultar el catálogo");
    const data = await response.json() as { versions?: { id: string }[] };
    return NextResponse.json({ versions: (data.versions || []).map((item) => ({ id: item.id, name: item.id })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar versiones" }, { status: 502 });
  }
}
