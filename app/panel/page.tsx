"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  BarChart3,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  CirclePlay,
  Cloud,
  Code2,
  Copy as CopyIcon,
  Cpu,
  Download,
  Ellipsis,
  File,
  FileArchive,
  FileCode2,
  Folder,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  Loader2,
  LogOut,
  MemoryStick,
  MoreHorizontal,
  Network,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";

import { QuickInfo, ServerStatus, StatCard, StatusPill } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { minecraftLine } from "@/lib/minecraft-console";
import type { ServerRecord } from "@/lib/panel-types";
import { canPanelPermission } from "@/lib/panel-access";

// ==========================================
// CONFIGURACIÓN Y CONSTANTES
// ==========================================

const CodeEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

const initialServers: ServerRecord[] = [];

const navItems = [
  { label: "Terminal", icon: Terminal },
  { label: "Archivos", icon: FolderOpen },
  { label: "Configuración", icon: Settings2 },
  { label: "Plugins", icon: Box },
  { label: "Jugadores", icon: Users },
  { label: "Backups", icon: Archive },
  { label: "Subusuarios", icon: Users },
  { label: "Network", icon: Network },
];

const fileRows = [
  { name: "plugins", type: "folder", size: "—", date: "Hoy, 10:42" },
  { name: "world", type: "folder", size: "1.24 GB", date: "Hoy, 10:40" },
  { name: "banned-ips.json", type: "json", size: "1.2 KB", date: "Ayer, 23:18" },
  { name: "eula.txt", type: "txt", size: "82 B", date: "Ayer, 23:18" },
  { name: "server.properties", type: "properties", size: "4.8 KB", date: "Ayer, 23:18" },
  { name: "spigot.yml", type: "yml", size: "8.6 KB", date: "Ayer, 23:18" },
  { name: "paper-global.yml", type: "yml", size: "12.4 KB", date: "Ayer, 23:18" },
];

// ==========================================
// COMPONENTE AUXILIAR COPY
// ==========================================

function Copy({ onClick, ...props }: ComponentProps<typeof CopyIcon>) {
  const copy = async (
    event: Parameters<NonNullable<ComponentProps<typeof CopyIcon>["onClick"]>>[0]
  ) => {
    const parent = event.currentTarget.parentElement;
    const spans = parent
      ? Array.from(parent.querySelectorAll("span"))
          .map((span) => span.textContent?.trim())
          .filter(Boolean)
      : [];

    const value = spans.at(-1) || parent?.textContent?.replace("⧉", "").trim();

    if (value && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    }

    onClick?.(event);
  };

  return <CopyIcon {...props} role="button" tabIndex={0} onClick={copy} />;
}

// ==========================================
// COMPONENTE PRINCIPAL (HOME)
// ==========================================

export default function Home() {
  const [servers, setServers] = useState(initialServers);
  const [selected, setSelected] = useState<ServerRecord | null>(null);
  const [activeNav, setActiveNav] = useState("Terminal");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServerStatus | "Todos">("Todos");
  const [requestedServerId, setRequestedServerId] = useState<string | null>(null);
  const [consoleLine, setConsoleLine] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"start" | "stop" | "restart" | "kill" | null>(null);

  const [system, setSystem] = useState<{
    activeServers: number;
    cpuUsage: number;
    cpuCount: number;
    memory: { used: number; total: number };
    storage: { used: number; total: number };
  } | null>(null);

  // Filtrado de servidores
  const visibleServers = useMemo(() => {
    return servers.filter(
      (server) =>
        server.name.toLowerCase().includes(search.toLowerCase()) &&
        (statusFilter === "Todos" || server.status === statusFilter)
    );
  }, [servers, search, statusFilter]);

  // Leer server ID de los query params
  useEffect(() => {
    setRequestedServerId(new URLSearchParams(window.location.search).get("server"));
  }, []);

  // Cargar servidores y notificaciones iniciales
  useEffect(() => {
    fetch("/api/servers")
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar los servidores");
        return response.json();
      })
      .then((data: { servers: ServerRecord[] }) => {
        setServers(
          data.servers.map((server) => ({
            ...server,
            color: server.color || "blue",
          }))
        );
      })
      .catch(() => notify("No se pudo conectar con el gestor local"))
      .finally(() => setLoading(false));

    void fetch("/api/notifications")
      .then((response) => response.json())
      .then(
        (data: {
          notifications?: {
            title: string;
            body: string;
            read_at: string | null;
            metadata?: { server_id?: string };
          }[];
        }) => {
          const unread = data.notifications?.find((n) => !n.read_at);
          if (unread) notify(`${unread.title}: ${unread.body}`);
        }
      )
      .catch(() => undefined);
  }, []);

  // Seleccionar servidor solicitado por query param si existe
  useEffect(() => {
    if (!requestedServerId || loading) return;
    const target = servers.find((server) => server.id === requestedServerId);
    if (target) setSelected(target);
  }, [loading, requestedServerId, servers]);

  // Métrica del sistema en bucle cada 5 segundos
  useEffect(() => {
    const refresh = () =>
      void fetch("/api/system/metrics")
        .then((response) => response.json())
        .then(setSystem)
        .catch(() => undefined);

    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function updateStatus(status: ServerStatus) {
    if (!selected) return;

    const action = status === "Online" ? "start" : "stop";
    setPendingAction(action);

    try {
      notify(
        action === "start"
          ? "Preparando y arrancando el servidor..."
          : "Apagando servidor..."
      );

      const response = await fetch(`/api/servers/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (!response.ok) {
        notify(data.error || "No se pudo ejecutar la acción");
        return;
      }

      let updated = { ...selected, ...data.server };
      setSelected(updated);
      setServers((items) =>
        items.map((item) => (item.id === selected.id ? updated : item))
      );

      if (action === "start") {
        let metrics: { server?: ServerRecord; recentOutput?: string[] } = {};

        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          const statusResponse = await fetch(`/api/servers/${selected.id}/metrics`);
          metrics = (await statusResponse.json()) as {
            server?: ServerRecord;
            recentOutput?: string[];
          };

          if (metrics.server?.status === "Online") break;
          if (metrics.server?.status === "Detenido") break;
        }

        if (metrics.server) {
          updated = { ...updated, ...metrics.server };
          setSelected(updated);
          setServers((items) =>
            items.map((item) => (item.id === selected.id ? updated : item))
          );
        }

        if (updated.status === "Detenido") {
          notify(
            metrics.recentOutput?.at(-1) ||
              "El proceso terminó. Revisa server.log y la versión de Java."
          );
        } else if (updated.status === "Online") {
          notify("Servidor iniciado correctamente y listo para usar");
        } else {
          notify(
            "El servidor sigue iniciando; la consola continuará actualizando su estado."
          );
        }
      } else {
        notify("Servidor apagado correctamente");
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo conectar con el gestor local"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function runAction(action: "restart" | "kill") {
    if (!selected?.id) return;
    setPendingAction(action);

    try {
      const response = await fetch(`/api/servers/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (!response.ok) {
        notify(data.error || "No se pudo ejecutar la acción");
        return;
      }

      const updated = { ...selected, ...data.server };
      setSelected(updated);
      setServers((items) =>
        items.map((item) => (item.id === selected.id ? updated : item))
      );
      notify(action === "kill" ? "Proceso terminado" : "Servidor reiniciado");
    } finally {
      setPendingAction(null);
    }
  }

  async function runWorkspaceAction(
    server: ServerRecord,
    action: "start" | "stop" | "restart" | "kill"
  ) {
    if (!server.id) return;

    if (action === "start") {
      const response = await fetch(`/api/servers/${server.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (!response.ok) {
        notify(data.error || "No se pudo iniciar el servidor");
        return;
      }

      setServers((items) =>
        items.map((item) => (item.id === server.id ? { ...item, ...data.server } : item))
      );
      notify("Servidor iniciando...");

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const statusResponse = await fetch(`/api/servers/${server.id}/metrics`);
        const metrics = (await statusResponse.json()) as { server?: ServerRecord };

        if (!metrics.server) break;
        setServers((items) =>
          items.map((item) =>
            item.id === server.id ? { ...item, ...metrics.server } : item
          )
        );

        if (metrics.server.status !== "Iniciando") break;
      }
      return;
    }

    const response = await fetch(`/api/servers/${server.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    const data = await response.json();
    if (!response.ok) {
      notify(data.error || "No se pudo ejecutar la acción");
      return;
    }

    setServers((items) =>
      items.map((item) => (item.id === server.id ? { ...item, ...data.server } : item))
    );
    notify(
      action === "stop"
        ? "Servidor detenido"
        : action === "restart"
        ? "Servidor reiniciando"
        : "Proceso finalizado"
    );
  }

  // Si hay un servidor seleccionado, mostramos la vista de gestión
  if (selected) {
    return (
      <ServerManager
        server={selected}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        onBack={() => setSelected(null)}
        onDeleted={() => {
          setServers((items) => items.filter((item) => item.id !== selected.id));
          setSelected(null);
        }}
        onStatus={updateStatus}
        onAction={runAction}
        pendingAction={pendingAction}
        consoleLine={consoleLine}
        setConsoleLine={setConsoleLine}
        notify={notify}
      />
    );
  }

  return (
    <main className="app-shell">
      <Topbar />

      <div className="page-wrap">
        <header className="hero-row">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-mark" /> WORKSPACE / SERVERS
            </div>
            <h1>Mis servidores</h1>
            <p>Administra tus mundos desde un solo lugar.</p>
          </div>
        </header>

        {system && (
          <section className="stats-grid" aria-label="Métricas del sistema">
            <StatCard
              icon={Activity}
              label="Servidores activos"
              value={`${system.activeServers}`}
              detail="Online o iniciando"
              tone="green"
            />
            <StatCard
              icon={Cpu}
              label="CPU del equipo"
              value={`${system.cpuUsage}%`}
              detail={`${system.cpuCount} núcleos disponibles`}
              tone="purple"
            />
            <StatCard
              icon={MemoryStick}
              label="Memoria usada"
              value={`${Math.round((system.memory.used / 1024 / 1024 / 1024) * 10) / 10} GB`}
              detail={`de ${Math.round((system.memory.total / 1024 / 1024 / 1024) * 10) / 10} GB`}
              tone="orange"
            />
            <StatCard
              icon={HardDrive}
              label="Almacenamiento"
              value={`${Math.round((system.storage.used / 1024 / 1024 / 1024) * 10) / 10} GB`}
              detail={`de ${Math.round((system.storage.total / 1024 / 1024 / 1024) * 10) / 10} GB`}
              tone="blue"
            />
          </section>
        )}

        <div className="server-filters">
          <label>
            Estado
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ServerStatus | "Todos")
              }
            >
              <option>Todos</option>
              <option>Online</option>
              <option>Iniciando</option>
              <option>Detenido</option>
            </select>
          </label>
        </div>

        <div className="section-heading">
          <div>
            <h2>
              Todos los servidores{" "}
              <span className="count-badge">{servers.length}</span>
            </h2>
            <p>Tus instancias de Minecraft Java</p>
          </div>
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar servidor..."
              />
            </div>
            <button className="icon-button">
              <Ellipsis size={19} />
            </button>
          </div>
        </div>

        <section className="server-grid">
          {loading ? (
            <div className="loading-card">
              <Loader2 className="spin" size={22} /> Cargando servidores locales...
            </div>
          ) : (
            visibleServers.map((server) => (
              <ServerCard
                key={server.id || server.name}
                server={server}
                onOpen={() => setSelected(server)}
                onAction={(message) => notify(message)}
                onLifecycle={(action) => void runWorkspaceAction(server, action)}
              />
            ))
          )}

          <a
            className="add-card add-server-card"
            href="/planes"
            aria-label="Agregar servidor"
          >
            <span className="add-circle">
              <Plus />
            </span>
          </a>
        </section>

        <PaymentActivity />
      </div>

      {toast && (
        <div className="toast">
          <Check size={17} /> {toast}
        </div>
      )}
    </main>
  );
}

// ==========================================
// TOPBAR
// ==========================================

function Topbar() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(
        data.user?.app_metadata?.role === "admin" ||
          data.user?.email?.toLowerCase() === "000balderas@gmail.com"
      );
    });
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

// ==========================================
// ACTIVIDAD DE PAGOS
// ==========================================

function PaymentActivity() {
  const [orders, setOrders] = useState<
    {
      id: string;
      plan_name: string;
      payment_status: string;
      provisioning_status: string;
      created_at: string;
    }[]
  >([]);

  useEffect(() => {
    void fetch("/api/orders")
      .then((response) => response.json())
      .then((data: { orders?: typeof orders }) => setOrders(data.orders || []))
      .catch(() => undefined);
  }, []);

  const latest = orders[0];

  return (
    <section className="activity-panel">
      <div className="section-heading compact">
        <div>
          <h2>Última transacción</h2>
          <p>Actividad reciente de pagos</p>
        </div>
        <a className="text-button" href="/planes/resultado?status=pending">
          Ver pedidos <ArrowLeft size={15} className="rotate-180" />
        </a>
      </div>

      <div className="activity-list">
        {latest ? (
          <ActivityItem
            icon={latest.payment_status === "paid" ? Check : RefreshCw}
            color={latest.payment_status === "paid" ? "green" : "orange"}
            title={`${latest.plan_name} · ${latest.payment_status}`}
            description={`Provisionamiento: ${latest.provisioning_status}`}
            time={new Date(latest.created_at).toLocaleString()}
          />
        ) : (
          <div className="empty-state">Todavía no hay transacciones.</div>
        )}
      </div>
    </section>
  );
}

// ==========================================
// TARJETA DE SERVIDOR (SERVER CARD)
// ==========================================

function ServerCard({
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
  const starting = server.status === "Iniciando";
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
        <StatusPill status={server.status} />
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
            disabled={server.status === "Detenido"}
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

// ==========================================
// ITEM DE ACTIVIDAD
// ==========================================

function ActivityItem({
  icon: Icon,
  color,
  title,
  description,
  time,
}: {
  icon: typeof Check;
  color: string;
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="activity-item">
      <div className={`activity-icon ${color}`}>
        <Icon size={16} />
      </div>
      <div className="activity-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}

// ==========================================
// GESTOR DE SERVIDOR (SERVER MANAGER)
// ==========================================

function ServerManager({
  server,
  activeNav,
  setActiveNav,
  onBack,
  onDeleted,
  onStatus,
  onAction,
  pendingAction,
  consoleLine,
  setConsoleLine,
  notify,
}: {
  server: ServerRecord;
  activeNav: string;
  setActiveNav: (v: string) => void;
  onBack: () => void;
  onDeleted: () => void;
  onStatus: (v: ServerStatus) => void;
  onAction: (v: "restart" | "kill") => void;
  pendingAction: "start" | "stop" | "restart" | "kill" | null;
  consoleLine: string;
  setConsoleLine: (v: string) => void;
  notify: (v: string) => void;
}) {
  const isFiles = activeNav === "Archivos";
  const busy = Boolean(pendingAction);

  const actionLabel = (
    action: "start" | "stop" | "restart" | "kill",
    label: string
  ) =>
    pendingAction === action ? (
      <>
        <Loader2 size={15} className="spin" />{" "}
        {action === "start"
          ? "Iniciando"
          : action === "stop"
          ? "Deteniendo"
          : action === "restart"
          ? "Reiniciando"
          : "Finalizando"}
      </>
    ) : (
      label
    );

  const [filesPath, setFilesPath] = useState("");
  const isProxy = server.type.toLowerCase() === "velocity";
  const can = (permission: string) =>
    !server.isSubuser || server.permissions?.[permission] === true;

  useEffect(() => {
    if (server.id) {
      window.sessionStorage.setItem("craftpanel:selected-server-id", server.id);
      window.sessionStorage.setItem("craftpanel:selected-server-access", JSON.stringify({ isSubuser: server.isSubuser, permissions: server.permissions }));
    }
  }, [server.id, server.isSubuser, server.permissions]);

  const visibleNavItems = navItems.filter((item) => {
    if (item.label === "Network") return isProxy && can("allocation.read");
    if (item.label === "Subusuarios")
      return (
        can("user.read") ||
        can("user.create") ||
        can("user.update") ||
        can("user.delete")
      );
    if (item.label === "Terminal") return can("control.console");
    if (item.label === "Archivos" || item.label === "Plugins")
      return can("files.list") || can("files.read") || can("files.create");
    if (item.label === "Configuración")
      return can("files.read") || can("files.update");
    if (item.label === "Jugadores") return can("server.read");
    if (item.label === "Backups")
      return (
        can("backup.read") || can("backup.create") || can("backup.download")
      );
    return true;
  });

  return (
    <main className="manager-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Zap size={18} fill="currentColor" />
          </div>
          <span>
            craft<span>panel</span>
          </span>
        </div>

        <button className="back-workspace" onClick={onBack}>
          <ArrowLeft size={16} /> Workspace
        </button>

        <div className="side-server">
          <div className={`mini-logo ${server.color || "blue"}`}>
            <Box size={18} />
          </div>
          <div>
            <strong>{server.name}</strong>
            <span>
              <i className="live-dot" /> {server.status}
            </span>
          </div>
        </div>

        <div className="side-label">GESTIONAR</div>

        <div className="side-nav">
          {visibleNavItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={activeNav === label ? "active" : ""}
              onClick={() => setActiveNav(label)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <a className="back-workspace" href="/panel/soporte">
            <CircleHelp size={17} /> Ayuda y soporte
          </a>
          <div className="user-row">
            <div className="avatar">PC</div>
            <div>
              <strong>
                {server.isSubuser ? "Subusuario" : "Servidor local"}
              </strong>
              <span>
                {server.isSubuser ? "Acceso compartido" : "Este equipo"}
              </span>
            </div>
            <MoreHorizontal size={17} />
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <section className="manager-content">
        <header className="manager-topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span>/</span>
            <strong>{server.name}</strong>
          </div>
          <div className="manager-actions">
            <div className="avatar">PC</div>
          </div>
        </header>

        <div className="manager-inner">
          <div className="manager-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-mark" /> SERVIDOR /{" "}
                {server.type.toUpperCase()}
              </div>
              <h1>{server.name}</h1>
              <div className="manager-sub">
                <StatusPill status={server.status} />
                <span>
                  {server.address}:{server.port}
                </span>
                <Copy size={14} onClick={() => notify("IP copiada")} />
              </div>
            </div>

            <div className="lifecycle">
              {can("control.start") && (
                <button
                  className={`action-start ${
                    pendingAction === "start" ? "action-pending" : ""
                  }`}
                  disabled={busy || server.status === "Online"}
                  onClick={() => onStatus("Online")}
                >
                  {actionLabel("start", "Iniciar")}
                </button>
              )}

              {can("control.stop") && (
                <button
                  className={pendingAction === "stop" ? "action-pending" : ""}
                  disabled={busy || server.status !== "Online"}
                  onClick={() => onStatus("Detenido")}
                >
                  {actionLabel("stop", "Detener")}
                </button>
              )}

              {can("control.restart") && (
                <button
                  className={pendingAction === "restart" ? "action-pending" : ""}
                  disabled={busy || server.status !== "Online"}
                  onClick={() => onAction("restart")}
                >
                  {actionLabel("restart", "Reiniciar")}
                </button>
              )}

              {can("control.stop") && (
                <button
                  className={`kill ${
                    pendingAction === "kill" ? "action-pending" : ""
                  }`}
                  disabled={
                    pendingAction === "stop" ||
                    pendingAction === "restart" ||
                    server.status === "Detenido"
                  }
                  onClick={() => onAction("kill")}
                >
                  {actionLabel("kill", "Kill")}
                </button>
              )}
            </div>
          </div>

          {/* Vistas según pestaña activa */}
          {activeNav === "Terminal" && (
            <TerminalView
              serverId={server.id}
              consoleLine={consoleLine}
              setConsoleLine={setConsoleLine}
            />
          )}

          {isFiles && (
            <FilesView
              serverId={server.id}
              notify={notify}
              initialPath={filesPath}
            />
          )}

          {activeNav === "Plugins" && (
            <PluginsView
              serverId={server.id}
              serverType={server.type}
              serverVersion={server.version}
              notify={notify}
              onOpenFolder={() => {
                setFilesPath(isProxy ? "plugins" : "mods");
                setActiveNav("Archivos");
              }}
            />
          )}

          {activeNav === "Jugadores" && <PlayersView serverId={server.id} />}

          {activeNav === "Configuración" && (
            <ConfigView
              server={server}
              notify={notify}
              onDeleted={onDeleted}
            />
          )}

          {activeNav === "Network" && <NetworkView notify={notify} />}

          {activeNav === "Backups" && (
            <PlaceholderView title="Backups" notify={notify} />
          )}

          {activeNav === "Subusuarios" && (
            <SubusersView serverId={server.id} notify={notify} />
          )}
        </div>
      </section>
    </main>
  );
}

// ==========================================
// VISTA: SUBUSUARIOS
// ==========================================

function SubusersView({
  serverId,
  notify,
}: {
  serverId?: string;
  notify: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<
    {
      user_id: string;
      email?: string;
      permissions: Record<string, boolean>;
    }[]
  >([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    if (!serverId) return;
    const response = await fetch(`/api/servers/${serverId}/members`);
    const data = await response.json();
    if (!response.ok) {
      notify(data.error || "No se pudieron cargar subusuarios");
      return;
    }
    setMembers(data.members || []);
    setPermissions(data.permissions || []);
  };

  useEffect(() => {
    void load();
  }, [serverId]);

  const add = async () => {
    const response = await fetch(`/api/servers/${serverId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        permissions: Object.fromEntries(
          permissions.map((permission) => [permission, false])
        ),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      notify(data.error || "No se pudo agregar");
    } else {
      setEmail("");
      notify("Subusuario agregado y notificado");
      void load();
    }
  };

  const updateLocal = (
    userId: string,
    permission: string,
    enabled: boolean
  ) => {
    setMembers((current) =>
      current.map((member) =>
        member.user_id === userId
          ? {
              ...member,
              permissions: { ...member.permissions, [permission]: enabled },
            }
          : member
      )
    );
  };

  const save = async (member: {
    user_id: string;
    permissions: Record<string, boolean>;
  }) => {
    setSaving(member.user_id);
    const response = await fetch(
      `/api/resources/${serverId}/subusers/${member.user_id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: member.permissions }),
      }
    );

    const data = await response.json();
    setSaving(null);

    if (!response.ok) {
      notify(data.error || "No se pudieron guardar los permisos");
      return;
    }

    notify("Permisos actualizados correctamente");
    setMembers((current) =>
      current.map((item) =>
        item.user_id === member.user_id
          ? {
              ...item,
              permissions: data.subuser?.permissions || member.permissions,
            }
          : item
      )
    );
  };

  const remove = async (userId: string) => {
    if (!window.confirm("¿Revocar el acceso de este usuario?")) return;

    const response = await fetch(
      `/api/resources/${serverId}/subusers/${userId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const data = await response.json();
      notify(data.error || "No se pudo revocar el acceso");
      return;
    }

    notify("Acceso revocado correctamente");
    setMembers((current) =>
      current.filter((member) => member.user_id !== userId)
    );
  };

  return (
    <div className="config-panel subusers-view">
      <div className="panel-title">
        <div>
          <h2>Subusuarios</h2>
          <span>Permisos independientes para este servidor</span>
        </div>
      </div>

      <div className="subuser-invite">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="correo@ejemplo.com"
        />
        <button
          className="primary-button"
          disabled={!email.trim()}
          onClick={() => void add()}
        >
          Agregar usuario
        </button>
      </div>

      {members.map((member) => (
        <article className="member-row" key={member.user_id}>
          <strong>{member.email || member.user_id}</strong>

          <div className="permission-grid">
            {permissions.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={Boolean(member.permissions?.[permission])}
                  onChange={(event) =>
                    updateLocal(member.user_id, permission, event.target.checked)
                  }
                />
                {permission}
              </label>
            ))}
          </div>

          <div className="member-actions">
            <button
              className="primary-button"
              disabled={saving === member.user_id}
              onClick={() => void save(member)}
            >
              {saving === member.user_id ? "Guardando..." : "Guardar permisos"}
            </button>
            <button
              className="danger-button"
              onClick={() => void remove(member.user_id)}
            >
              Revocar acceso
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function BellIcon() {
  return <Activity size={18} />;
}

// ==========================================
// VISTA: OVERVIEW
// ==========================================

function Overview({
  server,
  setActiveNav,
}: {
  server: ServerRecord;
  setActiveNav: (v: string) => void;
}) {
  return (
    <>
      <div className="overview-grid">
        <div className="console-card">
          <div className="panel-title">
            <div>
              <h2>Consola</h2>
              <span>
                <i className="live-dot" /> Conectado ahora
              </span>
            </div>
            <button onClick={() => setActiveNav("Terminal")}>
              Abrir terminal <ArrowLeft size={14} className="rotate-180" />
            </button>
          </div>

          <div className="console-screen">
            <p>
              <b>[12:42:08]</b> <em>[Server thread/INFO]</em> Done (2.431s)! For help, type &quot;help&quot;
            </p>
            <p>
              <b>[12:42:12]</b> <em>[Async Chat Thread - #1/INFO]</em> &lt;Alex&gt; Bienvenidos al servidor!
            </p>
            <p>
              <b>[12:42:18]</b> <em>[Server thread/INFO]</em> {server.name} is running on Paper {server.version}
            </p>
            <p>
              <b>[12:42:31]</b> <em className="green-text">[Server thread/INFO]</em> Server tick took 4ms
            </p>
            <div className="console-cursor">_</div>
          </div>
        </div>

        <div className="metrics-card">
          <div className="panel-title">
            <div>
              <h2>Rendimiento</h2>
              <span>Últimos 30 minutos</span>
            </div>
            <button className="icon-button">
              <MoreHorizontal size={17} />
            </button>
          </div>

          <div className="metric-values">
            <div>
              <span>CPU</span>
              <strong>18.4%</strong>
            </div>
            <div>
              <span>RAM</span>
              <strong>4.2 <small>/ 6 GB</small></strong>
            </div>
          </div>

          <div className="chart">
            <div className="chart-grid" />
            <svg viewBox="0 0 400 110" preserveAspectRatio="none">
              <path
                d="M0,80 C25,70 35,82 54,72 S85,55 104,68 S130,72 150,54 S174,62 194,45 S220,52 238,58 S260,38 278,48 S300,34 320,42 S340,27 360,36 S385,22 400,28"
                fill="none"
                stroke="#8275f4"
                strokeWidth="2.5"
              />
              <path
                d="M0,80 C25,70 35,82 54,72 S85,55 104,68 S130,72 150,54 S174,62 194,45 S220,52 238,58 S260,38 278,48 S300,34 320,42 S340,27 360,36 S385,22 400,28 V110 H0Z"
                fill="url(#gradient)"
                opacity=".18"
              />
              <defs>
                <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop stopColor="#8275f4" />
                  <stop offset="1" stopColor="#8275f4" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="chart-labels">
            <span>12:10</span>
            <span>12:20</span>
            <span>12:30</span>
            <span>Ahora</span>
          </div>
        </div>
      </div>

      <div className="quick-grid">
        <QuickInfo
          icon={Network}
          title="Conexiones"
          value="24 jugadores"
          detail="Máximo 100"
          color="purple"
        />
        <QuickInfo
          icon={HardDrive}
          title="Almacenamiento"
          value="12.4 GB"
          detail="de 50 GB"
          color="orange"
        />
        <QuickInfo
          icon={ShieldCheck}
          title="Protección DDoS"
          value="Activa"
          detail="Red protegida"
          color="green"
        />
      </div>

      <div className="overview-bottom">
        <div className="mini-panel">
          <div className="panel-title">
            <div>
              <h2>Configuración rápida</h2>
              <span>Ajustes frecuentes</span>
            </div>
            <button onClick={() => setActiveNav("Configuración")}>
              Ver todo <ArrowLeft size={14} className="rotate-180" />
            </button>
          </div>
          <div className="quick-settings">
            <div>
              <span>Modo de juego</span>
              <strong>survival</strong>
              <Settings2 size={15} />
            </div>
            <div>
              <span>Dificultad</span>
              <strong>hard</strong>
              <Settings2 size={15} />
            </div>
            <div>
              <span>Whitelist</span>
              <strong className="green-text">Activada</strong>
              <Settings2 size={15} />
            </div>
          </div>
        </div>

        <div className="mini-panel">
          <div className="panel-title">
            <div>
              <h2>Estado del servicio</h2>
              <span>Todos los sistemas operativos</span>
            </div>
            <Check size={18} className="green-text" />
          </div>
          <div className="service-lines">
            <span>
              Panel de control <i>Operativo</i>
              <b />
            </span>
            <span>
              Red y conexiones <i>Operativo</i>
              <b />
            </span>
            <span>
              Almacenamiento <i>Operativo</i>
              <b />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ==========================================
// VISTA: ARCHIVOS (FILES VIEW)
// ==========================================

function FilesView({
  serverId,
  notify,
  initialPath = "",
}: {
  serverId?: string;
  notify: (v: string) => void;
  initialPath?: string;
}) {
  const [directory, setDirectory] = useState(initialPath);
  const [entries, setEntries] = useState<
    { name: string; type: "file" | "directory"; size?: number }[]
  >([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async (path = directory) => {
    if (!serverId) return;
    const response = await fetch(
      `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`
    );
    const data = await response.json();
    if (!response.ok) {
      notify(data.error || "No se pudieron cargar los archivos");
      return;
    }
    setEntries(data.entries);
  };

  useEffect(() => {
    setDirectory(initialPath);
    void refresh(initialPath);
  }, [serverId, initialPath]);

  const openFile = async (path: string) => {
    if (!canPanelPermission("files.read")) {
      notify("No tienes permiso para leer archivos");
      return;
    }
    if (
      !/\.(txt|yml|yaml|json|properties|conf|toml|xml|cfg|ini|md|log)$/i.test(path)
    ) {
      notify("Este archivo no es editable como texto");
      return;
    }

    const response = await fetch(
      `/api/servers/${serverId}/files?file=${encodeURIComponent(path)}`
    );
    const text = await response.text();
    if (!response.ok) {
      notify(text);
      return;
    }
    setSelectedFile(path);
    setContent(text);
  };

  const saveFile = async () => {
    if (!canPanelPermission("files.update")) {
      notify("No tienes permiso para editar archivos");
      return;
    }
    if (!serverId || !selectedFile) return;
    setBusy(true);

    const response = await fetch(`/api/servers/${serverId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedFile, content }),
    });

    setBusy(false);
    notify(response.ok ? "Archivo guardado" : "No se pudo guardar");
  };

  const create = async (type: "directory" | "file") => {
    if (!canPanelPermission("files.create")) {
      notify("No tienes permiso para crear archivos");
      return;
    }
    const name = window.prompt(
      type === "directory" ? "Nombre de la carpeta" : "Nombre del archivo"
    );
    if (!name || !serverId) return;

    const path = directory ? `${directory}/${name}` : name;
    const response = await fetch(`/api/servers/${serverId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: type === "directory" ? "mkdir" : "create",
        type,
        path,
      }),
    });

    notify(response.ok ? "Creado correctamente" : "No se pudo crear");
    if (response.ok) void refresh();
  };

  const remove = async (name: string) => {
    if (!canPanelPermission("files.delete")) {
      notify("No tienes permiso para eliminar archivos");
      return;
    }
    if (!serverId || !window.confirm(`¿Eliminar ${name}?`)) return;

    const path = directory ? `${directory}/${name}` : name;
    const response = await fetch(
      `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
      { method: "DELETE" }
    );

    notify(response.ok ? "Eliminado" : "No se pudo eliminar");
    if (response.ok) void refresh();
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canPanelPermission("files.create")) {
      notify("No tienes permiso para subir archivos");
      event.target.value = "";
      return;
    }
    const files = Array.from(event.target.files || []);
    if (!files.length || !serverId) return;

    let failed = 0;
    for (const file of files) {
      const form = new FormData();
      form.append("path", directory);
      form.append("file", file);

      const response = await fetch(`/api/servers/${serverId}/files`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) failed++;
    }

    notify(
      failed
        ? `${failed} archivo(s) no se pudieron subir`
        : `${files.length} archivo(s) subido(s)`
    );

    if (!failed) void refresh();
    event.target.value = "";
  };

  return (
    <div className="files-layout">
      <div className={`files-panel ${selectedFile ? "with-editor" : "full-width"}`}>
        <div className="files-toolbar">
          <div className="breadcrumb-files">
            <button
              onClick={() => {
                setDirectory("");
                void refresh("");
              }}
            >
              home
            </button>
            {directory
              .split("/")
              .filter(Boolean)
              .map((part, index, all) => (
                <span key={`${part}-${index}`}>
                  {" "}
                  /{" "}
                  <button
                    onClick={() => {
                      const next = all.slice(0, index + 1).join("/");
                      setDirectory(next);
                      void refresh(next);
                    }}
                  >
                    {part}
                  </button>
                </span>
              ))}
          </div>

          <div className="files-actions">
            <label>
              <Upload size={15} /> Subir
              <input
                type="file"
                accept=".txt,.zip,.yml,.yaml,.json,.properties,.conf,.toml,.xml,.jar"
                multiple
                hidden
                onChange={upload}
              />
            </label>
            <button onClick={() => void create("directory")}>
              <Folder size={15} /> Carpeta
            </button>
            <button onClick={() => void create("file")}>
              <File size={15} /> Archivo
            </button>
          </div>
        </div>

        <div className="file-table">
          <div className="file-row file-head">
            <span>Nombre</span>
            <span>Tamaño</span>
            <span>Tipo</span>
            <span />
          </div>

          {directory && (
            <button
              className="file-row file-parent"
              onClick={() => {
                const parent = directory.split("/").slice(0, -1).join("/");
                setDirectory(parent);
                void refresh(parent);
              }}
            >
              <div className="file-name">
                <ArrowLeft size={15} /> ..
              </div>
              <span>—</span>
              <span>Carpeta</span>
              <span />
            </button>
          )}

          {entries.map((entry) => {
            const path = directory ? `${directory}/${entry.name}` : entry.name;
            return (
              <div className="file-row" key={entry.name}>
                <button
                  className="file-name"
                  onClick={() =>
                    entry.type === "directory"
                      ? (setDirectory(path), void refresh(path))
                      : void openFile(path)
                  }
                >
                  {entry.type === "directory" ? (
                    <Folder size={17} className="folder-color" />
                  ) : (
                    <FileCode2 size={17} className="file-color" />
                  )}
                  <span>{entry.name}</span>
                </button>
                <span>{entry.size ?? "—"}</span>
                <span>{entry.type}</span>
                <button
                  className="row-more"
                  onClick={() => void remove(entry.name)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selectedFile && (
        <div className="editor-panel">
          <div className="editor-head">
            <div>
              <Code2 size={17} />
              <strong>{selectedFile}</strong>
              <span>Monaco · editor local</span>
            </div>
            <button
              className={`save-button ${busy ? "saving" : ""}`}
              onClick={() => void saveFile()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={14} className="spin" /> Guardando...
                </>
              ) : (
                <>
                  <Check size={14} /> Guardar
                </>
              )}
            </button>
          </div>

          <CodeEditor
            height="calc(100vh - 290px)"
            language={
              selectedFile.endsWith(".json")
                ? "json"
                : selectedFile.endsWith(".yml") || selectedFile.endsWith(".yaml")
                ? "yaml"
                : selectedFile.endsWith(".properties")
                ? "ini"
                : "plaintext"
            }
            theme="vs-dark"
            value={content}
            onChange={(value) => setContent(value || "")}
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
              wordWrap: "on",
              fontSize: 13,
              lineNumbers: "on",
              padding: { top: 14, bottom: 14 },
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
              overviewRulerLanes: 0,
            }}
          />

          <div className="editor-status">
            <span>
              <Check size={13} /> Los cambios se guardan en tu disco
            </span>
            <span>UTF-8 · LF</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VISTA: TERMINAL
// ==========================================

function TerminalView({
  serverId,
  consoleLine,
  setConsoleLine,
}: {
  serverId?: string;
  consoleLine: string;
  setConsoleLine: (v: string) => void;
}) {
  const [output, setOutput] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);

  useEffect(() => {
    if (!serverId) return;
    let active = true;

    const refresh = () =>
      fetch(`/api/servers/${serverId}/metrics`)
        .then(async (response) => ({
          ok: response.ok,
          data: (await response.json()) as {
            recentOutput?: string[];
            error?: string;
          },
        }))
        .then(({ ok, data }) => {
          if (active) {
            setOutput(
              ok
                ? data.recentOutput || []
                : [`[CraftPanel] ${data.error || "No se pudo leer la consola"}`]
            );
          }
        })
        .catch(() => undefined);

    void refresh();
    const timer = window.setInterval(refresh, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [serverId]);

  useEffect(() => {
    const element = outputRef.current;
    if (element && followOutput.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [output]);

  async function sendCommand() {
    if (!serverId || !consoleLine.trim()) return;

    const response = await fetch(`/api/servers/${serverId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "command", command: consoleLine }),
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setOutput((current) => [
        ...current,
        `[CraftPanel] ${data.error || "No se pudo enviar el comando"}`,
      ]);
    } else {
      setConsoleLine("");
    }
  }

  return (
    <div className="terminal-page">
      <div className="terminal-card">
        <div className="terminal-head">
          <div>
            <Terminal size={18} />
            <strong>Terminal Minecraft</strong>
            <span>
              <i className="live-dot" /> Salida del proceso Java
            </span>
          </div>
          <button className="icon-button" onClick={() => setOutput([])}>
            <Trash2 size={16} />
          </button>
        </div>

        <div
          className="terminal-output"
          ref={outputRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            followOutput.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 24;
          }}
        >
          {(output.length
            ? output
            : ["Esperando salida del proceso Java..."]
          ).map((line, index) => (
            <p
              key={`${index}-${line}`}
              dangerouslySetInnerHTML={{ __html: minecraftLine(line) }}
            />
          ))}

          <div className="terminal-prompt">
            <span>&gt;</span>
            <input
              value={consoleLine}
              onChange={(event) => setConsoleLine(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  followOutput.current = true;
                  void sendCommand();
                }
              }}
              placeholder="Escribe un comando..."
              autoFocus
            />
          </div>
        </div>
      </div>

      <div className="terminal-stats">
        <QuickInfo
          icon={Cpu}
          title="CPU"
          value="Local"
          detail="Proceso en tu computadora"
          color="purple"
        />
        <QuickInfo
          icon={MemoryStick}
          title="Memoria"
          value="Java"
          detail="Asignación configurada"
          color="orange"
        />
        <QuickInfo
          icon={Activity}
          title="Salida"
          value={`${output.length}`}
          detail="líneas recientes"
          color="green"
        />
      </div>
    </div>
  );
}

// ==========================================
// VISTA: PLUGINS / MODS
// ==========================================

function PluginsView({
  serverId,
  serverType,
  serverVersion,
  notify,
  onOpenFolder,
}: {
  serverId?: string;
  serverType: string;
  serverVersion: string;
  notify: (message: string) => void;
  onOpenFolder: () => void;
}) {
  const modded = !["paper", "velocity"].includes(serverType.toLowerCase());
  const [tab, setTab] = useState<"installed" | "catalog" | "modpacks">("installed");
  const [plugins, setPlugins] = useState<
    {
      id?: string;
      name: string;
      size?: number;
      icon?: string;
      description?: string;
      downloads?: number;
      slug?: string;
    }[]
  >([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [versions, setVersions] = useState<
    {
      id: string;
      name: string;
      version: string;
      gameVersions: string[];
      loaders: string[];
      compatible?: boolean;
    }[]
  >([]);

  const [selectedPlugin, setSelectedPlugin] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [selectedVersion, setSelectedVersion] = useState("");
  const [softwareFilter, setSoftwareFilter] = useState("all");
  const [gameVersionFilter, setGameVersionFilter] = useState("all");

  useEffect(() => {
    if (!serverId) return;
    const url = `/api/servers/${serverId}/plugins?mode=${
      tab === "catalog" || tab === "modpacks"
        ? `catalog&kind=${
            tab === "modpacks" ? "modpack" : modded ? "mod" : "plugin"
          }&search=${encodeURIComponent(query || "minecraft")}&page=${page}`
        : "installed"
    }`;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        setPlugins(data.plugins || []);
        setTotal(data.total || 0);
      })
      .catch(() => notify("No se pudieron cargar los plugins"));
  }, [serverId, tab, query, page, modded]);

  const removePlugin = async (name: string) => {
    if (!canPanelPermission("files.delete")) {
      notify("No tienes permiso para eliminar plugins");
      return;
    }
    if (!serverId || !window.confirm(`¿Eliminar ${name}?`)) return;

    const response = await fetch(
      `/api/servers/${serverId}/plugins?name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );

    if (response.ok) {
      setPlugins((items) => items.filter((item) => item.name !== name));
    } else {
      notify("No se pudo eliminar el plugin");
    }
  };

  const chooseDownload = async (plugin: { id?: string; name: string }) => {
    if (!serverId || !plugin.id) return;

    const response = await fetch(
      `/api/servers/${serverId}/plugins?mode=versions&project=${encodeURIComponent(
        plugin.id
      )}`
    );
    const data = await response.json();

    setVersions(data.versions || []);
    setSelectedPlugin({ id: plugin.id, name: plugin.name });
    setSelectedVersion(data.versions?.[0]?.id || "");
    setSoftwareFilter(
      serverType.toLowerCase() === "velocity" ? "velocity" : "paper"
    );
    setGameVersionFilter(
      serverType.toLowerCase() === "velocity" ? "all" : serverVersion
    );
  };

  const downloadPlugin = async () => {
    if (!canPanelPermission("files.create")) {
      notify("No tienes permiso para instalar plugins");
      return;
    }
    if (!serverId || !selectedPlugin || !selectedVersion) return;

    const response = await fetch(`/api/servers/${serverId}/plugins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: selectedPlugin.id,
        version: selectedVersion,
      }),
    });

    if (!response.ok) {
      notify("No se pudo descargar el plugin");
      return;
    }

    notify(`${selectedPlugin.name} descargado en plugins`);
    setSelectedPlugin(null);
  };

  const pageCount = Math.max(1, Math.ceil(total / 24));

  const filteredVersions = versions.filter(
    (version) =>
      (softwareFilter === "all" ||
        version.loaders.length === 0 ||
        version.loaders.includes(softwareFilter) ||
        (softwareFilter === "paper" &&
          version.loaders.some((loader) =>
            ["paper", "bukkit", "spigot"].includes(loader)
          ))) &&
      (gameVersionFilter === "all" ||
        version.gameVersions.length === 0 ||
        version.gameVersions.includes(gameVersionFilter) ||
        version.gameVersions.includes("*"))
  );

  const softwareOptions = Array.from(
    new Set(versions.flatMap((version) => version.loaders))
  ).sort();

  const gameVersionOptions = Array.from(
    new Set(versions.flatMap((version) => version.gameVersions))
  ).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return (
    <div className="plugins-view">
      <div className="plugin-tabs">
        <button
          className={tab === "installed" ? "active" : ""}
          onClick={() => {
            setTab("installed");
            setPage(1);
          }}
        >
          Gestionar {modded ? "mods" : "plugins"}
        </button>

        <button
          className={tab === "catalog" ? "active" : ""}
          onClick={() => {
            setTab("catalog");
            setPage(1);
          }}
        >
          Buscar {modded ? "mods" : "plugins"}
        </button>

        {modded && (
          <button
            className={tab === "modpacks" ? "active" : ""}
            onClick={() => {
              setTab("modpacks");
              setPage(1);
            }}
          >
            Modpacks
          </button>
        )}
      </div>

      {tab === "installed" && (
        <button className="plugin-folder-link" onClick={onOpenFolder}>
          <FolderOpen size={15} /> Abrir carpeta {modded ? "mods" : "plugins"}
        </button>
      )}

      {tab !== "installed" && (
        <div className="plugin-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={`Buscar ${
              tab === "modpacks"
                ? "modpacks"
                : modded
                ? "mods"
                : "plugins"
            } en Modrinth...`}
          />
        </div>
      )}

      <div className="plugin-grid">
        {plugins.map((plugin) => (
          <article className="plugin-card" key={plugin.id || plugin.name}>
            <div className="plugin-cover">
              {plugin.icon ? (
                <img src={plugin.icon} alt="" />
              ) : (
                <Box size={27} />
              )}
            </div>

            <div className="plugin-info">
              <strong>{plugin.name}</strong>
              <p>
                {plugin.description ||
                  "Plugin instalado en la carpeta plugins."}
              </p>
              {plugin.downloads !== undefined && (
                <small>{plugin.downloads.toLocaleString()} descargas</small>
              )}
            </div>

            {tab === "installed" ? (
              <button
                className="row-more"
                onClick={() => void removePlugin(plugin.name)}
                title="Eliminar plugin"
              >
                <Trash2 size={17} />
              </button>
            ) : (
              <div className="plugin-actions">
                <button onClick={() => void chooseDownload(plugin)}>
                  <Download size={14} /> Descargar
                </button>
                <a
                  href={`https://modrinth.com/plugin/${
                    plugin.slug || plugin.id
                  }`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Página <ArrowLeft size={13} className="rotate-180" />
                </a>
              </div>
            )}
          </article>
        ))}
      </div>

      {tab === "catalog" && (
        <div className="pagination">
          {Array.from(
            { length: Math.min(pageCount, 8) },
            (_, index) => index + 1
          ).map((number) => (
            <button
              key={number}
              className={number === page ? "active" : ""}
              onClick={() => setPage(number)}
            >
              {number}
            </button>
          ))}
        </div>
      )}

      {!plugins.length && (
        <div className="empty-state">No hay plugins para mostrar.</div>
      )}

      {selectedPlugin && (
        <div className="plugin-modal">
          <div className="plugin-modal-card">
            <button
              className="close-button"
              onClick={() => setSelectedPlugin(null)}
            >
              <X size={18} />
            </button>

            <h3>Instalar {selectedPlugin.name}</h3>
            <p>Filtra las versiones por software y versión de Minecraft.</p>

            <div className="version-filters">
              <label>
                Software
                <select
                  value={softwareFilter}
                  onChange={(event) => {
                    setSoftwareFilter(event.target.value);
                    setSelectedVersion("");
                  }}
                >
                  <option value="all">Todos</option>
                  {softwareOptions.map((software) => (
                    <option key={software} value={software}>
                      {software === "bukkit" ? "Bukkit / Spigot" : software}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Versión
                <select
                  value={gameVersionFilter}
                  onChange={(event) => {
                    setGameVersionFilter(event.target.value);
                    setSelectedVersion("");
                  }}
                >
                  <option value="all">Todas</option>
                  {gameVersionOptions.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <select
              value={selectedVersion}
              onChange={(event) => setSelectedVersion(event.target.value)}
            >
              <option value="">Selecciona una build</option>
              {filteredVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name} · {version.version} ·{" "}
                  {version.loaders.join(", ") || "Universal"} ·{" "}
                  {version.gameVersions.slice(0, 3).join(", ")}
                </option>
              ))}
            </select>

            <button
              className="primary-button"
              onClick={() => void downloadPlugin()}
              disabled={!selectedVersion}
            >
              <Download size={15} /> Descargar versión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VISTA: JUGADORES (PLAYERS VIEW)
// ==========================================

function PlayersView({ serverId }: { serverId?: string }) {
  const [players, setPlayers] = useState<
    { name: string; avatar: string }[]
  >([]);

  useEffect(() => {
    if (!serverId) return;

    const refresh = () =>
      fetch(`/api/servers/${serverId}/players`)
        .then((response) => response.json())
        .then((data) => setPlayers(data.players || []))
        .catch(() => undefined);

    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [serverId]);

  return (
    <div className="players-view">
      <div className="panel-title">
        <div>
          <h2>Jugadores en línea</h2>
          <span>Datos obtenidos de la consola real del servidor</span>
        </div>
        <strong className="players-count">{players.length}</strong>
      </div>

      <div className="players-grid">
        {players.map((player) => (
          <div className="player-card" key={player.name}>
            <img src={player.avatar} alt={player.name} />
            <strong>{player.name}</strong>
            <span>En línea</span>
          </div>
        ))}
      </div>

      {!players.length && (
        <div className="empty-state">
          No hay jugadores conectados o el servidor está detenido.
        </div>
      )}
    </div>
  );
}

// ==========================================
// VISTA: BACKUPS
// ==========================================

function BackupsView({
  serverId,
  notify,
}: {
  serverId?: string;
  notify: (message: string) => void;
}) {
  const [backups, setBackups] = useState<
    { name: string; size: number; createdAt: string }[]
  >([]);
  const [targetId, setTargetId] = useState(serverId);

  const load = (id = targetId) => {
    if (id) {
      void fetch(`/api/servers/${id}/backups`)
        .then((response) => response.json())
        .then((data) => setBackups(data.backups || []));
    }
  };

  useEffect(() => {
    if (serverId) return;

    void fetch("/api/servers")
      .then((response) => response.json())
      .then((data: { servers: ServerRecord[] }) => {
        const storedId = window.sessionStorage.getItem(
          "craftpanel:selected-server-id"
        );
        const currentName = document
          .querySelector(".manager-inner h1")
          ?.textContent?.trim();

        const id =
          data.servers.find((item) => item.id === storedId)?.id ||
          data.servers.find((item) => item.name === currentName)?.id ||
          data.servers[0]?.id;

        if (id) {
          setTargetId(id);
          load(id);
        }
      });
  }, [serverId]);

  useEffect(() => {
    load();
  }, [serverId, targetId]);

  const create = async () => {
    if (!canPanelPermission("backup.create")) {
      notify("No tienes permiso para crear backups");
      return;
    }
    if (!targetId) return;

    const response = await fetch(`/api/servers/${targetId}/backups`, {
      method: "POST",
    });
    const data = await response.json();

    notify(
      response.ok ? "Backup creado correctamente" : data.error
    );
    load(targetId);
  };

  return (
    <div className="backups-view">
      <div className="panel-title">
        <div>
          <h2>Backups</h2>
          <span>Copia real de los archivos del servidor</span>
        </div>
        <button
          className="primary-button"
          onClick={() => void create()}
          disabled={!targetId}
        >
          <Plus size={15} /> Crear backup
        </button>
      </div>

      {backups.map((backup) => (
        <div className="backup-row" key={backup.name}>
          <strong>{backup.name}</strong>
          <span>
            {Math.round(backup.size / 1024)} KB ·{" "}
            {new Date(backup.createdAt).toLocaleString()}
          </span>
          <a
            className="secondary-button"
            href={`/api/servers/${targetId}/backups/${encodeURIComponent(
              backup.name
            )}`}
          >
            Descargar
          </a>
        </div>
      ))}

      {!backups.length && (
        <div className="empty-state">No hay backups todavía.</div>
      )}
    </div>
  );
}

// ==========================================
// VISTA: NETWORK (VELOCITY PROXY)
// ==========================================

function NetworkView({
  server = {
    id: "",
    name: "Velocity",
    port: 25565,
    type: "Velocity",
    version: "",
    status: "Detenido",
    address: "localhost",
    ram: "1G",
  },
  notify,
}: {
  server?: ServerRecord;
  notify: (v: string) => void;
}) {
  const [activeServer, setActiveServer] = useState(server);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [proxyId, setProxyId] = useState(server.id);
  const [connected, setConnected] = useState<
    { name: string; address: string; priority: number }[]
  >([]);
  const [bind, setBind] = useState(`0.0.0.0:${server.port || 25565}`);
  const [motd, setMotd] = useState("");
  const [onlineMode, setOnlineMode] = useState(true);
  const [forwarding, setForwarding] = useState("modern");
  const [draggedId, setDraggedId] = useState("");

  useEffect(() => {
    void fetch("/api/servers")
      .then((response) => response.json())
      .then((data: { servers: ServerRecord[] }) => {
        const selectedName = document
          .querySelector(".side-server strong")
          ?.textContent?.trim();

        const proxy =
          data.servers.find(
            (item) =>
              item.name === selectedName &&
              item.type.toLowerCase() === "velocity"
          ) ||
          data.servers.find((item) => item.type.toLowerCase() === "velocity");

        if (proxy) {
          setActiveServer(proxy);
          setProxyId(proxy.id);
          setBind(`0.0.0.0:${proxy.port || 25565}`);
        }

        setServers(
          data.servers.filter(
            (item) => item.type.toLowerCase() !== "velocity"
          )
        );
      });
  }, []);

  useEffect(() => {
    if (!proxyId) return;

    void fetch(`/api/servers/${proxyId}/network`)
      .then((response) => response.json())
      .then(
        (data: {
          config?: {
            bind?: string;
            motd?: string;
            onlineMode?: boolean;
            playerInfoForwarding?: string;
            servers?: { name: string; address: string; priority: number }[];
          };
        }) => {
          const config = data.config;
          if (!config) return;
          if (config.bind) setBind(config.bind);
          if (config.motd !== undefined) setMotd(config.motd);
          if (config.onlineMode !== undefined)
            setOnlineMode(config.onlineMode);
          if (config.playerInfoForwarding)
            setForwarding(config.playerInfoForwarding);
          if (config.servers) setConnected(config.servers);
        }
      );
  }, [proxyId]);

  const addDragged = () => {
    const target = servers.find((item) => item.id === draggedId);
    if (target && !connected.some((item) => item.name === target.name)) {
      setConnected((items) => [
        ...items,
        {
          name: target.name,
          address: `127.0.0.1:${target.port}`,
          priority: items.length + 1,
        },
      ]);
    }
  };

  const save = async () => {
    if (!canPanelPermission("allocation.update")) {
      notify("No tienes permiso para modificar la Network");
      return;
    }
    const response = await fetch(`/api/servers/${proxyId}/network`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bind,
        motd,
        onlineMode,
        playerInfoForwarding: forwarding,
        servers: connected,
      }),
    });

    const data = await response.json();
    notify(
      response.ok
        ? "Configuración guardada en velocity.toml"
        : data.error || "No se pudo guardar velocity.toml"
    );
  };

  return (
    <div className="network-view">
      <div className="panel-title">
        <div>
          <h2>Network de {activeServer.name}</h2>
          <span>Configuración directa del proxy Velocity</span>
        </div>
        <button className="primary-button" onClick={() => void save()}>
          <Check size={15} /> Guardar configuración
        </button>
      </div>

      <div className="network-settings">
        <label>
          Bind
          <input
            value={bind}
            onChange={(event) => setBind(event.target.value)}
          />
        </label>
        <label>
          MOTD
          <input
            value={motd}
            onChange={(event) => setMotd(event.target.value)}
            placeholder="Mensaje del proxy"
          />
        </label>
        <label>
          Player info forwarding
          <select
            value={forwarding}
            onChange={(event) => setForwarding(event.target.value)}
          >
            <option value="modern">Modern</option>
            <option value="legacy">Legacy</option>
            <option value="bungeeguard">BungeeGuard</option>
            <option value="none">None</option>
          </select>
        </label>
        <label>
          Online mode
          <select
            value={onlineMode ? "true" : "false"}
            onChange={(event) =>
              setOnlineMode(event.target.value === "true")
            }
          >
            <option value="true">Activado</option>
            <option value="false">Desactivado</option>
          </select>
        </label>
      </div>

      <div className="network-flow">
        <div className="network-pool">
          <strong>Servidores disponibles</strong>
          {servers.map((item) => (
            <div
              draggable
              key={item.id}
              onDragStart={() => setDraggedId(item.id || "")}
              className="network-node server-node"
            >
              <Box size={15} />
              {item.name}
              <small>{item.port}</small>
            </div>
          ))}
        </div>

        <div className="network-connector">→</div>

        <div
          className="network-proxy"
          onDragOver={(event) => event.preventDefault()}
          onDrop={addDragged}
        >
          <Network size={22} />
          <strong>{activeServer.name}</strong>
          <span>Orden de conexión</span>
          {connected.map((item) => (
            <div className="network-node connected-node" key={item.name}>
              <input
                type="number"
                min="1"
                value={item.priority}
                onChange={(event) =>
                  setConnected((items) =>
                    items.map((entry) =>
                      entry.name === item.name
                        ? { ...entry, priority: Number(event.target.value) }
                        : entry
                    )
                  )
                }
              />
              {item.name}
              <button
                onClick={() =>
                  setConnected((items) =>
                    items.filter((entry) => entry.name !== item.name)
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VISTA: CONFIGURACIÓN (SERVER.PROPERTIES)
// ==========================================

function ConfigView({
  server,
  notify,
  onDeleted,
}: {
  server: ServerRecord;
  notify: (v: string) => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    name: server.name,
    ram: server.ram,
    java: server.java || "java",
    command: server.command || "",
    jar: server.jar || "server.jar",
    port: String(server.port || 25565),
    "online-mode": "true",
    "view-distance": "10",
    motd: "",
    pvp: "true",
    "max-players": "20",
    "allow-nether": "true",
    "allow-end": "true",
    "op-permission-level": "4",
    "level-name": "world",
    hardcore: "false",
    "white-list": "false",
    "spawn-animals": "true",
    difficulty: "easy",
    "spawn-monsters": "true",
    "allow-flight": "false",
    "max-world-size": "29999984",
    "enable-command-block": "false",
    gamemode: "survival",
  });

  useEffect(() => {
    void fetch(`/api/servers/${server.id}/config`)
      .then((response) => response.json())
      .then((data: { properties?: Record<string, string> }) => {
        const properties = data.properties;
        if (properties) {
          setForm((current) => ({
            ...current,
            ...properties,
            port: properties["server-port"] || current.port,
          }));
        }
      });
  }, [server.id]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!canPanelPermission("files.update")) {
      notify("No tienes permiso para modificar la configuración");
      return;
    }
    const properties = Object.fromEntries(
      Object.entries(form).filter(
        ([key]) => !["name", "ram", "java", "command", "jar", "port"].includes(key)
      )
    );
    properties["server-port"] = form.port;

    const response = await fetch(`/api/servers/${server.id}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        port: Number(form.port),
        properties,
      }),
    });

    notify(
      response.ok
        ? "Configuración guardada. Reinicia para aplicar cambios de ejecución."
        : "No se pudo guardar la configuración"
    );
  };

  const remove = async () => {
    setDeleting(true);
    const response = await fetch(`/api/servers/${server.id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    setDeleting(false);

    if (!response.ok) {
      notify(data.error || "No se pudo eliminar el servidor");
      return;
    }

    notify("Servidor eliminado permanentemente");
    onDeleted();
  };

  const propertyFields = [
    "online-mode",
    "view-distance",
    "motd",
    "pvp",
    "max-players",
    "allow-nether",
    "allow-end",
    "op-permission-level",
    "level-name",
    "hardcore",
    "white-list",
    "spawn-animals",
    "difficulty",
    "spawn-monsters",
    "allow-flight",
    "max-world-size",
    "enable-command-block",
    "gamemode",
  ] as const;

  return (
    <div className="config-panel">
      <div className="panel-title">
        <div>
          <h2>Configuración del servidor</h2>
          <span>Los cambios se escriben en server.properties</span>
        </div>
        <button className="save-button" onClick={() => void save()}>
          <Check size={14} /> Guardar cambios
        </button>
      </div>

      <div className="config-grid">
        <label>
          Nombre
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>

        <label>
          Puerto
          <input
            type="number"
            min="1"
            max="65535"
            value={form.port}
            onChange={(event) => setForm({ ...form, port: event.target.value })}
          />
        </label>

        <label>
          RAM
          <input
            value={form.ram}
            onChange={(event) => setForm({ ...form, ram: event.target.value })}
          />
        </label>

        <label>
          Java
          <input
            value={form.java}
            onChange={(event) => setForm({ ...form, java: event.target.value })}
          />
        </label>

        <label>
          Archivo JAR
          <input
            value={form.jar}
            onChange={(event) => setForm({ ...form, jar: event.target.value })}
          />
        </label>

        <label className="full">
          Comando personalizado
          <input
            value={form.command}
            onChange={(event) => setForm({ ...form, command: event.target.value })}
          />
        </label>

        {server.type.toLowerCase() !== "velocity" &&
          propertyFields.map((key) => (
            <label key={key}>
              {key}
              <input
                value={form[key]}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
              />
            </label>
          ))}
      </div>

      <div className="danger-zone">
        <div>
          <strong>Eliminar servidor</strong>
          <span>
            Borra permanentemente el proceso, archivos, mundos y configuración.
          </span>
        </div>
        <button className="danger-button" onClick={() => setConfirmDelete(true)}>
          Eliminar servidor
        </button>
      </div>

      {confirmDelete && (
        <div className="warning-modal">
          <div className="warning-card">
            <AlertTriangle size={28} />
            <h3>¿Eliminar {server.name} permanentemente?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div>
              <button
                className="secondary-button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                onClick={() => void remove()}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Sí, eliminar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VISTA: PLACEHOLDER GENÉRICA
// ==========================================

function PlaceholderView({
  title,
  notify,
}: {
  title: string;
  notify: (v: string) => void;
}) {
  if (title === "Backups") {
    return <BackupsView notify={notify} />;
  }

  return (
    <div className="placeholder-view">
      <div className="placeholder-icon">
        <Settings2 size={28} />
      </div>
      <h2>{title}</h2>
      <p>Esta sección está lista para configurar tu servidor.</p>
      <button
        className="primary-button"
        onClick={() => notify(`Sección ${title} seleccionada`)}
      >
        Configurar sección
      </button>
    </div>
  );
}