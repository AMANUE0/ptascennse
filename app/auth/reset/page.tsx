"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
      if (event === "SIGNED_OUT") setReady(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const result = await supabase.auth.updateUser({ password });
      if (result.error) setError(result.error.message);
      else { setPassword(""); setConfirmation(""); setMessage("Contraseña actualizada. Ya puedes entrar al panel."); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell"><form className="auth-card" onSubmit={submit} aria-busy={busy}><a className="brand" href="/">craft<span>panel</span></a><h1>Nueva contraseña</h1><p>{loading ? "Validando el enlace seguro..." : ready ? "Define una nueva contraseña para tu cuenta." : "Este enlace es inválido o ha caducado. Solicita uno nuevo desde iniciar sesión."}</p><label>Nueva contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required disabled={!ready || busy} /></label><label>Confirmar contraseña<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} required disabled={!ready || busy} /></label><button className="primary-button" disabled={!ready || loading || busy}>{busy ? "Actualizando..." : "Actualizar contraseña"}</button>{!ready && !loading && <a className="text-button" href="/auth">Solicitar otro enlace</a>}{error && <span className="auth-message error" role="alert">{error}</span>}{message && <span className="auth-message" role="status">{message} <a href="/auth">Iniciar sesión</a></span>}</form></main>;
}
