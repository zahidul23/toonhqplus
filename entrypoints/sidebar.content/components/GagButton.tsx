import { useCalculatorPortal } from './CalculatorPortal';
import React, { memo, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { staticUrl } from '../calculatorAssets';

export type GagTooltipContent = {
  name: string;
  damage?: number;
  damageLabel?: string;
  accuracy?: number;
  rounds?: number;
  description?: string;
};

export type GagTooltipPosition = { left: number; top: number; below: boolean };

export function SosStars({ count, badge = false }: { count: number; badge?: boolean }) {
  return <span aria-label={`${count} stars`}
    className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-center text-[7px] leading-[9px] text-yellow-300 ${badge
      ? '-top-px rounded-b-md bg-[#10192e]/90 px-1 pb-px'
      : '-top-px -translate-y-1/2 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]'}`}
  >{'★'.repeat(count)}</span>;
}

export function SosCardImage({ src, alt }: { src: string; alt: string }) {
  return <div className="pointer-events-none absolute inset-[3px]">
    <img src={src} alt={alt} draggable="false" className="object-contain drop-shadow-md"
      style={{ width: '100%', height: '100%' }} />
  </div>;
}

export function GagTooltip({ id, content, position }: {
  id: string;
  content: GagTooltipContent;
  position: GagTooltipPosition;
}) {
  const root = useCalculatorPortal();
  return createPortal(
    <div id={id} role="tooltip"
      className="gag-calculator-tooltip pointer-events-none fixed z-[2147483647] w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-white/15 bg-[#020712] px-3 py-2.5 text-center shadow-xl"
      style={{ left: position.left, top: position.top, transform: `translate(-50%, ${position.below ? '0' : '-100%'})` }}>
      <div className="text-xs font-black leading-tight text-white">{content.name}</div>
      {content.damage != null && <div className="mt-1 text-[11px] font-bold text-lime-300">{content.damage} {content.damageLabel ?? 'damage'}</div>}
      {content.accuracy != null && <div className="mt-1 text-[11px] font-bold text-sky-300">{content.accuracy}% accuracy</div>}
      {content.rounds != null && <div className="mt-1 text-[11px] font-bold text-white/70">{content.rounds} rounds</div>}
      {content.description && <div className="mt-1 text-[11px] font-bold text-sky-300">{content.description}</div>}
    </div>, root,
  );
}

export type GagButtonProps = {
  imageSrc: string;
  imageAlt: string;
  imageScale?: number;
  stars?: number;
  color: string;
  title: string;
  tooltipContent?: GagTooltipContent;
  organicTooltipContent?: GagTooltipContent;
  damage?: number;
  disabled?: boolean;
  onClick: (e?: React.MouseEvent) => void;
  overlayTopRight?: React.ReactNode;
  overlayBottom?: React.ReactNode;

  // Cog-specific
  organicTitle?: string;
  onOrganicClick?: (e: React.MouseEvent) => void;
  targetPopup?: React.ReactNode;
  organicTargetPopup?: React.ReactNode;
  hasOrganic?: boolean;
  isOrganicActive?: boolean;
};

export const GagButton = memo(({
  imageSrc,
  imageAlt,
  imageScale = 1,
  stars,
  color,
  title,
  tooltipContent,
  organicTooltipContent,
  disabled = false,
  onClick,
  overlayTopRight,
  overlayBottom,
  organicTitle,
  onOrganicClick,
  targetPopup,
  organicTargetPopup,
  hasOrganic,
  isOrganicActive = false,
}: GagButtonProps) => {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ content: GagTooltipContent; left: number; top: number; below: boolean } | null>(null);
  const showTooltip = (element: HTMLElement, text: string, content?: GagTooltipContent) => {
    const bounds = element.getBoundingClientRect();
    const below = bounds.top < 100;
    const halfWidth = Math.min(96, (window.innerWidth - 16) / 2);
    setTooltip({ content: content ?? { name: text }, below,
      left: Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, bounds.left + bounds.width / 2)),
      top: below ? bounds.bottom + 8 : bounds.top - 8,
    });
  };
  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tooltip]);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={event => { setTooltip(null); onClick(event); }}
        onMouseEnter={event => showTooltip(event.currentTarget, title, tooltipContent)}
        onMouseLeave={() => setTooltip(null)}
        onFocus={event => showTooltip(event.currentTarget, title, tooltipContent)}
        onBlur={() => setTooltip(null)}
        onKeyDown={event => { if (event.key === 'Escape') setTooltip(null); }}
        disabled={disabled}
        className={`gag-btn-base ${disabled ? 'gag-btn-disabled' : 'gag-btn-active'}`}
        style={{ backgroundColor: color, borderColor: color }}
        aria-label={title}
        aria-describedby={tooltip ? tooltipId : undefined}
      >
        {stars != null ? <SosCardImage src={imageSrc} alt={imageAlt} /> : <div className="w-full flex items-center justify-center" style={{ transform: `scale(${imageScale})` }}>
          <img
            src={imageSrc}
            alt={imageAlt}
            draggable="false"
            className="h-12 w-8 rounded-sm object-contain drop-shadow-md transition-transform group-hover:scale-[1.03]"
          />
        </div>}
        {stars != null && <SosStars count={stars} />}
        {overlayBottom && (
          <div className="absolute -bottom-1 inset-x-0 flex justify-center drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
            {overlayBottom}
          </div>
        )}
      </button>

      {/* Positioned relative to outer div so .gag-btn-base img CSS doesn't resize it */}
      {overlayTopRight && (
        <div className="absolute -top-1.5 -right-1.5 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] pointer-events-none z-10">
          {overlayTopRight}
        </div>
      )}

      {hasOrganic && onOrganicClick && (
        <button
          type="button"
          onClick={event => { setTooltip(null); onOrganicClick(event); }}
          onMouseEnter={event => showTooltip(event.currentTarget, organicTitle || `Organic ${title}`, organicTooltipContent)}
          onMouseLeave={() => setTooltip(null)}
          onFocus={event => showTooltip(event.currentTarget, organicTitle || `Organic ${title}`, organicTooltipContent)}
          onBlur={() => setTooltip(null)}
          onKeyDown={event => { if (event.key === 'Escape') setTooltip(null); }}
          className={`absolute -top-2 -right-2 z-20 w-5 h-5 transition-all ${isOrganicActive ? 'opacity-100 grayscale-0 scale-110' : 'opacity-0 group-hover:opacity-100 grayscale'} hover:grayscale-0 hover:scale-125 active:scale-90 cursor-pointer flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
          aria-label={organicTitle || `Organic ${title}`}
          aria-describedby={tooltip ? tooltipId : undefined}
        >
          <img
            src={staticUrl('/external/static/assets/gags/ttr/organic.webp')}
            alt="Organic"
            className="w-full h-full object-contain"
          />
        </button>
      )}

      {targetPopup}
      {organicTargetPopup}
      {tooltip && <GagTooltip id={tooltipId} content={tooltip.content} position={tooltip} />}
    </div>
  );
});
