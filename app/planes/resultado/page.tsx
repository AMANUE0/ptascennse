"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ResultContent() {
  const status = useSearchParams().get("status");
  const message = status === "success" ? "Pago aprobado. Estamos preparando tu servidor." : status === "pending" ? "Pago pendiente. Te avisaremos cuando Mercado Pago lo confirme." : "El pago no fue aprobado.";
  return <main className="payment-result"><section><div className="brand">craft<span>panel</span></div><h1>{message}</h1><p>Regresa al panel para consultar el estado de tu compra.</p><div><a className="primary-button" href="/panel">Ir al panel</a><a className="secondary-button" href="/planes">Volver a planes</a></div></section></main>;
}

export default function PaymentResultPage() {
  return <Suspense fallback={<main className="payment-result"><section><p>Cargando resultado...</p></section></main>}><ResultContent /></Suspense>;
}
