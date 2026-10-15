import { useId, useState } from 'react';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { GagTooltip } from '../GagButton';
import type { GagTooltipContent, GagTooltipPosition } from '../GagButton';

export function SelectedGagSlot({ children, className, style, content, onClick }: {
  children: ReactNode;
  className: string;
  style: CSSProperties;
  content?: GagTooltipContent;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  const id = useId();
  const [position, setPosition] = useState<GagTooltipPosition | null>(null);
  const show = (element: HTMLElement) => {
    if (!content) return;
    const bounds = element.getBoundingClientRect();
    const below = bounds.top < 150;
    const halfWidth = Math.min(96, (window.innerWidth - 16) / 2);
    setPosition({ below, top: below ? bounds.bottom + 8 : bounds.top - 8,
      left: Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, bounds.left + bounds.width / 2)) });
  };
  return <>
    <button type="button" className={className} style={style}
      aria-label={content ? `Remove ${content.name}` : 'Select gag slot'} aria-describedby={position ? id : undefined}
      onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setPosition(null)}
      onFocus={event => show(event.currentTarget)} onBlur={() => setPosition(null)}
      onKeyDown={event => { if (event.key === 'Escape') setPosition(null); }}
      onClick={event => { setPosition(null); onClick(event); }}>
      {children}
    </button>
    {content && position && <GagTooltip id={id} content={content} position={position} />}
  </>;
}
