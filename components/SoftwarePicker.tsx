"use client";
import { useEffect, useMemo, useState } from "react";
import { Feather, Network, Layers, Hammer, Check, Search, Loader2 } from "lucide-react";

const software = [
  { name: "Paper", icon: Feather, color: "blue", tag: "Plugins", description: "Survival y comunidades con gran rendimiento." },
  { name: "Velocity", icon: Network, color: "purple", tag: "Proxy", description: "Conecta tus servidores en una sola network." },
  { name: "Fabric", icon: Layers, color: "amber", tag: "Mods", description: "Ligero, flexible y listo para personalizar." },
  { name: "Forge", icon: Hammer, color: "green", tag: "Modpacks", description: "Un universo de mods para grandes aventuras." },
];
const cache = new Map<string, string[]>();
export default function SoftwarePicker({ type, version, onType, onVersion, onReady }: { type: string; version: string; onType: (type: string) => void; onVersion: (version: string) => void; onReady: (ready: boolean) => void }) {
  const [versions, setVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setVersions([]); setSearch(""); onReady(false);
    const load = async () => {
      try {
        let items = cache.get(type);
        if (!items) {
          const response = await fetch(`/api/catalog/versions?type=${encodeURIComponent(type)}`, { signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "No se pudieron cargar versiones");
          items = [...new Set<string>((data.versions || []).map((item: { id: string }) => item.id))].sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
          if (!items.length) throw new Error("El catálogo no tiene versiones disponibles");
          cache.set(type, items);
        }
        if (controller.signal.aborted) return;
        setVersions(items); if (!items.includes(version)) onVersion(items.find(v => !/snapshot|pre|rc|alpha|beta/i.test(v)) || items[0]); onReady(true);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Error de conexión"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); return () => controller.abort();
  }, [type, retry]);
  const visible = useMemo(() => versions.filter(v => v.toLowerCase().includes(search.toLowerCase())), [versions, search]);
  return <><section className="checkout-section software-section"><div className="section-heading"><div><span className="eyebrow">TU EXPERIENCIA</span><h3>Elige el software</h3><p>Una base para cada forma de jugar.</p></div><span className="selection-badge">{type}</span></div><div className="software-grid">{software.map(item => <button type="button" aria-pressed={type === item.name} className={`software-card ${item.color} ${type === item.name ? "selected" : ""}`} key={item.name} onClick={() => { if(type !== item.name) { onReady(false); onType(item.name); } }}><span className="software-icon"><item.icon size={32} /></span><span className="software-tag">{item.tag}</span><strong>{item.name}</strong><small>{item.description}</small>{type === item.name && <Check className="software-check" size={20} />}</button>)}</div></section><section className="checkout-section version-section"><div className="section-heading"><div><span className="eyebrow">COMPATIBILIDAD</span><h3>Selecciona la versión</h3><p>Versiones disponibles para {type}.</p></div><span className="selection-badge">{version || "Sin selección"}</span></div><label className="version-search"><Search size={18} /><input aria-label="Buscar versión" placeholder="Buscar versión…" value={search} onChange={e => setSearch(e.target.value)} /></label>{loading ? <p role="status"><Loader2 size={18} className="spin" /> Consultando versiones…</p> : error ? <p role="alert">{error} <button type="button" className="secondary-button" onClick={() => setRetry(n => n+1)}>Reintentar</button></p> : <div className="version-table-scroll"><table className="version-table"><thead><tr><th>Elegir</th><th>Versión</th><th>Software</th><th>Canal</th></tr></thead><tbody>{visible.map(v => <tr key={v} className={version === v ? "selected" : ""} onClick={() => onVersion(v)}><td><input type="radio" name="minecraft-version" aria-label={`Seleccionar ${v}`} checked={version === v} onChange={() => onVersion(v)} /></td><td><strong>{v}</strong></td><td>{type}</td><td><span>{/snapshot|pre|rc|alpha|beta/i.test(v) ? "Prueba" : "Release"}</span></td></tr>)}</tbody></table>{!visible.length && <p>No hay versiones que coincidan.</p>}</div>}</section></>;
}
