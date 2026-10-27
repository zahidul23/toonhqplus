import { useEffect, useId, useRef, useState } from 'react';
import { staticUrl } from './calculatorAssets';
import type { FieldOfficeDefense } from './gagDamage';

export function DefenseSelector({ defense, onChange }: {
  defense: FieldOfficeDefense;
  onChange: (defense: FieldOfficeDefense) => void;
}) {
  const [open, setOpen] = useState(false);
  const [factoryForemanChoice, setFactoryForeman] = useState(false);
  // Clearing defense to None from outside also clears the Factory Foreman pick.
  const factoryForeman = defense > 0 && factoryForemanChoice;
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
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
    <button type="button" aria-label={`Defense: ${defense ? `${defense}%${factoryForeman ? ', Factory Foreman Cogs' : ''}` : 'None'}`}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}
      className={`flex h-8 sm:h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs sm:text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${defense
        ? 'border-blue-400 bg-blue-800 text-white hover:bg-blue-700'
        : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400 hover:bg-slate-700'}`}>
      <img alt="" draggable="false" src={staticUrl('/images/statuses/Statuseffect_defenseup_Cog.webp')} className="h-5 w-5 object-contain" />
      Defense{defense > 0 && ` (${defense}%)`} <span aria-hidden="true">▾</span>
    </button>
    {open && <div id={panelId} className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/15 bg-[#020712] p-3 text-xs text-white shadow-xl">
      <fieldset>
        <legend className="mb-2 font-bold">Defense</legend>
        {[
          ...([0, 10, 15, 20, 25] as const).map((percent, index) => ({ percent, label: percent === 0 ? 'None' : `${index}-Star Field Office`, factory: false })),
          { percent: 25 as const, label: 'Factory Foreman Cogs', factory: true },
        ].map(option => <button key={option.label} type="button" aria-pressed={defense === option.percent && factoryForeman === option.factory} onClick={() => { setFactoryForeman(option.factory); onChange(option.percent); }}
          className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${defense === option.percent && factoryForeman === option.factory ? 'border-blue-400/50 bg-blue-500/25 text-white' : 'border-transparent hover:bg-white/10'}`}>
          <span>{option.label}</span>
          {option.percent > 0 && <span className="ml-auto tabular-nums text-blue-300">{option.percent}%</span>}
        </button>)}
      </fieldset>
    </div>}
  </div>;
}

