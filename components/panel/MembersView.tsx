"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Users, Loader2 } from "lucide-react";
import { SERVER_PERMISSIONS, type PermissionMap } from "@/lib/permissions";
import { permissionProfiles, profilePermissions, permissionGroups, permissionActions } from "@/lib/permission-profiles";
import type { ServerRecord } from "@/lib/panel-types";

type Member = { user_id: string; email?: string; permissions: PermissionMap };
export default function MembersView({ server, notify }: { server: ServerRecord; notify: (message: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState<PermissionMap>(() => profilePermissions("viewer"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const can = (permission: string) => !server.isSubuser || server.permissions?.[permission] === true;
  const allowed = SERVER_PERMISSIONS.filter(p => !server.isSubuser || server.permissions?.[p]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setMembers([]); setError("");
    fetch(`/api/servers/${server.id}/members`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el equipo");
      setMembers(data.members || []);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [server.id]);
  const request = async (method: string, body: unknown) => {
    const response = await fetch(`/api/servers/${server.id}/members`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar el acceso");
    return data;
  };
  const add = async () => {
    if (busy) return;
    setBusy("invite");
    try {
      const data = await request("POST", { email, permissions: draft });
      setMembers(items => [...items.filter(m => m.user_id !== data.member.user_id), { ...data.member, email: data.member.email || email }]);
      setEmail(""); notify("Usuario agregado con los permisos seleccionados");
    } catch (e) { notify(e instanceof Error ? e.message : "Error de conexión"); } finally { setBusy(null); }
  };
  const save = async (member: Member) => {
    setBusy(member.user_id);
    try { await request("PATCH", { userId: member.user_id, permissions: member.permissions }); notify("Permisos guardados"); }
    catch (e) { notify(e instanceof Error ? e.message : "Error de conexión"); } finally { setBusy(null); }
  };
  const remove = async (member: Member) => {
    if (!window.confirm(`¿Revocar el acceso de ${member.email || member.user_id}?`)) return;
    setBusy(member.user_id);
    try {
      const response = await fetch(`/api/servers/${server.id}/members?userId=${encodeURIComponent(member.user_id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error || "No se pudo revocar");
      setMembers(items => items.filter(m => m.user_id !== member.user_id)); notify("Acceso revocado");
    } catch (e) { notify(e instanceof Error ? e.message : "Error de conexión"); } finally { setBusy(null); }
  };
  function editor(value: PermissionMap, change: (value: PermissionMap) => void, disabled: boolean) {
    const choose = (permissions: PermissionMap) => change(Object.fromEntries(allowed.filter(p => permissions[p]).map(p => [p, true])));
    return <fieldset className="permission-editor" disabled={disabled || !!busy}><div className="permission-presets">{permissionProfiles.map(profile => <button type="button" className="permission-profile" key={profile.id} onClick={() => choose(profilePermissions(profile.id))}><ShieldCheck size={18} /><strong>{profile.name}</strong><small>{profile.description}</small></button>)}</div><div className="permission-toolbar"><span>{Object.values(value).filter(Boolean).length} permisos seleccionados</span><button type="button" onClick={() => choose(Object.fromEntries(allowed.map(p => [p, true])))}>Agregar todos</button><button type="button" onClick={() => change({})}>Quitar todos</button></div><div className="permission-categories">{Object.entries(permissionGroups).map(([group, label]) => <section key={group}><h4>{label}</h4>{SERVER_PERMISSIONS.filter(p => p.startsWith(group + ".")).map(p => <label key={p}><input type="checkbox" disabled={!allowed.includes(p)} checked={!!value[p]} onChange={e => change({ ...value, [p]: e.target.checked })} />{permissionActions[p.split(".")[1]] || p}</label>)}</section>)}</div></fieldset>;
  }
  return <div className="config-panel subusers-view"><div className="panel-title"><div><h2><Users size={24} /> Tu equipo</h2><span>Define quién puede entrar y qué puede hacer.</span></div><span className="subuser-badge">{members.length} miembros</span></div>{can("user.create") && <article className="member-row invite-card"><h3>Agregar colaborador</h3><p>Elige un perfil y personaliza sus permisos antes de agregarlo.</p><form onSubmit={e => { e.preventDefault(); void add(); }}><div className="subuser-invite"><input required type="email" aria-label="Correo del colaborador" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" /><button className="primary-button" disabled={!!busy || !email.trim()}>{busy === "invite" ? "Agregando…" : "Agregar usuario"}</button></div>{editor(draft, setDraft, false)}</form></article>}{loading && <p role="status"><Loader2 className="spin" size={16} /> Cargando miembros…</p>}{error && <p role="alert" className="auth-message">{error}</p>}{!loading && !error && !members.length && <p className="members-empty">Tu equipo aún no tiene colaboradores.</p>}{members.map(member => <article className="member-row" key={member.user_id}><h3>{member.email || member.user_id}</h3>{editor(member.permissions, permissions => setMembers(items => items.map(m => m.user_id === member.user_id ? { ...m, permissions } : m)), !can("user.update"))}<div className="member-actions">{can("user.update") && <button className="primary-button" disabled={!!busy} onClick={() => void save(member)}>{busy === member.user_id ? "Guardando…" : "Guardar permisos"}</button>}{can("user.delete") && <button className="danger-button" disabled={!!busy} onClick={() => void remove(member)}>Revocar acceso</button>}</div></article>)}</div>;
}
