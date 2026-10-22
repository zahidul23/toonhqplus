import { useEffect, useState } from 'react';
import { getNativeBridge } from './nativeBridge';

export function NativeConnectionStatus() {
  const [state, setState] = useState(() => getNativeBridge().state);
  useEffect(() => getNativeBridge().subscribe(update => setState(update.state)), []);
  if (state.connected) return null;
  return <p role="status" className="mb-2 rounded-md bg-black/20 px-2 py-1.5 text-xs text-green-100/80">
    {state.reason || 'Live history is paused while ToonHQ reconnects.'}
  </p>;
}
