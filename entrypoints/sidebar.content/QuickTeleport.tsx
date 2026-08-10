import React, { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { BoardingGroupStatus, getBoardingGroupStatus } from './boardingStatus';
import { getToonSuitLevel } from './toonUtils';

type SuitKey = 'sellbot' | 'cashbot' | 'lawbot' | 'bossbot';
type Toon = { id: number; name: string; game?: number; photo?: string; sellbot?: unknown; cashbot?: unknown; lawbot?: unknown; bossbot?: unknown };
type District = { id: number; name: string; game: number; speedchat_only?: boolean };
type Location = { id: number; name: string; game: number };

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

function getExtensionImageUrl(path: string): string {
  return browser.runtime.getURL(path.replace(/^\/+/, '') as any);
}

const DESTINATIONS: Destination[] = [
  { label: 'VP', description: 'Sellbot HQ boss lobby', type: 3, location: 23, options: {}, maxPlayers: 8, cardBg: '#7b00ae', cardBorder: '#b54de4', suitKey: 'sellbot' },
  { label: 'CFO', description: 'Cashbot HQ boss lobby', type: 5, location: 5, options: {}, maxPlayers: 8, cardBg: '#147529', cardBorder: '#35c75a', suitKey: 'cashbot' },
  { label: 'CJ', description: 'Lawbot HQ boss lobby', type: 7, location: 12, options: {}, maxPlayers: 8, cardBg: '#2956a5', cardBorder: '#6ba6ff', suitKey: 'lawbot' },
  { label: 'CEO', description: 'Bossbot HQ boss lobby', type: 9, location: 4, options: {}, maxPlayers: 8, cardBg: '#65452e', cardBorder: '#b97a4d', suitKey: 'bossbot' },

  { label: 'Steel Factory', description: 'Sellbot HQ facility', type: 2, location: 23, options: { '3': 11, '4': 13 }, maxPlayers: 4, cardBg: '#7b00ae', cardBorder: '#b54de4', suitKey: 'sellbot' },
  { label: 'Bullion Mint', description: 'Cashbot HQ facility', type: 4, location: 5, options: { '7': 20 }, maxPlayers: 4, cardBg: '#147529', cardBorder: '#35c75a', suitKey: 'cashbot' },
  { label: 'Senior Wing', description: 'Lawbot HQ facility', type: 6, location: 12, options: { '9': 26 }, maxPlayers: 4, cardBg: '#2956a5', cardBorder: '#6ba6ff', suitKey: 'lawbot' },
  { label: 'Final Fringe', description: 'Bossbot HQ facility', type: 8, location: 4, options: { '10': 29 }, maxPlayers: 4, cardBg: '#65452e', cardBorder: '#b97a4d', suitKey: 'bossbot' },

  { label: 'Scrap Factory', description: 'Sellbot HQ facility', type: 2, location: 23, options: { '3': 10, '4': 12 }, maxPlayers: 4, cardBg: '#7b00ae', cardBorder: '#b54de4', suitKey: 'sellbot' },
  { label: 'Coin Mint', description: 'Cashbot HQ facility', type: 4, location: 5, options: { '7': 18 }, maxPlayers: 4, cardBg: '#147529', cardBorder: '#35c75a', suitKey: 'cashbot' },
  { label: 'Junior Wing', description: 'Lawbot HQ facility', type: 6, location: 12, options: { '9': 23 }, maxPlayers: 4, cardBg: '#2956a5', cardBorder: '#6ba6ff', suitKey: 'lawbot' },
  { label: 'First Fairway', description: 'Bossbot HQ facility', type: 8, location: 4, options: { '10': 27 }, maxPlayers: 4, cardBg: '#65452e', cardBorder: '#b97a4d', suitKey: 'bossbot' },
];

const TEST_DISTRICTS = new Set(['bounce grove', 'crunchville', 'nutty river', 'patter plains', 'whamfield']);

const DESTINATION_ROWS = [
  { label: 'Sellbot', indices: [0, 4, 8], image: getExtensionImageUrl('images/suits/Sellbot.png'), color: '#9a21c7' },
  { label: 'Cashbot', indices: [1, 5, 9], image: getExtensionImageUrl('images/suits/Cashbot.png'), color: '#23953c' },
  { label: 'Lawbot', indices: [2, 6, 10], image: getExtensionImageUrl('images/suits/Lawbot.png'), color: '#3972cf' },
  { label: 'Bossbot', indices: [3, 7, 11], image: getExtensionImageUrl('images/suits/Bossbot.png'), color: '#8b5b39' },
];

let cachedToons: Toon[] | null = null;
let cachedToonsAt = 0;
let toonsRequest: Promise<Toon[]> | null = null;
const TOONS_CACHE_MS = 60_000;
const LOCATION_REFRESH_COOLDOWN_SECONDS = 10;
const TELEPORT_VERIFICATION_DELAY_MS = 10_000;

async function loadTtrToons(): Promise<Toon[]> {
  if (cachedToons && Date.now() - cachedToonsAt < TOONS_CACHE_MS) return cachedToons;
  if (toonsRequest) return toonsRequest;

  toonsRequest = fetch('/api/toons/', { credentials: 'include' })
    .then(async response => {
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      cachedToons = (Array.isArray(data) ? data : []).filter((toon: Toon) => toon.game == null || toon.game === 1);
      cachedToonsAt = Date.now();
      return cachedToons;
    })
    .finally(() => { toonsRequest = null; });
  return toonsRequest;
}

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getTtrCoreData(): { districts: District[]; locations: Location[] } {
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
      if (Array.isArray(state.districts)) {
        return {
          districts: state.districts
            .filter((district: District) => district.game === 1 && !TEST_DISTRICTS.has(district.name.trim().toLowerCase()))
            .sort((a: District, b: District) => a.name.localeCompare(b.name)),
          locations: (Array.isArray(state.locations) ? state.locations : [])
            .filter((location: Location) => location.game === 1),
        };
      }
    } catch { }
  }
  return { districts: [], locations: [] };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.detail || body?.error || Object.values(body || {}).flat().join(' ') || response.statusText;
  } catch {
    return response.statusText;
  }
}

function getToonHqActiveToonId(): string | null {
  try {
    const persistedState = localStorage.getItem('vuex');
    if (!persistedState) return null;
    const currentToon = JSON.parse(persistedState)?.accounts?.currentToon;
    return currentToon == null ? null : String(currentToon);
  } catch {
    return null;
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
  if (result.type) return `Online in ${district}${location ? ` at ${location}` : ''}.\nAlready in a boarding group.`;
  if (result.location) return `Online in ${district} at ${location || `location ${result.location}`}.\nNot in a boarding group.`;
  return `Online in ${district}.\nPrecise location unavailable. Not in a boarding group.`;
}

export function QuickTeleport() {
  const [toons, setToons] = useState<Toon[]>([]);
  const initialToonHqActiveId = useMemo(getToonHqActiveToonId, []);
  const [toonId, setToonId] = useState(initialToonHqActiveId || '');
  const [districtId, setDistrictId] = useState('');
  const [districtMenuOpen, setDistrictMenuOpen] = useState(false);
  const [destinationIndex, setDestinationIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [boardingStatus, setBoardingStatus] = useState<BoardingGroupStatus | undefined>(undefined);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [autoDelist, setAutoDelist] = useState(true);
  const [infoTooltipOpen, setInfoTooltipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const coreData = useMemo(getTtrCoreData, []);
  const districts = coreData.districts;
  const districtMenuRef = useRef<HTMLDivElement>(null);
  const selectedDistrictOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!districtMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!districtMenuRef.current?.contains(event.target as Node)) setDistrictMenuOpen(false);
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

  useEffect(() => {
    loadTtrToons()
      .then(setToons)
      .catch(error => setStatus(`Could not load your toons: ${error.message}`));
  }, []);

  useEffect(() => {
    const syncToonHqActiveToon = () => {
      const id = getToonHqActiveToonId();
      if (!id) return;
      setToonId(current => current === id ? current : id);
    };

    syncToonHqActiveToon();
    const interval = window.setInterval(syncToonHqActiveToon, 750);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toonId) {
      setBoardingStatus(undefined);
      return;
    }

    let cancelled = false;
    setCheckingStatus(true);
    setBoardingStatus(undefined);
    getBoardingGroupStatus(Number(toonId))
      .then(result => {
        if (cancelled) return;
        setBoardingStatus(result);
        if (result?.district != null) setDistrictId(String(result.district));
        setStatus(describeBoardingStatus(result, districts, coreData.locations));
      })
      .catch(error => {
        if (!cancelled) setStatus(`Could not check Toon status: ${error.message}`);
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });

    return () => { cancelled = true; };
  }, [toonId, districts, coreData.locations]);

  const selectedToon = toons.find(toon => String(toon.id) === toonId);
  const selectedDestination = DESTINATIONS[destinationIndex];
  const selectedSuitRowIndex = Math.max(0, DESTINATION_ROWS.findIndex(row => row.indices.includes(destinationIndex)));
  const selectedSuitRow = DESTINATION_ROWS[selectedSuitRowIndex];
  const selectedSuitLevel = getToonSuitLevel(selectedToon?.[selectedDestination.suitKey]);
  const selectedDestinationEligible = selectedSuitLevel >= 12;
  const selectedDistrict = districts.find(district => String(district.id) === districtId);
  const hasActiveBoardingGroup = !!boardingStatus?.type;

  const refreshLocation = async () => {
    if (!toonId || busy || checkingStatus || refreshCooldown > 0) return;
    setRefreshCooldown(LOCATION_REFRESH_COOLDOWN_SECONDS);
    setCheckingStatus(true);
    setStatus('Refreshing location...');
    try {
      const result = await getBoardingGroupStatus(Number(toonId), true);
      setBoardingStatus(result);
      if (result?.district != null) setDistrictId(String(result.district));
      setStatus(describeBoardingStatus(result, districts, coreData.locations));
    } catch (error) {
      setStatus(`Could not refresh Toon status: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCheckingStatus(false);
    }
  };

  const teleport = async () => {
    if (!toonId || !districtId || busy) return;
    const destination = DESTINATIONS[destinationIndex];
    const suitLevel = getToonSuitLevel(selectedToon?.[destination.suitKey]);
    if (suitLevel < 12) {
      const department = destination.suitKey[0].toUpperCase() + destination.suitKey.slice(1);
      setStatus(`${selectedToon?.name || 'This Toon'} needs a level 12 ${department} disguise for ${destination.label}.`);
      return;
    }
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      setStatus('Could not read ToonHQ\'s CSRF token. Refresh the page and try again.');
      return;
    }

    setBusy(true);
    setStatus(`Creating a temporary group for ${destination.label}...`);
    try {
      const createResponse = await fetch('/api/groups/create/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({
          toon: Number(toonId),
          type: destination.type,
          district: Number(districtId),
          location: destination.location,
          options: destination.options,
          max_players: destination.maxPlayers,
          num_players: 1,
          note: null,
          id: null,
          game: 1,
        }),
      });
      if (!createResponse.ok) throw new Error(await readError(createResponse));
      const group = await createResponse.json();
      const createdGroupId = Number(group?.id);
      if (!Number.isFinite(createdGroupId)) throw new Error('ToonHQ did not return the new group ID.');

      if (autoDelist) {
        const leaveResponse = await fetch(`/api/groups/${createdGroupId}/leave/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': csrfToken },
        });
        if (!leaveResponse.ok) throw new Error(`Teleport was requested, but the group could not be delisted: ${await readError(leaveResponse)}`);
      }

      setStatus('Teleport requested. Checking the in-game boarding group in 10 seconds...');
      await new Promise(resolve => window.setTimeout(resolve, TELEPORT_VERIFICATION_DELAY_MS));

      setStatus('Verifying the in-game boarding group...');
      const verifiedStatus = await getBoardingGroupStatus(Number(toonId), true);
      if (!verifiedStatus?.type) throw new Error('Something went wrong. We were not able to create a boarding group.');

      setBoardingStatus(verifiedStatus);
      setStatus(`Teleport requested to ${destination.label}.\nThe in-game boarding group is active${autoDelist ? ' and the ToonHQ listing was removed' : ''}.`);
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith('Teleport was requested, but')
        ? error.message
        : 'Something went wrong. We were not able to create a boarding group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="relative mb-2 ml-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-green-50">Quick Teleport</h3>
          <div className="flex items-center">
            <button type="button" aria-label="About Quick Teleport" aria-describedby="quick-teleport-tooltip" onMouseEnter={() => setInfoTooltipOpen(true)} onMouseLeave={() => setInfoTooltipOpen(false)} onFocus={() => setInfoTooltipOpen(true)} onBlur={() => setInfoTooltipOpen(false)} className="flex h-4 w-4 cursor-help items-center justify-center rounded-full text-green-100/55 transition-colors hover:text-green-100 focus:text-green-100 focus:outline-none">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[9px] font-bold text-green-100/70">
          <span>Auto-delist</span>
          <input type="checkbox" checked={autoDelist} disabled={busy} onChange={event => setAutoDelist(event.target.checked)} className="peer sr-only" />
          <span className="relative h-4 w-7 rounded-full bg-white/15 transition-colors peer-checked:bg-emerald-500/70 peer-disabled:cursor-not-allowed peer-disabled:opacity-40 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-3" />
        </label>
        {infoTooltipOpen && (
          <div id="quick-teleport-tooltip" role="tooltip" className="pointer-events-none absolute left-0 right-0 top-full z-[80] mt-1.5 rounded-lg border border-white/10 bg-[#152c22] p-2.5 text-[10px] font-normal leading-relaxed text-green-50 shadow-2xl">
            <p>Quick Teleport uses ToonHQ group creation to teleport you into the selected boss or facility lobby.</p>
            <p className="mt-1.5">When Auto-delist is enabled, the ToonHQ listing is immediately removed after the teleport request.</p>
            <p className="mt-1.5">Use it to reach a lobby quickly, then invite friends to a private group without leaving the listing up on ToonHQ.</p>
          </div>
        )}
      </div>
      <div className="mb-3 flex shrink-0 flex-col gap-2 rounded border border-black/50 bg-black/40 p-3 text-white shadow-sm">
      <div ref={districtMenuRef} className="relative">
        <label id="teleport-district-label" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-green-100/70">District</label>
        <button
          type="button"
          aria-labelledby="teleport-district-label teleport-district-value"
          aria-haspopup="listbox"
          aria-expanded={districtMenuOpen}
          disabled={busy || checkingStatus || hasActiveBoardingGroup}
          onClick={() => setDistrictMenuOpen(open => !open)}
          className="flex w-full items-center justify-between gap-2 rounded border border-white/10 bg-black/20 px-2.5 py-2 text-left text-xs font-bold text-white transition-colors enabled:hover:bg-black/30 focus:border-emerald-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span id="teleport-district-value" className={selectedDistrict ? '' : 'text-white/45'}>
            {selectedDistrict ? `${selectedDistrict.name}${selectedDistrict.speedchat_only ? ' (SpeedChat)' : ''}` : 'Select a district'}
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
                  className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${selected ? 'bg-emerald-500/20 text-emerald-200' : 'text-white/85 hover:bg-white/10'}`}
                >
                  {district.name}{district.speedchat_only ? ' (SpeedChat)' : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-evenly gap-3 px-3 py-0.5">
        {DESTINATION_ROWS.map((row, rowIndex) => {
          const suitLevel = getToonSuitLevel(selectedToon?.[DESTINATIONS[row.indices[0]].suitKey]);
          const isEligible = suitLevel >= 12;
          const isSelected = selectedSuitRowIndex === rowIndex;
          return (
            <button
              key={row.label}
              type="button"
              disabled={!isEligible || busy || checkingStatus || hasActiveBoardingGroup}
              onClick={() => setDestinationIndex(row.indices[0])}
              title={isEligible ? row.label : `${row.label} disguise level 12 required (current: ${suitLevel})`}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent p-0.5 transition-all ${isSelected ? 'border-[3px] border-[#ffd539] scale-105' : 'border-0'} ${isEligible && !busy && !checkingStatus && !hasActiveBoardingGroup ? 'cursor-pointer hover:scale-105 hover:brightness-110' : 'cursor-not-allowed grayscale opacity-35'}`}
              style={{
                boxShadow: isSelected ? '0 0 0 3px rgba(255, 213, 57, 0.2), 0 3px 9px rgba(0, 0, 0, 0.25)' : 'none',
              }}
            >
              <img src={row.image} alt={row.label} className="h-7 w-7 object-contain drop-shadow-md" />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {selectedSuitRow.indices.map(index => {
          const destination = DESTINATIONS[index];
          const isSelected = destinationIndex === index;
          return (
            <button
              key={destination.label}
              type="button"
              aria-pressed={isSelected}
              disabled={busy || checkingStatus || hasActiveBoardingGroup}
              onClick={() => setDestinationIndex(index)}
              className={`flex min-h-14 items-center justify-center overflow-hidden rounded-lg px-2 py-1 text-center text-sm font-black leading-tight text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 enabled:cursor-pointer enabled:hover:brightness-110 ${isSelected ? 'border-[3px] border-[#ffd539] scale-[1.03] brightness-110' : 'border-0 opacity-80'}`}
              style={{
                backgroundColor: destination.cardBg,
                boxShadow: isSelected
                  ? '0 0 0 2px rgba(255, 213, 57, 0.28), 0 0 12px rgba(255, 213, 57, 0.45)'
                  : 'none',
              }}
            >
              {destination.label}
            </button>
          );
        })}
      </div>

      <button type="button" disabled={busy || checkingStatus || !toonId || !districtId || districts.length === 0 || hasActiveBoardingGroup || !selectedDestinationEligible} onClick={teleport} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-emerald-950 shadow transition-all enabled:cursor-pointer enabled:hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
        {checkingStatus ? 'Checking...' : busy ? 'Teleporting...' : `Teleport to ${selectedDestination.label}`}
      </button>

      {status && (
        <div className="flex items-end gap-2 px-1">
          <p role="status" className="min-w-0 flex-1 whitespace-pre-line text-[10px] leading-snug text-green-100/75">{status}</p>
          <button
            type="button"
            onClick={refreshLocation}
            disabled={!toonId || busy || checkingStatus || refreshCooldown > 0}
            title={refreshCooldown > 0 ? `Location can be refreshed again in ${refreshCooldown} seconds` : 'Refresh Toon location'}
            aria-label={refreshCooldown > 0 ? `Refresh location, available in ${refreshCooldown} seconds` : 'Refresh location'}
            className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-bold text-green-100/80 transition-colors enabled:cursor-pointer enabled:hover:bg-white/10 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={checkingStatus ? 'animate-spin' : ''}><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
            {checkingStatus ? 'Checking' : refreshCooldown > 0 ? `${refreshCooldown}s` : 'Refresh'}
          </button>
        </div>
      )}
      </div>
    </>
  );
}
