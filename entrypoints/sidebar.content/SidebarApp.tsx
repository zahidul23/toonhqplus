import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { groupTypes } from './groupTypes';
import { gags as gagsConfig } from './gags';
import { cogs as cogsConfig } from './cogs';
import { ShtickerBook } from './ShtickerBook.tsx';
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
  clearNotes,
  getSetting,
  getSettings,
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
  NOTES_ENABLED: 'toonhqplus-notes-enabled',
  ACTIVE_TAB: 'toonhqplus-active-tab',
} as const;

interface ToonData {
  id: ToonId;
  name: string;
  species?: number;
  color?: string;
  laff?: number;
  level?: number;
  photo?: string;
  photo_bg?: string;
  ring?: string | null;
  toonup?: number;
  trap?: number;
  lure?: number;
  sound?: number;
  throw?: number;
  squirt?: number;
  drop?: number;
  prestiges?: string[];
  organic_level?: number | null;
  sellbot?: string | number;
  cashbot?: string | number;
  lawbot?: string | number;
  bossbot?: string | number;
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
    setDisplay(formatRelativeTime(date));
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
    await addToList(toonStore, toonId);
    await removeFromList(otherStore, toonId);
    await putToon({
      id: toonId,
      name: toon.name || '',
      species: toon.species,
      color: toon.color,
      laff: toon.laff,
      level: toon.level,
      photo: toon.photo,
      photo_bg: toon.photo_bg,
      ring: toon.ring,
      toonup: toon.toonup,
      trap: toon.trap,
      lure: toon.lure,
      sound: toon.sound,
      throw: toon.throw,
      squirt: toon.squirt,
      drop: toon.drop,
      prestiges: toon.prestiges,
      organic_level: toon.organic_level,
      sellbot: toon.sellbot,
      cashbot: toon.cashbot,
      lawbot: toon.lawbot,
      bossbot: toon.bossbot,
      lastSeen: new Date().toISOString(),
    });

    if (note !== undefined) {
      await setNote(toonId, note);
    }
  }
}

// GAG_TRACKS is replaced by gagsConfig from gags.ts

const SUIT_TRACKS = [
  { name: 'Sellbot', key: 'sellbot', color: '#7b00ae' },
  { name: 'Cashbot', key: 'cashbot', color: '#108000' },
  { name: 'Lawbot', key: 'lawbot', color: '#2e5db1' },
  { name: 'Bossbot', key: 'bossbot', color: '#8c5d3d' },
];

const decodeSuit = (trackId: string, suitCode: string | number | undefined) => {
  if (suitCode == null) return null;
  const s = String(suitCode).padStart(4, '0');

  const cogHex = s[0];
  const versionDigit = s[1];
  const levelHex = s.substring(2);

  const cogIndex = parseInt(cogHex, 16) - 1;
  const isVersion2 = versionDigit === '2';
  const level = parseInt(levelHex, 16);

  if (cogIndex < 0 || level === 0) return null;

  const track = cogsConfig.find((t) => t.id === trackId);
  const rank = track?.ranks[cogIndex];

  if (!rank) return null;

  return {
    name: rank.name,
    image: rank ? `https://toonhq.org/static/assets/cogs/${rank.image}` : null,
    level,
    isVersion2,
  };
};

function ToonTooltip({ toon, isFavorited, isBlocked, note }: { toon: ToonData, isFavorited: boolean, isBlocked: boolean, note?: string }) {
  if (!toon) return null;
  let toonClass = 'myToon';
  if (isFavorited) {
    toonClass = 'favoritedToon';
  } else if (isBlocked) {
    toonClass = 'blockedToon';
  }

  return (
    <div className={`toon-tooltip w-[19rem] ${toonClass} border border-emerald-500/30 rounded-xl shadow-2xl p-4 flex flex-col gap-5 text-white pointer-events-none animate-in fade-in duration-200`} >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-full" />
          {(() => {
            const photo = getToonPhoto(toon);
            return photo ? (
              <img
                src={photo}
                alt={toon.name}
                className="relative h-16 w-auto max-w-none rounded-full border-2 border-white/20 bg-black/40 object-cover shadow-lg"
              />
            ) : (
              <div className="relative h-16 w-auto max-w-none rounded-full border-2 border-white/20 bg-black/40 flex items-center justify-center text-white/20 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
            );
          })()}
        </div>
        <div className="flex flex-col min-w-0">
          <h4 className="font-bold text-lg leading-tight break-words">
            {toon.name}{' '}
            {toon.laff != null && (
              <span className="text-emerald-400 font-black text-sm tabular-nums">({toon.laff})</span>
            )}
          </h4>
        </div>
      </div>

      {note && (
        <p className="text-xs italic text-white/80 break-words pl-2 pr-2">{note}</p>
      )}
      <div className="flex flex-col rounded-lg border border-white/10 bg-black/40 shadow-inner overflow-hidden">
        {gagsConfig.map((track) => {
          const level = (toon[track.id] as number) || 0;
          const isPrestiged = toon.prestiges?.includes(track.id);
          const isMissing = level === 0;
          const organicLvl = isPrestiged ? toon.organic_level || 0 : 0;

          return (
            <div
              key={track.id}
              className={`flex h-9 p-1 items-center gap-0.5 border-b border-white/10 last:border-0 transition-all ${isMissing ? 'opacity-20 grayscale' : 'opacity-100'}`}
              style={{ background: isMissing ? undefined : `${track.color}11` }}
            >
              {track.gags.map((gag, idx) => {
                const gagLvl = idx + 1;
                const isUnlocked = level >= gagLvl;
                return (
                  <div
                    key={gag.name}
                    className={`flex-1 h-full flex items-center justify-center relative transition-all duration-300 rounded-sm ${isUnlocked ? 'opacity-100 scale-100 shadow-lg' : 'opacity-10 scale-90 grayscale-10'}`}
                    style={{
                      backgroundColor: track.color,
                    }}
                    title={`${gagLvl}: ${gag.name}`}
                  >
                    <img
                      src={`https://toonhq.org/static/assets/gags/${gag.image}`}
                      alt={gag.name}
                      draggable="false"
                      className="w-6 h-6 object-contain drop-shadow-md"
                    />
                    {isPrestiged && isUnlocked && organicLvl >= gagLvl && (
                      <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                        <img
                          src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                          alt="Organic"
                          className="w-5 h-5 object-contain"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 px-1">
        {SUIT_TRACKS.map((suit) => {
          const suitData = decodeSuit(suit.key, toon[suit.key]);
          return (
            <div
              key={suit.name}
              className={`flex flex-col gap-1 rounded-lg p-2 border relative overflow-hidden group/suit transition-all duration-300 ${suitData ? 'shadow-xl border-white/20' : 'bg-black/20 border-white/5'}`}
              style={{
                backgroundColor: suitData ? suit.color : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-black uppercase tracking-widest ${suitData ? 'text-white/80' : 'text-white/30'}`}>
                  {suit.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {suitData?.image ? (
                  <img src={suitData.image} alt={suitData.name} className="w-5 h-5 object-contain" />
                ) : (
                  <svg className="w-5 h-5 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                )}
                <div className="flex flex-col">
                  {suitData ? (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] font-black tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                          {`Lvl ${suitData.level}`}
                        </span>
                        {suitData.isVersion2 && (
                          <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter self-end mb-0.5">V2.0</span>
                        )}
                      </div>
                      <span className="text-[8px] font-medium text-white/70 leading-tight truncate max-w-[80px]" title={suitData.name}>
                        {suitData.name}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div >
  );
}


function loadLists(): Promise<{ favorites: ToonId[]; blocked: ToonId[] }> {
  return Promise.all([
    getAllFromList('toony_toons'),
    getAllFromList('stinky_toons'),
  ]).then(([favorites, blocked]) => ({ favorites, blocked }));
}

function ToonRow({
  toon,
  isFavorited,
  isBlocked,
  isOwnToon,
  note,
  refresh,
  isHovered,
  isJustAdded,
  onRequestDialog,
  onMouseEnter,
  onMouseLeave
}: {
  toon: ToonData;
  isFavorited: boolean;
  isBlocked: boolean;
  isOwnToon: boolean;
  note?: string;
  refresh: () => void;
  isHovered: boolean;
  isJustAdded?: boolean;
  onRequestDialog: (type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'sidebar' | 'main') => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || '');

  useEffect(() => {
    setNoteDraft(note || '');
  }, [note]);

  const listKey = isFavorited ? STORAGE_KEYS.FAVORITES : isBlocked ? STORAGE_KEYS.BLOCKED : null;

  const defaultHoverClass = isBlocked ? 'blockedToon shadow-md ring-1 ring-red-400' : 'bg-[#1f8454] shadow-md ring-1 ring-emerald-400';
  let bgColorClass = isHovered ? defaultHoverClass : 'hover:bg-[#10462d]/60';
  let textColorClass = 'text-white';

  if (isJustAdded) {
    bgColorClass = isBlocked ? 'blockedToon ring-2 ring-red-400' : 'bg-emerald-500/60 ring-2 ring-emerald-400';
  } else if (!isHovered) {
    if (isOwnToon) {
      bgColorClass = 'bg-[#cae9fcbd]';
      textColorClass = 'text-[#cae9fc]';
    } else if (isFavorited) {
      bgColorClass = 'bg-[#e6ffed]/20';
      textColorClass = 'text-[#e6ffed]';
    } else if (isBlocked) {
      bgColorClass = 'bg-[#ad130dde]';
      textColorClass = 'text-[#ffebe9]';
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative flex flex-col gap-1 rounded px-2 py-1.5 text-sm transition-all duration-250 ${bgColorClass} ${textColorClass}`}
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
                    className={`shrink-0 rounded p-1 cursor-pointer transition-colors ${isBlocked
                      ? 'text-red-400/70 hover:bg-red-600 text-red-300/60'
                      : 'text-green-100/50 hover:bg-[#1f8454] hover:text-white'
                      }`}
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
                    className={`shrink-0 rounded p-1 text-green-100/50 hover:text-white cursor-pointer transition-colors ${isBlocked ? 'hover:bg-red-600' : 'hover:bg-emerald-600'}`}
                    title={listKey === STORAGE_KEYS.FAVORITES ? "Move to Stinky Toons" : "Move to Toony Toons"}
                  >
                    {listKey === STORAGE_KEYS.FAVORITES ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (listKey) onRequestDialog('remove', listKey, toon, 'sidebar');
                    }}
                    className="shrink-0 rounded p-1 text-[#cf222e] text-[#ff7b72] hover:bg-[#ad130dde] cursor-pointer"
                    title="Remove from list"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.BLOCKED, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-red-600 hover:text-white cursor-pointer"
                    title="Add to Stinky Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className={`mt-2 flex flex-col gap-2 rounded border bg-black/60 p-2 shadow-inner ${isBlocked ? 'border-red-500/40' : 'border-[#1f8454]/40'}`}>
          <textarea
            autoFocus
            className={`w-full flex-1 resize-y custom-scrollbar max-h-32 rounded border bg-black/20 px-2 py-1 text-xs text-white focus:outline-none transition-colors ${isBlocked
              ? 'border-red-500/60 placeholder-red-200/40 focus:border-red-400'
              : 'border-[#1f8454] placeholder-green-100/30 focus:border-green-400'
              }`}
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
              className={`shrink-0 rounded px-2 py-1 text-xs text-white cursor-pointer transition-colors ${isBlocked ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
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
        <div className={`ml-8 whitespace-pre-wrap text-xs leading-snug italic ${isBlocked ? 'text-red-300/80' : 'text-green-100/80'}`}>
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
    const items = [...newConfig[from]].filter(itemId => itemId !== id);
    newConfig[from] = items;

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

    const targetIndex = e.clientY < midY ? index : index + 1;
    setDragOverInfo({ list, index: targetIndex });
  };

  const onDrop = (e: React.DragEvent, targetList: 'pinned' | 'dropdown', targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    const sourceList = config.pinned.includes(id) ? 'pinned' : 'dropdown';
    let finalIndex = targetIndex !== undefined ? targetIndex : config[targetList].length;

    if (sourceList === targetList) {
      const items = [...config[targetList]];
      const oldIndex = items.indexOf(id);
      if (oldIndex !== -1) {
        items.splice(oldIndex, 1);
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

const TOOLTIP_GAP = 24; // px gap between tooltip and the anchor row

function TooltipAnchor({
  anchorRect,
  children,
}: {
  anchorRect: { top: number; left: number; height: number };
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden', position: 'fixed' });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const tooltipHeight = el.offsetHeight;
    const tooltipWidth = el.offsetWidth;
    const vh = window.innerHeight;
    const PADDING = 8; // min distance from viewport edge

    // Vertical: centre on the anchor row, clamped within viewport
    const idealTop = anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2;
    const top = Math.max(PADDING, Math.min(vh - tooltipHeight - PADDING, idealTop));

    // Horizontal: place tooltip to the left of the anchor, clamped within viewport
    const idealLeft = anchorRect.left - tooltipWidth - TOOLTIP_GAP;
    const left = Math.max(PADDING, idealLeft);

    setStyle({ position: 'fixed', top, left, visibility: 'visible' });
  }, [anchorRect]);

  return (
    <div ref={ref} style={style} className="z-[2147483648] pointer-events-none">
      {children}
    </div>
  );
}

export function SidebarApp() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'toons' | 'settings'>('history');
  const [favorites, setFavorites] = useState<ToonId[]>([]);
  const [blocked, setBlocked] = useState<ToonId[]>([]);
  const [historyToons, setHistoryToons] = useState<Record<ToonId, ToonData>>({});
  const [historyGroups, setHistoryGroups] = useState<Record<number, any>>({});
  const [historyGroupMembers, setHistoryGroupMembers] = useState<Record<number, any>>({});
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [navbarConfig, setNavbarConfig] = useState<{ pinned: string[]; dropdown: string[] }>({
    pinned: ['invasions', 'groups', 'fishing', 'ccg'],
    dropdown: ['field-offices', 'gardening', 'doodles'],
  });
  const [bossInfoEnabled, setBossInfoEnabled] = useState(true);
  const [notesEnabled, setNotesEnabled] = useState(true);
  const [activeToonIds, setActiveToonIds] = useState<ToonId[]>([]);
  const [justAddedId, setJustAddedId] = useState<ToonId | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogNote, setDialogNote] = useState('');

  // Tooltip tracking state
  const [hoveredToonId, setHoveredToonId] = useState<string | null>(null);
  const [hoveredToonName, setHoveredToonName] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<'sidebar' | 'main' | null>(null);
  const [hoveredRect, setHoveredRect] = useState<{ top: number; left: number; height: number } | null>(null);

  const refresh = useCallback(async () => {
    const [{ favorites: f, blocked: b }, toonsArr, groups, groupMembers, allNotes, ids] = await Promise.all([
      loadLists(),
      getAllToons(),
      getAllGroups(),
      getAllGroupMembers(),
      getAllNotes(),
      getSetting<string[]>('active-toon-ids'),
    ]);

    setFavorites(f);
    setBlocked(b);
    setNotes(allNotes);
    if (ids) setActiveToonIds(ids);

    const toonsMap: Record<ToonId, ToonData> = {};
    for (const t of toonsArr) toonsMap[t.id] = t;
    setHistoryToons(toonsMap);

    const groupsMap: Record<number, any> = {};
    for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
    setHistoryGroups(groupsMap);

    const historyGroupMembersMap: Record<number, any> = {};
    groupMembers.forEach((m) => {
      if (historyGroupMembersMap[m.groupId]) {
        historyGroupMembersMap[m.groupId].toons.push({ toonId: m.toonId, left: m.left });
      } else {
        historyGroupMembersMap[m.groupId] = { toons: [{ toonId: m.toonId, left: m.left }] };
      }
    });
    setHistoryGroupMembers(historyGroupMembersMap);
  }, []);

  const handleClearHistory = useCallback(() => {
    setDialog({ isOpen: true, type: 'clear_history', source: 'sidebar' });
  }, []);

  const handleClearToons = useCallback(() => {
    setDialog({ isOpen: true, type: 'clear_toons', source: 'sidebar' });
  }, []);

  const handleResetNavbar = useCallback(() => {
    setDialog({ isOpen: true, type: 'reset_navigation', source: 'sidebar' });
  }, []);

  const handleDeleteGroup = useCallback((e: React.MouseEvent, groupId: number) => {
    e.stopPropagation();
    setDialog({ isOpen: true, type: 'delete_group', groupId, source: 'sidebar' });
  }, []);

  const handleRequestDialog = useCallback(
    (type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'sidebar' | 'main') => {
      const isFavorited = favorites.includes(toon.id);
      const isBlocked = blocked.includes(toon.id);
      const otherListName = listKey === STORAGE_KEYS.FAVORITES ? 'Stinky Toons' : 'Toony Toons';

      let actualType = type;
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
        otherListName,
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
    },
    [favorites, blocked, open, notes]
  );

  useEffect(() => {
    const handleHover = (e: Event) => {
      const customEvent = e as CustomEvent;
      setHoveredToonId(customEvent.detail?.id?.toString() || null);
      setHoveredToonName(customEvent.detail?.name || null);
      setHoverSource(customEvent.detail?.source || 'main');
      if (customEvent.detail?.rect) {
        setHoveredRect(customEvent.detail.rect);
      }
    };
    const handleUnhover = () => {
      setHoveredToonId(null);
      setHoveredToonName(null);
      setHoverSource(null);
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
    getSettings(['sidebar-open', 'active-tab', 'boss-info-enabled', 'notes-enabled']).then(values => {
      if (values['sidebar-open'] !== undefined) setOpen(!!values['sidebar-open']);
      if (values['active-tab'] !== undefined) setActiveTab(values['active-tab']);
      if (values['boss-info-enabled'] !== undefined) setBossInfoEnabled(!!values['boss-info-enabled']);
      if (values['notes-enabled'] !== undefined) setNotesEnabled(!!values['notes-enabled']);
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
        getAllGroupMembers().then(groupMembers => {
          const historyGroupMembersMap: Record<number, any> = {};
          groupMembers.forEach(m => {
            if (historyGroupMembersMap[m.groupId]) {
              historyGroupMembersMap[m.groupId].toons.push({ toonId: m.toonId, left: m.left });
            } else {
              historyGroupMembersMap[m.groupId] = { toons: [{ toonId: m.toonId, left: m.left }] };
            }
          });
          setHistoryGroupMembers(historyGroupMembersMap);
        });
      }
      if (store === 'toons') {
        getAllToons().then(toonsArr => {
          const toonsMap: Record<ToonId, any> = {};
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
        getSetting<boolean>('notes-enabled').then(v => { if (v !== undefined) setNotesEnabled(v !== false); });
        getSetting<string>('active-tab').then(v => { if (v) setActiveTab(v as any); });
        getSetting<boolean>('sidebar-open').then(v => { if (v !== undefined) setOpen(!!v); });
        getSetting<string[]>('active-toon-ids').then(ids => { if (ids) setActiveToonIds(ids); });
      }
    };
    window.addEventListener('toonhqplus-db-changed', handleDbChange);
    return () => {
      window.removeEventListener('toonhqplus-db-changed', handleDbChange);
    };
  }, [refresh]);

  return (
    <>
      <ShtickerBook />


      <div className="fixed top-0 right-0 z-[2147483647] flex h-screen max-h-screen flex-col items-end p-4 pointer-events-none overflow-hidden">
        <div className="mb-2 pointer-events-auto">
          <button
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
          <aside className="w-80 flex flex-col min-h-0 max-h-[90vh] rounded-lg border border-[#0a2e1d] bg-[#10462d] shadow-xl overflow-hidden pointer-events-auto shrink-0">
            <div className="flex border-b border-[#0a2e1d]/80 bg-[#0c3622]">
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'history' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
                onClick={() => {
                  setActiveTab('history');
                  setSelectedHistoryGroup(null);
                  setSetting('active-tab', 'history').catch(console.error);
                }}
              >
                History
              </button>
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'toons' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
                onClick={() => {
                  setActiveTab('toons');
                  setSetting('active-tab', 'toons').catch(console.error);
                }}
              >
                Toons
              </button>
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'settings' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
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
                  <section className="mb-3 flex-[1_1_auto] flex flex-col min-h-2">
                    <h3 className="mb-1 shrink-0 text-sm font-medium text-green-50">Toony Toons</h3>
                    <ul className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                      {favorites.length === 0 ? (
                        <div className="py-8 text-center text-green-200/40 italic">No toony toons yet.</div>
                      ) : (
                        [...favorites].reverse().map((id) => {
                          const toon = historyToons[id];
                          if (!toon) return null;
                          const isHovered =
                            (hoveredToonId && String(toon.id) === hoveredToonId) ||
                            (hoveredToonName && toon.name === hoveredToonName);
                          return (
                            <ToonRow
                              key={toon.id}
                              toon={toon}
                              isFavorited={favorites.includes(toon.id)}
                              isBlocked={blocked.includes(toon.id)}
                              isOwnToon={activeToonIds.includes(toon.id)}
                              note={notes[String(toon.id)]}
                              refresh={refresh}
                              isHovered={!!isHovered}
                              isJustAdded={justAddedId === toon.id}
                              onRequestDialog={handleRequestDialog}
                              onMouseEnter={(e) => {
                                setHoveredToonId(String(toon.id));
                                setHoveredToonName(toon.name);
                                setHoverSource('sidebar');
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredRect({ top: rect.top, left: rect.left, height: rect.height });
                              }}
                              onMouseLeave={() => {
                                setHoveredToonId(null);
                                setHoveredToonName(null);
                                setHoverSource(null);
                                setHoveredRect(null);
                              }}
                            />
                          );
                        })
                      )}
                    </ul>
                  </section>

                  <section className="flex-[1_1_auto] flex flex-col min-h-2">
                    <h3 className="mb-1 shrink-0 text-sm font-medium text-green-50">Stinky Toons</h3>
                    <ul className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                      {blocked.length === 0 ? (
                        <div className="py-8 text-center text-green-200/40 italic">No stinky toons yet.</div>
                      ) : (
                        [...blocked].reverse().map((id) => {
                          const toon = historyToons[id];
                          if (!toon) return null;
                          const isHovered =
                            (hoveredToonId && String(toon.id) === hoveredToonId) ||
                            (hoveredToonName && toon.name === hoveredToonName);
                          return (
                            <ToonRow
                              key={toon.id}
                              toon={toon}
                              isFavorited={favorites.includes(toon.id)}
                              isBlocked={blocked.includes(toon.id)}
                              isOwnToon={activeToonIds.includes(toon.id)}
                              note={notes[String(toon.id)]}
                              refresh={refresh}
                              isHovered={!!isHovered}
                              isJustAdded={justAddedId === toon.id}
                              onRequestDialog={handleRequestDialog}
                              onMouseEnter={(e) => {
                                setHoveredToonId(String(toon.id));
                                setHoveredToonName(toon.name);
                                setHoverSource('sidebar');
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredRect({ top: rect.top, left: rect.left, height: rect.height });
                              }}
                              onMouseLeave={() => {
                                setHoveredToonId(null);
                                setHoveredToonName(null);
                                setHoverSource(null);
                                setHoveredRect(null);
                              }}
                            />
                          );
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
                        <h3 className="text-sm font-medium text-green-50">Recent Groups</h3>
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
                                    className="w-full text-left rounded border border-black/50 bg-black/40 hover:bg-black/60 p-3 shadow-sm transition-colors flex justify-between items-center cursor-pointer"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="block text-sm font-bold text-white truncate">{groupName}</span>
                                      <span className="block text-xs text-green-200 mt-1">
                                        <RelativeTime date={group.userJoinedAt || group.created} />
                                      </span>
                                    </div>
                                    <div className="text-sm font-medium text-emerald-300 shrink-0">
                                      {groupMembers?.toons?.length} toon{groupMembers?.toons?.length === 1 ? '' : 's'}
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
                      <ul className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                        {(() => {
                          const group = historyGroups[selectedHistoryGroup];
                          const toons = historyGroupMembers[group.id]?.toons;

                          const userActiveIds: ToonId[] = [];
                          const otherActiveIds: ToonId[] = [];
                          const userLeftIds: ToonId[] = [];
                          const otherLeftIds: ToonId[] = [];

                          (toons).forEach((toon: { toonId: ToonId, left: boolean }) => {
                            const isUserToon = activeToonIds.includes(toon.toonId);
                            const hasLeft = toon.left;

                            if (isUserToon) {
                              if (hasLeft) userLeftIds.push(toon.toonId);
                              else userActiveIds.push(toon.toonId);
                            } else {
                              if (hasLeft) otherLeftIds.push(toon.toonId);
                              else otherActiveIds.push(toon.toonId);
                            }
                          });

                          const renderRows = (targetIds: ToonId[]) =>
                            targetIds.map((id: ToonId) => {
                              const toonData = historyToons[id];
                              if (!toonData) return null;
                              const isHovered =
                                (hoveredToonId && String(toonData.id) === hoveredToonId) ||
                                (hoveredToonName && toonData.name === hoveredToonName);
                              return (
                                <ToonRow
                                  key={toonData.id}
                                  toon={toonData}
                                  isFavorited={favorites.includes(toonData.id)}
                                  isBlocked={blocked.includes(toonData.id)}
                                  isOwnToon={activeToonIds.includes(toonData.id)}
                                  note={notes[String(toonData.id)]}
                                  refresh={refresh}
                                  isHovered={!!isHovered}
                                  isJustAdded={justAddedId === toonData.id}
                                  onRequestDialog={handleRequestDialog}
                                  onMouseEnter={(e) => {
                                    setHoveredToonId(String(toonData.id));
                                    setHoveredToonName(toonData.name);
                                    setHoverSource('sidebar');
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredRect({ top: rect.top, left: rect.left, height: rect.height });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredToonId(null);
                                    setHoveredToonName(null);
                                    setHoverSource(null);
                                    setHoveredRect(null);
                                  }}
                                />
                              );
                            });
                          return (
                            <>
                              {userActiveIds.length > 0 && (
                                <>
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-green-200/50 px-1 py-1">Your Toons</div>
                                  {renderRows(userActiveIds)}
                                </>
                              )}
                              {otherActiveIds.length > 0 && (
                                <>
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-green-200/50 px-1 py-1 mt-2">Group Members</div>
                                  {renderRows(otherActiveIds)}
                                </>
                              )}
                              {(userLeftIds.length > 0 || otherLeftIds.length > 0) && (
                                <>
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-green-200/50 px-1 py-1 mt-2 opacity-50">Toons that left</div>
                                  <div className="opacity-60">{renderRows([...userLeftIds, ...otherLeftIds])}</div>
                                </>
                              )}
                            </>
                          )

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
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Show Group Tiers</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Shows Fires for CEOs, Lawyers for CJs, and estimated Merits, Cogbucks, Jury Notices, and Stock Options from facilities.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !bossInfoEnabled;
                            setBossInfoEnabled(next);
                            setSetting('boss-info-enabled', next).catch(console.error);
                            window.location.replace(window.location.href);
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${bossInfoEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${bossInfoEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Show Toon Notes</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Shows notes for saved Toony and Stinky Toons directly in the group members list.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !notesEnabled;
                            setNotesEnabled(next);
                            setSetting('notes-enabled', next).catch(console.error);
                            window.location.replace(window.location.href);
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${notesEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${notesEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
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
        )}
      </div>
      {dialog && dialog.isOpen && (
        <div
          className={`fixed inset-0 z-[2147483647] bg-black/40 animate-in fade-in duration-200 flex ${dialog.source === 'main' ? 'items-center justify-center p-4' : 'items-start justify-end p-4 pt-16'}`}
          onClick={() => setDialog(null)}
        >
          <div
            className={`w-full max-w-xs rounded-xl border border-white/20 p-5 shadow-2xl animate-in zoom-in-95 duration-200 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'bg-[#450a0a]' : 'bg-[#0c3622]'} ${dialog.source === 'main' ? '' : 'mr-4'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {(dialog.type === 'delete_group' || dialog.type === 'clear_history' || dialog.type === 'clear_toons' || dialog.type === 'reset_navigation') ? (
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
            ) : dialog.toon ? (
              <div className="mb-4 flex flex-col items-center gap-3 text-center">
                {(() => {
                  const photo = getToonPhoto(dialog.toon);
                  return photo ? (
                    <img src={photo} className={`h-16 w-16 rounded-full border-2 shadow-md bg-black/10 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'border-red-400' : 'border-emerald-400'}`} alt="" />
                  ) : null;
                })()}
                <div>
                  <h4 className="text-lg font-bold text-white leading-tight">
                    {dialog.toon!.name}
                    {dialog.toon!.laff != null && <span className="ml-1.5 opacity-60">({dialog.toon!.laff})</span>}
                  </h4>
                  <p className={`text-sm opacity-90 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'text-red-100' : 'text-green-200'}`}>
                    {dialog.type === 'remove' ? `Remove from ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                      dialog.type === 'move' ? `Move to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                        `Add to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?`}
                  </p>
                </div>
              </div>
            ) : null}

            {(dialog.type === 'add' || dialog.type === 'move') && (
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-green-300 opacity-80">
                  Private Note
                </label>
                <textarea
                  autoFocus
                  className={`w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all shadow-inner custom-scrollbar resize-y min-h-[5rem] max-h-32 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'focus:border-red-400 focus:ring-red-400' : 'focus:border-emerald-400 focus:ring-emerald-400'}`}
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
                      clearNotes(),
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
                    updateToonList(dialog.type, dialog.listKey!, dialog.toon, dialogNote).then(() => {
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
                className="w-full rounded-lg bg-black/20 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {(() => {
        const hoveredToon = hoveredToonId
          ? historyToons[String(hoveredToonId)]
          : hoveredToonName
            ? Object.values(historyToons).find((t) => t.name === hoveredToonName)
            : null;
        if (!hoveredToon || !hoveredRect) return null;
        return (
          <TooltipAnchor anchorRect={hoveredRect}>
            <ToonTooltip
              toon={hoveredToon}
              isFavorited={favorites.includes(hoveredToon.id)}
              isBlocked={blocked.includes(hoveredToon.id)}
              note={notes[String(hoveredToon.id)]}
            />
          </TooltipAnchor>
        );
      })()}
    </>
  );
}
