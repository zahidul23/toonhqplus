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

interface DialogState {
  isOpen: boolean;
  type: 'add' | 'move' | 'remove';
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
  toon: ToonData;
  source: 'main' | 'sidebar';
  otherListName?: string;
}

function normalizeToIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'object' && item !== null && 'id' in item) {
      return (item as ToonData).id;
    }
    return Number(item);
  }).filter(id => !isNaN(id));
}

function loadLists(): Promise<{ favorites: number[]; blocked: number[] }> {
  return browser.storage.local
    .get([STORAGE_KEYS.FAVORITES, STORAGE_KEYS.BLOCKED])
    .then((result) => ({
      favorites: normalizeToIds(result[STORAGE_KEYS.FAVORITES]),
      blocked: normalizeToIds(result[STORAGE_KEYS.BLOCKED]),
    }));
}

async function updateToonList(
  type: 'add' | 'move' | 'remove',
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  toon: ToonData,
  note?: string
) {
  const otherKey = listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
  const result = await browser.storage.local.get([listKey, otherKey, 'toonhqplus-toons']);
  
  let list: number[] = Array.isArray(result[listKey]) ? result[listKey] : [];
  let otherList: number[] = Array.isArray(result[otherKey]) ? result[otherKey] : [];
  const toonId = Number(toon.id);
  const toonsCache = (result['toonhqplus-toons'] as Record<number, any>) || {};

  if (type === 'remove') {
    list = list.filter(id => id !== toonId);
  } else {
    // add or move
    if (!list.includes(toonId)) {
      list.push(toonId);
    }
    if (otherList.includes(toonId)) {
      otherList = otherList.filter(id => id !== toonId);
    }
    
    // Update cache with toon details and note
    toonsCache[toonId] = {
      ...toon,
      lastSeen: new Date().toISOString()
    };
    if (note !== undefined) {
      if (note.trim()) toonsCache[toonId].note = note.trim();
      else delete toonsCache[toonId].note;
    }
  }

  await browser.storage.local.set({
    [listKey]: list,
    [otherKey]: otherList,
    'toonhqplus-toons': toonsCache
  });
}

function ToonRow({
  toon,
  favorites,
  blocked,
  activeToonIds,
  refresh,
  isHovered,
  onRequestDialog
}: {
  toon: ToonData;
  favorites: number[];
  blocked: number[];
  activeToonIds: number[];
  refresh: () => void;
  isHovered: boolean;
  onRequestDialog: (type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'sidebar' | 'main') => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(toon.note || '');

  const isFavorited = favorites.includes(Number(toon.id));
  const isBlocked = blocked.includes(Number(toon.id));
  const listKey = isFavorited ? STORAGE_KEYS.FAVORITES : isBlocked ? STORAGE_KEYS.BLOCKED : null;
  const isOwnToon = activeToonIds.includes(Number(toon.id));

  // Determine row background color
  const defaultHoverClass = isBlocked ? 'bg-red-600/90 shadow-md ring-1 ring-red-400' : 'bg-[#1f8454] shadow-md ring-1 ring-emerald-400';
  let bgColorClass = isHovered ? defaultHoverClass : 'hover:bg-[#10462d]/60';
  let textColorClass = 'text-white';

  if (!isHovered) {
    if (isOwnToon) {
      bgColorClass = 'bg-[#cae9fc] dark:bg-[#cae9fcbd]';
      textColorClass = 'text-[#004a77] dark:text-[#cae9fc]';
    } else if (isFavorited) {
      bgColorClass = 'bg-[#e6ffed] dark:bg-[#e6ffed]/20';
      textColorClass = 'text-[#1a7f37] dark:text-[#e6ffed]';
    } else if (isBlocked) {
      bgColorClass = 'bg-[#ffebe9] dark:bg-[#ad130dde]';
      textColorClass = 'text-[#cf222e] dark:text-[#ffebe9]';
    }
  }

  const saveNote = () => {
    if (!listKey) return;
    browser.storage.local.get(['toonhqplus-toons']).then((result) => {
      const toonsCache = (result['toonhqplus-toons'] as Record<number, any>) || {};
      const tid = Number(toon.id);
      if (toonsCache[tid]) {
        if (!noteDraft.trim()) {
          delete toonsCache[tid].note;
        } else {
          toonsCache[tid].note = noteDraft.trim();
        }
        browser.storage.local.set({ 'toonhqplus-toons': toonsCache }).then(refresh);
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
          {!isOwnToon && (
            <>
              {listKey ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setNoteDraft(toon.note || '');
                    }}
                    className="shrink-0 rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white dark:hover:bg-[#1f8454]"
                    title="Edit note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (listKey) onRequestDialog('remove', listKey, toon, 'sidebar');
                    }}
                    className="shrink-0 rounded p-1 text-[#cf222e] hover:bg-[#ffebe9] dark:text-[#ff7b72] dark:hover:bg-[#ad130dde]"
                    title="Remove from list"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </>
              ) : (
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.FAVORITES, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white dark:hover:bg-[#1f8454]"
                    title="Add to Toony Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.BLOCKED, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-red-600 hover:text-white dark:hover:bg-red-600"
                    title="Add to Stinky Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-2 flex flex-col gap-2 rounded border border-[#1f8454] bg-black/40 p-2 shadow-inner dark:border-[#1f8454]/40 dark:bg-black/60">
          <textarea
            autoFocus
            rows={1}
            className="w-full flex-1 resize-none overflow-hidden rounded border border-[#1f8454] bg-black/20 px-2 py-1 text-xs text-white placeholder-green-100/30 focus:border-green-400 focus:outline-none"
            placeholder={isBlocked ? "Rude, griefing, slow, training, bad choices" : "Add a note..."}
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
          <div className="flex gap-2 justify-end">
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
        </div>
      ) : toon.note ? (
        <div className="ml-8 whitespace-pre-wrap text-xs leading-snug text-green-100/80 italic">
          {toon.note}
        </div>
      ) : null}
    </li>
  );
}

export function SidebarApp() {
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'toons' | 'history'>('toons');

  const [favorites, setFavorites] = useState<number[]>([]);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [historyGroups, setHistoryGroups] = useState<Record<number, any>>({});
  const [historyToons, setHistoryToons] = useState<Record<number, any>>({});
  const [activeToonIds, setActiveToonIds] = useState<number[]>([]);
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogNote, setDialogNote] = useState('');

  const [hoveredToonId, setHoveredToonId] = useState<string | null>(null);
  const [hoveredToonName, setHoveredToonName] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadLists().then(({ favorites: f, blocked: b }) => {
      setFavorites(f);
      setBlocked(b);
    });
    browser.storage.local.get(['toonhqplus-history', 'toonhqplus-toons', 'toonhqplus-active-toon-ids']).then((result) => {
      setHistoryGroups((result['toonhqplus-history'] as Record<number, any>) || {});
      setHistoryToons((result['toonhqplus-toons'] as Record<number, any>) || {});
      setActiveToonIds((result['toonhqplus-active-toon-ids'] as number[]) || []);
    });
  }, []);

  const handleRequestDialog = useCallback((type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'main' | 'sidebar' = 'sidebar') => {
    const listName = listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons';
    const otherKey = listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
    const otherListName = otherKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons';

    // Auto-detect if it's a "move" (it exists in the other list)
    let actualType = type;
    const isFavorited = favorites.includes(Number(toon.id));
    const isBlocked = blocked.includes(Number(toon.id));

    if (type === 'add') {
       if ((listKey === STORAGE_KEYS.FAVORITES && isBlocked) || (listKey === STORAGE_KEYS.BLOCKED && isFavorited)) {
         actualType = 'move';
       }
    }

    setDialog({
      isOpen: true,
      type: actualType,
      listKey,
      toon,
      source,
      otherListName
    });
    setDialogNote(toon.note || '');
    if (source === 'sidebar' || !open) setOpen(true); // Ensure sidebar is open if triggered from it or if it was closed
  }, [favorites, blocked, open]);

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
    
    const handleRemoteRequest = (e: Event) => {
      const { type, listKey, toon, source } = (e as CustomEvent).detail;
      handleRequestDialog(type, listKey, toon, source || 'main');
    };
    window.addEventListener('toonhqplus-request-dialog', handleRemoteRequest);

    return () => {
      window.removeEventListener('toonhq-plus-toon-hover', handleHover);
      window.removeEventListener('toonhq-plus-toon-unhover', handleUnhover);
      window.removeEventListener('toonhqplus-request-dialog', handleRemoteRequest);
    };
  }, [handleRequestDialog]);

  useEffect(() => {
    refresh();
    const listener = (
      changes: { [key: string]: { newValue?: unknown } },
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (STORAGE_KEYS.FAVORITES in changes)
        setFavorites(normalizeToIds(changes[STORAGE_KEYS.FAVORITES]?.newValue));
      if (STORAGE_KEYS.BLOCKED in changes)
        setBlocked(normalizeToIds(changes[STORAGE_KEYS.BLOCKED]?.newValue));
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
                  <ul className="flex flex-col gap-2 p-3 overflow-y-auto min-h-0">
                    {favorites.length === 0 ? (
                      <div className="py-8 text-center text-green-200/40 italic">No toony toons yet.</div>
                    ) : (
                      [...favorites].reverse().map((id) => {
                        const toon = historyToons[id];
                        if (!toon) return null;
                        const isHovered = (hoveredToonId && toon.id?.toString() === hoveredToonId) || (hoveredToonName === toon.name);
                        return <ToonRow key={toon.id} toon={toon} favorites={favorites} blocked={blocked} activeToonIds={activeToonIds} refresh={refresh} isHovered={!!isHovered} onRequestDialog={handleRequestDialog} />;
                      })
                    )}
                  </ul>
                </section>

                <section className="flex-1 flex flex-col min-h-0">
                  <h3 className="mb-1.5 shrink-0 text-sm font-medium text-green-50">
                    Stinky Toons
                  </h3>
                  <ul className="flex flex-col gap-2 p-3 overflow-y-auto min-h-0">
                    {blocked.length === 0 ? (
                      <div className="py-8 text-center text-green-200/40 italic">No stinky toons yet.</div>
                    ) : (
                      [...blocked].reverse().map((id) => {
                        const toon = historyToons[id];
                        if (!toon) return null;
                        const isHovered = (hoveredToonId && toon.id?.toString() === hoveredToonId) || (hoveredToonName === toon.name);
                        return <ToonRow key={toon.id} toon={toon} favorites={favorites} blocked={blocked} activeToonIds={activeToonIds} refresh={refresh} isHovered={!!isHovered} onRequestDialog={handleRequestDialog} />;
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
                                  {group.members?.length || 0} toon{group.members?.length === 1 ? '' : 's'}
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
                            onRequestDialog={handleRequestDialog}
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

      {dialog && dialog.isOpen && (
        <div 
          className={`fixed inset-0 z-[2147483647] bg-black/40 animate-in fade-in duration-200 flex ${
            dialog.source === 'main' ? 'items-center justify-center p-4' : 'items-start justify-end p-4 pt-16'
          }`}
          onClick={() => setDialog(null)}
        >
          <div 
            className={`w-full max-w-xs rounded-xl border border-white/20 p-5 shadow-2xl animate-in zoom-in-95 duration-200 ${
              dialog.listKey === STORAGE_KEYS.BLOCKED ? 'bg-red-900/95 dark:bg-[#450a0a]' : 'bg-[#165e3b] dark:bg-[#0c3622]'
            } ${dialog.source === 'main' ? '' : 'mr-4'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              {dialog.toon.photo && (
                <img src={dialog.toon.photo} className={`h-16 w-16 rounded-full border-2 shadow-md ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'border-red-400' : 'border-emerald-400'}`} alt="" />
              )}
              <div>
                <h4 className="text-lg font-bold text-white leading-tight">{dialog.toon.name}</h4>
                <p className={`text-sm opacity-90 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'text-red-100' : 'text-green-200'}`}>
                  {dialog.type === 'remove' ? `Remove from ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` : 
                   dialog.type === 'move' ? `Move to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                   `Add to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?`}
                </p>
              </div>
            </div>

            {(dialog.type === 'add' || dialog.type === 'move') && (
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-green-300 opacity-80">
                  Private Note
                </label>
                <textarea
                  autoFocus
                  className={`w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all shadow-inner ${
                    dialog.listKey === STORAGE_KEYS.BLOCKED ? 'focus:border-red-400 focus:ring-red-400' : 'focus:border-emerald-400 focus:ring-emerald-400'
                  }`}
                  placeholder={dialog.listKey === STORAGE_KEYS.BLOCKED ? "Rude, griefing, slow, training, bad choices" : "Nice, helpful, communicative, strategic etc"}
                  rows={3}
                  value={dialogNote}
                  onChange={(e) => setDialogNote(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  updateToonList(dialog.type, dialog.listKey, dialog.toon, dialogNote).then(() => {
                    refresh();
                    setDialog(null);
                  });
                }}
                className={`w-full rounded-lg py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${
                  (dialog.type === 'remove' || dialog.listKey === STORAGE_KEYS.BLOCKED) ? 'bg-red-600 hover:bg-red-700 ring-red-400/50' : 'bg-emerald-600 hover:bg-emerald-700 ring-emerald-400/50'
                } focus:outline-none focus:ring-2`}
              >
                {dialog.type === 'remove' ? 'Remove Toon' : 
                 dialog.type === 'move' ? 'Move Toon' : 'Confirm Add'}
              </button>
              <button
                onClick={() => setDialog(null)}
                className="w-full rounded-lg bg-black/20 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
