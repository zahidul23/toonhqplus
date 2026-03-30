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
  minReward: number;
  maxReward: number;
  bossHealth: number;
  shortName: string;
};

type FacilityInfo = {
  id: string;
  title: string;
  rewardLabel: string;
  maxSkips: number;
  image: string;
  bossImage: string;
  cardBg: string;
  cardBorder: string;
  bossName: string;
  subtypes: FacilitySubtype[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SELLBOT_DATA = {
  attacks: [
    { name: 'Tremor', scrap: '6 (+2)', steel: '15 (+8)', note: 'Base (+Overtime)' },
    { name: 'Hot Air', scrap: '7 (+2)', steel: '19 (+10)', note: 'Base (+Overtime)' },
    { name: 'Red Tape', scrap: '4 (+1)', steel: '15 (+8)', note: 'Base (+Overtime)' },
    { name: 'Finger Wag', scrap: '9 (+3)', steel: '22 (+11)', note: 'Base (+Overtime)' },
  ],
  specialMoves: [
    { name: 'Overtime', effect: 'Dmg Up / Time Down', note: '25-50% Dmg boost. Timer reduced by 25-32s.' },
    { name: 'Burnout', effect: 'DoT', note: '8 dmg per round (Steel only).' },
    { name: 'Field Promotion', effect: 'Fired Up', note: '+25-50% Dmg, -50% Defense for 1 round.' },
  ]
};

const CASHBOT_DATA = {
  attacks: [
    { name: 'Audit', coin: '6 (13)', bullion: '11 (23)', note: 'Base (Bull Market)' },
    { name: 'Synergy', coin: '7 (14)', bullion: '12 (24)', note: 'Base (Bull Market)' },
    { name: 'Market Crash', coin: '8 (16)', bullion: '13 (26)', note: 'Base (Bull Market)' },
    { name: 'Power Tie', coin: '5 (11)', bullion: '9 (19)', note: 'Base (Bull Market)' },
  ],
  specialMoves: [
    { name: 'Bear Market', effect: 'Gag Tax', note: 'Gags cost 2x. Toon Defense +50%.' },
    { name: 'Bull Market', effect: 'Dmg Up', note: '25-50% Dmg boost for Toons & Cogs.' },
    { name: 'Promoted', effect: 'Level Up', note: 'Cogs gain +1-2 levels.' },
    { name: 'Investment', effect: 'Heal / Attentive', note: '+25-50 HP. Reduces Lure to 1 turn.' },
  ]
};

const LAWBOT_DATA = {
  attacks: [
    { name: 'Rolodex', junior: 8, senior: 24 },
    { name: 'Restraining Order', junior: 11, senior: 29 },
    { name: 'Guilt Trip', junior: 10, senior: 27 },
    { name: 'Legalese', junior: 13, senior: 36 },
    { name: 'Shh!', junior: '25% Dmg', senior: '50% Dmg', note: 'Silence: Retaliates Sound dmg' },
  ],
  specialMoves: [
    { name: 'Witness Protection', effect: 'Gag Immunity', note: 'Immune to Sound/Throw/Squirt/Drop. Heal +30-50.' },
    { name: 'Book Smart', effect: 'Dmg Up', note: '+15-30% Dmg. Reduces Lure to 1 turn.' },
    { name: 'Objection', effect: 'Gag Mandate', note: 'Must use Sound/Throw/Squirt/Drop or take dmg.' },
    { name: 'Objection Sustained', effect: 'Gag Ordinance', note: '15-25 dmg. Lockout 1 track (3-4 rounds).' },
  ]
};

const BOSSBOT_DATA = {
  attacks: [
    { name: 'Tee Off', fairway: 18, fringe: 23 },
    { name: 'Evil Eye', fairway: 19, fringe: 25 },
    { name: 'Head Shrink', fairway: 21, fringe: 28 },
    { name: 'Quake', fairway: 16, fringe: 21 },
    { name: 'Bogey', fairway: 'Special', fringe: 'Special', note: 'Delayed damage hit' },
    { name: 'Bunker Shot', fairway: '12-17', fringe: '17-22', note: 'Dmg ↑ per Cog defeated' },
  ],
  specialMoves: [
    { name: 'Setting Par', effect: 'Delayed Damage', note: '50/90 dmg (5 rounds). Dmg ↓ per Cog defeated.' },
    { name: 'Sandtrapped', effect: 'Gag Ordinance', note: 'Lockout last chosen track (1-2 rounds).' },
    { name: 'Overwork', effect: 'Attentive', note: 'Reduces Lure to 1 turn (1-2 rounds).' },
    { name: 'Penalty Stroke', effect: 'Defense Down', note: '20% per Cog defeated (up to 60%).' },
    { name: 'Driving Range', effect: 'Damage Up', note: '25-50% dmg boost during protection.' },
    { name: 'Swing Oil', effect: 'Heal', note: '+25-50 HP during protection.' },
  ]
};

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
    id: 'sellbot',
    title: 'Sellbot Factory',
    rewardLabel: 'Merits',
    maxSkips: 6,
    bossName: 'Factory Foreman',
    image: 'https://toonhq.org/static/assets/groups/large/factory.jpg',
    bossImage: '/images/foreman.webp',
    cardBg: '#7b00ae',
    cardBorder: '#9d4edd',
    subtypes: [
      { name: 'Scrap Factory', minReward: 350, maxReward: 638, bossHealth: 250, shortName: 'Scrap' },
      { name: 'Steel Factory', minReward: 867, maxReward: 1630, bossHealth: 750, shortName: 'Steel' },
    ],
  },
  {
    id: 'cashbot',
    title: 'Cashbot Mint',
    rewardLabel: 'Cogbucks',
    maxSkips: 2,
    bossName: 'Mint Auditor',
    image: 'https://toonhq.org/static/assets/groups/large/mint.jpg',
    bossImage: '/images/auditor.webp',
    cardBg: '#238b39',
    cardBorder: '#22c55e',
    subtypes: [
      { name: 'Coin Mint', minReward: 702, maxReward: 807, bossHealth: 750, shortName: 'Coin' },
      { name: 'Bullion Mint', minReward: 1626, maxReward: 1850, bossHealth: 1150, shortName: 'Bullion' },
    ],
  },
  {
    id: 'lawbot',
    title: 'Lawbot DA Office',
    rewardLabel: 'Jury Notices',
    maxSkips: 2,
    bossName: 'Office Clerk',
    image: 'https://toonhq.org/static/assets/groups/large/da.jpg',
    bossImage: '/images/clerk.webp',
    cardBg: '#2e5db1',
    cardBorder: '#60a5fa',
    subtypes: [
      { name: 'Junior Wing', minReward: 781, maxReward: 889, bossHealth: 1100, shortName: 'Junior' },
      { name: 'Senior Wing', minReward: 1854, maxReward: 2082, bossHealth: 1500, shortName: 'Senior' },
    ],
  },
  {
    id: 'bossbot',
    title: 'Bossbot Golf Course',
    rewardLabel: 'Stock Options',
    maxSkips: 2,
    bossName: 'Club President',
    image: 'https://toonhq.org/static/assets/groups/large/golf.jpg',
    bossImage: '/images/president.webp',
    cardBg: '#8c5d3d',
    cardBorder: '#ca8a04',
    subtypes: [
      { name: 'The First Fairway', minReward: 882, maxReward: 975, bossHealth: 1200, shortName: 'Fairway' },
      { name: 'The Final Fringe', minReward: 2097, maxReward: 2305, bossHealth: 1750, shortName: 'Fringe' },
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

function getHealthSegment(remaining: number, max: number, stars: number): 'green' | 'yellow' | 'orange' | 'red' {
  let greenThreshold: number = 0.85;
  let yellowThreshold: number = 0.65;
  let orangeThreshold: number = 0.30;
  if (stars === 4) {
    greenThreshold = 0.90;
    yellowThreshold = 0.70;
    orangeThreshold = 0.45;
  }

  if (max <= 0) return 'red';
  if (remaining > max * greenThreshold) return 'green';
  if (remaining > max * yellowThreshold) return 'yellow';
  if (remaining > max * orangeThreshold) return 'orange';
  return 'red';
}

function getExtensionImageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  if (typeof browser !== 'undefined' && (browser.runtime as any)) {
    return (browser.runtime as any).getURL(cleanPath);
  }
  return `/${cleanPath}`;
}

function getFacilityColorConfig(facilityId: string) {
  switch (facilityId) {
    case 'sellbot':
      return { color: 'text-purple-400', dot: 'bg-purple-500' };
    case 'cashbot':
      return { color: 'text-emerald-400', dot: 'bg-emerald-500' };
    case 'lawbot':
      return { color: 'text-blue-400', dot: 'bg-blue-500' };
    case 'bossbot':
      return { color: 'text-amber-400', dot: 'bg-amber-500' };
    default:
      return { color: 'text-blue-400', dot: 'bg-blue-500' };
  }
}

// ─── Shared primitive components ──────────────────────────────────────────────

function MultiLayerBoilerHealthBar({ remaining, max, stars }: { remaining: number; max: number; stars: number }) {
  const safeMax = Math.max(0, max);
  const safeRemaining = clampNumber(remaining, 0, safeMax);

  const greenThreshold = stars === 4 ? 0.10 : 0.15;
  const yellowThreshold = stars === 4 ? 0.20 : 0.20;
  const orangeThreshold = stars === 4 ? 0.25 : 0.35;
  const redThreshold = stars === 4 ? 0.45 : 0.30;

  const greenMax = safeMax * greenThreshold;
  const yellowMax = safeMax * yellowThreshold;
  const orangeMax = safeMax * orangeThreshold;
  const redMax = safeMax * redThreshold;

  const greenLower = safeMax * (1 - greenThreshold);
  const yellowLower = safeMax * (1 - greenThreshold - yellowThreshold);
  const orangeLower = safeMax * (1 - greenThreshold - yellowThreshold - orangeThreshold);

  const segment = getHealthSegment(safeRemaining, safeMax, stars);

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
    <div className="relative h-[50px] w-[300px] overflow-hidden rounded-md bg-black/40 border border-white/10">
      <div className="absolute inset-y-0 left-0 bg-red-500 transition-all duration-500 ease-in-out" style={{ width: `${redWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-orange-500 transition-all duration-500 ease-in-out" style={{ width: `${orangeWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-yellow-400 transition-all duration-500 ease-in-out" style={{ width: `${yellowWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-500 ease-in-out" style={{ width: `${greenWidth * 100}%` }} />
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

function BookIcon({ width = 16, height = 16, className = '', isOpen }: { width?: number; height?: number; className?: string; isOpen?: boolean | null }) {
  if (isOpen === true) {
    return (
      <div className='book-opened' />
    );
  }
  if (isOpen === false) {
    return (
      <div className='book-closed' />
    );
  }
  return (
    <img src={getExtensionImageUrl('images/Shticker_Book.webp')} alt="Book" width={48} height={48} className={className} />
  )
}

function StarIcon({ className = '', size = 10 }: { className?: string; size?: number | string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
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
  overlayBottom?: React.ReactNode;
  overlayTopLeft?: React.ReactNode;
};

function GagButton({ imageSrc, imageAlt, color, title, damage, disabled = false, onClick, overlayBottomRight, overlayBottom, overlayTopLeft }: GagButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gag-button group relative flex h-10 items-center justify-center rounded-md border transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:brightness-110'
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
      {overlayBottom && (
        <div className="absolute -bottom-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
          {overlayBottom}
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
  isFinished,
}: {
  track: GagTrack;
  activeCell: { round: number; slot: number };
  roundStats: Array<{ roundType: BoilerRoundType }>;
  isSosUsedInRound: (round: number, gagIndex: number) => boolean;
  onSelect: (gagIndex: number) => void;
  isFinished: boolean;
}) {
  return (
    <div className="flex gap-1">
      <div className='gag-button'></div>
      <div className='gag-button'></div>
      <div className='gag-button'></div>
      <div className='gag-button'></div>
      {SOS_SOUND_GAGS.map((sos) => {
        const gag = track.gags[sos.gagIndex];
        const roundType = roundStats[activeCell.round]?.roundType;
        const disabled = isFinished || isSosUsedInRound(activeCell.round, sos.gagIndex);
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
            overlayBottom={
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
  isFinished,
}: {
  track: GagTrack;
  activeCell: { round: number; slot: number };
  roundStats: Array<{ roundType: BoilerRoundType }>;
  isSosUsedInRound: (round: number, gagIndex: number) => boolean;
  onSelectGag: (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => void;
  isFinished: boolean;
}) {
  return (
    //border border-white/10 bg-black/20 rounded-lg
    <div className="flex flex-col gap-2 p-2">
      {/* <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-widest text-white/80">{track.name}</div>
      </div> */}

      {track.id === 'sound' && (
        <SosSoundPicker
          track={track}
          activeCell={activeCell}
          roundStats={roundStats}
          isSosUsedInRound={isSosUsedInRound}
          onSelect={(gagIndex) => onSelectGag('sound', gagIndex, 'sos')}
          isFinished={isFinished}
        />
      )}

      {/* Base gags row */}
      <div className="flex gap-1">
        {track.gags.map((gag, idx) => (
          <GagButton
            key={`${track.id}-${gag.name}`}
            imageSrc={`https://toonhq.org/static/assets/gags/${gag.image}`}
            imageAlt={gag.name}
            color={track.color}
            title={`${gag.name} (${gag.base})`}
            damage={gag.base}
            disabled={isFinished}
            onClick={() => onSelectGag(track.id, idx, 'base')}
          />
        ))}
      </div>

      {/* Organic gags row */}
      <div className="flex gap-1">
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
              disabled={isFinished}
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

function StarSelector({ stars, onSetStars }: { stars: number; onSetStars: (n: 1 | 2 | 3 | 4) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayStars = hovered ?? stars;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
      {([1, 2, 3, 4] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSetStars(n)}
          onMouseEnter={() => setHovered(n)}
          className="group relative flex items-center justify-center p-0.5 transition-transform active:scale-90 cursor-pointer"
          title={`${n}-star`}
        >
          <StarIcon
            size={24}
            className={`transition-colors duration-200 ${n <= displayStars
              ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]'
              : 'text-white/10'
              }`}
          />
        </button>
      ))}
    </div>
  );
}

function BoilerInfoSection({ stars, onSetStars, maxHp }: { stars: number; onSetStars: (n: 1 | 2 | 3 | 4) => void; maxHp: number }) {
  const starIdx = stars - 1;
  const burnDmg = [10, 14, 18, 22][starIdx];
  const starsText = ['One Star', 'Two Star', 'Three Star', 'Four Star'][starIdx];

  const attacks = [
    { name: 'Under Pressure', firedUpMultiplier: 1.5, base: [25, 30, 35, 40][starIdx] },
    { name: 'Heated Discussion', firedUpMultiplier: 1.5, base: [20, 24, 28, 32][starIdx] },
    { name: 'Slow Burn', firedUpMultiplier: 1.5, base: [5, 7, 9, 11][starIdx] },
    { name: 'Stamp of Disapproval', firedUpMultiplier: 1, base: [50, 70, 80, 90][starIdx] },
  ];

  return (
    <div className="mb-4 rounded-xl bg-black/40 p-3">
      <div className="mb-4 flex items-center justify-between mx-2">
        <h4 className="text-base font-bold text-white">Boiler - {starsText}</h4>
        <StarSelector stars={stars} onSetStars={onSetStars} />
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-black/30">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 font-black uppercase tracking-wider text-white/40">
              <th className="px-2 py-1.5">Attack</th>
              <th className="px-2 py-1.5 text-center">Base</th>
              <th className="px-2 py-1.5 text-center text-orange-400/80">Fired Up</th>
              <th className="px-2 py-1.5 text-center text-red-400">+ Burn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {attacks.map((attack) => {
              const fired = Math.ceil(attack.base * attack.firedUpMultiplier);
              const firedBurn = fired + burnDmg;
              const showBase = starIdx !== 3 || attack.name === 'Stamp of Disapproval';
              const showFired = attack.firedUpMultiplier !== 1;
              return (
                <tr key={attack.name} className="hover:bg-white/5 transition-colors">
                  <td className="px-2 py-1.5 font-semibold text-white/80">{attack.name}</td>
                  <td className="px-2 py-1.5 text-center font-black text-white/60 tabular-nums">{showBase ? attack.base : ' - '}</td>
                  <td className="px-2 py-1.5 text-center font-black text-orange-300 tabular-nums">{showFired ? fired : ' - '}</td>
                  <td className="px-2 py-1.5 text-center font-black text-red-400 tabular-nums">
                    <span className='text-[9px]'>(+{burnDmg}) = </span> {firedBurn}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* <div className="mt-2 text-[9px] font-medium text-white text-right italic">
        *Burn damage for {stars}★: {burnDmg}
      </div> */}
    </div>
  );
}

function GagPickerPanel({
  stars,
  onSetStars,
  maxHp,
  gagTracks,
  activeCell,
  roundStats,
  isSosUsedInRound,
  onSelectGag,
  isFinished,
}: {
  stars: number;
  onSetStars: (n: 1 | 2 | 3 | 4) => void;
  maxHp: number;
  gagTracks: GagTrack[];
  activeCell: { round: number; slot: number };
  roundStats: Array<{ roundType: BoilerRoundType }>;
  isSosUsedInRound: (round: number, gagIndex: number) => boolean;
  onSelectGag: (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => void;
  isFinished: boolean;
}) {
  return (
    <section className="rounded-xl flex flex-col min-h-0 h-full overflow-hidden">
      <BoilerInfoSection stars={stars} onSetStars={onSetStars} maxHp={maxHp} />

      <div className="min-h-0 rounded-xl flex flex-col p-2 overflow-hidden bg-black/40" >
        <div className="flex items-center justify-between gap-2 p-2 mx-2">
          <div className="text-base font-bold text-white">Gags</div>
          <div className="text-base font-bold text-white tabular-nums">
            Round {activeCell.round + 1} - Gag {activeCell.slot + 1}
          </div>
        </div>
        <div className="overflow-y-auto custom-scrollbar p-2 space-y-3  rounded-lg ">
          {gagTracks.map((track) => (
            <GagTrackPicker
              key={track.id}
              track={track}
              activeCell={activeCell}
              roundStats={roundStats}
              isSosUsedInRound={isSosUsedInRound}
              onSelectGag={onSelectGag}
              isFinished={isFinished}
            />
          ))}
        </div>
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

  const sosInfo = cell?.variant === 'sos' ? SOS_SOUND_GAGS.find(s => s.gagIndex === cell.gagIndex) : null;
  const imgSrc = sosInfo ? sosInfo.image : (gag ? `https://toonhq.org/static/assets/gags/${gag.image}` : null);

  const name = sosInfo ? sosInfo.name : gag?.name || null;

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
      className={`gag-button group relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors cursor-pointer ${isActive ? 'border-emerald-400/70 bg-emerald-500/10' : cell ? 'hover:brightness-75' : 'border-white/10 bg-black/25 hover:bg-black/35'
        }`}
      style={cell && track ? { backgroundColor: track.color, borderColor: track.color } : undefined}
      title={name ? `${name} (${cellDamage}) — click to remove` : 'Click a gag to insert'}
    >
      {/* Fixed-size container so filled and empty slots are identical dimensions */}
      <div className="h-8 w-8 flex items-center justify-center">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={name || 'Gag'}
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
        <div className="absolute -bottom-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] text-yellow-300 flex">
          {[...Array(sosInfo?.gagIndex ?? 0)].map((_, i) => (
            <StarIcon key={i} className="w-2.5 h-2.5" />
          ))}
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
      className={`rounded-lg border border-white/10 bg-black/20 ${isActiveRound ? 'ring-2 ring-emerald-500/60' : ''} ${isMeltdown ? 'border-red-500/40 bg-red-900 shadow-[inset_0_0_8px_rgba(239,68,68,0.15)]' : ''}`}
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
          <div className="text-sm font-black tabular-nums text-red-300"> {rowDamage != 0 && `-${rowDamage}`}</div>
        </div>
      </div>
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
      <div className="flex flex-col gap-1 m-1 w-[345px]">
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
        borderColor={isMeltdown ? 'border-red-500/40 bg-red-900' : 'border-red-500/20 bg-red-900'}
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
        label={isMeltdown ? 'Meltdown' : 'Defense'}
        labelColor={isMeltdown ? 'text-red-400' : 'text-sky-300/80'}
        borderColor={isMeltdown ? 'border-red-500/40 bg-red-900' : 'border-sky-500/20 bg-sky-900'}
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
  onSetActiveCell,
  onClearSlot,
  onClearAll,
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
  onSetActiveCell: (cell: { round: number; slot: number }) => void;
  onClearSlot: (round: number, slot: number) => void;
  onClearAll: () => void;
}) {
  return (
    <section className="rounded-xl bg-black/40  p-2 flex flex-col h-full relative">
      {/* Header: health bar */}
      <div className="my-4 flex items-center justify-center h-[50px] relative">
        <div className="relative w-[300px]">
          <MultiLayerBoilerHealthBar remaining={remainingHp} max={maxHp} stars={stars} />
          <div className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
            {remainingHp} / {maxHp}
          </div>
        </div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={onClearAll}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-600 bg-red-500 text-white transition-colors hover:bg-red-600 active:scale-95 cursor-pointer"
            title="Reset gag choices"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 4.5 16.5 A 9 9 0 1 0 12 3 a 9.75 9.75 0 0 0 -6.74 2.74 L 3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Phase groups */}
      <div ref={roundsScrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-2 max-h-[45em] border-radius-sm">
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
  const [stars, setStars] = useState<1 | 2 | 3 | 4>(() => {
    try {
      const stored = localStorage.getItem('toonhqplus_boiler_calc_stars');
      if (stored) return parseInt(stored, 10) as 1 | 2 | 3 | 4;
    } catch (e) { }
    return 4;
  });

  const getInitialGrid = (s: number) => {
    const neutralCount = s < 4 ? 2 : 0;
    const cycleCount = 2 * 6; // 2 sets of 6 rounds
    const total = neutralCount + cycleCount;
    return Array.from({ length: total }, () =>
      Array.from({ length: BOILER_CALC_GAGS_PER_ROUND }, () => null)
    );
  };

  const [activeCell, setActiveCell] = useState<{ round: number; slot: number }>(() => {
    try {
      const stored = localStorage.getItem('toonhqplus_boiler_calc_active_cell');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.round === 'number' && typeof parsed.slot === 'number') {
          return parsed;
        }
      }
    } catch (e) { }
    return { round: 0, slot: 0 };
  });
  const [grid, setGrid] = useState<SelectedGagCell[][]>(() => {
    try {
      const stored = localStorage.getItem('toonhqplus_boiler_calc_grid');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }

    let initStars = 4;
    try {
      const storedStars = localStorage.getItem('toonhqplus_boiler_calc_stars');
      if (storedStars) {
        const parsed = parseInt(storedStars, 10);
        if (!isNaN(parsed)) initStars = parsed;
      }
    } catch (e) { }
    return getInitialGrid(initStars);
  });
  const [lastAddedRound, setLastAddedRound] = useState<number | null>(null);
  const roundRowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const roundsScrollRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('toonhqplus_boiler_calc_stars', stars.toString());
    } catch (e) { }
  }, [stars]);

  useEffect(() => {
    try {
      localStorage.setItem('toonhqplus_boiler_calc_grid', JSON.stringify(grid));
    } catch (e) { }
  }, [grid]);

  useEffect(() => {
    try {
      localStorage.setItem('toonhqplus_boiler_calc_active_cell', JSON.stringify(activeCell));
    } catch (e) { }
  }, [activeCell]);

  // Reset grid when stars change
  const handleSetStars = (n: 1 | 2 | 3 | 4) => {
    setStars(n);
    setGrid(getInitialGrid(n));
    setActiveCell({ round: 0, slot: 0 });
    setLastAddedRound(null);
  };

  const phaseGroups = useMemo((): PhaseGroup[] => {
    const groups: PhaseGroup[] = [];
    const totalRounds = grid.length;
    if (stars < 4) {
      groups.push({ kind: 'neutral', rounds: [0, 1] });
      for (let i = 2; i < totalRounds; i += 6) {
        const firedUp = [i, i + 1, i + 2].filter((r) => r < totalRounds);
        const defense = [i + 3, i + 4, i + 5].filter((r) => r < totalRounds);
        if (firedUp.length || defense.length) groups.push({ kind: 'cycle', firedUp, defense });
      }
    } else {
      for (let i = 0; i < totalRounds; i += 6) {
        const firedUp = [i, i + 1, i + 2].filter((r) => r < totalRounds);
        const defense = [i + 3, i + 4, i + 5].filter((r) => r < totalRounds);
        if (firedUp.length || defense.length) groups.push({ kind: 'cycle', firedUp, defense });
      }
    }
    return groups;
  }, [stars, grid.length]);

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
    return grid[roundIndex]?.some((cell) => cell?.variant === 'sos' && cell.trackId === 'sound' && cell.gagIndex === gagIndex);
  };

  const maxHp = useMemo(() => {
    const entry = FIELD_OFFICE_INFO.boilerHpByStar[stars - 1];
    return Number(String(entry.hp).replace(/,/g, '')) || 0;
  }, [stars]);

  const roundStats = useMemo(() => {
    let rolling = 0;
    const stats: RoundStat[] = [];
    const redThreshold = maxHp * 0.45;

    for (let i = 0; i < grid.length; i++) {
      const round = grid[i];
      let roundType = getBoilerRoundType(i, stars);

      if (stars === 4 && i > 0 && maxHp - stats[i - 1].rolling <= redThreshold) {
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
  const isFinished = remainingHp <= 0;

  const selectGag = (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => {
    if (isFinished) return;
    if (variant === 'sos' && trackId === 'sound' && isSosUsedInRound(activeCell.round, gagIndex)) return;

    setLastAddedRound(activeCell.round);

    setGrid((prev) => {
      let next = prev.map((r) => r.slice());
      next[activeCell.round][activeCell.slot] = { trackId, gagIndex, variant };

      // If we're in the last 6 rounds, append a new 6-round cycle
      if (activeCell.round >= next.length - 6) {
        const newCycle = Array.from({ length: 6 }, () =>
          Array.from({ length: BOILER_CALC_GAGS_PER_ROUND }, () => null)
        );
        next = [...next, ...newCycle];
      }

      return next;
    });

    setActiveCell((prev) => {
      const nextSlot = prev.slot + 1;
      if (nextSlot < BOILER_CALC_GAGS_PER_ROUND) return { round: prev.round, slot: nextSlot };

      let nextRound = prev.round + 1;
      // Skip defense rounds if the current round wasn't a defense/meltdown round (auto-progression logic)
      if (roundStats[prev.round]?.roundType !== 'defense' && roundStats[prev.round]?.roundType !== 'meltdown') {
        while (nextRound < grid.length && getBoilerRoundType(nextRound, stars) === 'defense') {
          nextRound++;
        }
      }
      // Since we just expanded the grid if needed, nextRound should be safe
      return { round: nextRound, slot: 0 };
    });
  };

  const clearSlot = (roundIndex: number, slotIndex: number) => {
    setActiveCell({ round: roundIndex, slot: slotIndex });
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[roundIndex][slotIndex] = null;
      return next;
    });
  };

  const handleClearAll = () => {
    setGrid(getInitialGrid(stars));
    setActiveCell({ round: 0, slot: 0 });
    setLastAddedRound(null);
  };

  useEffect(() => {
    if (lastAddedRound == null) return;
    const el = roundRowRefs.current[lastAddedRound];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastAddedRound]);

  return (
    <div className="grid grid-cols-[38%_62%] gap-3 h-full">
      <GagPickerPanel
        stars={stars}
        onSetStars={handleSetStars}
        maxHp={maxHp}
        gagTracks={gagTracks}
        activeCell={activeCell}
        roundStats={roundStats}
        isSosUsedInRound={isSosUsedInRound}
        onSelectGag={selectGag}
        isFinished={isFinished}
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
        onSetActiveCell={setActiveCell}
        onClearSlot={clearSlot}
        onClearAll={handleClearAll}
      />
    </div>
  );
}

// ─── Facilities tab subcomponents ─────────────────────────────────────────────

function FacilitySubtypeRow({ subtype, rewardLabel }: { subtype: FacilitySubtype; rewardLabel: string }) {
  return (
    <div className='flex gap-2'>
      <div className="flex flex-1 justify-between gap-2 px-2 py-1.5 rounded-lg bg-black/20 border border-white/5">
        <p className="text-sm font-bold text-white">{subtype.name}</p>
        <p className="text-sm font-bold text-white/95 text-right">
          {subtype.minReward}-{subtype.maxReward} {rewardLabel}
        </p>
      </div>
      <div className="flex w-[160px] justify-center gap-2 px-2 py-1.5 rounded-lg bg-black/20 border border-white/5">
        <p className="text-sm font-bold text-white/95 text-center">{subtype.bossHealth} HP</p>
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
  const widthClass = heightClass.replace('h-', 'w-');
  return (
    <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
      <img src={facility.image} alt={facility.title} className={`${heightClass} w-full rounded-md border border-white/20 object-cover`} />
      <img src={getExtensionImageUrl(facility.bossImage)} alt={facility.bossName} className={`${heightClass} ${widthClass} rounded-md border border-white/20 bg-black/30 object-cover`} />
    </div>
  );
}

function FacilityCard({ facility, idx, onOpen }: { facility: FacilityInfo; idx: number; onOpen: (idx: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(idx)}
      className="group relative flex flex-col rounded-xl border p-3 text-white transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] cursor-pointer text-left w-full shadow-lg"
      style={{
        background: `linear-gradient(180deg, ${facility.cardBg}ee 0%, ${facility.cardBg}c8 55%, #0f172abf 100%)`,
        borderColor: facility.cardBorder,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-black uppercase tracking-tight">{facility.title}</h4>
        <div className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/60 group-hover:bg-white/20 group-hover:text-white transition-colors">
          View Details
        </div>
      </div>
      <FacilityImages facility={facility} heightClass="h-40" />
      <div className="mt-2 w-full space-y-1.5">
        {facility.subtypes.map((subtype) => (
          <div key={subtype.name} className="">
            <FacilitySubtypeRow subtype={subtype} rewardLabel={facility.rewardLabel} />
          </div>
        ))}
      </div>
    </button>
  );
}

function FacilityDetailPage({ facility, onBack }: { facility: FacilityInfo; onBack: () => void }) {
  return (
    <section
      className="mx-auto max-w-6xl rounded-xl border p-6 text-white"
      style={{
        background: `linear-gradient(180deg, ${facility.cardBg}ee 0%, ${facility.cardBg}c8 55%, #0f172abf 100%)`,
        borderColor: facility.cardBorder,
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white/70 transition-all hover:bg-black/50 hover:text-white cursor-pointer"
            title="Back to Overview"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-x-0.5">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <h4 className="text-2xl font-black uppercase tracking-tight">{facility.title}</h4>
        </div>
        <div className="rounded-md bg-black/40 px-3 py-1 text-sm font-bold text-white/80 border border-white/10">
          Boss: {facility.bossName}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-10">
        {/* 1. Images (Top on mobile, Top-Left on desktop) */}
        <div className="lg:col-span-6">
          <FacilityImages facility={facility} heightClass="h-48" />
        </div>

        {/* 2. Boss HP & Rewards (Middle on mobile, Right column on desktop) */}
        <div className="lg:col-span-4 lg:row-span-2 space-y-6">
          {/* Boss HP Section */}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <h5 className="text-sm font-black uppercase tracking-widest text-red-400">Boss HP</h5>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {facility.subtypes.map((subtype) => (
                <div key={subtype.name} className="rounded-xl border border-white/5 bg-black/40 p-3 text-center">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/40">{subtype.shortName}</div>
                  <div className="text-xl font-black text-white tabular-nums">{subtype.bossHealth} <span className="text-xs text-white/40">HP</span></div>
                </div>
              ))}
            </div>
          </div>

          <RewardSkipTable facility={facility} />
        </div>

        {/* 3. Attacks & Special Moves (Bottom on mobile, Bottom-Left on desktop) */}
        <div className="lg:col-span-6">
          <BossInfographic facilityId={facility.id} />
        </div>
      </div>
    </section>
  );
}

function RewardSkipTable({ facility }: { facility: FacilityInfo }) {
  const { color, dot } = getFacilityColorConfig(facility.id);
  const skipRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i <= facility.maxSkips; i++) {
      const values = facility.subtypes.map(s => {
        const range = s.maxReward - s.minReward;
        const step = range / facility.maxSkips;
        return Math.round(s.maxReward - (i * step));
      });
      rows.push({ skips: i, values });
    }
    return rows;
  }, [facility]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
      <div className="mb-4 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${dot}`} />
        <h5 className={`text-sm font-black uppercase tracking-widest ${color}`}>{facility.rewardLabel}</h5>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
              <th className="px-3 py-2.5"></th>
              {facility.subtypes.map(s => (
                <th key={s.name} className="px-3 py-2.5 text-center">{s.shortName}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {skipRows.map((row) => {
              const isFull = row.skips === 0;
              const isMinimal = row.skips === facility.maxSkips;
              let label = `${row.skips} ${row.skips === 1 ? 'Skip' : 'Skips'}`;

              if (isFull) {
                label = facility.id === 'sellbot' ? "Long" : "Full";
              } else if (isMinimal && facility.id === 'sellbot') {
                label = "Short";
                // label = facility.id === 'sellbot' ? "Short" : "Minimal";
              }

              return (
                <tr key={row.skips} className={`hover:bg-white/5 transition-colors ${isFull ? 'bg-emerald-500/5' : isMinimal ? 'bg-red-500/5' : ''}`}>
                  <td className="px-3 py-2.5">
                    <span className={`font-black uppercase tracking-tight ${isFull ? 'text-emerald-400' : isMinimal ? 'text-red-400' : 'text-white/60'}`}>
                      {label}
                    </span>
                  </td>
                  {row.values.map((val, idx) => (
                    <td key={idx} className="px-3 py-2.5 text-center text-lg font-black text-white tabular-nums">
                      ~{val}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BossInfographic({ facilityId }: { facilityId: string }) {
  const { color, dot } = getFacilityColorConfig(facilityId);
  const config = useMemo(() => {
    switch (facilityId) {
      case 'sellbot':
        return {
          data: SELLBOT_DATA,
          labels: ['Scrap', 'Steel'],
          keys: ['scrap', 'steel'],
        };
      case 'cashbot':
        return {
          data: CASHBOT_DATA,
          labels: ['Coin', 'Bullion'],
          keys: ['coin', 'bullion'],
        };
      case 'lawbot':
        return {
          data: LAWBOT_DATA,
          labels: ['Junior', 'Senior'],
          keys: ['junior', 'senior'],
        };
      case 'bossbot':
        return {
          data: BOSSBOT_DATA,
          labels: ['Fairway', 'Fringe'],
          keys: ['fairway', 'fringe'],
        };
      default:
        return null;
    }
  }, [facilityId]);

  if (!config) return null;

  return (
    <>
      {/* Attacks Table */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${dot} animate-pulse`} />
          <h5 className={`text-sm font-black uppercase tracking-widest ${color}`}>Boss Attacks</h5>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                <th className="px-3 py-2.5">Attack</th>
                <th className="px-3 py-2.5 text-center">{config.labels[0]}</th>
                <th className="px-3 py-2.5 text-center">{config.labels[1]}</th>
                <th className="px-3 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {config.data.attacks.map((atk: any) => (
                <tr key={atk.name} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2.5 font-bold text-white/90">{atk.name}</td>
                  <td className="px-3 py-2.5 text-center font-black text-emerald-300 tabular-nums">{atk[config.keys[0]]}</td>
                  <td className="px-3 py-2.5 text-center font-black text-orange-300 tabular-nums">{atk[config.keys[1]]}</td>
                  <td className="px-3 py-2.5 text-[10px] leading-tight text-white/40">{atk.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Special Moves Table */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${dot} animate-pulse`} />
          <h5 className={`text-sm font-black uppercase tracking-widest ${color}`}>Special Moves</h5>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                <th className="px-3 py-2.5">Move</th>
                <th className="px-3 py-2.5">Effect</th>
                <th className="px-3 py-2.5">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {config.data.specialMoves.map((move: any) => (
                <tr key={move.name} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2.5 font-bold text-white/90">{move.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 font-black border ${color.replace('text', 'bg')}/10 ${color} ${color.replace('text', 'border')}/20`}>
                      {move.effect}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] leading-snug text-white/50">{move.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
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
    return (
      <FacilityDetailPage
        facility={FACILITIES_INFO[activeFacility]}
        onBack={() => setActiveFacility(null)}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 min-[1200px]:grid-cols-2">
      {FACILITIES_INFO.map((facility, idx) => (
        <FacilityCard key={facility.title} facility={facility} idx={idx} onOpen={setActiveFacility} />
      ))}
    </div>
  );
}

function FieldOfficeTabContent() {
  const [selectedStar, setSelectedStar] = useState(4);

  const boilerStats = [
    { star: 1, hp: 4000, label: '1★', merits: 1400 },
    { star: 2, hp: 4500, label: '2★', merits: 1800 },
    { star: 3, hp: 5000, label: '3★', merits: 2200 },
    { star: 4, hp: 5500, label: '4★', merits: 2600 },
  ];

  const attacks = [
    { name: 'Under Pressure', s1: '25/38', s2: '30/45', s3: '35/53', s4: '40/60' },
    { name: 'Heated Discussion', s1: '20/30', s2: '24/36', s3: '28/42', s4: '32/48' },
    { name: 'Slow Burn', s1: '5/8', s2: '7/11', s3: '9/14', s4: '11/17' },
    { name: 'Burn', s1: '10', s2: '14', s3: '18', s4: '22' },
    { name: 'Stamp of Disapproval', s1: '50', s2: '70', s3: '80', s4: '90' },
  ];

  const specialMoves = [
    { name: 'Promoted', s1: '+1 Lvl', s2: '+2 Lvls', s3: '+2 Lvls', s4: '+3 Lvls', note: 'Cogs level up' },
    { name: 'Pay Raise', s1: '+60 HP', s2: '+80 HP', s3: '+100 HP', s4: '+125 HP', note: 'Cogs heal' },
    { name: 'Quality Control', s1: '1 Round', s2: '2 Rounds', s3: '3 Rounds', s4: '4 Rounds', note: 'Gag Lockout' },
  ];

  const jokeData = [
    { label: 'Restore 1 Track', s1: '25', s2: '35', s3: '45', s4: '50' },
    { label: 'Restore 2 Tracks', s1: '40', s2: '55', s3: '65', s4: '75' },
    { label: 'Max Jokes', s1: '55', s2: '65', s3: '80', s4: '90' },
  ];

  const elevatorFailure = [
    { name: 'Penalty', s1: '-30 Laff', s2: '-40 Laff', s3: '-50 Laff', s4: '-50 Laff' },
  ];

  const coldCallerMinigameDmg = [
    {
      name: (
        <div className="flex flex-col text-[13px] leading-tight">
          <span>Name Dropper</span>
          <span>Mover & Shaker</span>
          <span>Two-Face</span>
        </div>
      ),
      s1: '-17', s2: '-21', s3: '-25', s4: '-29'
    },
    { name: 'Cold Caller', s1: '-12', s2: '-15', s3: '-18', s4: '-21' },
  ];

  const megaMoverMinigameDmg = [
    { name: 'Mega-Mover', s1: '-25', s2: '-30', s3: '-35', s4: '-40' },
    {
      name: (
        <div className="flex flex-col text-[13px] leading-tight">
          <span>Cold Caller</span>
          <span>Glad Hander</span>
        </div>
      ),
      s1: '-20', s2: '-23', s3: '-26', s4: '-29'
    },
    {
      name: (
        <div className="flex flex-col text-[13px] leading-tight">
          <span>Telemarketer</span>
          <span>Name Dropper</span>
          <span>Two-Face</span>
        </div>
      ),
      s1: '-10', s2: '-12', s3: '-14', s4: '-16'
    },
    { name: 'Filing Cabinet', s1: '-5', s2: '-5', s3: '-5', s4: '-5' },
  ];

  const getColClass = (star: number) => selectedStar === star ? 'bg-emerald-500/20 column-highlighted' : '';

  const getFieldOfficeImage = (star: number) => {
    switch (star) {
      case 1: return 'https://toonhq.org/static/assets/groups/large/sfo/mm_3.jpg';
      case 2: return 'https://toonhq.org/static/assets/groups/large/sfo/tb_4.jpg';
      case 3: return 'https://toonhq.org/static/assets/groups/large/sfo/ddl_2.jpg';
      case 4: default: return 'https://toonhq.org/static/assets/groups/large/playground_field_office.jpg';
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/20 shadow-2xl h-64">
          <img
            src={getFieldOfficeImage(selectedStar)}
            alt="Field Office"
            className="h-full w-full object-cover transition-all duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4">
            <h4 className="text-2xl font-black uppercase tracking-tight text-white drop-shadow-md">
              Sellbot Field Office
              <span className="m-2 mb-4">
                {[...Array(selectedStar)].map((_, i) => (
                  <span key={i} className="text-yellow-300 text-lg p-1">★</span>
                ))}
              </span>
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {boilerStats.map((item) => (
            <button
              key={item.star}
              onClick={() => setSelectedStar(item.star)}
              className={`flex flex-col items-center justify-center rounded-2xl border transition-all duration-200 p-4 shadow-xl cursor-pointer ${selectedStar === item.star
                ? 'border-emerald-400 bg-emerald-500/30 scale-[1.02] ring-2 ring-emerald-500/50'
                : 'border-emerald-500/20 bg-[#10462d]/60 hover:bg-[#10462d]/80'
                }`}
            >
              <div className="mb-1 text-sm font-black text-emerald-400/80 uppercase tracking-widest">{
                [...Array(item.star)].map((_, i) => (
                  <span key={i} className="text-yellow-300 text-lg">★</span>
                ))
              } </div>
              <div className="text-2xl font-black text-white tabular-nums">~{item.merits} Merits</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <h5 className="text-sm font-black uppercase tracking-widest text-blue-400">Jokes</h5>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                  <th className="px-3 py-2.5"></th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(1)}`}>1★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(2)}`}>2★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(3)}`}>3★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(4)}`}>4★</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {jokeData.map((row) => (
                  <tr key={row.label} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-white/90">{row.label}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-blue-300 tabular-nums transition-colors ${getColClass(1)}`}>{row.s1}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-blue-300 tabular-nums transition-colors ${getColClass(2)}`}>{row.s2}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-blue-300 tabular-nums transition-colors ${getColClass(3)}`}>{row.s3}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-blue-300 tabular-nums transition-colors ${getColClass(4)}`}>{row.s4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <h5 className="text-sm font-black uppercase tracking-widest text-rose-400">Failure To Enter Elevator</h5>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                  <th className="px-4 py-3"></th>
                  <th className={`px-4 py-3 text-center transition-colors ${getColClass(1)}`}>1★</th>
                  <th className={`px-4 py-3 text-center transition-colors ${getColClass(2)}`}>2★</th>
                  <th className={`px-4 py-3 text-center transition-colors ${getColClass(3)}`}>3★</th>
                  <th className={`px-4 py-3 text-center transition-colors ${getColClass(4)}`}>4★</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {elevatorFailure.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-bold text-white/90">{row.name}</td>
                    <td className={`px-4 py-3 text-center font-black text-rose-300 tabular-nums transition-colors ${getColClass(1)}`}>{row.s1}</td>
                    <td className={`px-4 py-3 text-center font-black text-rose-300 tabular-nums transition-colors ${getColClass(2)}`}>{row.s2}</td>
                    <td className={`px-4 py-3 text-center font-black text-rose-300 tabular-nums transition-colors ${getColClass(3)}`}>{row.s3}</td>
                    <td className={`px-4 py-3 text-center font-black text-rose-300 tabular-nums transition-colors ${getColClass(4)}`}>{row.s4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
            <h5 className="text-sm font-black uppercase tracking-widest text-cyan-400">Cold Caller Cubicles Damage</h5>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                  <th className="px-3 py-2.5"></th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(1)}`}>1★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(2)}`}>2★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(3)}`}>3★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(4)}`}>4★</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {coldCallerMinigameDmg.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-white/90">{row.name}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-cyan-300 tabular-nums transition-colors ${getColClass(1)}`}>{row.s1}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-cyan-300 tabular-nums transition-colors ${getColClass(2)}`}>{row.s2}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-cyan-300 tabular-nums transition-colors ${getColClass(3)}`}>{row.s3}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-cyan-300 tabular-nums transition-colors ${getColClass(4)}`}>{row.s4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            <h5 className="text-sm font-black uppercase tracking-widest text-orange-400">Mega-Mover Mazes Damage</h5>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                  <th className="px-3 py-2.5"></th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(1)}`}>1★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(2)}`}>2★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(3)}`}>3★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(4)}`}>4★</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {megaMoverMinigameDmg.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-white/90">{row.name}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-orange-300 tabular-nums transition-colors ${getColClass(1)}`}>{row.s1}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-orange-300 tabular-nums transition-colors ${getColClass(2)}`}>{row.s2}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-orange-300 tabular-nums transition-colors ${getColClass(3)}`}>{row.s3}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-orange-300 tabular-nums transition-colors ${getColClass(4)}`}>{row.s4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h5 className="text-sm font-black uppercase tracking-widest text-red-400">Boiler Attacks (Base / Fired Up)</h5>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                  <th className="px-3 py-2.5"></th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(1)}`}>1★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(2)}`}>2★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(3)}`}>3★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(4)}`}>4★</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {attacks.map((atk, idx) => {
                  const indent = atk.name === 'Burn' ? 'pl-6' : '';
                  return (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className={`px-3 py-2.5 font-bold text-white/90 ${indent}`}>{atk.name}</td>
                      <td className={`px-3 py-2.5 text-center font-black text-emerald-300 tabular-nums transition-colors ${getColClass(1)}`}>{atk.s1}</td>
                      <td className={`px-3 py-2.5 text-center font-black text-emerald-300 tabular-nums transition-colors ${getColClass(2)}`}>{atk.s2}</td>
                      <td className={`px-3 py-2.5 text-center font-black text-emerald-300 tabular-nums transition-colors ${getColClass(3)}`}>{atk.s3}</td>
                      <td className={`px-3 py-2.5 text-center font-black text-emerald-300 tabular-nums transition-colors ${getColClass(4)}`}>{atk.s4}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h5 className="text-sm font-black uppercase tracking-widest text-emerald-400">Boiler Special Moves</h5>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-black uppercase text-white/40">
                  <th className="px-3 py-2.5"></th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(1)}`}>1★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(2)}`}>2★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(3)}`}>3★</th>
                  <th className={`px-3 py-2.5 text-center transition-colors ${getColClass(4)}`}>4★</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {specialMoves.map((move) => (
                  <tr key={move.name} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-white/90">{move.name}</div>
                      <div className="text-[9px] text-white/30 leading-tight">{move.note}</div>
                    </td>
                    <td className={`px-3 py-2.5 text-center font-black text-white/70 tabular-nums transition-colors ${getColClass(1)}`}>{move.s1}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-white/70 tabular-nums transition-colors ${getColClass(2)}`}>{move.s2}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-white/70 tabular-nums transition-colors ${getColClass(3)}`}>{move.s3}</td>
                    <td className={`px-3 py-2.5 text-center font-black text-white/70 tabular-nums transition-colors ${getColClass(4)}`}>{move.s4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
        className="group inline-flex  items-center justify-center transition-all cursor-pointer"
        aria-label="Open Shticker Book"
        title="Open Shticker Book"
      >
        <BookIcon isOpen={false} />
      </button>
    </div>
  );
}

function BookHeader() {
  return (
    <div className="flex items-center justify-between border-b border-[#0a2e1d]/80 bg-[#10462d] px-4 py-3">
      <div className="flex items-center gap-2 text-white">
        <BookIcon className="text-emerald-300" isOpen={null} />
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
    `w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer ${extra} ${activeTab === tab ? 'bg-[#145837] text-white shadow-inner' : 'text-green-100/80 hover:bg-black/20 hover:text-white'
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
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer ${activeFacility === idx ? 'bg-black/30 text-emerald-200' : 'text-green-100/75 hover:bg-black/20 hover:text-white'
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
        className={navButtonClass('field_office', 'mb-2')}
      >
        Field Offices
      </button>

      <button
        type="button"
        onClick={() => { onTabChange('boiler_calc'); onFacilityChange(null); }}
        className={navButtonClass('boiler_calc')}
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
      className="absolute bottom-4 left-4 z-20 inline-flex transition-all cursor-pointer"
      aria-label="Close Shticker Book"
      title="Close Shticker Book"
    >
      <BookIcon className="text-emerald-200" isOpen={true} />
    </button>
  );
}

// ─── ShtickerBook (root) ──────────────────────────────────────────────────────

export function ShtickerBook() {
  const CLOSE_ANIMATION_MS = 260;
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<InfoBookTab>(() => {
    try {
      const stored = localStorage.getItem('toonhqplus_shtickerbook_active_tab');
      if (stored === 'facilities' || stored === 'field_office' || stored === 'boiler_calc') {
        return stored as InfoBookTab;
      }
    } catch (e) { }
    return 'facilities';
  });
  const [activeFacility, setActiveFacility] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('toonhqplus_shtickerbook_active_tab', activeTab);
    } catch (e) { }
  }, [activeTab]);

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
            className={`info-book-panel absolute bottom-4 left-4 overflow-hidden rounded-2xl border border-[#0a2e1d] bg-[#0c3622] shadow-2xl ${isClosing ? 'is-closing' : ''}`}
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
