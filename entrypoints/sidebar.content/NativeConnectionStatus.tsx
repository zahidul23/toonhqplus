import { useEffect, useState } from 'react';
import { getNativeBridge, GROUPS_PAGE_LINK_TEXT, GROUPS_PAGE_PATH } from './nativeBridge';

/** Renders a status message, linking any mention of the ToonHQ Groups page. */
export function NativeStatusText({ text }: { text: string }) {
  const at = text.indexOf(GROUPS_PAGE_LINK_TEXT);
  if (at < 0) return <>{text}</>;
  return <>
    {text.slice(0, at)}
    <a href={GROUPS_PAGE_PATH} className="underline underline-offset-2 hover:text-green-50">{GROUPS_PAGE_LINK_TEXT}</a>
    {text.slice(at + GROUPS_PAGE_LINK_TEXT.length)}
  </>;
}

const STATUS_DELAY_MS = 1000;

export function NativeConnectionStatus() {
  const [state, setState] = useState(() => getNativeBridge().state);
  useEffect(() => getNativeBridge().subscribe(update => setState(update.state)), []);
  const hidden = state.connected || !!state.reason?.includes(GROUPS_PAGE_LINK_TEXT);
  const [delayed, setDelayed] = useState(false);
  // Reconnects are usually instant; only show the message if one drags on.
  useEffect(() => {
    if (hidden) { setDelayed(false); return; }
    const timer = setTimeout(() => setDelayed(true), STATUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hidden, state.reason]);
  if (hidden || !delayed) return null;
  return <p role="status" className="mb-2 rounded-md bg-black/20 px-2 py-1.5 text-xs text-green-100/80">
    <NativeStatusText text={state.reason || 'Live history is paused while ToonHQ reconnects.'} />
  </p>;
}
