import { useState } from 'react';
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

export function GagCombosPanel() {
  const [level, setLevel] = useState(() => {
    const saved = Number(localStorage.getItem(SAVED_LEVEL_KEY));
    return Number.isInteger(saved) && saved >= 1 && saved <= 20 ? saved : 12;
  });

  const selectLevel = (nextLevel: number) => {
    setLevel(nextLevel);
    localStorage.setItem(SAVED_LEVEL_KEY, String(nextLevel));
  };

  return (
    <section className="flex min-w-[380px] w-full flex-col rounded-xl border border-white/5 bg-[#082416] p-3 shadow-inner">
      <div className="mb-2">
        <h2 className="text-center text-xl font-black text-white">Common Gag Combos</h2>
      </div>
      <div className="grid w-full grid-cols-5 gap-1" aria-label="Select Cog level">
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
      <div className="mt-2 flex items-center justify-center gap-2">
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
      <div className="custom-scrollbar mt-1 flex max-h-[calc(95vh-19rem)] flex-col gap-1.5 overflow-y-auto px-3 py-1">
        {VALIDATED_GAG_COMBOS[level].map((combo, comboIndex) => (
          <ComboRow key={comboIndex} combo={combo} tooltipBelow={comboIndex === 0} />
        ))}
      </div>
    </section>
  );
}
