import { useCalculatorPortal } from './CalculatorPortal';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function useMobileAccuracy() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function AccuracyDetails({ title, onClose, children, desktop }: {
  title: string; onClose: () => void; children: ReactNode; desktop: ReactNode;
}) {
  const root = useCalculatorPortal();
  const mobile = useMobileAccuracy();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!mobile) return;
    const previous = (root instanceof ShadowRoot ? root.activeElement : document.activeElement) as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const controls = dialog?.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (root instanceof ShadowRoot ? root.activeElement : document.activeElement) === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (root instanceof ShadowRoot ? root.activeElement : document.activeElement) === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [mobile, root]);
  if (!mobile) return desktop;
  return createPortal(<div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-4"
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="gag-calculator-tooltip flex max-h-[calc(100dvh-32px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/15 bg-[#081827] shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h3 id={titleId} className="text-sm font-black text-white">{title}</h3>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80">Close</button>
      </div>
      <div className="custom-scrollbar min-h-0 overflow-y-auto p-4">{children}</div>
    </div>
  </div>, root);
}
