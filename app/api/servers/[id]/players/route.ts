import { NextResponse } from "next/server";
import { getMetrics, sendCommand } from "@/lib/server-manager";
import { requireServerPermission } from "@/lib/server-permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { id } = await params;
    await requireServerPermission(id, "control.console");
    await sendCommand(id, "list").catch(() => undefined);
    let metrics = await getMetrics(id);
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      metrics = await getMetrics(id);
      if (metrics?.recentOutput.some((value) => /players online|jugadores conectados/i.test(value))) break;
    }
    if (!metrics) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    const output = metrics.recentOutput;
    const lineIndex = output.map((value) => /players online|jugadores conectados/i.test(value)).lastIndexOf(true);
    const line = lineIndex >= 0 ? output[lineIndex] : "";
    const inlineNames = line.match(/players online:\s*(.*)$/i)?.[1] || line.match(/jugadores conectados:\s*(.*)$/i)?.[1] || "";
    const nextLine = lineIndex >= 0 ? output[lineIndex + 1] || "" : "";
    const names = (inlineNames || nextLine.replace(/^.*?\]\s*/, "")).split(",").map((name) => name.trim()).filter((name) => name && !/^none$/i.test(name));
    return NextResponse.json({ players: names.map((name) => ({ name, avatar: `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64` })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron cargar los jugadores" }, { status: 400 });
  }
}
