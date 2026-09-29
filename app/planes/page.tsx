"use client";

import { useEffect, useState } from "react";
import SoftwarePicker from "@/components/SoftwarePicker";
import { Server, ShieldCheck } from "lucide-react";
import { hostingPlans, type HostingPlan } from "@/lib/plans";
import { supabase } from "@/lib/supabase";
import { clearCheckoutDraft, readCheckoutDraft, saveCheckoutDraft } from "@/lib/checkout-draft";

type CheckoutData = {
  serverName: string;
  type: string;
  version: string;
  paymentMethod: "mercadopago";
  cardName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  dedicatedIp: boolean;
  extraStorageGb: string;
};

const initialCheckout: CheckoutData = {
  serverName: "",
  type: "Paper",
  version: "1.21.4",
  paymentMethod: "mercadopago",
  cardName: "",
  cardNumber: "",
  expiry: "",
  cvv: "",
  dedicatedIp: false,
  extraStorageGb: "0",
};

export default function PlansPage() {
  const [selected, setSelected] = useState<HostingPlan | null>(null);
  const [form, setForm] = useState(initialCheckout);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [versionsReady, setVersionsReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setSelected(null); };
    window.addEventListener("keydown",close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown",close); };
  }, [selected, busy]);
  const [paymentMode, setPaymentMode] = useState<"simulation" | "mercadopago">("simulation");
  useEffect(() => {
    void fetch("/api/payments/config").then((response) => response.json()).then((data: { label?: string; mode?: "simulation" | "mercadopago" }) => {
      setPaymentMode(data.mode || "simulation");
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const draft = readCheckoutDraft<CheckoutData>();
    const planId = new URLSearchParams(window.location.search).get("plan") || draft?.planId;
    if (planId) {
      const plan = hostingPlans.find((item) => item.id === planId);
      if (plan) {
        setSelected(plan);
        if (draft?.planId === plan.id) setForm(draft.form);
      }
    }
  }, []);
  const update = <K extends keyof CheckoutData>(key: K, value: CheckoutData[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (selected) saveCheckoutDraft({ planId: selected.id, form: next });
      return next;
    });
  };
  const choose = async (plan: HostingPlan) => {
    setSelected(plan);
    setMessage(""); setCompleted(false);
  };
  const submit = async () => {
    if (busy || completed || !versionsReady) return;
    setBusy(true);
    try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      if (selected) saveCheckoutDraft({ planId: selected.id, form });
      window.location.href = `/auth?next=${encodeURIComponent(`/planes?plan=${selected?.id || ""}`)}`;
      return;
    }
    setBusy(true); setMessage(paymentMode === "simulation" ? "Creando servidor de prueba..." : "Creando checkout seguro de Mercado Pago...");
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: selected?.id, serverName: form.serverName, type: form.type, version: form.version, paymentMethod: "mercadopago", customerData: { serverName: form.serverName, type: form.type, version: form.version }, addons: { dedicatedIp: form.dedicatedIp, extraStorageGb: Number(form.extraStorageGb) } }) });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      if (response.status === 401) {
        if (selected) saveCheckoutDraft({ planId: selected.id, form });
        window.location.href = `/auth?next=${encodeURIComponent(`/planes?plan=${selected?.id || ""}`)}`;
        return;
      }
      setMessage(data.error || "No se pudo completar la compra"); return;
    }
    if (data.simulated) {
      clearCheckoutDraft();
      setCompleted(true);
      setMessage("Compra simulada completada. Tu servidor ya está listo; no se realizó ningún cobro.");
      return;
    }
    if (typeof data.checkoutUrl === "string") {
      clearCheckoutDraft();
      window.location.href = data.checkoutUrl;
      return;
    }
    setMessage("Mercado Pago no devolvió un enlace de checkout.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error de conexión. Intenta nuevamente."); } finally { setBusy(false); }
  };
  return <main className="plans-shell"><header className="plans-header"><div><div className="brand">craft<span>panel</span></div><h1>Elige tu servidor</h1><p>Configura tu mundo. Elige el software, la versión y los recursos a tu medida.</p></div><div className="plans-header-actions"><button className="secondary-button" onClick={() => { window.location.href = "/auth"; }}>Iniciar sesión / registrarse</button><button className="secondary-button" onClick={() => { window.location.href = "/panel"; }}>Panel</button></div></header><section className="plan-grid">{hostingPlans.map((plan) => <article className={`plan-card ${selected?.id === plan.id ? "selected" : ""}`} key={plan.id}><span className="plan-kicker">{plan.name}</span><h2>${plan.price.toFixed(2)}<small>/mes</small></h2><p>{plan.description}</p><ul><li>{plan.ram} RAM</li><li>{plan.storageGb} GB SSD</li><li>{plan.cpu} cores dedicados</li></ul><button className="primary-button" onClick={() => void choose(plan)}>Configurar plan</button></article>)}</section>{selected && <div className="checkout-screen" role="dialog" aria-modal="true" aria-label="Configurar servidor"><section className="checkout-layout"><div className="checkout-topbar"><div className="brand">craft<span>panel</span></div><span><ShieldCheck size={14} /> {paymentMode === "simulation" ? "Modo de prueba · sin cobro" : "Checkout seguro"}</span><button className="close-button" aria-label="Cerrar configuración" disabled={busy} onClick={() => setSelected(null)}>×</button></div><div className="checkout-steps"><span className="checkout-step active">1 <b>Configurar</b></span><span className="checkout-line" /><span className="checkout-step active">2 <b>Cuenta</b></span><span className="checkout-line" /><span className="checkout-step active">3 <b>Confirmar</b></span></div><div className="checkout-columns"><div><div className="checkout-product"><div className="plan-product-icon"><Server size={22} /></div><div><strong>{selected.name}</strong><span>Configura tu servidor Minecraft Java</span></div></div><SoftwarePicker type={form.type} version={form.version} onType={value => update("type", value)} onVersion={value => update("version", value)} onReady={setVersionsReady} /><section className="checkout-section"><h3><b>1</b> Configura tu servidor</h3><div className="form-grid"><label>Nombre del servidor<input value={form.serverName} onChange={(event) => update("serverName", event.target.value)} placeholder="Mi Survival" /></label><label>Almacenamiento extra<select value={form.extraStorageGb} onChange={(event) => update("extraStorageGb", event.target.value)}><option value="0">Sin extra</option><option value="25">+25 GB</option><option value="50">+50 GB</option><option value="100">+100 GB</option></select></label><label className="checkbox-line"><input type="checkbox" checked={form.dedicatedIp} onChange={(event) => update("dedicatedIp", event.target.checked)} /> Añadir IP dedicada simulada</label></div></section>  <section className="checkout-section"><h3><b>2</b> Cuenta y pago</h3><p className="checkout-auth-note">Tu servidor se vinculará a tu cuenta al confirmar. Si falta iniciar sesión, podrás hacerlo sin perder tu configuración.</p><div className="payment-provider"><strong>Mercado Pago {paymentMode === "simulation" ? "· simulado" : ""}</strong><span>{paymentMode === "simulation" ? "Confirmar crea el servidor directamente. No necesitas tarjeta ni conectar Mercado Pago." : "Completa tu pago en el checkout seguro de Mercado Pago."}</span></div></section>{message && <p className="auth-message">{message}</p>}</div><aside className="checkout-summary"><h3>Resumen de compra</h3><div><span>{selected.name}</span><strong>${selected.price.toFixed(2)}</strong></div><div><span>RAM</span><span>{selected.ram}</span></div><div><span>Almacenamiento</span><span>{selected.storageGb + Number(form.extraStorageGb)} GB</span></div>  <div className="summary-total"><span>Total mensual</span><strong>${(selected.price + (Number(form.extraStorageGb) * 0.2) + (form.dedicatedIp ? 5 : 0)).toFixed(2)} MXN</strong></div><small><ShieldCheck size={14} /> {paymentMode === "simulation" ? "Simulación activa: no se realizará ningún cobro." : "Serás redirigido al checkout seguro de Mercado Pago."}</small><button className="primary-button checkout-confirm" onClick={() => void submit()} disabled={busy || completed || !versionsReady || !form.serverName.trim()}>{completed ? "Servidor creado ✓" : busy ? "Creando servidor..." : "Confirmar compra"}</button>{completed && <a className="secondary-button checkout-panel-link" href="/panel">Ir a mi servidor →</a>}</aside></div></section></div>}</main>;
}
