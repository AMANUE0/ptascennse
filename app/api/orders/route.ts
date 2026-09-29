import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlan } from "@/lib/plans";
import { createServer } from "@/lib/server-manager";
import { getPaymentConfig } from "@/lib/payments";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("hosting_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ orders: data });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  try {
    const body = await request.json() as {
      planId?: string;
      serverName?: string;
      type?: string;
      version?: string;
      paymentMethod?: "mercadopago";
      customerData?: Record<string, string>;
      addons?: { dedicatedIp?: boolean; extraStorageGb?: number };
    };
    const plan = body.planId ? getPlan(body.planId) : undefined;
    if (!plan || !body.serverName?.trim() || !body.version?.trim()) throw new Error("Completa el plan, nombre y versión del servidor");
    if (body.paymentMethod !== "mercadopago") throw new Error("Método de pago no disponible");
    const paymentConfig = getPaymentConfig();
    const addons = {
      dedicatedIp: Boolean(body.addons?.dedicatedIp),
      extraStorageGb: Math.max(0, Number(body.addons?.extraStorageGb) || 0),
    };
    const storageGb = plan.storageGb + addons.extraStorageGb;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    let callbackUrl: URL;
    try {
      callbackUrl = new URL(appUrl);
    } catch {
      throw new Error("NEXT_PUBLIC_APP_URL no contiene una URL válida");
    }
    if (callbackUrl.hostname === "localhost" || callbackUrl.hostname === "127.0.0.1" || callbackUrl.hostname === "::1") {
      throw new Error("Mercado Pago necesita una URL pública HTTPS para volver a tu aplicación y enviar el webhook. Configura NEXT_PUBLIC_APP_URL con un túnel como ngrok o Cloudflare Tunnel.");
    }
    if (callbackUrl.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL debe usar HTTPS para pagos de producción");
    }
    const admin = supabaseAdmin();
    const { data: order, error: orderError } = await admin.from("hosting_orders").insert({
      user_id: user.id,
      plan_id: plan.id,
      plan_name: plan.name,
      ram: plan.ram,
      storage_gb: storageGb,
      cpu: plan.cpu,
      addons,
      customer_data: body.customerData || {},
      payment_method: body.paymentMethod,
      payment_status: "pending",
      provisioning_status: "pending",
    }).select("*").single();
    if (orderError || !order) throw new Error(orderError?.message || "No se pudo crear la orden");
    if (paymentConfig.mode === "simulation") {
      try {
        const server = await createServer({ userId: user.id, name: body.serverName, type: body.type || "Paper", version: body.version, ram: plan.ram, cpu: plan.cpu, storageGb });
        const { data: simulated, error: simulationError } = await admin.from("hosting_orders").update({ payment_status: "paid", provisioning_status: "ready", server_id: server.id }).eq("id", order.id).select("*").single();
        if (simulationError || !simulated) throw new Error(simulationError?.message || "No se pudo completar la simulación");
        return NextResponse.json({ order: simulated, simulated: true, checkoutUrl: null }, { status: 201 });
      } catch (error) {
        await admin.from("hosting_orders").update({ payment_status: "failed", provisioning_status: "failed" }).eq("id", order.id);
        throw error;
      }
    }
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago está activado, pero falta MERCADOPAGO_ACCESS_TOKEN en .env.local");
    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: plan.id, title: `CraftPanel ${plan.name}`, quantity: 1, currency_id: "MXN", unit_price: plan.price + addons.extraStorageGb * 0.2 + (addons.dedicatedIp ? 5 : 0) }],
        external_reference: order.id,
        payer: { email: user.email },
        back_urls: { success: `${appUrl}/planes/resultado?status=success`, failure: `${appUrl}/planes/resultado?status=failure`, pending: `${appUrl}/planes/resultado?status=pending` },
        auto_return: "approved",
        notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
      }),
    });
    const preference = await preferenceResponse.json() as { id?: string; init_point?: string; sandbox_init_point?: string; message?: string };
    if (!preferenceResponse.ok || !preference.id || !preference.init_point) throw new Error(preference.message || "Mercado Pago no pudo crear el checkout");
    const { data: updated, error: updateError } = await admin.from("hosting_orders").update({ payment_preference_id: preference.id }).eq("id", order.id).select("*").single();
    if (updateError || !updated) throw new Error(updateError?.message || "No se pudo guardar la preferencia de pago");
    return NextResponse.json({ order: updated, checkoutUrl: preference.init_point }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar la compra";
    const normalized = message.toLowerCase().includes("invalid api key")
      ? "La clave secreta de Supabase no es válida. Actualiza SUPABASE_SECRET_KEY en .env.local y reinicia Next.js."
      : message.includes("hosting_orders_payment_method_check")
        ? "Supabase todavía no acepta Mercado Pago. Ejecuta en el SQL Editor el script actualizado de supabase/schema.sql y vuelve a intentarlo."
        : message;
    return NextResponse.json({ error: normalized }, { status: 400 });
  }
}
