import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getSetting, setSetting } from './db';
import type { ToonTrackerData } from './tracker';
import { browser } from 'wxt/browser';
import { cogs as cogsData } from './cogs';
import {
  REWARD_HIGHLIGHT_MS,
  RECENT_REWARD_LIMIT,
  groupRewardHistory,
  isDeepEqual
} from './trackerUtils';
import type { RewardCategory, RewardHistoryEntry, RewardGroup } from './trackerUtils';

function getExtensionImageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  try {
    return browser.runtime.getURL(cleanPath as any);
  } catch (e) {
    return `/${cleanPath}`;
  }
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
  { id: 'sos', label: 'SOS Cards', img: 'sos.png' },
  { id: 'unites', label: 'Unites', img: 'unites.png' },
  { id: 'summons', label: 'Cog Summons', img: 'summons.png' },
  { id: 'pinkslips', label: 'Pink Slips', img: 'pinkslips.png' },
  { id: 'remotes', label: 'Remotes', img: 'remotes.png' },
] as const;

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

const SOS_DATA: Record<string, { type: string; starRating: number }> = {
  'Lord Lowden Clear': { type: 'Fire', starRating: 5 },
  'Professor Pete': { type: 'Restock', starRating: 5 },
  'Professor Guffaw': { type: 'Restock', starRating: 3 },
  'Clerk Ray': { type: 'Restock', starRating: 3 },
  'Doctor Drift': { type: 'Restock', starRating: 3 },
  'Melody Wavers': { type: 'Restock', starRating: 3 },
  'Shelly Seaweed': { type: 'Restock', starRating: 3 },
  'Rocky': { type: 'Throw', starRating: 5 },
  'Sticky Lou': { type: 'Toons Hit', starRating: 5 },
  'Julius Wheezer': { type: 'Cogs Miss', starRating: 5 },
  'Flippy': { type: 'Toon Up', starRating: 5 },
  'Clerk Clara': { type: 'Trap', starRating: 5 },
  'Lil Oldman': { type: 'Lure', starRating: 5 },
  'Nancy Gas': { type: 'Lure', starRating: 4 },
  'Barnacle Bessie': { type: 'Drop', starRating: 5 },
  'Baker Bridget': { type: 'Restock', starRating: 3 },
  'Soggy Nell': { type: 'Toons Hit', starRating: 4 },
  'Mr. Freeze': { type: 'Cogs Miss', starRating: 4 },
  'Daffy Don': { type: 'Toon Up', starRating: 4 },
  'Clerk Penny': { type: 'Trap', starRating: 4 },
  'Stinky Ned': { type: 'Lure', starRating: 3 },
  'Moe Zart': { type: 'Sound', starRating: 5 },
  'Franz Neckvein': { type: 'Drop', starRating: 4 },
  'Sofie Squirt': { type: 'Restock', starRating: 3 },
  'Soggy Bottom': { type: 'Toons Hit', starRating: 3 },
  'Flim Flam': { type: 'Cogs Miss', starRating: 3 },
  'Madam Chuckle': { type: 'Toon Up', starRating: 3 },
  'Clerk Will': { type: 'Trap', starRating: 3 },
  'Sid Sonata': { type: 'Sound', starRating: 4 },
  'Barbara Seville': { type: 'Sound', starRating: 3 },
  'Clumsy Ned': { type: 'Drop', starRating: 3 },
  'Loopy Loopenloop': { type: 'Squirt', starRating: 5 },
};

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
  selectedToonId: string | null;
  isDropdownOpen: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  toggleDropdown: (e: React.MouseEvent) => void;
  selectToon: (id: string | number) => void;
  removeSavedToon: (e: React.MouseEvent, id: string) => void;
  startSync: (port?: string) => void;
  trackerEnabled: boolean | undefined;
}

const ToonHeader = React.memo(({
  isExpanded,
  toonTrackerData,
  activeInstances,
  savedToons,
  selectedToonId,
  isDropdownOpen,
  dropdownRef,
  toggleDropdown,
  selectToon,
  removeSavedToon,
  startSync,
  trackerEnabled
}: ToonHeaderProps) => (
  <div className={`py-2 flex items-center gap-3 relative border-b border-white/5 ${isExpanded ? 'px-1' : 'px-3'}`}>
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
            <div className={`text-[9.5px] font-black uppercase tracking-widest truncate ${toonTrackerData && activeInstances.some(inst => String(inst.toonId) === String(toonTrackerData.data.toon.id)) ? 'text-emerald-400/80' : 'text-white/40'}`}>
              {toonTrackerData ? (activeInstances.some(inst => String(inst.toonId) === String(toonTrackerData.data.toon.id)) ? 'Active' : 'Offline') : 'Select Toon'}
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
                  {activeInstances.sort((a, b) => parseInt(a.port) - parseInt(b.port)).map((inst) => {
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

              {savedToons.filter(t => !activeInstances.some(inst => inst.toonId === t.id)).length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 border-b border-white/5 mb-1 bg-black/20">
                    Saved Toons
                  </div>
                  {savedToons.filter(t => !activeInstances.some(inst => inst.toonId === t.id)).map(t => (
                    <div key={t.id} onMouseDown={(e) => { e.stopPropagation(); selectToon(t.id); }} className={`flex items-center gap-3 p-2 mx-1 mt-1 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group/item ${selectedToonId === t.id ? 'bg-emerald-500/10 border border-emerald-500/10' : 'border border-transparent'}`}>
                      <div className="w-8 h-8 rounded-full border border-white/5 bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
                        <img src={`https://rendition.toontownrewritten.com/render/${t.style}/portrait/256x256.webp`} alt={t.name} className="w-full h-full object-contain scale-[1.3] grayscale opacity-50" />
                      </div>
                      <span className={`flex-1 text-[11.5px] font-bold truncate ${selectedToonId === t.id ? 'text-emerald-400' : 'text-white/60'}`}>{t.name}</span>
                      <button onMouseDown={(e) => { e.stopPropagation(); removeSavedToon(e as any, t.id); }} className="p-1.5 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all text-white/30 hover:bg-red-500/10 rounded pointer-events-auto">
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
));

const SOSTableView = React.memo(({ sos }: { sos: Record<string, number> }) => {
  const sosGrid = [
    // ['Sticky Lou', 'Julius Wheezer', 'Flippy', 'Clerk Clara', 'Lil Oldman', 'Moe Zart', 'Barnacle Bessie', 'Sofie Squirt'],
    // ['Soggy Nell', 'Mr. Freeze', 'Daffy Don', 'Clerk Penny', 'Nancy Gas', 'Sid Sonata', 'Franz Neckvein', 'Rocky'],
    // ['Soggy Bottom', 'Flim Flam', 'Madam Chuckle', 'Clerk Will', 'Stinky Ned', 'Barbara Seville', 'Clumsy Ned', 'Loopy Loopenloop']
    ['Professor Pete', 'Flippy', 'Clerk Clara', 'Lil Oldman', 'Moe Zart', 'Barnacle Bessie', 'Sticky Lou', "Julius Wheezer"],
    ['Baker Bridget', 'Daffy Don', 'Clerk Penny', 'Nancy Gas', 'Sid Sonata', 'Franz Neckvein', 'Soggy Nell', 'Mr. Freeze'],
    ['Sofie Squirt', 'Madam Chuckle', 'Clerk Will', 'Stinky Ned', 'Barbara Seville', 'Clumsy Ned', 'Soggy Bottom', 'Flim Flam'],
    ['Lord Lowden Clear', 'Professor Guffaw', 'Clerk Ray', 'Doctor Drift', 'Melody Wavers', 'Shelly Seaweed', 'Rocky', 'Loopy Loopenloop']
  ];

  // Image mapping from CogCalculator.tsx
  const sosImages: Record<string, string> = {
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

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar p-2">
      <div className="grid grid-cols-4 xl:grid-cols-8 gap-3">
        {sosGrid.flat().map(name => {
          const count = Object.entries(sos).find(([n, _]) => n.replace(/\u0003/g, '') === name)?.[1] || 0;
          const image = sosImages[name] || '';
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
    <div className="flex flex-col gap-2 h-full overflow-y-auto custom-scrollbar pr-2">
      {suits.map(suitName => {
        const suitCogs = cogsData.find(s => s.name === suitName)?.ranks || [];
        const classes = suitClasses[suitName];
        return (
          <div key={suitName} className="grid grid-cols-4 xl:grid-cols-8 gap-3">
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
              src={getExtensionImageUrl('images/pinkslips.png')}
              className={`w-full h-full max-h-8 object-contain transition-all duration-500 ${i >= count ? 'grayscale opacity-5' : 'drop-shadow-[0_0_5px_rgba(251,113,133,0.5)]'}`}
              alt="Pink Slip"
            />
          </div>
        ))}
      </div>
    </div>
  );
});
const RemoteCard = React.memo(({ type, level, count }: { type: string, level: string, count: number }) => {
  return (
    <div className={`rounded-xl border p-3 flex gap-4 transition-all hover:brightness-110 shadow-lg ${count > 0
      ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-100'
      : 'bg-black/20 border-white/5 text-white/20 opacity-40 grayscale'
      }`}>
      <div className="w-16 h-16 rounded-lg bg-black/40 border border-white/10 p-2 flex items-center justify-center shrink-0 relative">
        {/* Star Rating - Directly above the image card */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex justify-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-950 border border-white/10 shadow-xl z-20 whitespace-nowrap">
          {[...Array(parseInt(level) || 0)].map((_, i) => (
            <span key={i} className="text-[10px] leading-none text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]">★</span>
          ))}
        </div>

        <img
          src={type.includes("Healing") ? getExtensionImageUrl('images/remotesheal.png') : getExtensionImageUrl('images/remotes.png')}
          className="w-full h-full object-contain filter drop-shadow-md"
          alt={`${level} Star ${type}`}
        />
      </div>
      <div className="flex-1 flex flex-col justify-between items-end min-w-0">
        <div className={`text-2xl font-black tabular-nums ${count > 0 ? 'text-emerald-400' : ''}`}>
          {count}<span className="text-sm opacity-50 ml-0.5">/100</span>
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest truncate w-full text-right opacity-70">
          {level} Star
        </div>
      </div>
    </div>
  );
});
const UniteListItem = React.memo(({ name, count, max = 100 }: { name: string, count: number, max?: number }) => {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-pink-900/20 border border-pink-500/10 hover:border-pink-500/30 transition-all group shadow-sm">
      <div className="text-[14px] font-bold text-pink-50/90 group-hover:text-white transition-colors truncate">{name}</div>
      <div className="text-[13px] font-black text-pink-400 tabular-nums shrink-0 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
        {count}<span className="text-[10px] opacity-50 ml-0.5">/{max}</span>
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
// ─── Main Component ──────────────────────────────────────────────────────────

export const ToonTrackerTab = React.memo(function ToonTrackerTab({
  isExpanded = false,
  initialSubView = 'main',
  category: propCategory
}: {
  isExpanded?: boolean;
  initialSubView?: 'main' | 'rewards_detail';
  category?: RewardCategory;
}) {
  const [toonTrackerData, setToonTrackerData] = useState<ToonTrackerData | null>(null);
  const [selectedToonId, setSelectedToonId] = useState<string | null>(null);
  const selectedToonIdRef = useRef<string | null>(null);
  const [expandedSuitId, setExpandedSuitId] = useState<string | null>(null);
  const [savedToons, setSavedToons] = useState<{ id: string; name: string; style: string; laff: number }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [subView, setSubView] = useState<'main' | 'rewards_detail'>(initialSubView);
  const [activeCategory, setActiveCategory] = useState<RewardCategory>(propCategory || 'sos');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tasks: true,
    suits: true,
    rewards: true
  });
  const [activeInstances, setActiveInstances] = useState<{ port: string; toonName: string; toonId: string; isPrimary: boolean, connected: boolean, authorized: boolean }[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryEntry[]>([]);
  const [trackerEnabled, setTrackerEnabled] = useState<boolean | undefined>(undefined);
  const [hasLoaded, setHasLoaded] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSubView(initialSubView), [initialSubView]);
  useEffect(() => { if (propCategory) setActiveCategory(propCategory); }, [propCategory]);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab === 'reward_details' && detail.category) {
        setActiveCategory(detail.category);
      }
    };
    window.addEventListener('toonhqplus-open-shtickerbook', handleOpen);
    return () => window.removeEventListener('toonhqplus-open-shtickerbook', handleOpen);
  }, []);

  useEffect(() => {
    if (subView === 'rewards_detail' && (window as any)._pendingRewardCategory) {
      setActiveCategory((window as any)._pendingRewardCategory);
      delete (window as any)._pendingRewardCategory;
    }
  }, [subView]);

  useEffect(() => {
    getSetting<boolean>('tracker-enabled').then(v => {
      setTrackerEnabled(v);
    });

    const listener = (message: any) => {
      if (message.type === 'TRACKER_PREF_CHANGED') setTrackerEnabled(message.enabled);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (trackerEnabled === false) return;
    const port = browser.runtime.connect({ name: 'toonhqplus-tracker' });
    return () => port.disconnect();
  }, [trackerEnabled]);

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
              selectedToonIdRef.current = incomingToonId;
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
              selectedToonIdRef.current = incomingId;
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

  const loadRewardHistory = useCallback(async (toonId: string) => {
    const response = await browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: String(toonId) });
    setRewardHistory(current => isDeepEqual(current, response?.history || []) ? current : (response?.history || []));
  }, []);

  const startSync = useCallback((port?: string) => {
    browser.runtime.sendMessage({
      type: 'SYNC_GAMES',
      port: port
    });
  }, []);

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: 'list' }).then(res => {
      if (res?.list) setSavedToons(current => isDeepEqual(current, res.list) ? current : res.list);
    });
    browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: 'last-id' }).then(res => {
      if (res?.lastId && !selectedToonIdRef.current) {
        setSelectedToonId(String(res.lastId));
        selectedToonIdRef.current = String(res.lastId);
        browser.runtime.sendMessage({ type: 'GET_TOON_DATA', toonId: String(res.lastId) }).then(out => {
          if (out?.data) setToonTrackerData(current => isDeepEqual(current, out.data) ? current : out.data);
        });
      }
    });
    startSync();
  }, [startSync]);

  useEffect(() => {
    if (!selectedToonId) { setRewardHistory([]); return; }
    loadRewardHistory(selectedToonId).catch(console.error);
  }, [selectedToonId, loadRewardHistory]);

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

  const removeSavedToon = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    // Update local state immediately for snappy UI
    setSavedToons(prev => prev.filter(t => t.id !== id));

    // Explicitly update via background to avoid race conditions with status broadcasts
    browser.runtime.sendMessage({ type: 'REMOVE_TOON', toonId: id }).then(res => {
      if (res?.success && selectedToonId === id) {
        setSelectedToonId(null);
        setToonTrackerData(null);
      }
    });
  }, [selectedToonId]);

  const selectToon = useCallback((id: string | number) => {
    const stringId = String(id);
    setSelectedToonId(stringId);
    selectedToonIdRef.current = stringId;
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

  const allGroups = useMemo(() => groupRewardHistory(rewardHistory), [rewardHistory]);
  const visibleGroups = useMemo(() => {
    const limit = isExpanded ? 50 : RECENT_REWARD_LIMIT * 4;
    const items = rewardHistory.slice(0, limit);
    const groups = groupRewardHistory(items);
    return groups.slice(0, isExpanded ? 10 : RECENT_REWARD_LIMIT);
  }, [rewardHistory, isExpanded]);


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
        <div className="flex-1 flex gap-6 overflow-hidden pr-2 pt-0 pb-4">
          <div className="w-80 flex flex-col gap-4 shrink-0 overflow-hidden pt-2">
            <ToonHeader
              isExpanded={isExpanded}
              toonTrackerData={toonTrackerData}
              activeInstances={activeInstances}
              savedToons={savedToons}
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
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activeCategory === cat.id ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-white/60 hover:bg-white/5 border border-transparent'}`}>
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${activeCategory === cat.id ? 'bg-emerald-500/20' : 'bg-black/20'}`}>
                      <img src={getExtensionImageUrl(`images/${cat.img}`)} className={`w-5 h-5 object-contain ${activeCategory === cat.id ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
                    </div>
                    <span className="font-bold text-base">{cat.label}</span>
                    <div className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-black transition-colors ${activeCategory === cat.id ? 'bg-emerald-400 text-emerald-900' : 'bg-white/10 text-white/40 group-hover:text-white/60'}`}>{totals[cat.id as keyof typeof totals]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950/30 rounded-xl border border-sky-200/10 overflow-hidden">
              <div className="px-3 py-2 bg-white/[0.04] border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>
                {rewardHistory.length > 0 && <div className="text-[11px] text-white/30">{`${rewardHistory.length} items`}</div>}
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
          <div className="flex-1 bg-black/20 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black text-white uppercase tracking-widest">{REWARD_CATEGORIES_CONFIG.find(c => c.id === activeCategory)?.label}</h3>
                <div className="px-2 py-0.5 rounded-full bg-emerald-400 text-emerald-900 text-[11px] font-black">{totals[activeCategory as keyof typeof totals]}</div>
              </div>
              {initialSubView === 'main' && <button onClick={() => setSubView('main')} className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 transition-colors border border-white/5">Back to Dashboard</button>}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {activeCategory === 'sos' && <SOSTableView sos={rewards.sos || {}} />}
              {activeCategory === 'unites' && (
                <div className="flex gap-x-12 h-full overflow-y-auto custom-scrollbar pr-4">
                  {/* Left Column: Toon-Up and Jellybeans */}
                  <div className="flex-1 flex flex-col gap-y-10">
                    {['Toon-Up', 'Jellybeans'].map((categoryName) => {
                      const types = (rewards.unites || {})[categoryName] || {};
                      const sortedTypes = Object.entries(types as any).sort(([nameA], [nameB]) => {
                        const cleanA = nameA.replace(/\u0003/g, '');
                        const cleanB = nameB.replace(/\u0003/g, '');
                        const valA = parseInt(cleanA) || 0;
                        const valB = parseInt(cleanB) || 0;
                        return valA - valB;
                      });

                      return (
                        <div key={categoryName} className="flex flex-col gap-3">
                          <h4 className="text-[12px] font-black uppercase tracking-[0.2em] text-pink-400/60 border-b border-pink-500/10 pb-1.5 shrink-0">{categoryName}</h4>
                          <div className="flex flex-col gap-1.5">
                            {sortedTypes.length > 0 ? (
                              sortedTypes.map(([name, count]) => (
                                <UniteListItem key={name} name={name.replace(/\u0003/g, '')} count={count as number} max={categoryName === 'Cartoonival' ? 5 : 100} />
                              ))
                            ) : (
                              <div className="py-2 text-[10px] font-black uppercase tracking-widest text-white/10 italic">None</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Column: Gag-Up and Cartoonival */}
                  <div className="flex-1 flex flex-col gap-y-10">
                    {['Gag-Up', 'Cartoonival'].map((categoryName) => {
                      const types = (rewards.unites || {})[categoryName] || {};
                      const sortedTypes = Object.entries(types as any).sort(([nameA], [nameB]) => {
                        const cleanA = nameA.replace(/\u0003/g, '');
                        const cleanB = nameB.replace(/\u0003/g, '');
                        if (categoryName === 'Gag-Up') {
                          // const order = ['All', 'Sound', 'Throw', 'Squirt', 'Lure', 'Trap', 'Drop', 'Toon-Up']; // Preferred order
                          const order = ['Toon-Up', 'Trap', 'Lure', 'Sound', 'Throw', 'Squirt', 'Drop', 'All']; // In-game order
                          const indexA = order.findIndex(o => cleanA.endsWith(o));
                          const indexB = order.findIndex(o => cleanB.endsWith(o));
                          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                          if (indexA !== -1) return -1;
                          if (indexB !== -1) return 1;
                        }
                        return cleanA.localeCompare(cleanB);
                      });

                      return (
                        <div key={categoryName} className="flex flex-col gap-3">
                          <h4 className="text-[12px] font-black uppercase tracking-[0.2em] text-pink-400/60 border-b border-pink-500/10 pb-1.5 shrink-0">{categoryName}</h4>
                          <div className="flex flex-col gap-1.5">
                            {sortedTypes.length > 0 ? (
                              sortedTypes.map(([name, count]) => (
                                <UniteListItem key={name} name={name.replace(/\u0003/g, '')} count={count as number} max={categoryName === 'Cartoonival' ? 5 : 100} />
                              ))
                            ) : (
                              <div className="py-2 text-[10px] font-black uppercase tracking-widest text-white/10 italic">None</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeCategory === 'remotes' && <div className="space-y-8">{Object.entries(rewards.remotes || {}).length > 0 ? Object.entries(rewards.remotes || {}).map(([type, levels]) => <div key={type} className="space-y-4"><h4 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400/60 border-b border-emerald-500/10 pb-2">{type}</h4><div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{Object.entries(levels as any).map(([level, count]) => <RemoteCard key={level} type={type} level={level} count={count as number} />)}</div></div>) : <EmptyRewardState />}</div>}
              {activeCategory === 'summons' && <SummonsTableView summons={rewards.summons || {}} />}
              {activeCategory === 'pinkslips' && <PinkSlipsGridView count={rewards.pinkslips || 0} />}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section key="main-tracker" className="flex-1 flex flex-col overflow-hidden">
      <ToonHeader
        isExpanded={isExpanded}
        toonTrackerData={toonTrackerData}
        activeInstances={activeInstances}
        savedToons={savedToons}
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
              <div onClick={() => isExpanded && setSubView('rewards_detail')} className={`space-y-2 rounded-xl bg-[linear-gradient(180deg,rgba(8,47,73,0.4),rgba(3,7,18,0.55))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] h-full ${isExpanded ? 'cursor-pointer hover:brightness-125 transition-all group/rewcard border border-white/5 hover:border-emerald-500/30' : ''}`}>
                <button onClick={(e) => { if (isExpanded) { e.stopPropagation(); setSubView('rewards_detail'); } else { toggleSection('rewards'); } }} className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">Rewards {isExpanded && <span className="text-[8px] text-emerald-400/60 ml-2 opacity-0 group-hover/rewcard:opacity-100 transition-opacity">(View Detailed)</span>}</h4>
                  {!isExpanded && <div className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSections.rewards ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg></div>}
                </button>
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
                        { id: 'sos', img: 'sos.png', count: totals.sos, bg: '#6b21a8' },
                        { id: 'unites', img: 'unites.png', count: totals.unites, bg: '#14532d' },
                        { id: 'summons', img: 'summons.png', count: totals.summons, bg: '#1e3a5f' },
                        { id: 'pinkslips', img: 'pinkslips.png', count: totals.pinkslips, bg: '#4a3728' },
                        { id: 'remotes', img: 'remotes.png', count: totals.remotes, bg: '#991b1b' }
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
                {expandedSections.rewards && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="bg-slate-950/30 rounded-lg border border-sky-200/10 overflow-hidden">
                      <div className="px-3 py-2 bg-white/[0.04] border-b border-white/5 flex items-center justify-between gap-3">
                        <div className="text-[9px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>
                        {allGroups.length > 5 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.dispatchEvent(new CustomEvent('toonhqplus-open-shtickerbook', {
                                detail: { tab: 'reward_details', category: activeCategory }
                              }));
                            }}
                            className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
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
                <button onClick={() => toggleSection('suits')} className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">Cog Suits</h4>
                  {!isExpanded && <div className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSections.suits ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg></div>}
                </button>
                {expandedSections.suits && (
                  <div className={`animate-in fade-in slide-in-from-top-1 duration-200 ${isExpanded ? 'grid grid-cols-2 gap-3' : 'space-y-3'}`}>
                    {Object.entries(toonTrackerData.data.cogsuits || {}).filter(([_, suit]) => suit.hasDisguise).map(([id, suit]) => {
                      const dept = suit.department.toLowerCase().replace('bot', '');
                      const deptColors: Record<string, { bg: string, border: string, text: string, accent: string }> = {
                        sell: { bg: '#4c0d6b', border: '#9d4edd', text: '#f3e8ff', accent: '#d8b4fe' },
                        cash: { bg: '#14532d', border: '#22c55e', text: '#f0fdf4', accent: '#86efac' },
                        law: { bg: '#1e3a8a', border: '#60a5fa', text: '#eff6ff', accent: '#93c5fd' },
                        boss: { bg: '#4a3728', border: '#8c5d3d', text: '#fafaf9', accent: '#d6d3d1' }
                      };
                      const colors = deptColors[dept] || { bg: '#1f2937', border: '#374151', text: '#f9fafb', accent: '#9ca3af' };
                      const statMap: Record<string, string> = { boss: 'Stock Options', law: 'Jury Notices', cash: 'Cogbucks', sell: 'Merits' };
                      const statName = statMap[dept] || 'Points';
                      const isMaxed = suit.level >= 50;
                      const isReady = suit.promotion && suit.promotion.current >= suit.promotion.target;
                      const remaining = suit.promotion ? suit.promotion.target - suit.promotion.current : 0;
                      const progress = suit.promotion ? (suit.promotion.current / suit.promotion.target) * 100 : 0;
                      return (
                        <div key={id} className={`relative rounded-lg border flex flex-col transition-all hover:brightness-110 shadow-md group/suit ${isMaxed && !isExpanded ? 'p-3 gap-0' : 'p-4 gap-3'}`} style={{ backgroundColor: colors.bg, borderColor: `${colors.border}60` }}>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[11.5px] font-bold text-white uppercase tracking-widest truncate">{suit.department}</span>
                            <div className="flex items-center shrink-0">
                              {isMaxed && !isExpanded ? (
                                <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-black/20" style={{ color: colors.accent, borderColor: `${colors.border}40` }}>Maxed</div>
                              ) : (
                                <div className="flex items-center h-5 px-2 rounded border bg-black/20 shadow-sm" style={{ color: colors.text, borderColor: `${colors.border}40` }}>
                                  <span className="text-[11.5px] font-bold italic whitespace-nowrap opacity-70">{(suit.suit?.name || 'No Disguise').replace(/\u0003/g, '')}{suit.version === 2 ? ' V2.0' : ''}</span>
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
                          {!isMaxed && suit.promotion && remaining > 0 && (
                            <div className="pt-1 mt-1 border-t border-white/10">
                              <button onClick={(e) => { e.stopPropagation(); setExpandedSuitId(expandedSuitId === id ? null : id); }} className="w-full py-1.5 flex items-center justify-center gap-2 rounded hover:bg-black/10 transition-colors group">
                                <span className="text-[9.5px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: colors.text }}>{expandedSuitId === id ? 'Hide Recommendations' : 'Show Recommendations'}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSuitId === id ? 'rotate-180' : ''}`} style={{ color: colors.accent }}><polyline points="6 9 12 15 18 9" /></svg>
                              </button>
                              {expandedSuitId === id && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-2 space-y-1.5 pb-1">
                                  {(() => {
                                    const items = FACILITIES_DATA[dept]?.items || [];
                                    const highest = items[0];
                                    if (!highest) return null;
                                    const highestCount = Math.floor(remaining / highest.val);
                                    const rem = remaining % highest.val;
                                    const rows = [];
                                    for (let c = 0; c < highestCount; c++) rows.push(highest);
                                    if (rem > 0) {
                                      // Find the smallest single item that covers the remainder
                                      const bestFit = items.reduce((prev: any, curr: any) =>
                                        (curr.val >= rem && curr.val < prev.val) ? curr : prev,
                                        highest
                                      );
                                      rows.push(bestFit);
                                    }
                                    const total = rows.reduce((acc: number, row: any) => acc + row.val, 0);
                                    return (
                                      <div className="bg-black/10 rounded p-2 border border-white/5 flex flex-col gap-1.5">
                                        {rows.map((row: any, i: number) => <div key={i} className="flex justify-between items-center text-[10.5px] font-medium opacity-80" style={{ color: colors.text }}><span className="truncate">{row.name}</span><span className="shrink-0 ml-2">~ {row.val} {statName}</span></div>)}
                                        <div className="pt-1 mt-1 border-t border-white/10 text-right text-[11.5px] font-black" style={{ color: colors.text }}><span className="text-left">Total</span> <span style={{ color: colors.accent }}>{total.toLocaleString()} {statName}</span></div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-2 rounded-xl border border-amber-300/20 bg-[linear-gradient(180deg,rgba(120,53,15,0.22),rgba(28,25,23,0.45))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <button onClick={() => toggleSection('tasks')} className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">ToonTasks</h4>
                  {!isExpanded && <div className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSections.tasks ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg></div>}
                </button>
                {expandedSections.tasks && (
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
              <div className="flex flex-col items-center gap-6 opacity-40">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400/50"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-[11.5px] font-black text-green-200 uppercase tracking-[0.3em] leading-relaxed">Connect to your toon<br />to see stats</p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest max-w-[200px] mx-auto leading-relaxed">Enable "Companion App Support" in your TTR settings to get started</p>
                </div>
                <button
                  onClick={() => getSetting<string>('tracker-auth-key').then(key => startSync(key || undefined))}
                  className="mt-2 px-8 py-2.5 rounded-full border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 text-[10.5px] font-black uppercase tracking-[0.2em] transition-all"
                >
                  Search for Games
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
