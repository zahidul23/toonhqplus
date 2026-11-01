import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { gags as gagTracks } from '../gags';
import { staticUrl } from '../calculatorAssets';
import { TOONS_HIT_BONUS } from '../toonsHit';
import { COG_HEALTH } from '../gagCombos';
import {
  COG_DEFENSE,
  MAX_TOON_ACCURACY,
  MAX_TRACK_EXP_BONUS,
  SUPERVISOR_EVASION,
  TRACK_BASE_ACCURACY,
  applyAccuracySoftCap,
  getAccuracyMultiLureBonus,
} from '../cogAccuracy';

type AttackTrack = 'trap' | 'lure' | 'sound' | 'throw' | 'squirt' | 'drop';
const UNIFORM_TRACKS: AttackTrack[] = ['trap', 'sound', 'throw', 'squirt', 'drop'];
const trackOf = (id: AttackTrack) => gagTracks.find(track => track.id === id)!;

// Evasion above level 12 has not been confirmed in game.
const isSpeculativeLevel = (level: number) => level > 12;

const SUPERVISORS = [
  { name: 'Foreman', ids: ['factory_scrap', 'factory_steel'], img: '/images/foreman.webp' },
  { name: 'Auditor', ids: ['mint_coin', 'mint_bullion'], img: '/images/auditor.webp' },
  { name: 'Clerk', ids: ['office_junior', 'office_senior'], img: '/images/clerk.webp' },
  { name: 'President', ids: ['golf_fairway', 'golf_fringe'], img: '/images/president.webp' },
];


const ORGANIC_ICON = '/external/static/assets/gags/ttr/organic.webp';

const SECTIONS = ['Base', 'Stuns', 'Lure'] as const;
type Section = (typeof SECTIONS)[number];

const format = (value: number) => Number(value.toFixed(1)).toString();
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

const TABLE = 'w-full text-center text-sm tabular-nums';
const BODY_ROW = 'border-t border-white/10 even:bg-white/[0.03] transition-colors hover:bg-sky-400/15';
const ROW_HEAD = 'border-r border-white/15 bg-white/[0.06] font-black text-white';
// Levels 8-14 are the ones players fight most, so their rows are tinted.
const isCommonLevel = (level: number) => level >= 8 && level <= 14;
const levelRowClass = (level: number) => isCommonLevel(level) ? 'border-t border-white/10 bg-sky-400/[0.09] transition-colors hover:bg-sky-400/20' : BODY_ROW;
const levelHeadClass = (level: number) => isCommonLevel(level) ? 'border-r border-white/15 bg-sky-400/20 font-black text-sky-100' : ROW_HEAD;

function Star() {
  return <span className="text-amber-300" title="Unconfirmed, speculative value">*</span>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-snug text-white/55">{children}</p>;
}

function Heading({ children, className = 'text-white/80', color }: { children: ReactNode; className?: string; color?: string }) {
  return <h3 className={`mb-1 text-sm font-black uppercase tracking-wide ${color ? '' : className}`} style={color ? { color } : undefined}>{children}</h3>;
}

function GagIcon({ track, gagIndex }: { track: AttackTrack; gagIndex: number }) {
  const data = trackOf(track);
  const gag = data.gags[gagIndex];
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]" style={{ backgroundColor: data.color }} title={gag.name}>
      <img src={staticUrl(`/external/static/assets/gags/${gag.image}`)} alt={gag.name} className="h-full w-full object-contain drop-shadow-md" loading="lazy" />
    </span>
  );
}

function StatCard({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-1 py-1.5 text-center">
      <div className="text-lg font-black tabular-nums text-lime-300">{value}</div>
      <div className="text-[10px] font-bold leading-tight text-white/60">{label}</div>
    </div>
  );
}

function LureCell({ gagIndex }: { gagIndex: number }) {
  const value = TRACK_BASE_ACCURACY.lure[gagIndex];
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-md bg-white/[0.04] py-1.5 font-black leading-tight tabular-nums">
      <GagIcon track="lure" gagIndex={gagIndex} />
      <span className="text-sm text-white">{value}%</span>
      <span className="flex items-center gap-0.5 text-[11px] text-lime-300" title="Organic Lure">
        <img src={staticUrl(ORGANIC_ICON)} alt="Organic" className="h-3 w-3 object-contain" />
        {Math.min(value + 10, MAX_TOON_ACCURACY)}%
      </span>
    </div>
  );
}

const EXP_BONUS_PER_GAG_LEVEL = MAX_TRACK_EXP_BONUS / 6;

const EVASION_ROWS = [
  ...Array.from({ length: 20 }, (_, index) => ({
    key: String(index + 1), label: `Level ${index + 1}`, raw: COG_DEFENSE[index + 1], speculative: isSpeculativeLevel(index + 1), image: undefined as string | undefined,
  })),
  ...SUPERVISORS.map(supervisor => ({
    key: supervisor.name, label: supervisor.name, raw: SUPERVISOR_EVASION[supervisor.ids[0]], speculative: true, image: supervisor.img,
  })),
];

// Level tables open with level 8 at the top; lower levels are a scroll up.
const SCROLL_START_LEVEL = 8;
function useScrollToLevel(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const container = ref.current;
    const header = container?.querySelector('thead');
    const startRow = container?.querySelector<HTMLElement>(`[data-level="${SCROLL_START_LEVEL}"]`);
    if (container && header && startRow) container.scrollTop = startRow.offsetTop - header.offsetHeight;
  }, [ref]);
}

// Level tables start 10rem tall and grow into spare space. Tab content never shrinks
// below its own height, so on short screens the tab scrolls instead of overlapping.
function CogEvasion({ expBonus }: { expBonus: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollToLevel(scrollRef);
  return (
    <div className="flex flex-1 flex-col">
      <Heading className="text-rose-300">Cog Evasion</Heading>
      <div ref={scrollRef} className="custom-scrollbar relative h-40 min-h-40 grow overflow-y-auto rounded-md border border-white/10" tabIndex={0} aria-label="Cog evasion by level">
        <table className={`${TABLE} table-fixed`}>
          <thead className="sticky top-0 z-10 bg-[#13253b]"><tr className="text-[11px] text-white/60">
            <th scope="col" className="w-[44%] border-r border-white/15 py-1.5 text-white">Cog</th>
            <th scope="col" className="py-1.5 text-rose-300">Evasion</th>
            <th scope="col" className="py-1.5 text-lime-300">+{expBonus} EXP</th>
          </tr></thead>
          <tbody>{EVASION_ROWS.map(row => {
            const net = expBonus - row.raw;
            return (
              <tr key={row.key} data-level={row.key} className={levelRowClass(Number(row.key))}>
                <th scope="row" className={`${levelHeadClass(Number(row.key))} py-1`}>
                  <span className="flex items-center justify-center gap-2">
                    {row.image && <img src={staticUrl(row.image)} alt="" className="h-6 w-6 object-contain" />}
                    {row.label}
                  </span>
                </th>
                <td className="font-black text-rose-300">{signed(-row.raw)}%{row.speculative && <Star />}</td>
                <td className={`font-black ${net > 0 ? 'text-lime-300' : net < 0 ? 'text-rose-300' : 'text-white'}`}>{signed(net)}%</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <Note>The last column is your net accuracy change with the selected EXP bonus.</Note>
    </div>
  );
}

function BaseSection() {
  // Highest gag unlocked (0-6 index) in the track; drives the Cog Evasion EXP column.
  const [expIndex, setExpIndex] = useState(6);
  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
        <div className="text-sm font-black text-white">
          Gag <span className="text-lime-300">+ EXP</span> <span className="text-rose-300">− Evasion</span> <span className="text-sky-300">+ Bonuses</span>
        </div>
        <div className="text-[11px] font-bold text-white/55">Caps at {MAX_TOON_ACCURACY}% · overflow adds 0.04% per point<Star /></div>
      </div>

      <div>
        <Heading>Gag Accuracy</Heading>
        <div className="grid grid-cols-5 gap-1">
          {UNIFORM_TRACKS.map(track => (
            <div key={track} className="flex flex-col items-center gap-0.5 rounded-md bg-white/[0.04] py-1.5" title={`${trackOf(track).name}: ${TRACK_BASE_ACCURACY[track][0]}% for every gag`}>
              <GagIcon track={track} gagIndex={5} />
              <span className="text-sm font-black tabular-nums text-white">{TRACK_BASE_ACCURACY[track][0]}%</span>
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {TRACK_BASE_ACCURACY.lure.map((_, gagIndex) => <LureCell key={gagIndex} gagIndex={gagIndex} />)}
        </div>
      </div>

      <div>
        <Heading className="text-lime-300">EXP Bonus</Heading>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="EXP bonus used in the Cog Evasion table">
          {Array.from({ length: 7 }, (_, index) => {
            const selected = expIndex === index;
            return (
              <button key={index} type="button" aria-pressed={selected} onClick={() => setExpIndex(index)} title={`Highest gag unlocked: level ${index + 1}`}
                className={`flex cursor-pointer flex-col items-center rounded-md border py-1 transition ${selected ? 'border-lime-200 bg-lime-400' : 'border-transparent bg-white/[0.04] hover:bg-white/10'}`}>
                <span className={`text-[10px] font-black ${selected ? 'text-[#071527]/70' : 'text-white/50'}`}>{index === 6 ? 'Maxed' : `Lv ${index + 1}`}</span>
                <span className={`text-sm font-black tabular-nums ${selected ? 'text-[#071527]' : 'text-lime-300'}`}>+{index * EXP_BONUS_PER_GAG_LEVEL}</span>
              </button>
            );
          })}
        </div>
        <Note>Based on the highest gag unlocked in the track. Pick one to update the table below.</Note>
      </div>

      <CogEvasion expBonus={expIndex * EXP_BONUS_PER_GAG_LEVEL} />
    </div>
  );
}

// Lure tiers span the gag row in order: $1 + Small Magnet, $5 + Big Magnet, then the rest.
const LURE_TIER_SIZES = [2, 2, 3];
const TIER_LINE = 'bg-white/45';

// Bracket under a tier: a tick up to each gag, a bar joining them, and a stem to the label.
function TierBracket({ tier, size }: { tier: number; size: number }) {
  // Inset the bar to the centres of the first and last gag (columns share the row's 0.25rem gap).
  const inset = `calc((100% - ${size - 1} * 0.25rem) / ${size} / 2)`;
  return (
    <div className="flex flex-col items-center" style={{ gridColumn: `span ${size} / span ${size}` }}>
      <div className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: size }, (_, index) => <span key={index} className={`mx-auto h-1.5 w-px ${TIER_LINE}`} />)}
      </div>
      <div className={`h-px self-stretch ${TIER_LINE}`} style={{ marginInline: inset }} />
      <span className={`h-1.5 w-px ${TIER_LINE}`} />
      <span className="text-[10px] font-black uppercase leading-tight text-white/75">Tier {tier}</span>
    </div>
  );
}

// Examples use level 13, where maxed EXP (+60) cancels its evasion (60), so the result
// is just base + bonus with the soft cap applied.
const EXAMPLE_LEVEL = 13;

// Example combos (Lure gag indexes) and why each extra Lure adds what it does.
// Group Lures are used because the magnets and goggles are easy to tell apart.
const LURE_EXAMPLES = [
  { combo: [5, 5], reason: 'same tier' },
  { combo: [5, 3], reason: '1 tier lower' },
  { combo: [5, 1], reason: '2 tiers lower' },
  { combo: [5, 3, 1], reason: '1 & 2 tiers lower' },
  { combo: [5, 5, 5, 5], reason: '4 of same tier' },
  { combo: [5, 4], reason: "single & group don't mix" },
];

function getExampleBonus(combo: number[]) {
  const lures = combo.map(gagIndex => ({ trackId: 'lure', gagIndex, variant: 'base' as const, target: 'single' as const }));
  const baseline = lures.reduce((highest, lure) => (lure.gagIndex > highest.gagIndex ? lure : highest));
  return { base: TRACK_BASE_ACCURACY.lure[baseline.gagIndex], bonus: getAccuracyMultiLureBonus(lures, baseline) };
}

// A group Lure gets +10% for the first trapped Cog and +5% for each one after.
const trapBonus = (trappedCogs: number) => 10 + (trappedCogs - 1) * 5;

const TRAP_EXAMPLES = [
  { title: 'single Lure + Trap', lure: 4, traps: [5] },
  { title: 'group Lure + 3 Traps', lure: 5, traps: [5, 5, 5] },
];

function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="mb-1 text-[10px] font-black uppercase tracking-wide text-white/60">{children}</h4>;
}

// One worked example: title, the gags used, then base + bonus → hit chance at EXAMPLE_LEVEL.
function ExampleCard({ title, icons, base, bonus }: { title: string; icons: { track: AttackTrack; gagIndex: number }[]; base: number; bonus: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-white/[0.04] px-1 py-1.5 text-center">
      <span className="text-[10px] font-black uppercase leading-tight tracking-wide text-white/80">{title}</span>
      <span className="flex gap-1">
        {icons.map((icon, index) => <GagIcon key={index} track={icon.track} gagIndex={icon.gagIndex} />)}
      </span>
      <span className="text-sm font-black leading-tight tabular-nums">
        <span className="text-white">{base}%</span>
        <span className={bonus ? 'text-lime-300' : 'text-white/40'}> + {bonus}%</span>
        <span className="text-sky-300"> → {format(applyAccuracySoftCap(base + MAX_TRACK_EXP_BONUS - COG_DEFENSE[EXAMPLE_LEVEL] + bonus))}%</span>
      </span>
    </div>
  );
}


// One section of the Lure tab: a heading in the section colour, then its content.
function Panel({ title, color = 'rgba(255,255,255,0.8)', children }: { title: string; color?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <Heading color={color}>{title}</Heading>
      {children}
    </section>
  );
}

function LureSection() {
  // A line between each section; the gap above each line keeps it from crowding the content.
  return (
    <div className="divide-y divide-white/20 [&>*:not(:last-child)]:pb-3 [&>*+*]:pt-3">
      <Panel title="Base Accuracy">
        <div className="grid grid-cols-7 gap-1">
          {TRACK_BASE_ACCURACY.lure.map((_, gagIndex) => <LureCell key={gagIndex} gagIndex={gagIndex} />)}
        </div>
        <div className="grid grid-cols-7 gap-1" aria-label="Lure tiers">
          {LURE_TIER_SIZES.map((size, index) => <TierBracket key={index} tier={index + 1} size={size} />)}
        </div>
      </Panel>

      <Panel title="Lure Bonus" color={trackOf('lure').color}>
        <div className="grid grid-cols-3 gap-1">
          <StatCard value="+20%" label="same tier" />
          <StatCard value="+15%" label="1 tier lower" />
          <StatCard value="+10%" label="2 tiers lower" />
        </div>
        <Note>Each extra Lure of the same kind adds a bonus to the highest.</Note>
        <div className="mt-2">
          <SubHeading>Examples</SubHeading>
          <div className="grid grid-cols-2 gap-1">
            {LURE_EXAMPLES.map(({ combo, reason }) => {
              const { base, bonus } = getExampleBonus(combo);
              return (
                <ExampleCard key={combo.join('-')} title={reason} base={base} bonus={bonus}
                  icons={combo.map(gagIndex => ({ track: 'lure' as const, gagIndex }))} />
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="Trap Bonus" color={trackOf('trap').color}>
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map(count => (
            <StatCard key={count} value={`+${10 + (count - 1) * 5}%`} label={`${count} Trap${count > 1 ? 's' : ''}`} />
          ))}
        </div>
        <div className="mt-2">
          <SubHeading>Examples</SubHeading>
          <div className="grid grid-cols-2 gap-1">
            {TRAP_EXAMPLES.map(example => (
              <ExampleCard key={example.title} title={example.title} base={TRACK_BASE_ACCURACY.lure[example.lure]}
                bonus={trapBonus(example.traps.length)} icons={[{ track: 'lure' as const, gagIndex: example.lure }, ...example.traps.map(gagIndex => ({ track: 'trap' as const, gagIndex }))]} />
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

const STUN_TRACKS = ['throw', 'squirt', 'drop'] as const;
// Weakest damaging hit (Bike Horn, Squirting Flower). A Cog can only take as many
// stuns as it survives: level 1 dies after 2 hits, level 2 after 3.
const WEAKEST_HIT_DAMAGE = 4;
const maxStuns = (level: number) => Math.floor((COG_HEALTH[level] - 1) / WEAKEST_HIT_DAMAGE);
const STUN_LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);

function StunSection() {
  const [track, setTrack] = useState<(typeof STUN_TRACKS)[number]>('drop');
  const base = TRACK_BASE_ACCURACY[track][0];
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useScrollToLevel(tableScrollRef);
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div>
        <div className="grid grid-cols-3 gap-1">
          <StatCard value="+25%" label="per earlier gag that hit" />
          <StatCard value="+50%" label="per Trap set off" />
          <StatCard value={`+${TOONS_HIT_BONUS}%`} label="Toons Hit SOS" />
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <Heading>Hit Chance After Stuns</Heading>
        <div className="grid grid-cols-3 gap-1">
          {STUN_TRACKS.map(id => (
            <button key={id} type="button" aria-pressed={track === id} onClick={() => setTrack(id)}
              className={`cursor-pointer rounded-md border py-1 text-xs font-black transition ${track === id ? 'border-white/40 text-[#071527]' : 'border-white/10 bg-black/20 text-white/60 hover:bg-white/10 hover:text-white'}`}
              style={track === id ? { backgroundColor: trackOf(id).color } : undefined}>{trackOf(id).name}</button>
          ))}
        </div>
        <div ref={tableScrollRef} className="custom-scrollbar relative mt-1.5 mb-1 h-40 min-h-40 grow overflow-y-auto rounded-md border border-white/10" tabIndex={0} aria-label="Hit chance by Cog level">
          <table className={`${TABLE} table-fixed`}>
            <thead className="sticky top-0 z-10 bg-[#13253b]"><tr className="text-[11px] text-white/60">
              <th scope="col" className="border-r border-white/15 py-1.5 text-white">Lvl</th>
              {[0, 1, 2, 3].map(stuns => <th key={stuns} scope="col" className="py-1.5">{stuns === 0 ? 'No stun' : `${stuns} stun${stuns > 1 ? 's' : ''}`}</th>)}
            </tr></thead>
            <tbody>{STUN_LEVELS.map(level => (
              <tr key={level} data-level={level} className={levelRowClass(level)}>
                <th scope="row" className={`${levelHeadClass(level)} py-1`}>{level}{isSpeculativeLevel(level) && <Star />}</th>
                {[0, 1, 2, 3].map(stuns => {
                  if (stuns > maxStuns(level)) return <td key={stuns} className="font-black text-white/30" title="The Cog can't survive this many hits">—</td>;
                  const chance = applyAccuracySoftCap(base + MAX_TRACK_EXP_BONUS - COG_DEFENSE[level] + stuns * 25);
                  return <td key={stuns} className={`font-black ${chance >= MAX_TOON_ACCURACY ? 'text-lime-300' : chance >= 75 ? 'text-white' : 'text-rose-300'}`}>{format(chance)}%</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AccuracyReference() {
  const [section, setSection] = useState<Section>('Base');
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-3 gap-1" role="group" aria-label="Accuracy reference section">
        {SECTIONS.map(name => (
          <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)}
            className={`cursor-pointer rounded-md border py-1 text-sm font-black transition ${section === name ? 'border-lime-200 bg-lime-400 text-[#071527]' : 'border-white/10 bg-black/20 text-white/60 hover:border-white/25 hover:bg-white/10 hover:text-white'}`}>
            {name}
          </button>
        ))}
      </div>
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {section === 'Base' && <BaseSection />}
        {section === 'Lure' && <LureSection />}
        {section === 'Stuns' && <StunSection />}
        {/* The Lure tab shows no unconfirmed values, so it skips the disclaimer. */}
        {section !== 'Lure' && <p className="mt-3 shrink-0 text-center text-[11px] font-bold text-white/45"><Star /> Unconfirmed, speculative value</p>}
      </div>
    </div>
  );
}
