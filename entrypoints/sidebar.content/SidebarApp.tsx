import react, { useState, useEffect, useCallback } from 'react';

const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
} as const;

interface ToonData {
  id: number;
  name: string;
  photo?: string;
  note?: string;
  [key: string]: any;
}

function normalize(raw: unknown): ToonData[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') {
      return { id: -1, name: item };
    }
    return item as ToonData;
  });
}

function loadLists(): Promise<{ favorites: ToonData[]; blocked: ToonData[] }> {
  return browser.storage.local
    .get([STORAGE_KEYS.FAVORITES, STORAGE_KEYS.BLOCKED])
    .then((result) => ({
      favorites: normalize(result[STORAGE_KEYS.FAVORITES]),
      blocked: normalize(result[STORAGE_KEYS.BLOCKED]),
    }));
}

function removeFromList(
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  identifier: number | string,
) {
  return browser.storage.local.get(listKey).then((result) => {
    const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
    const next = list.filter((t) => {
      if (typeof identifier === 'number') {
        return t.id !== identifier;
      }
      // treat string as name
      return t.name !== identifier;
    });
    return browser.storage.local.set({ [listKey]: next });
  });
}

function ToonRow({ toon, listKey, refresh, isHovered }: { toon: ToonData; listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]; refresh: () => void; isHovered: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(toon.note || '');

  const saveNote = () => {
    browser.storage.local.get(listKey).then((result) => {
      const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
      const item = list.find((t) => t.id === toon.id);
      if (item) {
        // If empty, delete the note entirely to save space/logic
        if (!noteDraft.trim()) {
          delete item.note;
        } else {
          item.note = noteDraft.trim();
        }
        browser.storage.local.set({ [listKey]: list }).then(refresh);
      }
      setIsEditing(false);
    });
  };

  const rowRef = react.useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (isHovered && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHovered]);

  return (
    <li
      ref={rowRef}
      className={`group relative flex flex-col gap-1 rounded px-2 py-1.5 text-sm text-white transition-colors ${
        isHovered ? 'bg-[#1f8454] shadow-md ring-1 ring-emerald-400' : 'hover:bg-[#10462d]/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {toon.photo && (
            <img src={toon.photo} alt={toon.name} className="h-6 w-6 shrink-0 rounded-full" />
          )}
          <span className="truncate">
            {toon.name}
            {toon.laff != null ? ` (${toon.laff})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setNoteDraft(toon.note || '');
            }}
            className="shrink-0 rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white dark:hover:bg-[#1f8454]"
            title="Edit note"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          <button
            type="button"
            onClick={() => removeFromList(listKey, toon.id).then(refresh)}
            className="shrink-0 rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white dark:hover:bg-[#1f8454]"
            title="Remove from list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>
      {isEditing ? (
        <div className="ml-8 mt-1 flex items-start gap-1.5">
          <textarea
            autoFocus
            rows={1}
            className="w-full flex-1 resize-none overflow-hidden rounded border border-[#1f8454] bg-black/20 px-2 py-1 text-xs text-white placeholder-green-100/30 focus:border-green-400 focus:outline-none"
            placeholder="Add a note..."
            value={noteDraft}
            onChange={(e) => {
              setNoteDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveNote();
              }
              if (e.key === 'Escape') setIsEditing(false);
            }}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
          />
          <button
            onClick={saveNote}
            className="shrink-0 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500"
          >
            Save
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="shrink-0 rounded bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
          >
            Cancel
          </button>
        </div>
      ) : toon.note ? (
        <div className="ml-8 whitespace-pre-wrap text-xs leading-snug text-green-100/80">
          {toon.note}
        </div>
      ) : null}
    </li>
  );
}

export function SidebarApp() {
  const [open, setOpen] = useState(true);
  const [favorites, setFavorites] = useState<ToonData[]>([]);
  const [blocked, setBlocked] = useState<ToonData[]>([]);
  const [hoveredToonId, setHoveredToonId] = useState<string | null>(null);
  const [hoveredToonName, setHoveredToonName] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadLists().then(({ favorites: f, blocked: b }) => {
      setFavorites(f);
      setBlocked(b);
    });
  }, []);

  useEffect(() => {
    const handleHover = (e: Event) => {
      const customEvent = e as CustomEvent;
      setHoveredToonId(customEvent.detail?.id?.toString() || null);
      setHoveredToonName(customEvent.detail?.name || null);
    };
    const handleUnhover = () => {
      setHoveredToonId(null);
      setHoveredToonName(null);
    };

    window.addEventListener('toonhq-plus-toon-hover', handleHover);
    window.addEventListener('toonhq-plus-toon-unhover', handleUnhover);
    
    return () => {
      window.removeEventListener('toonhq-plus-toon-hover', handleHover);
      window.removeEventListener('toonhq-plus-toon-unhover', handleUnhover);
    };
  }, []);

  useEffect(() => {
    refresh();
    const listener = (
      changes: { [key: string]: { newValue?: unknown } },
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (STORAGE_KEYS.FAVORITES in changes)
        setFavorites(
          Array.isArray(changes[STORAGE_KEYS.FAVORITES]?.newValue)
            ? (changes[STORAGE_KEYS.FAVORITES].newValue as ToonData[])
            : [],
        );
      if (STORAGE_KEYS.BLOCKED in changes)
        setBlocked(
          Array.isArray(changes[STORAGE_KEYS.BLOCKED]?.newValue)
            ? (changes[STORAGE_KEYS.BLOCKED].newValue as ToonData[])
            : [],
        );
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  return (
    <div className="fixed top-4 right-4 z-[2147483647] flex max-h-[calc(100vh-2rem)] flex-col gap-2 font-sans">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          {open ? '-' : '+'}
        </button>
      </div>
      {open && (
        <aside className="w-80 flex-1 flex flex-col min-h-0 rounded-lg border border-[#10462d] bg-[#1f8454] p-4 shadow-xl dark:border-[#0a2e1d] dark:bg-[#10462d]">
          <h2 className="mb-3 text-lg shrink-0 font-semibold text-white">
            ToonHQ Plus
          </h2>

          <section className="mb-4 flex-1 flex flex-col min-h-0">
            <h3 className="mb-1.5 shrink-0 text-sm font-medium text-green-50">
              Toony Toons
            </h3>
            <ul className="flex-1 space-y-1 overflow-y-auto rounded border border-[#10462d] bg-[#10462d]/40 p-1.5 shadow-inner dark:border-black/50 dark:bg-black/20">
              {favorites.length === 0 ? (
                <li className="py-1 text-xs text-green-100/70">None yet</li>
              ) : (
                [...favorites].reverse().map((toon) => {
                  const isHovered = (hoveredToonId && toon.id?.toString() === hoveredToonId) || (hoveredToonName === toon.name);
                  return <ToonRow key={toon.id} toon={toon} listKey={STORAGE_KEYS.FAVORITES} refresh={refresh} isHovered={!!isHovered} />;
                })
              )}
            </ul>
          </section>

          <section className="flex-1 flex flex-col min-h-0">
            <h3 className="mb-1.5 shrink-0 text-sm font-medium text-green-50">
              Stinky Toons
            </h3>
            <ul className="flex-1 space-y-1 overflow-y-auto rounded border border-[#10462d] bg-[#10462d]/40 p-1.5 shadow-inner dark:border-black/50 dark:bg-black/20">
              {blocked.length === 0 ? (
                <li className="py-1 text-xs text-green-100/70">None yet</li>
              ) : (
                [...blocked].reverse().map((toon) => {
                  const isHovered = (hoveredToonId && toon.id?.toString() === hoveredToonId) || (hoveredToonName === toon.name);
                  return <ToonRow key={toon.id} toon={toon} listKey={STORAGE_KEYS.BLOCKED} refresh={refresh} isHovered={!!isHovered} />;
                })
              )}
            </ul>
          </section>
        </aside>
      )}
    </div>
  );
}
