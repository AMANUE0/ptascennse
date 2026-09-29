"use client";

import {
  Box,
  Network,
  Users,
  MoreHorizontal,
  MemoryStick,
  Cpu,
  Play,
  Square,
  RefreshCw,
  Power,
} from "lucide-react";
import { StatusPill } from "@/components/ui";
import type { ServerRecord } from "@/lib/panel-types";
import Copy from "./Copy";

export default function ServerCard({
  server,
  onOpen,
  onAction,
  onLifecycle,
}: {
  server: ServerRecord;
  onOpen: () => void;
  onAction: (message: string) => void;
  onLifecycle: (action: "start" | "stop" | "restart" | "kill") => void;
}) {
  const starting = server.status === "Iniciando" || Boolean(server.pendingAction);
  const can = (permission: string) =>
    !server.isSubuser || server.permissions?.[permission] === true;

  return (
    <article className="server-card">
      <div className="server-card-top">
        <div className={`server-logo ${server.color}`}>
          {server.type === "Velocity" ? (
            <Network size={24} />
          ) : (
            <Box size={25} />
          )}
        </div>
        <div className="server-card-badges">
          {server.isSubuser && (
            <span className="subuser-badge">
              <Users size={12} /> Subusuario
            </span>
          )}
          <button className="more-button">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      <div className="server-title-row">
        <div>
          <h3>{server.name}</h3>
          <p>
            {server.type} <span>·</span> {server.version}
          </p>
        </div>
        {server.pendingAction ? <span className="selection-badge" role="status">{{ start: "Iniciando…", stop: "Deteniendo…", restart: "Reiniciando…", kill: "Finalizando…" }[server.pendingAction]}</span> : <StatusPill status={server.status} />}
      </div>

      <div className="server-address">
        <span className="address-indicator" />
        {server.address}:{server.port}
        <Copy size={14} onClick={() => onAction("IP copiada al portapapeles")} />
      </div>

      <div className="server-meta">
        <span>
          <MemoryStick size={14} /> {server.ram} RAM
        </span>
        <span>
          <Cpu size={14} /> 2 vCores
        </span>
      </div>

      <div className="card-divider" />

      <div className="server-actions server-lifecycle">
        <button className="manage-button" onClick={onOpen}>
          Administrar
        </button>

        {can("control.start") && (
          <button
            disabled={starting || server.status === "Online"}
            onClick={() => onLifecycle("start")}
            title="Iniciar"
          >
            <Play size={14} />
          </button>
        )}

        {can("control.stop") && (
          <button
            disabled={starting || server.status !== "Online"}
            onClick={() => onLifecycle("stop")}
            title="Detener"
          >
            <Square size={14} />
          </button>
        )}

        {can("control.restart") && (
          <button
            disabled={starting || server.status !== "Online"}
            onClick={() => onLifecycle("restart")}
            title="Reiniciar"
          >
            <RefreshCw size={14} />
          </button>
        )}

        {can("control.stop") && (
          <button
            disabled={starting || server.status === "Detenido"}
            onClick={() => onLifecycle("kill")}
            title="Kill"
          >
            <Power size={14} />
          </button>
        )}
      </div>
    </article>
  );
}
