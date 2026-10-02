/** Tiny in-app event bus so the global popups and the Leads screen can talk without prop drilling. */
type Events = {
  /** A lead was changed somewhere (popup, notification action): lists should reload. */
  leadsChanged: void;
  /** Open the "matching contacts found" popup. `manual` = the person asked, so show everything. */
  showContactSuggestions: { manual: boolean };
  /** The pending-call list changed: the follow-up popup should re-check. */
  callsChanged: void;
};

type Listener<K extends keyof Events> = (payload: Events[K]) => void;
const listeners: { [K in keyof Events]?: Set<Listener<K>> } = {};

export function onLeadEvent<K extends keyof Events>(event: K, listener: Listener<K>): () => void {
  const set = (listeners[event] ??= new Set() as never) as Set<Listener<K>>;
  set.add(listener);
  return () => set.delete(listener);
}

export function emitLeadEvent<K extends keyof Events>(event: K, ...payload: Events[K] extends void ? [] : [Events[K]]): void {
  const set = listeners[event] as Set<Listener<K>> | undefined;
  set?.forEach((l) => {
    try {
      l(payload[0] as Events[K]);
    } catch {
      // A broken listener must not stop the others.
    }
  });
}
