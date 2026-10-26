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

export function NativeConnectionStatus() {
  const [state, setState] = useState(() => getNativeBridge().state);
  useEffect(() => getNativeBridge().subscribe(update => setState(update.state)), []);
  if (state.connected) return null;
  return <p role="status" className="mb-2 rounded-md bg-black/20 px-2 py-1.5 text-xs text-green-100/80">
    <NativeStatusText text={state.reason || 'Live history is paused while ToonHQ reconnects.'} />
  </p>;
}
