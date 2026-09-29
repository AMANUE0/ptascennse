export type PaymentMode = "simulation" | "mercadopago";

export function getPaymentConfig() {
  const mode: PaymentMode = process.env.PAYMENT_MODE === "mercadopago" ? "mercadopago" : "simulation";
  return {
    mode,
    enabled: mode === "mercadopago" && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    label: mode === "mercadopago" ? "Mercado Pago" : "Simulación",
  };
}