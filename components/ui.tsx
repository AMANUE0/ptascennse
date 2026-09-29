import type { LucideIcon } from "lucide-react";

// ==========================================
// TIPOS E INTERFACES
// ==========================================

// Exportamos untipo de dato para el estado del servidor, que puede ser "Online", "Detenido" o "Iniciando"
export type ServerStatus = "Online" | "Detenido" | "Iniciando";

// Exportamos interfaces para las props de los componentes UI, que incluyen el estado del servidor, iconos, etiquetas, valores y detalles
export interface StatusPillProps {
  status: ServerStatus;
}
//
export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: string;
}

export interface QuickInfoProps {
  icon: LucideIcon;
  title: string;
  value: string;
  detail: string;
  color: string;
}

// ==========================================
// COMPONENTES UI
// ==========================================

/**
 * Píldora que muestra el estado actual del servidor (Online, Detenido, Iniciando)
 */
export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`status-pill ${status.toLowerCase()}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

/**
 * Tarjeta de métricas con icono temático, valores descriptivos y barras de actividad
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={19} />
      </div>

      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-detail">{detail}</div>
      </div>

      <div className={`stat-spark ${tone}`}>
      </div>
    </div>
  );
}

/**
 * Bloque compacto de información rápida (TPS, memoria, conexiones, etc.)
 */
export function QuickInfo({
  icon: Icon,
  title,
  value,
  detail,
  color,
}: QuickInfoProps) {
  return (
    <div className="quick-info">
      <div className={`quick-icon ${color}`}>
        <Icon size={18} />
      </div>
      <div className="">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}