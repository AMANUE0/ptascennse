"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "register" | "recover";

function AuthContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState({ fullName: "", phone: "", country: "", company: "" });
  const next = useMemo(() => {
    const requested = searchParams.get("next");
    return requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/panel";
  }, [searchParams]);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "recover") {
        const redirectTo = `${window.location.origin}/auth/reset`;
        const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (result.error) throw result.error;
        setMessage("Te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.");
        return;
      }
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl, data: profile },
        });
      if (result.error) throw result.error;
      if (mode === "login" || result.data.session) {
        window.location.assign(next);
        return;
      }
      setMessage("Cuenta creada. Confirma tu correo para activar el acceso.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit} aria-busy={busy}>
        <a className="brand" href="/">craft<span>panel</span></a>
        <h1>{mode === "login" ? "Iniciar sesión" : mode === "register" ? "Crear cuenta" : "Recuperar contraseña"}</h1>
        <p>{mode === "login" ? "Accede a tu panel de hosting." : mode === "register" ? "Crea tu cuenta para comprar y administrar servidores." : "Te enviaremos un enlace seguro para cambiarla."}</p>
        {!configured && <span className="auth-message">Configura las variables de Supabase en .env.local antes de iniciar sesión.</span>}
        {mode === "register" && <>
          <label>Nombre completo<input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required /></label>
          <label>Teléfono<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} required /></label>
          <label>País<input value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} required /></label>
          <label>Empresa o proyecto <span>(opcional)</span><input value={profile.company} onChange={(event) => setProfile({ ...profile, company: event.target.value })} /></label>
        </>}
        <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        {mode !== "recover" && <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>}
        <button className="primary-button" type="submit" disabled={busy || !configured}>{busy ? "Procesando..." : mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : "Enviar enlace"}</button>
        {mode === "login" && <button className="text-button" type="button" onClick={() => changeMode("recover")}>¿Olvidaste tu contraseña?</button>}
        <button className="text-button" type="button" onClick={() => changeMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Volver a iniciar sesión" : "Crear cuenta nueva"}</button>
        {mode === "recover" && <button className="text-button" type="button" onClick={() => changeMode("login")}>Volver a iniciar sesión</button>}
        {error && <span className="auth-message error" role="alert">{error}</span>}
        {message && <span className="auth-message" role="status">{message}</span>}
      </form>
    </main>
  );
}

export default function AuthPage() {
  return <Suspense fallback={<main className="auth-shell"><div className="auth-card"><p>Cargando autenticación...</p></div></main>}><AuthContent /></Suspense>;
}
