"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, LifeBuoy, Plus, RefreshCw } from "lucide-react";

type Ticket = { id: string; subject: string; department: string; priority: string; status: string; created_at: string; updated_at: string };

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [department, setDepartment] = useState("support");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/tickets");
    const data = await response.json() as { tickets?: Ticket[]; error?: string };
    if (!response.ok) setNotice(data.error || "No se pudieron cargar tus tickets");
    else setTickets(data.tickets || []);
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, message, department, priority }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setNotice(data.error || "No se pudo crear el ticket");
    else { setSubject(""); setMessage(""); setNotice("Ticket creado. Te responderemos desde esta sección."); await load(); }
    setBusy(false);
  }

  return <main className="page-wrap"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-mark" /> SUPPORT CENTER</div><h1>Soporte</h1><p>Abre y consulta solicitudes relacionadas con tus servicios.</p></div><div className="toolbar"><a className="secondary-button" href="/panel"><ArrowLeft size={15} /> Panel</a><button className="icon-button" onClick={() => void load()} title="Actualizar"><RefreshCw size={16} /></button></div></div><div className="support-layout"><form className="config-panel support-form" onSubmit={submit}><div className="panel-title"><div><h2><LifeBuoy size={18} /> Nuevo ticket</h2><span>El equipo podrá consultar el servidor y la orden relacionados.</span></div></div><div className="form-grid"><label>Asunto<input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} required /></label><label>Departamento<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="support">Soporte técnico</option><option value="billing">Facturación</option><option value="sales">Ventas</option></select></label><label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label className="full">Mensaje<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} required /></label></div><button className="primary-button" disabled={busy}><Plus size={15} /> {busy ? "Enviando..." : "Crear ticket"}</button>{notice && <p className="auth-message">{notice}</p>}</form><section className="activity-list support-list"><div className="panel-title"><div><h2>Tus tickets</h2><span>Historial de solicitudes</span></div></div>{tickets.map((ticket) => <article className="activity-item" key={ticket.id}><div className="activity-icon"><LifeBuoy size={15} /></div><div className="activity-copy"><strong>{ticket.subject}</strong><span>{ticket.department} · prioridad {ticket.priority}</span></div><span className={`ticket-status ${ticket.status}`}>{ticket.status}</span></article>)}{!tickets.length && <div className="empty-state">Todavía no tienes tickets.</div>}</section></div></main>;
}
