import { CalculatorPortalProvider, useCalculatorPortal } from './components/CalculatorPortal';
import { GagCombosPanel } from './GagCombosPanel';
import { DefenseSelector } from './DefenseSelector';
import { calculateGagDamage as calculateDamage, getDamageAfterDefense } from './gagDamage';
import type { FieldOfficeDefense } from './gagDamage';
import { CEO_OIL_HEALTH_OPTIONS, getCeoOilCanHealth, getCeoOilCanHealthPercent, NO_OIL_CANS } from './ceoOil';
import type { CeoOilCans } from './ceoOil';
import type { ReactNode } from 'react';
import type { GagAccuracyRemotes } from './gagAccuracy';
import { REMOTE_DAMAGE, REMOTE_SELF_DAMAGE, getRemoteDamage, changeRemoteDamageStars } from './remoteRules';
import type { RemoteStars } from './remoteRules';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COG_HEALTH } from './gagCombos';
import { gags as gagsConfig } from './gags';
import { SOS_GAGS, LURE_DURATIONS } from './CogCalculator';
import { GagButton, SosStars, SosCardImage } from './components/GagButton';
import { staticUrl } from './calculatorAssets';
import { AccuracyDetails, useMobileAccuracy } from './components/AccuracyDetails';
import { calculateGagAccuracy, getGagBaseAccuracy } from './gagAccuracy';

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
  rounds?: number;
};

type SelectedGag = {
  trackId: TrackId | 'toonsHit';
  gagIndex: number;
  variant: Variant;
  name: string;
  image: string;
  color: string;
  damage: number;
  stars?: number;
};

const TRACK_BASE_ACCURACY: Record<TrackId, readonly number[]> = {
  trap: [100, 100, 100, 100, 100, 100, 100],
  lure: [60, 55, 70, 65, 80, 75, 90],
  sound: [95, 95, 95, 95, 95, 95, 95],
  throw: [75, 75, 75, 75, 75, 75, 75],
  squirt: [95, 95, 95, 95, 95, 95, 95],
  drop: [50, 50, 50, 50, 50, 50, 50],
};

const MAX_TOON_ACCURACY = 95;

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
      rounds: gag.rounds,
    }));
};

function getHighestDefeatedCogLevel(damage: number, oil: CeoOilCans = NO_OIL_CANS) {
  return Math.max(
    0,
    ...Object.entries(COG_HEALTH)
      .filter(([, hp]) => damage >= getCeoOilCanHealth(hp, oil))
      .map(([level]) => Number(level)),
  );
}

function calculateAccuracy(gags: Array<SelectedGag | null>, preLured: boolean, cogLevel: number, toonsHit = false, remotes: GagAccuracyRemotes = {}) {
  return calculateGagAccuracy(gags, preLured, cogLevel, toonsHit, remotes);
}

function formatAccuracy(value: number) {
  return Number(value.toFixed(2)).toString();
}

function AccuracyBreakdownTooltip({ breakdown, position, id, onClose }: {
  breakdown: ReturnType<typeof calculateAccuracy>;
  position: { left: number; top: number };
  id: string;
  onClose: () => void;
}) {
  const getTrackName = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.name ?? trackId;
  const getTrackColor = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.color ?? 'white';

  const root = useCalculatorPortal();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visiblePosition, setVisiblePosition] = useState(position);
  useLayoutEffect(() => {
    const placeTooltip = () => {
      const bounds = tooltipRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setVisiblePosition({
        left: Math.max(bounds.width / 2 + 8, Math.min(window.innerWidth - bounds.width / 2 - 8, position.left)),
        top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, position.top)),
      });
    };
    placeTooltip();
    window.addEventListener('resize', placeTooltip);
    return () => window.removeEventListener('resize', placeTooltip);
  }, [position, breakdown]);

  const content = <>
      <div className="mb-1.5 text-xs font-black text-white">
        Level {breakdown.cogLevel} Cog ({breakdown.cogLevel > 12 ? 'estimated ' : ''}{breakdown.cogDefense} evasion)
      </div>
      {breakdown.breakdown.map((entry) => (
        <div key={entry.trackId} className="mb-1.5 text-[11px] font-black tabular-nums last:mb-0" style={{ color: getTrackColor(entry.trackId) }}>
          <div>{getTrackName(entry.trackId)}: {formatAccuracy(entry.accuracy)}%</div>
          {entry.specialRule && entry.trackId !== 'trap' ? (
            <div className="pl-2 text-[10px] font-bold text-white/65">{entry.specialRule}</div>
          ) : !entry.specialRule ? (
            <div className="pl-2 text-[10px] font-bold leading-snug text-white/65">
              <div>Base accuracy: {entry.baseAccuracy}%</div>
              {entry.toonsHitBonus > 0 && <div>Toons Hit: +{entry.toonsHitBonus}%</div>}
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
                {entry.stunSources.map((source) => <div key={source.trackId} className="pl-2" style={{ color: getTrackColor(source.trackId) }}>
                  ↳ {getTrackName(source.trackId)}: {source.trackId === 'trap' ? '+50%' : `${source.gagCount} gag${source.gagCount === 1 ? '' : 's'} × 25% = +${source.amount}%`}
                </div>)}
              </>}
              <div className="mt-0.5 text-white">Result: {entry.uncappedAccuracy}% raw{entry.uncappedAccuracy > MAX_TOON_ACCURACY ? ` → ~${formatAccuracy(entry.accuracy)}% estimated soft cap` : ` → ${formatAccuracy(entry.accuracy)}%`}</div>
            </div>
          ) : null}
        </div>
      ))}
      <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] font-bold tabular-nums text-white/65">
        {breakdown.remoteDamage > 0 && <div>Remote: {breakdown.remoteDamage} DMG · 100% Accuracy</div>}
        <div>{[...breakdown.breakdown.map((entry) => `${formatAccuracy(entry.accuracy)}%`), ...(breakdown.remoteDamage > 0 ? ['100% Remote'] : [])].join(' × ')}</div>
        <div className="text-[11px] font-black text-sky-300">= {formatAccuracy(breakdown.total)}% chance every selected attack hits</div>
      </div>
    </>;
  return <AccuracyDetails title="Accuracy breakdown" onClose={onClose} desktop={createPortal(
    <div ref={tooltipRef} id={id} role="tooltip" className="gag-calculator-tooltip pointer-events-none fixed z-[2147483647] w-max min-w-56 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] -translate-x-1/2 overflow-y-auto rounded-md border border-white/15 bg-[#020712] px-3 py-2 text-left shadow-xl" style={{ left: visiblePosition.left, top: visiblePosition.top }}>{content}</div>, root
  )}>{content}</AccuracyDetails>;
}

function GagChoice({ gag, track, gagIndex, onSelect, organicMode = false }: {
  gag: Track['gags'][number];
  track: Track;
  gagIndex: number;
  onSelect: (gag: SelectedGag) => void;
  organicMode?: boolean;
  tooltipBelow?: boolean;
  tooltipAlign?: TooltipAlign;
}) {
  const getTitle = (organic: boolean) => {
    const accuracy = track.id === 'lure'
      ? Math.min(gag.base + (organic ? 10 : 0), MAX_TOON_ACCURACY)
      : TRACK_BASE_ACCURACY[track.id][gagIndex];
    const metric = track.id === 'lure'
      ? `${accuracy}% accuracy, ${LURE_DURATIONS[gagIndex]} rounds`
      : `${organic ? (gag.organic ?? gag.base) : gag.base} damage, ${accuracy}% accuracy`;
    return `${organic ? 'Organic ' : ''}${gag.name} (${metric})`;
  };
  const select = (variant: Variant) => onSelect({
    trackId: track.id, gagIndex, variant, name: gag.name,
    image: staticUrl(`/external/static/assets/gags/${gag.image}`),
    color: track.color, damage: variant === 'organic' ? (gag.organic ?? gag.base) : gag.base,
  });
  return <GagButton
    imageSrc={staticUrl(`/external/static/assets/gags/${gag.image}`)}
    imageAlt={gag.name} color={track.color}
    title={getTitle(organicMode)} organicTitle={getTitle(true)}
    tooltipContent={{ name: `${organicMode ? 'Organic ' : ''}${gag.name}`,
      damage: track.id === 'lure' ? undefined : organicMode ? gag.organic ?? gag.base : gag.base,
      accuracy: getGagBaseAccuracy(track.id, gagIndex, organicMode),
      rounds: track.id === 'lure' ? LURE_DURATIONS[gagIndex] : undefined }}
    organicTooltipContent={{ name: `Organic ${gag.name}`,
      damage: track.id === 'lure' ? undefined : gag.organic ?? gag.base,
      accuracy: getGagBaseAccuracy(track.id, gagIndex, true),
      rounds: track.id === 'lure' ? LURE_DURATIONS[gagIndex] : undefined }}
    hasOrganic={true} isOrganicActive={organicMode}
    onClick={() => select(organicMode ? 'organic' : 'base')}
    onOrganicClick={event => { event.stopPropagation(); select('organic'); }}
  />;
}

function SosChoice({ gag, track, gagIndex, onSelect, disabled = false }: {
  gag: SosGag;
  track: Track;
  gagIndex: number;
  onSelect: (gag: SelectedGag) => void;
  disabled?: boolean;
  tooltipBelow?: boolean;
  tooltipAlign?: TooltipAlign;
}) {
  const metric = track.id === 'lure' ? `100% accuracy, ${gag.rounds} rounds` : `${gag.damage} damage, 100% accuracy`;
  return <GagButton
    imageSrc={gag.image} imageAlt={gag.name} color={track.color}
    imageScale={1.15}
    title={`${gag.name} (${metric})`} disabled={disabled}
    tooltipContent={{ name: gag.name, damage: track.id === 'lure' ? undefined : gag.damage,
      accuracy: 100, rounds: track.id === 'lure' ? gag.rounds : undefined }}
    onClick={() => onSelect({ trackId: track.id, gagIndex, variant: 'sos', name: gag.name,
      image: gag.image, color: track.color, damage: gag.damage, stars: gag.stars })}
    stars={gag.stars}
  />;
}

function StartingEffectToggle({ active, effect, onToggle }: {
  active: boolean;
  effect: 'lure' | 'accuracy';
  onToggle: () => void;
}) {
  const tooltipId = useId();
  const isLure = effect === 'lure';
  const label = isLure ? 'Pre-lured' : 'Toons Hit';
  return <button type="button" onClick={onToggle} aria-label={label} aria-pressed={active} aria-describedby={tooltipId}
    className={`group relative flex h-8 sm:h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs sm:text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${active
      ? isLure ? 'border-emerald-400 bg-emerald-700 text-white hover:bg-emerald-600' : 'border-sky-400 bg-sky-700 text-white hover:bg-sky-600'
      : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400 hover:bg-slate-700'}`}>
    <img alt="" draggable="false" src={staticUrl(isLure ? '/external/static/assets/gags/ttr/1_bill.png' : '/images/statuses/toons-hit-accuracy.png')}
      className={`h-5 w-5 object-contain ${active ? '' : 'opacity-60'}`} />
    {label}
    <span aria-hidden="true" className={`w-3 text-center ${active ? '' : 'opacity-0'}`}>✓</span>
    <span id={tooltipId} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-44 -translate-x-1/2 rounded-lg border border-white/15 bg-[#020712] px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white/80 shadow-xl group-hover:block group-focus-visible:block">
      {isLure ? 'Cog Starts Lured' : '+75% Gag Accuracy'}
    </span>
  </button>;
}


function MoreEffectsMenu({ children, activeCount }: { children: ReactNode; activeCount: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current || !event.composedPath().includes(ref.current)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={ref} className="relative sm:contents" onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); }
  }} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}
      className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-bold sm:hidden ${activeCount ? 'border-sky-400 bg-sky-800 text-white' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
      More{activeCount > 0 && ` (${activeCount})`} <span aria-hidden="true">▾</span>
    </button>
    <div id={id} className={`mobile-more-effects absolute right-0 top-full z-50 mt-2 max-h-[55dvh] w-64 flex-col gap-2 overflow-y-auto rounded-xl border border-white/15 bg-[#020712] p-3 shadow-xl sm:static sm:mt-0 sm:flex sm:max-h-none sm:w-auto sm:flex-row sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none ${open ? 'flex' : 'hidden'}`}>
      {children}
    </div>
  </div>;
}

function OilCanSelector({ oil, onChange }: { oil: CeoOilCans; onChange: (oil: CeoOilCans) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const selected = CEO_OIL_HEALTH_OPTIONS.find(option => option.cans === oil.cans && option.vip === oil.vip) ?? CEO_OIL_HEALTH_OPTIONS[0];
  const selectedColors = selected.color === '#facc15'
    ? 'border-yellow-300 bg-yellow-500 text-yellow-950 hover:bg-yellow-400'
    : selected.color === '#ef4444'
      ? 'border-red-400 bg-red-800 text-white hover:bg-red-700'
      : 'border-orange-400 bg-orange-800 text-white hover:bg-orange-700';
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current || !event.composedPath().includes(containerRef.current)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        containerRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div ref={containerRef} className="relative" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}
      className={`flex h-8 sm:h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs sm:text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${oil.cans
        ? selectedColors
        : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400 hover:bg-slate-700'}`}>
      <img alt="" draggable="false" src={staticUrl('/images/ceo-oil-can.png')} className="h-5 w-5 -rotate-[32deg] object-contain" />
      Oil Can{oil.cans > 0 && ` (${selected.label})`} <span aria-hidden="true">▾</span>
    </button>
    {open && <div id={panelId} className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/15 bg-[#020712] p-3 text-xs text-white shadow-xl">
      <fieldset>
        <legend className="mb-2 font-bold">CEO Banquet Oil Can Damage</legend>
        {CEO_OIL_HEALTH_OPTIONS.map(option => <div key={option.label}>
          {(option.label === 'Orange' || option.label === 'Yellow 2.0') && <hr className="my-2 border-white/10" />}
          <button type="button" aria-pressed={selected === option} onClick={() => onChange({ cans: option.cans, vip: option.vip })}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${selected === option ? 'border-amber-400/50 bg-amber-500/25 text-white' : 'border-transparent hover:bg-white/10'}`}>
            {option.color && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
            <span>{option.label}</span>
            <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-white/65">{getCeoOilCanHealthPercent(option)}% HP left</span>
          </button>
        </div>)}
      </fieldset>
    </div>}
  </div>;
}

function RemoteSelector({ damageStars, selfDamageStars, onDamageChange, onSelfDamageChange }: {
  damageStars: RemoteStars[];
  selfDamageStars: RemoteStars | null;
  onDamageChange: (stars: RemoteStars, change: 1 | -1) => void;
  onSelfDamageChange: (stars: RemoteStars) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = damageStars.length + Number(selfDamageStars !== null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current || !event.composedPath().includes(containerRef.current)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        containerRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div ref={containerRef} className="relative" onBlur={event => {
    // Clicking a label briefly clears focus before activating its checkbox.
    // Outside pointer clicks are handled separately; only close for a known focus target.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}
      className={`flex h-8 sm:h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs sm:text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${count
        ? 'border-orange-400 bg-orange-800 text-white hover:bg-orange-700'
        : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400 hover:bg-slate-700'}`}>
      <img alt="" draggable="false" src={staticUrl('/images/remotes.webp')} className="h-5 w-5 object-contain" />
      Remote{count > 0 && ` (${count})`} <span aria-hidden="true">▾</span>
    </button>
    {open && <div id={panelId} className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/15 bg-[#020712] p-3 text-xs text-white shadow-xl">
      <fieldset>
        <legend className="mb-2 font-bold">Damage (Other Cogs Remoted)</legend>
        {([1, 2, 3] as const).map(stars => {
          const quantity = damageStars.filter(value => value === stars).length;
          return <div key={stars} className="flex items-center gap-2 rounded px-1 py-2">
            <span className="flex-1">{stars}-Star · {REMOTE_DAMAGE[stars]} DMG</span>
            <button type="button" aria-label={`Remove ${stars}-star damage remote`} disabled={quantity === 0}
              onClick={() => onDamageChange(stars, -1)} className="h-7 w-7 rounded bg-white/10 font-bold hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
            <span aria-label={`${quantity} selected`} className="w-3 text-center tabular-nums">{quantity}</span>
            <button type="button" aria-label={`Add ${stars}-star damage remote`} disabled={damageStars.length >= 3}
              onClick={() => onDamageChange(stars, 1)} className="h-7 w-7 rounded bg-white/10 font-bold hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed">+</button>
          </div>;
        })}
      </fieldset>
      <fieldset className="mt-2 border-t border-white/10 pt-3">
        <legend className="pt-3 font-bold">Self Damage</legend>
        {([1, 2, 3] as const).map(stars => <label key={stars} className="flex cursor-pointer items-center gap-2 rounded px-1 py-2 hover:bg-white/10">
          <input type="checkbox" checked={selfDamageStars === stars} onChange={() => onSelfDamageChange(stars)} className="accent-orange-400" />
          <span>{stars}-Star Self Damage</span><span className="ml-auto tabular-nums text-orange-300">{REMOTE_SELF_DAMAGE[stars]} DMG</span>
        </label>)}
      </fieldset>
    </div>}
  </div>;
}

function SelectedRemotes({ damageStars, selfDamageStars, onRemoveDamage, onRemoveSelf }: {
  damageStars: RemoteStars[];
  selfDamageStars: RemoteStars | null;
  onRemoveDamage: (stars: RemoteStars) => void;
  onRemoveSelf: () => void;
}) {
  if (!damageStars.length && selfDamageStars === null) return null;
  const chipClass = 'flex items-center gap-1.5 rounded-full border border-orange-400/40 bg-orange-950/70 px-2.5 py-1 text-[11px] font-bold text-orange-100 hover:bg-orange-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300';
  return <div role="group" aria-label="Selected remotes" className="flex shrink-0 max-w-full flex-wrap items-center justify-center gap-1.5">
    {damageStars.map((stars, index) => <button key={index} type="button" className={chipClass}
      aria-label={`Remove selected ${stars}-star damage remote ${index + 1}`} title={`${stars}-Star Damage Remote · ${REMOTE_DAMAGE[stars]} DMG · Click to remove`} onClick={() => onRemoveDamage(stars)}>
      <span aria-hidden="true" className="flex h-5 shrink-0 items-center gap-1">
        <img src={staticUrl('/images/remotes.webp')} alt="" draggable="false" className="h-5 w-5 object-contain" />
        <span className="whitespace-nowrap text-[9px] leading-none text-yellow-300">{'★'.repeat(stars)}</span>
      </span>
      <span>{REMOTE_DAMAGE[stars]} DMG</span><span aria-hidden="true">×</span>
    </button>)}
    {selfDamageStars !== null && <button type="button" className={chipClass} aria-label="Remove selected self-damage remote"
      title={`${selfDamageStars}-Star Self Damage Remote · ${REMOTE_SELF_DAMAGE[selfDamageStars]} DMG · Click to remove`} onClick={onRemoveSelf}>
      <span aria-hidden="true" className="flex h-5 shrink-0 items-center gap-1">
        <img src={staticUrl('/images/remotesheal.webp')} alt="" draggable="false" className="h-5 w-5 object-contain" />
        <span className="whitespace-nowrap text-[9px] leading-none text-yellow-300">{'★'.repeat(selfDamageStars)}</span>
      </span>
      <span>{REMOTE_SELF_DAMAGE[selfDamageStars]} DMG</span><span aria-hidden="true">×</span>
    </button>}
  </div>;
}

function CogCarousel({
  damage,
  selectedGags,
  preLured,
  toonsHit,
  remotes,
  oil,
}: {
  damage: number;
  selectedGags: Array<SelectedGag | null>;
  preLured: boolean;
  toonsHit: boolean;
  remotes: GagAccuracyRemotes;
  oil: CeoOilCans;
}) {
  const highestDefeated = getHighestDefeatedCogLevel(damage, oil);
  const focusLevel = highestDefeated || 1;
  const viewportRef = useRef<HTMLDivElement>(null);
  const mobileAccuracy = useMobileAccuracy();
  const [activeLevel, setActiveLevel] = useState(focusLevel);
  const [accuracyTooltip, setAccuracyTooltip] = useState<{ breakdown: ReturnType<typeof calculateAccuracy>; position: { left: number; top: number } } | null>(null);
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
          const maxHp = COG_HEALTH[level];
          const hp = getCeoOilCanHealth(maxHp, oil);
          const oilDamage = maxHp - hp;
          const vipOuterLayer = oil.vip && oilDamage > 0;
          const defeated = damage >= hp;
            const cardAccuracyBreakdown = calculateAccuracy(selectedGags, preLured, level, toonsHit, remotes);
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
                aria-label={`${isHighestDefeated ? `Highest defeated ${vipOuterLayer ? 'outer layer' : 'Cog'}. ` : ''}Level ${level}, ${hp} HP${oilDamage ? ` after ${oil.cans} oil ${oil.cans === 1 ? 'can' : 'cans'} (${oilDamage} damage)${vipOuterLayer ? ', VIP outer layer only' : ''}` : ''}, ${defeated ? 'defeated' : `${difference} damage short`}, ${formatAccuracy(allHitAccuracy)}% accuracy`}
                onClick={() => scrollToLevel(level)}
                onFocus={() => scrollToLevel(level)}
                className={`gag-cog-card relative flex flex-col items-center rounded-xl border px-1 py-2 text-center sm:py-4 ${isFocus
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
              <div className="relative shrink-0">
                <img
                  src={staticUrl('/external/static/assets/cogs/skelecog.png')}
                  alt=""
                  draggable={false}
                  className={`h-14 w-14 object-contain transition-opacity duration-300 sm:h-24 sm:w-24 ${defeated ? 'opacity-40' : 'opacity-100'}`}
                />
                {oilDamage > 0 && <span aria-hidden="true"
                  title={`${maxHp} HP − ${oilDamage} oil damage = ${hp} HP${vipOuterLayer ? ' (2.0 outer layer)' : ''}`}
                  className="gag-oil-damage absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-400/40 bg-slate-950/95 px-1.5 py-0.5 text-[9px] font-black leading-none tabular-nums text-amber-200 sm:text-[10px]">
                  Oil −{oilDamage}
                </span>}
              </div>
              <div className="text-base font-black leading-tight text-white sm:text-3xl">Level {level}</div>
              <div className="text-sm font-black tabular-nums text-white sm:text-2xl">{hp} HP</div>
              <div className={`text-[10px] font-black tabular-nums sm:text-sm ${defeated ? 'text-red-300' : 'text-amber-300'}`}>
                {defeated ? `+${difference} Over` : `-${difference} Short`}
              </div>
              <div
                className="whitespace-nowrap rounded px-1 text-[10px] font-black tabular-nums text-sky-300 underline decoration-dotted decoration-sky-300/60 underline-offset-2 sm:text-sm"
                onMouseEnter={(event) => {
                  if (mobileAccuracy) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setAccuracyTooltip({
                    breakdown: cardAccuracyBreakdown,
                    position: { left: Math.min(window.innerWidth - 110, Math.max(110, bounds.left + bounds.width / 2)), top: bounds.bottom + 8 },
                  });
                }}
                onMouseLeave={() => { if (!mobileAccuracy) setAccuracyTooltip(null); }}
                onClick={event => {
                  if (!mobileAccuracy) return;
                  event.stopPropagation();
                  setAccuracyTooltip({ breakdown: cardAccuracyBreakdown, position: { left: 0, top: 0 } });
                }}
              >{formatAccuracy(allHitAccuracy)}% Accuracy</div>
            </button>
            </div>
          );
        })}
      </div>
      </div>
      {accuracyTooltip && <AccuracyBreakdownTooltip id="cog-card-accuracy-tooltip" breakdown={accuracyTooltip.breakdown} position={accuracyTooltip.position} onClose={() => setAccuracyTooltip(null)} />}
    </section>
  );
}

function DamageBreakdown({
  damageBreakdown,
  getTrackName,
  getTrackColor,
  mobile = false,
}: {
  damageBreakdown: ReturnType<typeof calculateDamage>;
  getTrackName: (trackId: TrackId) => string;
  getTrackColor: (trackId: TrackId) => string;
  mobile?: boolean;
}) {
  return (
    <div className={mobile
      ? 'flex w-full max-w-full items-center justify-center gap-3 overflow-x-auto whitespace-nowrap px-2 text-[10px] font-black leading-tight tabular-nums sm:hidden'
      : 'hidden w-fit shrink-0 flex-col text-left text-[10px] font-black leading-tight tabular-nums sm:flex sm:text-xs'}
    >
      <span className="text-white">Base {damageBreakdown.base}</span>
      <span style={{ color: '#31be35' }}>Knockback {damageBreakdown.knockback}</span>
      {damageBreakdown.remote > 0 && <span className="text-orange-300">Remote {damageBreakdown.remote}</span>}
      {damageBreakdown.bonuses.map((bonus) => (
        <span key={bonus.trackId} style={{ color: getTrackColor(bonus.trackId) }}>
          {getTrackName(bonus.trackId)} Bonus {bonus.amount}
        </span>
      ))}
      {damageBreakdown.bonuses.length === 0 && <span className="text-white/35">Bonus 0</span>}
    </div>
  );
}

function GagCalculatorContent() {
  const mobileAccuracy = useMobileAccuracy();
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
  const [toonsHit, setToonsHit] = useState(false);
  const [defense, setDefense] = useState<FieldOfficeDefense>(0);
  const [oil, setOil] = useState<CeoOilCans>(NO_OIL_CANS);
  const [remoteDamageStars, setRemoteDamageStars] = useState<RemoteStars[]>([]);
  const [remoteSelfDamageStars, setRemoteSelfDamageStars] = useState<RemoteStars | null>(null);
  const [mobileOrganicMode, setMobileOrganicMode] = useState(false);
  const [accuracyTooltipPosition, setAccuracyTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const hasSelectedGags = selectedGags.some(Boolean);
  const hasActiveOptions = preLured || toonsHit || defense > 0 || oil.cans > 0
    || remoteDamageStars.length > 0 || remoteSelfDamageStars !== null;
  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_GAGS_KEY, JSON.stringify(selectedGags));
    } catch {
      // Ignore storage restrictions; the calculator still works for this session.
    }
  }, [selectedGags]);
  const damageBreakdown = useMemo(
    () => calculateDamage(selectedGags, preLured, getRemoteDamage(remoteDamageStars, remoteSelfDamageStars), defense),
    [selectedGags, preLured, remoteDamageStars, remoteSelfDamageStars, defense],
  );
  const accuracyBreakdown = useMemo(
    () => calculateAccuracy(selectedGags, preLured, getHighestDefeatedCogLevel(damageBreakdown.total, oil) || 1, toonsHit,
      { targetRemoted: remoteSelfDamageStars !== null, damage: damageBreakdown.remote }),
    [selectedGags, preLured, damageBreakdown.total, damageBreakdown.remote, toonsHit, remoteSelfDamageStars, oil],
  );
  const getTrackName = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.name ?? trackId;
  const getTrackColor = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.color ?? 'white';
  const isSosSelected = (trackId: TrackId | 'toonsHit', gagIndex: number) => selectedGags.some(
    (entry) => entry?.variant === 'sos' && entry.trackId === trackId && entry.gagIndex === gagIndex,
  );
  const showAccuracyTooltip = (element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    setAccuracyTooltipPosition({
      left: Math.min(window.innerWidth - 110, Math.max(110, bounds.left + bounds.width / 2)),
      top: bounds.bottom + 8,
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
    <div className="gag-calculator flex min-w-0 w-full flex-col items-center justify-start gap-2">
      <CogCarousel damage={damageBreakdown.total} selectedGags={selectedGags} preLured={preLured} toonsHit={toonsHit}
        remotes={{ targetRemoted: remoteSelfDamageStars !== null, damage: damageBreakdown.remote }} oil={oil} />

      <div role="group" aria-label="Starting effects" className="flex flex-wrap shrink-0 items-center justify-center gap-1.5">
        <StartingEffectToggle effect="lure" active={preLured} onToggle={() => setPreLured(value => !value)} />
        <StartingEffectToggle effect="accuracy" active={toonsHit} onToggle={() => setToonsHit(value => !value)} />
        <MoreEffectsMenu activeCount={Number(defense > 0) + Number(remoteDamageStars.length > 0 || remoteSelfDamageStars !== null) + Number(oil.cans > 0)}>
        <DefenseSelector defense={defense} onChange={setDefense} />
        <RemoteSelector damageStars={remoteDamageStars} selfDamageStars={remoteSelfDamageStars}
          onDamageChange={(stars, change) => setRemoteDamageStars(current => changeRemoteDamageStars(current, stars, change))}
          onSelfDamageChange={stars => setRemoteSelfDamageStars(current => current === stars ? null : stars)} />
        <OilCanSelector oil={oil} onChange={setOil} />
        </MoreEffectsMenu>
      </div>

      <SelectedRemotes damageStars={remoteDamageStars} selfDamageStars={remoteSelfDamageStars}
        onRemoveDamage={stars => setRemoteDamageStars(current => changeRemoteDamageStars(current, stars, -1))}
        onRemoveSelf={() => setRemoteSelfDamageStars(null)} />

      <div className="custom-scrollbar flex w-fit max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-white/5 bg-black/40 px-3 py-2 sm:px-4">
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
                      {gag.variant === 'sos' ? <SosCardImage src={gag.image} alt={gag.name} /> : <img src={gag.image} alt={gag.name} className="h-7 w-7 object-contain drop-shadow-md sm:h-12 sm:w-8" />}
                      {gag.variant === 'sos' && gag.stars && (
                        <SosStars count={gag.stars} />
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
                      src={staticUrl('/external/static/assets/gags/ttr/organic.webp')}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_1px_2px_#000]"
                    />
                  </button>
                )}
              </div>
              <span className="h-3 text-xs font-black tabular-nums text-white">
                {gag?.trackId === 'toonsHit' ? '+75%' : gag ? `${gag.trackId === 'lure' && gag.variant === 'sos' ? 100 : getDamageAfterDefense(gag, defense)}${gag.trackId === 'lure' ? '%' : ''}` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 text-center sm:gap-3">
          <div>
            <div className="text-xl font-black leading-none tabular-nums text-lime-300 sm:text-2xl">{damageBreakdown.total}</div>
            <div className="mt-1 text-[10px] font-black uppercase text-white/35">damage</div>
          </div>
          <div
            className="relative cursor-help rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-sky-300/10 focus-visible:bg-sky-300/10 focus-visible:ring-1 focus-visible:ring-sky-300/50"
            tabIndex={0}
            aria-describedby="gag-accuracy-tooltip"
            aria-label="Show accuracy calculation breakdown"
            role="button"
            aria-haspopup={mobileAccuracy ? 'dialog' : undefined}
            onClick={event => { if (mobileAccuracy) showAccuracyTooltip(event.currentTarget); }}
            onKeyDown={event => { if (mobileAccuracy && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showAccuracyTooltip(event.currentTarget); } }}
            onMouseEnter={(event) => { if (!mobileAccuracy) showAccuracyTooltip(event.currentTarget); }}
            onMouseLeave={() => { if (!mobileAccuracy) setAccuracyTooltipPosition(null); }}
            onFocus={(event) => { if (!mobileAccuracy) showAccuracyTooltip(event.currentTarget); }}
            onBlur={() => { if (!mobileAccuracy) setAccuracyTooltipPosition(null); }}
          >
            <div className="text-xl font-black leading-none tabular-nums text-sky-300 underline decoration-dotted decoration-sky-300/60 underline-offset-2 sm:text-2xl">
              {formatAccuracy(accuracyBreakdown.total)}%
            </div>
            <div className="mt-1 text-[10px] font-black uppercase text-white/35">accuracy</div>
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
            setPreLured(false);
            setToonsHit(false);
            setDefense(0);
            setOil(NO_OIL_CANS);
            setRemoteDamageStars([]);
            setRemoteSelfDamageStars(null);
          }}
          className="trash-button relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center sm:h-12 sm:w-12"
          data-trash-has-gags={hasSelectedGags || hasActiveOptions}
          title="Clear gags and options"
          aria-label="Clear gags and options"
        >
          <img src={staticUrl('/images/trashcan_closed.png')} alt="" className="trash-can-image trash-can-closed" />
          <img src={staticUrl('/images/trashcan_rlvr.png')} alt="" className="trash-can-image trash-can-rlvr" />
        </button>
      </div>

      <DamageBreakdown
        damageBreakdown={damageBreakdown}
        getTrackName={getTrackName}
        getTrackColor={getTrackColor}
        mobile
      />

      <div className="gag-desktop-picker hidden w-fit max-w-full overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-2 custom-scrollbar sm:block">
        <div className="min-w-max">
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

      <div className="custom-scrollbar min-h-0 w-fit max-w-full flex-1 overflow-auto rounded-xl border border-white/5 bg-black/40 p-2 sm:hidden">
        <div className="flex min-w-0 flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() => setMobileOrganicMode((value) => !value)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-[10px] font-black uppercase tracking-wide transition ${mobileOrganicMode
              ? 'border-emerald-300/70 bg-emerald-500/20 text-emerald-200'
              : 'border-white/10 bg-black/20 text-white/55'
              }`}
            aria-pressed={mobileOrganicMode}
            title="Toggle organic gags"
          >
            <img
              src={staticUrl('/external/static/assets/gags/ttr/organic.webp')}
              alt=""
              className="h-6 w-6 object-contain drop-shadow-[0_1px_2px_#000]"
            />
            Organic
          </button>
          {tracks.map((track) => (
            <div key={track.id} className="flex items-center border-b border-white/[0.07] py-0.5">
              <div className="flex gap-0.5">
                {track.gags.map((gag, gagIndex) => (
                  <GagChoice
                    key={gag.name}
                    gag={gag}
                    track={track}
                    gagIndex={gagIndex}
                    onSelect={selectGag}
                    organicMode={mobileOrganicMode}
                    tooltipBelow={track.id === TRACK_IDS[0]}
                    tooltipAlign={gagIndex <= 1 ? 'left' : gagIndex >= 5 ? 'right' : 'center'}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-1 pt-1">
            {tracks.map((track) => {
              const sosGags = getSosGags(track.id);
              if (sosGags.length === 0) return null;
              return (
                <div key={track.id} className="grid grid-cols-3 gap-0.5">
                  {sosGags.map((gag, gagIndex) => (
                    <SosChoice
                      key={`${track.id}-${gag.name}-${gag.stars}`}
                      gag={gag}
                      track={track}
                      gagIndex={gagIndex + 3}
                      onSelect={selectGag}
                      disabled={isSosSelected(track.id, gagIndex + 3)}
                      tooltipBelow={false}
                      tooltipAlign={gagIndex === 0 ? 'left' : 'right'}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {accuracyTooltipPosition && <AccuracyBreakdownTooltip id="gag-accuracy-tooltip" breakdown={accuracyBreakdown} position={accuracyTooltipPosition} onClose={() => setAccuracyTooltipPosition(null)} />}
    </div>
  );
}

export function GagCalculator() {
  return <CalculatorPortalProvider>
    <div data-calculator-layout className="gag-calculator-page h-full w-full">
      <div className="gag-calculator-columns flex h-full items-start gap-4">
      <aside className="gag-combos-sidebar min-h-0 w-[380px] shrink-0 self-stretch"><GagCombosPanel /></aside>
      <section className="min-w-0 flex-1 rounded-xl border border-white/5 bg-[#082416] p-3 shadow-inner">
        <GagCalculatorContent />
      </section>
      </div>
    </div>
  </CalculatorPortalProvider>;
}
