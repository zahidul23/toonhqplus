import react, { useState, useEffect, useCallback } from 'react';
import { groupTypes } from './groupTypes';

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

function addToList(
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  toon: ToonData,
) {
  return browser.storage.local.get(listKey).then((result) => {
    const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
    // Use ID as primary key if available, otherwise name
    const exists = toon.id && toon.id !== -1
      ? list.some(t => t.id === toon.id)
      : list.some(t => t.name === toon.name);

    if (exists) return;
    const next = [...list, toon];
    return browser.storage.local.set({ [listKey]: next });
  });
}

function removeFromList(
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  identifier: number | string,
) {
  return browser.storage.local.get(listKey).then((result) => {
    const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
    const next = list.filter((t) => {
      if (typeof identifier === 'number' && identifier !== -1) {
        return t.id !== identifier;
      }
      return t.name !== identifier;
    });
    return browser.storage.local.set({ [listKey]: next });
  });
}

function ToonRow({
  toon,
  favorites,
  blocked,
  activeToonIds,
  refresh,
  isHovered
}: {
  toon: ToonData;
  favorites: ToonData[];
  blocked: ToonData[];
  activeToonIds: number[];
  refresh: () => void;
  isHovered: boolean
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(toon.note || '');

  const favoriteMatch = favorites.find((f) => f.id.toString() === toon.id.toString());
  const blockedMatch = blocked.find((b) => b.id.toString() === toon.id.toString());
  const listKey = favoriteMatch ? STORAGE_KEYS.FAVORITES : blockedMatch ? STORAGE_KEYS.BLOCKED : null;
  const isOwnToon = activeToonIds.includes(Number(toon.id));

  // Determine row background color
  let bgColorClass = isHovered ? 'bg-[#1f8454] shadow-md ring-1 ring-emerald-400' : 'hover:bg-[#10462d]/60';
  let textColorClass = 'text-white';

  if (!isHovered) {
    if (isOwnToon) {
      bgColorClass = 'bg-[#cae9fc] dark:bg-[#cae9fcbd]';
      textColorClass = 'text-[#004a77] dark:text-[#cae9fc]';
    } else if (favoriteMatch) {
      bgColorClass = 'bg-[#e6ffed] dark:bg-[#e6ffed]/20';
      textColorClass = 'text-[#1a7f37] dark:text-[#e6ffed]';
    } else if (blockedMatch) {
      bgColorClass = 'bg-[#ffebe9] dark:bg-[#ad130dde]';
      textColorClass = 'text-[#cf222e] dark:text-[#ffebe9]';
    }
  }

  const saveNote = () => {
    if (!listKey) return;
    browser.storage.local.get(listKey).then((result) => {
      const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
      const item = list.find((t) => t.id.toString() === toon.id.toString());
      if (item) {
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
      className={`group relative flex flex-col gap-1 rounded px-2 py-1.5 text-sm transition-colors ${bgColorClass} ${textColorClass}`}
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
          {!isOwnToon && (listKey ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setNoteDraft(toon.note || (favoriteMatch?.note || blockedMatch?.note) || '');
                }}
                className="shrink-0 rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white dark:hover:bg-[#1f8454]"
                title="Edit note"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
              </button>
              <button
                type="button"
                onClick={() => removeFromList(listKey, toon.id).then(refresh)}
                className="shrink-0 rounded p-1 text-green-100/50 hover:bg-red-500/40 hover:text-white dark:hover:bg-red-900/40"
                title="Remove from list"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => addToList(STORAGE_KEYS.FAVORITES, toon).then(refresh)}
                className="shrink-0 rounded p-1 text-emerald-300/60 hover:bg-emerald-500/40 hover:text-emerald-200"
                title="Favorite Toon"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
              </button>
              <button
                type="button"
                onClick={() => addToList(STORAGE_KEYS.BLOCKED, toon).then(refresh)}
                className="shrink-0 rounded p-1 text-red-300/60 hover:bg-red-500/40 hover:text-red-200"
                title="Block Toon"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
              </button>
            </>
          ))}
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
      ) : (toon.note || (favoriteMatch?.note || blockedMatch?.note)) ? (
        <div className="ml-8 whitespace-pre-wrap text-xs leading-snug text-green-100/80 italic">
          {toon.note || (favoriteMatch?.note || blockedMatch?.note)}
        </div>
      ) : null}
    </li>
  );
}

export function SidebarApp() {
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'toons' | 'history'>('toons');

  const [favorites, setFavorites] = useState<ToonData[]>([]);
  const [blocked, setBlocked] = useState<ToonData[]>([]);
  const [historyGroups, setHistoryGroups] = useState<Record<number, any>>({});
  const [historyToons, setHistoryToons] = useState<Record<number, any>>({});
  const [activeToonIds, setActiveToonIds] = useState<number[]>([]);
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<number | null>(null);

  const [hoveredToonId, setHoveredToonId] = useState<string | null>(null);
  const [hoveredToonName, setHoveredToonName] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadLists().then(({ favorites: f, blocked: b }) => {
      setFavorites(f);
      setBlocked(b);
    });
    navigator.locks.request('toonhqplus-lists', { mode: 'exclusive' }, async (lock) => {
      browser.storage.local.get(['toonhqplus-history', 'toonhqplus-toons', 'toonhqplus-active-toon-ids']).then((result) => {
        setHistoryGroups((result['toonhqplus-history'] as Record<number, any>) || {});
        setHistoryToons((result['toonhqplus-toons'] as Record<number, any>) || {});
        setActiveToonIds((result['toonhqplus-active-toon-ids'] as number[]) || []);
      });
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
      if ('toonhqplus-history' in changes) {
        setHistoryGroups((changes['toonhqplus-history']?.newValue as Record<number, any>) || {});
      }
      if ('toonhqplus-toons' in changes) {
        setHistoryToons((changes['toonhqplus-toons']?.newValue as Record<number, any>) || {});
      }
      if ('toonhqplus-active-toon-ids' in changes) {
        setActiveToonIds((changes['toonhqplus-active-toon-ids']?.newValue as number[]) || []);
      }
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
          {open ? 'Close' : 'ToonHQ+'}
        </button>
      </div>
      {open && (
        <aside className="w-80 flex-1 flex flex-col min-h-0 rounded-lg border border-[#10462d] bg-[#1f8454] shadow-xl dark:border-[#0a2e1d] dark:bg-[#10462d] overflow-hidden">

          <div className="flex border-b border-[#10462d] dark:border-[#0a2e1d]/80 bg-[#165e3b] dark:bg-[#0c3622]">
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${activeTab === 'toons' ? 'bg-[#1f8454] dark:bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
              onClick={() => setActiveTab('toons')}
            >
              Toons
            </button>
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${activeTab === 'history' ? 'bg-[#1f8454] dark:bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
              onClick={() => {
                setActiveTab('history');
                setSelectedHistoryGroup(null);
              }}
            >
              History
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-4">
            {activeTab === 'toons' && (
              <>
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
                        return <ToonRow key={toon.id} toon={toon} favorites={favorites} blocked={blocked} activeToonIds={activeToonIds} refresh={refresh} isHovered={!!isHovered} />;
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
                        return <ToonRow key={toon.id} toon={toon} favorites={favorites} blocked={blocked} activeToonIds={activeToonIds} refresh={refresh} isHovered={!!isHovered} />;
                      })
                    )}
                  </ul>
                </section>
              </>
            )}

            {activeTab === 'history' && (
              <section className="flex-1 flex flex-col min-h-0">
                {selectedHistoryGroup === null ? (
                  <>
                    <h3 className="mb-1.5 shrink-0 text-sm font-medium text-green-50">
                      Recent Groups
                    </h3>
                    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                      {Object.values(historyGroups).length === 0 ? (
                        <div className="py-2 text-sm text-green-100/70 text-center">No history yet.</div>
                      ) : (
                        Object.values(historyGroups)
                          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
                          .map((group) => {
                            const typeData = groupTypes.find((t) => t.id === group.type);
                            const groupName = typeData ? typeData.name : `Group #${group.id}`;
                            return (
                              <button
                                key={group.id}
                                onClick={() => setSelectedHistoryGroup(group.id)}
                                className="w-full text-left rounded border border-[#10462d] bg-[#10462d]/40 hover:bg-[#10462d]/60 p-3 shadow-sm transition-colors dark:border-black/50 dark:bg-black/40 flex justify-between items-center"
                              >
                                <div>
                                  <span className="block text-sm font-bold text-white">{groupName}</span>
                                  <span className="block text-xs text-green-200 mt-1">
                                    {new Date(group.created).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-sm font-medium text-emerald-300">
                                  {group.members?.length || 0} left
                                </div>
                              </button>
                            );
                          })
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center gap-2 mb-3 shrink-0">
                      <button
                        onClick={() => setSelectedHistoryGroup(null)}
                        className="rounded bg-black/30 hover:bg-black/50 px-2 py-1 text-xs text-white"
                      >
                        ← Back
                      </button>
                      <h3 className="text-sm font-bold text-green-50 truncate">
                        {groupTypes.find((t) => t.id === historyGroups[selectedHistoryGroup]?.type)?.name || `Group #${historyGroups[selectedHistoryGroup]?.id}`}
                      </h3>
                    </div>
                    <ul className="flex-1 space-y-1 overflow-y-auto pr-1">
                      {historyGroups[selectedHistoryGroup]?.members?.map((m: any) => {
                        const cachedToon = m.toon?.id ? historyToons[m.toon.id] : null;
                        const toonId = m.toon?.id ?? cachedToon?.id;
                        const toonData: ToonData = {
                          id: toonId?.toString() ?? '0',
                          name: m.toon?.name || cachedToon?.name || 'Unknown Toon',
                          photo: m.toon?.photo || cachedToon?.photo || '',
                          note: ''
                        };
                        return (
                          <ToonRow
                            key={toonId || Math.random()}
                            toon={toonData}
                            favorites={favorites}
                            blocked={blocked}
                            activeToonIds={activeToonIds}
                            refresh={refresh}
                            isHovered={false}
                          />
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
