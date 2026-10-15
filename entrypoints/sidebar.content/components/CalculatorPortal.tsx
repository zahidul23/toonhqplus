import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const CalculatorPortalContext = createContext<Element | DocumentFragment | null>(null);

export function useCalculatorPortal() {
  return useContext(CalculatorPortalContext) ?? document.body;
}

/** Portals must stay in WXT's shadow root to inherit the extension's styles. */
export function CalculatorPortalProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<Element | DocumentFragment | null>(null);
  useLayoutEffect(() => {
    const node = ref.current?.getRootNode();
    setRoot(node instanceof ShadowRoot ? node : document.body);
  }, []);
  return <CalculatorPortalContext.Provider value={root}>
    <div ref={ref} className="contents">{children}</div>
  </CalculatorPortalContext.Provider>;
}
