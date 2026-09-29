"use client";

import { FormEvent, useEffect, useState } from "react";
import { LifeBuoy, RefreshCw, Search, Send, Server, ShoppingCart } from "lucide-react";

type Overview = { servers: { id: string; name: string; owner: string; email: string; status: string }[]; purchases: Record<string, unknown>[]; tickets: { id: string; subject: string; status: string; email: string }[] };

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  async function load() {
    const response = await fetch("/api/admin/overview");
    const result = await response.json();
    if (!response.ok) setNotice(result.error || "No se pudo cargar el panel");
    else setData(result);
  }
  useEffect(() => { void load(); }, []);
  async function reply(event: FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault(); if (!message.trim()) return; setBusy(true);
    const response = await fetch("/api/admin/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, body: message }) });
    const result = await response.json(); setNotice(result.error || "Respuesta enviada"); if (response.ok) { setMessage(""); await load(); } setBusy(false);
  }
  const visibleServers = data?.servers.filter((server) => `${server.email} ${server.name} ${server.owner}`.toLowerCase().includes(search.toLowerCase())) || [];
  return <main className="page-wrap"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-mark" /> ADMINISTRATION</div><h1>Panel administrativo</h1><p>Servidores, compras y soporte en un solo lugar.</p></div><button className="icon-button" onClick={() => void load()} title="Actualizar"><RefreshCw size={16} /></button></div>
    {notice && <p className="auth-message">{notice}</p>}<div className="stats-grid"><div className="stat-card"><Server size={20} /><div><div className="stat-label">Servidores activos</div><div className="stat-value">{data?.servers.filter((server) => server.status === "Online").length ?? "—"}</div></div></div><div className="stat-card"><ShoppingCart size={20} /><div><div className="stat-label">Compras recientes</div><div className="stat-value">{data?.purchases.length ?? "—"}</div></div></div><div className="stat-card"><LifeBuoy size={20} /><div><div className="stat-label">Tickets abiertos</div><div className="stat-value">{data?.tickets.filter((ticket) => ticket.status !== "closed").length ?? "—"}</div></div></div></div>
    <div className="support-layout"><section className="activity-list"><div className="panel-title"><div><h2>Servidores de clientes</h2><span>{visibleServers.length} resultado(s)</span></div><div className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Correo o servidor" /></div></div>{visibleServers.map((server) => <article className="activity-item" key={server.id}><div className="activity-icon"><Server size={15} /></div><div className="activity-copy"><strong>{server.email} · {server.name}</strong><span>{server.owner}</span></div><span className="ticket-status">{server.status}</span></article>)}</section><section className="activity-list"><div className="panel-title"><h2>Tickets</h2></div>{data?.tickets.map((ticket) => <article className="activity-item" key={ticket.id}><div className="activity-icon"><LifeBuoy size={15} /></div><div className="activity-copy"><strong>{ticket.subject}</strong><span>{ticket.email} · {ticket.status}</span><form onSubmit={(event) => void reply(event, ticket.id)}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Responder ticket" /><button className="secondary-button" disabled={busy}><Send size={13} /> Responder</button></form></div></article>)}</section></div></main>;
}
