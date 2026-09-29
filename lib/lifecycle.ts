export type LifecycleAction = "start" | "stop" | "restart" | "kill";
const state = globalThis as typeof globalThis & { craftpanelActions?: Map<string, LifecycleAction>; craftpanelNotify?: () => void };
const actions = state.craftpanelActions ||= new Map<string, LifecycleAction>();
const configState = globalThis as typeof globalThis & { craftpanelConfigLocks?: Set<string> };
const configLocks = configState.craftpanelConfigLocks ||= new Set<string>();
export function lockConfiguration(ids: string[]) {
  if (ids.some(id => configLocks.has(id) || actions.has(id))) throw new Error("Hay otra operación en curso en la network");
  ids.forEach(id => configLocks.add(id));
  return () => ids.forEach(id => configLocks.delete(id));
}
export function notifyPanel() { state.craftpanelNotify?.(); }
export function pendingAction(id: string) { return actions.get(id) || null; }
export function beginAction(id: string, action: LifecycleAction) {
  if (actions.has(id) || configLocks.has(id)) throw new Error("Ya hay una acción en curso para este servidor");
  actions.set(id, action); notifyPanel();
}
export function endAction(id: string) { actions.delete(id); notifyPanel(); }
