"use client";
import { useState } from "react";
export default function UsersPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [permissions, setPermissions] = useState({ view: true, terminal: false, files: false, lifecycle: false });
  async function invite() {
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, permissions }) });
    const data = await response.json(); setMessage(response.ok ? "Invitación enviada por Supabase." : data.error);
  }
  return <main className="auth-shell"><section className="auth-card"><h1>Usuarios y permisos</h1><p>Invita colaboradores desde el correo administrador.</p><label>Correo del amigo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><fieldset><legend>Permisos iniciales</legend>{Object.entries(permissions).map(([key, value]) => <label key={key}><input type="checkbox" checked={value} onChange={(event) => setPermissions((current) => ({ ...current, [key]: event.target.checked }))} /> {key}</label>)}</fieldset><button className="primary-button" onClick={() => void invite()}>Enviar invitación</button>{message && <span className="auth-message">{message}</span>}</section></main>;
}
