import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getSetting, setSetting } from './db';
import type { ToonTrackerData } from './tracker';
import { browser } from 'wxt/browser';
import { cogs as cogsData } from './cogs';
import { gags as gagsConfig } from './gags';
import { SOS_DATA } from './sosData';
import {
  REWARD_HIGHLIGHT_MS,
  RECENT_REWARD_LIMIT,
  groupRewardHistory,
  isDeepEqual
} from './trackerUtils';
import type { RewardCategory, RewardHistoryEntry, RewardGroup } from './trackerUtils';
import { normalizeToonOrderSetting, orderTrackerToons } from './toonOrder';
import { requestRewardNotificationPermissionWithFallback } from '../lib/rewardNotificationPermission';
import { UniteInventory, getUniteImage } from './components/UniteInventory';
import type { UniteLayout, UniteCategory } from './components/UniteInventory';
import { RemoteInventory } from './components/RemoteInventory';

function getExtensionImageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  try {
    return browser.runtime.getURL(cleanPath as any);
  } catch (e) {
    return `/${cleanPath}`;
  }
}

const GAG_ASSET_BASE_URL = 'https://toonhq.org/static/assets/gags';
const gagTracks = gagsConfig as Array<{
  id: string;
  name: string;
  color: string;
  gags: Array<{ name: string; image: string }>;
}>;

function getGagImageUrl(image: string): string {
  return `${GAG_ASSET_BASE_URL}/${image}`;
}

function ToonGagsStrip({ gags }: { gags?: Record<string, any> }) {
  return (
    <div className="flex items-center gap-1.5 w-full">
      {gagTracks.map((track) => {
        const gagData = gags?.[track.name] ?? null;
        const level = typeof gagData?.gag?.level === 'number' ? gagData.gag.level : 1;
        const gag = track.gags[Math.max(0, Math.min(track.gags.length - 1, level - 1))] ?? track.gags[0];
        const obtained = !!gagData?.gag;
        const xpRequired = (obtained && level !== 7 && gagData?.experience) ? ` - ${gagData.experience.next - gagData.experience.current} to go` : '';
        const title = obtained
          ? `${track.name}: ${gagData?.gag?.name} (Lv. ${level}) ${xpRequired}`
          : `${track.name}less`;

        return (
          <div
            key={track.id}
            className={`h-7 w-7 rounded-full border bg-black/35 p-1 flex items-center justify-center shrink-0 transition-all ${obtained ? 'border-white/15' : 'border-white/5 opacity-35 grayscale'}`}
            style={obtained ? { boxShadow: `inset 0 0 0 1px ${track.color}55` } : undefined}
            title={title}
          >
            <img src={getGagImageUrl(gag.image)} alt={title} className="h-full w-full object-contain" />
          </div>
        );
      })}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSeconds < 10) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function getLaffColorClass(current: number, max: number): string {
  if (max <= 0) return 'text-white/40';
  const ratio = current / max;
  if (ratio < 1 / 3) return 'text-red-400';
  if (ratio < 2 / 3) return 'text-yellow-400';
  return 'text-emerald-400';
}

const RelativeRewardTime = React.memo(({ timestamp }: { timestamp: number }) => {
  const [display, setDisplay] = useState(() => formatRelativeTime(timestamp));

  useEffect(() => {
    setDisplay(formatRelativeTime(timestamp));
    const update = () => setDisplay(formatRelativeTime(timestamp));
    const intervalId = window.setInterval(update, 30000);
    return () => window.clearInterval(intervalId);
  }, [timestamp]);

  return <span>{display}</span>;
});

const RewardHistoryGroup = React.memo(({ group }: { group: RewardGroup }) => {
  const [isRecent, setIsRecent] = useState(() => isRecentlyEarned(group.timestamp));

  useEffect(() => {
    if (!isRecent) return;
    const remaining = REWARD_HIGHLIGHT_MS - (Date.now() - group.timestamp);
    if (remaining <= 0) {
      setIsRecent(false);
      return;
    }
    const timer = setTimeout(() => setIsRecent(false), remaining + 100);
    return () => clearTimeout(timer);
  }, [group.timestamp, isRecent]);

  return (
    <div className={`relative overflow-hidden px-3 py-2 transition-colors ${isRecent ? 'tracker-reward-recent' : 'hover:bg-white/[0.02]'}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-0 py-0.5">
          {group.entries.map((entry, i) => (
            <RewardMessage key={i} entry={entry} />
          ))}
        </div>
        <span className="relative z-[1] text-[10px] font-black text-white/30 tabular-nums shrink-0 uppercase text-right pt-0.5" title={new Date(group.timestamp).toLocaleString()}>
          <RelativeRewardTime timestamp={group.timestamp} />
        </span>
      </div>
    </div>
  );
});

function isRecentlyEarned(timestamp: number): boolean {
  return Date.now() - timestamp <= REWARD_HIGHLIGHT_MS;
}

const REWARD_CATEGORIES_CONFIG = [
  { id: 'sos', label: 'SOS Cards', img: 'sos.webp' },
  { id: 'unites', label: 'Unites', img: 'unites.webp' },
  { id: 'summons', label: 'Cog Summons', img: 'summons.webp' },
  { id: 'pinkslips', label: 'Pink Slips', img: 'pinkslips.webp' },
  { id: 'remotes', label: 'Remotes', img: 'remotes.webp' }
] as const;

const REWARD_CATEGORY_STORAGE_KEY = 'toonhqplus_shtickerbook_reward_category';
const UNITE_LAYOUT_STORAGE_KEY = 'toonhqplus_shtickerbook_unite_layout';
let rewardHeadingFontPromise: Promise<void> | undefined;

function isRewardCategory(value: unknown): value is RewardCategory {
  return value === 'analytics' || REWARD_CATEGORIES_CONFIG.some(category => category.id === value);
}

const RewardMessage = React.memo(({ entry }: { entry: RewardHistoryEntry }) => {
  if (entry.message) return <span className="text-white/50 text-[11px] font-bold">{entry.message}</span>;

  const { category, item, amount, metadata } = entry;

  // Colors matched to cog suit departments
  const tagConfig: Record<string, { label: string; bg: string; text: string }> = {
    sos: { label: 'SOS', bg: '#6b21a8', text: '#f3e8ff' }, // Sellbot purple
    unites: { label: 'Unite', bg: '#14532d', text: '#dcfce7' }, // Cashbot green
    summons: { label: 'Summon', bg: '#1e3a5f', text: '#dbeafe' }, // Lawbot navy
    pinkslips: { label: 'Pink Slip', bg: '#4a3728', text: '#fafaf9' }, // Bossbot brown
    remotes: { label: 'Remote', bg: '#991b1b', text: '#fee2e2' }, // red
  };
  const tag = tagConfig[category] ?? { label: category, bg: '#1f2937', text: '#f9fafb' };

  // Build human-readable subtype label
  let subtype: string | null = item;
  if (category === 'pinkslips') {
    subtype = null;
  } else if (category === 'summons') {
    subtype = `${item} (${metadata?.summonType ?? 'Cog'})`;
  } else if (category === 'remotes') {
    const level = metadata?.remoteLevel ?? item;
    const type = (metadata?.remoteType ?? item).replace(/\s*Remote$/i, '').trim();
    subtype = `${level}★ ${type}`;
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap leading-tight">
      <span
        className="inline-flex items-center px-1.5 py-[2px] rounded text-[9px] font-black uppercase tracking-wider shrink-0"
        style={{ backgroundColor: tag.bg, color: tag.text }}
      >
        {tag.label}
      </span>
      {subtype && (
        <span className="text-[11px] font-bold text-white/70">{subtype}</span>
      )}
      {amount > 1 && (
        <span className="text-[11px] font-black text-white">x{amount}</span>
      )}
    </span>
  );
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummonIcon({ active, type }: { active: boolean, type: 'cog' | 'bldg' | 'inv' }) {
  const tooltips = { cog: 'Cog', bldg: 'Building', inv: 'Invasion' };

  const icons = {
    cog: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    bldg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01" />
        <path d="M16 6h.01" />
        <path d="M8 10h.01" />
        <path d="M16 10h.01" />
        <path d="M8 14h.01" />
        <path d="M16 14h.01" />
      </svg>
    ),
    inv: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    )
  };

  return (
    <div
      title={tooltips[type]}
      className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${active
        ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_8px_rgba(147,51,234,0.5)]'
        : 'bg-black/40 border-white/5 text-white/10'
        }`}
    >
      {icons[type]}
    </div>
  );
}

const FACILITIES_DATA: Record<string, { items: { name: string; val: number }[] }> = {
  sell: { items: [{ name: 'Long Steel', val: 1630 }, { name: 'Short Steel, +5 Battles', val: 1503 }, { name: 'Short Steel, +4 Battles', val: 1376 }, { name: 'Short Steel, +3 Battles', val: 1249 }, { name: 'Short Steel, +2 Battles', val: 1121 }, { name: 'Short Steel, +1 Battle', val: 994 }, { name: 'Short Steel', val: 867 }, { name: 'Long Scrap', val: 638 }, { name: 'Short Scrap, +5 Battles', val: 590 }, { name: 'Short Scrap, +4 Battles', val: 542 }, { name: 'Short Scrap, +3 Battles', val: 494 }, { name: 'Short Scrap, +2 Battles', val: 446 }, { name: 'Short Scrap, +1 Battle', val: 398 }, { name: 'Short Scrap', val: 350 }, { name: 'Cog Building', val: 300 }] },
  cash: { items: [{ name: 'Bullion Mint', val: 1850 }, { name: 'Bullion Mint, Minimal', val: 1626 }, { name: 'Coin Mint', val: 807 }, { name: 'Coin Mint, Minimal', val: 702 }, { name: 'Cog Building', val: 300 }] },
  law: { items: [{ name: 'Senior Wing', val: 2082 }, { name: 'Senior Wing, Minimal', val: 1854 }, { name: 'Junior Wing', val: 889 }, { name: 'Junior Wing, Minimal', val: 781 }, { name: 'Cog Building', val: 300 }] },
  boss: { items: [{ name: 'Final Fringe', val: 2305 }, { name: 'Final Fringe, Minimal', val: 2097 }, { name: 'First Fairway', val: 975 }, { name: 'First Fairway, Minimal', val: 882 }, { name: 'Cog Building', val: 300 }] }
};

interface ToonHeaderProps {
  isExpanded: boolean;
  toonTrackerData: ToonTrackerData | null;
  activeInstances: any[];
  savedToons: any[];
  customOrder: string[] | null;
  selectedToonId: string | null;
  isDropdownOpen: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  toggleDropdown: (e: React.MouseEvent) => void;
  selectToon: (id: string | number) => void;
  removeSavedToon: (e: React.MouseEvent, id: string, name?: string) => void;
  startSync: (port?: string) => void;
  trackerEnabled: boolean | undefined;
}

const ToonHeader = React.memo(({
  isExpanded,
  toonTrackerData,
  activeInstances,
  savedToons,
  customOrder,
  selectedToonId,
  isDropdownOpen,
  dropdownRef,
  toggleDropdown,
  selectToon,
  removeSavedToon,
  startSync,
  trackerEnabled
}: ToonHeaderProps) => {
  const activeToonIds = activeInstances.map(instance => String(instance.toonId));
  const canonicallyOrderedToons = orderTrackerToons(savedToons, activeToonIds, customOrder);
  const canonicalPositions = new Map(canonicallyOrderedToons.map((toon, index) => [String(toon.id), index]));
  const orderedActiveInstances = [...activeInstances].sort((a, b) => {
    const aPosition = canonicalPositions.get(String(a.toonId));
    const bPosition = canonicalPositions.get(String(b.toonId));
    if (aPosition !== undefined || bPosition !== undefined) {
      if (aPosition === undefined) return 1;
      if (bPosition === undefined) return -1;
      if (aPosition !== bPosition) return aPosition - bPosition;
    }
    return parseInt(a.port) - parseInt(b.port);
  });
  const orderedOfflineToons = canonicallyOrderedToons
    .filter(toon => !activeToonIds.includes(String(toon.id)));

  return (
  <div className={`z-[300] py-2 flex items-center gap-3 relative border-b border-white/5 ${isExpanded ? 'px-1' : 'px-3'}`}>
    {trackerEnabled !== true ? (
      <div className="flex-1 flex items-center min-w-0 gap-3">
        <div className="w-10 h-10 rounded-full border border-white/10 bg-black/20 overflow-hidden shrink-0 relative flex items-center justify-center">
          <div className="w-full h-full flex items-center justify-center opacity-20 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </div>
        </div>
        <div className="flex-1 min-w-0 relative">
          <h3 className={`${isExpanded ? 'text-xl' : 'text-lg'} font-bold text-white/50 truncate`}>Toon Tracker</h3>
        </div>
      </div>
    ) : (
      <>
        <div className="flex-1 flex items-center min-w-0 gap-3 cursor-pointer group/header" ref={dropdownRef} onMouseDown={toggleDropdown}>
          <div className="w-10 h-10 rounded-full border border-white/10 bg-emerald-500/5 overflow-hidden shrink-0 relative flex items-center justify-center">
            {toonTrackerData ? (
              <img src={`https://rendition.toontownrewritten.com/render/${toonTrackerData.data.toon.style}/portrait/256x256.webp`} alt={toonTrackerData.data.toon.name} className="w-full h-full object-contain scale-[1.25]" />
            ) : (
              <div className="w-full h-full flex items-center justify-center opacity-20">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
          <div className="flex-1 min-w-0 relative">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className={`${isExpanded ? 'text-xl' : 'text-lg'} font-bold text-white truncate`}>{toonTrackerData ? toonTrackerData.data.toon.name : 'Toon Tracker'}</h3>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-white/20 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
            </div>
            <div className={`flex items-center gap-1.5 text-[9.5px] leading-none font-black uppercase tracking-widest truncate ${toonTrackerData && activeInstances.some(inst => String(inst.toonId) === String(toonTrackerData.data.toon.id)) ? 'text-emerald-400/80' : 'text-white/40'}`}>
              <span className="leading-none">
                {toonTrackerData ? (activeInstances.some(inst => String(inst.toonId) === String(toonTrackerData.data.toon.id)) ? 'Active' : 'Offline') : 'Select Toon'}
              </span>
              {toonTrackerData && (
                <span className={`leading-none tabular-nums ${activeInstances.some(inst => String(inst.toonId) === String(toonTrackerData.data.toon.id)) ? getLaffColorClass(toonTrackerData.data.laff.current, toonTrackerData.data.laff.max) : 'text-white/40'}`}>({toonTrackerData.data.laff.current}/{toonTrackerData.data.laff.max})</span>
              )}
            </div>
          </div>
        </div>

        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 mx-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-[150] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
              {activeInstances.length > 0 ? (
                <div className="mb-2">
                  <div className="px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 border-b border-white/5 mb-1 bg-black/20">
                    Active Games
                  </div>
                  {orderedActiveInstances.map((inst) => {
                    const gameNum = parseInt(inst.port) - 1546;
                    return (
                      <div
                        key={inst.port}
                        onMouseDown={(e) => { e.stopPropagation(); if (inst.authorized) selectToon(inst.toonId); }}
                        className={`flex items-center justify-between gap-3 p-2 mx-1 mt-1 rounded-lg ${inst.authorized ? 'hover:bg-white/5 cursor-pointer' : 'opacity-80'} transition-all group/item ${selectedToonId === inst.toonId ? 'bg-emerald-500/10 border border-emerald-500/10' : 'border border-transparent'}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {inst.authorized && inst.toonName && inst.toonName !== 'Unknown Toon' ? (
                            <>
                              <div className="flex items-center justify-center px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-black shrink-0 tracking-wider">GAME {gameNum}</div>
                              <span className={`text-[11.5px] font-bold truncate ${selectedToonId === inst.toonId ? 'text-emerald-300' : 'text-white/90'}`}>{inst.toonName}</span>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center justify-center px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-[9px] font-black shrink-0 tracking-wider">GAME {gameNum}</div>
                              <span className="text-[11px] font-bold truncate text-white/40 italic">Waiting...</span>
                            </div>
                          )}
                        </div>

                        {!inst.authorized ? (
                          <button
                            onMouseDown={(e) => { e.stopPropagation(); startSync(inst.port); }}
                            className="w-7 h-7 rounded-md bg-emerald-600/90 hover:bg-emerald-500 flex items-center justify-center transition-all text-white shadow hover:shadow-emerald-500/20 active:scale-95 shrink-0 border border-emerald-400/30"
                            title="Authorize Game"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.3" /></svg>
                          </button>
                        ) : (
                          selectedToonId === inst.toonId && (
                            <div className="w-5 h-5 flex items-center justify-center opacity-100 shrink-0">
                              <span className="flex w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-[10px] uppercase font-bold tracking-widest text-[#94a3b8]/60 leading-relaxed px-4">
                  No running games found.<br />Make sure Companion App Support is enabled in your game settings.
                </div>
              )}

              {orderedOfflineToons.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 border-b border-white/5 mb-1 bg-black/20">
                    Saved Toons
                  </div>
                  {orderedOfflineToons.map(t => (
                    <div key={t.id} onMouseDown={(e) => { e.stopPropagation(); selectToon(t.id); }} className={`flex items-center gap-3 p-2 mx-1 mt-1 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group/item ${selectedToonId === t.id ? 'bg-emerald-500/10 border border-emerald-500/10' : 'border border-transparent'}`}>
                      <div className="w-8 h-8 rounded-full border border-white/5 bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
                        <img src={`https://rendition.toontownrewritten.com/render/${t.style}/portrait/256x256.webp`} alt={t.name} className="w-full h-full object-contain scale-[1.3] grayscale opacity-50" />
                      </div>
                      <span className={`flex-1 text-[11.5px] font-bold truncate ${selectedToonId === t.id ? 'text-emerald-400' : 'text-white/60'}`}>{t.name}</span>
                      <button aria-label={`Delete ${t.name}`} title="Delete saved toon" onMouseDown={(e) => { e.stopPropagation(); removeSavedToon(e as any, t.id, t.name); }} className="cursor-pointer p-1.5 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all text-white/30 hover:bg-red-500/10 rounded pointer-events-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )}
  </div>
  );
});

type SOSTableSort = 'default' | 'count';

// Image mapping from CogCalculator.tsx
const SOS_IMAGES: Record<string, string> = {
  'Lord Lowden Clear': 'https://rendition.toontownrewritten.com/render/7401010201791b6c1b2c1b02000202010400000000000000000000000000000000/portrait/128x128.webp',
  'Professor Pete': 'https://rendition.toontownrewritten.com/render/7407010201000400048b0f12001212010400000000000000000000000000000000/portrait/128x128.webp',
  'Professor Guffaw': 'https://rendition.toontownrewritten.com/render/740005020000060006030704000404010400000000000000000000000000000000/portrait/128x128.webp',
  'Clerk Ray': 'https://rendition.toontownrewritten.com/render/740e010101010301038b070c000c0c010400000000000000000000000000000000/portrait/128x128.webp',
  'Doctor Drift': 'https://rendition.toontownrewritten.com/render/740902020001040104001b03000303010400000000000000000000000000000000/portrait/128x128.webp',
  'Melody Wavers': 'https://rendition.toontownrewritten.com/render/740e0201000103010308060e000e0e010400000000000000000000000000000000/portrait/128x128.webp',
  'Shelly Seaweed': 'https://rendition.toontownrewritten.com/render/740c01010001030103191504000404010400000000000000000000000000000000/portrait/128x128.webp',
  'Rocky': 'https://rendition.toontownrewritten.com/render/7406010101791b6c1b2c1b14001414010400000000000000000000000000000000/portrait/128x128.webp',

  'Sticky Lou': 'https://rendition.toontownrewritten.com/render/740c02000101080108050d04000404010400000000000000000000000000000000/portrait/128x128.webp',
  'Julius Wheezer': 'https://rendition.toontownrewritten.com/render/740c01010101010101050e12001212010400000000000000000000000000000000/portrait/128x128.webp',
  'Flippy': 'https://rendition.toontownrewritten.com/render/740101010103110311092011001111010400000000000000000000000000000000/portrait/128x128.webp',
  'Clerk Clara': 'https://rendition.toontownrewritten.com/render/741101020001090109171502000202010400000000000000000000000000000000/portrait/128x128.webp',
  'Lil Oldman': 'https://rendition.toontownrewritten.com/render/7411020101010501058b0915001515010400000000000000000000000000000000/portrait/128x128.webp',
  'Nancy Gas': 'https://rendition.toontownrewritten.com/render/7412000001010101010e1b08000808010400000000000000000000000000000000/portrait/128x128.webp',
  'Barnacle Bessie': 'https://rendition.toontownrewritten.com/render/7414050200010c010c01190d000d0d010400000000000000000000000000000000/portrait/128x128.webp',
  'Baker Bridget': 'https://rendition.toontownrewritten.com/render/740c00020000190019171504000404010400000000000000000000000000000000/portrait/128x128.webp',

  'Soggy Nell': 'https://rendition.toontownrewritten.com/render/740301020001000100040c04000404010400000000000000000000000000000000/portrait/128x128.webp',
  'Mr. Freeze': 'https://rendition.toontownrewritten.com/render/74000002010101010205070c000c0c010400000000000000000000000000000000/portrait/128x128.webp',
  'Daffy Don': 'https://rendition.toontownrewritten.com/render/740c000201010601068b1104000404010400000000000000000000000000000000/portrait/128x128.webp',
  'Clerk Penny': 'https://rendition.toontownrewritten.com/render/74120201000019001908050c000c0c010400000000000000000000000000000000/portrait/128x128.webp',
  'Stinky Ned': 'https://rendition.toontownrewritten.com/render/7415000001000000008b0206000606010400000000000000000000000000000000/portrait/128x128.webp',
  'Moe Zart': 'https://rendition.toontownrewritten.com/render/7401000001000000008b010e000e0e010400000000000000000000000000000000/portrait/128x128.webp',
  'Franz Neckvein': 'https://rendition.toontownrewritten.com/render/740d000101000200028b0607000707010400000000000000000000000000000000/portrait/128x128.webp',
  'Sofie Squirt': 'https://rendition.toontownrewritten.com/render/7415020200001b001b1a150e000e0e010400000000000000000000000000000000/portrait/128x128.webp',

  'Soggy Bottom': 'https://rendition.toontownrewritten.com/render/740b00010100080008050415001515010400000000000000000000000000000000/portrait/128x128.webp',
  'Flim Flam': 'https://rendition.toontownrewritten.com/render/740102020001170117070110001010010400000000000000000000000000000000/portrait/128x128.webp',
  'Madam Chuckle': 'https://rendition.toontownrewritten.com/render/740705020000040004040415001515010400000000000000000000000000000000/portrait/128x128.webp',
  'Clerk Will': 'https://rendition.toontownrewritten.com/render/740f010201000b000b05000a000a0a010400000000000000000000000000000000/portrait/128x128.webp',
  'Sid Sonata': 'https://rendition.toontownrewritten.com/render/7401010101000b000b8b0101000101010400000000000000000000000000000000/portrait/128x128.webp',
  'Barbara Seville': 'https://rendition.toontownrewritten.com/render/7407020201011a011a0a1d17001717010400000000000000000000000000000000/portrait/128x128.webp',
  'Clumsy Ned': 'https://rendition.toontownrewritten.com/render/740c020201010701078b0a0c000c0c010400000000000000000000000000000000/portrait/128x128.webp',
  'Loopy Loopenloop': 'https://rendition.toontownrewritten.com/render/7412010201791b6c1b2c1b0e000e0e010400000000000000000000000000000000/portrait/128x128.webp',
};

const SOSTableView = React.memo(({ sos, sortBy }: { sos: Record<string, number>; sortBy: SOSTableSort }) => {
  const sosGrid = [
    // ['Sticky Lou', 'Julius Wheezer', 'Flippy', 'Clerk Clara', 'Lil Oldman', 'Moe Zart', 'Barnacle Bessie', 'Sofie Squirt'],
    // ['Soggy Nell', 'Mr. Freeze', 'Daffy Don', 'Clerk Penny', 'Nancy Gas', 'Sid Sonata', 'Franz Neckvein', 'Rocky'],
    // ['Soggy Bottom', 'Flim Flam', 'Madam Chuckle', 'Clerk Will', 'Stinky Ned', 'Barbara Seville', 'Clumsy Ned', 'Loopy Loopenloop']
    ['Professor Pete', 'Flippy', 'Clerk Clara', 'Lil Oldman', 'Moe Zart', 'Barnacle Bessie', 'Sticky Lou', "Julius Wheezer"],
    ['Baker Bridget', 'Daffy Don', 'Clerk Penny', 'Nancy Gas', 'Sid Sonata', 'Franz Neckvein', 'Soggy Nell', 'Mr. Freeze'],
    ['Sofie Squirt', 'Madam Chuckle', 'Clerk Will', 'Stinky Ned', 'Barbara Seville', 'Clumsy Ned', 'Soggy Bottom', 'Flim Flam'],
    ['Lord Lowden Clear', 'Professor Guffaw', 'Clerk Ray', 'Doctor Drift', 'Melody Wavers', 'Shelly Seaweed', 'Rocky', 'Loopy Loopenloop']
  ];

  const cleanSosCounts = useMemo(() => Object.fromEntries(
    Object.entries(sos).map(([name, count]) => [name.replace(/\u0003/g, ''), Number(count)])
  ), [sos]);

  const initialOrder = useMemo(() => sosGrid.flat(), [sosGrid]);
  const sortedSosNames = useMemo(() => {
    if (sortBy === 'count') {
      return [...initialOrder].sort((a, b) => {
        const countA = cleanSosCounts[a] || 0;
        const countB = cleanSosCounts[b] || 0;
        if (countA !== countB) return countB - countA;
        return initialOrder.indexOf(a) - initialOrder.indexOf(b);
      });
    }
    return initialOrder;
  }, [cleanSosCounts, initialOrder, sortBy]);


  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar p-2">
      <div className="grid grid-cols-4 xl:grid-cols-8 gap-3">
        {sortedSosNames.map(name => {
          const count = Object.entries(sos).find(([n, _]) => n.replace(/\u0003/g, '') === name)?.[1] || 0;
          const image = SOS_IMAGES[name] || '';
          const cardData = SOS_DATA[name] || { type: 'Unknown', starRating: 0 };
          const stars = cardData.starRating;

          let bgClass = 'bg-blue-900/40 border-blue-500/30';
          let typeColor = 'text-blue-100/70';
          let nameColor = 'text-blue-100';

          if (count === 0) {
            bgClass = 'bg-black/20 border-white/5 opacity-40 grayscale';
            typeColor = 'text-white/30';
            nameColor = 'text-white/40';
          } else {
            typeColor = 'text-white/70';
            nameColor = 'text-white';
            if (stars === 5) {
              bgClass = 'bg-amber-500 border-amber-300 shadow-lg hover:brightness-110';
            } else if (stars === 4) {
              bgClass = 'bg-purple-600 border-purple-400 shadow-lg hover:brightness-110';
            } else if (stars === 3) {
              bgClass = 'bg-blue-600 border-blue-400 shadow-lg hover:brightness-110';
            } else {
              bgClass = 'bg-blue-900 border-blue-500 shadow-lg hover:brightness-110';
            }
          }

          return (
            <div
              key={name}
              className={`relative rounded-xl border p-1.5 flex flex-col gap-1 transition-all group ${bgClass}`}
            >
              {/* Count Bubble - Top Right of the CARD */}
              <div className={`absolute top-[-8px] right-[-8px] px-2 py-0.5 rounded-full text-[10px] 
              font-black tabular-nums border shadow-md z-20 transition-all ${count > 0
                  ? 'bg-green-700 border-green-400 text-white'
                  : 'bg-neutral-800 border-neutral-700 text-white/30'
                }`}>
                {count}
              </div>

              {/* Card Type */}
              <div className={`text-[7px] font-black uppercase tracking-widest text-center py-0.5 rounded bg-black/40 border border-white/5 ${typeColor}`}>
                {cardData.type}
              </div>

              <div className="flex flex-col gap-1">
                <div className="w-full aspect-square rounded bg-black/40 border border-white/10 p-0.5 shrink-0 overflow-hidden relative group/sosimg">
                  {image ? (
                    <img
                      src={image}
                      className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                      alt={name}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    </div>
                  )}

                  {/* Star Rating Overlay */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full flex justify-center gap-0.5 px-1.5 py-0.5  bg-black/40 backdrop-blur-sm border border-white/10 z-10">
                    {[...Array(stars)].map((_, i) => (
                      <span key={i} className="text-[8px] leading-none text-amber-400">★</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-auto">
                <div className={`text-[9px] font-black leading-tight text-center flex items-center justify-center min-h-[22px] px-1 uppercase tracking-tighter rounded bg-black/40 border border-white/5 ${nameColor}`}>
                  {name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
const SummonsTableView = React.memo(({ summons }: { summons: any }) => {
  const suits = ['Bossbot', 'Lawbot', 'Cashbot', 'Sellbot'];
  const suitClasses: Record<string, { bg: string, border: string, text: string, hover: string }> = {
    Bossbot: { bg: 'bg-[#4a3728]', border: 'border-amber-500/30', text: 'text-amber-100', hover: 'hover:brightness-110' },
    Lawbot: { bg: 'bg-[#2e5db1]', border: 'border-blue-500/30', text: 'text-blue-100', hover: 'hover:brightness-110' },
    Cashbot: { bg: 'bg-[#238b39]', border: 'border-green-500/30', text: 'text-green-100', hover: 'hover:brightness-110' },
    Sellbot: { bg: 'bg-[#7b00ae]', border: 'border-purple-500/30', text: 'text-purple-100', hover: 'hover:brightness-110' },
  };

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto custom-scrollbar">
      {suits.map(suitName => {
        const suitCogs = cogsData.find(s => s.name === suitName)?.ranks || [];
        const classes = suitClasses[suitName];
        return (
          <div key={suitName} className="grid grid-cols-4 xl:grid-cols-8 gap-2">
            {suitCogs.map(cogRank => {
              const summonEntry = Object.entries(summons).find(([_, s]: [string, any]) =>
                s.name.replace(/\u0003/g, '') === cogRank.name
              );
              const summon = summonEntry ? (summonEntry[1] as any) : null;

              return (
                <div
                  key={cogRank.name}
                  className={`rounded-xl border p-2 flex flex-col gap-2 transition-all group ${summon && (summon.single || summon.building || summon.invasion)
                    ? `${classes.bg} ${classes.border} ${classes.hover} shadow-lg`
                    : 'bg-black/20 border-white/5 opacity-40 grayscale'
                    }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className={`text-[10px] font-black truncate leading-tight text-center ${summon && (summon.single || summon.building || summon.invasion) ? classes.text : 'text-white/60'}`}>{cogRank.name}</div>
                    <div className="w-full aspect-square rounded-lg bg-black/40 border border-white/10 p-1 shrink-0 overflow-hidden relative">
                      <img
                        src={`https://toonhq.org/static/assets/cogs/${cogRank.image}`}
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                        alt={cogRank.name}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-1 mt-1">
                    <SummonIcon active={!!summon?.single} type="cog" />
                    <SummonIcon active={!!summon?.building} type="bldg" />
                    <SummonIcon active={!!summon?.invasion} type="inv" />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});
const PinkSlipsGridView = React.memo(({ count }: { count: number }) => {
  const totalSlots = 200;
  const slots = Array.from({ length: totalSlots });

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div
        className="grid gap-x-2 gap-y-3 w-full h-full"
        style={{
          gridTemplateColumns: 'repeat(20, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(10, minmax(0, 1fr))'
        }}
      >
        {slots.map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            <img
              src={getExtensionImageUrl('images/pinkslips.webp')}
              className={`w-full h-full max-h-8 object-contain transition-all duration-500 ${i >= count ? 'grayscale opacity-5' : 'drop-shadow-[0_0_5px_rgba(251,113,133,0.5)]'}`}
              alt="Pink Slip"
            />
          </div>
        ))}
      </div>
    </div>
  );
});
const EmptyRewardState = React.memo(() => {
  return (
    <div className="flex flex-col items-center justify-center py-20 opacity-20 gap-4 w-full">
      <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
      </div>
      <p className="text-xs font-black uppercase tracking-[0.3em]">No items obtained</p>
    </div>
  );
});

const RewardPieChart = React.memo(({ history, timeframe }: { history: RewardHistoryEntry[], timeframe?: string }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const data: Record<RewardCategory, { clears: number; items: number; list: Record<string, number> }> = {
      sos: { clears: 0, items: 0, list: {} },
      unites: { clears: 0, items: 0, list: {} },
      summons: { clears: 0, items: 0, list: {} },
      pinkslips: { clears: 0, items: 0, list: {} },
      remotes: { clears: 0, items: 0, list: {} },
      analytics: { clears: 0, items: 0, list: {} }
    };

    const groups = groupRewardHistory(history);
    groups.forEach(group => {
      const categoriesInGroup = new Set<RewardCategory>();
      group.entries.forEach(entry => {
        if (data[entry.category]) {
          categoriesInGroup.add(entry.category);
          const amount = entry.amount || 1;
          data[entry.category].items += amount;

          let itemName = entry.item || entry.message || 'Unknown Item';
          if (entry.category === 'pinkslips') {
            itemName = `${amount} Fire`;
          } else if (entry.category === 'summons' && entry.metadata?.summonType) {
            itemName = `${entry.item} (${entry.metadata.summonType})`;
          } else if (entry.category === 'remotes' && entry.metadata?.remoteLevel) {
            itemName = `${entry.metadata.remoteLevel}★ ${entry.metadata.remoteType?.replace(' Remote', '')}`;
          }

          const increment = entry.category === 'pinkslips' ? 1 : amount;
          data[entry.category].list[itemName] = (data[entry.category].list[itemName] || 0) + increment;
        }
      });
      categoriesInGroup.forEach(cat => data[cat].clears++);
    });
    return data;
  }, [history]);

  const totalClears = Object.values(stats).reduce((a, b) => a + b.clears, 0);

  const CATEGORIES_CONFIG = ANALYTICS_CATEGORIES;

  const chartData = useMemo(() => {
    let currentAngle = 0;
    return CATEGORIES_CONFIG.map(cat => {
      const s = stats[cat.id as RewardCategory];
      const percentage = totalClears > 0 ? (s.clears / totalClears) * 100 : 0;
      const startAngle = currentAngle;
      const sweepAngle = (percentage / 100) * 360;
      currentAngle += sweepAngle;
      return { ...cat, clears: s.clears, items: s.items, list: s.list, percentage, startAngle, sweepAngle };
    });
  }, [stats, totalClears]);

  if (totalClears === 0) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 opacity-30">
      <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-black text-white uppercase tracking-[0.2em]">
          No clears recorded in the {timeframe === '24h' ? 'Past Day' : timeframe === '30d' ? 'past 30 days' : 'past 7 days'}
        </p>
        <p className="text-[12px] text-white/50 mt-1 italic">Complete boss battles to see your analytics!</p>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-row items-center justify-center gap-12 lg:gap-24 animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
      {/* Left: Static Pie Chart */}
      <div className="relative w-80 h-80 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90 overflow-visible">
          {chartData.map((d) => {
            const isHovered = hoveredId === d.id || expandedId === d.id;
            const strokeWidth = 16;
            const radius = 42;
            const circumference = 2 * Math.PI * radius;
            const strokeLength = (d.percentage / 100) * circumference;
            // Negative offset pushes the starting point clockwise
            const offset = -(d.startAngle / 360) * circumference;

            return (
              <circle
                key={d.id}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${Math.max(0.001, strokeLength)} ${circumference}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                className={`transition-all duration-500 ease-out cursor-pointer ${d.percentage > 0 ? 'opacity-85 hover:opacity-100' : 'opacity-0'}`}
                style={{
                  filter: isHovered && d.percentage > 0 ? `drop-shadow(0 0 3px ${d.color})` : 'none',
                  pointerEvents: d.percentage > 0 ? 'stroke' : 'none'
                }}
                onMouseEnter={() => d.percentage > 0 && setHoveredId(d.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => d.percentage > 0 && setExpandedId(expandedId === d.id ? null : d.id)}
              />
            );
          })}
        </svg>

        <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-4xl font-black text-white tabular-nums leading-none tracking-tighter drop-shadow-lg">{totalClears}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1.5">Total Clears</div>
        </div>
      </div>

      {/* Right: Scrollable Legend */}
      <div className="flex-1 h-full max-w-lg flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 py-8">
          <div className="flex flex-col gap-3 min-h-full justify-center">
            {chartData.filter(d => d.clears > 0).sort((a, b) => b.clears - a.clears).map(cat => {
              const isHovered = hoveredId === cat.id;
              const isExpanded = expandedId === cat.id;
              return (
                <div
                  key={cat.id}
                  className={`flex flex-col rounded-2xl transition-all duration-300 border overflow-hidden shrink-0 ${isExpanded ? 'bg-white/[0.06] border-white/20 shadow-xl' : 'bg-white/[0.03] border-white/5 opacity-85'}`}
                >
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onMouseEnter={() => setHoveredId(cat.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                  >
                    <div className="w-4 h-4 rounded-full shrink-0 shadow-lg" style={{ backgroundColor: cat.color, boxShadow: (isHovered || isExpanded) ? `0 0 8px ${cat.color}` : 'none' }} />
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white uppercase tracking-wider">{cat.boss}</span>
                          <div className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">{cat.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white tabular-nums">{cat.clears} <span className="text-[9px] text-white/30 ml-0.5 uppercase">{(cat.clears === 1 ? 'Clear' : 'Clears').toUpperCase()}</span></span>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <span style={{ color: cat.color }} className="text-sm font-black text-emerald-400/70 tabular-nums">{cat.items} <span className="text-[9px] opacity-60 ml-0.5 uppercase">{cat.items === 1 ? cat.singular : cat.label}</span></span>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-white/20 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-black/40 rounded-full mt-2 overflow-hidden relative">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${cat.percentage}%`,
                            backgroundColor: cat.color,
                            boxShadow: `0 0 8px ${cat.color}`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Reward List */}
                  {isExpanded && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-black/40 rounded-xl border border-white/5 p-3 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {/* <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 px-1">Rewards List</div> */}
                        {Object.entries(cat.list).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
                          const denominator = cat.id === 'pinkslips' ? cat.clears : cat.items;
                          const itemPct = denominator > 0 ? Math.min(100, (count / denominator) * 100) : 0;
                          return (
                            <div
                              key={name}
                              className="relative flex justify-between items-center py-1.5 px-3 rounded-lg border border-white/5 group/rewitem font-bold overflow-hidden"
                            >
                              {/* Background fill bar */}
                              <div
                                className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 ease-out"
                                style={{
                                  width: `${itemPct}%`,
                                  backgroundColor: cat.color,
                                  opacity: 0.15,
                                }}
                              />
                              <span className="relative z-[1] text-[12px] text-white/70 group-hover/rewitem:text-white transition-colors">{name}</span>
                              <span className="relative z-[1] text-[12px] text-white/90 tabular-nums">x{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

type RewardChartMode = 'clears' | 'rewards';
const REWARD_CHART_MODE_STORAGE_KEY = 'toonhqplus_reward_chart_mode';
const ANALYTICS_WINDOW_MS: Record<string, number> = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
const DAY_MS = 86400000;

const ANALYTICS_CATEGORIES: { id: RewardCategory; boss: string; label: string; singular: string; color: string; img: string }[] = [
  { id: 'sos', boss: 'VP', label: 'SOS Cards', singular: 'SOS Card', color: '#a855f7', img: 'sos.webp' },
  { id: 'unites', boss: 'CFO', label: 'Unites', singular: 'Unite', color: '#22c55e', img: 'unites.webp' },
  { id: 'summons', boss: 'CJ', label: 'Summons', singular: 'Summon', color: '#3b82f6', img: 'summons.webp' },
  { id: 'pinkslips', boss: 'CEO', label: 'Pink Slips', singular: 'Pink Slip', color: '#a47148', img: 'pinkslips.webp' },
  { id: 'remotes', boss: 'FO', label: 'Remotes', singular: 'Remote', color: '#ef4444', img: 'remotes.webp' },
];

const UNITE_CATEGORIES: UniteCategory[] = ['Toon-Up', 'Jellybeans', 'Gag-Up', 'Promotions', 'Cartoonival'];

// Name and a short detail line for one reward, as shown in the timeline tooltip.
function describeReward(entry: RewardHistoryEntry): { name: string; detail: string } {
  const name = entry.item || entry.message || 'Unknown Item';
  switch (entry.category) {
    case 'sos': {
      const card = SOS_DATA[name];
      return { name, detail: card ? `${card.type} · ${'★'.repeat(card.starRating)}` : 'SOS Card' };
    }
    case 'unites':
      return { name, detail: entry.metadata?.uniteCategory ? `${entry.metadata.uniteCategory} Unite` : 'Unite' };
    case 'summons':
      return { name, detail: `${entry.metadata?.summonType ?? 'Cog'} Summon` };
    case 'pinkslips':
      return { name: 'Pink Slips', detail: 'Fires' };
    case 'remotes':
      return {
        name: entry.metadata?.remoteType ?? name,
        detail: entry.metadata?.remoteLevel ? `${entry.metadata.remoteLevel}-Star Remote` : 'Remote',
      };
    default:
      return { name, detail: '' };
  }
}

function getRewardImage(entry: RewardHistoryEntry): string {
  const fallback = getExtensionImageUrl(`images/${ANALYTICS_CATEGORIES.find(cat => cat.id === entry.category)?.img ?? 'unites.webp'}`);
  if (entry.category === 'sos') return SOS_IMAGES[entry.item] || fallback;
  if (entry.category === 'unites') {
    const category = entry.metadata?.uniteCategory as UniteCategory | undefined;
    return category && UNITE_CATEGORIES.includes(category) ? getExtensionImageUrl(`images/${getUniteImage(category, entry.item)}`) : fallback;
  }
  if (entry.category === 'summons') {
    for (const suit of cogsData) {
      const rank = suit.ranks.find((r: { name: string }) => r.name === entry.item);
      if (rank) return `https://toonhq.org/static/assets/cogs/${rank.image}`;
    }
    return fallback;
  }
  if (entry.category === 'remotes') {
    const level = String(entry.metadata?.remoteLevel ?? '');
    if (!['1', '2', '3'].includes(level)) return fallback;
    const kind = /heal/i.test(entry.metadata?.remoteType ?? entry.item ?? '') ? 'healing' : 'damage';
    return getExtensionImageUrl(`images/remotes/${kind}-${level}.webp`);
  }
  return fallback;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  return (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
}

function buildTimeTicks(start: number, end: number, scale: 'hours' | 'days' | 'weeks'): number[] {
  const ticks: number[] = [];
  const first = new Date(start);
  if (scale === 'hours') {
    first.setMinutes(0, 0, 0);
    first.setHours(Math.ceil((first.getHours() + 1) / 4) * 4);
    for (let t = first.getTime(); t <= end; t += 4 * 3600000) ticks.push(t);
  } else {
    const stepDays = scale === 'days' ? 1 : 5;
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() + 1);
    for (let d = new Date(first); d.getTime() <= end; d.setDate(d.getDate() + stepDays)) ticks.push(d.getTime());
  }
  return ticks;
}

type TimelinePoint = { timestamp: number; clears: number; rewards: number; gained: number; entries: RewardHistoryEntry[] };

const RewardTimelineChart = React.memo(({ history, timeframe }: { history: RewardHistoryEntry[]; timeframe: string }) => {
  const [mode, setMode] = useState<RewardChartMode>(() => {
    try { return localStorage.getItem(REWARD_CHART_MODE_STORAGE_KEY) === 'rewards' ? 'rewards' : 'clears'; } catch { return 'clears'; }
  });
  useEffect(() => {
    try { localStorage.setItem(REWARD_CHART_MODE_STORAGE_KEY, mode); } catch { /* storage unavailable */ }
  }, [mode]);
  const [hidden, setHidden] = useState<Set<RewardCategory>>(() => new Set());
  const [hover, setHover] = useState<{ category: RewardCategory; index: number } | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  // Start of the day being zoomed into (week and month views only).
  const [focusDay, setFocusDay] = useState<number | null>(null);
  useEffect(() => { setFocusDay(null); }, [timeframe]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canFocusDays = timeframe !== '24h';
  const now = useMemo(() => Date.now(), [history, timeframe]);
  const windowStart = now - (ANALYTICS_WINDOW_MS[timeframe] ?? ANALYTICS_WINDOW_MS['7d']);
  const start = focusDay ?? windowStart;
  const end = focusDay !== null ? Math.min(focusDay + DAY_MS, now) : now;

  // One point per clear for each boss, oldest first, with running totals for both modes.
  const seriesPoints = useMemo(() => {
    const out = {} as Record<RewardCategory, TimelinePoint[]>;
    ANALYTICS_CATEGORIES.forEach(cat => { out[cat.id] = []; });
    const inRange = history.filter(entry => entry.timestamp >= start && entry.timestamp <= end);
    const groups = [...groupRewardHistory(inRange)].sort((a, b) => a.timestamp - b.timestamp);
    for (const group of groups) {
      for (const cat of ANALYTICS_CATEGORIES) {
        const entries = group.entries.filter(entry => entry.category === cat.id);
        if (!entries.length) continue;
        const list = out[cat.id];
        const prev = list[list.length - 1];
        const gained = entries.reduce((sum, entry) => sum + (entry.amount || 1), 0);
        list.push({ timestamp: group.timestamp, clears: (prev?.clears ?? 0) + 1, rewards: (prev?.rewards ?? 0) + gained, gained, entries });
      }
    }
    return out;
  }, [history, start, end]);

  const activeSeries = ANALYTICS_CATEGORIES.filter(cat => seriesPoints[cat.id].length > 0);
  const visibleSeries = activeSeries.filter(cat => !hidden.has(cat.id));

  const height = 240;
  const margin = { top: 14, right: 16, bottom: 26, left: 40 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;

  const maxValue = Math.max(0, ...visibleSeries.map(cat => {
    const list = seriesPoints[cat.id];
    return list[list.length - 1][mode];
  }));
  const yStep = niceStep(Math.max(1, maxValue) / 4);
  const yTop = Math.max(yStep, Math.ceil(maxValue / yStep) * yStep);
  const yTicks: number[] = [];
  for (let v = 0; v <= yTop; v += yStep) yTicks.push(v);

  const span = Math.max(1, end - start);
  const xOf = (t: number) => margin.left + ((t - start) / span) * plotW;
  const yOf = (v: number) => margin.top + plotH - (v / yTop) * plotH;
  const tickScale = focusDay !== null || timeframe === '24h' ? 'hours' : timeframe === '7d' ? 'days' : 'weeks';
  const xTicks = useMemo(() => buildTimeTicks(start, end, tickScale), [start, end, tickScale]);
  const formatTick = (t: number) => new Date(t).toLocaleString(undefined, tickScale === 'hours' ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });
  const formatDay = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const linePath = (points: TimelinePoint[]) => {
    let d = `M ${xOf(start)} ${yOf(0)}`;
    for (const p of points) d += ` L ${xOf(p.timestamp)} ${yOf(p[mode])}`;
    return `${d} L ${xOf(end)} ${yOf(points[points.length - 1][mode])}`;
  };

  const timeAt = (mouseX: number) => start + ((mouseX - margin.left) / Math.max(1, plotW)) * span;

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    if (canFocusDays && focusDay === null) setHoverDay(startOfDay(timeAt(mx)));
    let best: { category: RewardCategory; index: number } | null = null;
    let bestDist = 28;
    for (const cat of visibleSeries) {
      seriesPoints[cat.id].forEach((p, index) => {
        const dist = Math.hypot(xOf(p.timestamp) - mx, yOf(p[mode]) - my);
        if (dist < bestDist) { bestDist = dist; best = { category: cat.id, index }; }
      });
    }
    setHover(best);
  };

  const handleClick = (event: React.MouseEvent<SVGRectElement>) => {
    if (!canFocusDays || focusDay !== null) return;
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    setFocusDay(startOfDay(timeAt(event.clientX - rect.left)));
    setHover(null);
    setHoverDay(null);
  };

  const shiftFocus = (days: number) => setFocusDay(current => {
    if (current === null) return current;
    const d = new Date(current);
    d.setDate(d.getDate() + days);
    return d.getTime();
  });
  const canGoBack = focusDay !== null && focusDay > startOfDay(windowStart);
  const canGoForward = focusDay !== null && focusDay < startOfDay(now);

  const hoveredCat = hover ? ANALYTICS_CATEGORIES.find(cat => cat.id === hover.category) : undefined;
  const hovered = hover && !hidden.has(hover.category) ? seriesPoints[hover.category][hover.index] : undefined;

  const toggleSeries = (id: RewardCategory) => setHidden(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const dayBand = hoverDay !== null && focusDay === null ? {
    x: Math.max(margin.left, xOf(hoverDay)),
    right: Math.min(margin.left + plotW, xOf(hoverDay + DAY_MS)),
  } : null;

  const arrowButton = 'cursor-pointer w-6 h-6 inline-flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-default disabled:hover:bg-transparent';

  return (
    <div className="w-full rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-black text-white uppercase tracking-wider">Rewards Over Time</span>
          {focusDay !== null ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-1 py-0.5">
              <button type="button" aria-label="Previous day" disabled={!canGoBack} onClick={() => shiftFocus(-1)} className={arrowButton}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-[10px] font-black uppercase tracking-widest text-white px-1">{formatDay(focusDay)}</span>
              <button type="button" aria-label="Next day" disabled={!canGoForward} onClick={() => shiftFocus(1)} className={arrowButton}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <button type="button" onClick={() => setFocusDay(null)} className="cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/10">
                All days
              </button>
            </div>
          ) : canFocusDays && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Click a day to zoom in</span>
          )}
        </div>
        <div className="inline-flex rounded-full border border-emerald-500/20 bg-[#081a0e] p-1" role="group" aria-label="Reward graph mode">
          {(['clears', 'rewards'] as RewardChartMode[]).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={`cursor-pointer rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${mode === option ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50 hover:text-white'}`}
            >
              By {option === 'clears' ? 'Clears' : 'Rewards'}
            </button>
          ))}
        </div>
      </div>

      {activeSeries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {activeSeries.map(cat => {
            const list = seriesPoints[cat.id];
            const last = list[list.length - 1];
            const off = hidden.has(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleSeries(cat.id)}
                className={`cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-opacity ${off ? 'border-white/5 opacity-40' : 'border-white/10 bg-white/[0.04]'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: off ? 'transparent' : cat.color, border: `2px solid ${cat.color}` }} />
                <span className="text-white">{cat.boss}</span>
                <span className="text-white/40">{cat.label}</span>
                <span className="text-white/70 tabular-nums">{mode === 'clears' ? last.clears : last.rewards}</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} className="block" role="img" aria-label={`Running total of ${mode === 'clears' ? 'clears' : 'rewards'} over time for each boss`}>
            {dayBand && (
              <rect x={dayBand.x} y={margin.top} width={Math.max(0, dayBand.right - dayBand.x)} height={plotH} fill="rgba(255,255,255,0.05)" rx={4} />
            )}
            {yTicks.map(v => (
              <g key={`y${v}`}>
                <line x1={margin.left} x2={margin.left + plotW} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <text x={margin.left - 8} y={yOf(v)} dy="0.32em" textAnchor="end" fontSize={10} fontWeight={700} fill="rgba(255,255,255,0.4)" className="tabular-nums">{v}</text>
              </g>
            ))}
            {xTicks.map(t => (
              <text key={`x${t}`} x={xOf(t)} y={height - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill="rgba(255,255,255,0.4)">{formatTick(t)}</text>
            ))}
            {hovered && (
              <line x1={xOf(hovered.timestamp)} x2={xOf(hovered.timestamp)} y1={margin.top} y2={margin.top + plotH} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            {visibleSeries.map(cat => (
              <path key={`line-${cat.id}`} d={linePath(seriesPoints[cat.id])} fill="none" stroke={cat.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={hovered && hover?.category !== cat.id ? 0.35 : 1} />
            ))}
            {visibleSeries.map(cat => seriesPoints[cat.id].map((p, i) => {
              const active = hover?.category === cat.id && hover.index === i;
              return (
                <circle
                  key={`${cat.id}-${p.timestamp}`}
                  cx={xOf(p.timestamp)}
                  cy={yOf(p[mode])}
                  r={active ? 5.5 : 4}
                  fill={cat.color}
                  stroke="#0b1220"
                  strokeWidth={2}
                  opacity={hovered && hover?.category !== cat.id ? 0.35 : 1}
                />
              );
            }))}
            <rect
              x={margin.left}
              y={margin.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              style={{ cursor: canFocusDays && focusDay === null ? 'zoom-in' : 'default' }}
              onMouseMove={handleMove}
              onMouseLeave={() => { setHover(null); setHoverDay(null); }}
              onClick={handleClick}
            />
          </svg>
        )}

        {visibleSeries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-black uppercase tracking-[0.24em] text-white/25">
              {activeSeries.length > 0 ? 'All bosses hidden' : focusDay !== null ? 'No rewards obtained this day' : 'No rewards obtained in this timeframe'}
            </span>
          </div>
        )}

        {hovered && hoveredCat && (() => {
          const px = xOf(hovered.timestamp);
          const py = yOf(hovered[mode]);
          const flip = px > width * 0.6;
          const unit = hovered.gained === 1 ? hoveredCat.singular : hoveredCat.label;
          const total = mode === 'clears' ? hovered.clears : hovered.rewards;
          const totalUnit = mode === 'clears' ? (total === 1 ? 'Clear' : 'Clears') : (total === 1 ? hoveredCat.singular : hoveredCat.label);
          return (
            // Anchored to the bottom of the plot so taller tooltips grow upward instead of off the card.
            <div
              className="absolute z-10 pointer-events-none w-[17rem] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden"
              style={{ left: px, bottom: margin.bottom, transform: `translateX(${flip ? 'calc(-100% - 14px)' : '14px'})` }}
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/10" style={{ backgroundColor: `${hoveredCat.color}22` }}>
                <div className="flex items-center gap-2">
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white" style={{ backgroundColor: hoveredCat.color }}>{hoveredCat.boss}</span>
                  <span className="text-[13px] font-black text-white">Clear #{hovered.clears}</span>
                </div>
                <span className="text-[10px] font-bold text-white/50 tabular-nums">
                  {new Date(hovered.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {hovered.entries.map((entry, i) => {
                  const { name, detail } = describeReward(entry);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-12 h-12 shrink-0 rounded-xl bg-black/40 border border-white/10 p-1 overflow-hidden">
                        <img src={getRewardImage(entry)} alt="" className="w-full h-full object-contain" />
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-[13px] font-black text-white leading-tight truncate">{name}</span>
                        {detail && <span className="text-[10px] font-bold uppercase tracking-wider text-white/45 truncate">{detail}</span>}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-black text-white tabular-nums">×{entry.amount || 1}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-white/10 bg-white/[0.03] text-[10px] font-black uppercase tracking-widest tabular-nums">
                <span className="text-white/80">+{hovered.gained} {unit}</span>
                <span className="text-white/45">{total} {totalUnit} {focusDay !== null ? 'this day' : 'total'}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
});

const DEPT_COLORS: Record<string, { bg: string, border: string, text: string, accent: string }> = {
  sell: { bg: '#4c0d6b', border: '#9d4edd', text: '#f3e8ff', accent: '#d8b4fe' },
  cash: { bg: '#14532d', border: '#22c55e', text: '#f0fdf4', accent: '#86efac' },
  law: { bg: '#1e3a8a', border: '#60a5fa', text: '#eff6ff', accent: '#93c5fd' },
  boss: { bg: '#4a3728', border: '#8c5d3d', text: '#fafaf9', accent: '#d6d3d1' }
};

const DEFAULT_COLORS = { bg: '#1f2937', border: '#374151', text: '#f9fafb', accent: '#9ca3af' };

const STAT_LABELS: Record<string, { short: string, long: string }> = {
  boss: { short: 'Options', long: 'Stock Options' },
  law: { short: 'Notices', long: 'Jury Notices' },
  cash: { short: 'Cogbucks', long: 'Cogbucks' },
  sell: { short: 'Merits', long: 'Merits' }
};

const SuitRecommendations = ({ dept, remaining, statName, colors }: { dept: string, remaining: number, statName: string, colors: any }) => {
  const items = FACILITIES_DATA[dept]?.items || [];
  const highest = items[0];
  if (!highest) return null;

  const highestCount = Math.floor(remaining / highest.val);
  const rem = remaining % highest.val;
  const rows = Array(highestCount).fill(highest);

  if (rem > 0) {
    const bestFit = items.reduce((prev: any, curr: any) =>
      (curr.val >= rem && curr.val < prev.val) ? curr : prev,
      highest
    );
    rows.push(bestFit);
  }

  const total = rows.reduce((acc: number, row: any) => acc + row.val, 0);

  return (
    <div className="bg-black/10 rounded p-2 border border-white/5 flex flex-col gap-1.5">
      {rows.map((row: any, i: number) => (
        <div key={i} className="flex justify-between items-center text-[10.5px] font-medium opacity-80" style={{ color: colors.text }}>
          <span className="truncate">{row.name}</span>
          <span className="shrink-0 ml-2">~ {row.val} {statName}</span>
        </div>
      ))}
      <div className="pt-1 mt-1 border-t border-white/10 text-right text-[11.5px] font-black" style={{ color: colors.text }}>
        <span className="text-left">Total</span> <span style={{ color: colors.accent }}>{total.toLocaleString()} {statName}</span>
      </div>
    </div>
  );
};

const ToonSuitsView = React.memo(({
  cogsuits,
  condensed = false,
  isExpanded = false,
  expandedSuitId,
  setExpandedSuitId
}: {
  cogsuits?: Record<string, any>;
  condensed?: boolean;
  isExpanded?: boolean;
  expandedSuitId?: string | null;
  setExpandedSuitId?: (id: string | null) => void;
}) => {
  if (!cogsuits && !condensed) return null;

  const suits = Object.entries(cogsuits || {}).filter(([_, suit]) => suit.hasDisguise);

  if (suits.length === 0) {
    return (
      <div className={`font-black text-white/20 uppercase tracking-widest ${condensed ? 'flex min-w-0 items-center border-l border-white/10 px-4 text-[11px]' : 'text-xs py-4'}`}>
        No Disguises
      </div>
    );
  }

  return (
    <div className={condensed ? "grid w-full min-w-0 content-start items-start grid-cols-2 gap-2 border-l border-white/10 px-4" : `animate-in fade-in slide-in-from-top-1 duration-200 ${isExpanded ? 'grid grid-cols-2 gap-3' : 'space-y-3'}`}>
      {suits.map(([id, suit]) => {
        const dept = (suit.department.toLowerCase().endsWith('bot') ? suit.department.toLowerCase().slice(0, -3) : suit.department.toLowerCase()) as keyof typeof DEPT_COLORS;
        const colors = DEPT_COLORS[dept] || DEFAULT_COLORS;
        const statLabels = STAT_LABELS[dept] || { short: 'Points', long: 'Points' };
        const statName = condensed ? statLabels.short : statLabels.long;

        const isMaxed = suit.level >= 50;
        const isReady = suit.promotion && suit.promotion.current >= suit.promotion.target;
        const remaining = suit.promotion ? suit.promotion.target - suit.promotion.current : 0;
        const progress = suit.promotion ? (suit.promotion.current / suit.promotion.target) * 100 : 0;
        const cogName = (suit.suit?.name || 'No Disguise').replace(/\u0003/g, '') + (suit.version === 2 ? ' V2.0' : '');

        if (condensed) {
          return (
            <div key={id} className="relative rounded flex flex-col p-2 gap-1.5 shadow-md border" style={{ backgroundColor: colors.bg, borderColor: `${colors.border}60` }}>
              <div className="flex justify-between items-center gap-1">
                <span className="text-[12px] font-bold text-white/90 truncate drop-shadow-sm">{cogName}</span>
                <span className="text-[10px] font-black shrink-0 px-1 py-0.5 rounded bg-black/20" style={{ color: colors.accent }}>Lv. {suit.level}</span>
              </div>
              <div className="h-4 w-full rounded border overflow-hidden relative" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: `${colors.border}40` }}>
                {isMaxed ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: colors.accent }}>Maxed</span>
                  </div>
                ) : isReady ? (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: colors.border }}>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Promo</span>
                  </div>
                ) : (
                  <>
                    <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, progress)}%`, backgroundColor: `${colors.accent}90` }} />
                    <div className="absolute inset-0 flex items-center justify-center drop-shadow-md">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/90">{remaining.toLocaleString()} {statName}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={id} className={`relative rounded-lg border flex flex-col transition-all hover:brightness-110 shadow-md group/suit ${isMaxed && !isExpanded ? 'p-3 gap-0' : 'p-4 gap-3'}`} style={{ backgroundColor: colors.bg, borderColor: `${colors.border}60` }}>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[11.5px] font-bold text-white uppercase tracking-widest truncate">{suit.department}</span>
              <div className="flex items-center shrink-0">
                {isMaxed && !isExpanded ? (
                  <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-black/20" style={{ color: colors.accent, borderColor: `${colors.border}40` }}>Maxed</div>
                ) : (
                  <div className="flex items-center h-5 px-2 rounded border bg-black/20 shadow-sm" style={{ color: colors.text, borderColor: `${colors.border}40` }}>
                    <span className="text-[11.5px] font-bold italic whitespace-nowrap opacity-70">{cogName}</span>
                    <div className="w-[1px] h-3 bg-white/20 mx-1.5" />
                    <span className="text-[11.5px] font-black whitespace-nowrap">Lv. {suit.level}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {isMaxed ? (
                isExpanded && <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-1.5 rounded border text-center shadow-sm" style={{ color: colors.accent, backgroundColor: 'rgba(0,0,0,0.3)', borderColor: `${colors.border}40` }}>Maxed</div>
              ) : isReady ? (
                <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-1.5 rounded border text-center shadow-sm" style={{ color: '#ffffff', backgroundColor: colors.border, borderColor: colors.border }}>Ready for promotion</div>
              ) : suit.promotion ? (
                <div className="relative h-6 w-full bg-black/30 rounded border overflow-hidden flex items-center justify-center p-[1px]" style={{ borderColor: `${colors.border}40` }}>
                  <div className="absolute inset-y-0 left-0 transition-all duration-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ width: `${Math.min(100, progress)}%`, backgroundColor: `${colors.border}80` }} />
                  <span className="relative z-10 text-[10.5px] font-black uppercase tracking-widest text-center leading-none" style={{ color: colors.text }}>{remaining.toLocaleString()} {statName} remaining</span>
                </div>
              ) : null}
            </div>
            {!isMaxed && suit.promotion && remaining > 0 && setExpandedSuitId && (
              <div className="pt-1 mt-1 border-t border-white/10">
                <button onClick={(e) => { e.stopPropagation(); setExpandedSuitId(expandedSuitId === id ? null : id); }} className="w-full py-1.5 flex items-center justify-center gap-2 rounded hover:bg-black/10 transition-colors group cursor-pointer">
                  <span className="text-[9.5px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: colors.text }}>{expandedSuitId === id ? 'Hide Recommendations' : 'Show Recommendations'}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSuitId === id ? 'rotate-180' : ''}`} style={{ color: colors.accent }}><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {expandedSuitId === id && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-2 space-y-1.5 pb-1">
                    <SuitRecommendations dept={dept} remaining={remaining} statName={statName} colors={colors} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

const ToonsListView = React.memo(({ savedToons, activeInstances, selectToon, removeSavedToon }: { savedToons: any[], activeInstances: any[], selectToon: (id: string) => void, removeSavedToon: (event: React.MouseEvent, id: string, name?: string) => void }) => {
  const [toonsData, setToonsData] = useState<Record<string, { data: ToonTrackerData, history: RewardHistoryEntry[] }>>({});
  const [liveLaff, setLiveLaff] = useState<Record<string, ToonTrackerData['data']['laff']>>({});
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const [draggedToonId, setDraggedToonId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  useEffect(() => {
    const refreshCustomOrder = () => {
      getSetting<unknown>('tracker-toon-order').then(order => {
        setCustomOrder(normalizeToonOrderSetting(order)?.toonIds ?? null);
      }).catch(console.error);
    };
    refreshCustomOrder();

    const handleDbChange = (event: Event) => {
      const { store, key } = (event as CustomEvent).detail || {};
      if (store === 'settings' && key === 'tracker-toon-order') refreshCustomOrder();
    };
    const handleOrderReset = () => setCustomOrder(null);
    window.addEventListener('toonhqplus-db-changed', handleDbChange);
    window.addEventListener('toonhqplus-toon-order-reset', handleOrderReset);
    return () => {
      window.removeEventListener('toonhqplus-db-changed', handleDbChange);
      window.removeEventListener('toonhqplus-toon-order-reset', handleOrderReset);
    };
  }, []);

  const orderedToons = useMemo(() => orderTrackerToons(
    savedToons,
    activeInstances.map(instance => String(instance.toonId)),
    customOrder,
  ), [savedToons, activeInstances, customOrder]);
  const firstOfflineToonIndex = orderedToons.findIndex(toon =>
    !activeInstances.some(instance => String(instance.toonId) === String(toon.id))
  );

  const persistReorderAtIndex = useCallback((draggedId: string, targetIndex: number) => {
    const visibleOrder = orderedToons.map(toon => String(toon.id));
    const sourceIndex = visibleOrder.indexOf(draggedId);
    if (sourceIndex < 0) return;
    const nextOrder = visibleOrder.filter(id => id !== draggedId);
    const adjustedIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
    nextOrder.splice(Math.max(0, Math.min(adjustedIndex, nextOrder.length)), 0, draggedId);
    if (nextOrder.every((id, index) => id === visibleOrder[index])) return;
    setCustomOrder(nextOrder);
    setSetting('tracker-toon-order', { version: 1, toonIds: nextOrder }).catch(console.error);
  }, [orderedToons]);

  const renderDropZone = (index: number) => {
    if (draggedToonId) {
      const sourceIndex = orderedToons.findIndex(toon => String(toon.id) === draggedToonId);
      if (index === sourceIndex || index === sourceIndex + 1) return <div className="h-1" />;
    }
    const isActive = draggedToonId !== null && dragTargetIndex === index;
    return (
      <div
        onDragEnter={(event) => {
          if (!draggedToonId) return;
          event.preventDefault();
          event.stopPropagation();
          setDragTargetIndex(index);
        }}
        onDragOver={(event) => {
          if (!draggedToonId) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          setDragTargetIndex(index);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const toonId = event.dataTransfer.getData('text/plain') || draggedToonId;
          if (toonId) persistReorderAtIndex(toonId, index);
          setDraggedToonId(null);
          setDragTargetIndex(null);
        }}
        className={`ml-1.5 shrink-0 rounded-lg transition-all duration-200 ${isActive ? 'my-1 h-10 border-2 border-dashed border-emerald-400/50 bg-emerald-500/20 shadow-[inset_0_0_18px_rgba(16,185,129,0.08)]' : 'h-1'}`}
      />
    );
  };

  useEffect(() => {
    savedToons.forEach(toon => {
      browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: toon.id }).then(res => {
        if (res?.data) {
          setToonsData(prev => ({ ...prev, [toon.id]: { data: res.data, history: res.history || [] } }));
        }
      });
    });
  }, [savedToons]);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type !== 'TRACKER_TOON_LAFF_UPDATED' || !message.toonId || !message.laff) return;

      const toonId = String(message.toonId);
      setLiveLaff(current => {
        const previous = current[toonId];
        if (previous?.current === message.laff.current && previous?.max === message.laff.max) return current;
        return { ...current, [toonId]: message.laff };
      });
    };

    browser.runtime.onMessage.addListener(handleMessage);
    return () => browser.runtime.onMessage.removeListener(handleMessage);
  }, []);

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto custom-scrollbar px-2 h-full animate-in fade-in slide-in-from-right-4 duration-300"
      onDragOver={(event) => {
        if (event.target === event.currentTarget) setDragTargetIndex(null);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        const bounds = event.currentTarget.getBoundingClientRect();
        const cursorOutside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (cursorOutside || (nextTarget && !event.currentTarget.contains(nextTarget))) setDragTargetIndex(null);
      }}
    >
      {savedToons.length > 0 ? <>
        {orderedToons.map((toon, toonIndex) => {
        const toonRes = toonsData[toon.id];
        const data = toonRes?.data;
        const isActive = activeInstances.some(inst => String(inst.toonId) === String(toon.id));
        const currentLaff = liveLaff[String(toon.id)]?.current ?? data?.data?.laff?.current ?? toon.laff;
        const maxLaff = liveLaff[String(toon.id)]?.max ?? data?.data?.laff?.max ?? toon.laff;

        const rewards = data?.data?.rewards;
        const stats = {
          sos: rewards ? Object.values(rewards.sos || {}).reduce((a: number, b) => a + (b as number), 0) : 0,
          unites: rewards ? Object.values(rewards.unites || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0) : 0,
          summons: rewards ? Object.values(rewards.summons || {}).reduce((a: number, b: any) => a + (b.single ? 1 : 0) + (b.building ? 1 : 0) + (b.invasion ? 1 : 0), 0) : 0,
          pinkslips: rewards ? (rewards.pinkslips || 0) : 0,
          remotes: rewards ? Object.values(rewards.remotes || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0) : 0,
        };

        const rewardLabels = { sos: 'SOS', unites: 'Unites', summons: 'Summons', pinkslips: 'Pink Slips', remotes: 'Remotes' };
        const CATEGORIES_CONFIG = [
          { id: 'sos', color: '#a855f7' },
          { id: 'unites', color: '#22c55e' },
          { id: 'summons', color: '#3b82f6' },
          { id: 'pinkslips', color: '#a47148' },
          { id: 'remotes', color: '#ef4444' },
        ];

        return (
          <React.Fragment key={toon.id}>
          {toonIndex === firstOfflineToonIndex && firstOfflineToonIndex > 0 && (
            <div className="my-2 ml-1.5 h-px bg-emerald-300/15" aria-hidden="true" />
          )}
          {renderDropZone(toonIndex)}
          <div
            draggable
            onDragStart={(event) => {
              const toonId = String(toon.id);
              setDraggedToonId(toonId);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', toonId);
            }}
            onDragOver={(event) => {
              if (!draggedToonId || draggedToonId === String(toon.id)) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              const bounds = event.currentTarget.getBoundingClientRect();
              setDragTargetIndex(event.clientY < bounds.top + bounds.height / 2 ? toonIndex : toonIndex + 1);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const toonId = event.dataTransfer.getData('text/plain') || draggedToonId;
              if (toonId) {
                const bounds = event.currentTarget.getBoundingClientRect();
                persistReorderAtIndex(toonId, event.clientY < bounds.top + bounds.height / 2 ? toonIndex : toonIndex + 1);
              }
              setDraggedToonId(null);
              setDragTargetIndex(null);
            }}
            onDragEnd={() => { setDraggedToonId(null); setDragTargetIndex(null); }}
            onClick={() => {
            selectToon(toon.id);
            window.dispatchEvent(new CustomEvent('toonhqplus-open-shtickerbook', { detail: { tab: 'toon_tracker' } }));
          }} className={`relative ml-1.5 grid grid-cols-[minmax(0,3fr)_minmax(280px,4fr)_minmax(0,3fr)_auto] items-stretch gap-0 bg-slate-950/40 rounded-xl border px-3 py-4 hover:bg-white/5 cursor-grab active:cursor-grabbing transition-all duration-200 shadow-lg group ${draggedToonId === String(toon.id) ? 'scale-[0.97] border-emerald-400/30 opacity-20 shadow-none' : 'border-white/5 opacity-100'}`}>

            <button
              type="button"
              aria-label={`Reorder ${toon.name}`}
              title="Drag to reorder"
              onClick={(event) => event.stopPropagation()}
              className="absolute -left-3 top-1/2 z-10 flex h-9 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-md border border-emerald-300/30 bg-[#0c3622] text-emerald-100 opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.65)] transition-all duration-200 hover:bg-[#145837] group-hover:opacity-100 active:cursor-grabbing"
            >
              <svg aria-hidden="true" width="10" height="16" viewBox="0 0 14 22" fill="currentColor">
                <circle cx="3" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
                <circle cx="3" cy="11" r="1.5" /><circle cx="11" cy="11" r="1.5" />
                <circle cx="3" cy="18" r="1.5" /><circle cx="11" cy="18" r="1.5" />
              </svg>
            </button>

            <div className="relative flex min-w-0 flex-col gap-3 pr-4">
              {!isActive && <button
                type="button"
                aria-label={`Delete ${toon.name}`}
                title="Delete saved toon"
                onClick={(event) => removeSavedToon(event, String(toon.id), toon.name)}
                onDragStart={(event) => event.stopPropagation()}
                className="absolute right-2 top-1 z-10 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-300/25 bg-[#0c3622] text-red-300 opacity-0 shadow-[0_3px_10px_rgba(0,0,0,0.45)] transition-all duration-200 hover:border-red-300/50 hover:bg-[#145837] hover:text-red-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.65)] group-hover:opacity-100"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>
              </button>}
              <div className="flex items-center gap-2 w-full pr-8">
                <span className={`flex rounded-full shrink-0 ${isActive ? 'w-2.5 h-2.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'w-2 h-2 bg-white/10'}`} title={isActive ? 'Active' : 'Offline'}></span>
                <span className={`text-[13px] font-bold truncate transition-colors ${isActive ? 'text-emerald-400' : 'text-white/80 group-hover:text-white'}`}>{toon.name} <span className={isActive ? getLaffColorClass(currentLaff, maxLaff) : 'text-white/40'}>({currentLaff}/{maxLaff})</span></span>
              </div>
              <div className="flex items-center gap-3 w-full">
                <div className={`w-14 h-14 rounded-full border bg-black/20 overflow-hidden shrink-0 flex items-center justify-center transition-colors ${isActive ? 'border-emerald-500/30' : 'border-white/10 group-hover:border-white/30'}`}>
                  <img src={`https://rendition.toontownrewritten.com/render/${toon.style}/portrait/256x256.webp`} alt={toon.name} className={`w-full h-full object-contain scale-[1.25] transition-all ${isActive ? '' : 'grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100'}`} />
                </div>
                <div className="flex flex-col gap-2 min-w-0 flex-1">

                  <ToonGagsStrip gags={data?.data?.gags as any} />
                  <div className="flex justify-center items-center gap-2 w-full pt-2 border-t border-white/10">
                    {CATEGORIES_CONFIG.map(({ id: cat, color }) => {
                      const count = stats[cat as keyof typeof stats] || 0;
                      return (
                        <div key={cat} className="relative flex items-center justify-center" title={rewardLabels[cat as keyof typeof rewardLabels]}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/10" style={{ backgroundColor: `${color}15` }}>
                            <img src={getExtensionImageUrl(`images/${cat}.webp`)} className={`w-4 h-4 object-contain filter drop-shadow-sm ${count === 0 ? 'grayscale opacity-30' : 'opacity-90'}`} />
                          </div>
                          {count > 0 && (
                            <div className="absolute -top-1.5 -right-1.5 bg-black border border-white/10 text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center shadow-lg" style={{ color }}>
                              {count}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>

            <ToonSuitsView cogsuits={data?.data?.cogsuits} condensed />

            <div className="flex min-w-0 flex-col gap-1.5 border-l border-white/10 pl-4 h-full min-h-[90px] justify-center">
              {data?.data?.tasks && data.data.tasks.length > 0 ? (
                <>
                  {data.data.tasks.slice(0, 4).map((task: any, i: number) => {
                    const progress = (task.objective.progress.current / task.objective.progress.target) * 100;
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center gap-2">
                          <div className="text-[10px] font-bold text-white/70 truncate" title={task.objective.text}>{task.objective.text}</div>
                          <div className={`text-[9px] font-black uppercase tracking-wider shrink-0 ${task.objective.progress.text === "Complete" ? 'text-green-400' : 'text-emerald-400/70'}`}>{task.objective.progress.text}</div>
                        </div>
                        <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div className={`h-full rounded-full transition-all duration-700 ${task.objective.progress.text === "Complete" ? 'bg-green-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {data.data.tasks.length > 4 && (
                    <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] pt-0.5">+{data.data.tasks.length - 4} more tasks</div>
                  )}
                </>
              ) : (
                <div className="text-[11px] font-black text-white/20 uppercase tracking-widest">No ToonTasks</div>
              )}
            </div>

            <div className="flex shrink-0 items-center pl-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1"><path d="m9 18 6-6-6-6" /></svg>
            </div>
          </div>
          </React.Fragment>
        );
      })}
      {renderDropZone(orderedToons.length)}
      </> : (
        <div className="flex-1 flex flex-col items-center justify-center opacity-40 gap-4">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div className="text-[12px] font-black uppercase tracking-[0.3em] text-white">No saved toons</div>
        </div>
      )}
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────

export const ToonTrackerTab = React.memo(function ToonTrackerTab({
  isExpanded = false,
  initialSubView = 'main',
  category: propCategory,
  selectedToonId: propSelectedToonId,
  onToonSelect
}: {
  isExpanded?: boolean;
  initialSubView?: 'main' | 'rewards_detail' | 'toons';
  category?: RewardCategory;
  selectedToonId?: string | null;
  onToonSelect?: (id: string | null) => void;
}) {
  const [toonTrackerData, setToonTrackerData] = useState<ToonTrackerData | null>(null);
  const [localSelectedToonId, setLocalSelectedToonId] = useState<string | null>(null);

  const selectedToonId = propSelectedToonId !== undefined ? propSelectedToonId : localSelectedToonId;

  const setSelectedToonId = (id: string | null) => {
    selectedToonIdRef.current = id;
    if (onToonSelect) {
      onToonSelect(id);
    } else {
      setLocalSelectedToonId(id);
    }
  };

  const selectedToonIdRef = useRef<string | null>(selectedToonId);

  useEffect(() => {
    selectedToonIdRef.current = selectedToonId;
  }, [selectedToonId]);
  const [expandedSuitId, setExpandedSuitId] = useState<string | null>(null);
  const [savedToons, setSavedToons] = useState<{ id: string; name: string; style: string; laff: number }[]>([]);
  const [pickerToonOrder, setPickerToonOrder] = useState<string[] | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [subView, setSubView] = useState<'main' | 'rewards_detail' | 'toons'>(initialSubView);
  const [activeCategory, setActiveCategory] = useState<RewardCategory>(() => {
    if (propCategory) return propCategory;
    try {
      const saved = localStorage.getItem(REWARD_CATEGORY_STORAGE_KEY);
      if (isRewardCategory(saved)) return saved;
    } catch { }
    return 'analytics';
  });
  const [sosSortBy, setSosSortBy] = useState<SOSTableSort>('default');
  const [uniteLayout, setUniteLayout] = useState<UniteLayout>(() => {
    try {
      if (localStorage.getItem(UNITE_LAYOUT_STORAGE_KEY) === 'columns') return 'columns';
    } catch { }
    return 'default';
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'24h' | '7d' | '30d'>('7d');
  const [isAnalyticsMenuOpen, setIsAnalyticsMenuOpen] = useState(false);
  const analyticsMenuRef = useRef<HTMLDivElement>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tasks: true,
    suits: true,
    rewards: true
  });
  const [activeInstances, setActiveInstances] = useState<{ port: string; toonName: string; toonId: string; isPrimary: boolean, connected: boolean, authorized: boolean }[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryEntry[]>([]);
  const [trackerEnabled, setTrackerEnabled] = useState<boolean | undefined>(undefined);
  const [rewardNotificationsEnabled, setRewardNotificationsEnabled] = useState(false);
  const [showNotificationFallback, setShowNotificationFallback] = useState(false);
  const [notificationSettingsOpening, setNotificationSettingsOpening] = useState(false);
  const [notificationFallbackError, setNotificationFallbackError] = useState<string | null>(null);
  const rewardNotificationTogglePending = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSearchingGames, setIsSearchingGames] = useState(false);
  const searchGamesPending = useRef(false);
  const [showRewardPieChart, setShowRewardPieChart] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshOrder = () => {
      getSetting<unknown>('tracker-toon-order')
        .then(value => {
          const normalized = normalizeToonOrderSetting(value);
          setPickerToonOrder(normalized?.toonIds ?? null);
          if (Array.isArray(value) && normalized) setSetting('tracker-toon-order', normalized).catch(console.error);
        })
        .catch(console.error);
    };
    refreshOrder();
    const handleDbChange = (event: Event) => {
      const { store, key } = (event as CustomEvent).detail || {};
      if (store === 'settings' && key === 'tracker-toon-order') refreshOrder();
    };
    const handleReset = () => setPickerToonOrder(null);
    window.addEventListener('toonhqplus-db-changed', handleDbChange);
    window.addEventListener('toonhqplus-toon-order-reset', handleReset);
    return () => {
      window.removeEventListener('toonhqplus-db-changed', handleDbChange);
      window.removeEventListener('toonhqplus-toon-order-reset', handleReset);
    };
  }, []);

  useEffect(() => setSubView(initialSubView), [initialSubView]);
  useEffect(() => {
    if (subView !== 'rewards_detail') return;
    // Register outside the shadow root so every reward tab can use the face.
    rewardHeadingFontPromise ??= new FontFace('ToonHQ Minnie', `url("${getExtensionImageUrl('fonts/MinnieFont.woff')}") format("woff")`)
      .load()
      .then(font => { document.fonts.add(font); })
      .catch(() => { rewardHeadingFontPromise = undefined; });
  }, [subView]);
  useEffect(() => { if (propCategory) setActiveCategory(propCategory); }, [propCategory]);

  useEffect(() => {
    try {
      localStorage.setItem(UNITE_LAYOUT_STORAGE_KEY, uniteLayout);
    } catch { }
  }, [uniteLayout]);

  useEffect(() => setIsSortMenuOpen(false), [activeCategory]);

  useEffect(() => {
    if (subView !== 'rewards_detail') return;
    try {
      localStorage.setItem(REWARD_CATEGORY_STORAGE_KEY, activeCategory);
    } catch { }
  }, [activeCategory, subView]);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab === 'reward_details' && isRewardCategory(detail.category)) {
        setActiveCategory(detail.category);
        if (subView === 'rewards_detail') delete (window as any)._pendingRewardCategory;
      }
    };
    window.addEventListener('toonhqplus-open-shtickerbook', handleOpen);
    return () => window.removeEventListener('toonhqplus-open-shtickerbook', handleOpen);
  }, [subView]);

  useEffect(() => {
    Promise.all([
      browser.storage.local.get('reward-notifications-enabled'),
      browser.runtime.sendMessage({ type: 'GET_REWARD_NOTIFICATION_PERMISSION' }),
    ]).then(([stored, permission]: any[]) => {
      if (permission?.ok === false) throw new Error(permission.error || 'Could not check notification permission.');
      setRewardNotificationsEnabled(stored['reward-notifications-enabled'] === true && permission?.granted === true);
    }).catch(console.error);

    const handleStorageChange = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes['reward-notifications-enabled']) {
        setRewardNotificationsEnabled(changes['reward-notifications-enabled'].newValue === true);
      }
    };
    browser.storage?.onChanged?.addListener(handleStorageChange);
    return () => browser.storage?.onChanged?.removeListener(handleStorageChange);
  }, []);

  const toggleRewardNotifications = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (rewardNotificationTogglePending.current) return;
    rewardNotificationTogglePending.current = true;
    const previousEnabled = rewardNotificationsEnabled;
    try {
      if (previousEnabled) {
        setRewardNotificationsEnabled(false);
        await browser.storage.local.set({ 'reward-notifications-enabled': false });
        return;
      }

      const permission = await browser.runtime.sendMessage({ type: 'GET_REWARD_NOTIFICATION_PERMISSION' });
      if (permission?.ok === false) throw new Error(permission.error || 'Could not check notification permission.');
      if (permission?.granted === true) {
        setRewardNotificationsEnabled(true);
        await browser.storage.local.set({ 'reward-notifications-enabled': true });
        return;
      }

      const offerSettings = async () => {
        setNotificationFallbackError(null);
        setShowNotificationFallback(true);
      };
      if (import.meta.env.FIREFOX) {
        await offerSettings();
      } else {
        const enabled = await requestRewardNotificationPermissionWithFallback(
          () => browser.runtime.sendMessage({ type: 'REQUEST_REWARD_NOTIFICATION_PERMISSION' }),
          offerSettings,
        );
        if (enabled) {
          setRewardNotificationsEnabled(true);
          await browser.storage.local.set({ 'reward-notifications-enabled': true });
        }
      }
    } catch (error) {
      console.error('[ToonHQ+] Failed to update reward notifications.', error);
      try {
        const [stored, permission] = await Promise.all([
          browser.storage.local.get('reward-notifications-enabled'),
          browser.runtime.sendMessage({ type: 'GET_REWARD_NOTIFICATION_PERMISSION' }),
        ]);
        if (permission?.ok === false) throw new Error(permission.error || 'Could not check notification permission.');
        setRewardNotificationsEnabled(stored['reward-notifications-enabled'] === true && permission?.granted === true);
      } catch {
        setRewardNotificationsEnabled(previousEnabled);
      }
      window.alert('ToonHQ+ could not update reward notifications. Please try again.');
    } finally {
      rewardNotificationTogglePending.current = false;
    }
  }, [rewardNotificationsEnabled]);

  const openNotificationSettings = useCallback(async () => {
    setNotificationSettingsOpening(true);
    setNotificationFallbackError(null);
    try {
      const opened = await browser.runtime.sendMessage({ type: 'OPEN_REWARD_NOTIFICATION_SETTINGS' });
      if (opened?.ok !== true) throw new Error(opened?.error || 'Could not open notification settings.');
      setShowNotificationFallback(false);
    } catch (error) {
      console.error('[ToonHQ+] Failed to open notification settings.', error);
      setNotificationFallbackError('Could not open the page. Please try again.');
    } finally {
      setNotificationSettingsOpening(false);
    }
  }, []);

  useEffect(() => {
    if (subView === 'rewards_detail' && (window as any)._pendingRewardCategory) {
      const category = (window as any)._pendingRewardCategory;
      if (isRewardCategory(category)) setActiveCategory(category);
      delete (window as any)._pendingRewardCategory;
    }
  }, [subView]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isSortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(target)) {
        setIsSortMenuOpen(false);
      }
      if (isAnalyticsMenuOpen && analyticsMenuRef.current && !analyticsMenuRef.current.contains(target)) {
        setIsAnalyticsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSortMenuOpen, isAnalyticsMenuOpen]);

  useEffect(() => {
    getSetting<boolean>('tracker-enabled').then(v => {
      setTrackerEnabled(v);
    });

    const listener = (message: any) => {
      if (message.type === 'TRACKER_PREF_CHANGED') {
        setTrackerEnabled(message.enabled);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  // Listen for background script updates
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'TRACKER_STATUS_UPDATED') {
        if (message.instances) {
          setActiveInstances(current => isDeepEqual(current, message.instances) ? current : message.instances);
        }
        if (message.savedToons) {
          setSavedToons(current => isDeepEqual(current, message.savedToons) ? current : message.savedToons);
        }

        if (message.toonTrackerData) {
          const incomingToonId = String(message.toonTrackerData.data.toon.id);

          if (!selectedToonIdRef.current || String(selectedToonIdRef.current) === incomingToonId) {
            setToonTrackerData(current => isDeepEqual(current, message.toonTrackerData) ? current : message.toonTrackerData);
            if (!selectedToonIdRef.current) {
              setSelectedToonId(incomingToonId);
            }
          }
        }

        if (message.rewardHistory && (!selectedToonIdRef.current || String(message.primaryToonId) === String(selectedToonIdRef.current))) {
          setRewardHistory(current => isDeepEqual(current, message.rewardHistory) ? current : message.rewardHistory);
        }
      }
    };
    browser.runtime.onMessage.addListener(handleMessage);

    browser.runtime.sendMessage({ type: 'GET_TRACKER_STATUS' }).then(response => {
      if (response) {
        if (response.instances) {
          setActiveInstances(current => isDeepEqual(current, response.instances) ? current : response.instances);
        }
        if (response.savedToons) {
          setSavedToons(current => isDeepEqual(current, response.savedToons) ? current : response.savedToons);
        }

        if (response.toonTrackerData) {
          const incomingId = String(response.toonTrackerData.data.toon.id);
          if (!selectedToonIdRef.current || String(selectedToonIdRef.current) === incomingId) {
            setToonTrackerData(current => isDeepEqual(current, response.toonTrackerData) ? current : response.toonTrackerData);
            if (!selectedToonIdRef.current) {
              setSelectedToonId(incomingId);
            }
          }
        }
      }
      setHasLoaded(true);
    });

    return () => browser.runtime.onMessage.removeListener(handleMessage);
  }, [selectedToonId]);

  // Listen for IndexedDB changes to keep UI in sync
  useEffect(() => {
    const handleDbChange = (e: any) => {
      const { store, key } = e.detail;
      if (store === 'settings') {
        if (key === 'tracker-toon-list') {
          browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: 'list' }).then(response => {
            if (response?.list) setSavedToons(current => isDeepEqual(current, response.list) ? current : response.list);
          });
        } else if (key?.startsWith('tracker-data-')) {
          const toonId = String(key.replace('tracker-data-', ''));
          if (toonId === String(selectedToonIdRef.current)) {
            browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId }).then(response => {
              if (response?.data && toonId === String(selectedToonIdRef.current)) setToonTrackerData(current => isDeepEqual(current, response.data) ? current : response.data);
            });
          }
        } else if (key?.startsWith('tracker-reward-history-')) {
          const toonId = String(key.replace('tracker-reward-history-', ''));
          if (toonId === String(selectedToonIdRef.current)) {
            loadRewardHistory(toonId).catch(console.error);
          }
        }
      }
    };
    window.addEventListener('toonhqplus-db-changed', handleDbChange as any);
    return () => window.removeEventListener('toonhqplus-db-changed', handleDbChange as any);
  }, [selectedToonId]);

  useEffect(() => {
    if (selectedToonId) {
      getSetting<Record<string, boolean>>(`tracker-expanded-sections-${selectedToonId}`).then(stored => {
        if (stored) {
          setExpandedSections(stored);
        } else {
          setExpandedSections({
            tasks: true,
            suits: true,
            rewards: true
          });
        }
      });
    }
  }, [selectedToonId]);

  const toggleSection = useCallback((section: string) => {
    if (isExpanded) return;
    setExpandedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      if (selectedToonId) {
        setSetting(`tracker-expanded-sections-${selectedToonId}`, next);
      }
      return next;
    });
  }, [isExpanded, selectedToonId]);

  const loadToonData = useCallback(async (toonId: string) => {
    const response = await browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: String(toonId) });
    if (response?.data && selectedToonIdRef.current === String(toonId)) {
      setToonTrackerData(current => isDeepEqual(current, response.data) ? current : response.data);
    }
  }, []);

  const loadRewardHistory = useCallback(async (toonId: string) => {
    const response = await browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: String(toonId) });
    setRewardHistory(current => isDeepEqual(current, response?.history || []) ? current : (response?.history || []));
  }, []);

  const startSync = useCallback((port?: string, enabled?: boolean) => {
    return browser.runtime.sendMessage({
      type: 'SYNC_GAMES',
      port: port,
      trackerEnabled: enabled,
    }).catch(console.error);
  }, []);

  const searchGames = useCallback(async () => {
    if (searchGamesPending.current) return;
    searchGamesPending.current = true;
    setIsSearchingGames(true);
    try {
      await startSync(undefined, trackerEnabled);
    } finally {
      searchGamesPending.current = false;
      setIsSearchingGames(false);
    }
  }, [startSync, trackerEnabled]);

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: 'list' }).then(res => {
      if (res?.list) setSavedToons(current => isDeepEqual(current, res.list) ? current : res.list);
    });
    browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: 'last-id' }).then(res => {
      if (res?.lastId && !selectedToonIdRef.current) {
        const stringId = String(res.lastId);
        setSelectedToonId(stringId);
        loadToonData(stringId).catch(console.error);
        loadRewardHistory(stringId).catch(console.error);
      }
    });
    startSync();
  }, [startSync, loadToonData, loadRewardHistory]);

  useEffect(() => {
    if (!selectedToonId) {
      setRewardHistory([]);
      setToonTrackerData(null);
      return;
    }
    loadToonData(selectedToonId).catch(console.error);
    loadRewardHistory(selectedToonId).catch(console.error);
  }, [selectedToonId, loadToonData, loadRewardHistory]);

  const isDropdownOpenRef = useRef(false);
  useEffect(() => { isDropdownOpenRef.current = isDropdownOpen; }, [isDropdownOpen]);
  useEffect(() => {
    const handle = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isDropdownOpenRef.current && dropdownRef.current && !dropdownRef.current.contains(target)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const toggleDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDropdownOpen) {
      browser.runtime.sendMessage({ type: 'DISCOVER_GAMES' });
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  }, [isDropdownOpen]);

  const removeSavedToon = useCallback((e: React.MouseEvent, id: string, name?: string) => {
    e.stopPropagation();
    e.preventDefault();

    const toonName = name || savedToons.find(toon => String(toon.id) === String(id))?.name || 'this toon';
    if (!window.confirm(`Delete ${toonName} from your synced toons?\n\nIts locally synced tracker data will no longer appear here.`)) return;

    // Update local state immediately for snappy UI
    setSavedToons(prev => prev.filter(t => String(t.id) !== String(id)));

    // Explicitly update via background to avoid race conditions with status broadcasts
    browser.runtime.sendMessage({ type: 'REMOVE_TOON', toonId: id }).then(res => {
      if (res?.success && selectedToonId === id) {
        setSelectedToonId(null);
        setToonTrackerData(null);
      }
    });
  }, [selectedToonId, savedToons]);

  const selectToon = useCallback((id: string | number) => {
    const stringId = String(id);
    setSelectedToonId(stringId);
    browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: stringId }).then(response => {
      if (response?.data && selectedToonIdRef.current === stringId) {
        setToonTrackerData(current => isDeepEqual(current, response.data) ? current : response.data);
        browser.runtime.sendMessage({ type: 'SET_LAST_TOON', toonId: stringId });
      }
      if (response?.history && selectedToonIdRef.current === stringId) {
        setRewardHistory(current => isDeepEqual(current, response.history) ? current : response.history);
      }
    });
    setIsDropdownOpen(false);
    const inst = activeInstances.find(i => String(i.toonId) === stringId);
    if (inst) {
      browser.runtime.sendMessage({ type: 'SWITCH_PRIMARY_INSTANCE', port: inst.port });
    }
  }, [activeInstances]);

  const filteredRewardHistory = useMemo(() => {
    const cutoff = Date.now() - (analyticsTimeframe === '24h' ? 86400000 : analyticsTimeframe === '7d' ? 604800000 : 2592000000);
    return rewardHistory.filter(r => r.timestamp >= cutoff);
  }, [rewardHistory, analyticsTimeframe]);

  const allGroups = useMemo(() => groupRewardHistory(filteredRewardHistory), [filteredRewardHistory]);
  const visibleGroups = useMemo(() => {
    const limit = isExpanded ? 50 : RECENT_REWARD_LIMIT * 4;
    const items = filteredRewardHistory.slice(0, limit);
    const groups = groupRewardHistory(items);
    return groups.slice(0, isExpanded ? 10 : RECENT_REWARD_LIMIT);
  }, [filteredRewardHistory, isExpanded]);

  if (subView === 'rewards_detail' && toonTrackerData && trackerEnabled === true) {
    const rewards = toonTrackerData.data.rewards || { pinkslips: 0, remotes: {}, sos: {}, summons: {}, unites: {} };
    const totals = {
      sos: Object.values(rewards.sos || {}).reduce((a: number, b) => a + (b as number), 0),
      unites: Object.values(rewards.unites || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
      remotes: Object.values(rewards.remotes || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
      summons: Object.values(rewards.summons || {}).reduce((a: number, b: any) => a + (b.single ? 1 : 0) + (b.building ? 1 : 0) + (b.invasion ? 1 : 0), 0),
      pinkslips: rewards.pinkslips || 0,
    };

    return (
      <section key="rewards-detail" className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300 h-full">
        <div className="flex-1 flex gap-6 overflow-hidden pt-0 pb-0">
          <div className="w-80 flex flex-col gap-4 shrink-0 overflow-hidden pt-2">
            <ToonHeader
              isExpanded={isExpanded}
              toonTrackerData={toonTrackerData}
              activeInstances={activeInstances}
              savedToons={savedToons}
              customOrder={pickerToonOrder}
              selectedToonId={selectedToonId}
              isDropdownOpen={isDropdownOpen}
              dropdownRef={dropdownRef}
              toggleDropdown={toggleDropdown}
              selectToon={selectToon}
              removeSavedToon={removeSavedToon}
              startSync={startSync}
              trackerEnabled={trackerEnabled}
            />
            <div className="flex flex-col gap-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 px-2 py-1">Categories</h3>
              <div className="space-y-1">
                {REWARD_CATEGORIES_CONFIG.map((cat) => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full cursor-pointer flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activeCategory === cat.id ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-white/60 hover:bg-white/5 border border-transparent'}`}>
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${activeCategory === cat.id ? 'bg-emerald-500/20' : 'bg-black/20'}`}>
                      <img src={getExtensionImageUrl(`images/${cat.img}`)} className={`w-5 h-5 object-contain ${activeCategory === cat.id ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
                    </div>
                    <span className="font-bold text-base">{cat.label}</span>
                    <div className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-black transition-colors ${activeCategory === cat.id ? 'bg-emerald-400 text-emerald-900' : 'bg-white/10 text-white/40 group-hover:text-white/60'}`}>{totals[cat.id as keyof typeof totals]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div
              onClick={() => setActiveCategory('analytics')}
              className="flex-1 flex flex-col min-h-0 rounded-xl border bg-slate-950/45 border-sky-200/10 cursor-pointer group/rewardhistory"
            >
              <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-3 shrink-0 ">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>
                <div className="flex items-center gap-2">
                  {rewardHistory.length > 0 && <div className="text-[11px] text-white/30">{`${rewardHistory.length} items`}</div>}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-all ${activeCategory === 'analytics' ? 'text-emerald-400 translate-x-0 opacity-100' : 'text-white/20 opacity-0 -translate-x-2 group-hover/rewardhistory:translate-x-0 group-hover/rewardhistory:opacity-100'}`}><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
              {allGroups.length > 0 ? (
                <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto custom-scrollbar">
                  {allGroups.map((group) => (
                    <RewardHistoryGroup key={group.timestamp} group={group} />
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center px-3 py-5 text-center text-[10px] font-black uppercase tracking-[0.24em] text-white/25">Nothing obtained yet</div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col min-w-0 bg-slate-950/40 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
            <div className="reward-page-header px-6 py-3 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <h3 className="reward-heading">{activeCategory === 'analytics' ? 'Rewards Stats' : REWARD_CATEGORIES_CONFIG.find(c => c.id === activeCategory)?.label}</h3>
                {activeCategory !== 'analytics' && <div className="reward-heading-count">{totals[activeCategory as keyof typeof totals]}</div>}
              </div>
              <div className="flex items-center gap-2">
                {activeCategory === 'analytics' && (
                  <div className="relative inline-flex items-center" ref={analyticsMenuRef}>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsAnalyticsMenuOpen(open => !open);
                      }}
                      className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-[#081a0e] border border-emerald-500/20 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:border-emerald-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                    >
                      <span>{analyticsTimeframe === '24h' ? 'Past Day' : analyticsTimeframe === '7d' ? 'Past 7 Days' : 'Past 30 Days'}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-white/50 transition-transform ${isAnalyticsMenuOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {isAnalyticsMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#081a0e] shadow-2xl z-[150] animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex flex-col gap-2 p-2">
                          <button
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setAnalyticsTimeframe('24h'); setIsAnalyticsMenuOpen(false); }}
                            className={`cursor-pointer w-full rounded-2xl text-left px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${analyticsTimeframe === '24h' ? 'bg-emerald-500/10 text-emerald-300' : 'text-white/70 hover:bg-white/10'}`}
                          >
                            Past Day
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setAnalyticsTimeframe('7d'); setIsAnalyticsMenuOpen(false); }}
                            className={`cursor-pointer w-full rounded-2xl text-left px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${analyticsTimeframe === '7d' ? 'bg-emerald-500/10 text-emerald-300' : 'text-white/70 hover:bg-white/10'}`}
                          >
                            Past 7 Days
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setAnalyticsTimeframe('30d'); setIsAnalyticsMenuOpen(false); }}
                            className={`cursor-pointer w-full rounded-2xl text-left px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${analyticsTimeframe === '30d' ? 'bg-emerald-500/10 text-emerald-300' : 'text-white/70 hover:bg-white/10'}`}
                          >
                            Past 30 Days
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(activeCategory === 'sos' || activeCategory === 'unites') && (
                  <div className="relative inline-flex items-center" ref={sortMenuRef}>
                    <button
                      type="button"
                      aria-label={activeCategory === 'unites' ? 'Unite layout' : 'SOS ordering'}
                      aria-expanded={isSortMenuOpen}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsSortMenuOpen(open => !open);
                      }}
                      className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-[#081a0e] border border-emerald-500/20 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:border-emerald-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                    >
                      <span className="text-white/40">{activeCategory === 'unites' ? 'View' : 'Sort by'}</span>
                      <span>{activeCategory === 'unites' ? (uniteLayout === 'columns' ? 'Columns' : 'Default') : (sosSortBy === 'count' ? 'SOS Count' : 'Default')}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-white/50 transition-transform ${isSortMenuOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {isSortMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#081a0e] shadow-2xl z-[150] animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex flex-col gap-2 p-2">
                          <button
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); if (activeCategory === 'unites') setUniteLayout('default'); else setSosSortBy('default'); setIsSortMenuOpen(false); }}
                            className={`cursor-pointer w-full rounded-2xl text-left px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${(activeCategory === 'unites' ? uniteLayout : sosSortBy) === 'default' ? 'bg-emerald-500/10 text-emerald-300' : 'text-white/70 hover:bg-white/10'}`}
                          >
                            Default
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); if (activeCategory === 'unites') setUniteLayout('columns'); else setSosSortBy('count'); setIsSortMenuOpen(false); }}
                            className={`cursor-pointer w-full rounded-2xl text-left px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${(activeCategory === 'unites' ? uniteLayout === 'columns' : sosSortBy === 'count') ? 'bg-emerald-500/10 text-emerald-300' : 'text-white/70 hover:bg-white/10'}`}
                          >
                            {activeCategory === 'unites' ? 'Columns' : 'SOS Count'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {initialSubView === 'main' && <button onClick={() => setSubView('main')} className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 transition-colors border border-white/5">Back to Dashboard</button>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {activeCategory === 'analytics' && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-500">
                  <div className="w-full max-w-4xl mx-auto h-[23rem] shrink-0">
                    <RewardPieChart history={filteredRewardHistory} timeframe={analyticsTimeframe} />
                  </div>
                  <div className="w-full max-w-4xl mx-auto shrink-0">
                    <RewardTimelineChart history={filteredRewardHistory} timeframe={analyticsTimeframe} />
                  </div>
                </div>
              )}
              {activeCategory === 'sos' && <SOSTableView sos={rewards.sos || {}} sortBy={sosSortBy} />}
              {activeCategory === 'unites' && (
                <UniteInventory unites={rewards.unites || {}} getImageUrl={getExtensionImageUrl} layout={uniteLayout} />
              )}
              {activeCategory === 'remotes' && <RemoteInventory remotes={rewards.remotes || {}} getImageUrl={getExtensionImageUrl} />}
              {activeCategory === 'summons' && <SummonsTableView summons={rewards.summons || {}} />}
              {activeCategory === 'pinkslips' && <PinkSlipsGridView count={rewards.pinkslips || 0} />}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (subView === 'toons') {
    return (
      <section key="toons-list" className="flex-1 flex flex-col overflow-hidden h-full">
        <ToonsListView savedToons={savedToons} activeInstances={activeInstances} removeSavedToon={removeSavedToon} selectToon={(id) => {
          selectToon(id);
          window.dispatchEvent(new CustomEvent('toonhqplus-open-shtickerbook', { detail: { tab: 'toon_tracker' } }));
        }} />
      </section>
    );
  }

  return (
    <section key="main-tracker" className="relative flex-1 flex flex-col overflow-hidden">
      {showNotificationFallback && (
        <div role="dialog" aria-label="Notification permission help" onKeyDown={event => {
          if (event.key === 'Escape') setShowNotificationFallback(false);
        }} className="absolute top-16 left-3 right-3 z-[500] rounded-xl border border-emerald-300/30 bg-slate-950 p-4 shadow-2xl text-white">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">No permission prompt?</p>
            <button type="button" aria-label="Dismiss notification permission help" onClick={() => setShowNotificationFallback(false)} className="cursor-pointer rounded px-2 py-1 text-white/70 hover:text-white">✕</button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/80">If no notification permission prompt was shown, you can enable notifications from the confirmation page.</p>
          <button type="button" autoFocus disabled={notificationSettingsOpening} onClick={openNotificationSettings} className="mt-3 w-full cursor-pointer rounded-lg border border-emerald-400/50 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:opacity-70">
            {notificationSettingsOpening ? 'Opening…' : 'Open notification confirmation page'}
          </button>
          {notificationFallbackError && <p role="alert" className="mt-2 text-xs text-red-300">{notificationFallbackError}</p>}
        </div>
      )}
      <ToonHeader
        isExpanded={isExpanded}
        toonTrackerData={toonTrackerData}
        activeInstances={activeInstances}
        savedToons={savedToons}
        customOrder={pickerToonOrder}
        selectedToonId={selectedToonId}
        isDropdownOpen={isDropdownOpen}
        dropdownRef={dropdownRef}
        toggleDropdown={toggleDropdown}
        selectToon={selectToon}
        removeSavedToon={removeSavedToon}
        startSync={startSync}
        trackerEnabled={trackerEnabled}
      />
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2 pr-2">
        {trackerEnabled === true && toonTrackerData ? (
          <div className={`animate-in fade-in slide-in-from-bottom-2 duration-300 ${isExpanded ? 'grid grid-cols-[320px_1fr] gap-4' : 'flex flex-col gap-4'}`}>
            <div className="flex flex-col gap-4">
              <div
                className={`space-y-2 rounded-xl bg-[linear-gradient(180deg,rgba(8,47,73,0.4),rgba(3,7,18,0.55))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] h-full ${isExpanded ? 'border border-white/5' : ''}`}
              >
                <div
                  role={isExpanded ? undefined : 'button'}
                  tabIndex={isExpanded ? undefined : 0}
                  onClick={(event) => {
                    if (isExpanded) return;
                    event.stopPropagation();
                    toggleSection('rewards');
                  }}
                  onKeyDown={(event) => {
                    if (isExpanded || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSection('rewards');
                  }}
                  className={`w-full flex items-center px-2 py-1 group ${isExpanded ? '' : 'cursor-pointer'}`}
                >
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">Rewards</h4>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                    type="button"
                    onClick={toggleRewardNotifications}
                    className={`relative z-[100] group/notify p-0.5 transition-all cursor-pointer ${rewardNotificationsEnabled ? 'text-emerald-300 opacity-100' : 'text-white/35 opacity-55 hover:opacity-90 hover:text-white/70'}`}
                    aria-label={`${rewardNotificationsEnabled ? 'Disable' : 'Enable'} reward notifications`}
                    aria-pressed={rewardNotificationsEnabled}
                  >
                    {rewardNotificationsEnabled ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 18H3c0-2 3-2 3-9 0-.69.12-1.35.33-1.96"/><path d="M8.26 3.68A6 6 0 0 1 18 8c0 2.14.28 3.64.66 4.71"/><path d="m2 2 20 20"/></svg>
                    )}
                    <span className="pointer-events-none absolute right-0 top-full z-[100] mt-2 w-max max-w-[220px] rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-[9px] font-bold normal-case tracking-normal text-white/90 opacity-0 transition-opacity group-hover/notify:opacity-100">
                      <span className="block">Reward notifications are {rewardNotificationsEnabled ? 'enabled.' : 'disabled.'}</span>
                      <span className="block">Click to {rewardNotificationsEnabled ? 'disable.' : 'enable.'}</span>
                    </span>
                    </button>
                    {!isExpanded && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSections.rewards ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>}
                  </div>
                </div>
                {toonTrackerData.data.rewards && (
                  <div className={`flex justify-between items-center py-3 ${isExpanded ? 'px-2' : 'px-2'}`}>
                    {(() => {
                      const rewards = toonTrackerData.data.rewards!;
                      const totals = {
                        pinkslips: rewards.pinkslips || 0,
                        sos: Object.values(rewards.sos || {}).reduce((a: number, b) => a + (b as number), 0),
                        unites: Object.values(rewards.unites || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
                        remotes: Object.values(rewards.remotes || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
                        summons: Object.values(rewards.summons || {}).reduce((a: number, b: any) => a + (b.single ? 1 : 0) + (b.building ? 1 : 0) + (b.invasion ? 1 : 0), 0),
                      };
                      const types = [
                        { id: 'sos', img: 'sos.webp', count: totals.sos, bg: '#6b21a8' },
                        { id: 'unites', img: 'unites.webp', count: totals.unites, bg: '#14532d' },
                        { id: 'summons', img: 'summons.webp', count: totals.summons, bg: '#1e3a5f' },
                        { id: 'pinkslips', img: 'pinkslips.webp', count: totals.pinkslips, bg: '#4a3728' },
                        { id: 'remotes', img: 'remotes.webp', count: totals.remotes, bg: '#991b1b' }
                      ] as const;

                      const handleRewardClick = (e: React.MouseEvent, category: RewardCategory) => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent('toonhqplus-open-shtickerbook', {
                          detail: { tab: 'reward_details', category }
                        }));
                      };

                      return types.map(rt => (
                        <div
                          key={rt.id}
                          onClick={(e) => handleRewardClick(e, rt.id)}
                          className="relative group/reward flex flex-col items-center gap-1 cursor-pointer"
                        >
                          <div className={`${isExpanded ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-black/40 border border-white/10 p-1.5 flex items-center justify-center relative transition-all group-hover/reward:scale-110 group-hover/reward:border-white/30 group-hover/reward:bg-black/60 shadow-lg`}>
                            <img src={getExtensionImageUrl(`images/${rt.img}`)} alt={rt.id} className="w-full h-full object-contain filter drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]" />
                            {rt.count > 0 && <div
                              className={`${isExpanded ? 'min-w-[20px] h-[20px] text-[11px]' : 'min-w-[18px] h-[18px] text-[10px]'} absolute -top-1 -right-1 px-1 rounded-full flex items-center justify-center font-black text-white border border-white/20 shadow-xl z-10`}
                              style={{ backgroundColor: rt.bg }}
                            >
                              {rt.count}
                            </div>}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
                {(expandedSections.rewards || isExpanded) && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="bg-slate-950/30 rounded-lg border border-sky-200/10 overflow-hidden">
                      <div className="px-3 py-2 bg-white/[0.04] border-b border-white/5 flex items-center justify-between gap-3">
                        <div className="text-[9px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>
                        {allGroups.length > 5 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.dispatchEvent(new CustomEvent('toonhqplus-open-shtickerbook', {
                                detail: { tab: 'reward_details' }
                              }));
                            }}
                            className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                          >
                            Show All
                          </button>
                        )}
                      </div>
                      {visibleGroups.length > 0 ? (
                        <div className={`divide-y divide-white/[0.06] overflow-y-auto custom-scrollbar ${isExpanded ? 'max-h-[calc(100vh-350px)]' : 'max-h-56'}`}>
                          {visibleGroups.map((group) => (
                            <RewardHistoryGroup key={group.timestamp} group={group} />
                          ))}
                        </div>
                      ) : <div className="px-3 py-5 text-center text-[10px] font-black uppercase tracking-[0.24em] text-white/25">Nothing obtained yet</div>}
                    </div>
                  </div>
                )}
              </div>

            </div>
            <div className={isExpanded ? "flex flex-col gap-4" : "contents"}>
              <div className="space-y-2 rounded-xl border border-fuchsia-300/10 bg-[linear-gradient(180deg,rgba(88,28,135,0.22),rgba(17,24,39,0.5))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <button onClick={() => !isExpanded && toggleSection('suits')} className={`w-full flex items-center justify-between px-2 py-1 group ${isExpanded ? 'cursor-default' : 'cursor-pointer'}`}>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">Cog Suits</h4>
                  {!isExpanded && <div className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSections.suits ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg></div>}
                </button>
                {(expandedSections.suits || isExpanded) && (
                  <ToonSuitsView
                    cogsuits={toonTrackerData.data.cogsuits}
                    isExpanded={isExpanded}
                    expandedSuitId={expandedSuitId}
                    setExpandedSuitId={setExpandedSuitId}
                  />
                )}
              </div>
              <div className="space-y-2 rounded-xl border border-amber-300/20 bg-[linear-gradient(180deg,rgba(120,53,15,0.22),rgba(28,25,23,0.45))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <button onClick={() => !isExpanded && toggleSection('tasks')} className={`w-full flex items-center justify-between px-2 py-1 group ${isExpanded ? 'cursor-default' : 'cursor-pointer'}`}>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">ToonTasks</h4>
                  {!isExpanded && <div className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSections.tasks ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg></div>}
                </button>
                {(expandedSections.tasks || isExpanded) && (
                  <div className={`animate-in fade-in slide-in-from-top-1 duration-200 ${isExpanded ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-2'}`}>
                    {toonTrackerData?.data?.tasks && toonTrackerData.data.tasks.length > 0 ? toonTrackerData.data.tasks.map((task: any, i: number) => {
                      const progress = (task.objective.progress.current / task.objective.progress.target) * 100;
                      return (
                        <div key={i} className={`p-4 rounded-lg border flex flex-col gap-3 transition-all shadow-md group hover:brightness-[0.94] ${task.objective.progress.text === "Complete" ? 'bg-[#91e2af] border-green-600/30' : 'bg-[#fcf8ef] border-[#5c4a33]/30'}`}>
                          <div className="space-y-0.5">
                            <div className={`text-sm font-black leading-tight select-all ${task.objective.progress.text === "Complete" ? 'text-[#064e3b]' : 'text-[#4a3728]'}`}>{task.objective.text}</div>
                            {task.objective.where && <div className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={task.objective.progress.text === "Complete" ? 'text-green-800/60' : 'text-[#5c4a33]/60'}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg><span className={`text-[9.5px] font-black uppercase tracking-widest ${task.objective.progress.text === "Complete" ? 'text-green-800/60' : 'text-[#5c4a33]/60'}`}>{task.objective.where}</span></div>}
                          </div>
                          <div className="space-y-1 pt-1">
                            <div className="h-2 w-full bg-black/10 rounded-full overflow-hidden border border-black/5 p-[1px]"><div className={`h-full rounded-full transition-all duration-700 ${task.objective.progress.text === "Complete" ? 'bg-green-600 shadow-[0_0_8px_rgba(22,163,74,0.3)]' : 'bg-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.3)]'}`} style={{ width: `${Math.min(100, progress)}%` }} /></div>
                            <div className={`text-right text-[11.5px] font-black uppercase tracking-[0.1em] ${task.objective.progress.text === "Complete" ? 'text-green-800' : 'text-emerald-700'}`}>{task.objective.progress.text}</div>
                          </div>
                        </div>
                      );
                    }) : <div className={`py-6 text-center rounded-lg border border-dashed border-[#5c4a33]/30 bg-black/5 ${isExpanded ? 'col-span-2' : ''}`}><span className="text-[11.5px] font-bold text-[#5c4a33]/50 uppercase tracking-[0.3em]">No Active Tasks</span></div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
            {(hasLoaded && trackerEnabled === true) ? (
              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400/50"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm font-bold text-emerald-200 leading-relaxed">Connect to your toon<br />to see stats</p>
                  <p className="text-[11px] text-white/75 max-w-[240px] mx-auto leading-relaxed">Enable <span className="font-semibold text-white/90">Companion App Support</span> in your TTR settings to get started.</p>
                </div>
                <button
                  onClick={searchGames}
                  disabled={isSearchingGames}
                  aria-busy={isSearchingGames}
                  className="mt-2 inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-bold tracking-wide transition-all cursor-pointer disabled:cursor-wait disabled:opacity-70"
                >
                  {isSearchingGames && <svg aria-hidden="true" className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>}
                  {isSearchingGames ? 'Checking…' : 'Search for Games'}
                </button>
              </div>
            ) : hasLoaded ? (
              <div className={`h-full flex flex-col items-center justify-center ${isExpanded ? 'py-20' : ''} animate-in fade-in duration-500`}>
                <div className="flex flex-col items-center gap-6 opacity-80 max-w-xl mx-auto text-center">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-emerald-500/40 flex items-center justify-center bg-emerald-500/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-emerald-400"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="9" r="3" />
                    </svg>
                  </div>
                  <div className="text-center space-y-3">
                    <p className={`font-black text-emerald-300 leading-relaxed ${isExpanded ? 'text-2xl' : 'text-[14px]'}`}>
                      Allow ToonHQ+ to connect to your Toontown Rewritten game as a Companion App?
                    </p>
                    <p className={`text-white/75 leading-relaxed ${isExpanded ? 'text-lg px-8' : 'text-[11px]'}`}>
                      This will allow you to track your toons rewards, tasks and suit progressions in this extension.
                    </p>
                    <p className={`text-white/75 leading-relaxed ${isExpanded ? 'text-lg px-8' : 'text-[11px]'}`}>
                      This is a direct connection from your browser to your game. No data leaves your device.
                    </p>
                    <p className={`text-white/50 italic ${isExpanded ? 'text-sm' : 'text-[10px]'}`}>
                      You can change this setting any time in Settings.
                    </p>
                  </div>
                  <div className={`flex items-center gap-3 w-full mt-2 ${isExpanded ? 'max-w-[400px]' : 'max-w-[200px]'}`}>
                    <button
                      onClick={() => {
                        setTrackerEnabled(true);
                        setSetting('tracker-enabled', true).catch(console.error);
                        browser.runtime.sendMessage({ type: 'TRACKER_PREF_CHANGED', enabled: true });
                        window.dispatchEvent(new CustomEvent('toonhqplus-db-changed', { detail: { store: 'settings', key: 'tracker-enabled' } }));
                      }}
                      className={`flex-1 cursor-pointer rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-[0.1em] transition-all ${isExpanded ? 'py-4 text-sm' : 'py-2.5 text-[11px]'}`}
                    >
                      {isExpanded ? 'Allow' : 'Yes'}
                    </button>
                    {!isExpanded && <button
                      onClick={() => {
                        setSetting('tracker-enabled', false).catch(console.error);
                        setTrackerEnabled(false);
                        browser.runtime.sendMessage({ type: 'TRACKER_PREF_CHANGED', enabled: false });
                        window.dispatchEvent(new CustomEvent('toonhqplus-db-changed', { detail: { store: 'settings', key: 'tracker-enabled' } }));

                        if (!isExpanded) {
                          // Change tab in SidebarApp
                          setSetting('active-tab', 'settings').catch(console.error);
                          window.dispatchEvent(new CustomEvent('toonhqplus-db-changed', { detail: { store: 'settings', key: 'active-tab' } }));
                        }
                      }}
                      className={`flex-1 cursor-pointer rounded-full border border-white/10 hover:bg-white/5 text-white/60 hover:text-white font-black uppercase tracking-[0.1em] transition-all ${isExpanded ? 'py-4 text-sm' : 'py-2.5 text-[11px]'}`}
                    >
                      No
                    </button>}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
});
