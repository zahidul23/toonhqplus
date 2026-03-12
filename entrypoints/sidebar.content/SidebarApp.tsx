import React, { useState, useEffect, useCallback } from 'react';
import { groupTypes } from './groupTypes';
import {
  getAllFromList,
  addToList,
  removeFromList,
  clearList,
  getAllToons,
  putToon,
  getAllGroups,
  getGroupMembers,
  getAllGroupMembers,
  getAllNotes,
  getNote,
  setNote,
  getSetting,
  setSetting,
  deleteGroup as dbDeleteGroup,
  clearAllGroups,
  type ToonRecord,
  type ToonId,
} from './db';

const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
  SIDEBAR_OPEN: 'toonhqplus-sidebar-open',
  NAVBAR_CONFIG: 'toonhqplus-navbar-config',
  NOTES: 'toonhqplus-notes',
  BOSS_INFO_ENABLED: 'toonhqplus-boss-info-enabled',
  ACTIVE_TAB: 'toonhqplus-active-tab',
} as const;

interface ToonData {
  id: ToonId;
  name: string;
  photo?: string;
  note?: string;
  [key: string]: any;
}

interface DialogState {
  isOpen: boolean;
  type: 'add' | 'move' | 'remove' | 'delete_group' | 'clear_history' | 'clear_toons' | 'reset_navigation';
  listKey?: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
  toon?: ToonData;
  source: 'main' | 'sidebar';
  otherListName?: string;
  groupId?: number;
}

const SPECIES_MAP: Record<number, string> = {
  1: 'bear',
  2: 'cat',
  3: 'dog',
  4: 'duck',
  5: 'horse',
  6: 'monkey',
  7: 'mouse',
  8: 'pig',
  9: 'rabbit',
  10: 'deer',
  11: 'crocodile',
};

function getToonPhoto(toon: ToonData): string | undefined {
  if (toon.photo) return toon.photo;
  if (toon.species != null && SPECIES_MAP[toon.species]) {
    return `https://toonhq.org/static/assets/species/${SPECIES_MAP[toon.species]}.png`;
  }
  return undefined;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `${mins}m ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function RelativeTime({ date }: { date: string }) {
  const [display, setDisplay] = useState(() => formatRelativeTime(date));

  useEffect(() => {
    // Initial check
    setDisplay(formatRelativeTime(date));

    // Dynamic interval: 30s for items < 1h, 5m for items < 24h, 1h otherwise
    const getDelay = () => {
      const diff = Date.now() - new Date(date).getTime();
      if (diff < 3600000) return 30000;
      if (diff < 86400000) return 300000;
      return 3600000;
    };

    let timeoutId: any;
    const update = () => {
      setDisplay(formatRelativeTime(date));
      timeoutId = setTimeout(update, getDelay());
    };

    timeoutId = setTimeout(update, getDelay());
    return () => clearTimeout(timeoutId);
  }, [date]);

  return <span>{display}</span>;
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
  return Promise.all([
    getAllFromList('toony_toons'),
    getAllFromList('stinky_toons'),
  ]).then(([favorites, blocked]) => ({ favorites, blocked }));
}

async function updateToonList(
  type: 'add' | 'move' | 'remove',
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  toon: ToonData,
  note?: string
) {
  const toonStore: 'toony_toons' | 'stinky_toons' =
    listKey === STORAGE_KEYS.FAVORITES ? 'toony_toons' : 'stinky_toons';
  const otherStore: 'toony_toons' | 'stinky_toons' =
    toonStore === 'toony_toons' ? 'stinky_toons' : 'toony_toons';
  const toonId = toon.id;

  if (type === 'remove') {
    await removeFromList(toonStore, toonId);
  } else {
    // add or move: ensure in target list and out of other list
    await addToList(toonStore, toonId);
    await removeFromList(otherStore, toonId);

    // Upsert toon into DB
    await putToon({
      id: toonId,
      name: toon.name || '',
      photo: toon.photo,
      species: toon.species,
      laff: toon.laff,
      level: toon.level,
      lastSeen: new Date().toISOString(),
    });

    if (note !== undefined) {
      await setNote(toonId, note);
    }
  }
}

function ToonRow({
  toon,
  favorites,
  blocked,
  activeToonIds,
  note,
  refresh,
  isHovered,
  isJustAdded,
  onRequestDialog
}: {
  toon: ToonData;
  favorites: ToonId[];
  blocked: ToonId[];
  activeToonIds: number[];
  note?: string;
  refresh: () => void;
  isHovered: boolean;
  isJustAdded?: boolean;
  onRequestDialog: (type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'sidebar' | 'main') => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || '');

  useEffect(() => {
    setNoteDraft(note || '');
  }, [note]);

  const isFavorited = favorites.includes(toon.id);
  const isBlocked = blocked.includes(toon.id);
  const listKey = isFavorited ? STORAGE_KEYS.FAVORITES : isBlocked ? STORAGE_KEYS.BLOCKED : null;
  const isOwnToon = typeof toon.id === 'number' && activeToonIds.includes(toon.id);

  // Determine row background color
  const defaultHoverClass = isBlocked ? 'bg-red-600/90 shadow-md ring-1 ring-red-400' : 'bg-[#1f8454] shadow-md ring-1 ring-emerald-400';
  let bgColorClass = isHovered ? defaultHoverClass : 'hover:bg-[#10462d]/60';
  let textColorClass = 'text-white';

  if (isJustAdded) {
    bgColorClass = isBlocked ? 'bg-red-500/60 ring-2 ring-red-400' : 'bg-emerald-500/60 ring-2 ring-emerald-400';
  } else if (!isHovered) {
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
    setNote(toon.id, noteDraft).then(refresh);
    setIsEditing(false);
  };

  const rowRef = React.useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (isHovered && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHovered]);

  return (
    <li
      ref={rowRef}
      className={`group relative flex flex-col gap-1 rounded px-2 py-1.5 text-sm transition-all duration-1000 ${bgColorClass} ${textColorClass}`}
    >
      <div className="flex items-center gap-1">
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          {(() => {
            const photo = getToonPhoto(toon);
            return photo ? (
              <img src={photo} alt={toon.name} className="h-6 w-6 shrink-0 rounded-full bg-black/10" />
            ) : null;
          })()}
          <span className="truncate">
            {toon.name}
            {toon.laff != null ? ` (${toon.laff})` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 w-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-200 overflow-hidden">
          {!isOwnToon && (
            <>
              {listKey ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setNoteDraft(toon.note || note || '');
                    }}
                    className="shrink-0 rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white cursor-pointer"
                    title="Edit note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetKey = listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
                      onRequestDialog('move', targetKey, toon, 'sidebar');
                    }}
                    className="shrink-0 rounded p-1 text-green-100/50 hover:bg-black/20 hover:text-white cursor-pointer"
                    title={listKey === STORAGE_KEYS.FAVORITES ? "Move to Stinky Toons" : "Move to Toony Toons"}
                  >
                    {listKey === STORAGE_KEYS.FAVORITES ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (listKey) onRequestDialog('remove', listKey, toon, 'sidebar');
                    }}
                    className="shrink-0 rounded p-1 text-[#cf222e] hover:bg-[#ffebe9] dark:text-[#ff7b72] dark:hover:bg-[#ad130dde] cursor-pointer"
                    title="Remove from list"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                </>
              ) : (
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.FAVORITES, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white cursor-pointer"
                    title="Add to Toony Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.BLOCKED, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-red-600 hover:text-white cursor-pointer"
                    title="Add to Stinky Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
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
            className="w-full flex-1 resize-y custom-scrollbar max-h-32 rounded border border-[#1f8454] bg-black/20 px-2 py-1 text-xs text-white placeholder-green-100/30 focus:border-green-400 focus:outline-none"
            placeholder={isBlocked ? "Rude, griefing, bad gags, etc..." : "Nice, helpful, communicative, strategic etc..."}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveNote();
              }
              if (e.key === 'Escape') setIsEditing(false);
            }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={saveNote}
              className="shrink-0 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="shrink-0 rounded bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : note ? (
        <div className="ml-8 whitespace-pre-wrap text-xs leading-snug text-green-100/80 italic">
          {note}
        </div>
      ) : null}
    </li>
  );
}

const DEFAULT_NAV_ITEMS = [
  { id: 'invasions', label: 'Invasions', href: '/invasions/', colorClass: 'blue' },
  { id: 'groups', label: 'Groups', href: '/groups/', colorClass: 'green' },
  { id: 'fishing', label: 'Fishing', href: '/fishing/', colorClass: 'fishing' },
  { id: 'ccg', label: 'CCG', href: '/ccg/', colorClass: 'steel' },
  { id: 'field-offices', label: 'Field Offices', href: '/field-offices/', colorClass: 'steel' },
  { id: 'gardening', label: 'Gardening', href: '/gardening/', colorClass: 'green' },
  { id: 'doodles', label: 'Pet Shop Doodles', href: '/doodles/', colorClass: 'shop' },
];

function NavbarSettings({
  config,
  onUpdate
}: {
  config: { pinned: string[], dropdown: string[] },
  onUpdate: (newConfig: { pinned: string[], dropdown: string[] }) => void
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ list: 'pinned' | 'dropdown', index: number } | null>(null);

  const moveItem = (id: string, from: 'pinned' | 'dropdown', to: 'pinned' | 'dropdown', atIndex?: number) => {
    const newConfig = { ...config };
    // Remove from source
    const items = [...newConfig[from]].filter(itemId => itemId !== id);
    newConfig[from] = items;

    // Add to target
    const targetItems = [...newConfig[to]];
    const insertAt = atIndex !== undefined ? atIndex : targetItems.length;
    targetItems.splice(insertAt, 0, id);
    newConfig[to] = targetItems;

    onUpdate(newConfig);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent, list: 'pinned' | 'dropdown', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverInfo({ list, index });
  };

  const onDragOverRow = (e: React.DragEvent, list: 'pinned' | 'dropdown', id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const items = config[list];
    const index = items.indexOf(id);

    // Choose the index before or after the row based on cursor position
    const targetIndex = e.clientY < midY ? index : index + 1;
    setDragOverInfo({ list, index: targetIndex });
  };

  const onDrop = (e: React.DragEvent, targetList: 'pinned' | 'dropdown', targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    const sourceList = config.pinned.includes(id) ? 'pinned' : 'dropdown';

    // If targetIndex isn't provided (e.g. drop on empty container), append to end
    let finalIndex = targetIndex !== undefined ? targetIndex : config[targetList].length;

    if (sourceList === targetList) {
      const items = [...config[targetList]];
      const oldIndex = items.indexOf(id);
      if (oldIndex !== -1) {
        items.splice(oldIndex, 1);
        // Adjust index if we moved an item from before the target to after it
        const adjustedIndex = finalIndex > oldIndex ? finalIndex - 1 : finalIndex;
        items.splice(adjustedIndex, 0, id);
        onUpdate({ ...config, [targetList]: items });
      }
    } else {
      moveItem(id, sourceList, targetList, finalIndex);
    }
    setDraggedId(null);
    setDragOverInfo(null);
  };

  const renderDropZone = (list: 'pinned' | 'dropdown', index: number) => {
    const isActive = dragOverInfo?.list === list && dragOverInfo?.index === index;
    // Don't show drop zone immediately before or after the item being dragged in the same list
    if (draggedId) {
      const isSourceList = config[list].includes(draggedId);
      if (isSourceList) {
        const itemIdx = config[list].indexOf(draggedId);
        if (index === itemIdx || index === itemIdx + 1) return null;
      }
    }

    return (
      <div
        onDragOver={(e) => onDragOver(e, list, index)}
        onDragLeave={() => setDragOverInfo(null)}
        onDrop={(e) => onDrop(e, list, index)}
        className={`transition-all duration-200 rounded ${isActive ? 'h-10 bg-emerald-500/20 border-2 border-dashed border-emerald-500/40 my-1' : 'h-1'}`}
      />
    );
  };

  const renderItemRow = (id: string, listType: 'pinned' | 'dropdown') => {
    const item = DEFAULT_NAV_ITEMS.find(n => n.id === id);
    if (!item) return null;
    const isDragging = draggedId === id;

    return (
      <div
        key={id}
        draggable
        onDragStart={(e) => onDragStart(e, id)}
        onDragOver={(e) => onDragOverRow(e, listType, id)}
        onDrop={(e) => {
          // Calculate the nearest index again on drop
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const index = config[listType].indexOf(id);
          onDrop(e, listType, e.clientY < midY ? index : index + 1);
        }}
        onDragEnd={() => {
          setDraggedId(null);
          setDragOverInfo(null);
        }}
        className={`flex items-center justify-between gap-2 rounded bg-black/20 p-2 hover:bg-black/30 cursor-move transition-all ${isDragging ? 'opacity-20 scale-95' : 'opacity-100'}`}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30"><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></svg>
          <div className={`h-2 w-2 rounded-full bg-current ${item.colorClass === 'blue' ? 'text-blue-400' : item.colorClass === 'green' ? 'text-green-400' : item.colorClass === 'steel' ? 'text-slate-400' : item.colorClass === 'fishing' ? 'text-cyan-400' : 'text-pink-400'}`} />
          <span className="text-sm font-medium text-white">{item.label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
      <p className="text-xs text-green-100/70 leading-relaxed bg-black/20 p-2 rounded border border-white/5">
        Drag and drop items to customize your navigation bar. <strong>Pinned Pages</strong> show in the main bar, while <strong>Hidden Pages</strong> move to the "More" menu.
      </p>
      <div>
        <h5 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]/60">Pinned Pages</h5>
        <div className="flex flex-col">
          {config.pinned.map((id, i) => (
            <React.Fragment key={id}>
              {renderDropZone('pinned', i)}
              {renderItemRow(id, 'pinned')}
            </React.Fragment>
          ))}
          {config.pinned.length > 0 && renderDropZone('pinned', config.pinned.length)}
          {config.pinned.length === 0 && (
            <div
              onDragOver={(e) => onDragOver(e, 'pinned', 0)}
              onDragLeave={() => setDragOverInfo(null)}
              onDrop={(e) => onDrop(e, 'pinned', 0)}
              className={`transition-all duration-200 text-center text-xs italic p-4 border-2 border-dashed rounded ${dragOverInfo?.list === 'pinned' && dragOverInfo?.index === 0 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' : 'text-green-200/30 border-white/5'}`}
            >
              Drop items here to pin.
            </div>
          )}
        </div>
      </div>
      <div>
        <h5 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]/60">Hidden Pages</h5>
        <div className="flex flex-col">
          {config.dropdown.map((id, i) => (
            <React.Fragment key={id}>
              {renderDropZone('dropdown', i)}
              {renderItemRow(id, 'dropdown')}
            </React.Fragment>
          ))}
          {config.dropdown.length > 0 && renderDropZone('dropdown', config.dropdown.length)}
          {config.dropdown.length === 0 && (
            <div
              onDragOver={(e) => onDragOver(e, 'dropdown', 0)}
              onDragLeave={() => setDragOverInfo(null)}
              onDrop={(e) => onDrop(e, 'dropdown', 0)}
              className={`transition-all duration-200 text-center text-xs italic p-4 border-2 border-dashed rounded ${dragOverInfo?.list === 'dropdown' && dragOverInfo?.index === 0 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' : 'text-green-200/30 border-white/5'}`}
            >
              Drop items here to hide.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SidebarApp() {
  const [open, setOpen] = useState(true);
  const [bossInfoEnabled, setBossInfoEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'toons' | 'history' | 'settings'>('history');

  const [favorites, setFavorites] = useState<ToonId[]>([]);
  const [blocked, setBlocked] = useState<ToonId[]>([]);
  const [historyGroups, setHistoryGroups] = useState<Record<number, any>>({});
  const [historyGroupMembers, setHistoryGroupMembers] = useState<Record<number, any>>({});
  const [historyToons, setHistoryToons] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeToonIds, setActiveToonIds] = useState<number[]>([]);
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogNote, setDialogNote] = useState('');
  const [justAddedId, setJustAddedId] = useState<ToonId | null>(null);

  const [navbarConfig, setNavbarConfig] = useState<{ pinned: string[], dropdown: string[] }>({
    pinned: ['invasions', 'groups', 'fishing', 'ccg'],
    dropdown: ['field-offices', 'gardening', 'doodles']
  });

  const [hoveredToonId, setHoveredToonId] = useState<string | null>(null);
  const [hoveredToonName, setHoveredToonName] = useState<string | null>(null);

  const handleClearHistory = useCallback(async () => {
    setDialog({
      isOpen: true,
      type: 'clear_history',
      source: 'sidebar'
    });
  }, []);

  const handleClearToons = useCallback(async () => {
    setDialog({
      isOpen: true,
      type: 'clear_toons',
      source: 'sidebar'
    });
  }, []);

  const handleResetNavbar = useCallback(async () => {
    setDialog({
      isOpen: true,
      type: 'reset_navigation',
      source: 'sidebar'
    });
  }, []);

  const handleDeleteGroup = useCallback(async (e: React.MouseEvent, groupId: number) => {
    e.stopPropagation();
    setDialog({
      isOpen: true,
      type: 'delete_group',
      groupId,
      source: 'sidebar'
    });
  }, []);

  const refresh = useCallback(() => {
    loadLists().then(({ favorites: f, blocked: b }) => {
      setFavorites(f);
      setBlocked(b);
    });

    // Load all data from IndexedDB in parallel
    Promise.all([
      getAllGroups(),
      getAllToons(),
      getAllNotes(),
      getSetting<number[]>('active-toon-ids'),
      getSetting<{ pinned: string[], dropdown: string[] }>('navbar-config'),
      getSetting<boolean>('boss-info-enabled'),
      getSetting<string>('active-tab'),
      getAllGroupMembers(),
    ]).then(([groups, toonsArr, notesMap, activeIds, navConfig, bossEnabled, activeTabVal, groupMembers]) => {
      // Build historyGroups from groups + group_members won't be done here — we use a flat record
      // Convert groups array into the shape the UI already expects
      const groupsMap: Record<number, any> = {};
      for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
      setHistoryGroups(groupsMap);


      const historyGroupMembersMap: Record<number, any> = {};

      groupMembers.forEach(m => { 
        if (historyGroupMembersMap[m.groupId]) {
          historyGroupMembersMap[m.groupId].toonIds.push(m.toonId);
        } else {
          historyGroupMembersMap[m.groupId] = { toonIds: [m.toonId] };
        }
      });
      setHistoryGroupMembers(historyGroupMembersMap);

      const toonsMap: Record<string, any> = {};
      for (const t of toonsArr) toonsMap[String(t.id)] = t;
      setHistoryToons(toonsMap);

      setNotes(notesMap);
      if (activeIds) setActiveToonIds(activeIds);
      if (navConfig) setNavbarConfig(navConfig);
      if (bossEnabled !== undefined) setBossInfoEnabled(bossEnabled !== false);
      if (activeTabVal) setActiveTab(activeTabVal as any);
    });
  }, []);

  const handleRequestDialog = useCallback((type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'main' | 'sidebar' = 'sidebar') => {
    const listName = listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons';
    const otherKey = listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
    const otherListName = otherKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons';

    // Auto-detect if it's a "move" (it exists in the other list)
    let actualType = type;
    const isFavorited = favorites.includes(toon.id);
    const isBlocked = blocked.includes(toon.id);

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
    setDialogNote(notes[String(toon.id)] || '');
    if (source === 'main') {
      setOpen(true);
      setActiveTab('toons');
      setSetting('sidebar-open', true).catch(console.error);
      setSetting('active-tab', 'toons').catch(console.error);
    } else if (!open) {
      setOpen(true);
      setSetting('sidebar-open', true).catch(console.error);
    }
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
    getSetting<boolean>('sidebar-open').then(val => {
      if (val !== undefined) setOpen(!!val);
    });

    // Listen for DB changes (replaces browser.storage.onChanged)
    const handleDbChange = (e: Event) => {
      const { store } = (e as CustomEvent).detail || {};
      if (store === 'toony_toons' || store === 'stinky_toons') {
        loadLists().then(({ favorites: f, blocked: b }) => { setFavorites(f); setBlocked(b); });
      }
      if (store === 'groups') {
        getAllGroups().then(groups => {
          const groupsMap: Record<number, any> = {};
          for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
          setHistoryGroups(groupsMap);
        });
      }
      if (store === 'toons') {
        getAllToons().then(toonsArr => {
          const toonsMap: Record<number, any> = {};
          for (const t of toonsArr) toonsMap[t.id] = t;
          setHistoryToons(toonsMap);
        });
      }
      if (store === 'notes') {
        getAllNotes().then(setNotes);
      }
      if (store === 'settings') {
        getSetting<{ pinned: string[], dropdown: string[] }>('navbar-config').then(c => { if (c) setNavbarConfig(c); });
        getSetting<boolean>('boss-info-enabled').then(v => { if (v !== undefined) setBossInfoEnabled(v !== false); });
        getSetting<string>('active-tab').then(v => { if (v) setActiveTab(v as any); });
        getSetting<boolean>('sidebar-open').then(v => { if (v !== undefined) setOpen(!!v); });
        getSetting<number[]>('active-toon-ids').then(ids => { if (ids) setActiveToonIds(ids); });
      }
    };
    window.addEventListener('toonhqplus-db-changed', handleDbChange);
    return () => {
      window.removeEventListener('toonhqplus-db-changed', handleDbChange);
    };
  }, [refresh]);

  return (
    <div
      className="fixed top-4 right-4 z-[2147483647] flex max-h-[calc(100vh-2rem)] flex-col gap-2 font-sans"
    >
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            setSetting('sidebar-open', next).catch(console.error);
          }}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 cursor-pointer transition-all active:scale-95"
        >
          {open ? 'Close' : 'HQ+'}
        </button>
      </div>
      {open && (
        <aside className="w-80 flex-1 flex flex-col min-h-0 rounded-lg border border-[#10462d] bg-[#1f8454] shadow-xl dark:border-[#0a2e1d] dark:bg-[#10462d] overflow-hidden">

          <div className="flex border-b border-[#10462d] dark:border-[#0a2e1d]/80 bg-[#165e3b] dark:bg-[#0c3622]">
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'history' ? 'bg-[#1f8454] dark:bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
              onClick={() => {
                setActiveTab('history');
                setSelectedHistoryGroup(null);
                setSetting('active-tab', 'history').catch(console.error);
              }}
            >
              History
            </button>
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'toons' ? 'bg-[#1f8454] dark:bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
              onClick={() => {
                setActiveTab('toons');
                setSetting('active-tab', 'toons').catch(console.error);
              }}
            >
              Toons
            </button>
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'settings' ? 'bg-[#1f8454] dark:bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
              onClick={() => {
                setActiveTab('settings');
                setSetting('active-tab', 'settings').catch(console.error);
              }}
            >
              Settings
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-3">
            {activeTab === 'toons' && (
              <>
                <section className="mb-3 flex-1 flex flex-col min-h-0">
                  <h3 className="mb-1 shrink-0 text-sm font-medium text-green-50">
                    Toony Toons
                  </h3>
                  <ul className="flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                    {favorites.length === 0 ? (
                      <div className="py-8 text-center text-green-200/40 italic">No toony toons yet.</div>
                    ) : (
                      [...favorites].reverse().map((id) => {
                        const toon = historyToons[id];
                        if (!toon) return null;
                        const isHovered = (hoveredToonId && toon.id?.toString() === hoveredToonId) || (hoveredToonName === toon.name);
                        return <ToonRow key={toon.id} toon={toon} favorites={favorites} blocked={blocked} activeToonIds={activeToonIds} note={notes[String(toon.id)]} refresh={refresh} isHovered={!!isHovered} isJustAdded={justAddedId === toon.id} onRequestDialog={handleRequestDialog} />;
                      })
                    )}
                  </ul>
                </section>

                <section className="flex-1 flex flex-col min-h-0">
                  <h3 className="mb-1 shrink-0 text-sm font-medium text-green-50">
                    Stinky Toons
                  </h3>
                  <ul className="flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                    {blocked.length === 0 ? (
                      <div className="py-8 text-center text-green-200/40 italic">No stinky toons yet.</div>
                    ) : (
                      [...blocked].reverse().map((id) => {
                        const toon = historyToons[id];
                        if (!toon) return null;
                        const isHovered = (hoveredToonId && toon.id?.toString() === hoveredToonId) || (hoveredToonName === toon.name);
                        return <ToonRow key={toon.id} toon={toon} favorites={favorites} blocked={blocked} activeToonIds={activeToonIds} note={notes[String(toon.id)]} refresh={refresh} isHovered={!!isHovered} isJustAdded={justAddedId === toon.id} onRequestDialog={handleRequestDialog} />;
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
                    <div className="mb-2 shrink-0 flex items-center justify-between">
                      <h3 className="text-sm font-medium text-green-50">
                        Recent Groups
                      </h3>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar p-1.5 min-h-0">
                      {Object.values(historyGroups).length === 0 ? (
                        <div className="py-2 text-sm text-green-100/70 text-center">No history yet.</div>
                      ) : (
                        Object.values(historyGroups)
                          .sort((a: any, b: any) => {
                            const timeA = new Date(a.userJoinedAt || a.created).getTime();
                            const timeB = new Date(b.userJoinedAt || b.created).getTime();
                            return timeB - timeA;
                          })
                          .map((group) => {
                            const typeData = groupTypes.find((t) => t.id === group.type);
                            const groupName = typeData ? typeData.name : `Group #${group.id}`;
                            const groupMembers = historyGroupMembers[group.id];
                            return (
                              <div key={group.id} className="group relative">
                                <button
                                  onClick={() => setSelectedHistoryGroup(group.id)}
                                  className="w-full text-left rounded border border-[#10462d] bg-[#10462d]/40 hover:bg-[#10462d]/60 p-3 shadow-sm transition-colors dark:border-black/50 dark:bg-black/40 flex justify-between items-center cursor-pointer"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="block text-sm font-bold text-white truncate">{groupName}</span>
                                    <span className="block text-xs text-green-200 mt-1">
                                      <RelativeTime date={group.userJoinedAt || group.created} />
                                    </span>
                                  </div>
                                  <div className="text-sm font-medium text-emerald-300 shrink-0">
                                    {groupMembers?.toonIds?.length} toon{groupMembers?.toonIds?.length === 1 ? '' : 's'}
                                  </div>
                                </button>
                                <button
                                  onClick={(e) => handleDeleteGroup(e, group.id)}
                                  className="absolute -right-1 -top-1 p-1 bg-[#10462d] border border-red-500/30 text-red-400 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full hover:bg-red-500 hover:text-white hover:border-red-500 z-10 cursor-pointer"
                                  title="Delete from history"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </button>
                              </div>
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
                        className="rounded bg-black/30 hover:bg-black/50 px-2 py-1 text-xs text-white cursor-pointer"
                      >
                        ← Back
                      </button>
                      <h3 className="text-sm font-bold text-green-50 truncate">
                        {groupTypes.find((t) => t.id === historyGroups[selectedHistoryGroup]?.type)?.name || `Group #${historyGroups[selectedHistoryGroup]?.id}`}
                      </h3>
                    </div>
                    <ul className="flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-1">
                      {(() => {
                        const group = historyGroups[selectedHistoryGroup];
                        console.log(group);
                        const ids = historyGroupMembers[group.id]?.toonIds;

                        const userActiveIds: number[] = [];
                        const otherActiveIds: number[] = [];
                        const userLeftIds: number[] = [];
                        const otherLeftIds: number[] = [];

                        (ids as number[]).forEach((id: number) => {
                          const isUserToon = activeToonIds.includes(id);
                          const hasLeft = !!group?.memberMetadata?.[id]?.left;

                          if (isUserToon) {
                            if (hasLeft) userLeftIds.push(id);
                            else userActiveIds.push(id);
                          } else {
                            if (hasLeft) otherLeftIds.push(id);
                            else otherActiveIds.push(id);
                          }
                        });

                        const renderRows = (targetIds: number[]) =>
                          targetIds.map((id: number) => {
                            const toonData = historyToons[String(id)];
                            if (!toonData) return null;
                            return (
                              <ToonRow
                                key={id}
                                toon={toonData}
                                favorites={favorites}
                                blocked={blocked}
                                activeToonIds={activeToonIds}
                                note={notes[String(id)]}
                                refresh={refresh}
                                isHovered={false}
                                isJustAdded={justAddedId === toonData.id}
                                onRequestDialog={handleRequestDialog}
                              />
                            );
                          });

                        return (
                          <>
                            {renderRows([...userActiveIds, ...otherActiveIds])}
                            {(userLeftIds.length > 0 || otherLeftIds.length > 0) && (
                              <li key="left-header" className="pt-2">
                                <div className="flex items-center gap-2 px-1 mb-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-green-300/40">Left</span>
                                  <div className="h-px flex-1 bg-green-500/10" />
                                </div>
                                <ul className="space-y-1 opacity-60 grayscale-[0.2]">
                                  {renderRows([...userLeftIds, ...otherLeftIds])}
                                </ul>
                              </li>
                            )}
                          </>
                        );
                      })()}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'settings' && (
              <section className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 flex flex-col gap-3 p-1 overflow-y-auto custom-scrollbar min-h-0">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-green-300/80">Customization</h4>
                    <NavbarSettings
                       config={navbarConfig}
                       onUpdate={(newConfig) => {
                         setNavbarConfig(newConfig);
                         setSetting('navbar-config', newConfig).catch(console.error);
                       }}
                     />

                    <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                        </div>
                        <div className="text-sm font-bold text-white">Boss Info Overlay</div>
                      </div>
                      <button
                        onClick={() => {
                          const next = !bossInfoEnabled;
                          setBossInfoEnabled(next);
                          setSetting('boss-info-enabled', next).catch(console.error);
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${bossInfoEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${bossInfoEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-white/5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-green-300/80">Maintenance</h4>

                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={handleClearHistory}
                        className="flex items-center gap-3 w-full rounded-lg bg-black/20 p-2.5 text-left hover:bg-red-500/10 group transition-all cursor-pointer border border-white/5"
                      >
                        <div className="h-7 w-7 rounded bg-red-500/10 flex items-center justify-center text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </div>
                        <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">Clear Group History</div>
                      </button>

                      <button
                        onClick={handleClearToons}
                        className="flex items-center gap-3 w-full rounded-lg bg-black/20 p-2.5 text-left hover:bg-red-500/10 group transition-all cursor-pointer border border-white/5"
                      >
                        <div className="h-7 w-7 rounded bg-red-400/10 flex items-center justify-center text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m22 19-3-3 3-3" /></svg>
                        </div>
                        <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">Clear Toons List</div>
                      </button>

                      <button
                        onClick={handleResetNavbar}
                        className="flex items-center gap-3 w-full rounded-lg bg-black/20 p-2.5 text-left hover:bg-emerald-500/10 group transition-all cursor-pointer border border-white/5"
                      >
                        <div className="h-7 w-7 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                        </div>
                        <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Reset Navigation</div>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </aside>
      )
      }

      {
        dialog && dialog.isOpen && (
          <div
            className={`fixed inset-0 z-[2147483647] bg-black/40 animate-in fade-in duration-200 flex ${dialog.source === 'main' ? 'items-center justify-center p-4' : 'items-start justify-end p-4 pt-16'
              }`}
            onClick={() => setDialog(null)}
          >
            <div
              className={`w-full max-w-xs rounded-xl border border-white/20 p-5 shadow-2xl animate-in zoom-in-95 duration-200 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'bg-red-900/95 dark:bg-[#450a0a]' : 'bg-[#165e3b] dark:bg-[#0c3622]'
                } ${dialog.source === 'main' ? '' : 'mr-4'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {dialog.type === 'delete_group' || dialog.type === 'clear_history' || dialog.type === 'clear_toons' || dialog.type === 'reset_navigation' ? (
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className={`h-16 w-16 rounded-full flex items-center justify-center border-2 border-red-500/30 ${dialog.type === 'reset_navigation' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    {dialog.type === 'reset_navigation' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white leading-tight">
                      {dialog.type === 'delete_group' ? 'Delete Group' :
                        dialog.type === 'clear_history' ? 'Clear History' :
                          dialog.type === 'clear_toons' ? 'Clear Toons List' : 'Reset Navigation'}
                    </h4>
                    <p className="mt-1 text-sm text-red-100 opacity-90">
                      {dialog.type === 'delete_group' ? 'Are you sure you want to remove this group from your history?' :
                        dialog.type === 'clear_history' ? 'Are you sure you want to clear all group history? This cannot be undone.' :
                          dialog.type === 'clear_toons' ? 'Are you sure you want to clear your lists of Toons? This cannot be undone.' :
                            'Are you sure you want to reset your navigation bar to its default settings?'}
                    </p>
                  </div>
                </div>
              ) : dialog.toon && (
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  {(() => {
                    const photo = getToonPhoto(dialog.toon!);
                    return photo ? (
                      <img src={photo} className={`h-16 w-16 rounded-full border-2 shadow-md bg-black/10 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'border-red-400' : 'border-emerald-400'}`} alt="" />
                    ) : null;
                  })()}
                  <div>
                    <h4 className="text-lg font-bold text-white leading-tight">
                      {dialog.toon.name}
                      {dialog.toon.laff != null && <span className="ml-1.5 opacity-60">({dialog.toon.laff})</span>}
                    </h4>
                    <p className={`text-sm opacity-90 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'text-red-100' : 'text-green-200'}`}>
                      {dialog.type === 'remove' ? `Remove from ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                        dialog.type === 'move' ? `Move to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                          `Add to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?`}
                    </p>
                  </div>
                </div>
              )}

              {(dialog.type === 'add' || dialog.type === 'move') && (
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-green-300 opacity-80">
                    Private Note
                  </label>
                  <textarea
                    autoFocus
                    className={`w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all shadow-inner custom-scrollbar resize-y min-h-[5rem] max-h-32 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'focus:border-red-400 focus:ring-red-400' : 'focus:border-emerald-400 focus:ring-emerald-400'
                      }`}
                    placeholder={dialog.listKey === STORAGE_KEYS.BLOCKED ? "Rude, griefing, bad gags, etc..." : "Nice, helpful, communicative, strategic etc..."}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    value={dialogNote}
                    onChange={(e) => setDialogNote(e.target.value)}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (dialog.type === 'delete_group' && dialog.groupId) {
                      dbDeleteGroup(dialog.groupId).then(() => {
                        getAllGroups().then(groups => {
                          const groupsMap: Record<number, any> = {};
                          for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
                          setHistoryGroups(groupsMap);
                          setDialog(null);
                        });
                      });
                    } else if (dialog.type === 'clear_history') {
                      clearAllGroups().then(() => {
                        setHistoryGroups({});
                        setDialog(null);
                      });
                    } else if (dialog.type === 'clear_toons') {
                      Promise.all([
                        clearList('toony_toons'),
                        clearList('stinky_toons'),
                      ]).then(() => {
                        setFavorites([]);
                        setBlocked([]);
                        setNotes({});
                        setDialog(null);
                      });
                    } else if (dialog.type === 'reset_navigation') {
                      const defaultConfig = {
                        pinned: ['invasions', 'groups', 'fishing', 'ccg'],
                        dropdown: ['field-offices', 'gardening', 'doodles']
                      };
                      setSetting('navbar-config', defaultConfig).then(() => {
                        setNavbarConfig(defaultConfig);
                        setDialog(null);
                      });
                    } else if (dialog.toon && dialog.listKey && (dialog.type === 'add' || dialog.type === 'move' || dialog.type === 'remove')) {
                      updateToonList(dialog.type, dialog.listKey, dialog.toon, dialogNote).then(() => {
                        if (dialog.type === 'add' || dialog.type === 'move') {
                          setJustAddedId(dialog.toon!.id);
                          setTimeout(() => setJustAddedId(null), 500);
                        }
                        refresh();
                        setDialog(null);
                      });
                    }
                  }}
                  className={`w-full rounded-lg py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95 cursor-pointer ${(dialog.type === 'remove' || dialog.type === 'delete_group' || dialog.type === 'clear_history' || dialog.type === 'clear_toons' || dialog.listKey === STORAGE_KEYS.BLOCKED)
                    ? 'bg-red-600 hover:bg-red-700 ring-red-400/50'
                    : 'bg-emerald-600 hover:bg-emerald-700 ring-emerald-400/50'
                    } focus:outline-none focus:ring-2`}
                >
                  {dialog.type === 'remove' ? 'Remove Toon' :
                    dialog.type === 'delete_group' ? 'Delete Group' :
                      dialog.type === 'clear_history' ? 'Clear History' :
                        dialog.type === 'clear_toons' ? 'Clear Toons' :
                          dialog.type === 'reset_navigation' ? 'Reset Navigation' :
                            dialog.type === 'move' ? 'Move Toon' : 'Confirm Add'}
                </button>
                {dialog.type === 'remove' && dialog.listKey && (
                  <button
                    onClick={() => {
                      const otherKey = dialog.listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
                      setDialog({
                        ...dialog,
                        type: 'move',
                        listKey: otherKey
                      });
                    }}
                    className="w-full rounded-lg bg-black/20 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all active:scale-95 cursor-pointer"
                  >
                    Move to {dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Stinky Toons' : 'Toony Toons'}
                  </button>
                )}
                <button
                  onClick={() => setDialog(null)}
                  className={`w-full rounded-lg bg-black/20 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all active:scale-95 cursor-pointer`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
