export type NativePageState = {
  available: boolean;
  connected: boolean;
  context: string;
  gameId: number | null;
  authenticated: boolean;
  currentToonId: string | null;
  subscriptionToonId: number | null;
  ownedToons: Record<string, any>[];
  reason: string | null;
};
export type NativeUpdate = {
  state: NativePageState;
  full: boolean;
  groups: any[];
  archived: any[];
};
/** Phrase in public/native-bridge.js reasons that the sidebar turns into a link. */
export const GROUPS_PAGE_LINK_TEXT = 'ToonHQ Groups page';
export const GROUPS_PAGE_PATH = '/groups';
const REQUEST = 'toonhqplus-native-request';
const MESSAGE = 'toonhqplus-native-message';
const unavailable = (reason: string): NativePageState => ({
  available: false, connected: false, context: '', gameId: null, authenticated: false,
  currentToonId: null, subscriptionToonId: null, ownedToons: [], reason,
});
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const record = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
// Member history can grow beyond the group's player capacity. The transport's
// message-size limit bounds these arrays without truncating legitimate history.
const group = (value: any) => record(value) && id(value.id) && value.game === 1 &&
  Array.isArray(value.members) && value.members.every((member: any) =>
    record(member) && (member.toon == null || record(member.toon)));
const stateMessage = (message: any) => {
  const candidate = message.state;
  return record(candidate) && candidate.available === true && typeof candidate.connected === 'boolean' &&
    typeof candidate.context === 'string' && candidate.context.length <= 200 &&
    (candidate.gameId === null || id(candidate.gameId)) && typeof candidate.authenticated === 'boolean' &&
    (candidate.currentToonId === null || typeof candidate.currentToonId === 'string' && candidate.currentToonId.length <= 100) &&
    (candidate.subscriptionToonId === null || id(candidate.subscriptionToonId)) &&
    Array.isArray(candidate.ownedToons) && candidate.ownedToons.length <= 256 &&
    candidate.ownedToons.every((toon: any) => record(toon) && id(toon.id)) &&
    (candidate.reason === null || typeof candidate.reason === 'string' && candidate.reason.length <= 300) &&
    typeof message.full === 'boolean' && Array.isArray(message.groups) && message.groups.length <= 5000 && message.groups.every(group) &&
    Array.isArray(message.archived) && message.archived.length <= 5000 && message.archived.every(group) &&
    (!candidate.connected || candidate.gameId === 1);
};
export function validBoardingStatus(value: any): boolean {
  return value === null || record(value) && ['district', 'location', 'type', 'num_players'].every(key =>
    value[key] === undefined || Number.isFinite(value[key])) && (value.options === undefined || record(value.options));
}

/** Local DOM transport only; deliberately has no fetch/WebSocket fallback. */
export function createNativeBridgeClient(target: Window, clientId = crypto.randomUUID()) {
  let state = unavailable('Connecting to ToonHQ…');
  let disposed = false, sequence = 0, nextRequest = 0, session = '';
  const retiredSessions = new Set<string>();
  const groups = new Map<number, any>();
  const updates = new Set<(update: NativeUpdate) => void>();
  const boardingListeners = new Set<(result: any, toonId: number) => void>();
  const pending = new Map<string, { context: string; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const send = (message: object) => {
    if (!disposed) target.dispatchEvent(new CustomEvent(REQUEST, { detail: JSON.stringify({ version: 1, client: clientId, ...message }) }));
  };
  const notify = (update: NativeUpdate) => {
    for (const listener of updates) {
      try { listener(update); } catch (error) { console.error('[ToonHQ+] Native state listener failed.', error); }
    }
  };
  const rejectPending = (reason: string) => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(reason)); }
    pending.clear();
  };
  const receive = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (disposed || typeof detail !== 'string' || detail.length > 4_000_000) return;
    let message: any;
    try { message = JSON.parse(detail); } catch { return; }
    if (!record(message) || message.version !== 1 || message.client !== clientId ||
        typeof message.session !== 'string' || message.session.length > 100 ||
        !Number.isSafeInteger(message.sequence) || message.sequence < 1) return;
    if (message.type === 'state' && !stateMessage(message)) return;
    if (message.type === 'unavailable' && (typeof message.reason !== 'string' || message.reason.length > 300)) return;
    if (!['state', 'unavailable', 'boarding-created', 'boarding-result'].includes(message.type)) return;
    if (message.session !== session) {
      if (retiredSessions.has(message.session) || !(message.type === 'state' && message.full || message.type === 'unavailable')) return;
      if (session) retiredSessions.add(session);
      session = message.session; sequence = 0;
      rejectPending('The connection to ToonHQ restarted. Try again.');
    }
    if (message.sequence <= sequence) return;
    // Every update is ordered. A missed delta requires only a local snapshot.
    if (sequence && message.sequence !== sequence + 1 && !(message.type === 'state' && message.full === true)) {
      sequence = message.sequence;
      send({ type: 'snapshot' });
      return;
    }
    sequence = message.sequence;
    if (message.type === 'state') {
      const candidate = message.state;
      if (state.context !== candidate.context || !candidate.connected) rejectPending('ToonHQ connection or active Toon changed. Try again.');
      if (!message.full && candidate.context !== state.context) { send({ type: 'snapshot' }); return; }
      state = candidate;
      if (message.full || !state.connected) groups.clear();
      for (const value of message.groups) groups.set(value.id, value);
      for (const value of message.archived) groups.delete(value.id);
      notify({ state, full: message.full, groups: message.groups, archived: message.archived });
    } else if (message.type === 'unavailable' && typeof message.reason === 'string') {
      state = unavailable(message.reason.slice(0, 300)); groups.clear(); rejectPending(message.reason);
      notify({ state, full: true, groups: [], archived: [] });
    } else if (message.type === 'boarding-created' && message.context === state.context && state.connected &&
        state.authenticated && message.toonId === state.subscriptionToonId && message.toonId === Number(state.currentToonId) &&
        message.result !== null && validBoardingStatus(message.result)) {
      for (const listener of boardingListeners) {
        try { listener(message.result, message.toonId); } catch (error) { console.error('[ToonHQ+] Boarding listener failed.', error); }
      }
    } else if (message.type === 'boarding-result' && typeof message.id === 'string') {
      const request = pending.get(message.id);
      if (!request) return;
      if (typeof message.error === 'string') { clearTimeout(request.timer); pending.delete(message.id); request.reject(new Error(message.error.slice(0, 300))); }
      else if (message.context === request.context && message.context === state.context && validBoardingStatus(message.result)) {
        clearTimeout(request.timer); pending.delete(message.id); request.resolve(message.result);
      }
    }
  };
  target.addEventListener(MESSAGE, receive);
  return {
    get state() { return state; },
    get disposed() { return disposed; },
    requestSnapshot() { send({ type: 'snapshot' }); },
    subscribe(listener: (update: NativeUpdate) => void) {
      updates.add(listener);
      listener({ state, full: true, groups: Array.from(groups.values()), archived: [] });
      return () => { updates.delete(listener); };
    },
    onBoardingCreated(listener: (result: any, toonId: number) => void) {
      boardingListeners.add(listener);
      return () => { boardingListeners.delete(listener); };
    },
    requestBoarding(toonId: number, timeoutMs = 12_000): Promise<any> {
      if (disposed || !state.connected || !state.authenticated || !id(toonId)) return Promise.reject(new Error(state.reason || 'Quick Teleport status checks are unavailable right now.'));
      if (!state.ownedToons.some(toon => toon.id === toonId && toon.game === 1 && toon.external === true)) return Promise.reject(new Error('Only Toontown Rewritten Toons linked to your ToonHQ account can be checked.'));
      const requestId = `${clientId}:${++nextRequest}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('ToonHQ did not answer the boarding check in time.')); }, timeoutMs);
        pending.set(requestId, { context: state.context, resolve, reject, timer });
        send({ type: 'boarding', id: requestId, toonId });
      });
    },
    dispose() {
      if (disposed) return;
      send({ type: 'dispose' }); disposed = true;
      target.removeEventListener(MESSAGE, receive);
      rejectPending('The connection to ToonHQ closed.');
      updates.clear(); boardingListeners.clear(); groups.clear();
    },
  };
}
let singleton: ReturnType<typeof createNativeBridgeClient> | undefined;
export function getNativeBridge() {
  if (!singleton || singleton.disposed) singleton = createNativeBridgeClient(window);
  return singleton;
}
