"use client";

import { useEffect, useState } from "react";
import { Check, Globe2, LogIn, LogOut, MapPin, ShieldCheck, Server, Zap } from "lucide-react";
import { hostingPlans } from "@/lib/plans";
import { supabase } from "@/lib/supabase";

export default function LandingPage() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <main className="landing-shell">
      <header className="landing-header">
        <a className="brand" href="/">
          <span className="brand-icon" >
            <Zap size={17} fill="currentColor" />
          </span>
          craft<span>panel</span>
        </a>

        <nav className="landing-nav">
          <a href="#planes">Planes</a>
          <a href="#ventajas">Ventajas</a>
          <a href="#ubicacion">Ubicación</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="landing-actions">
          {email ? (
            <>
              <span className="session-email">{email}</span>
              <button
                className="secondary-button"
                onClick={() => {
                  window.location.href = "/panel";
                }}
              >
                Panel
              </button>
              <button
                className="header-icon-button"
                title="Cerrar sesión"
                onClick={() => void signOut()}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              onClick={() => {
                window.location.href = "/auth?next=/panel";
              }}
            >
              <LogIn size={15} /> Iniciar sesión
            </button>
          )}
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-mark" /> HOSTING MINECRAFT JAVA
          </div>
          <h1>
            Tu servidor.<br />
            <span>Tu mundo.</span><br />
            Sin límites.
          </h1>
          <p>
            Servidores Minecraft Java rápidos y personalizables, administrados desde un panel moderno y ejecutados con los recursos reales de tu infraestructura.
          </p>
          <div className="landing-hero-actions">
            <a className="primary-button" href="#planes">
              Ver planes <Zap size={15} />
            </a>
            <a className="secondary-button" href="#ventajas">
              Conocer más
            </a>
          </div>
          <div className="landing-trust">
            <span>
              <ShieldCheck size={15} /> Sin contratos
            </span>
            <span>
              <Zap size={15} /> Activación rápida
            </span>
            <span>
              <Server size={15} /> Java Edition
            </span>
          </div>
        </div>

        <div className="landing-visual">
          <div className="visual-glow" />
          <div className="server-orbit orbit-one" />
          <div className="server-orbit orbit-two" />
          <div className="landing-server-card">
            <div className="server-logo">
              <Globe2 size={25} />
            </div>
            <strong>craftpanel node</strong>
            <span>
              <i className="live-dot" /> Operativo
            </span>
            <div className="visual-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <small>Rendimiento en tiempo real</small>
          </div>
        </div>
      </section>

      <section id="ventajas" className="landing-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">POR QUÉ CRAFTPANEL</div>
            <h2>Hecho para jugar, no para complicarte.</h2>
          </div>
          <p>Todo lo que necesitas para administrar un servidor, sin interfaces confusas.</p>
        </div>

        <div className="benefit-grid">
          <article>
            <Zap size={20} />
            <h3>Recursos transparentes</h3>
            <p>Conoce exactamente la RAM, CPU y almacenamiento asignados a cada servidor.</p>
          </article>
          <article>
            <ShieldCheck size={20} />
            <h3>Tu cuenta, tus servidores</h3>
            <p>Cada compra y cada servidor están vinculados a tu usuario de forma privada.</p>
          </article>
          <article>
            <Globe2 size={20} />
            <h3>Control total</h3>
            <p>Terminal, archivos, plugins, backups, configuraciones y Network desde un solo panel.</p>
          </article>
          <article className="benefit-limit">
            <Server size={20} />
            <h3>Lo que debes considerar</h3>
            <p>La ejecución local depende de que tu computadora y tu conexión permanezcan encendidas y disponibles.</p>
          </article>
        </div>
      </section>

      <section id="ubicacion" className="landing-location landing-section">
        <div>
          <div className="eyebrow">INFRAESTRUCTURA</div>
          <h2>Hosteado en Canadá</h2>
          <p>
            Una ubicación estable para mantener tu comunidad conectada. La región se muestra de forma transparente antes de contratar.
          </p>
          <ul>
            <li>
              <Check size={15} /> Baja latencia para Norteamérica
            </li>
            <li>
              <Check size={15} /> Red monitorizada 24/7
            </li>
            <li>
              <Check size={15} /> Protección y copias configurables
            </li>
          </ul>
        </div>

        <div className="canada-map">
          <div className="map-grid" />
          <div className="map-shape">CANADA</div>
          <span className="map-pin">
            <MapPin size={22} /> Toronto
          </span>
        </div>
      </section>

      <section id="planes" className="landing-section plans-preview">
        <div className="section-heading">
          <div>
            <div className="eyebrow">PRECIOS SIMPLES</div>
            <h2>Empieza con el plan que necesitas.</h2>
          </div>
          <a className="secondary-button" href="/planes">
            Ver todos los detalles
          </a>
        </div>

        <div className="plan-grid">
          {hostingPlans.map((plan) => (
            <article className="plan-card" key={plan.id}>
              <span className="plan-kicker">{plan.name}</span>
              <h3>{plan.description}</h3>
              <h2>
                ${plan.price.toFixed(2)}
                <small>/mes</small>
              </h2>
              <ul>
                <li>{plan.ram} RAM</li>
                <li>{plan.storageGb} GB SSD</li>
                <li>{plan.cpu} cores</li>
              </ul>
              <a className="primary-button" href={`/planes?plan=${plan.id}`}>
                Elegir plan
              </a>
            </article>
          ))}
        </div>
      </section>

      <footer id="faq" className="landing-footer">
        <div className="brand">
          craft<span>panel</span>
        </div>
        <span>Hosting Minecraft Java · Canadá</span>
        <span>© 2026 CraftPanel</span>
      </footer>
    </main>
  );
}