import { useEffect, useRef, useState } from 'react';
import { staticUrl } from './calculatorAssets';
import { CEO_OIL_HEALTH_OPTIONS, getCeoOilCanHealth, getCeoOilCanHealthPercent } from './ceoOil';
import type { FieldOfficeDefense } from './gagDamage';
import {
  COG_HEALTH,
  VALIDATED_GAG_COMBOS,
  getComboGagData,
  getComboGagDamage,
  getComboGagTrack,
  type GagCombo,
} from './gagCombos';

const GAG_ASSET_ROOT = 'https://toonhq.org/static/assets/gags/';
const SAVED_LEVEL_KEY = 'toonhqplus:gag-combos:level';

function gagImage(path: string) {
  return `${GAG_ASSET_ROOT}${path}`;
}

function ComboRow({ combo, tooltipBelow = false }: { combo: GagCombo; tooltipBelow?: boolean }) {
  return (
    <div className="relative flex min-w-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-black/20 p-1">
      {combo.lured && (
        <img
          src={gagImage('ttr/1_bill.png')}
          alt="Lured"
          className="absolute -left-3 top-1/2 z-20 h-7 w-9 -translate-y-1/2 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
          title="Lured"
        />
      )}
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1">
        {combo.gags.map((gag, index) => {
          const data = getComboGagData(gag)!;
          const track = getComboGagTrack(gag)!;
          return (
            <div
              key={`${gag.trackId}-${gag.gagIndex}-${Number(gag.organic)}-${index}`}
              className="gag-btn-base group/combo-gag min-w-0 overflow-visible shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
              style={{ backgroundColor: track.color, borderColor: 'transparent', width: '100%' }}
            >
              <img
                src={gagImage(data.image)}
                alt={data.name}
                className="object-contain drop-shadow-md"
                loading="lazy"
              />
              {gag.organic && (
                <img
                  src={gagImage('ttr/organic.webp')}
                  alt="Organic"
                  className="pointer-events-none absolute -right-2 -top-2 z-10 h-6 w-6 object-contain drop-shadow-[0_1px_1px_#000]"
                  style={{ height: '1.5rem', width: '1.5rem' }}
                />
              )}
              <div className={`pointer-events-none absolute left-1/2 z-30 hidden w-max max-w-40 -translate-x-1/2 rounded-md border border-white/15 bg-[#020712] px-2 py-1.5 text-center shadow-xl group-hover/combo-gag:block ${tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                <div className="text-[10px] font-black leading-tight text-white">
                  {gag.organic ? 'Organic ' : ''}{data.name}
                </div>
                <div className="mt-0.5 text-[9px] font-bold text-lime-300">
                  {getComboGagDamage(gag)} damage
                </div>
              </div>
            </div>
          );
        })}
        {Array.from({ length: 4 - combo.gags.length }, (_, index) => (
          <div key={`empty-${index}`} className="h-12 min-w-0" aria-hidden="true" />
        ))}
      </div>
      <div
        className="w-12 shrink-0 px-2 text-right text-[10px] font-black tabular-nums text-white"
        title={`${combo.damage} total damage`}
      >
        {combo.damage}
      </div>
    </div>
  );
}

function OilCanDamageReference() {
  return (
    <div className="custom-scrollbar flex min-h-0 flex-col justify-center gap-3 overflow-y-auto text-sm">
      <div className="flex items-center justify-center gap-2 text-white/65">
        <img src={staticUrl('/images/ceo-oil-can.png')} alt="" className="h-8 w-8 -rotate-[32deg] object-contain" />
        <span>HP remaining after feeding</span>
      </div>
      {[false, true].map(vip => {
        const options = CEO_OIL_HEALTH_OPTIONS.filter(option => option.cans > 0 && option.vip === vip);
        return (
          <div key={String(vip)}>
            <h3 className="mb-1.5 text-center text-base font-black text-white">{vip ? '2.0 Cogs' : 'Regular Cogs'}</h3>
            <table className="w-full text-center tabular-nums">
              <thead className="bg-white/[0.06]">
                <tr className="text-[11px] text-white/60">
                  <th scope="col" className="border-r border-white/15 px-2 py-1.5 align-middle text-white">Level</th>
                  <th scope="col" className="py-1.5 align-middle text-green-400">Full HP</th>
                  {options.map(option => (
                    <th key={option.label} scope="col" className="py-1.5 align-middle" aria-label={`${option.label}, ${getCeoOilCanHealthPercent(option)}% HP remaining`}>
                      <span className="flex items-center justify-center gap-1 text-white">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: option.color! }} />
                        {getCeoOilCanHealthPercent(option)}%
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[10, 11, 12, 13, 14].map(level => (
                  <tr key={level} className="border-t border-white/10 even:bg-white/[0.03] transition-colors hover:bg-sky-400/15">
                    <th scope="row" className="border-r border-white/15 bg-white/[0.06] px-2 py-2 font-black text-white">{level}</th>
                    <td className="font-black text-green-400">{COG_HEALTH[level]}</td>
                    {options.map(option => (
                      <td key={option.label} className="font-black" style={{ color: option.color! }}>
                        {getCeoOilCanHealth(COG_HEALTH[level], option)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function CogHealthReference() {
  const [defenseIndex, setDefenseIndex] = useState(0);
  const [defenseMenuOpen, setDefenseMenuOpen] = useState(false);
  const defenseMenuRef = useRef<HTMLDivElement>(null);
  const options: { label: string; percent: FieldOfficeDefense }[] = [
    { label: 'Normal Defense', percent: 0 },
    { label: '10% · 1-Star Field Office', percent: 10 },
    { label: '15% · 2-Star Field Office', percent: 15 },
    { label: '20% · 3-Star Field Office', percent: 20 },
    { label: '25% · 4-Star Field Office', percent: 25 },
    { label: '25% · Factory Foreman Cogs', percent: 25 },
  ];
  const defense = options[defenseIndex].percent;
  useEffect(() => {
    if (!defenseMenuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!defenseMenuRef.current || !event.composedPath().includes(defenseMenuRef.current)) setDefenseMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDefenseMenuOpen(false);
        defenseMenuRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [defenseMenuOpen]);
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div ref={defenseMenuRef} className="relative shrink-0">
        <button type="button" aria-label="Cog health defense" aria-expanded={defenseMenuOpen} onClick={() => setDefenseMenuOpen(open => !open)}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md py-1 text-base font-semibold text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          {defense > 0 && <img alt="" src={staticUrl('/images/statuses/Statuseffect_defenseup_Cog.webp')} className="h-5 w-5 shrink-0 object-contain" />}
          {defense === 0 ? 'Normal Defense' : `${defense}% Defense`}
          <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-5 w-5 shrink-0 text-white/60 transition ${defenseMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4" /></svg>
        </button>
        {defenseMenuOpen && <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-white/15 bg-[#102238] p-1 shadow-xl">
          {options.map((option, index) => <button key={option.label} type="button" aria-pressed={defenseIndex === index}
            onClick={() => { setDefenseIndex(index); setDefenseMenuOpen(false); }}
            className={`w-full cursor-pointer rounded-md px-2 py-2 text-left text-sm font-bold transition ${defenseIndex === index ? 'bg-blue-500/25 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>{option.label}</button>)}
        </div>}
      </div>
      <div className="custom-scrollbar min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3" aria-label="Cog health by level">
          {[0, 10].map(offset => (
            <table key={offset} className="w-full table-fixed text-center text-lg tabular-nums">
              <thead className="bg-white/[0.06]"><tr className="text-sm text-white/60">
                <th scope="col" className="h-12 w-[40%] border-r border-white/15 py-2 text-white">Level</th>
                <th scope="col" className="h-12 py-2 text-green-400">{defense ? 'Effective HP' : 'HP'}</th>
              </tr></thead>
              <tbody>{Array.from({ length: 10 }, (_, index) => offset + index + 1).map(level => (
                <tr key={level} className="border-t border-white/10 even:bg-white/[0.03] transition-colors hover:bg-sky-400/15">
                  <th scope="row" className="border-r border-white/15 bg-white/[0.06] py-2 font-black text-white">{level}</th>
                  <td className="font-black text-green-400">{Math.ceil(COG_HEALTH[level] / (1 - defense / 100))}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>
    </div>
  );
}

const REFERENCE_TITLES = ['Common Gag Combos', 'Cog Healths', 'Oil Can Damage'];
const SAVED_REFERENCE_KEY = 'toonhqplus:gag-reference:view';

export function GagCombosPanel() {
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const referenceMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!referenceMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!referenceMenuRef.current || !event.composedPath().includes(referenceMenuRef.current)) setReferenceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReferenceMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [referenceMenuOpen]);
  const [referenceView, setReferenceView] = useState(() => {
    const saved = Number(localStorage.getItem(SAVED_REFERENCE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < REFERENCE_TITLES.length ? saved : 0;
  });
  useEffect(() => {
    localStorage.setItem(SAVED_REFERENCE_KEY, String(referenceView));
  }, [referenceView]);
  const [level, setLevel] = useState(() => {
    const saved = Number(localStorage.getItem(SAVED_LEVEL_KEY));
    return Number.isInteger(saved) && saved >= 1 && saved <= 20 ? saved : 12;
  });

  const selectLevel = (nextLevel: number) => {
    setLevel(nextLevel);
    localStorage.setItem(SAVED_LEVEL_KEY, String(nextLevel));
  };

  return (
    <section className="flex h-full min-h-0 min-w-[380px] w-full flex-col rounded-xl border border-white/5 bg-[#082416] p-3 shadow-inner">
      <div className="mx-auto mb-2 flex w-full shrink-0 items-center justify-between gap-1">
        <button type="button" aria-label="Previous reference view" onClick={() => setReferenceView(view => (view + REFERENCE_TITLES.length - 1) % REFERENCE_TITLES.length)} className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/20 font-black text-white/65 transition hover:bg-white/10 hover:text-white">←</button>
        <div ref={referenceMenuRef} className="relative min-w-0 flex-1">
          <button type="button" aria-label="Reference view" aria-expanded={referenceMenuOpen} onClick={() => setReferenceMenuOpen(open => !open)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md py-1 text-xl font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            {REFERENCE_TITLES[referenceView]}
            <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-5 w-5 shrink-0 text-white/60 transition ${referenceMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          {referenceMenuOpen && <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-white/15 bg-[#102238] p-1 shadow-xl">
            {REFERENCE_TITLES.map((title, index) => <button key={title} type="button" aria-pressed={referenceView === index}
              onClick={() => { setReferenceView(index); setReferenceMenuOpen(false); }}
              className={`w-full cursor-pointer rounded-md px-2 py-2 text-left text-sm font-bold transition ${referenceView === index ? 'bg-blue-500/25 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>{title}</button>)}
          </div>}
        </div>
        <button type="button" aria-label="Next reference view" onClick={() => setReferenceView(view => (view + 1) % REFERENCE_TITLES.length)} className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/20 font-black text-white/65 transition hover:bg-white/10 hover:text-white">→</button>
      </div>
      <div className="-mx-3 mb-3 shrink-0 border-b border-white/15" />
      {referenceView !== 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          {referenceView === 1 ? <CogHealthReference /> : <OilCanDamageReference />}
        </div>
      ) : <>
      <div className="grid w-full shrink-0 grid-cols-7 gap-1" aria-label="Select Cog level">
        {Array.from({ length: 20 }, (_, index) => index + 1).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => selectLevel(option)}
            className={`h-7 min-w-0 cursor-pointer rounded-md border text-xs font-black transition ${level === option
                ? 'border-lime-200 bg-lime-400 text-[#071527]'
                : 'border-white/10 bg-black/20 text-white/60 hover:border-white/25 hover:bg-white/10 hover:text-white'
              }`}
            aria-pressed={level === option}
            aria-label={`Level ${option}, ${COG_HEALTH[option]} HP`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-2 flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => selectLevel(level - 1)}
          disabled={level === 1}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/20 text-base font-black text-white/65 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
          aria-label="Previous Cog level"
        >
          ←
        </button>
        <p className="text-center text-base font-black text-white">
          Level {level} <span className="text-lime-300">· {COG_HEALTH[level]} HP</span>
        </p>
        <button
          type="button"
          onClick={() => selectLevel(level + 1)}
          disabled={level === 20}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/20 text-base font-black text-white/65 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
          aria-label="Next Cog level"
        >
          →
        </button>
      </div>
      <div className="combo-reference-list custom-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto py-1 pl-3 pr-1" style={{ scrollbarGutter: 'stable' }}>
        <div className="flex flex-col gap-1.5">
          {VALIDATED_GAG_COMBOS[level].map((combo, comboIndex) => (
            <ComboRow key={comboIndex} combo={combo} tooltipBelow={comboIndex === 0} />
          ))}
        </div>
      </div>
      </>}
    </section>
  );
}
