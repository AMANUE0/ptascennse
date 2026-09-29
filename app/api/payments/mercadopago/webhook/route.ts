import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServer } from "@/lib/server-manager";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago-webhook";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, service: "mercadopago-webhook" });
}

export async function POST(request: Request) {
  const searchPaymentId = new URL(request.url).searchParams.get("data.id");
  const rawBody = await request.text().catch(() => "{}");
  const body = (() => {
    try { return JSON.parse(rawBody || "{}") as { type?: string; data?: { id?: string }; action?: string }; }
    catch { return {} as { type?: string; data?: { id?: string }; action?: string }; }
  })();
  const paymentId = body.data?.id || searchPaymentId || "";
  try {
    verifyMercadoPagoSignature(request, String(paymentId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook no autorizado" }, { status: 401 });
  }
  if (body.type !== "payment" && body.action !== "payment.created" && body.action !== "payment.updated") return NextResponse.json({ ok: true });
  if (!paymentId) return NextResponse.json({ error: "payment id missing" }, { status: 400 });
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "Mercado Pago no está configurado" }, { status: 503 });
  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!paymentResponse.ok) return NextResponse.json({ error: "No se pudo consultar el pago" }, { status: 502 });
  const payment = await paymentResponse.json() as { id?: string; status?: string; external_reference?: string };
  if (!payment.external_reference) return NextResponse.json({ ok: true });
  const admin = supabaseAdmin();
  const { data: order } = await admin.from("hosting_orders").select("*").eq("id", payment.external_reference).single();
  if (!order) return NextResponse.json({ ok: true });
  if (payment.status !== "approved") {
    const paymentStatus = payment.status === "rejected" || payment.status === "cancelled" ? "failed" : "pending";
    await admin.from("hosting_orders").update({ payment_status: paymentStatus, payment_provider_id: String(payment.id || paymentId) }).eq("id", order.id);
    return NextResponse.json({ ok: true });
  }
  if (order.payment_status === "paid" && order.server_id) return NextResponse.json({ ok: true });
  const { data: creating, error: claimError } = await admin.from("hosting_orders")
    .update({ payment_status: "paid", provisioning_status: "creating", payment_provider_id: String(payment.id || paymentId) })
    .eq("id", order.id)
    .is("server_id", null)
    .neq("payment_status", "paid")
    .select("*")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: "No se pudo actualizar la orden" }, { status: 502 });
  if (!creating) return NextResponse.json({ ok: true });
  try {
    const customerData = creating.customer_data as { serverName?: string; type?: string; version?: string };
    if (!customerData.serverName || !customerData.version) throw new Error("La orden no tiene configuración de servidor");
    const server = await createServer({ userId: creating.user_id, name: customerData.serverName, type: customerData.type || "Paper", version: customerData.version, ram: creating.ram, cpu: creating.cpu, storageGb: creating.storage_gb });
    await admin.from("hosting_orders").update({ provisioning_status: "ready", server_id: server.id }).eq("id", order.id);
  } catch {
    await admin.from("hosting_orders").update({ provisioning_status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "El pago fue aprobado pero no se pudo provisionar el servidor" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
