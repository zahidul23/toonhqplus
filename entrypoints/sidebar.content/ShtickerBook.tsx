import React, { useEffect, useMemo, useState } from 'react';
import { gags as gagsConfig } from './gags';

// ─── Types ────────────────────────────────────────────────────────────────────

type InfoBookTab = 'facilities' | 'field_office' | 'boiler_calc';

type AllowedGagTrackId = 'throw' | 'squirt' | 'sound';
type BoilerRoundType = 'neutral' | 'fired_up' | 'defense' | 'meltdown';
type GagVariant = 'base' | 'organic' | 'sos';
type SelectedGagCell = { trackId: AllowedGagTrackId; gagIndex: number; variant: GagVariant } | null;

type FacilitySubtype = {
  name: string;
  rewardText: string;
  bossHealth: number;
};

type FacilityInfo = {
  title: string;
  rewardLabel: string;
  image: string;
  bossImage: string;
  cardBg: string;
  cardBorder: string;
  bossName: string;
  subtypes: FacilitySubtype[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BOILER_CALC_ROUNDS = 17;
const BOILER_CALC_GAGS_PER_ROUND = 4;

const SOS_MOE = 'https://rendition.toontownrewritten.com/render/7401000001000000008b010e000e0e010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_SID = 'https://rendition.toontownrewritten.com/render/7401010101000b000b8b0101000101010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_BARB = 'https://rendition.toontownrewritten.com/render/7407020201011a011a0a1d17001717010400000000000000000000000000000000/portrait/128x128.webp';

const allowedGagTrackIds: AllowedGagTrackId[] = ['throw', 'squirt', 'sound'];
const SOS_SOUND_GAGS: Array<{ gagIndex: number; damage: number; image: string; name: string }> = [
  { gagIndex: 3, damage: 35, image: SOS_BARB, name: "Barbara Seville" },
  { gagIndex: 4, damage: 55, image: SOS_SID, name: "Sid Sonata" },
  { gagIndex: 5, damage: 75, image: SOS_MOE, name: "Moe Zart" },
];

const FACILITIES_INFO: FacilityInfo[] = [
  {
    title: 'Sellbot Factory',
    rewardLabel: 'Merits',
    bossName: 'Factory Foreman',
    image: 'https://toonhq.org/static/assets/groups/large/factory.jpg',
    bossImage: '/images/foreman.webp',
    cardBg: '#7b00ae',
    cardBorder: '#9d4edd',
    subtypes: [
      { name: 'Scrap Factory', rewardText: '350-638', bossHealth: 250 },
      { name: 'Steel Factory', rewardText: '867-1630', bossHealth: 750 },
    ],
  },
  {
    title: 'Cashbot Mint',
    rewardLabel: 'Cogbucks',
    bossName: 'Mint Auditor',
    image: 'https://toonhq.org/static/assets/groups/large/mint.jpg',
    bossImage: '/images/auditor.webp',
    cardBg: '#108000',
    cardBorder: '#22c55e',
    subtypes: [
      { name: 'Coin Mint', rewardText: '702-807', bossHealth: 750 },
      { name: 'Bullion Mint', rewardText: '1626-1850', bossHealth: 1150 },
    ],
  },
  {
    title: 'Lawbot DA Office',
    rewardLabel: 'Jury Notices',
    bossName: 'Office Clerk',
    image: 'https://toonhq.org/static/assets/groups/large/da.jpg',
    bossImage: '/images/clerk.webp',
    cardBg: '#2e5db1',
    cardBorder: '#60a5fa',
    subtypes: [
      { name: 'Junior Wing', rewardText: '781-889', bossHealth: 1100 },
      { name: 'Senior Wing', rewardText: '1854-2082', bossHealth: 1500 },
    ],
  },
  {
    title: 'Bossbot Golf Course',
    rewardLabel: 'Stock Options',
    bossName: 'Club President',
    image: 'https://toonhq.org/static/assets/groups/large/golf.jpg',
    bossImage: '/images/president.webp',
    cardBg: '#8c5d3d',
    cardBorder: '#ca8a04',
    subtypes: [
      { name: 'The First Fairway', rewardText: '882-975', bossHealth: 1200 },
      { name: 'The Final Fringe', rewardText: '2097-2305', bossHealth: 1750 },
    ],
  },
];

const FIELD_OFFICE_INFO = {
  boilerHpByStar: [
    { stars: '1-star', hp: '4000' },
    { stars: '2-star', hp: '4500' },
    { stars: '3-star', hp: '5000' },
    { stars: '4-star', hp: '5500' },
  ],
  keyAttacks: [
    { name: 'Under Pressure', summary: '25 / 30 / 35 / 40 base damage by stars.' },
    { name: 'Heated Discussion', summary: '20 / 24 / 28 / 32 base damage by stars.' },
    { name: 'Slow Burn', summary: 'DoT attack that scales with star level.' },
    { name: 'Stamp of Disapproval', summary: 'Heavy hit: 50 / 70 / 80 / 90 damage.' },
  ],
  keySpecialMoves: [
    { name: 'Promoted', summary: 'Cogs gain +1 / +2 / +2 / +3 levels.' },
    { name: 'Pay Raise', summary: 'Cogs gain +60 / +80 / +100 / +125 health.' },
    { name: 'Market Research', summary: 'Defense and accuracy buffs increase with stars.' },
    { name: 'Retention Plan', summary: 'Removes Lure from lured Cogs.' },
    { name: 'Quality Control', summary: 'Gag Ordinance lockout lasts 1 to 4 rounds.' },
  ],
} as const;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getBoilerRoundType(roundIndex: number, stars: number): BoilerRoundType {
  if (stars < 4) {
    if (roundIndex < 2) return 'neutral';
    const pos = (roundIndex - 2) % 6;
    return pos < 3 ? 'fired_up' : 'defense';
  } else {
    const pos = roundIndex % 6;
    return pos < 3 ? 'fired_up' : 'defense';
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getHealthSegment(remaining: number, max: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (max <= 0) return 'red';
  if (remaining > max * 0.85) return 'green';
  if (remaining > max * 0.65) return 'yellow';
  if (remaining > max * 0.3) return 'orange';
  return 'red';
}

function getExtensionImageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  if (typeof browser !== 'undefined' && (browser.runtime as any)) {
    return (browser.runtime as any).getURL(cleanPath);
  }
  return `/${cleanPath}`;
}

// ─── Shared primitive components ──────────────────────────────────────────────

function MultiLayerBoilerHealthBar({ remaining, max }: { remaining: number; max: number }) {
  const safeMax = Math.max(0, max);
  const safeRemaining = clampNumber(remaining, 0, safeMax);

  const greenMax = safeMax * 0.15;
  const yellowMax = safeMax * 0.2;
  const orangeMax = safeMax * 0.35;
  const redMax = safeMax * 0.3;

  const greenLower = safeMax * 0.85;
  const yellowLower = safeMax * 0.65;
  const orangeLower = safeMax * 0.3;

  const segment = getHealthSegment(safeRemaining, safeMax);

  const greenWidth = segment === 'green' ? clampNumber((safeRemaining - greenLower) / (greenMax || 1), 0, 1) : 0;
  const yellowWidth = segment === 'green' ? 1 : segment === 'yellow' ? clampNumber((safeRemaining - yellowLower) / (yellowMax || 1), 0, 1) : 0;
  const orangeWidth =
    segment === 'green' || segment === 'yellow'
      ? 1
      : segment === 'orange'
        ? clampNumber((safeRemaining - orangeLower) / (orangeMax || 1), 0, 1)
        : 0;
  const redWidth =
    segment === 'green' || segment === 'yellow' || segment === 'orange'
      ? 1
      : clampNumber(safeRemaining / (redMax || 1), 0, 1);

  return (
    <div className="relative h-6 w-full overflow-hidden rounded-md bg-black/40 border border-white/10">
      <div className="absolute inset-y-0 left-0 bg-red-500 transition-all duration-200" style={{ width: `${redWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-orange-500 transition-all duration-200" style={{ width: `${orangeWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-yellow-400 transition-all duration-200" style={{ width: `${yellowWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-200" style={{ width: `${greenWidth * 100}%` }} />
    </div>
  );
}

function DamageBadge({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white/90 ${className}`}>
      {value}
    </span>
  );
}

function MinusDamageBubble({ value }: { value: number }) {
  return <></>;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function FireIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 22c4.4 0 8-3.4 8-7.8 0-3.1-1.9-5.8-4.8-7.2.3 2.2-.7 3.6-2.1 4.4.3-2.5-.9-5.3-3.6-7.4C9.4 5.1 7 7.8 7 11c0 1.7.7 3.2 1.8 4.3C7.6 15.7 6 14.9 5 13.7 4.4 14.9 4 16.2 4 17.5 4 20.1 7.6 22 12 22Z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 22s8-4 8-10V6l-8-4-8 4v6c0 6 8 10 8 10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon({ width = 16, height = 16, className = '' }: { width?: number; height?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M9 7h7" />
      <path d="M9 11h7" />
    </svg>
  );
}

function StarIcon({ className = '' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.4 6.9H22l-5.9 4.3 2.3 6.8L12 15.9 5.6 20l2.3-6.8L2 8.9h7.6L12 2z" />
    </svg>
  );
}

function XIcon({ width = 10, height = 10 }: { width?: number; height?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// ─── Gag button ───────────────────────────────────────────────────────────────

type GagButtonProps = {
  imageSrc: string;
  imageAlt: string;
  color: string;
  title: string;
  damage: number;
  disabled?: boolean;
  onClick: () => void;
  overlayBottomRight?: React.ReactNode;
  overlayTopLeft?: React.ReactNode;
};

function GagButton({ imageSrc, imageAlt, color, title, damage, disabled = false, onClick, overlayBottomRight, overlayTopLeft }: GagButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gag-button group relative flex h-10 items-center justify-center rounded-md border transition-colors ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:brightness-110'
      }`}
      style={{ backgroundColor: color, borderColor: color }}
      title={title}
    >
      <img
        src={imageSrc}
        alt={imageAlt}
        draggable="false"
        className="h-8 w-8 rounded-sm object-contain drop-shadow-md transition-transform group-hover:scale-[1.03]"
      />
      {overlayTopLeft && <div className="absolute left-1 top-1">{overlayTopLeft}</div>}
      <div className="absolute right-1 top-1">
        <MinusDamageBubble value={damage} />
      </div>
      {overlayBottomRight && (
        <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
          {overlayBottomRight}
        </div>
      )}
    </button>
  );
}

// ─── Boiler Calculator subcomponents ──────────────────────────────────────────

type GagTrack = {
  id: AllowedGagTrackId;
  name: string;
  color: string;
  gags: Array<{ name: string; image: string; base: number; organic?: number }>;
};

function SosBadge() {
  return (
    <span className="inline-flex h-4 items-center rounded-md bg-yellow-400/15 px-1.5 py-0.5 text-yellow-200 border border-yellow-400/25">
      <StarIcon className="text-yellow-300" />
      <span className="ml-1">SOS</span>
    </span>
  );
}

function SosSoundPicker({
  track,
  activeCell,
  roundStats,
  isSosUsedInRound,
  onSelect,
}: {
  track: GagTrack;
  activeCell: { round: number; slot: number };
  roundStats: Array<{ roundType: BoilerRoundType }>;
  isSosUsedInRound: (round: number, gagIndex: number) => boolean;
  onSelect: (gagIndex: number) => void;
}) {
  return (
      <div className="flex justify-end gap-4 px-3 py-2">
        {SOS_SOUND_GAGS.map((sos) => {
          const gag = track.gags[sos.gagIndex];
          const roundType = roundStats[activeCell.round]?.roundType;
          const disabled = isSosUsedInRound(activeCell.round, sos.gagIndex);
          return (
            <GagButton
              key={`sos-${sos.gagIndex}`}
              imageSrc={sos.image}
              imageAlt={gag?.name || 'SOS'}
              color={track.color}
              title={`${sos.name} (${sos.damage})`}
              damage={sos.damage}
              disabled={disabled}
              onClick={() => onSelect(sos.gagIndex)}
              overlayBottomRight={
                <div className='flex'>
                  {[...Array(sos.gagIndex)].map((_, i) => (
                    <StarIcon key={i} className="w-2.5 h-2.5 text-yellow-300" />
                  ))}
                </div>
              }
            />
          );
        })}
      </div>
  );
}

function GagTrackPicker({
  track,
  activeCell,
  roundStats,
  isSosUsedInRound,
  onSelectGag,
}: {
  track: GagTrack;
  activeCell: { round: number; slot: number };
  roundStats: Array<{ roundType: BoilerRoundType }>;
  isSosUsedInRound: (round: number, gagIndex: number) => boolean;
  onSelectGag: (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-widest text-white/80">{track.name}</div>
      </div>

      {track.id === 'sound' && (
        <SosSoundPicker
          track={track}
          activeCell={activeCell}
          roundStats={roundStats}
          isSosUsedInRound={isSosUsedInRound}
          onSelect={(gagIndex) => onSelectGag('sound', gagIndex, 'sos')}
        />
      )}

      {/* Base gags row */}
      <div className="grid grid-cols-7 gap-1.5">
        {track.gags.map((gag, idx) => (
          <GagButton
            key={`${track.id}-${gag.name}`}
            imageSrc={`https://toonhq.org/static/assets/gags/${gag.image}`}
            imageAlt={gag.name}
            color={track.color}
            title={`${gag.name} (${gag.base})`}
            damage={gag.base}
            onClick={() => onSelectGag(track.id, idx, 'base')}
          />
        ))}
      </div>

      {/* Organic gags row */}
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {track.gags.map((gag, idx) => {
          const organicDamage = gag.organic ?? gag.base;
          return (
            <GagButton
              key={`${track.id}-${gag.name}-organic`}
              imageSrc={`https://toonhq.org/static/assets/gags/${gag.image}`}
              imageAlt={`${gag.name} organic`}
              color={track.color}
              title={`${gag.name} (Organic ${organicDamage})`}
              damage={organicDamage}
              onClick={() => onSelectGag(track.id, idx, 'organic')}
              overlayBottomRight={
                <img
                  src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                  alt="Organic"
                  draggable="false"
                  className="h-5 w-5 object-contain"
                />
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function GagPickerPanel({
  gagTracks,
  activeCell,
  roundStats,
  isSosUsedInRound,
  onSelectGag,
}: {
  gagTracks: GagTrack[];
  activeCell: { round: number; slot: number };
  roundStats: Array<{ roundType: BoilerRoundType }>;
  isSosUsedInRound: (round: number, gagIndex: number) => boolean;
  onSelectGag: (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => void;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-2 flex flex-col min-h-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-3">
        <h4 className="text-base font-bold text-white">Gags</h4>
        <div className="text-xs text-green-100/70 tabular-nums">
          Round {activeCell.round + 1} - Gag {activeCell.slot + 1}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
        {gagTracks.map((track) => (
          <GagTrackPicker
            key={track.id}
            track={track}
            activeCell={activeCell}
            roundStats={roundStats}
            isSosUsedInRound={isSosUsedInRound}
            onSelectGag={onSelectGag}
          />
        ))}
      </div>
    </section>
  );
}

type RoundStat = {
  roundType: BoilerRoundType;
  base: number;
  firedUpExtra: number;
  repeatExtra: number;
  total: number;
  rolling: number;
};

// A phase group is either a pair of { firedUp: number[]; defense: number[] }
// for the cyclic rounds, or a list of neutral round indices.
type PhaseGroup =
  | { kind: 'neutral'; rounds: number[] }
  | { kind: 'cycle'; firedUp: number[]; defense: number[] };

function RoundTypeIcon({ roundType }: { roundType: BoilerRoundType }) {
  if (roundType === 'fired_up') return <div className="text-red-200/90"><FireIcon className="h-4 w-4" /></div>;
  if (roundType === 'meltdown') return <div className="text-red-500 animate-pulse"><FireIcon className="h-5 w-5" /></div>;
  if (roundType === 'defense') return <div className="text-sky-200/90"><ShieldIcon className="h-4 w-4" /></div>;
  return <div className="h-4 w-4" />;
}

function RoundSlotButton({
  cell,
  slotIndex,
  roundIndex,
  gagTracks,
  activeCell,
  getCellDamage,
  onSetActiveCell,
  onClearSlot,
}: {
  cell: SelectedGagCell;
  slotIndex: number;
  roundIndex: number;
  gagTracks: GagTrack[];
  activeCell: { round: number; slot: number };
  getCellDamage: (cell: SelectedGagCell) => number;
  onSetActiveCell: (cell: { round: number; slot: number }) => void;
  onClearSlot: (round: number, slot: number) => void;
}) {
  const isActive = activeCell.round === roundIndex && activeCell.slot === slotIndex;
  const track = cell ? gagTracks.find((t) => t.id === cell.trackId) : null;
  const gag = cell && track ? track.gags[cell.gagIndex] : null;
  const cellDamage = cell ? getCellDamage(cell) : 0;

  const handleClick = () => {
    if (cell) {
      onClearSlot(roundIndex, slotIndex);
    } else {
      onSetActiveCell({ round: roundIndex, slot: slotIndex });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`gag-button group relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors cursor-pointer ${
        isActive ? 'border-emerald-400/70 bg-emerald-500/10' : cell ? 'hover:brightness-75' : 'border-white/10 bg-black/25 hover:bg-black/35'
      }`}
      style={cell && track ? { backgroundColor: track.color, borderColor: track.color } : undefined}
      title={gag ? `${gag.name} — click to remove` : 'Empty slot'}
    >
      {/* Fixed-size container so filled and empty slots are identical dimensions */}
      <div className="h-8 w-8 flex items-center justify-center">
        {gag ? (
          <img
            src={`https://toonhq.org/static/assets/gags/${gag.image}`}
            alt={gag.name}
            draggable="false"
            className="h-8 w-8 rounded-sm object-contain drop-shadow-md"
          />
        ) : (
          <span className="h-8 w-8 rounded-sm" />
        )}
      </div>
      {!!cellDamage && (
        <div className="absolute right-1 top-1">
          <MinusDamageBubble value={cellDamage} />
        </div>
      )}
      {cell?.variant === 'organic' && (
        <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
          <img src="https://toonhq.org/static/assets/gags/ttr/organic.webp" alt="Organic" draggable="false" className="h-5 w-5 object-contain" />
        </div>
      )}
      {cell?.variant === 'sos' && (
        <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] text-yellow-300">
          <StarIcon className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );
}

function RoundRow({
  roundIndex,
  round,
  stats,
  remainingHpAfter,
  rowDamage,
  activeCell,
  gagTracks,
  getCellDamage,
  onSetActiveCell,
  onClearSlot,
  rowRef,
}: {
  roundIndex: number;
  round: SelectedGagCell[];
  stats: RoundStat;
  remainingHpAfter: number;
  rowDamage: number;
  activeCell: { round: number; slot: number };
  gagTracks: GagTrack[];
  getCellDamage: (cell: SelectedGagCell) => number;
  onSetActiveCell: (cell: { round: number; slot: number }) => void;
  onClearSlot: (round: number, slot: number) => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const { roundType } = stats;
  const isActiveRound = activeCell.round === roundIndex;
  const isMeltdown = roundType === 'meltdown';

  return (
    <div
      className={`rounded-lg border border-white/10 bg-black/20 ${isActiveRound ? 'ring-2 ring-emerald-500/60' : ''} ${isMeltdown ? 'border-red-500/40 bg-red-900/30 shadow-[inset_0_0_8px_rgba(239,68,68,0.15)]' : ''}`}
      ref={rowRef}
    >
      <div className="flex items-center gap-2 p-2">
        {/* Round number + icon */}
        <div className="w-7 shrink-0 flex flex-col items-center justify-center gap-1">
          <div className="text-xs font-black text-white tabular-nums">{roundIndex + 1}</div>
          <RoundTypeIcon roundType={roundType} />
        </div>

        {/* Gag slots */}
        <div className="flex gap-1">
          {round.map((cell, slotIndex) => (
            <RoundSlotButton
              key={slotIndex}
              cell={cell}
              slotIndex={slotIndex}
              roundIndex={roundIndex}
              gagTracks={gagTracks}
              activeCell={activeCell}
              getCellDamage={getCellDamage}
              onSetActiveCell={onSetActiveCell}
              onClearSlot={onClearSlot}
            />
          ))}
        </div>

        {/* Remaining HP after this round */}
        <div className="ml-auto shrink-0 text-right">
          <div className="text-sm font-black tabular-nums text-red-300"> {rowDamage!= 0 && `-${rowDamage}`}</div>
        </div>
      </div>
    </div>
  );
}

function StarSelector({ stars, onSetStars }: { stars: number; onSetStars: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {([1, 2, 3, 4] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSetStars(n)}
          className={`rounded-md px-2 py-1 text-xs font-bold transition-colors cursor-pointer ${
            stars === n ? 'bg-emerald-600 text-white shadow-inner' : 'bg-black/25 text-green-100/80 hover:bg-black/40'
          }`}
          title={`${n}-star`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

type RoundRowsColumnProps = {
  rounds: number[];
  label: string;
  labelColor: string;
  borderColor: string;
  grid: SelectedGagCell[][];
  roundStats: RoundStat[];
  maxHp: number;
  activeCell: { round: number; slot: number };
  gagTracks: GagTrack[];
  getCellDamage: (cell: SelectedGagCell) => number;
  onSetActiveCell: (cell: { round: number; slot: number }) => void;
  onClearSlot: (round: number, slot: number) => void;
  roundRowRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
};

function RoundRowsColumn({
  rounds, label, labelColor, borderColor,
  grid, roundStats, maxHp, activeCell, gagTracks,
  getCellDamage, onSetActiveCell, onClearSlot, roundRowRefs,
}: RoundRowsColumnProps) {
  return (
    <div className={`flex-1 rounded-lg border ${borderColor} p-1.5 space-y-1.5`}>
      <div className={`text-[10px] font-black uppercase tracking-widest ${labelColor} px-1`}>{label}</div>
      {rounds.map((roundIndex) => (
        <RoundRow
          key={roundIndex}
          roundIndex={roundIndex}
          round={grid[roundIndex]}
          stats={roundStats[roundIndex]}
          remainingHpAfter={clampNumber(maxHp - (roundStats[roundIndex]?.rolling ?? 0), 0, maxHp)}
          rowDamage={roundStats[roundIndex].total ?? 0}
          activeCell={activeCell}
          gagTracks={gagTracks}
          getCellDamage={getCellDamage}
          onSetActiveCell={onSetActiveCell}
          onClearSlot={onClearSlot}
          rowRef={(el) => { roundRowRefs.current[roundIndex] = el; }}
        />
      ))}
    </div>
  );
}

function RoundPhaseGroup({
  group, grid, roundStats, maxHp, activeCell, gagTracks,
  getCellDamage, onSetActiveCell, onClearSlot, roundRowRefs,
}: {
  group: PhaseGroup;
  grid: SelectedGagCell[][];
  roundStats: RoundStat[];
  maxHp: number;
  activeCell: { round: number; slot: number };
  gagTracks: GagTrack[];
  getCellDamage: (cell: SelectedGagCell) => number;
  onSetActiveCell: (cell: { round: number; slot: number }) => void;
  onClearSlot: (round: number, slot: number) => void;
  roundRowRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
}) {
  if (group.kind === 'neutral') {
    return (
      <div className="space-y-1.5">
        {group.rounds.map((roundIndex) => (
          <RoundRow
            key={roundIndex}
            roundIndex={roundIndex}
            round={grid[roundIndex]}
            stats={roundStats[roundIndex]}
            remainingHpAfter={clampNumber(maxHp - (roundStats[roundIndex]?.rolling ?? 0), 0, maxHp)}
            rowDamage={roundStats[roundIndex].total ?? 0}
            activeCell={activeCell}
            gagTracks={gagTracks}
            getCellDamage={getCellDamage}
            onSetActiveCell={onSetActiveCell}
            onClearSlot={onClearSlot}
            rowRef={(el) => { roundRowRefs.current[roundIndex] = el; }}
          />
        ))}
      </div>
    );
  }

  // Check if this group is in meltdown (any fired_up round has meltdown type)
  const isMeltdown = group.firedUp.some((i) => roundStats[i]?.roundType === 'meltdown');

  return (
    <div className="flex gap-1.5">
      <RoundRowsColumn
        rounds={group.firedUp}
        label={isMeltdown ? 'Meltdown' : 'Fired Up'}
        labelColor={isMeltdown ? 'text-red-400' : 'text-red-300/80'}
        borderColor={isMeltdown ? 'border-red-500/40 bg-red-900/20' : 'border-red-500/20 bg-red-500/5'}
        grid={grid}
        roundStats={roundStats}
        maxHp={maxHp}
        activeCell={activeCell}
        gagTracks={gagTracks}
        getCellDamage={getCellDamage}
        onSetActiveCell={onSetActiveCell}
        onClearSlot={onClearSlot}
        roundRowRefs={roundRowRefs}
      />
      <RoundRowsColumn
        rounds={group.defense}
        label="Defense"
        labelColor="text-sky-300/80"
        borderColor="border-sky-500/20 bg-sky-500/5"
        grid={grid}
        roundStats={roundStats}
        maxHp={maxHp}
        activeCell={activeCell}
        gagTracks={gagTracks}
        getCellDamage={getCellDamage}
        onSetActiveCell={onSetActiveCell}
        onClearSlot={onClearSlot}
        roundRowRefs={roundRowRefs}
      />
    </div>
  );
}

function RoundsPanel({
  stars,
  phaseGroups,
  grid,
  roundStats,
  activeCell,
  gagTracks,
  remainingHp,
  maxHp,
  roundRowRefs,
  roundsScrollRef,
  getCellDamage,
  onSetStars,
  onSetActiveCell,
  onClearSlot,
}: {
  stars: number;
  phaseGroups: PhaseGroup[];
  grid: SelectedGagCell[][];
  roundStats: RoundStat[];
  activeCell: { round: number; slot: number };
  gagTracks: GagTrack[];
  remainingHp: number;
  maxHp: number;
  roundRowRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  roundsScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  getCellDamage: (cell: SelectedGagCell) => number;
  onSetStars: (n: 1 | 2 | 3 | 4) => void;
  onSetActiveCell: (cell: { round: number; slot: number }) => void;
  onClearSlot: (round: number, slot: number) => void;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-2 flex flex-col h-full">
      {/* Header: star selector + health bar */}
      <div className="mb-2 flex items-center gap-2">
        <StarSelector stars={stars} onSetStars={onSetStars} />
        <div className="relative flex-1">
          <MultiLayerBoilerHealthBar remaining={remainingHp} max={maxHp} />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
            {remainingHp} / {maxHp}
          </div>
        </div>
      </div>

      {/* Phase groups */}
      <div ref={roundsScrollRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
        {phaseGroups.map((group, idx) => (
          <RoundPhaseGroup
            key={idx}
            group={group}
            grid={grid}
            roundStats={roundStats}
            maxHp={maxHp}
            activeCell={activeCell}
            gagTracks={gagTracks}
            getCellDamage={getCellDamage}
            onSetActiveCell={onSetActiveCell}
            onClearSlot={onClearSlot}
            roundRowRefs={roundRowRefs}
          />
        ))}
      </div>
    </section>
  );
}

// ─── BoilerCalculator ─────────────────────────────────────────────────────────

function BoilerCalculator() {
  const [stars, setStars] = useState<1 | 2 | 3 | 4>(4);
  const [activeCell, setActiveCell] = useState<{ round: number; slot: number }>({ round: 0, slot: 0 });
  const [grid, setGrid] = useState<SelectedGagCell[][]>(() =>
    Array.from({ length: BOILER_CALC_ROUNDS }, () =>
      Array.from({ length: BOILER_CALC_GAGS_PER_ROUND }, () => null)
    )
  );
  const [lastAddedRound, setLastAddedRound] = useState<number | null>(null);
  const roundRowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const roundsScrollRef = React.useRef<HTMLDivElement | null>(null);

  const phaseGroups = useMemo((): PhaseGroup[] => {
    const groups: PhaseGroup[] = [];
    if (stars < 4) {
      // First two rounds are neutral
      groups.push({ kind: 'neutral', rounds: [0, 1] });
      // Then cyclic groups of 6: 3 fired_up + 3 defense
      for (let i = 2; i < BOILER_CALC_ROUNDS; i += 6) {
        const firedUp = [i, i + 1, i + 2].filter((r) => r < BOILER_CALC_ROUNDS);
        const defense = [i + 3, i + 4, i + 5].filter((r) => r < BOILER_CALC_ROUNDS);
        if (firedUp.length || defense.length) groups.push({ kind: 'cycle', firedUp, defense });
      }
    } else {
      // All rounds are cyclic from the start
      for (let i = 0; i < BOILER_CALC_ROUNDS; i += 6) {
        const firedUp = [i, i + 1, i + 2].filter((r) => r < BOILER_CALC_ROUNDS);
        const defense = [i + 3, i + 4, i + 5].filter((r) => r < BOILER_CALC_ROUNDS);
        if (firedUp.length || defense.length) groups.push({ kind: 'cycle', firedUp, defense });
      }
    }
    return groups;
  }, [stars]);

  const gagTracks = useMemo(() => {
    return (gagsConfig as any[]).filter((t) => allowedGagTrackIds.includes(t.id)) as GagTrack[];
  }, []);

  const getCellDamage = (cell: SelectedGagCell): number => {
    if (!cell) return 0;
    const track = gagTracks.find((t) => t.id === cell.trackId);
    const gag = track?.gags?.[cell.gagIndex];
    if (!gag) return 0;
    if (cell.variant === 'sos') {
      if (cell.trackId !== 'sound') return gag.base ?? 0;
      const sos = SOS_SOUND_GAGS.find((s) => s.gagIndex === cell.gagIndex);
      return sos?.damage ?? gag.base ?? 0;
    }
    if (cell.variant === 'organic') return gag.organic ?? gag.base ?? 0;
    return gag.base ?? 0;
  };

  const isSosUsedInRound = (roundIndex: number, gagIndex: number) => {
    return grid[roundIndex].some((cell) => cell?.variant === 'sos' && cell.trackId === 'sound' && cell.gagIndex === gagIndex);
  };

  const maxHp = useMemo(() => {
    const entry = FIELD_OFFICE_INFO.boilerHpByStar[stars - 1];
    return Number(String(entry.hp).replace(/,/g, '')) || 0;
  }, [stars]);

  const roundStats = useMemo(() => {
    let rolling = 0;
    const stats: RoundStat[] = [];
    const redThreshold = maxHp * 0.3;

    for (let i = 0; i < grid.length; i++) {
      const round = grid[i];
      let roundType = getBoilerRoundType(i, stars);

      if (i > 0 && maxHp - stats[i - 1].rolling <= redThreshold) {
        roundType = 'meltdown';
      }

      const counts: Record<AllowedGagTrackId, number> = { throw: 0, squirt: 0, sound: 0 };
      for (const cell of round) {
        if (cell) counts[cell.trackId]++;
      }

      let base = 0, firedUpExtra = 0, repeatExtra = 0, total = 0;

      for (const cell of round) {
        if (!cell) continue;
        const cellBase = getCellDamage(cell);
        if (!cellBase) continue;

        const usedMoreThanOnce = counts[cell.trackId] > 1;
        const isFiredUp = roundType === 'fired_up' || roundType === 'meltdown';
        const noRepeatMultiplier = isFiredUp ? 1.5 : 1;
        const totalMultiplier = isFiredUp && usedMoreThanOnce ? 1.7 : isFiredUp ? 1.5 : usedMoreThanOnce ? 1.2 : 1;
        const noRepeatTotal = Math.round(cellBase * noRepeatMultiplier);
        const cellTotal = Math.round(cellBase * totalMultiplier);

        base += cellBase;
        firedUpExtra += Math.max(0, noRepeatTotal - cellBase);
        repeatExtra += Math.max(0, cellTotal - noRepeatTotal);
        total += cellTotal;
      }

      rolling += total;
      stats.push({ roundType, base, firedUpExtra, repeatExtra, total, rolling });
    }
    return stats;
  }, [grid, stars, maxHp, gagTracks]);

  const totalDamage = roundStats[roundStats.length - 1]?.rolling ?? 0;
  const remainingHp = clampNumber(maxHp - totalDamage, 0, maxHp);

  const selectGag = (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => {
    if (variant === 'sos' && trackId === 'sound' && isSosUsedInRound(activeCell.round, gagIndex)) return;

    setLastAddedRound(activeCell.round);
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[activeCell.round][activeCell.slot] = { trackId, gagIndex, variant };
      return next;
    });
    setActiveCell((prev) => {
      const nextSlot = prev.slot + 1;
      if (nextSlot < BOILER_CALC_GAGS_PER_ROUND) return { round: prev.round, slot: nextSlot };
      let nextRound = prev.round + 1;
      if (roundStats[prev.round]?.roundType !== 'defense' && roundStats[prev.round]?.roundType !== 'meltdown') {
        while (nextRound < BOILER_CALC_ROUNDS && getBoilerRoundType(nextRound, stars) === 'defense') {
          nextRound++;
        }
      }
      if (nextRound < BOILER_CALC_ROUNDS) return { round: nextRound, slot: 0 };
      return prev;
    });
  };

  const clearSlot = (roundIndex: number, slotIndex: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[roundIndex][slotIndex] = null;
      return next;
    });
  };

  useEffect(() => {
    if (lastAddedRound == null) return;
    const el = roundRowRefs.current[lastAddedRound];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastAddedRound]);

  return (
    <div className="grid grid-cols-[40%_60%] gap-3 h-full">
      <GagPickerPanel
        gagTracks={gagTracks}
        activeCell={activeCell}
        roundStats={roundStats}
        isSosUsedInRound={isSosUsedInRound}
        onSelectGag={selectGag}
      />
      <RoundsPanel
        stars={stars}
        phaseGroups={phaseGroups}
        grid={grid}
        roundStats={roundStats}
        activeCell={activeCell}
        gagTracks={gagTracks}
        remainingHp={remainingHp}
        maxHp={maxHp}
        roundRowRefs={roundRowRefs}
        roundsScrollRef={roundsScrollRef}
        getCellDamage={getCellDamage}
        onSetStars={setStars}
        onSetActiveCell={setActiveCell}
        onClearSlot={clearSlot}
      />
    </div>
  );
}

// ─── Facilities tab subcomponents ─────────────────────────────────────────────

function FacilitySubtypeRow({ subtype, rewardLabel }: { subtype: FacilitySubtype; rewardLabel: string }) {
  return (
    <div className='flex gap-2'>
      <div className="flex flex-1 justify-between gap-2  px-2 py-1.5">
        <p className="text-sm font-semibold text-white">{subtype.name}</p>
        <p className="text-sm font-bold text-white/95">{subtype.rewardText} {rewardLabel}</p>
      </div>
      <div className="flex w-[160px] justify-center gap-2  px-2 py-1.5">
        <p className="text-sm font-medium text-white/85 text-center">{subtype.bossHealth} HP</p>
      </div>
    </div>
  );
}

function FacilityImages({
  facility,
  heightClass,
}: {
  facility: FacilityInfo;
  heightClass: string;
}) {
  return (
    <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
      <img src={facility.image} alt={facility.title} className={`${heightClass} w-full rounded-md border border-white/20 object-cover`} />
      <img src={getExtensionImageUrl(facility.bossImage)} alt={facility.bossName} className={`${heightClass} w-40 rounded-md border border-white/20 bg-black/30 object-cover`} />
    </div>
  );
}

function FacilityCard({ facility, idx, onOpen }: { facility: FacilityInfo; idx: number; onOpen: (idx: number) => void }) {
  return (
    <section
      className="rounded-xl border p-3 text-white"
      style={{
        background: `linear-gradient(180deg, ${facility.cardBg}ee 0%, ${facility.cardBg}c8 55%, #0f172abf 100%)`,
        borderColor: facility.cardBorder,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-right">{facility.title}</h4>
        <button
          type="button"
          onClick={() => onOpen(idx)}
          className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 transition-colors hover:bg-black/45 cursor-pointer"
        >
          Open Page
        </button>
      </div>
      <FacilityImages facility={facility} heightClass="h-40" />
      <div className="mt-2 space-y-1.5">
        {facility.subtypes.map((subtype) => (
          <FacilitySubtypeRow key={subtype.name} subtype={subtype} rewardLabel={facility.rewardLabel} />
        ))}
      </div>
    </section>
  );
}

function FacilityDetailPage({ facility }: { facility: FacilityInfo }) {
  return (
    <section
      className="rounded-xl border p-4 text-white justify-self-center"
      style={{
        background: `linear-gradient(180deg, ${facility.cardBg}ee 0%, ${facility.cardBg}c8 55%, #0f172abf 100%)`,
        borderColor: facility.cardBorder,
        width: '60%',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-lg font-bold">{facility.title}</h4>
      </div>
      <FacilityImages facility={facility} heightClass="h-48" />
      <div className="mt-2 space-y-1.5">
        {facility.subtypes.map((subtype) => (
          <FacilitySubtypeRow key={subtype.name} subtype={subtype} rewardLabel={facility.rewardLabel} />
        ))}
      </div>
    </section>
  );
}

function FacilitiesTabContent({
  activeFacility,
  setActiveFacility,
}: {
  activeFacility: number | null;
  setActiveFacility: (idx: number | null) => void;
}) {
  if (activeFacility !== null) {
    return <FacilityDetailPage facility={FACILITIES_INFO[activeFacility]} />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {FACILITIES_INFO.map((facility, idx) => (
        <FacilityCard key={facility.title} facility={facility} idx={idx} onOpen={setActiveFacility} />
      ))}
    </div>
  );
}

// ─── Field Office tab subcomponents ───────────────────────────────────────────

function BoilerHpTable() {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
      <h4 className="mb-2 text-base font-bold text-white">Boiler HP by Stars</h4>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {FIELD_OFFICE_INFO.boilerHpByStar.map((entry) => (
          <div key={entry.stars} className="rounded-lg border border-emerald-500/20 bg-[#10462d]/60 p-2 text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-green-100/80">{entry.stars}</div>
            <div className="text-xl font-black text-emerald-300 tabular-nums">{entry.hp}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MovesAtAGlance() {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
      <h4 className="mb-2 text-base font-bold text-white">Moves at a Glance</h4>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {[...FIELD_OFFICE_INFO.keyAttacks, ...FIELD_OFFICE_INFO.keySpecialMoves].map((move) => (
          <div key={move.name} className="rounded-md bg-black/25 px-2.5 py-2">
            <p className="text-sm font-semibold text-emerald-300">{move.name}</p>
            <p className="text-xs text-green-100/75">{move.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FieldOfficeTabContent() {
  return (
    <div className="space-y-3">
      <BoilerHpTable />
      <MovesAtAGlance />
    </div>
  );
}

// ─── ShtickerBook shell subcomponents ─────────────────────────────────────────

function OpenBookButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 z-[2147483646] pointer-events-auto">
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/30 bg-[#0c3622] text-white shadow-lg transition-all hover:bg-[#145837] hover:shadow-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 active:scale-95 cursor-pointer"
        aria-label="Open Shticker Book"
        title="Open Shticker Book"
      >
        <BookIcon className="text-emerald-300 group-hover:text-emerald-200" />
      </button>
    </div>
  );
}

function BookHeader() {
  return (
    <div className="flex items-center justify-between border-b border-[#0a2e1d]/80 bg-[#10462d] px-4 py-3">
      <div className="flex items-center gap-2 text-white">
        <BookIcon className="text-emerald-300" />
        <h3 className="text-base font-bold">Shticker Book</h3>
      </div>
    </div>
  );
}

function BookSidebar({
  activeTab,
  activeFacility,
  onTabChange,
  onFacilityChange,
}: {
  activeTab: InfoBookTab;
  activeFacility: number | null;
  onTabChange: (tab: InfoBookTab) => void;
  onFacilityChange: (idx: number | null) => void;
}) {
  const navButtonClass = (tab: InfoBookTab, extra = '') =>
    `w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer ${extra} ${
      activeTab === tab ? 'bg-[#145837] text-white shadow-inner' : 'text-green-100/80 hover:bg-black/20 hover:text-white'
    }`;

  return (
    <div className="w-48 shrink-0 border-r border-[#0a2e1d]/80 bg-[#0f3f28] p-2">
      <button
        type="button"
        onClick={() => { onTabChange('facilities'); onFacilityChange(null); }}
        className={navButtonClass('facilities', 'mb-2')}
      >
        Facilities
      </button>

      {activeTab === 'facilities' && (
        <div className="mb-3 ml-2 space-y-1 border-l border-emerald-700/40 pl-2">
          {FACILITIES_INFO.map((facility, idx) => (
            <button
              key={facility.title}
              type="button"
              onClick={() => onFacilityChange(idx)}
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                activeFacility === idx ? 'bg-black/30 text-emerald-200' : 'text-green-100/75 hover:bg-black/20 hover:text-white'
              }`}
            >
              {facility.title}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => { onTabChange('field_office'); onFacilityChange(null); }}
        className={navButtonClass('field_office')}
      >
        Field Office
      </button>

      <button
        type="button"
        onClick={() => { onTabChange('boiler_calc'); onFacilityChange(null); }}
        className={navButtonClass('boiler_calc', 'mt-2')}
      >
        Boiler Calculator
      </button>
    </div>
  );
}

function CloseBookButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/35 bg-[#0c3622] text-white shadow-lg transition-all hover:bg-[#145837] focus:outline-none focus:ring-2 focus:ring-emerald-500/70 active:scale-95 cursor-pointer"
      aria-label="Close Shticker Book"
      title="Close Shticker Book"
    >
      <BookIcon className="text-emerald-200" />
    </button>
  );
}

// ─── ShtickerBook (root) ──────────────────────────────────────────────────────

export function ShtickerBook() {
  const CLOSE_ANIMATION_MS = 260;
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<InfoBookTab>('facilities');
  const [activeFacility, setActiveFacility] = useState<number | null>(null);

  const closeBook = () => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeBook(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isClosing]);

  return (
    <>
      {!isOpen && (
        <OpenBookButton onClick={() => { setIsClosing(false); setIsOpen(true); }} />
      )}

      {isOpen && (
        <div
          className={`info-book-overlay fixed inset-0 z-[2147483646] bg-black/50 ${isClosing ? 'is-closing' : ''}`}
          onClick={closeBook}
        >
          <div
            className={`info-book-panel absolute bottom-4 left-4 h-[95vh] w-[90em] overflow-hidden rounded-2xl border border-[#0a2e1d] bg-[#0c3622] shadow-2xl ${isClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <BookHeader />

            <div className="flex h-[calc(95vh-3.5rem)]">
              <BookSidebar
                activeTab={activeTab}
                activeFacility={activeFacility}
                onTabChange={setActiveTab}
                onFacilityChange={setActiveFacility}
              />

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {activeTab === 'facilities' && (
                  <FacilitiesTabContent activeFacility={activeFacility} setActiveFacility={setActiveFacility} />
                )}
                {activeTab === 'field_office' && <FieldOfficeTabContent />}
                {activeTab === 'boiler_calc' && <BoilerCalculator />}
              </div>
            </div>

            <CloseBookButton onClick={closeBook} />
          </div>
        </div>
      )}
    </>
  );
}