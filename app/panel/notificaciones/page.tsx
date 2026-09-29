"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Server } from "lucide-react";

type Notification = { id: string; title: string; body: string; type: string; metadata: { server_id?: string }; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [notice, setNotice] = useState("");
  async function load() {
    const response = await fetch("/api/notifications");
    const data = await response.json() as { notifications?: Notification[]; error?: string };
    if (!response.ok) setNotice(data.error || "No se pudieron cargar las notificaciones");
    else setItems(data.notifications || []);
  }
  useEffect(() => { void load(); }, []);
  async function mark(item: Notification) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
  }
  return <main className="page-wrap"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-mark" /> NOTIFICATIONS</div><h1>Notificaciones</h1><p>Compras, accesos y novedades de tus servidores.</p></div><a className="secondary-button" href="/panel">Volver al panel</a></div>{notice && <p className="auth-message">{notice}</p>}<section className="activity-list notification-list">{items.map((item) => <button className={`notification-item ${item.read_at ? "read" : ""}`} key={item.id} onClick={() => { void mark(item); if (item.metadata.server_id) window.location.href = `/panel?server=${encodeURIComponent(item.metadata.server_id)}`; }}><div className="activity-icon">{item.type === "server_access" ? <Server size={16} /> : <Bell size={16} />}</div><div className="activity-copy"><strong>{item.title}</strong><span>{item.body}</span><time>{new Date(item.created_at).toLocaleString()}</time></div>{item.read_at && <Check size={15} />}</button>)}{!items.length && <div className="empty-state">No tienes notificaciones nuevas.</div>}</section></main>;
}
