import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { SOS_GAGS } from './CogCalculator';
import { GagCombosPanel } from './GagCombosPanel';
import { COG_HEALTH } from './gagCombos';
import { gags as gagsConfig } from './gags';

const TRACK_IDS = ['trap', 'sound', 'throw', 'squirt', 'drop'] as const;
type TrackId = (typeof TRACK_IDS)[number];
type Variant = 'base' | 'organic' | 'sos';

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

const GAG_ASSET_ROOT = 'https://toonhq.org/static/assets/gags/';
const SKELECOG_IMAGE = 'https://toonhq.org/static/assets/cogs/skelecog.png';
const TRASH_CLOSED_IMAGE = browser.runtime.getURL('/images/trashcan_closed.png');
const TRASH_HOVER_IMAGE = browser.runtime.getURL('/images/trashcan_rlvr.png');
const tracks = (gagsConfig as Track[]).filter((track) => TRACK_IDS.includes(track.id));
const SAVED_GAGS_KEY = 'toonhqplus:gag-calculator:selected-gags';

function gagImage(path: string) {
  return `${GAG_ASSET_ROOT}${path}`;
}

function getSosGags(trackId: TrackId): SosGag[] {
  if (trackId === 'throw' || trackId === 'squirt') return [];
  return (SOS_GAGS[trackId] || [])
    .filter((gag) => [3, 4, 5].includes(gag.gagIndex))
    .map((gag) => ({
      name: gag.name,
      damage: gag.damage,
      image: gag.image,
      stars: gag.gagIndex,
    }));
}

function comboBonus(damage: number, count: number) {
  return count >= 2 ? Math.ceil(damage * 0.2) : 0;
}

function calculateDamage(gags: Array<SelectedGag | null>, preLured: boolean) {
  let base = 0;
  let knockback = 0;
  const bonuses: Array<{ trackId: TrackId; amount: number }> = [];
  let lured = preLured;

  for (const trackId of TRACK_IDS) {
    const trackGags = gags.filter((gag): gag is SelectedGag => gag?.trackId === trackId);
    if (!trackGags.length) continue;

    if (trackId === 'trap') {
      if (trackGags.length === 1) base += trackGags[0].damage;
      lured = false;
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

function GagChoice({
  gag,
  track,
  gagIndex,
  onSelect,
  tooltipBelow = false,
}: {
  gag: Track['gags'][number];
  track: Track;
  gagIndex: number;
  onSelect: (gag: SelectedGag) => void;
  tooltipBelow?: boolean;
}) {
  const select = (variant: Variant) => {
    onSelect({
      trackId: track.id,
      gagIndex,
      variant,
      name: gag.name,
      image: gagImage(gag.image),
      color: track.color,
      damage: variant === 'organic' ? (gag.organic ?? gag.base) : gag.base,
    });
  };

  return (
    <div className="group/gag relative">
      <div className="group/main-gag relative">
        <button
          type="button"
          onClick={() => select('base')}
          className="gag-btn-base gag-btn-active"
          style={{ backgroundColor: track.color, borderColor: 'transparent' }}
          aria-label={`${gag.name} (${gag.base} damage)`}
        >
          <img
            src={gagImage(gag.image)}
            alt={gag.name}
            className="object-contain drop-shadow-md transition-transform group-hover/gag:scale-105"
            draggable="false"
          />
        </button>
        <div className={`pointer-events-none absolute left-1/2 z-30 hidden w-max max-w-40 -translate-x-1/2 rounded-md border border-white/15 bg-[#020712] px-2 py-1.5 text-center shadow-xl group-hover/main-gag:block ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
          <div className="text-[10px] font-black leading-tight text-white">{gag.name}</div>
          <div className="mt-0.5 text-[9px] font-bold text-lime-300">{gag.base} damage</div>
        </div>
      </div>
      <div className="group/organic absolute -right-2 -top-2 z-10 h-6 w-6">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            select('organic');
          }}
          className="flex h-6 w-6 cursor-pointer items-center justify-center opacity-0 grayscale transition-all hover:scale-125 hover:grayscale-0 group-hover/gag:opacity-100 group-hover/organic:opacity-100 focus:opacity-100 focus:grayscale-0"
          aria-label={`Select organic ${gag.name}`}
        >
          <img
            src={gagImage('ttr/organic.webp')}
            alt=""
            className="h-full w-full object-contain drop-shadow-[0_1px_2px_#000]"
          />
        </button>
        <div className={`pointer-events-none absolute left-1/2 z-30 hidden w-max max-w-40 -translate-x-1/2 rounded-md border border-white/15 bg-[#020712] px-2 py-1.5 text-center shadow-xl group-hover/organic:block ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
          <div className="text-[10px] font-black leading-tight text-white">Organic {gag.name}</div>
          <div className="mt-0.5 text-[9px] font-bold text-lime-300">{gag.organic ?? gag.base} damage</div>
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
}: {
  gag: SosGag;
  track: Track;
  gagIndex: number;
  onSelect: (gag: SelectedGag) => void;
  disabled?: boolean;
  tooltipBelow?: boolean;
}) {
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
        aria-label={`${gag.name} (${gag.damage} damage)`}
      >
        <img src={gag.image} alt={gag.name} className="object-contain drop-shadow-md" />
        <span className="absolute inset-x-0 -top-1 text-center text-[7px] tracking-[-1px] text-yellow-300 drop-shadow-[0_1px_1px_#000]">
          {'★'.repeat(gag.stars)}
        </span>
      </button>
      <div className={`pointer-events-none absolute left-1/2 z-30 hidden w-max max-w-40 -translate-x-1/2 rounded-md border border-white/15 bg-[#020712] px-2 py-1.5 text-center shadow-xl group-hover/main-gag:block ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
        <div className="text-[10px] font-black leading-tight text-white">{gag.name}</div>
        <div className="mt-0.5 text-[9px] font-bold text-lime-300">{gag.damage} damage</div>
      </div>
    </div>
  );
}

function CogCarousel({ damage }: { damage: number }) {
  const highestDefeated = Math.max(
    0,
    ...Object.entries(COG_HEALTH)
      .filter(([, hp]) => damage >= hp)
      .map(([level]) => Number(level)),
  );
  const focusLevel = highestDefeated || 1;
  const viewportRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const [trackOffset, setTrackOffset] = useState(0);
  const [hasPositioned, setHasPositioned] = useState(false);
  const levels = Array.from({ length: 24 }, (_, index) => index - 1);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const focus = focusRef.current;
    if (!viewport || !focus) return;

    const centerSelectedCog = () => {
      const focusCenter = focus.offsetLeft + focus.offsetWidth / 2;
      setTrackOffset(viewport.clientWidth / 2 - focusCenter);
      setHasPositioned(true);
    };

    centerSelectedCog();
    const resizeObserver = new ResizeObserver(centerSelectedCog);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [focusLevel]);

  return (
    <div ref={viewportRef} className="gag-cog-viewport">
      <div
        className={`gag-cog-track flex w-max items-center gap-1 ${hasPositioned ? 'gag-cog-track-positioned' : ''}`}
        style={{ transform: `translateX(${trackOffset}px)` }}
      >
        {levels.map((level, index) => {
          if (level < 1 || level > 20) {
            return <div key={`empty-${index}`} className="invisible w-32 shrink-0" aria-hidden="true" />;
          }
          const hp = COG_HEALTH[level];
          const defeated = damage >= hp;
          const isFocus = level === focusLevel;
          const distance = Math.abs(level - focusLevel);
          const difference = Math.abs(damage - hp);
          const cardScale = isFocus ? 1 : distance === 1 ? 0.9 : distance === 2 ? 0.78 : distance === 3 ? 0.66 : 0.56;
          return (
            <div
              key={level}
              ref={isFocus ? focusRef : undefined}
              className={`relative flex w-36 flex-col items-center rounded-lg border px-1 py-4 text-center transition-all duration-300 ${isFocus
                ? defeated
                  ? 'z-[2] border-red-300/70 bg-red-950/80'
                  : 'z-[2] border-lime-300/70 bg-green-950/80'
                : defeated
                  ? 'border-red-400/25 bg-red-950/65'
                  : 'border-green-400/25 bg-green-950/65'
                }`}
              style={{
                transform: `scale(${cardScale})`,
                opacity: isFocus ? 1 : distance === 1 ? 0.72 : distance === 2 ? 0.52 : distance === 3 ? 0.38 : 0.28,
              }}
            >
              <img
                src={SKELECOG_IMAGE}
                alt=""
                className={`h-24 w-24 object-contain transition-opacity duration-300 ${defeated ? 'opacity-40' : 'opacity-100'}`}
              />
              <div className="text-3xl font-black leading-tight text-white">Level {level}</div>
              <div className="text-2xl font-black tabular-nums text-white">{hp} HP</div>
              <div className={`text-sm font-black tabular-nums ${defeated ? 'text-red-300' : 'text-amber-300'}`}>
                {defeated ? `+${difference} extra` : `${difference} needed`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
  const hasSelectedGags = selectedGags.some(Boolean);

  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_GAGS_KEY, JSON.stringify(selectedGags));
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }, [selectedGags]);

  const damageBreakdown = useMemo(
    () => calculateDamage(selectedGags, preLured),
    [selectedGags, preLured],
  );
  const getTrackName = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.name ?? trackId;
  const getTrackColor = (trackId: TrackId) => tracks.find((track) => track.id === trackId)?.color ?? 'white';
  const isSosSelected = (trackId: TrackId, gagIndex: number) => selectedGags.some(
    (entry) => entry?.variant === 'sos' && entry.trackId === trackId && entry.gagIndex === gagIndex,
  );

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
    <div className=" flex min-h-full w-full items-start justify-start gap-4">
      <aside className="order-1 min-w-[380px] w-[380px] shrink-0">
        <GagCombosPanel />
      </aside>
      <section className="order-2 flex flex-1 w-[720px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#082416] p-3 shadow-inner">
        <CogCarousel damage={damageBreakdown.total} />

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
            <img src={gagImage('ttr/1_bill.png')} alt="" className="h-9 w-11 object-contain" />
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
                    <span className="pointer-events-none absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center">
                      <img
                        src={gagImage('ttr/organic.webp')}
                        alt=""
                        className="h-full w-full object-contain drop-shadow-[0_1px_2px_#000]"
                      />
                    </span>
                  )}
                </div>
                <span className="h-3 text-xs font-black tabular-nums text-white">
                  {gag?.damage ?? ''}
                </span>
              </div>
            ))}
          </div>

          <div className="w-20 shrink-0 text-center">
            <div className="text-3xl font-black tabular-nums text-lime-300">{damageBreakdown.total}</div>
            <div className="text-[10px] font-black uppercase text-white/35">damage</div>
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
            <img src={TRASH_CLOSED_IMAGE} alt="" className="trash-can-image trash-can-closed" />
            <img src={TRASH_HOVER_IMAGE} alt="" className="trash-can-image trash-can-rlvr" />
          </button>
        </div>

        <div className="custom-scrollbar w-fit max-w-full overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-2">
          <div className="min-w-[650px]">
            {tracks.map((track) => (
              <div key={track.id} className="flex items-center border-b border-white/[0.07] py-1 last:border-b-0">
                <div className="flex gap-0.5">
                  {track.gags.map((gag, gagIndex) => (
                    <GagChoice key={gag.name} gag={gag} track={track} gagIndex={gagIndex} onSelect={selectGag} tooltipBelow={track.id === TRACK_IDS[0]} />
                  ))}
                  {getSosGags(track.id).length > 0 && (
                    <div className="ml-1 flex gap-0.5 border-l border-white/15 pl-1">
                      {getSosGags(track.id).map((gag, gagIndex) => (
                        <SosChoice
                          key={`${gag.name}-${gag.stars}`}
                          gag={gag}
                          track={track}
                          gagIndex={gagIndex + 3}
                          onSelect={selectGag}
                          disabled={isSosSelected(track.id, gagIndex + 3)}
                          tooltipBelow={track.id === TRACK_IDS[0]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
