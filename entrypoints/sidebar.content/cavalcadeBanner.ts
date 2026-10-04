import { pageFetch } from './pageFetch';

const API_URL = 'https://www.toontownrewritten.com/api/cavalcade';
const FALLBACK_API_URL = 'https://api.toontown.help/cavalcade';
const API_CACHE_KEY = 'toonhqplus-cavalcade-api';
const API_CACHE_TTL = 15_000;
const API_TIMEOUT_MS = 5_000;
const STORAGE_KEY = 'toonhqplus-last-cavalcade';
// Final start and existing end-check limit, in Pacific daylight time.
const FINAL_START = Date.parse('2026-10-20T23:30:00-07:00');
const FINAL_CUTOFF = Date.parse('2026-10-20T23:45:00-07:00');

type Street = { name: string; playground: string; icon: string };
type ApiResponse = { paradeStatus: string; paradeLocation: number; paradeLocationString: string };
type SavedCavalcade = Street & { locationId: number; cycle: string; endedAt: number; sourceUpdatedAt?: number };
type CachedApiResponse = { data: ApiResponse; fetchedAt: number; cycle: string; sourceUpdatedAt?: number };
type FallbackResponse = { data: { cycleKey: string; fetchedAt: string; paradeStatus: string; locationId: number; locationName: string } | null };

const ICON_ROOT = 'https://toondle.town/pg_images';
const STREETS: Record<number, Street> = {
  1100: { name: 'Barnacle Boulevard', playground: "Donald’s Dock", icon: `${ICON_ROOT}/dd.png` },
  1200: { name: 'Seaweed Street', playground: "Donald’s Dock", icon: `${ICON_ROOT}/dd.png` },
  1300: { name: 'Lighthouse Lane', playground: "Donald’s Dock", icon: `${ICON_ROOT}/dd.png` },
  2100: { name: 'Silly Street', playground: 'Toontown Central', icon: `${ICON_ROOT}/ttc.png` },
  2200: { name: 'Loopy Lane', playground: 'Toontown Central', icon: `${ICON_ROOT}/ttc.png` },
  2300: { name: 'Punchline Place', playground: 'Toontown Central', icon: `${ICON_ROOT}/ttc.png` },
  3100: { name: 'Walrus Way', playground: 'The Brrrgh', icon: `${ICON_ROOT}/tb.png` },
  3200: { name: 'Sleet Street', playground: 'The Brrrgh', icon: `${ICON_ROOT}/tb.png` },
  3300: { name: 'Polar Place', playground: 'The Brrrgh', icon: `${ICON_ROOT}/tb.png` },
  4100: { name: 'Alto Avenue', playground: 'Minnie’s Melodyland', icon: `${ICON_ROOT}/mml.png` },
  4200: { name: 'Baritone Boulevard', playground: 'Minnie’s Melodyland', icon: `${ICON_ROOT}/mml.png` },
  4300: { name: 'Tenor Terrace', playground: 'Minnie’s Melodyland', icon: `${ICON_ROOT}/mml.png` },
  5100: { name: 'Elm Street', playground: 'Daisy Gardens', icon: `${ICON_ROOT}/dg.png` },
  5200: { name: 'Maple Street', playground: 'Daisy Gardens', icon: `${ICON_ROOT}/dg.png` },
  5300: { name: 'Oak Street', playground: 'Daisy Gardens', icon: `${ICON_ROOT}/dg.png` },
  9100: { name: 'Lullaby Lane', playground: 'Donald’s Dreamland', icon: `${ICON_ROOT}/ddl.png` },
  9200: { name: 'Pajama Place', playground: 'Donald’s Dreamland', icon: `${ICON_ROOT}/ddl.png` },
};

const pacificClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  minute: '2-digit', second: '2-digit',
});

function getPacificTime(now: Date) {
  const parts = Object.fromEntries(pacificClock.formatToParts(now).map(({ type, value }) => [type, value]));
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const cycleStart = new Date(Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), 30,
  ));
  if (minute < 30) cycleStart.setUTCHours(cycleStart.getUTCHours() - 1);
  return {
    minute,
    millisecondsIntoHour: ((minute * 60) + second) * 1000 + now.getMilliseconds(),
    cycle: `${cycleStart.getUTCFullYear()}-${String(cycleStart.getUTCMonth() + 1).padStart(2, '0')}-${String(cycleStart.getUTCDate()).padStart(2, '0')}T${String(cycleStart.getUTCHours()).padStart(2, '0')}:30`,
  };
}

function duration(milliseconds: number, floor = false) {
  const seconds = Math.max(0, (floor ? Math.floor : Math.ceil)(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function isRechargeWindow(minute: number) {
  return minute >= 45 || minute < 25;
}

function getCycleKey(time: ReturnType<typeof getPacificTime>) {
  if (time.minute < 25 || time.minute >= 30) return time.cycle;
  const nextCycle = new Date(`${time.cycle}:00Z`);
  nextCycle.setUTCHours(nextCycle.getUTCHours() + 1);
  return nextCycle.toISOString().slice(0, 16);
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(fetcher: Fetcher, input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', abort);
  }
}

function readLast(): SavedCavalcade | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as SavedCavalcade | null;
    return parsed?.name && parsed?.playground ? parsed : null;
  } catch {
    return null;
  }
}

function saveLast(value: SavedCavalcade) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { }
}

function readApiCache(cycle: string, minute: number): CachedApiResponse | null {
  try {
    const cached = JSON.parse(localStorage.getItem(API_CACHE_KEY) || 'null') as Partial<CachedApiResponse>;
    const age = Date.now() - Number(cached.fetchedAt);
    if (!cached.data || typeof cached.data.paradeStatus !== 'string' || !Number.isInteger(cached.data.paradeLocation)
      || age < 0 || age >= API_CACHE_TTL || (minute >= 25 && cached.cycle !== cycle)) return null;
    return cached as CachedApiResponse;
  } catch {
    return null;
  }
}

function saveApiCache(data: ApiResponse, cycle: string, sourceUpdatedAt?: number) {
  try {
    const cached: CachedApiResponse = { data, fetchedAt: Date.now(), cycle, sourceUpdatedAt };
    localStorage.setItem(API_CACHE_KEY, JSON.stringify(cached));
  } catch { }
}

function ensureStyles() {
  if (document.querySelector('style[data-toonhq-plus-cavalcade]')) return;
  const style = document.createElement('style');
  style.dataset.toonhqPlusCavalcade = '';
  style.textContent = `
    .toonhq-plus-cavalcade {
      height: 36px; box-sizing: border-box; padding: 2px 14px; display: flex; align-items: center; justify-content: center;
      gap: 9px; border-bottom: 1px solid rgba(255,255,255,.15); background: #213b55;
      color: rgba(255,255,255,.92); font: 700 13px/1.25 Nunito,Arial,sans-serif;
      text-align: center; box-shadow: inset 0 1px rgba(255,255,255,.06);
    }
    .toonhq-plus-cavalcade[data-status="upcoming"] { background: #6b4f16; }
    .toonhq-plus-cavalcade[data-status="active"] { background: #28523d; }
    .toonhq-plus-cavalcade__message { display: block; line-height: 1.25; transform: translateY(1px); }
    .toonhq-plus-cavalcade__icon { width: 31px; height: 31px; flex: 0 0 31px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .toonhq-plus-cavalcade__loading {
      width: 25px; height: 25px; flex: 0 0 25px; box-sizing: border-box; border: 3px solid rgba(255,255,255,.28);
      border-top-color: #92dcff; border-radius: 50%; animation: toonhq-plus-cavalcade-spin .8s linear infinite;
    }
    .toonhq-plus-cavalcade__street { color: #ffe36a; font-weight: 900; }
    .toonhq-plus-cavalcade__playground { color: #c5f078; font-weight: 900; }
    .toonhq-plus-cavalcade__timer { color: #92dcff; font-weight: 900; font-variant-numeric: tabular-nums; }
    @keyframes toonhq-plus-cavalcade-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .toonhq-plus-cavalcade__loading { animation: none; } }
    @media (max-width: 560px) { .toonhq-plus-cavalcade { padding-inline: 8px; font-size: 12px; } }
  `;
  (document.head || document.documentElement).appendChild(style);
}

export function startCavalcadeBanner() {
  if (Date.now() >= FINAL_CUTOFF) return () => {};
  let stopped = false;
  const requests = new AbortController();
  let timer: number | undefined;
  let storageTimer: number | undefined;
  let observer: MutationObserver | undefined;
  ensureStyles();
  let apiData: ApiResponse | null = null;
  let apiDataCycle = '';
  let last = readLast();
  let knownLocation: (Street & { locationId: number }) | null = last;
  let requestInFlight = false;
  let lastAnnouncementFetch = '';
  let lastPollingFetch = '';
  let endedCycle = '';
  let fallbackAttemptedCycle = '';
  const pollingOffsetMs = 2_000 + Math.floor(Math.random() * 4_001);

  const announcementStartedAt = (time: ReturnType<typeof getPacificTime>) => Date.now() - (
    time.minute < 25
      ? time.millisecondsIntoHour + (35 * 60_000)
      : time.millisecondsIntoHour - (25 * 60_000)
  );

  const isCurrentCycleLocation = (
    value: SavedCavalcade | null,
    cycle: string,
    announcedAt: number,
  ): value is SavedCavalcade =>
    value?.cycle === cycle && typeof value.sourceUpdatedAt === 'number' && value.sourceUpdatedAt >= announcedAt;

  const banner = document.createElement('div');
  banner.className = 'toonhq-plus-cavalcade';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  const stop = () => {
    stopped = true;
    requests.abort();
    window.clearInterval(timer);
    window.clearInterval(storageTimer);
    observer?.disconnect();
    banner.remove();
    document.querySelector('style[data-toonhq-plus-cavalcade]')?.remove();
  };
  const expired = () => stopped || Date.now() >= FINAL_CUTOFF
    || (Date.now() >= FINAL_START && endedCycle === '2026-10-20T23:30');

  const attach = () => {
    if (expired()) { stop(); return; }
    const subnav = document.querySelector<HTMLElement>('.subnav-wrapper, .subnav');
    const anchor = subnav?.closest<HTMLElement>('.subnav-wrapper') || subnav;
    if (!anchor) return;
    const subnavItems = anchor.querySelector<HTMLElement>('.subnav__items');
    const collapsedBottomMargin = subnavItems ? Number.parseFloat(getComputedStyle(subnavItems).marginBottom) || 0 : 0;
    banner.style.marginTop = `${-collapsedBottomMargin}px`;
    if (banner.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', banner);
  };

  const saveEnded = (cycle: string) => {
    if (!knownLocation) return;
    last = {
      ...knownLocation,
      cycle,
      endedAt: Date.now(),
      sourceUpdatedAt: last?.cycle === cycle ? last.sourceUpdatedAt : undefined,
    };
    saveLast(last);
  };

  const fetchStatus = async (cycle: string, minute: number, announcedAt: number) => {
    if (expired() || requestInFlight) return;
    const sharedLast = readLast();
    if (minute >= 25 && minute < 38 && isCurrentCycleLocation(sharedLast, cycle, announcedAt)) {
      last = sharedLast;
      knownLocation = sharedLast;
      return;
    }

    // Announcement/end polling must reach the origin/CDN every 15 seconds. Reusing
    // our own 15-second cache here caused every other polling bucket to be skipped.
    const polling = minute >= 25 && minute < 45;
    const cached = polling ? null : readApiCache(cycle, minute);

    requestInFlight = true;
    try {
      let data = cached?.data;
      let sourceUpdatedAt = cached?.sourceUpdatedAt;
      if (!cached) {
        const response = await fetchWithTimeout(pageFetch, API_URL, {
          cache: 'no-cache',
          credentials: 'omit',
          signal: requests.signal,
        });
        if (!response.ok) return;
        data = await response.json() as ApiResponse;
        if (expired()) return;
        const lastModified = Date.parse(response.headers.get('last-modified') || '');
        sourceUpdatedAt = Number.isFinite(lastModified) ? lastModified : undefined;
        saveApiCache(data, cycle, sourceUpdatedAt);
      }
      if (!data || typeof data.paradeStatus !== 'string') return;

      // Cloudflare can briefly return the preceding event at :25. Do not label
      // that payload as this cycle or let it suppress subsequent polling.
      if (minute >= 25 && minute < 38
        && (typeof sourceUpdatedAt !== 'number' || sourceUpdatedAt < announcedAt)) return;

      apiData = data;
      apiDataCycle = cycle;
      const mapped = STREETS[data.paradeLocation];
      if (mapped) {
        knownLocation = {
          ...mapped,
          locationId: data.paradeLocation,
          name: data.paradeLocationString || mapped.name,
        };
        if (minute >= 25 && minute < 45) {
          last = { ...knownLocation, cycle, endedAt: Date.now(), sourceUpdatedAt };
          saveLast(last);
        }
      }
      if (minute >= 38 && minute < 45 && data.paradeStatus !== 'active') {
        endedCycle = cycle;
        saveEnded(cycle);
        if (expired()) stop();
      }
    } catch (error) {
      console.warn('[ToonHQ+] Failed to refresh Cavalcade status:', error);
    } finally {
      requestInFlight = false;
    }
  };

  const fetchFallback = async (cycle: string, announcedAt: number) => {
    if (expired() || fallbackAttemptedCycle === cycle || isCurrentCycleLocation(readLast(), cycle, announcedAt)) return;
    fallbackAttemptedCycle = cycle;
    try {
      const response = await fetchWithTimeout(pageFetch, FALLBACK_API_URL, {
        cache: 'no-store',
        credentials: 'omit',
        signal: requests.signal,
      });
      if (!response.ok) return;
      const result = await response.json() as FallbackResponse;
      if (expired()) return;
      const remote = result.data;
      if (!remote || getPacificTime(new Date(remote.cycleKey)).cycle !== cycle) return;
      const mapped = STREETS[remote.locationId];
      if (!mapped) return;

      last = {
        ...mapped,
        locationId: remote.locationId,
        name: remote.locationName || mapped.name,
        cycle,
        endedAt: Date.parse(remote.fetchedAt) || Date.now(),
        sourceUpdatedAt: Date.parse(remote.fetchedAt) || Date.now(),
      };
      knownLocation = last;
      saveLast(last);
    } catch (error) {
      console.warn('[ToonHQ+] Failed to load cached Cavalcade status:', error);
    }
  };

  const render = () => {
    if (expired()) { stop(); return; }
    attach();
    const now = getPacificTime(new Date());
    const cycle = getCycleKey(now);
    const announcedAt = announcementStartedAt(now);
    const currentApi = apiDataCycle === cycle ? apiData : null;
    const currentCycleLast = isCurrentCycleLocation(last, cycle, announcedAt) ? last : null;
    const upcoming = now.minute >= 25 && now.minute < 30;
    const active = (now.minute >= 30 && now.minute < 38)
      || (now.minute >= 38 && now.minute < 45 && endedCycle !== cycle);
    const location = upcoming || active
      ? (currentApi && STREETS[currentApi.paradeLocation] ? knownLocation : currentCycleLast)
      : currentCycleLast;

    const icon = location
      ? `<img class="toonhq-plus-cavalcade__icon" src="${location.icon}" alt="">`
      : '<span class="toonhq-plus-cavalcade__loading" role="img" aria-label="Checking location"></span>';
    const hasLocation = Boolean(location);
    const place = location
      ? `<span class="toonhq-plus-cavalcade__street">${location.name}</span> in <span class="toonhq-plus-cavalcade__playground">${location.playground}</span>`
      : 'an announced street';

    banner.dataset.status = upcoming ? 'upcoming' : active ? 'active' : 'ended';
    let markup: string;
    let timerText: string;
    if (upcoming) {
      const countdown = duration((30 * 60_000) - now.millisecondsIntoHour);
      timerText = countdown;
      markup = hasLocation
        ? `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade is about to take place on ${place} · Starts in <span class="toonhq-plus-cavalcade__timer">${countdown}</span>.</span>`
        : `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade location is being announced · Starts in <span class="toonhq-plus-cavalcade__timer">${countdown}</span>.</span>`;
    } else if (active) {
      const elapsed = duration(now.millisecondsIntoHour - (30 * 60_000), true);
      timerText = elapsed;
      markup = hasLocation
        ? `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade is currently on ${place} · <span class="toonhq-plus-cavalcade__timer">${elapsed}</span> elapsed.</span>`
        : `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade has started · <span class="toonhq-plus-cavalcade__timer">${elapsed}</span> elapsed.</span>`;
    } else {
      const next = now.minute < 25
        ? (25 * 60_000) - now.millisecondsIntoHour
        : (85 * 60_000) - now.millisecondsIntoHour;
      const previous = currentCycleLast ? `Last location: ${place} · ` : '';
      timerText = duration(next);
      markup = `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade is recharging · ${previous}Next location announcement in <span class="toonhq-plus-cavalcade__timer">${timerText}</span>.</span>`;
    }
    const layoutKey = `${banner.dataset.status}:${location?.locationId ?? 'loading'}:${location?.name ?? ''}`;
    if (banner.dataset.layoutKey === layoutKey) {
      const timer = banner.querySelector<HTMLElement>('.toonhq-plus-cavalcade__timer');
      if (timer && timer.textContent !== timerText) timer.textContent = timerText;
    } else {
      banner.innerHTML = markup;
      banner.dataset.layoutKey = layoutKey;
    }

    const waitingForLocation = now.minute >= 25 && now.minute < 38
      && !STREETS[currentApi?.paradeLocation ?? 0]
      && !currentCycleLast;
    if (waitingForLocation) {
      const pollingElapsed = now.millisecondsIntoHour - (25 * 60_000) - pollingOffsetMs;
      const announcementBucket = `${cycle}:${Math.floor(pollingElapsed / 15_000)}`;
      if (pollingElapsed >= 0 && lastAnnouncementFetch !== announcementBucket) {
        lastAnnouncementFetch = announcementBucket;
        void fetchStatus(cycle, now.minute, announcedAt);
      }
    }
    if (now.minute >= 38 && now.minute < 45 && endedCycle !== cycle) {
      const pollingElapsed = now.millisecondsIntoHour - (38 * 60_000) - pollingOffsetMs;
      const bucket = `${cycle}:${Math.floor(pollingElapsed / 15_000)}`;
      if (pollingElapsed >= 0 && lastPollingFetch !== bucket) {
        lastPollingFetch = bucket;
        void fetchStatus(cycle, now.minute, announcedAt);
      }
    }
    if (!upcoming && !active && !currentCycleLast) void fetchFallback(cycle, announcedAt);
  };

  render();
  if (stopped) return stop;
  timer = window.setInterval(render, 250);
  storageTimer = window.setInterval(() => {
    if (expired()) { stop(); return; }
    const now = getPacificTime(new Date());
    const cycle = getCycleKey(now);
    const sharedLast = readLast();
    if (!isCurrentCycleLocation(sharedLast, cycle, announcementStartedAt(now))) return;
    if (sharedLast.cycle === last?.cycle
      && sharedLast.locationId === last.locationId
      && sharedLast.sourceUpdatedAt === last.sourceUpdatedAt) return;
    last = sharedLast;
    knownLocation = sharedLast;
  }, 3_000);
  observer = new MutationObserver(attach);
  observer.observe(document.body, { childList: true, subtree: true });

  return stop;
}
