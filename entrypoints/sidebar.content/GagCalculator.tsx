import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COG_HEALTH } from './gagCombos';
import { gags as gagsConfig } from './gags';
import { SOS_GAGS } from './CogCalculator';
import { browser } from 'wxt/browser';
import { GagCombosPanel } from './GagCombosPanel';
import { calculateGagAccuracy } from './gagAccuracy';

const TRACK_IDS = ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop'] as const;
type TrackId = (typeof TRACK_IDS)[number];
type Variant = 'base' | 'organic' | 'sos';
type TooltipAlign = 'left' | 'center' | 'right';

type Track = {
  id: TrackId;
  name: string;
  color: string;
  gags: Array<{ name: string; image: string; base: number; organic?: number }>;
};

type SosGag = {
  name: string;
  damage: number;
  image: string;
  stars: number;
};

type SelectedGag = {
  trackId: TrackId;
  gagIndex: number;
  variant: Variant;
  name: string;
  image: string;
  color: string;
  damage: number;
  stars?: number;
};

type AccuracyTrackBreakdown = {
  trackId: TrackId;
  baseAccuracy: number;
  organicBonus: number;
  expBonus: number;
  defense: number;
  stunBonus: number;
  stunSources: Array<{ trackId: TrackId; gagCount: number; amount: number }>;
  lureBonus: number;
  trapPlacementBonus: number;
  trapPlacementCount: number;
  uncappedAccuracy: number;
  accuracy: number;
  specialRule?: string;
};

const TRACK_BASE_ACCURACY: Record<TrackId, readonly number[]> = {
  trap: [100, 100, 100, 100, 100, 100, 100],
  lure: [60, 55, 70, 65, 80, 75, 90],
  sound: [95, 95, 95, 95, 95, 95, 95],
  throw: [75, 75, 75, 75, 75, 75, 75],
  squirt: [95, 95, 95, 95, 95, 95, 95],
  drop: [50, 50, 50, 50, 50, 50, 50],
};

const COG_DEFENSE: Record<number, number> = {
  1: 2, 2: 5, 3: 10, 4: 15, 5: 20, 6: 25, 7: 30, 8: 35, 9: 40, 10: 45,
  11: 50, 12: 55, 13: 60, 14: 60, 15: 60, 16: 65, 17: 65, 18: 65, 19: 65, 20: 65,
};

const MAX_TRACK_EXP_BONUS = 60;
const MAX_TOON_ACCURACY = 95;

function applyEstimatedSoftCap(rawAccuracy: number) {
  if (rawAccuracy <= MAX_TOON_ACCURACY) return Math.max(0, rawAccuracy);
  return Math.min(100, MAX_TOON_ACCURACY + (rawAccuracy - MAX_TOON_ACCURACY) * 0.04);
}

const tracks = (gagsConfig as Track[]).filter((track) => TRACK_IDS.includes(track.id));
const SAVED_GAGS_KEY = 'toonhqplus:gag-calculator:selected-gags';

const getSosGags = (trackId: TrackId): SosGag[] => {
  if (trackId === 'throw' || trackId === 'squirt') return [];
  return (SOS_GAGS[trackId] || [])
    .filter((gag) => [3, 4, 5].includes(gag.gagIndex))
    .map((gag) => ({
      name: gag.name,
      damage: gag.damage,
      image: gag.image,
      stars: gag.gagIndex,
    }));
};

function comboBonus(damage: number, count: number) {
  return count >= 2 ? Math.ceil(damage * 0.2) : 0;
}

function calculateDamage(gags: Array<SelectedGag | null>, preLured: boolean) {
  let base = 0;
  let knockback = 0;
  const bonuses: Array<{ trackId: TrackId; amount: number }> = [];
  let lured = preLured;
  const hasSelectedLure = gags.some((gag) => gag?.trackId === 'lure');
  const selectedTrapCount = gags.filter((gag) => gag?.trackId === 'trap').length;

  for (const trackId of TRACK_IDS) {
    const trackGags = gags.filter((gag): gag is SelectedGag => gag?.trackId === trackId);
    if (!trackGags.length) continue;

    if (trackId === 'trap') {
      if (hasSelectedLure) base += Math.max(...trackGags.map((gag) => gag.damage));
      continue;
    }

    if (trackId === 'lure') {
      // A successful Lure immediately springs a Trap selected in the same
      // combo. Once the Trap hits, the Cog is no longer lured, so a later
      // Drop can hit normally.
      lured = selectedTrapCount === 0;
      continue;
    }

    const baseDamage = trackGags.reduce((sum, gag) => sum + gag.damage, 0);
    const bonus = comboBonus(baseDamage, trackGags.length);

    if (trackId === 'sound') {
      base += baseDamage;
      if (bonus) bonuses.push({ trackId, amount: bonus });
      lured = false;
    } else if (trackId === 'throw' || trackId === 'squirt') {
      const trackKnockback = lured ? Math.ceil(baseDamage * 0.5) : 0;
      base += baseDamage;
      knockback += trackKnockback;
      if (bonus) bonuses.push({ trackId, amount: bonus });
      lured = false;
    } else if (trackId === 'drop' && !lured) {
      base += baseDamage;
      if (bonus) bonuses.push({ trackId, amount: bonus });
    }
  }

  const bonus = bonuses.reduce((sum, entry) => sum + entry.amount, 0);
  return { total: base + knockback + bonus, base, knockback, bonuses };
}

function getHighestDefeatedCogLevel(damage: number) {
  return Math.max(
    0,
    ...Object.entries(COG_HEALTH)
      .filter(([, hp]) => damage >= hp)
      .map(([level]) => Number(level)),
  );
}

function getLureType(gagIndex: number) {
  return gagIndex === 6 || gagIndex % 2 === 1 ? 'group' : 'single';
}

function getLureTier(gagIndex: number) {
  return Math.min(3, Math.floor(gagIndex / 2) + 1);
}

function getMultiLureBonus(lures: SelectedGag[], baseline: SelectedGag) {
  const baselineType = getLureType(baseline.gagIndex);
  const baselineTier = getLureTier(baseline.gagIndex);

  return lures.reduce((bonus, lure) => {
    if (lure === baseline || getLureType(lure.gagIndex) !== baselineType) return bonus;
    const tierDifference = baselineTier - getLureTier(lure.gagIndex);
    return bonus + (tierDifference <= 0 ? 20 : tierDifference === 1 ? 15 : 10);
  }, 0);
}

function calculateAccuracyLegacy(gags: Array<SelectedGag | null>, preLured: boolean, cogLevel: number) {
  const cogDefense = COG_DEFENSE[cogLevel] ?? COG_DEFENSE[20];
  const breakdown: AccuracyTrackBreakdown[] = [];
  let stunBonus = 0;
  const stunSources: AccuracyTrackBreakdown['stunSources'] = [];
  let lured = preLured;
  const hasSelectedLure = gags.some((gag) => gag?.trackId === 'lure');
  const selectedTrapCount = gags.filter((gag) => gag?.trackId === 'trap').length;

  for (const trackId of TRACK_IDS) {
    const trackGags = gags.filter((gag): gag is SelectedGag => gag?.trackId === trackId);
    if (!trackGags.length) continue;

    const baselineGag = trackGags.reduce((highest, gag) => gag.gagIndex > highest.gagIndex ? gag : highest);
    const gagLevel = baselineGag.gagIndex;
    const organicBonus = trackId === 'lure' && baselineGag.variant === 'organic' ? 10 : 0;
    const baseAccuracy = TRACK_BASE_ACCURACY[trackId][gagLevel];
    const adjustedBaseAccuracy = Math.min(baseAccuracy + organicBonus, MAX_TOON_ACCURACY);
    const lureBonus = trackId === 'lure' ? getMultiLureBonus(trackGags, baselineGag) : 0;
    const trapPlacementBonus = trackId === 'lure' && selectedTrapCount > 0
      ? 10 + (getLureType(baselineGag.gagIndex) === 'group' ? (selectedTrapCount - 1) * 5 : 0)
      : 0;
    const trapPlacementCount = trackId === 'lure'
      ? getLureType(baselineGag.gagIndex) === 'group' ? selectedTrapCount : Math.min(selectedTrapCount, 1)
      : 0;
    const appliedStunBonus = trackId === 'lure' ? trapPlacementBonus : stunBonus;
    const uncappedAccuracy = adjustedBaseAccuracy + MAX_TRACK_EXP_BONUS - cogDefense + appliedStunBonus + lureBonus;
    let accuracy: number;
    let specialRule: string | undefined;
    if (trackId === 'drop' && lured) {
      accuracy = 0;
      specialRule = 'Drop always misses lured Cogs';
    } else if (trackId === 'trap' || trackGags.some((gag) => gag.variant === 'sos')) {
      accuracy = 100;
      specialRule = trackId === 'trap'
        ? hasSelectedLure
          ? `${trackGags.length} Trap placement${trackGags.length === 1 ? '' : 's'} always hit; strongest Trap supplies target damage`
          : `${trackGags.length} Trap placement${trackGags.length === 1 ? '' : 's'} always hit; select a Lure gag to activate damage`
        : 'SOS gag always hits';
    } else if (lured && trackId !== 'lure') {
      accuracy = 100;
      specialRule = 'Attacking a lured Cog always hits';
    } else {
      accuracy = applyEstimatedSoftCap(uncappedAccuracy);
    }

    breakdown.push({
      trackId,
      baseAccuracy,
      organicBonus: specialRule ? 0 : organicBonus,
      expBonus: specialRule ? 0 : MAX_TRACK_EXP_BONUS,
      defense: specialRule ? 0 : cogDefense,
      stunBonus: specialRule || trackId === 'lure' ? 0 : stunBonus,
      stunSources: specialRule || trackId === 'lure' ? [] : [...stunSources],
      lureBonus: specialRule ? 0 : lureBonus,
      trapPlacementBonus: specialRule ? 0 : trapPlacementBonus,
      trapPlacementCount: specialRule ? 0 : trapPlacementCount,
      uncappedAccuracy: specialRule ? accuracy : uncappedAccuracy,
      accuracy,
      specialRule,
    });
    if (accuracy > 0 && trackId !== 'lure' && (trackId !== 'trap' || hasSelectedLure)) {
      const amount = trackId === 'trap' ? 50 : trackGags.length * 25;
      stunBonus += amount;
      stunSources.push({ trackId, gagCount: trackGags.length, amount });
    }

    if (trackId === 'lure' && accuracy > 0) {
      // Lure springs the selected Trap and consumes the lure status before
      // later tracks (especially Drop) resolve.
      lured = selectedTrapCount === 0;
    }
    if (trackId === 'sound' || trackId === 'throw' || trackId === 'squirt') lured = false;
  }

  const total = breakdown.length
    ? breakdown.reduce((chance, entry) => chance * (entry.accuracy / 100), 1) * 100
    : 0;
  return { total, breakdown, cogLevel, cogDefense };
}

function calculateAccuracy(gags: Array<SelectedGag | null>, preLured: boolean, cogLevel: number) {
  return calculateGagAccuracy(gags, preLured, cogLevel);
}

function formatAccuracy(value: number) {
  return Number(value.toFixed(2)).toString();
}

function AccuracyBreakdownTooltip({ breakdown, position, root, id }: {
  breakdown: ReturnType<typeof calculateAccuracy>;
  position: { left: number; top: number };
  root: Element | DocumentFragment;
  id: string;
}) {
  const getTrackName = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.name ?? trackId;
  const getTrackColor = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.color ?? 'white';

  return createPortal(
    <div id={id} role="tooltip" className="gag-calculator-tooltip pointer-events-none fixed z-[2147483647] w-max min-w-56 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-white/15 bg-[#020712] px-3 py-2 text-left shadow-xl" style={{ left: position.left, top: position.top }}>
      <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-white/15 bg-[#020712]" aria-hidden="true" />
      <div className="mb-1.5 text-xs font-black text-white">Level {breakdown.cogLevel} Cog ({breakdown.cogLevel > 12 ? 'estimated ' : ''}{breakdown.cogDefense} evasion)</div>
      {breakdown.breakdown.map((entry) => (
        <div key={entry.trackId} className="mb-1.5 text-[11px] font-black tabular-nums last:mb-0" style={{ color: getTrackColor(entry.trackId) }}>
          <div>{getTrackName(entry.trackId)}: {formatAccuracy(entry.accuracy)}%</div>
          {entry.specialRule && entry.trackId !== 'trap' ? <div className="pl-2 text-[10px] font-bold text-white/65">{entry.specialRule}</div> : !entry.specialRule ? (
            <div className="pl-2 text-[10px] font-bold leading-snug text-white/65">
              <div>Base accuracy: {entry.baseAccuracy}%</div>
              {entry.organicBonus > 0 && <div>Organic bonus: +{entry.organicBonus}%{entry.baseAccuracy + entry.organicBonus > MAX_TOON_ACCURACY ? ' (base capped at 95%)' : ''}</div>}
              <div>Maxed track EXP: +{entry.expBonus}%</div>
              <div>Level {breakdown.cogLevel} evasion: -{entry.defense}%</div>
              {entry.trapPlacementBonus > 0 && <>
                <div>Trap placement bonus to Lure: +{entry.trapPlacementBonus}%</div>
                <div className="pl-2" style={{ color: getTrackColor('trap') }}>↳ First trapped Cog: +10%</div>
                {entry.trapPlacementCount > 1 && <div className="pl-2" style={{ color: getTrackColor('trap') }}>↳ {entry.trapPlacementCount - 1} additional trapped Cog{entry.trapPlacementCount === 2 ? '' : 's'} × 5% = +{(entry.trapPlacementCount - 1) * 5}%</div>}
              </>}
              {entry.lureBonus > 0 && <div>Multi-Lure bonus: +{entry.lureBonus}%</div>}
              {entry.stunBonus > 0 && <>
                <div>Stun bonus: +{entry.stunBonus}%</div>
                {entry.stunSources.map((source) => <div key={source.trackId} className="pl-2" style={{ color: getTrackColor(source.trackId) }}>↳ {getTrackName(source.trackId)}: {source.trackId === 'trap' ? '+50%' : `${source.gagCount} gag${source.gagCount === 1 ? '' : 's'} × 25% = +${source.amount}%`}</div>)}
              </>}
              <div className="mt-0.5 text-white">Result: {entry.uncappedAccuracy}% raw{entry.uncappedAccuracy > MAX_TOON_ACCURACY ? ` → ~${formatAccuracy(entry.accuracy)}% estimated soft cap` : ` → ${formatAccuracy(entry.accuracy)}%`}</div>
            </div>
          ) : null}
        </div>
      ))}
      <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] font-bold tabular-nums text-white/65">
        <div>{breakdown.breakdown.map((entry) => `${formatAccuracy(entry.accuracy)}%`).join(' × ')}</div>
        <div className="text-[11px] font-black text-sky-300">= {formatAccuracy(breakdown.total)}% chance every selected gag hits</div>
      </div>
    </div>,
    root,
  );
}

function GagChoice({
  gag,
  track,
  gagIndex,
  onSelect,
  organicMode = false,
  tooltipBelow = false,
  tooltipAlign = 'center',
}: {
  gag: Track['gags'][number];
  track: Track;
  gagIndex: number;
  onSelect: (gag: SelectedGag) => void;
  organicMode?: boolean;
  tooltipBelow?: boolean;
  tooltipAlign?: TooltipAlign;
}) {
  const getAccuracy = (variant: Variant) => track.id === 'lure'
    ? Math.min(gag.base + (variant === 'organic' ? 10 : 0), MAX_TOON_ACCURACY)
    : TRACK_BASE_ACCURACY[track.id][gagIndex];
  const tooltipPosition = tooltipAlign === 'left'
    ? 'left-0'
    : tooltipAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  const select = (variant: Variant) => {
    onSelect({
      trackId: track.id,
      gagIndex,
      variant,
      name: gag.name,
      image: `https://toonhq.org/static/assets/gags/${gag.image}`,
      color: track.color,
      damage: variant === 'organic' ? (gag.organic ?? gag.base) : gag.base,
    });
  };

  return (
    <div className="group/gag relative">
      <div className="group/main-gag relative">
        <button
          type="button"
          onClick={() => select(organicMode ? 'organic' : 'base')}
          className="gag-btn-base gag-btn-active"
          style={{ backgroundColor: track.color, borderColor: 'transparent' }}
          aria-label={`${gag.name} (${getAccuracy(organicMode ? 'organic' : 'base')}% accuracy${track.id === 'lure' ? '' : `, ${organicMode ? (gag.organic ?? gag.base) : gag.base} damage`})`}
        >
          <img
            src={`https://toonhq.org/static/assets/gags/${gag.image}`}
            alt={gag.name}
            className="object-contain drop-shadow-md transition-transform group-hover/gag:scale-105"
            draggable="false"
          />
        </button>
        <div className={`pointer-events-none absolute z-30 hidden w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-white/15 bg-[#020712] px-3 py-2.5 text-center shadow-xl group-hover/main-gag:block ${tooltipPosition} ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
          <div className="text-xs font-black leading-tight text-white">{organicMode ? 'Organic ' : ''}{gag.name}</div>
          {track.id !== 'lure' && <div className="mt-1 text-[11px] font-bold text-lime-300">{organicMode ? (gag.organic ?? gag.base) : gag.base} damage</div>}
          <div className="mt-1 text-[11px] font-bold text-sky-300">{getAccuracy(organicMode ? 'organic' : 'base')}% accuracy</div>
        </div>
      </div>
      <div className="group/organic absolute -right-2 -top-2 z-10 h-6 w-6">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            select('organic');
          }}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center grayscale transition-all hover:scale-125 hover:grayscale-0 group-hover/gag:opacity-100 group-hover/organic:opacity-100 focus:opacity-100 focus:grayscale-0 ${organicMode ? 'opacity-100 grayscale-0' : 'opacity-0'}`}
          aria-label={`Select organic ${gag.name}`}
        >
          <img
            src={'https://toonhq.org/static/assets/gags/ttr/organic.webp'}
            alt=""
            className="h-full w-full object-contain drop-shadow-[0_1px_2px_#000]"
          />
        </button>
        <div className={`pointer-events-none absolute z-30 hidden w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-white/15 bg-[#020712] px-3 py-2.5 text-center shadow-xl group-hover/organic:block ${tooltipPosition} ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
          <div className="text-xs font-black leading-tight text-white">Organic {gag.name}</div>
          {track.id !== 'lure' && <div className="mt-1 text-[11px] font-bold text-lime-300">{gag.organic ?? gag.base} damage</div>}
          <div className="mt-1 text-[11px] font-bold text-sky-300">{getAccuracy('organic')}% accuracy</div>
        </div>
      </div>
    </div>
  );
}

function SosChoice({
  gag,
  track,
  gagIndex,
  onSelect,
  disabled = false,
  tooltipBelow = false,
  tooltipAlign = 'center',
}: {
  gag: SosGag;
  track: Track;
  gagIndex: number;
  onSelect: (gag: SelectedGag) => void;
  disabled?: boolean;
  tooltipBelow?: boolean;
  tooltipAlign?: TooltipAlign;
}) {
  const metricText = track.id === 'lure' ? '100% accuracy' : `${gag.damage} damage, 100% accuracy`;
  const tooltipPosition = tooltipAlign === 'left'
    ? 'left-0'
    : tooltipAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div className="group/main-gag relative">
      <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect({
        trackId: track.id,
        gagIndex,
        variant: 'sos',
        name: gag.name,
        image: gag.image,
        color: track.color,
        damage: gag.damage,
        stars: gag.stars,
      })}
      className="gag-btn-base cursor-pointer hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
      style={{ backgroundColor: track.color, borderColor: 'transparent' }}
      aria-label={`${gag.name} (${metricText})`}
    >
      <img src={gag.image} alt={gag.name} className="object-contain drop-shadow-md" />
      <span className="absolute inset-x-0 -top-1 text-center text-[7px] tracking-[-1px] text-yellow-300 drop-shadow-[0_1px_1px_#000]">
        {'★'.repeat(gag.stars)}
      </span>
      </button>
      <div className={`pointer-events-none absolute z-30 hidden w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-white/15 bg-[#020712] px-3 py-2.5 text-center shadow-xl group-hover/main-gag:block ${tooltipPosition} ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
        <div className="text-xs font-black leading-tight text-white">{gag.name}</div>
        {track.id !== 'lure' && <div className="mt-1 text-[11px] font-bold text-lime-300">{gag.damage} damage</div>}
        <div className="mt-1 text-[11px] font-bold text-sky-300">100% accuracy</div>
      </div>
    </div>
  );
}

function CogCarousel({
  damage,
  selectedGags,
  preLured,
}: {
  damage: number;
  selectedGags: Array<SelectedGag | null>;
  preLured: boolean;
}) {
  const highestDefeated = getHighestDefeatedCogLevel(damage);
  const focusLevel = highestDefeated || 1;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeLevel, setActiveLevel] = useState(focusLevel);
  const [accuracyTooltip, setAccuracyTooltip] = useState<{ breakdown: ReturnType<typeof calculateAccuracy>; position: { left: number; top: number }; root: Element | DocumentFragment } | null>(null);
  const activeLevelRef = useRef(focusLevel);
  const programmaticLevelRef = useRef<number | null>(null);
  const levels = Array.from({ length: 20 }, (_, index) => index + 1);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const hero = viewport?.querySelector<HTMLElement>('[data-highest-defeated="true"]');
    if (!viewport || !hero) return;
    const pinResult = () => {
      const left = hero.offsetLeft - viewport.scrollLeft;
      const pinnedLeft = Math.max(12, Math.min(viewport.clientWidth - hero.offsetWidth - 12, left));
      hero.style.setProperty('--cog-pin-x', `${pinnedLeft - left}px`);
      hero.dataset.docked = left < 12 ? 'left' : left > pinnedLeft ? 'right' : 'none';
    };
    pinResult();
    viewport.addEventListener('scroll', pinResult, { passive: true });
    const observer = new ResizeObserver(pinResult);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener('scroll', pinResult);
      observer.disconnect();
      hero.style.removeProperty('--cog-pin-x');
      delete hero.dataset.docked;
    };
  }, [highestDefeated, activeLevel]);

  const scrollToLevel = (level: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    viewport?.dispatchEvent(new CustomEvent('cog-scroll-to', { detail: { level, behavior } }));
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resizeObserver = new ResizeObserver(() => scrollToLevel(activeLevelRef.current, 'instant'));
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    let settleTimer = 0;
    let target = viewport.scrollLeft;
    let lastTime = 0;
    let programmaticStart = 0;
    let programmaticFrom = viewport.scrollLeft;
    let settling = false;
    let targetLevel: number | null = null;
    let instant = false;
    let settledFrames = 0;
    let drag: { id: number; x: number; left: number; moved: boolean } | null = null;
    let suppressClick = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clamp = (left: number) => Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, left));
    const animate = (time: number) => {
      // Re-measure in case the viewport changes while the animation is running.
      if (targetLevel !== null) {
        const card = viewport.querySelector<HTMLElement>(`[data-level="${targetLevel}"]`);
        if (card) target = clamp(card.offsetLeft + card.offsetWidth / 2 - viewport.clientWidth / 2);
      }
      const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16;
      lastTime = time;
      const difference = target - viewport.scrollLeft;
      if (programmaticLevelRef.current !== null) {
        if (!programmaticStart) programmaticStart = time;
        const progress = instant || reducedMotion.matches ? 1 : Math.min(1, (time - programmaticStart) / 240);
        const eased = 1 - Math.pow(1 - progress, 3);
        viewport.scrollLeft = programmaticFrom + (target - programmaticFrom) * eased;
        if (progress < 1) {
          frame = requestAnimationFrame(animate);
        } else {
          viewport.scrollLeft = target;
          frame = 0;
          lastTime = 0;
          programmaticStart = 0;
          programmaticLevelRef.current = null;
          viewport.classList.remove('is-scrolling');
        }
        return;
      }
      viewport.scrollLeft += difference * (instant || reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 65));
      settledFrames = Math.abs(difference) <= 1 ? settledFrames + 1 : 0;
      if (settledFrames < 3) {
        frame = requestAnimationFrame(animate);
      } else {
        viewport.scrollLeft = target;
        frame = 0;
        lastTime = 0;
        programmaticLevelRef.current = null;
        if (settling) viewport.classList.remove('is-scrolling');
      }
    };
    const startAnimation = () => {
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const settle = () => {
      const cards = Array.from(viewport.querySelectorAll<HTMLElement>('[data-level]'));
      const center = (card: HTMLElement) => card.offsetLeft + card.offsetWidth / 2 - viewport.clientWidth / 2;
      const nearest = cards.reduce((best, card) => Math.abs(center(card) - target) < Math.abs(center(best) - target) ? card : best);
      targetLevel = Number(nearest.dataset.level);
      settledFrames = 0;
      settling = true;
      startAnimation();
    };
    const onScrollTo = (event: Event) => {
      const { level, behavior } = (event as CustomEvent<{ level: number; behavior: ScrollBehavior }>).detail;
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
      drag = null;
      frame = 0;
      lastTime = 0;
      programmaticStart = 0;
      programmaticFrom = viewport.scrollLeft;
      settledFrames = 0;
      targetLevel = level;
      programmaticLevelRef.current = level;
      activeLevelRef.current = level;
      setActiveLevel(level);
      instant = behavior === 'instant';
      settling = true;
      viewport.classList.remove('is-dragging');
      viewport.classList.add('is-scrolling');
      startAnimation();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || drag) return;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
        * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1);
      if ((delta < 0 && viewport.scrollLeft <= 1) ||
          (delta > 0 && viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 1)) return;
      event.preventDefault();
      targetLevel = null;
      programmaticLevelRef.current = null;
      instant = false;
      settledFrames = 0;
      if (!frame) target = viewport.scrollLeft;
      target = clamp(target + delta);
      settling = false;
      viewport.classList.add('is-scrolling');
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 140);
      startAnimation();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      event.preventDefault();
      cancelAnimationFrame(frame);
      targetLevel = null;
      programmaticLevelRef.current = null;
      instant = false;
      settledFrames = 0;
      frame = 0;
      lastTime = 0;
      window.clearTimeout(settleTimer);
      suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, left: viewport.scrollLeft, moved: false };
      viewport.classList.add('is-dragging', 'is-scrolling');
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const distance = event.clientX - drag.x;
      if (!drag.moved && Math.abs(distance) < 4) return;
      drag.moved = true;
      suppressClick = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.scrollLeft = clamp(drag.left - distance);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      viewport.classList.remove('is-dragging');
      target = viewport.scrollLeft;
      settle();
    };
    const onClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        window.clearTimeout(settleTimer);
        programmaticLevelRef.current = null;
        viewport.classList.remove('is-scrolling');
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };
    viewport.addEventListener('cog-scroll-to', onScrollTo);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      viewport.classList.remove('is-scrolling', 'is-dragging');
      viewport.removeEventListener('cog-scroll-to', onScrollTo);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, []);

  useLayoutEffect(() => {
    scrollToLevel(focusLevel);
  }, [focusLevel]);

  return (
    <section className="gag-cog-carousel" aria-label="Cog levels" aria-roledescription="carousel">
      <div ref={viewportRef} className="gag-cog-viewport" tabIndex={0} aria-label="Scroll Cog levels; use left and right arrow keys"
        onKeyDown={(event) => {
          const next = event.key === 'ArrowLeft' ? activeLevel - 1 : event.key === 'ArrowRight' ? activeLevel + 1 : event.key === 'Home' ? 1 : event.key === 'End' ? 20 : null;
          if (next === null) return;
          event.preventDefault();
          scrollToLevel(Math.max(1, Math.min(20, next)));
        }}
        onScroll={() => {
          const viewport = viewportRef.current;
          if (!viewport || programmaticLevelRef.current !== null) return;
          const cards = Array.from(viewport.querySelectorAll<HTMLElement>('[data-level]'));
          const center = viewport.scrollLeft + viewport.clientWidth / 2;
          const closest = cards.reduce((best, card) => Math.abs(card.offsetLeft + card.offsetWidth / 2 - center) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - center) ? card : best);
          activeLevelRef.current = Number(closest.dataset.level);
          setActiveLevel(activeLevelRef.current);
        }}>
      <div
        className="gag-cog-track"
      >
        {levels.map((level) => {
          const hp = COG_HEALTH[level];
          const defeated = damage >= hp;
            const cardAccuracyBreakdown = calculateAccuracy(selectedGags, preLured, level);
            const allHitAccuracy = cardAccuracyBreakdown.total;
            const isFocus = level === activeLevel;
            const isHighestDefeated = level === highestDefeated;
            const distance = Math.abs(level - focusLevel);
            const difference = Math.abs(damage - hp);
            const cardScale = isHighestDefeated ? 1 : level === focusLevel ? 0.8 : distance === 1 ? 0.76 : 0.7;
            return (
              <div key={level} data-level={level} className="gag-cog-slot"
                style={{ width: `calc(var(--cog-width) * ${cardScale} + 10px)` }}>
              <button
                type="button"
                data-highest-defeated={isHighestDefeated}
                aria-current={isFocus ? 'true' : undefined}
                aria-label={`${isHighestDefeated ? 'Highest defeated Cog. ' : ''}Level ${level}, ${hp} HP, ${defeated ? 'defeated' : `${difference} damage short`}, ${formatAccuracy(allHitAccuracy)}% accuracy`}
                onClick={() => scrollToLevel(level)}
                onFocus={() => scrollToLevel(level)}
                className={`gag-cog-card relative flex flex-col items-center rounded-xl border px-1 py-4 text-center ${isFocus
                ? defeated
                  ? 'z-[2] border-red-300/70 bg-red-950/80'
                  : 'z-[2] border-lime-300/70 bg-green-950/80'
                : defeated
                  ? 'border-red-400/25 bg-red-950/65'
                  : 'border-green-400/25 bg-green-950/65'
                }`}
              style={{
                transform: `translateX(${isHighestDefeated ? 'var(--cog-pin-x, 0px)' : '0px'}) scale(${cardScale})`,
                opacity: isHighestDefeated ? 1 : level === focusLevel ? 0.85 : distance === 1 ? 0.72 : 0.52,
              }}
            >
              <img
                src={'https://toonhq.org/static/assets/cogs/skelecog.png'}
                alt=""
                draggable={false}
                className={`h-24 w-24 object-contain transition-opacity duration-300 ${defeated ? 'opacity-40' : 'opacity-100'}`}
              />
              <div className="text-3xl font-black leading-tight text-white">Level {level}</div>
              <div className="text-2xl font-black tabular-nums text-white">{hp} HP</div>
              <div className={`text-sm font-black tabular-nums ${defeated ? 'text-red-300' : 'text-amber-300'}`}>
                {defeated ? `+${difference} Over` : `-${difference} Short`}
              </div>
              <div
                className="whitespace-nowrap rounded px-1 text-sm font-black tabular-nums text-sky-300 underline decoration-dotted decoration-sky-300/60 underline-offset-2"
                onMouseEnter={(event) => {
                  const element = event.currentTarget;
                  const bounds = element.getBoundingClientRect();
                  setAccuracyTooltip({
                    breakdown: cardAccuracyBreakdown,
                    position: { left: Math.min(window.innerWidth - 110, Math.max(110, bounds.left + bounds.width / 2)), top: bounds.bottom + 8 },
                    root: element.getRootNode() instanceof ShadowRoot ? element.getRootNode() as ShadowRoot : document.body,
                  });
                }}
                onMouseLeave={() => setAccuracyTooltip(null)}
              >{formatAccuracy(allHitAccuracy)}% Accuracy</div>
            </button>
            </div>
          );
        })}
      </div>
      </div>
      {accuracyTooltip && <AccuracyBreakdownTooltip id="cog-card-accuracy-tooltip" breakdown={accuracyTooltip.breakdown} position={accuracyTooltip.position} root={accuracyTooltip.root} />}
    </section>
  );
}

function DamageBreakdown({
  damageBreakdown,
  getTrackName,
  getTrackColor,
}: {
  damageBreakdown: ReturnType<typeof calculateDamage>;
  getTrackName: (trackId: TrackId) => string;
  getTrackColor: (trackId: TrackId) => string;
}) {
  return (
    <div className="flex w-fit shrink-0 flex-col text-left text-xs font-black leading-tight tabular-nums">
      <span className="text-white">Base {damageBreakdown.base}</span>
      <span style={{ color: '#31be35' }}>Knockback {damageBreakdown.knockback}</span>
      {damageBreakdown.bonuses.map((bonus) => (
        <span key={bonus.trackId} style={{ color: getTrackColor(bonus.trackId) }}>
          {getTrackName(bonus.trackId)} Bonus {bonus.amount}
        </span>
      ))}
      {damageBreakdown.bonuses.length === 0 && <span className="text-white/35">Bonus 0</span>}
    </div>
  );
}

export function GagCalculator() {
  const [selectedGags, setSelectedGags] = useState<Array<SelectedGag | null>>(() => {
    try {
      const saved = window.localStorage.getItem(SAVED_GAGS_KEY);
      if (!saved) return [null, null, null, null];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length === 4 ? parsed : [null, null, null, null];
    } catch {
      return [null, null, null, null];
    }
  });
  const [activeSlot, setActiveSlot] = useState(0);
  const [clearOnNextSelection, setClearOnNextSelection] = useState(() => selectedGags.every(Boolean));
  const [preLured, setPreLured] = useState(false);
  const [accuracyTooltipPosition, setAccuracyTooltipPosition] = useState<{ left: number; top: number; root: Element | DocumentFragment } | null>(null);
  const hasSelectedGags = selectedGags.some(Boolean);
  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_GAGS_KEY, JSON.stringify(selectedGags));
    } catch {
      // Ignore storage restrictions; the calculator still works for this session.
    }
  }, [selectedGags]);
  const damageBreakdown = useMemo(
    () => calculateDamage(selectedGags, preLured),
    [selectedGags, preLured],
  );
  const accuracyBreakdown = useMemo(
    () => calculateAccuracy(selectedGags, preLured, getHighestDefeatedCogLevel(damageBreakdown.total) || 1),
    [selectedGags, preLured, damageBreakdown.total],
  );
  const getTrackName = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.name ?? trackId;
  const getTrackColor = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.color ?? 'white';
  const isSosSelected = (trackId: TrackId, gagIndex: number) => selectedGags.some(
    (entry) => entry?.variant === 'sos' && entry.trackId === trackId && entry.gagIndex === gagIndex,
  );
  const showAccuracyTooltip = (element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    setAccuracyTooltipPosition({
      left: Math.min(window.innerWidth - 110, Math.max(110, bounds.left + bounds.width / 2)),
      top: bounds.bottom + 8,
      root: element.getRootNode() instanceof ShadowRoot ? element.getRootNode() as ShadowRoot : document.body,
    });
  };

  const selectGag = (gag: SelectedGag) => {
    if (!clearOnNextSelection && gag.variant === 'sos' && isSosSelected(gag.trackId, gag.gagIndex)) return;

    setSelectedGags((current) => {
      if (clearOnNextSelection) return [gag, null, null, null];
      const next = [...current];
      next[activeSlot] = gag;
      return next;
    });
    if (clearOnNextSelection) {
      setClearOnNextSelection(false);
      setActiveSlot(1);
    } else if (activeSlot === 3) {
      setClearOnNextSelection(true);
      setActiveSlot(0);
    } else {
      setActiveSlot((current) => current + 1);
    }
  };

  return (
    <div className="gag-calculator-page flex min-h-full w-full items-start justify-start gap-4">
      <aside className="min-w-[380px] w-[380px] shrink-0">
        <GagCombosPanel />
      </aside>
      <section className="flex flex-1 w-[720px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#082416] p-3 shadow-inner">
      <CogCarousel damage={damageBreakdown.total} selectedGags={selectedGags} preLured={preLured} />

      <div className="custom-scrollbar flex w-fit max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-2">
        <button
          type="button"
          onClick={() => setPreLured((value) => !value)}
          className={`flex h-12 w-16 shrink-0 cursor-pointer items-center justify-center rounded-md border transition ${preLured
            ? 'border-emerald-400 bg-[#166534]'
            : 'border-gray-500 bg-[#4b5563] grayscale hover:border-emerald-400 hover:grayscale-0'
            }`}
          aria-pressed={preLured}
          title={preLured ? 'Cog starts lured — click to disable' : 'Cog starts unlured — click to enable pre-lured'}
          aria-label="Toggle pre-lured Cog"
        >
          <img src={'https://toonhq.org/static/assets/gags/ttr/1_bill.png'} alt="" className="h-9 w-11 object-contain" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1">
          {selectedGags.map((gag, index) => (
            <div key={index} className="flex flex-col items-center gap-0.5">
              <span className="h-3" aria-hidden="true" />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setClearOnNextSelection(false);
                    setActiveSlot(index);
                    if (gag) {
                      setSelectedGags((current) => current.map((entry, slot) => slot === index ? null : entry));
                    }
                  }}
                  className={`gag-btn-base shrink-0 cursor-pointer border-transparent ${activeSlot === index
                    ? 'ring-2 ring-sky-300/70 shadow-[0_0_12px_rgba(56,189,248,0.16)]'
                    : gag ? '' : 'bg-black/20'
                    }`}
                  style={gag ? { backgroundColor: gag.color } : undefined}
                  title={gag ? `Remove ${gag.name}` : `Select slot ${index + 1}`}
                >
                  {gag ? (
                    <>
                      <img src={gag.image} alt={gag.name} className="h-12 w-8 object-contain drop-shadow-md" />
                      {gag.variant === 'sos' && gag.stars && (
                        <span className="absolute inset-x-0 top-0 text-center text-[7px] text-yellow-300 drop-shadow-[0_1px_1px_#000]">
                          {'★'.repeat(gag.stars)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-lg font-black text-white/15">{index + 1}</span>
                  )}
                </button>
                {gag?.variant === 'organic' && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center"
                  >
                    <img
                      src={'https://toonhq.org/static/assets/gags/ttr/organic.webp'}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_1px_2px_#000]"
                    />
                  </button>
                )}
              </div>
              <span className="h-3 text-xs font-black tabular-nums text-white">
                {gag ? `${gag.trackId === 'lure' && gag.variant === 'sos' ? 100 : gag.damage}${gag.trackId === 'lure' ? '%' : ''}` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="w-20 shrink-0 text-center">
          <div className="text-3xl font-black tabular-nums text-lime-300">{damageBreakdown.total}</div>
          <div className="text-[10px] font-black uppercase text-white/35">damage</div>
          <div
            className="relative mt-1 cursor-help rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-sky-300/10 focus-visible:bg-sky-300/10 focus-visible:ring-1 focus-visible:ring-sky-300/50"
            tabIndex={0}
            aria-describedby="gag-accuracy-tooltip"
            aria-label="Show accuracy calculation breakdown"
            onMouseEnter={(event) => showAccuracyTooltip(event.currentTarget)}
            onMouseLeave={() => setAccuracyTooltipPosition(null)}
            onFocus={(event) => showAccuracyTooltip(event.currentTarget)}
            onBlur={() => setAccuracyTooltipPosition(null)}
          >
            <div className="text-lg font-black leading-none tabular-nums text-sky-300 underline decoration-dotted decoration-sky-300/60 underline-offset-2">
              {formatAccuracy(accuracyBreakdown.total)}%
            </div>
            <div className="text-[9px] font-black uppercase text-white/35">all hit</div>
          </div>
        </div>

        <DamageBreakdown
          damageBreakdown={damageBreakdown}
          getTrackName={getTrackName}
          getTrackColor={getTrackColor}
        />

        <button
          type="button"
          onClick={() => {
            setSelectedGags([null, null, null, null]);
            setClearOnNextSelection(false);
            setActiveSlot(0);
          }}
          className="trash-button relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center"
          data-trash-has-gags={hasSelectedGags}
          title="Clear selected gags"
          aria-label="Clear selected gags"
        >
          <img src={browser.runtime.getURL('/images/trashcan_closed.png')} alt="" className="trash-can-image trash-can-closed" />
          <img src={browser.runtime.getURL('/images/trashcan_rlvr.png')} alt="" className="trash-can-image trash-can-rlvr" />
        </button>
      </div>

      <div className="w-fit max-w-full overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-2 custom-scrollbar">
        <div className="min-w-[650px]">
          {tracks.map((track) => (
            <div key={track.id} className="flex items-center border-b border-white/[0.07] py-1 last:border-b-0">
              <div className="flex gap-0.5">
                {track.gags.map((gag, gagIndex) => (
                  <GagChoice key={gag.name} gag={gag} track={track} gagIndex={gagIndex} onSelect={selectGag} tooltipBelow={track.id === TRACK_IDS[0]} tooltipAlign={gagIndex <= 1 ? 'left' : gagIndex >= 5 ? 'right' : 'center'} />
                ))}
                {getSosGags(track.id).length > 0 && (
                  <div className="ml-1 flex gap-0.5 border-l border-white/15 pl-1">
                    {getSosGags(track.id).map((gag, gagIndex) => (
                      <SosChoice key={`${gag.name}-${gag.stars}`} gag={gag} track={track} gagIndex={gagIndex + 3} onSelect={selectGag} disabled={isSosSelected(track.id, gagIndex + 3)} tooltipBelow={track.id === TRACK_IDS[0]} tooltipAlign="right" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      </section>
      {accuracyTooltipPosition && createPortal(
        <div
          id="gag-accuracy-tooltip"
          role="tooltip"
          className="gag-calculator-tooltip pointer-events-none fixed z-[2147483647] w-max min-w-56 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-white/15 bg-[#020712] px-3 py-2 text-left shadow-xl"
          style={{ left: accuracyTooltipPosition.left, top: accuracyTooltipPosition.top }}
        >
          <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-white/15 bg-[#020712]" aria-hidden="true" />
          <div className="mb-1.5 text-xs font-black text-white">
            Level {accuracyBreakdown.cogLevel} Cog ({accuracyBreakdown.cogLevel > 12 ? 'estimated ' : ''}{accuracyBreakdown.cogDefense} evasion)
          </div>
          {accuracyBreakdown.breakdown.map((entry) => (
            <div key={entry.trackId} className="mb-1.5 text-[11px] font-black tabular-nums last:mb-0" style={{ color: getTrackColor(entry.trackId) }}>
              <div>{getTrackName(entry.trackId)}: {formatAccuracy(entry.accuracy)}%</div>
              {entry.specialRule && entry.trackId !== 'trap' ? (
                <div className="pl-2 text-[10px] font-bold text-white/65">{entry.specialRule}</div>
              ) : !entry.specialRule ? (
                <div className="pl-2 text-[10px] font-bold leading-snug text-white/65">
                  <div>Base accuracy: {entry.baseAccuracy}%</div>
                  {entry.organicBonus > 0 && <div>Organic bonus: +{entry.organicBonus}%{entry.baseAccuracy + entry.organicBonus > MAX_TOON_ACCURACY ? ' (base capped at 95%)' : ''}</div>}
                  <div>Maxed track EXP: +{entry.expBonus}%</div>
                  <div>Level {accuracyBreakdown.cogLevel} evasion: -{entry.defense}%</div>
                  {entry.trapPlacementBonus > 0 && (
                    <>
                      <div>Trap placement bonus to Lure: +{entry.trapPlacementBonus}%</div>
                      <div className="pl-2" style={{ color: getTrackColor('trap') }}>↳ First trapped Cog: +10%</div>
                      {entry.trapPlacementCount > 1 && (
                        <div className="pl-2" style={{ color: getTrackColor('trap') }}>
                          ↳ {entry.trapPlacementCount - 1} additional trapped Cog{entry.trapPlacementCount === 2 ? '' : 's'} × 5% = +{(entry.trapPlacementCount - 1) * 5}%
                        </div>
                      )}
                    </>
                  )}
                  {entry.lureBonus > 0 && <div>Multi-Lure bonus: +{entry.lureBonus}%</div>}
                  {entry.stunBonus > 0 && (
                    <>
                      <div>Stun bonus: +{entry.stunBonus}%</div>
                      {entry.stunSources.map((source) => (
                        <div key={source.trackId} className="pl-2" style={{ color: getTrackColor(source.trackId) }}>
                          ↳ {getTrackName(source.trackId)}: {source.trackId === 'trap'
                            ? '+50%'
                            : `${source.gagCount} gag${source.gagCount === 1 ? '' : 's'} × 25% = +${source.amount}%`}
                        </div>
                      ))}
                    </>
                  )}
                  <div className="mt-0.5 text-white">
                    Result: {entry.uncappedAccuracy}% raw{entry.uncappedAccuracy > MAX_TOON_ACCURACY
                      ? ` → ~${formatAccuracy(entry.accuracy)}% estimated soft cap`
                      : ` → ${formatAccuracy(entry.accuracy)}%`}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] font-bold tabular-nums text-white/65">
            <div>{accuracyBreakdown.breakdown.map((entry) => `${formatAccuracy(entry.accuracy)}%`).join(' × ')}</div>
            <div className="text-[11px] font-black text-sky-300">
              = {formatAccuracy(accuracyBreakdown.total)}% chance every selected gag hits
            </div>
          </div>
        </div>,
        accuracyTooltipPosition.root,
      )}
    </div>
  );
}
