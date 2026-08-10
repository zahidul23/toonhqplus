export type BoardingGroupStatus = null | {
  district?: number;
  location?: number;
  type?: number;
  options?: Record<string, number>;
  num_players?: number;
  [key: string]: unknown;
};

type BoardingResponse = {
  success: boolean;
  nonce: number;
  result: BoardingGroupStatus;
  message?: string;
};

type PendingRequest = {
  resolve: (result: BoardingGroupStatus) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let groupsSocketSid: string | null = null;
const socketReadyWaiters = new Set<(sid: string) => void>();
let nextNonce = 1;
const pendingRequests = new Map<number, PendingRequest>();
const inFlightByToon = new Map<number, Promise<BoardingGroupStatus>>();
const recentStatusByToon = new Map<number, { result: BoardingGroupStatus; expiresAt: number }>();
const BOARDING_STATUS_CACHE_MS = 30_000;

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function setBoardingGroupsSocketSid(sid: string | null): void {
  groupsSocketSid = sid;
  if (sid) {
    for (const resolve of socketReadyWaiters) resolve(sid);
    socketReadyWaiters.clear();
  }
}

function waitForGroupsSocketSid(): Promise<string> {
  if (groupsSocketSid) return Promise.resolve(groupsSocketSid);

  return new Promise((resolve, reject) => {
    const handleReady = (sid: string) => {
      clearTimeout(timeout);
      socketReadyWaiters.delete(handleReady);
      resolve(sid);
    };
    const timeout = setTimeout(() => {
      socketReadyWaiters.delete(handleReady);
      reject(new Error('Could not connect to ToonHQ groups. Refresh the page and try again.'));
    }, 12_000);
    socketReadyWaiters.add(handleReady);
  });
}

export function rejectPendingBoardingRequests(message = 'The ToonHQ groups connection closed.'): void {
  groupsSocketSid = null;
  for (const request of pendingRequests.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error(message));
  }
  pendingRequests.clear();
}

export function handleBoardingResponse(response: BoardingResponse): boolean {
  console.log('[ToonHQ+] boarding_response:', response);
  const nonce = Number(response?.nonce);
  const pending = pendingRequests.get(nonce);
  if (!pending) return false;

  pendingRequests.delete(nonce);
  clearTimeout(pending.timeout);
  if (response.success) pending.resolve(response.result);
  else pending.reject(new Error(response.message || 'ToonHQ could not check this Toon.'));
  return true;
}

async function requestBoardingGroupStatus(toonId: number): Promise<BoardingGroupStatus> {
  const socketSid = await waitForGroupsSocketSid();

  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new Error('Could not read ToonHQ\'s CSRF token. Refresh the page and try again.');

  const nonce = nextNonce++;
  const resultPromise = new Promise<BoardingGroupStatus>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(nonce);
      reject(new Error('ToonHQ did not answer the boarding-group check in time.'));
    }, 12_000);
    pendingRequests.set(nonce, { resolve, reject, timeout });
  });

  try {
    const response = await fetch('/api/groups/boarding_request/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-CSRFToken': csrfToken,
      },
      body: JSON.stringify({ toon: toonId, sid: socketSid, request: 'get_boarding_group', nonce }),
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.json();
        message = body?.detail || body?.error || Object.values(body || {}).flat().join(' ') || message;
      } catch { }
      throw new Error(message || `ToonHQ returned ${response.status}.`);
    }
  } catch (error) {
    const pending = pendingRequests.get(nonce);
    if (pending) clearTimeout(pending.timeout);
    pendingRequests.delete(nonce);
    throw error;
  }

  return resultPromise;
}

export function getBoardingGroupStatus(toonId: number, forceRefresh = false): Promise<BoardingGroupStatus> {
  if (forceRefresh) recentStatusByToon.delete(toonId);
  const cached = recentStatusByToon.get(toonId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.result);
  if (cached) recentStatusByToon.delete(toonId);

  const existing = inFlightByToon.get(toonId);
  if (existing) return existing;

  const request = requestBoardingGroupStatus(toonId)
    .then(result => {
      recentStatusByToon.set(toonId, { result, expiresAt: Date.now() + BOARDING_STATUS_CACHE_MS });
      return result;
    })
    .finally(() => {
      if (inFlightByToon.get(toonId) === request) inFlightByToon.delete(toonId);
    });
  inFlightByToon.set(toonId, request);
  return request;
}
