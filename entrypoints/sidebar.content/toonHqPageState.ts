export type ToonHqPageState = {
  user?: unknown;
  toons?: unknown;
  socket_auth?: unknown;
  [key: string]: unknown;
};

let cachedState: ToonHqPageState | null | undefined;

export function getToonHqPageState(): ToonHqPageState | null {
  if (cachedState !== undefined) return cachedState;

  for (const script of Array.from(document.scripts)) {
    const source = script.textContent || '';
    const marker = 'window.STATE = ';
    const start = source.indexOf(marker);
    if (start < 0) continue;
    const jsonStart = start + marker.length;
    const jsonEnd = source.indexOf(';', jsonStart);
    if (jsonEnd < 0) continue;
    try {
      const state = JSON.parse(source.slice(jsonStart, jsonEnd));
      const parsedState: ToonHqPageState | null = state && typeof state === 'object' ? state : null;
      cachedState = parsedState;
      return parsedState;
    } catch { }
  }

  cachedState = null;
  return cachedState;
}

export function isToonHqAuthenticated(): boolean {
  const accounts = getPersistedAccountsState();
  if (accounts) {
    if (accounts.user) return true;
    if (accounts.currentToon != null) return true;
    const toons = accounts.toons;
    if (Array.isArray(toons) ? toons.length > 0 : !!toons && typeof toons === 'object' && Object.keys(toons).length > 0) return true;
    if (Object.prototype.hasOwnProperty.call(accounts, 'user')) return false;
  }
  return !!getToonHqPageState()?.user;
}

function getPersistedAccountsState(): Record<string, unknown> | null {
  try {
    const accounts = JSON.parse(localStorage.getItem('vuex') || 'null')?.accounts;
    return accounts && typeof accounts === 'object' ? accounts : null;
  } catch {
    return null;
  }
}

export function getToonHqOwnedToons(): unknown[] | null {
  const persistedToons = getPersistedAccountsState()?.toons;
  if (Array.isArray(persistedToons)) return persistedToons;
  if (persistedToons && typeof persistedToons === 'object') return Object.values(persistedToons);

  const embeddedToons = getToonHqPageState()?.toons;
  if (Array.isArray(embeddedToons)) return embeddedToons;
  if (embeddedToons && typeof embeddedToons === 'object') return Object.values(embeddedToons);
  return null;
}

export function takeEmbeddedSocketAuthToken(): string | null {
  const state = getToonHqPageState();
  const token = state?.socket_auth;
  if (typeof token !== 'string' || !token) return null;
  state.socket_auth = null;
  return token;
}
