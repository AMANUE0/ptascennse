"use client";

import { useEffect, useState } from "react";
import { Zap, Users, CircleHelp, LogOut, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Topbar() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void fetch("/api/session")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { isAdmin?: boolean };
        setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => undefined);
  }, []);

  return (
    <nav className="topbar">
      <a className="brand" href="/panel">
        <div className="brand-icon">
          <Zap size={19} fill="currentColor" />
        </div>
        <span>
          craft<span>panel</span>
        </span>
      </a>

      <div className="topnav-links">
        <span className="topnav-active">Workspace</span>
        <a href="/panel/soporte">Soporte</a>
        <a href="/panel/notificaciones">Notificaciones</a>
        {isAdmin && <a href="/admin">Administración</a>}
        <span>
          Estado del servicio <i className="live-dot" />
        </span>
      </div>

      <div className="top-actions">
        <button
          className="help-button"
          title="Usuarios y permisos"
          onClick={() => {
            window.location.href = "/usuarios";
          }}
        >
          <Users size={18} />
        </button>

        <button
          className="help-button"
          title="Soporte"
          onClick={() => {
            window.location.href = "/panel/soporte";
          }}
        >
          <CircleHelp size={18} />
        </button>

        <div className="avatar">AG</div>

        <button
          className="help-button"
          title="Cerrar sesión"
          onClick={() =>
            void supabase.auth.signOut().then(() => {
              window.location.href = "/";
            })
          }
        >
          <LogOut size={16} />
        </button>

        <ChevronDown size={15} className="chevron" />
      </div>
    </nav>
  );
}
