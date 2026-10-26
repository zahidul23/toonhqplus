import { useEffect, useState } from 'react';
import { getSetting } from './db';
import { SYNC_PENDING_KEY, SYNC_NOTES_SETTING_KEY, syncSavedToonsAfterLocalMutation } from './syncNotes';

export function SavedToonSyncStatus() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    const refresh = () => { void Promise.all([getSetting<string>(SYNC_PENDING_KEY), getSetting<boolean>(SYNC_NOTES_SETTING_KEY)]).then(([value, enabled]) => { if (!disposed) setMessage(enabled ? value || null : null); }).catch(console.error); };
    const changed = (event: Event) => { if ([SYNC_PENDING_KEY, SYNC_NOTES_SETTING_KEY].includes((event as CustomEvent).detail?.key)) refresh(); };
    refresh(); window.addEventListener('toonhqplus-db-changed', changed);
    return () => { disposed = true; window.removeEventListener('toonhqplus-db-changed', changed); };
  }, []);
  if (!message) return null;
  return <p role="status" className="mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100">
    {message}{' '}
    <button type="button" disabled={busy} className="underline disabled:opacity-50" onClick={async () => {
      setBusy(true);
      try { await syncSavedToonsAfterLocalMutation(); } finally { setBusy(false); }
    }}>{busy ? 'Retrying…' : 'Retry sync'}</button>
  </p>;
}
