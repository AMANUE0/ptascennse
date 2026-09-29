import { NextResponse } from "next/server";
import { getServer, readServerProperties, readVelocityConfig, updateServerConfig, updateServerProperties } from "@/lib/server-manager";
import { permissionResponse, requireServerPermission } from "@/lib/server-permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { server } = await requireServerPermission(id, "files.read");
    return server ? NextResponse.json({ name: server.name, ram: server.ram, java: server.java, command: server.command, jar: server.jar, port: server.port, properties: server.type.toLowerCase() === "velocity" ? {} : await readServerProperties(server.id), velocity: server.type.toLowerCase() === "velocity" ? await readVelocityConfig(server.id) : undefined }) : NextResponse.json({ error: "Server not found" }, { status: 404 });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await requireServerPermission(id, "files.update");
    const data = await request.json() as Record<string, unknown>;
    const server = await updateServerConfig(id, {
      name: data.name as string, ram: data.ram as string, java: data.java as string,
      command: data.command as string, jar: data.jar as string,
      port: typeof data.port === "number" ? data.port : typeof data.port === "string" ? Number(data.port) : undefined,
      cpu: data.cpu as string,
      storageGb: typeof data.storageGb === "number" ? data.storageGb : undefined,
    });
    const properties = data.properties;
    if (server.type.toLowerCase() !== "velocity" && properties && typeof properties === "object" && !Array.isArray(properties)) {
      await updateServerProperties(id, properties as Record<string, string | number | boolean>);
    }
    return NextResponse.json({ server });
  } catch (error) {
    const result = permissionResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
