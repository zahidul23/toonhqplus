import React, { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { BoardingGroupStatus, getBoardingGroupStatus, getCachedBoardingGroupStatus, onBoardingCreated } from './boardingStatus';
import { getSettings, setSetting } from './db';
import { getToonSuitLevel } from './toonUtils';
import { getToonHqActiveToonId } from './toonHqPageState';
import { pageFetch } from './pageFetch';
import { getNativeBridge, isToonInListedGroup, validBoardingStatus } from './nativeBridge';
import { NativeStatusText } from './NativeConnectionStatus';

type SuitKey = 'sellbot' | 'cashbot' | 'lawbot' | 'bossbot';
type Toon = { id: number; name: string; game?: number; photo?: string; sellbot?: unknown; cashbot?: unknown; lawbot?: unknown; bossbot?: unknown };
type District = { id: number; name: string; game: number; speedchat_only?: boolean };
type Location = { id: number; name: string; game: number };
type DistrictPopulationSnapshot = { populationByDistrict: Record<string, number>; fetchedAt: number };

type Destination = {
  label: string;
  description: string;
  type: number;
  location: number;
  options: Record<string, number>;
  maxPlayers: number;
  cardBg: string;
  cardBorder: string;
  suitKey: SuitKey;
};

function getDestinationFullName(destination: Destination): string {
  return destination.maxPlayers === 4 ? destination.description : destination.label;
}

function getExtensionImageUrl(path: string): string {
  return browser.runtime.getURL(path.replace(/^\/+/, '') as any);
}

const DESTINATIONS: Destination[] = [
  { label: 'VP', description: 'Sellbot HQ boss lobby', type: 3, location: 23, options: {}, maxPlayers: 8, cardBg: '#7b00ae', cardBorder: '#b54de4', suitKey: 'sellbot' },
  { label: 'CFO', description: 'Cashbot HQ boss lobby', type: 5, location: 5, options: {}, maxPlayers: 8, cardBg: '#147529', cardBorder: '#35c75a', suitKey: 'cashbot' },
  { label: 'CJ', description: 'Lawbot HQ boss lobby', type: 7, location: 12, options: {}, maxPlayers: 8, cardBg: '#2956a5', cardBorder: '#6ba6ff', suitKey: 'lawbot' },
  { label: 'CEO', description: 'Bossbot HQ boss lobby', type: 9, location: 4, options: {}, maxPlayers: 8, cardBg: '#65452e', cardBorder: '#b97a4d', suitKey: 'bossbot' },

  { label: 'Steel', description: 'Steel Factory', type: 2, location: 23, options: { '3': 11, '4': 13 }, maxPlayers: 4, cardBg: '#7b00ae', cardBorder: '#b54de4', suitKey: 'sellbot' },
  { label: 'Bullion', description: 'Bullion Mint', type: 4, location: 5, options: { '7': 20 }, maxPlayers: 4, cardBg: '#147529', cardBorder: '#35c75a', suitKey: 'cashbot' },
  { label: 'Senior', description: 'Senior Wing', type: 6, location: 12, options: { '9': 26 }, maxPlayers: 4, cardBg: '#2956a5', cardBorder: '#6ba6ff', suitKey: 'lawbot' },
  { label: 'Fringe', description: 'Final Fringe', type: 8, location: 4, options: { '10': 29 }, maxPlayers: 4, cardBg: '#65452e', cardBorder: '#b97a4d', suitKey: 'bossbot' },

  { label: 'Scrap', description: 'Scrap Factory', type: 2, location: 23, options: { '3': 10, '4': 12 }, maxPlayers: 4, cardBg: '#7b00ae', cardBorder: '#b54de4', suitKey: 'sellbot' },
  { label: 'Coin', description: 'Coin Mint', type: 4, location: 5, options: { '7': 18 }, maxPlayers: 4, cardBg: '#147529', cardBorder: '#35c75a', suitKey: 'cashbot' },
  { label: 'Junior', description: 'Junior Wing', type: 6, location: 12, options: { '9': 23 }, maxPlayers: 4, cardBg: '#2956a5', cardBorder: '#6ba6ff', suitKey: 'lawbot' },
  { label: 'Fairway', description: 'First Fairway', type: 8, location: 4, options: { '10': 27 }, maxPlayers: 4, cardBg: '#65452e', cardBorder: '#b97a4d', suitKey: 'bossbot' },
];

const TTR_DISTRICTS: District[] = [
  { id: 1, name: 'Zapwood', game: 1, speedchat_only: false },
  { id: 21, name: 'Gulp Gulch', game: 1, speedchat_only: true },
  { id: 25, name: 'Splashport', game: 1, speedchat_only: false },
  { id: 26, name: 'Hiccup Hills', game: 1, speedchat_only: false },
  { id: 27, name: 'Kaboom Cliffs', game: 1, speedchat_only: false },
  { id: 28, name: 'Whoosh Rapids', game: 1, speedchat_only: true },
  { id: 29, name: 'Splat Summit', game: 1, speedchat_only: false },
  { id: 30, name: 'Bounceboro', game: 1, speedchat_only: false },
  { id: 31, name: 'Zoink Falls', game: 1, speedchat_only: false },
  { id: 32, name: 'Boingbury', game: 1, speedchat_only: true },
  { id: 33, name: 'Thwackville', game: 1, speedchat_only: false },
  { id: 34, name: 'Fizzlefield', game: 1, speedchat_only: false },
  { id: 36, name: 'Blam Canyon', game: 1, speedchat_only: false },
  { id: 93, name: 'Splatville', game: 1, speedchat_only: false },
].sort((a, b) => a.name.localeCompare(b.name));

const DISTRICT_POPULATION_STORAGE_KEY = 'toonhqplus-district-population';

function DistrictIndicators({ district, population }: { district: District; population?: number }) {
  const level = population == null ? null : population >= 500 ? 'bg-red-600' : population >= 301 ? 'bg-[#168653]' : 'bg-blue-600';
  const populationLabel = population == null ? '' : population >= 500
    ? `Full District (500+ Toons)\nCurrent population: ${population}`
    : population >= 301
      ? `Ideal District (301–499 Toons)\nCurrent population: ${population}`
      : `Quiet District (0–300 Toons)\nCurrent population: ${population}`;

  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 pl-1.5">
      {district.speedchat_only && (
        <DistrictIndicatorBadge label="SpeedChat-Only District: SpeedChat+ messages are unavailable here." colorClass="bg-red-600">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[11px] w-[11px] fill-current"><path d="M11 5 6 9H2v6h4l5 4V5Zm8.1 7 2.45-2.45-1.4-1.4L17.7 10.6l-2.45-2.45-1.4 1.4L16.3 12l-2.45 2.45 1.4 1.4 2.45-2.45 2.45 2.45 1.4-1.4L19.1 12Z" /></svg>
        </DistrictIndicatorBadge>
      )}
      {population != null && (
        <DistrictIndicatorBadge label={populationLabel} colorClass={level || ''} widthClass="min-w-[17px] w-auto px-1 text-[9px] font-bold leading-none tabular-nums">
          {population}
        </DistrictIndicatorBadge>
      )}
    </span>
  );
}

function DistrictIndicatorBadge({ label, colorClass, widthClass = 'w-[17px]', children }: { label: string; colorClass: string; widthClass?: string; children?: React.ReactNode }) {
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const showTooltip = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTooltipPosition({ left: rect.left - 7, top: rect.top + rect.height / 2 });
  };
  return (
    <span
      aria-label={label}
      className={`inline-flex h-[17px] ${widthClass} cursor-help items-center justify-center rounded-full text-white shadow ${colorClass}`}
      onMouseEnter={event => showTooltip(event.currentTarget)}
      onMouseLeave={() => setTooltipPosition(null)}
    >
      {children}
      {tooltipPosition && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-max max-w-[250px] -translate-x-full -translate-y-1/2 whitespace-pre-line rounded-md bg-[#111827] px-[9px] py-[7px] text-left font-sans text-xs font-medium leading-[1.35] text-white shadow-2xl"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

const TTR_LOCATIONS: Location[] = [
  { id: 1, name: 'Alto Avenue', game: 1 },
  { id: 2, name: 'Baritone Boulevard', game: 1 },
  { id: 3, name: 'Barnacle Boulevard', game: 1 },
  { id: 4, name: 'Bossbot HQ', game: 1 },
  { id: 5, name: 'Cashbot HQ', game: 1 },
  { id: 6, name: 'Chip \'n Dale\'s Acorn Acres', game: 1 },
  { id: 7, name: 'Daisy Gardens Playground', game: 1 },
  { id: 8, name: 'Donald\'s Dock Playground', game: 1 },
  { id: 9, name: 'Donald\'s Dreamland Playground', game: 1 },
  { id: 10, name: 'Elm Street', game: 1 },
  { id: 11, name: 'Goofy Speedway', game: 1 },
  { id: 12, name: 'Lawbot HQ', game: 1 },
  { id: 13, name: 'Lighthouse Lane', game: 1 },
  { id: 14, name: 'Loopy Lane', game: 1 },
  { id: 15, name: 'Lullaby Lane', game: 1 },
  { id: 16, name: 'Maple Street', game: 1 },
  { id: 17, name: 'Minnie\'s Melodyland Playground', game: 1 },
  { id: 18, name: 'Oak Street', game: 1 },
  { id: 19, name: 'Pajama Place', game: 1 },
  { id: 20, name: 'Polar Place', game: 1 },
  { id: 21, name: 'Punchline Place', game: 1 },
  { id: 22, name: 'Seaweed Street', game: 1 },
  { id: 23, name: 'Sellbot HQ', game: 1 },
  { id: 24, name: 'Silly Street', game: 1 },
  { id: 25, name: 'Sleet Street', game: 1 },
  { id: 26, name: 'Tenor Terrace', game: 1 },
  { id: 27, name: 'The Brrrgh Playground', game: 1 },
  { id: 28, name: 'Toontown Central Playground', game: 1 },
  { id: 29, name: 'Walrus Way', game: 1 },
  { id: 73, name: 'Sellbot Task Force Hideout', game: 1 },
];

const DESTINATION_ROWS = [
  { label: 'Sellbot', indices: [0, 4, 8], image: getExtensionImageUrl('images/suits/Sellbot.png'), color: '#9a21c7' },
  { label: 'Cashbot', indices: [1, 5, 9], image: getExtensionImageUrl('images/suits/Cashbot.png'), color: '#23953c' },
  { label: 'Lawbot', indices: [2, 6, 10], image: getExtensionImageUrl('images/suits/Lawbot.png'), color: '#3972cf' },
  { label: 'Bossbot', indices: [3, 7, 11], image: getExtensionImageUrl('images/suits/Bossbot.png'), color: '#8b5b39' },
];

const LOCATION_REFRESH_COOLDOWN_SECONDS = 10;
const BOARDING_GROUP_COOLDOWN_SECONDS = 5 * 60;
const AUTO_BOARDING_CHECK_COOLDOWN_MS = 60_000;
const TELEPORT_VERIFICATION_DELAY_MS = 10_000;
const DESTINATION_SETTING = 'quick-teleport-destination';
const LAST_AUTO_BOARDING_CHECK_KEY = 'toonhqplus-quick-teleport-last-auto-boarding-check';
const MANUAL_REFRESH_STATUS = 'Use Refresh to check this Toon\'s current location and boarding-group status.';

type PersistedAutoBoardingCheck = { checkedAt: number; result?: BoardingGroupStatus };

function getPersistedAutoBoardingCheck(toonId: string): PersistedAutoBoardingCheck | null {
  try {
    const raw = localStorage.getItem(`${LAST_AUTO_BOARDING_CHECK_KEY}:${toonId}`);
    if (!raw) return null;
    const value = JSON.parse(raw);
    // Preserve cooldowns saved by earlier versions, including timestamp-only entries.
    if (typeof value === 'number' && Number.isFinite(value)) return { checkedAt: value };
    if (!value || typeof value !== 'object' || !Number.isFinite(value.checkedAt)) return null;
    const persisted: PersistedAutoBoardingCheck = { checkedAt: value.checkedAt };
    if (Object.prototype.hasOwnProperty.call(value, 'result') && validBoardingStatus(value.result)) persisted.result = value.result;
    return persisted;
  } catch { return null; }
}

function setPersistedAutoBoardingCheck(toonId: string, value: PersistedAutoBoardingCheck): void {
  try { localStorage.setItem(`${LAST_AUTO_BOARDING_CHECK_KEY}:${toonId}`, JSON.stringify(value)); } catch { }
}

function HoverTooltip({ id, children, placement = 'center' }: { id: string; children: React.ReactNode; placement?: 'left' | 'center' | 'right' }) {
  const positionClass = placement === 'left'
    ? 'left-0'
    : placement === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';
  return (
    <div id={id} role="tooltip" className={`pointer-events-none invisible absolute bottom-full z-[90] mb-2 w-max max-w-[min(12rem,calc(100vw-1rem))] rounded-lg border border-rose-200/20 bg-[#3a2028] px-2.5 py-2 text-center text-[10px] font-medium leading-relaxed text-rose-50 opacity-0 shadow-2xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${positionClass}`}>
      {children}
    </div>
  );
}

// Like HoverTooltip, but tied to one of the two action buttons.
function ActionHint({ id, children, action }: { id: string; children: React.ReactNode; action: 'teleport' | 'list' }) {
  // Tailwind needs the full class names written out. Each hint is pinned to its outer
  // edge so it stays inside the sidebar, which clips anything past its border.
  const visibility = action === 'teleport'
    ? 'group-hover/teleport:visible group-hover/teleport:opacity-100 group-focus-within/teleport:visible group-focus-within/teleport:opacity-100 left-0'
    : 'group-hover/list:visible group-hover/list:opacity-100 group-focus-within/list:visible group-focus-within/list:opacity-100 right-0';
  return (
    <div id={id} role="tooltip" className={`pointer-events-none invisible absolute bottom-full z-[90] mb-2 w-max max-w-[min(12rem,calc(100vw-1rem))] rounded-lg border border-rose-200/20 bg-[#3a2028] px-2.5 py-2 text-center text-[10px] font-medium leading-relaxed text-rose-50 opacity-0 shadow-2xl transition-opacity ${visibility}`}>
      {children}
    </div>
  );
}

// Half-width action button; the department colors are set inline. 11px text with px-2 leaves
// ~113px, enough for the longest labels ("Teleport to Fairway", "List Fairway on HQ").
const ACTION_BUTTON_CLASS = 'w-full truncate whitespace-nowrap rounded-lg border px-2 py-2 text-[11px] font-black text-white shadow transition-all [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

type GroupFields = { type: number; district: number; location: number; options: Record<string, number>; max_players: number | null; num_players: number };

// The lobby matching an in-game boarding group: same type and every option equal.
function findDestinationForBoarding(type: unknown, options: Record<string, number>): Destination | undefined {
  return DESTINATIONS.find(destination => destination.type === type &&
    Object.entries(destination.options).every(([key, value]) => options[key] === value));
}

// ToonHQ group fields copied from the Toon's in-game boarding group, or null if they can't be read.
function getInGameGroup(status: Exclude<BoardingGroupStatus, null>): { fields: GroupFields; name: string; destination?: Destination } | null {
  const options: Record<string, number> = {};
  for (const [key, value] of Object.entries(status.options || {})) {
    const number = Number(value); // The game may send option values as strings.
    if (!Number.isSafeInteger(number) || number <= 0) return null;
    options[key] = number;
  }
  const destination = findDestinationForBoarding(status.type, options);
  const location = status.location ?? destination?.location;
  if (!status.type || !status.district || !location) return null;
  const maxPlayers = destination?.maxPlayers ?? null;
  const players = Number.isSafeInteger(status.num_players) && status.num_players! > 0 ? status.num_players! : 1;
  return {
    destination,
    name: destination ? getDestinationFullName(destination) : 'in-game',
    fields: { type: status.type, district: status.district, location, options, max_players: maxPlayers,
      num_players: maxPlayers ? Math.min(players, maxPlayers) : players },
  };
}

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getTtrCoreData(): { districts: District[]; locations: Location[] } {
  return { districts: TTR_DISTRICTS, locations: TTR_LOCATIONS };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.detail || body?.error || Object.values(body || {}).flat().join(' ') || response.statusText;
  } catch {
    return response.statusText;
  }
}

function formatLocationName(name: string): string {
  return name.replace(/\s+Playground$/i, '');
}

function describeBoardingStatus(result: BoardingGroupStatus, districts: District[], locations: Location[]): string {
  if (result === null) return 'Your active Toon appears to be offline.';
  const district = districts.find(item => item.id === result.district)?.name || `district ${result.district}`;
  const rawLocation = locations.find(item => item.id === result.location)?.name;
  const location = rawLocation ? formatLocationName(rawLocation) : undefined;
  if (result.type) return `Online in ${district}${location ? ` at ${location}` : ''}.\nAlready in an in-game boarding group.`;
  if (result.location) return `Online in ${district} at ${location || `location ${result.location}`}.\nNot in an in-game boarding group.`;
  return `Online in ${district}.\nPrecise location unavailable.\nNot in an in-game boarding group.`;
}

export function QuickTeleport({ showDistrictIndicators = true }: { showDistrictIndicators?: boolean }) {
  const [toons, setToons] = useState<Toon[]>([]);
  const [nativeState, setNativeState] = useState(() => getNativeBridge().state);
  useEffect(() => getNativeBridge().subscribe(update => setNativeState(update.state)), []);
  const [inListedGroup, setInListedGroup] = useState(false);
  const initialToonHqActiveId = useMemo(getToonHqActiveToonId, []);
  const [toonId, setToonId] = useState(initialToonHqActiveId || '');
  const [districtId, setDistrictId] = useState('');
  const [districtMenuOpen, setDistrictMenuOpen] = useState(false);
  const [destinationIndex, setDestinationIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [boardingStatus, setBoardingStatus] = useState<BoardingGroupStatus | undefined>(undefined);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [listing, setListing] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [infoTooltipOpen, setInfoTooltipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [populationByDistrict, setPopulationByDistrict] = useState<Record<string, number>>({});
  const coreData = useMemo(getTtrCoreData, []);
  const districts = coreData.districts;
  const districtMenuRef = useRef<HTMLDivElement>(null);
  const selectedDistrictOptionRef = useRef<HTMLButtonElement>(null);
  const quickTeleportActiveRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const acceptSnapshot = (snapshot: unknown) => {
      const candidate = snapshot as DistrictPopulationSnapshot | undefined;
      if (mounted) setPopulationByDistrict(candidate?.populationByDistrict || {});
    };
    void browser.storage.local.get(DISTRICT_POPULATION_STORAGE_KEY).then(result => {
      acceptSnapshot(result[DISTRICT_POPULATION_STORAGE_KEY]);
    });
    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName === 'local' && changes[DISTRICT_POPULATION_STORAGE_KEY]) {
        acceptSnapshot(changes[DISTRICT_POPULATION_STORAGE_KEY].newValue);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      mounted = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    quickTeleportActiveRef.current = preferencesLoaded;
    return () => {
      quickTeleportActiveRef.current = false;
    };
  }, [preferencesLoaded]);

  const selectDestination = (index: number) => {
    const destination = DESTINATIONS[index];
    if (!destination) return;
    setDestinationIndex(index);
    setSetting(DESTINATION_SETTING, destination.label).catch(error => console.error('Could not save the Quick Teleport destination.', error));
  };

  useEffect(() => {
    let cancelled = false;
    getSettings([DESTINATION_SETTING])
      .then(values => {
        if (cancelled) return;
        if (typeof values[DESTINATION_SETTING] === 'string') {
          const savedDestinationIndex = DESTINATIONS.findIndex(destination => destination.label === values[DESTINATION_SETTING]);
          if (savedDestinationIndex >= 0) setDestinationIndex(savedDestinationIndex);
        }
      })
      .catch(error => console.error('Could not load the Quick Teleport preferences.', error))
      .finally(() => {
        if (!cancelled) setPreferencesLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!districtMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      const menu = districtMenuRef.current;
      if (menu && !event.composedPath().includes(menu)) setDistrictMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDistrictMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [districtMenuOpen]);

  useEffect(() => {
    if (!districtMenuOpen) return;
    selectedDistrictOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [districtMenuOpen, districtId]);

  useEffect(() => {
    if (refreshCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setRefreshCooldown(seconds => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [refreshCooldown > 0]);

  const hasActiveBoardingGroup = !!boardingStatus?.type;

  // Watch ToonHQ's live group list for a group this Toon is still a member of.
  useEffect(() => {
    if (!toonId) { setInListedGroup(false); return; }
    const bridge = getNativeBridge();
    return bridge.subscribe(() => setInListedGroup(isToonInListedGroup(bridge.groups, toonId)));
  }, [toonId]);

  useEffect(() => {
    if (!hasActiveBoardingGroup) {
      return;
    }

    const timer = window.setTimeout(() => {
      setBoardingStatus(undefined);
      setStatus('The boarding-group cooldown expired. You can try Quick Create again.');
    }, BOARDING_GROUP_COOLDOWN_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [hasActiveBoardingGroup, toonId]);

  useEffect(() => {
    setToons(nativeState.authenticated ? nativeState.ownedToons.filter(toon => toon.game === 1) as Toon[] : []);
    setToonId(nativeState.currentToonId || '');
  }, [nativeState]);

  const boardingCheckReady = nativeState.connected && nativeState.authenticated && nativeState.gameId === 1
    && nativeState.currentToonId === toonId && nativeState.ownedToons.some(toon => String(toon.id) === toonId && toon.game === 1);

  useEffect(() => {
    if (!preferencesLoaded || !toonId) {
      setBoardingStatus(undefined);
      setCheckingStatus(false);
      setStatus('');
      return;
    }
    if (!boardingCheckReady) {
      setBoardingStatus(undefined);
      setCheckingStatus(false);
      setStatus(nativeState.reason || 'Connecting to ToonHQ Groups…');
      return;
    }

    const cachedBoardingStatus = getCachedBoardingGroupStatus(Number(toonId));
    const persistedCheck = getPersistedAutoBoardingCheck(toonId);
    const hasPersistedResult = !!persistedCheck && Date.now() - persistedCheck.checkedAt < AUTO_BOARDING_CHECK_COOLDOWN_MS
      && Object.prototype.hasOwnProperty.call(persistedCheck, 'result');
    const restoredBoardingStatus = cachedBoardingStatus !== undefined ? cachedBoardingStatus
      : hasPersistedResult ? persistedCheck!.result : undefined;
    if (restoredBoardingStatus !== undefined) {
      setBoardingStatus(restoredBoardingStatus ?? null);
      if (restoredBoardingStatus?.district != null) setDistrictId(String(restoredBoardingStatus.district));
      setStatus(describeBoardingStatus(restoredBoardingStatus ?? null, districts, coreData.locations));
      return;
    }

    setBoardingStatus(undefined);
    setCheckingStatus(false);
    setStatus(MANUAL_REFRESH_STATUS);
  }, [preferencesLoaded, toonId, districts, coreData.locations, nativeState.context, boardingCheckReady, nativeState.reason]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    return onBoardingCreated(result => {
      if (!quickTeleportActiveRef.current) return;
      setBoardingStatus(result);
      if (result.district != null) setDistrictId(String(result.district));
      setStatus(describeBoardingStatus(result, districts, coreData.locations));
    });
  }, [preferencesLoaded, districts, coreData.locations]);

  useEffect(() => {
    if (!preferencesLoaded || !toonId || !boardingCheckReady) return;
    const now = Date.now();
    const persistedCheck = getPersistedAutoBoardingCheck(toonId);
    if (persistedCheck && now - persistedCheck.checkedAt < AUTO_BOARDING_CHECK_COOLDOWN_MS) return;

    // Reserve the original per-Toon cooldown before requesting. No interval is
    // started: remounts, reloads, Toon switches and reconnects share this limit.
    setPersistedAutoBoardingCheck(toonId, { checkedAt: now });
    let cancelled = false;
    setCheckingStatus(true);
    setStatus('Checking your Toon’s current location…');
    getBoardingGroupStatus(Number(toonId), true)
      .then(result => {
        setPersistedAutoBoardingCheck(toonId, { checkedAt: now, result });
        if (cancelled || !quickTeleportActiveRef.current) return;
        setBoardingStatus(result);
        if (result?.district != null) setDistrictId(String(result.district));
        setStatus(describeBoardingStatus(result, districts, coreData.locations));
      })
      .catch(error => {
        if (cancelled || !quickTeleportActiveRef.current) return;
        setStatus(`Could not check Toon status: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (!cancelled && quickTeleportActiveRef.current) setCheckingStatus(false);
      });
    return () => { cancelled = true; };
  }, [preferencesLoaded, toonId, districts, coreData.locations, nativeState.context, boardingCheckReady]);

  const selectedToon = toons.find(toon => String(toon.id) === toonId);
  const selectedDestination = DESTINATIONS[destinationIndex];
  const selectedDestinationFullName = getDestinationFullName(selectedDestination);
  const selectedSuitRowIndex = Math.max(0, DESTINATION_ROWS.findIndex(row => row.indices.includes(destinationIndex)));
  const selectedSuitRow = DESTINATION_ROWS[selectedSuitRowIndex];
  const selectedSuitLevel = getToonSuitLevel(selectedToon?.[selectedDestination.suitKey]);
  const selectedDestinationEligible = selectedSuitLevel >= 13;
  const selectedDepartment = selectedDestination.suitKey[0].toUpperCase() + selectedDestination.suitKey.slice(1);
  // Without a selected Toon there's no disguise level to report, so ask for a Toon instead of showing level 0.
  const noToonReason = selectedToon ? null
    : !nativeState.connected ? nativeState.reason || 'Connecting to ToonHQ Groups…'
    : 'Select an active Toon to use Quick Create.';
  const disguiseRequirement = noToonReason ?? `Requires a Level 13 ${selectedDepartment} disguise. Current level: ${selectedSuitLevel}.`;
  const selectedDistrict = districts.find(district => String(district.id) === districtId);
  const toonIsOffline = boardingStatus === null;
  // Both buttons create a ToonHQ group, so neither works while the Toon is already in one.
  const sharedDisabledReason = !nativeState.connected
    ? nativeState.reason || 'Connecting to ToonHQ Groups…'
    : busy
    ? 'Teleport is in progress.'
    : !toonId
      ? 'Select an active Toon to use Quick Create.'
      : inListedGroup
        ? 'Your Toon is already in a group on ToonHQ.'
        : undefined;
  // Teleport also depends on where the Toon is in-game; List on HQ doesn't.
  const teleportDisabledReason = sharedDisabledReason ?? (checkingStatus
    ? 'Checking your Toon’s status. Please wait.'
    : boardingStatus === undefined
      ? 'Couldn’t check your Toon’s location yet. Use Refresh to try again.'
    : toonIsOffline
      ? 'Your active Toon appears to be offline.'
      : !districtId || districts.length === 0
        ? 'Select a destination district.'
        : hasActiveBoardingGroup
          ? 'Your Toon is already in a boarding group.'
          : !selectedDestinationEligible ? disguiseRequirement : undefined);
  // List on HQ lists the in-game group when there is one, so name and color the button after it.
  const inGameGroup = boardingStatus?.type ? getInGameGroup(boardingStatus) : null;
  const listDestination = inGameGroup ? inGameGroup.destination ?? selectedDestination : selectedDestination;
  const listLabel = inGameGroup ? inGameGroup.destination?.label ?? 'group' : selectedDestination.label;
  // An in-game group is listed as-is, so the picked lobby's disguise doesn't apply.
  const listDisabledReason = sharedDisabledReason ?? (!districtId || districts.length === 0
    ? 'Select a destination district.'
    : !hasActiveBoardingGroup && !selectedDestinationEligible ? disguiseRequirement : undefined);
  const refreshDisabled = !nativeState.connected || !toonId || busy || checkingStatus || refreshCooldown > 0;
  const refreshTooltip = !nativeState.connected
    ? nativeState.reason || 'Connecting to ToonHQ Groups…'
    : refreshCooldown > 0
    ? `You can refresh again in ${refreshCooldown} second${refreshCooldown === 1 ? '' : 's'}.`
    : checkingStatus
      ? 'Your Toon’s status is already being checked.'
      : busy
        ? 'Wait for the teleport to finish.'
        : !toonId
          ? 'Select an active Toon first.'
          : 'Refresh your Toon’s current location.';

  const isCurrentToonContext = (context: string) => {
    const live = getNativeBridge().state;
    return quickTeleportActiveRef.current && live.connected && live.context === context && live.currentToonId === toonId;
  };

  const refreshLocation = async () => {
    const requestContext = nativeState.context;
    if (!isCurrentToonContext(requestContext) || !toonId || busy || checkingStatus || refreshCooldown > 0) return;
    setRefreshCooldown(LOCATION_REFRESH_COOLDOWN_SECONDS);
    setCheckingStatus(true);
    setStatus('Refreshing location…');
    try {
      const result = await getBoardingGroupStatus(Number(toonId), true);
      if (!isCurrentToonContext(requestContext)) return;
      setBoardingStatus(result);
      if (result?.district != null) setDistrictId(String(result.district));
      setStatus(describeBoardingStatus(result, districts, coreData.locations));
    } catch (error) {
      if (!isCurrentToonContext(requestContext)) return;
      setStatus(`Could not refresh Toon status: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (isCurrentToonContext(requestContext)) setCheckingStatus(false);
    }
  };

  // Teleport removes the ToonHQ listing right after creating the group; List keeps it.
  const teleport = async (delist = true) => {
    const requestContext = nativeState.context;
    if (!isCurrentToonContext(requestContext) || !toonId || !districtId || busy || inListedGroup) return;
    if (delist && (checkingStatus || boardingStatus === undefined || toonIsOffline || hasActiveBoardingGroup)) return;
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      setStatus('Could not read ToonHQ\'s CSRF token. Refresh the page and try again.');
      return;
    }

    setBusy(true);
    setListing(!delist);
    try {
      const destination = DESTINATIONS[destinationIndex];
      let destinationFullName = getDestinationFullName(destination);
      let fields: GroupFields = { type: destination.type, district: Number(districtId), location: destination.location,
        options: destination.options, max_players: destination.maxPlayers, num_players: 1 };
      let inGame = false;

      // List on HQ lists the Toon's in-game boarding group when it has one, instead of the
      // picked lobby. Check fresh: the saved status can predate Toons who joined in-game.
      if (!delist) {
        setStatus('Checking your in-game group…');
        let current: BoardingGroupStatus;
        try {
          current = await getBoardingGroupStatus(Number(toonId), true);
        } catch (error) {
          if (isCurrentToonContext(requestContext)) setStatus(`Couldn’t check your in-game group: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        if (!isCurrentToonContext(requestContext)) return;
        setBoardingStatus(current);
        if (current?.type) {
          const group = getInGameGroup(current);
          if (!group) {
            setStatus('Couldn’t read your in-game group’s details. Use Refresh and try again.');
            return;
          }
          fields = group.fields;
          destinationFullName = group.name;
          inGame = true;
        }
      }

      if (!inGame && getToonSuitLevel(selectedToon?.[destination.suitKey]) < 13) {
        const department = destination.suitKey[0].toUpperCase() + destination.suitKey.slice(1);
        setStatus(`${selectedToon?.name || 'This Toon'} needs a level 13 ${department} disguise for ${destinationFullName}.`);
        return;
      }

      setStatus(delist ? `Creating a temporary group for ${destinationFullName}…`
        : inGame ? `Listing your in-game ${destinationFullName} group on ToonHQ…` : `Listing a ${destinationFullName} group on ToonHQ…`);
      const createResponse = await pageFetch(new URL('/api/groups/create/', window.location.origin).href, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ toon: Number(toonId), ...fields, note: null, id: null, game: 1 }),
      });
      if (!createResponse.ok) throw new Error(await readError(createResponse));
      const group = await createResponse.json();
      const createdGroupId = Number(group?.id);
      if (!Number.isFinite(createdGroupId)) throw new Error('ToonHQ did not return the new group ID.');

      if (delist) {
        const leaveResponse = await pageFetch(new URL(`/api/groups/${createdGroupId}/leave/`, window.location.origin).href, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': csrfToken },
        });
        if (!leaveResponse.ok) throw new Error(`Teleport was requested, but the group could not be delisted: ${await readError(leaveResponse)}`);
      }

      if (!isCurrentToonContext(requestContext)) return;
      if (!delist) {
        setInListedGroup(true);
        setStatus(`Your ${destinationFullName} group is now listed on ToonHQ.`);
        getNativeBridge().openGroup(createdGroupId);
        return;
      }
      setStatus('Teleport requested. Checking the in-game boarding group in 10 seconds…');
      await new Promise(resolve => window.setTimeout(resolve, TELEPORT_VERIFICATION_DELAY_MS));
      if (!isCurrentToonContext(requestContext)) return;

      setStatus('Verifying the in-game boarding group…');
      const verifiedStatus = await getBoardingGroupStatus(Number(toonId), true);
      if (!isCurrentToonContext(requestContext)) return;
      if (!verifiedStatus?.type) throw new Error('Something went wrong. We were not able to create a boarding group.');

      setBoardingStatus(verifiedStatus);
      setStatus(`Teleport requested to ${destinationFullName}.\nThe in-game boarding group is active${delist ? ' and the ToonHQ listing was removed' : ' and listed on ToonHQ'}.`);
    } catch (error) {
      if (!isCurrentToonContext(requestContext)) return;
      setStatus(error instanceof Error && error.message.startsWith('Teleport was requested, but')
        ? error.message
        : 'Something went wrong. We were not able to create a boarding group.');
    } finally {
      setBusy(false);
      setListing(false);
    }
  };

  if (!preferencesLoaded) return null;

  return (
    <>
      <div className="relative mb-2 ml-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-green-50">Quick Create</h3>
          <div className="flex items-center">
            <button type="button" aria-label="About Quick Create" aria-describedby="quick-teleport-tooltip" onMouseEnter={() => setInfoTooltipOpen(true)} onMouseLeave={() => setInfoTooltipOpen(false)} onFocus={() => setInfoTooltipOpen(true)} onBlur={() => setInfoTooltipOpen(false)} className="flex h-4 w-4 cursor-help items-center justify-center rounded-full text-green-100/55 transition-colors hover:text-green-100 focus:text-green-100 focus:outline-none">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </button>
          </div>
        </div>
        {infoTooltipOpen && (
          <div id="quick-teleport-tooltip" role="tooltip" className="pointer-events-none absolute left-0 right-0 top-full z-[80] mt-1.5 rounded-lg border border-rose-200/20 bg-[#3a2028] p-2.5 text-[11px] font-normal leading-relaxed text-rose-50 shadow-2xl">
            <p>Quick Create makes a ToonHQ group to teleport you into the selected boss or facility lobby.</p>
            <p className="mt-1.5">Teleport removes the ToonHQ listing right away. The in-game group stays so you can invite friends.</p>
            <p className="mt-1.5">List on HQ keeps the group listed on ToonHQ so others can join.</p>
          </div>
        )}
      </div>
      <div className="mb-3 flex shrink-0 flex-col gap-2 rounded border border-black/50 bg-black/40 p-3 text-white shadow-sm">
      <div ref={districtMenuRef} className="relative">
        <button
          type="button"
          aria-labelledby="teleport-district-label teleport-district-value"
          aria-haspopup="listbox"
          aria-expanded={districtMenuOpen}
          disabled={busy}
          onClick={() => setDistrictMenuOpen(open => !open)}
          className="flex w-full items-center justify-between gap-2 rounded border border-white/10 bg-black/20 px-2.5 py-2 text-left text-xs font-bold text-white transition-colors enabled:cursor-pointer enabled:hover:bg-black/30 focus:border-emerald-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span id="teleport-district-value" className={`flex min-w-0 flex-1 items-center ${selectedDistrict ? '' : 'text-white/45'}`}>
            {selectedDistrict ? <><span className="truncate">{selectedDistrict.name}</span>{showDistrictIndicators && <DistrictIndicators district={selectedDistrict} population={populationByDistrict[selectedDistrict.name]} />}</> : 'Select a district'}
          </span>
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-white/40 transition-transform ${districtMenuOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {districtMenuOpen && (
          <div role="listbox" aria-labelledby="teleport-district-label" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-[#152c22] p-1 shadow-2xl custom-scrollbar">
            {districts.map(district => {
              const value = String(district.id);
              const selected = value === districtId;
              return (
                <button
                  key={district.id}
                  ref={selected ? selectedDistrictOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { setDistrictId(value); setDistrictMenuOpen(false); }}
                  className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${selected ? 'bg-emerald-500/20 text-emerald-200' : 'text-white/85 hover:bg-white/10'}`}
                >
                  <span className="truncate">{district.name}</span>{showDistrictIndicators && <DistrictIndicators district={district} population={populationByDistrict[district.name]} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-evenly gap-3 px-3 py-0.5">
        {DESTINATION_ROWS.map((row, rowIndex) => {
          const suitLevel = getToonSuitLevel(selectedToon?.[DESTINATIONS[row.indices[0]].suitKey]);
          const isEligible = suitLevel >= 13;
          const isSelected = selectedSuitRowIndex === rowIndex;
          const rowTooltipId = `quick-teleport-${row.label.toLowerCase()}-requirement`;
          return (
            <div key={row.label} className="group relative" tabIndex={!isEligible ? 0 : -1}>
              <button
                type="button"
                disabled={!isEligible || busy}
                aria-describedby={!isEligible ? rowTooltipId : undefined}
                onClick={() => selectDestination(row.indices[0])}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent p-0.5 transition-all ${isSelected ? 'border-[3px] border-[#ffd539] scale-105' : 'border-0'} ${isEligible && !busy ? 'cursor-pointer hover:scale-105 hover:brightness-110' : 'cursor-not-allowed grayscale opacity-35'}`}
                style={{
                  boxShadow: isSelected ? '0 0 0 3px rgba(255, 213, 57, 0.2), 0 3px 9px rgba(0, 0, 0, 0.25)' : 'none',
                }}
              >
                <img src={row.image} alt={row.label} className="h-7 w-7 object-contain drop-shadow-md" />
              </button>
              {!isEligible && <HoverTooltip id={rowTooltipId} placement={rowIndex === 0 ? 'left' : rowIndex === DESTINATION_ROWS.length - 1 ? 'right' : 'center'}>{noToonReason ?? `Requires a Level 13 ${row.label} disguise. Current level: ${suitLevel}.`}</HoverTooltip>}
            </div>
          );
        })}
      </div>

      {/* A switch, not buttons, so picking a lobby doesn't look like Teleport / List on HQ. */}
      <div role="radiogroup" aria-label="Lobby" className="grid grid-cols-3 gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5">
        {selectedSuitRow.indices.map((index, columnIndex) => {
          const destination = DESTINATIONS[index];
          const isSelected = destinationIndex === index;
          const tooltipId = `quick-teleport-destination-${index}-requirement`;
          return (
            <div key={destination.label} className="group relative flex" tabIndex={!selectedDestinationEligible ? 0 : -1}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-describedby={!selectedDestinationEligible ? tooltipId : undefined}
                disabled={!selectedDestinationEligible || busy}
                onClick={() => selectDestination(index)}
                title={destination.description}
                className={`min-w-0 w-full truncate rounded-md px-1 py-1.5 text-center text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 enabled:cursor-pointer ${isSelected ? 'text-white shadow-md' : 'text-green-100/60 enabled:hover:bg-white/5 enabled:hover:text-white'}`}
                style={isSelected ? { backgroundColor: destination.cardBg } : undefined}
              >
                {destination.label}
              </button>
              {!selectedDestinationEligible && <HoverTooltip id={tooltipId} placement={columnIndex === 0 ? 'left' : columnIndex === selectedSuitRow.indices.length - 1 ? 'right' : 'center'}>{disguiseRequirement}</HoverTooltip>}
            </div>
          );
        })}
      </div>

      <div className="flex w-full gap-1.5">
        <div className="group/teleport relative min-w-0 flex-1" tabIndex={teleportDisabledReason ? 0 : -1}>
          <button type="button" aria-describedby="quick-teleport-teleport-hint" disabled={!!teleportDisabledReason} onClick={() => teleport(true)} className={ACTION_BUTTON_CLASS} style={{ backgroundColor: selectedDestination.cardBg, borderColor: selectedDestination.cardBorder }}>
            {checkingStatus ? 'Checking…' : busy && !listing ? 'Teleporting…' : `Teleport to ${selectedDestination.label}`}
          </button>
          <ActionHint id="quick-teleport-teleport-hint" action="teleport">{teleportDisabledReason ?? `Teleports you to ${selectedDestinationFullName} without listing the group. Invite friends in-game.`}</ActionHint>
        </div>
        <div className="group/list relative min-w-0 flex-1" tabIndex={listDisabledReason ? 0 : -1}>
          <button type="button" aria-describedby="quick-teleport-list-hint" disabled={!!listDisabledReason} onClick={() => teleport(false)} className={ACTION_BUTTON_CLASS} style={{ backgroundColor: listDestination.cardBg, borderColor: listDestination.cardBorder }}>
            {busy && listing ? 'Listing…' : `List ${listLabel} on HQ`}
          </button>
          <ActionHint id="quick-teleport-list-hint" action="list">{listDisabledReason ?? (hasActiveBoardingGroup
            ? 'Lists your in-game boarding group on ToonHQ so others can join.'
            : `Posts a ${selectedDestinationFullName} group on ToonHQ so others can join.`)}</ActionHint>
        </div>
      </div>

      {(status || inListedGroup) && (
        <div className="flex items-center gap-2 px-1">
          <div role="status" className="min-w-0 flex-1 text-[10px] leading-snug text-green-100/75">
            {/* The location check only covers the game; this comes from ToonHQ's live group list. */}
            {inListedGroup && <div className="text-amber-200/90">In a group on ToonHQ.</div>}
            {status.split('\n').filter(Boolean).map((line, index) => <div key={`${index}:${line}`}><NativeStatusText text={line} /></div>)}
          </div>
          <div className="group relative shrink-0" tabIndex={refreshDisabled ? 0 : -1}>
            <button
              type="button"
              onClick={refreshLocation}
              disabled={refreshDisabled}
              aria-describedby="quick-teleport-refresh-tooltip"
              aria-label={refreshCooldown > 0 ? `Refresh location, available in ${refreshCooldown} seconds` : 'Refresh location'}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/20 text-green-100/80 transition-colors enabled:cursor-pointer enabled:hover:bg-white/10 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={checkingStatus ? 'animate-spin' : ''}><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
            </button>
            <HoverTooltip id="quick-teleport-refresh-tooltip" placement="right">{refreshTooltip}</HoverTooltip>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
