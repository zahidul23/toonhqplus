import { pageFetch } from './pageFetch';

const API_URL = 'https://www.toontownrewritten.com/api/cavalcade';
const STORAGE_KEY = 'toonhqplus-last-cavalcade';

type Street = { name: string; playground: string; icon: string };
type ApiResponse = { paradeStatus: string; paradeLocation: number; paradeLocationString: string };
type SavedCavalcade = Street & { locationId: number; endedAt: number };

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
  return {
    minute,
    millisecondsIntoHour: ((minute * 60) + second) * 1000 + now.getMilliseconds(),
    cycle: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`,
  };
}

function duration(milliseconds: number, floor = false) {
  const seconds = Math.max(0, (floor ? Math.floor : Math.ceil)(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function readLast(): SavedCavalcade | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as SavedCavalcade | null;
    return parsed?.name && parsed?.playground ? parsed : null;
  } catch {
    return null;
  }
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
    .toonhq-plus-cavalcade__street { color: #ffe36a; font-weight: 900; }
    .toonhq-plus-cavalcade__playground { color: #c5f078; font-weight: 900; }
    .toonhq-plus-cavalcade__timer { color: #92dcff; font-weight: 900; font-variant-numeric: tabular-nums; }
    @media (max-width: 560px) { .toonhq-plus-cavalcade { padding-inline: 8px; font-size: 12px; } }
  `;
  (document.head || document.documentElement).appendChild(style);
}

export function startCavalcadeBanner() {
  ensureStyles();
  let apiData: ApiResponse | null = null;
  let last = readLast();
  let knownLocation: (Street & { locationId: number }) | null = last;
  let requestInFlight = false;
  let initialFetchStarted = false;
  let lastAnnouncementFetch = '';
  let lastPollingFetch = '';
  let endedCycle = '';

  const banner = document.createElement('div');
  banner.className = 'toonhq-plus-cavalcade';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  const attach = () => {
    const subnav = document.querySelector<HTMLElement>('.subnav-wrapper, .subnav');
    const anchor = subnav?.closest<HTMLElement>('.subnav-wrapper') || subnav;
    if (!anchor) return;
    const subnavItems = anchor.querySelector<HTMLElement>('.subnav__items');
    const collapsedBottomMargin = subnavItems ? Number.parseFloat(getComputedStyle(subnavItems).marginBottom) || 0 : 0;
    banner.style.marginTop = `${-collapsedBottomMargin}px`;
    if (banner.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', banner);
  };

  const saveEnded = () => {
    if (!knownLocation) return;
    last = { ...knownLocation, endedAt: Date.now() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(last)); } catch { }
  };

  const fetchStatus = async (cycle: string, minute: number) => {
    if (requestInFlight) return;
    requestInFlight = true;
    try {
      const response = await pageFetch(API_URL, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) return;
      const data = await response.json() as ApiResponse;
      if (typeof data.paradeStatus !== 'string') return;
      apiData = data;
      const mapped = STREETS[data.paradeLocation];
      if (mapped) knownLocation = { ...mapped, locationId: data.paradeLocation };
      if (minute >= 38 && data.paradeStatus !== 'active') {
        endedCycle = cycle;
        saveEnded();
      }
    } catch (error) {
      console.warn('[ToonHQ+] Failed to refresh Cavalcade status:', error);
    } finally {
      requestInFlight = false;
    }
  };

  const render = () => {
    attach();
    const now = getPacificTime(new Date());
    const upcoming = now.minute >= 25 && now.minute < 30;
    const active = (now.minute >= 30 && now.minute < 38) || (now.minute >= 38 && apiData?.paradeStatus === 'active');
    const location = upcoming || active
      ? (apiData && STREETS[apiData.paradeLocation] ? knownLocation : null)
      : last;

    const icon = location ? `<img class="toonhq-plus-cavalcade__icon" src="${location.icon}" alt="">` : '';
    const hasLocation = Boolean(location);
    const place = location
      ? `<span class="toonhq-plus-cavalcade__street">${location.name}</span> in <span class="toonhq-plus-cavalcade__playground">${location.playground}</span>`
      : 'an announced street';

    banner.dataset.status = upcoming ? 'upcoming' : active ? 'active' : 'ended';
    let markup: string;
    if (upcoming) {
      const countdown = duration((30 * 60_000) - now.millisecondsIntoHour);
      markup = hasLocation
        ? `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade is about to take place on ${place} · Starts in <span class="toonhq-plus-cavalcade__timer">${countdown}</span>.</span>`
        : `<span class="toonhq-plus-cavalcade__message">The Cavalcade location is being announced · Starts in <span class="toonhq-plus-cavalcade__timer">${countdown}</span>.</span>`;
    } else if (active) {
      const elapsed = duration(now.millisecondsIntoHour - (30 * 60_000), true);
      markup = hasLocation
        ? `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade has started on ${place} · <span class="toonhq-plus-cavalcade__timer">${elapsed}</span> elapsed.</span>`
        : `<span class="toonhq-plus-cavalcade__message">The Cavalcade has started · <span class="toonhq-plus-cavalcade__timer">${elapsed}</span> elapsed (retrying location…)</span>`;
    } else {
      const next = now.minute < 25
        ? (25 * 60_000) - now.millisecondsIntoHour
        : (85 * 60_000) - now.millisecondsIntoHour;
      const previous = last ? `Last location: ${place} · ` : '';
      markup = `${icon}<span class="toonhq-plus-cavalcade__message">The Cavalcade has ended · ${previous}Next announcement in <span class="toonhq-plus-cavalcade__timer">${duration(next)}</span>.</span>`;
    }
    if (banner.innerHTML !== markup) banner.innerHTML = markup;

    if (!initialFetchStarted) {
      initialFetchStarted = true;
      void fetchStatus(now.cycle, now.minute);
    }
    const waitingForLocation = now.minute >= 25 && now.minute < 38
      && !STREETS[apiData?.paradeLocation ?? 0];
    if (waitingForLocation) {
      const announcementBucket = `${now.cycle}:${Math.floor((now.millisecondsIntoHour - (25 * 60_000)) / 15_000)}`;
      if (lastAnnouncementFetch !== announcementBucket) {
        lastAnnouncementFetch = announcementBucket;
        void fetchStatus(now.cycle, now.minute);
      }
    }
    if (now.minute >= 38 && endedCycle !== now.cycle) {
      const bucket = `${now.cycle}:${Math.floor((now.millisecondsIntoHour - (38 * 60_000)) / 15_000)}`;
      if (lastPollingFetch !== bucket) {
        lastPollingFetch = bucket;
        void fetchStatus(now.cycle, now.minute);
      }
    }
  };

  render();
  const timer = window.setInterval(render, 250);
  const observer = new MutationObserver(attach);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.clearInterval(timer);
    observer.disconnect();
    banner.remove();
    document.querySelector('style[data-toonhq-plus-cavalcade]')?.remove();
  };
}
