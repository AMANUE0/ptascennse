export type PaymentMode = "simulation" | "mercadopago";

export function getPaymentConfig() {
  const raw = process.env.PAYMENT_MODE?.trim().toLowerCase();
  const mode: PaymentMode = raw === "mercadopago" ? "mercadopago" : "simulation";
  return {
    mode,
    enabled: mode === "mercadopago" && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    label: mode === "mercadopago" ? "Mercado Pago" : "Simulación",
  };
}
