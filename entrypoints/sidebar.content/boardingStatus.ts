import { getNativeBridge } from './nativeBridge.ts';

export type BoardingGroupStatus = null | {
  district?: number | null;
  location?: number | null;
  type?: number | null;
  options?: Record<string, number> | null;
  num_players?: number | null;
  [key: string]: unknown;
};

/** Coalesce callers' checks. Native ToonHQ owns the nonce, SID, authentication,
 * subscription and socket response. Scheduling/cooldowns belong to the caller. */
export function createBoardingStatusService(bridge: ReturnType<typeof getNativeBridge>) {
  const recent = new Map<number, BoardingGroupStatus>();
  const failures = new Map<number, { error: Error; until: number }>();
  const inFlight = new Map<number, Promise<BoardingGroupStatus>>();
  const createdVersions = new Map<number, number>();
  const listeners = new Set<(status: Exclude<BoardingGroupStatus, null>) => void>();
  let context = '', disposed = false;
  const stopState = bridge.subscribe(update => {
    if (context !== update.state.context || !update.state.connected) {
      context = update.state.context; recent.clear(); failures.clear(); inFlight.clear(); createdVersions.clear();
    }
  });
  const stopCreated = bridge.onBoardingCreated((status, toonId) => {
    createdVersions.set(toonId, (createdVersions.get(toonId) || 0) + 1);
    recent.set(toonId, status); failures.delete(toonId);
    for (const listener of listeners) {
      try { listener(status); } catch (error) { console.error('[ToonHQ+] Boarding status listener failed.', error); }
    }
  });
  return {
    getCached(toonId: number) { return recent.get(toonId); },
    subscribe(listener: (status: Exclude<BoardingGroupStatus, null>) => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    get(toonId: number, forceRefresh = false): Promise<BoardingGroupStatus> {
      if (disposed) return Promise.reject(new Error('The connection to ToonHQ closed.'));
      const existing = inFlight.get(toonId);
      if (existing) return existing;
      if (forceRefresh) { recent.delete(toonId); failures.delete(toonId); }
      if (recent.has(toonId)) return Promise.resolve(recent.get(toonId)!);
      const failure = failures.get(toonId);
      if (failure && failure.until > Date.now()) return Promise.reject(failure.error);
      const requestContext = context;
      const createdVersion = createdVersions.get(toonId);
      const request = bridge.requestBoarding(toonId).then(result => {
        if (disposed || context !== requestContext) throw new Error('ToonHQ connection or active Toon changed. Try again.');
        if (createdVersions.get(toonId) !== createdVersion) return recent.get(toonId)!;
        recent.set(toonId, result); failures.delete(toonId); return result;
      }).catch(error => {
        if (!disposed && context === requestContext) {
          if (createdVersions.get(toonId) !== createdVersion) return recent.get(toonId)!;
          failures.set(toonId, { error, until: Date.now() + 30_000 });
        }
        throw error;
      }).finally(() => { if (inFlight.get(toonId) === request) inFlight.delete(toonId); });
      inFlight.set(toonId, request);
      return request;
    },
    dispose() { disposed = true; stopState(); stopCreated(); recent.clear(); failures.clear(); inFlight.clear(); createdVersions.clear(); listeners.clear(); },
  };
}
let service: ReturnType<typeof createBoardingStatusService> | undefined;
let serviceBridge: ReturnType<typeof getNativeBridge> | undefined;
function getService() {
  const bridge = getNativeBridge();
  if (bridge !== serviceBridge) { service?.dispose(); serviceBridge = bridge; service = createBoardingStatusService(bridge); }
  return service!;
}
export function disposeBoardingStatus() { service?.dispose(); service = undefined; serviceBridge = undefined; }
export function onBoardingCreated(listener: (status: Exclude<BoardingGroupStatus, null>) => void) { return getService().subscribe(listener); }
export function getCachedBoardingGroupStatus(toonId: number) { return getService().getCached(toonId); }
export function getBoardingGroupStatus(toonId: number, forceRefresh = false) { return getService().get(toonId, forceRefresh); }
