import React, { useState, useEffect, useRef } from 'react';
import { getSetting, setSetting } from './db';
import type { ToonTrackerData } from './tracker';
import { browser } from 'wxt/browser';
import { cogs as cogsData } from './cogs';

type RewardHistoryEntry = {
  message: string;
  timestamp: number;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_REWARD_LIMIT = 5;
const REWARD_HIGHLIGHT_MS = 1 * 60 * 1000;

function getExtensionImageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  try {
    return browser.runtime.getURL(cleanPath as any);
  } catch (e) {
    return `/${cleanPath}`;
  }
}

function getRewardHistoryKey(toonId: string): string {
  return `tracker-reward-history-${toonId}`;
}

function pruneRewardHistory(entries: RewardHistoryEntry[]): RewardHistoryEntry[] {
  const cutoff = Date.now() - ONE_WEEK_MS;
  return entries
    .filter((entry) => entry.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
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

function RelativeRewardTime({ timestamp }: { timestamp: number }) {
  const [display, setDisplay] = useState(() => formatRelativeTime(timestamp));

  useEffect(() => {
    setDisplay(formatRelativeTime(timestamp));
    const update = () => setDisplay(formatRelativeTime(timestamp));
    const intervalId = window.setInterval(update, 30000);
    return () => window.clearInterval(intervalId);
  }, [timestamp]);

  return <span>{display}</span>;
}

function isRecentlyEarned(timestamp: number): boolean {
  return Date.now() - timestamp <= REWARD_HIGHLIGHT_MS;
}

const REWARD_CATEGORIES = [
  { id: 'sos', label: 'SOS Cards', img: 'sos.png' },
  { id: 'unites', label: 'Unites', img: 'unites.png' },
  { id: 'remotes', label: 'Remotes', img: 'remotes.png' },
  { id: 'summons', label: 'Cog Summons', img: 'summons.png' },
] as const;

type RewardCategory = typeof REWARD_CATEGORIES[number]['id'];

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummonIcon({ active, type }: { active: boolean, type: 'cog' | 'bldg' | 'inv' }) {
  const labels = { cog: 'C', bldg: 'B', inv: 'I' };
  const tooltips = { cog: 'Cog', bldg: 'Building', inv: 'Invasion' };

  return (
    <div
      title={tooltips[type]}
      className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${active
        ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_5px_rgba(147,51,234,0.5)]'
        : 'bg-black/40 border-white/5 text-white/10'
        }`}
    >
      {labels[type]}
    </div>
  );
}

function SummonsTableView({ summons }: { summons: any }) {
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
                  className={`rounded-xl border p-2 flex flex-col gap-2 transition-all group ${summon
                    ? `${classes.bg} ${classes.border} ${classes.hover} shadow-lg`
                    : 'bg-black/20 border-white/5 opacity-40 grayscale'
                    }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className={`text-[10px] font-black truncate leading-tight text-center ${summon ? classes.text : 'text-white/60'}`}>{cogRank.name}</div>
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
}

function RewardCard({ name, count, color, img }: { name: string, count: number, color: 'blue' | 'pink' | 'emerald' | 'purple', img: string }) {
  const colorClasses = {
    blue: 'bg-blue-900/20 border-blue-500/20 text-blue-300 shadow-blue-500/5',
    pink: 'bg-pink-900/20 border-pink-500/20 text-pink-300 shadow-pink-500/5',
    emerald: 'bg-emerald-900/20 border-emerald-500/20 text-emerald-300 shadow-emerald-500/5',
    purple: 'bg-purple-900/20 border-purple-500/20 text-purple-300 shadow-purple-500/5'
  };

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-all hover:brightness-110 shadow-lg ${colorClasses[color]}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="w-12 h-12 rounded-lg bg-black/30 border border-white/5 p-2 flex items-center justify-center shrink-0">
          <img src={getExtensionImageUrl(`images/${img}`)} className="w-full h-full object-contain filter drop-shadow-md" />
        </div>
        <div className="text-2xl font-black tabular-nums">x{count}</div>
      </div>
      <div className="text-sm font-bold leading-tight line-clamp-2 min-h-[2.5rem] flex items-end">
        {name}
      </div>
    </div>
  );
}

function UniteListItem({ name, count }: { name: string, count: number }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-pink-900/20 border border-pink-500/10 hover:border-pink-500/30 transition-all group shadow-sm">
      <div className="text-[12px] font-bold text-pink-50/90 group-hover:text-white transition-colors truncate">{name}</div>
      <div className="text-[11px] font-black text-pink-400 tabular-nums shrink-0 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">x{count}</div>
    </div>
  );
}

function EmptyRewardState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 opacity-20 gap-4 w-full">
      <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
      </div>
      <p className="text-xs font-black uppercase tracking-[0.3em]">No items obtained</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ToonTrackerTab({
  isExpanded = false,
  initialSubView = 'main',
  category: propCategory
}: {
  isExpanded?: boolean;
  initialSubView?: 'main' | 'rewards_detail';
  category?: RewardCategory;
}) {
  const [toonTrackerData, setToonTrackerData] = useState<ToonTrackerData | null>(null);
  const [expandedSuitId, setExpandedSuitId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'idle' | 'connecting'>('idle');
  const [showSuccessGlow, setShowSuccessGlow] = useState(false);
  const [savedToons, setSavedToons] = useState<{ id: string; name: string; style: string; laff: number }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [subView, setSubView] = useState<'main' | 'rewards_detail'>(initialSubView);
  const [activeCategory, setActiveCategory] = useState<RewardCategory>(propCategory || 'sos');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tasks: true,
    suits: true,
    rewards: true
  });
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const lastResponseTime = useRef<number>(0);
  const toonDataRef = useRef<ToonTrackerData | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSubView(initialSubView), [initialSubView]);
  useEffect(() => { if (propCategory) setActiveCategory(propCategory); }, [propCategory]);
  useEffect(() => { toonDataRef.current = toonTrackerData; }, [toonTrackerData]);

  const toggleSection = (section: string) => {
    if (isExpanded) return;
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const addNotification = async (message: string) => {
    if (!toonDataRef.current?.data.toon.id) return;
    const toonId = toonDataRef.current.data.toon.id;
    const historyKey = getRewardHistoryKey(toonId);
    const history = await getSetting<RewardHistoryEntry[]>(historyKey) || [];
    const updated = pruneRewardHistory([{ message, timestamp: Date.now() }, ...history]);
    await setSetting(historyKey, updated);
    if (toonDataRef.current?.data.toon.id === toonId) setRewardHistory(updated);
  };

  const checkRewards = (prev: any, next: any) => {
    const changes: string[] = [];
    if (!prev || !next || JSON.stringify(prev) === JSON.stringify(next)) return changes;
    if (next.pinkslips > (prev.pinkslips || 0)) changes.push(`+${next.pinkslips - (prev.pinkslips || 0)} Pink Slips`);
    if (next.sos) {
      Object.entries(next.sos).forEach(([name, count]) => {
        const prevCount = prev.sos?.[name] || 0;
        if ((count as number) > prevCount) changes.push(`+${(count as number) - prevCount} ${name.replace(/\u0003/g, '')} SOS`);
      });
    }
    if (next.unites) {
      Object.entries(next.unites).forEach(([category, sub]) => {
        Object.entries(sub as any).forEach(([name, count]) => {
          const prevCount = prev.unites?.[category]?.[name] || 0;
          if ((count as number) > prevCount) changes.push(`+${(count as number) - prevCount} ${name.replace(/\u0003/g, '')} Unite`);
        });
      });
    }
    if (next.remotes) {
      Object.entries(next.remotes).forEach(([type, sub]) => {
        Object.entries(sub as any).forEach(([level, count]) => {
          const prevCount = prev.remotes?.[type]?.[level] || 0;
          if ((count as number) > prevCount) changes.push(`+${(count as number) - prevCount} ${level} Star ${type}`);
        });
      });
    }
    if (next.summons) {
      Object.entries(next.summons).forEach(([id, summon]: [string, any]) => {
        const prevSummon = prev.summons?.[id];
        const pName = summon.name.replace(/\u0003/g, '');
        if (summon.single && (!prevSummon || !prevSummon.single)) changes.push(`${pName} Summon (Cog)`);
        if (summon.building && (!prevSummon || !prevSummon.building)) changes.push(`${pName} Summon (Building)`);
        if (summon.invasion && (!prevSummon || !prevSummon.invasion)) changes.push(`${pName} Summon (Invasion)`);
      });
    }
    return changes;
  };

  const loadRewardHistory = async (toonId: string) => {
    const key = getRewardHistoryKey(toonId);
    const stored = await getSetting<RewardHistoryEntry[]>(key) || [];
    const pruned = pruneRewardHistory(stored);
    if (pruned.length !== stored.length) await setSetting(key, pruned);
    setRewardHistory(pruned);
  };

  const startSync = (providedKey?: string, silent = false, targetToonId?: string) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    if (!silent) setIsSyncing(true);
    setConnectionStatus('idle');
    const ports = ['1547', '1548', '1549', '1550', '1551', '1552', '1553', '1554'];
    let primaryFound = false;
    let portsAttempted = 0;
    const activeConnections: WebSocket[] = [];
    const cleanupOthers = (keepWs: WebSocket) => { activeConnections.forEach(ws => { if (ws !== keepWs) { ws.onclose = null; ws.close(); } }); };

    ports.forEach((port) => {
      const ws = new WebSocket(`ws://localhost:${port}/`);
      const timeoutId = setTimeout(() => { if (ws.readyState === WebSocket.CONNECTING) ws.close(); }, 1500);
      ws.onopen = () => {
        clearTimeout(timeoutId);
        activeConnections.push(ws);
        const authKey = providedKey || Math.random().toString(36).substring(2, 11);
        setSetting('tracker-auth-key', authKey).catch(console.error);
        ws.send(JSON.stringify({ authorization: authKey, name: "ToonHQ+" }));
        ws.send(JSON.stringify({ request: "all" }));
      };
      ws.onmessage = (event) => {
        lastResponseTime.current = Date.now();
        try {
          const msgData = JSON.parse(event.data);
          if (msgData.type === 'authorize') ws.send(JSON.stringify({ type: 'authorize', id: msgData.id }));
          if (msgData.event === 'all' && msgData.data?.toon) {
            const toonId = msgData.data.toon.id;
            const updatedToon = { id: toonId, name: msgData.data.toon.name, style: msgData.data.toon.style, laff: msgData.data.laff.max };
            setSavedToons(prev => {
              const existingIndex = prev.findIndex(t => t.id === toonId);
              let updated;
              if (existingIndex >= 0) {
                if (prev[existingIndex].laff === updatedToon.laff && prev[existingIndex].style === updatedToon.style) return prev;
                updated = [...prev]; updated[existingIndex] = updatedToon;
              } else { updated = [...prev, updatedToon]; }
              setSetting('tracker-toon-list', updated).catch(console.error);
              return updated;
            });
            const isTarget = targetToonId === toonId;
            const isFirstAny = !targetToonId && !primaryFound;
            const isCurrentPrimary = wsRef.current === ws && toonDataRef.current?.data.toon.id === toonId;
            if (isTarget || isFirstAny || isCurrentPrimary) {
              const previousRewards = toonDataRef.current?.data.rewards;
              const nextRewards = msgData.data.rewards;
              const rewardChanges = checkRewards(previousRewards, nextRewards);
              primaryFound = true; wsRef.current = ws; setToonTrackerData(msgData); setConnectionStatus('connected'); setIsSyncing(false); cleanupOthers(ws);
              setSetting(`tracker-data-${toonId}`, msgData).catch(console.error);
              setSetting('last-tracker-toon-id', toonId).catch(console.error);
              rewardChanges.forEach((msg) => addNotification(msg).catch(console.error));
              if (!(ws as any)._heartbeatStarted) {
                (ws as any)._heartbeatStarted = true;
                const intervalId = setInterval(() => {
                  if (ws.readyState === WebSocket.OPEN && (Date.now() - lastResponseTime.current < 25000)) { ws.send(JSON.stringify({ request: "all" })); }
                  else { clearInterval(intervalId); if (wsRef.current === ws) setConnectionStatus('disconnected'); ws.close(); }
                }, 15000);
                const originalOnClose = ws.onclose;
                ws.onclose = (e) => { clearInterval(intervalId); if (originalOnClose) originalOnClose.call(ws, e); if (wsRef.current === ws) { setConnectionStatus('disconnected'); wsRef.current = null; } };
              }
            } else { ws.onclose = null; ws.close(); }
          }
        } catch (e) { }
      };
      ws.onerror = () => { clearTimeout(timeoutId); ws.close(); };
      ws.onclose = () => {
        portsAttempted++;
        if (portsAttempted === ports.length && !primaryFound) {
          setIsSyncing(false);
          if (!silent && connectionStatus !== 'connected') alert('Could not find TTR client. Make sure the game is running and "Companion App Support" is enabled in your settings.');
        }
      };
    });
  };

  useEffect(() => {
    let lastId: string | undefined;
    getSetting<string>('last-tracker-toon-id').then(id => {
      lastId = id;
      if (id) getSetting<any>(`tracker-data-${id}`).then(data => { if (data) { setToonTrackerData(prev => prev || data); loadRewardHistory(id).catch(console.error); } });
    });
    getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list').then(list => { if (list) setSavedToons(list); });
    getSetting<string>('tracker-auth-key').then(key => { if (key) startSync(key, true, lastId); });
  }, []);

  useEffect(() => {
    const toonId = toonTrackerData?.data.toon.id;
    if (!toonId) { setRewardHistory([]); return; }
    loadRewardHistory(toonId).catch(console.error);
  }, [toonTrackerData?.data.toon.id]);

  const isDropdownOpenRef = useRef(false);
  useEffect(() => { isDropdownOpenRef.current = isDropdownOpen; }, [isDropdownOpen]);
  useEffect(() => {
    const handle = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!isDropdownOpenRef.current || !target.isConnected) return;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const disconnect = async () => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    setConnectionStatus('idle'); setIsSyncing(false); await setSetting('tracker-auth-key', null);
  };

  const selectToon = (id: string) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    getSetting<ToonTrackerData>(`tracker-data-${id}`).then(data => {
      if (data) {
        setToonTrackerData(data); setSetting('last-tracker-toon-id', id).catch(console.error);
        setConnectionStatus('idle'); setIsSyncing(false);
        getSetting<string>('tracker-auth-key').then(key => { if (key) startSync(key, true, id); });
      }
    });
    setIsDropdownOpen(false);
  };

  const weeklyRewardHistory = rewardHistory;
  const visibleRewardHistory = weeklyRewardHistory.slice(0, isExpanded ? 10 : RECENT_REWARD_LIMIT);

  const ToonHeader = () => (
    <div className={`py-2 flex items-center gap-3 relative ${isExpanded ? 'px-1' : 'px-3'}`} ref={dropdownRef}>
      <div className="flex-1 flex items-center min-w-0 gap-3 cursor-pointer group/header" onMouseDown={(e) => { e.stopPropagation(); if (savedToons.length > 0) setIsDropdownOpen(!isDropdownOpen); }}>
        {toonTrackerData ? (
          <>
            <div className="w-10 h-10 rounded-full border border-white/10 bg-emerald-500/5 overflow-hidden shrink-0 relative flex items-center justify-center">
              <img src={`https://rendition.toontownrewritten.com/render/${toonTrackerData.data.toon.style}/portrait/256x256.webp`} alt={toonTrackerData.data.toon.name} className="w-full h-full object-contain scale-[1.25]" />
              {savedToons.length > 1 && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className={`${isExpanded ? 'text-xl' : 'text-lg'} font-bold text-white truncate`}>{toonTrackerData.data.toon.name}</h3>
                {savedToons.length > 1 && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-white/20 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>}
              </div>
              <div className={`text-[9.5px] font-black uppercase tracking-widest truncate ${connectionStatus === 'connected' ? 'text-emerald-400' : connectionStatus === 'connecting' ? 'text-blue-400' : 'text-red-400/60'}`}>
                {isSyncing ? 'Syncing...' : connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Requesting...' : 'Disconnected'}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-[11.5px] font-black text-green-200/30 uppercase tracking-[0.2em]">Toon Tracker</h3>
            {savedToons.length > 0 && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/20"><polyline points="6 9 12 15 18 9" /></svg>}
          </div>
        )}
      </div>
      {isDropdownOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 mx-2 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl z-[150] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {savedToons.map((t) => (
              <div key={t.id} onMouseDown={(e) => { e.stopPropagation(); selectToon(t.id); }} className={`flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer transition-colors group/item ${toonTrackerData?.data.toon.id === t.id ? 'bg-emerald-500/10' : ''}`}>
                <div className="w-8 h-8 rounded-full border border-white/5 bg-black/20 overflow-hidden shrink-0 flex items-center justify-center">
                  <img src={`https://rendition.toontownrewritten.com/render/${t.style}/portrait/256x256.webp`} alt={t.name} className="w-full h-full object-contain scale-[1.3]" />
                </div>
                <span className={`flex-1 text-[11.5px] font-bold truncate ${toonTrackerData?.data.toon.id === t.id ? 'text-emerald-400' : 'text-white/80'}`}>{t.name} <span className="text-[10px] opacity-40 font-black ml-1">({t.laff})</span></span>
                <button onMouseDown={(e) => { e.stopPropagation(); removeSavedToon(e as any, t.id); }} className="p-1.5 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all text-white/40 pointer-events-auto">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => { if (connectionStatus === 'connected' || connectionStatus === 'connecting') disconnect(); else getSetting<string>('tracker-auth-key').then(key => startSync(key || undefined)); }} disabled={isSyncing} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer border border-white/10 shrink-0 ${isSyncing ? 'bg-emerald-900 opacity-50' : connectionStatus === 'connected' ? 'bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : connectionStatus === 'connecting' ? 'bg-blue-600' : 'bg-emerald-600 hover:bg-emerald-500 shadow-md'}`}>
        {isSyncing ? <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          : connectionStatus === 'connecting' ? <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            : connectionStatus === 'connected' ? <div className="relative flex items-center justify-center">{showSuccessGlow && <div className="absolute w-full h-full rounded-full bg-white/40 animate-ping scale-150" />}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white relative z-10"><polyline points="20 6 9 17 4 12" /></svg></div>
              : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.3" /></svg>}
      </button>
    </div>
  );

  if (subView === 'rewards_detail' && toonTrackerData) {
    const rewards = toonTrackerData.data.rewards;
    const totals = {
      sos: Object.values(rewards.sos || {}).reduce((a: number, b) => a + (b as number), 0),
      unites: Object.values(rewards.unites || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
      remotes: Object.values(rewards.remotes || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
      summons: Object.values(rewards.summons || {}).reduce((a: number, b: any) => a + (b.single ? 1 : 0) + (b.building ? 1 : 0) + (b.invasion ? 1 : 0), 0),
    };

    return (
      <section className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300 h-full">
        <ToonHeader />
        <div className="flex-1 flex gap-6 overflow-hidden pr-2 pt-2 pb-4">
          <div className="w-64 flex flex-col gap-4 shrink-0 overflow-hidden">
            <div className="flex flex-col gap-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 px-2 py-1">Categories</h3>
              <div className="space-y-1">
                {REWARD_CATEGORIES.map((cat) => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activeCategory === cat.id ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-white/60 hover:bg-white/5 border border-transparent'}`}>
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${activeCategory === cat.id ? 'bg-emerald-500/20' : 'bg-black/20'}`}>
                      <img src={getExtensionImageUrl(`images/${cat.img}`)} className={`w-5 h-5 object-contain ${activeCategory === cat.id ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
                    </div>
                    <span className="font-bold text-sm">{cat.label}</span>
                    <div className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-black transition-colors ${activeCategory === cat.id ? 'bg-emerald-400 text-emerald-900' : 'bg-white/10 text-white/40 group-hover:text-white/60'}`}>{totals[cat.id as keyof typeof totals]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950/30 rounded-xl border border-sky-200/10 overflow-hidden">
              <div className="px-3 py-2 bg-white/[0.04] border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>
                {rewardHistory.length > 0 && <div className="text-[10px] text-white/30">{`${rewardHistory.length} items`}</div>}
              </div>
              {rewardHistory.length > 0 ? (
                <div className="flex-1 divide-y divide-white/5 overflow-y-auto custom-scrollbar">
                  {rewardHistory.map((entry, i) => (
                    <div key={`${entry.timestamp}-${i}`} className={`relative overflow-hidden px-3 py-2.5 flex justify-between items-start gap-4 transition-colors ${isRecentlyEarned(entry.timestamp) ? 'tracker-reward-recent' : 'hover:bg-white/[0.02]'}`}>
                      <span className="relative z-[1] font-bold text-emerald-300/90 leading-tight text-[11px]">{entry.message}</span>
                      <span className="relative z-[1] text-[9px] font-black text-white/30 tabular-nums shrink-0 uppercase text-right" title={new Date(entry.timestamp).toLocaleString()}><RelativeRewardTime timestamp={entry.timestamp} /></span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center px-3 py-5 text-center text-[10px] font-black uppercase tracking-[0.24em] text-white/25">Nothing obtained yet</div>
              )}
            </div>
          </div>
          <div className="flex-1 bg-black/20 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">{REWARD_CATEGORIES.find(c => c.id === activeCategory)?.label}</h3>
              {initialSubView === 'main' && <button onClick={() => setSubView('main')} className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 transition-colors border border-white/5">Back to Dashboard</button>}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {activeCategory === 'sos' && <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{Object.entries(rewards.sos || {}).length > 0 ? Object.entries(rewards.sos || {}).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([name, count]) => <RewardCard key={name} name={name.replace(/\u0003/g, '')} count={count as number} color="blue" img="sos.png" />) : <EmptyRewardState />}</div>}
              {activeCategory === 'unites' && (
                <div className="flex gap-4 overflow-x-auto pb-4 h-full custom-scrollbar">
                  {Object.entries(rewards.unites || {}).length > 0 ? (
                    Object.entries(rewards.unites || {}).map(([category, types]) => {
                      const sortedTypes = Object.entries(types as any).sort(([nameA], [nameB]) => {
                        const cleanA = nameA.replace(/\u0003/g, '');
                        const cleanB = nameB.replace(/\u0003/g, '');

                        if (category === 'Laff Restored') {
                          const valA = parseInt(cleanA) || 0;
                          const valB = parseInt(cleanB) || 0;
                          return valB - valA;
                        }

                        if (category === 'Gags Restored') {
                          const order = ['All', 'Sound', 'Throw', 'Squirt', 'Lure', 'Trap', 'Drop'];
                          const indexA = order.findIndex(o => cleanA.startsWith(o));
                          const indexB = order.findIndex(o => cleanB.startsWith(o));
                          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                          if (indexA !== -1) return -1;
                          if (indexB !== -1) return 1;
                        }

                        if (category === 'Jellybeans') {
                          const valA = parseInt(cleanA) || 0;
                          const valB = parseInt(cleanB) || 0;
                          return valB - valA;
                        }

                        return cleanA.localeCompare(cleanB);
                      });

                      return (
                        <div key={category} className="flex-1 min-w-[190px] flex flex-col gap-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-400/60 border-b border-pink-500/10 pb-1.5 shrink-0">{category}</h4>
                          <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
                            {sortedTypes.map(([name, count]) => (
                              <UniteListItem key={name} name={name.replace(/\u0003/g, '')} count={count as number} />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyRewardState />
                  )}
                </div>
              )}
              {activeCategory === 'remotes' && <div className="space-y-8">{Object.entries(rewards.remotes || {}).length > 0 ? Object.entries(rewards.remotes || {}).map(([type, levels]) => <div key={type} className="space-y-4"><h4 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400/60 border-b border-emerald-500/10 pb-2">{type}</h4><div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{Object.entries(levels as any).map(([level, count]) => <RewardCard key={level} name={`${level} Star`} count={count as number} color="emerald" img="remotes.png" />)}</div></div>) : <EmptyRewardState />}</div>}
              {activeCategory === 'summons' && <SummonsTableView summons={rewards.summons || {}} />}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      <ToonHeader />
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2 pr-2">
        {toonTrackerData ? (
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
                      const rewards = toonTrackerData.data.rewards;
                      const totals = {
                        pinkslips: rewards.pinkslips || 0,
                        sos: Object.values(rewards.sos || {}).reduce((a: number, b) => a + (b as number), 0),
                        unites: Object.values(rewards.unites || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
                        remotes: Object.values(rewards.remotes || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
                        summons: Object.values(rewards.summons || {}).reduce((a: number, b: any) => a + (b.single ? 1 : 0) + (b.building ? 1 : 0) + (b.invasion ? 1 : 0), 0),
                      };
                      const types = [{ id: 'sos', img: 'sos.png', count: totals.sos, color: 'blue' }, { id: 'unites', img: 'unites.png', count: totals.unites, color: 'pink' }, { id: 'remotes', img: 'remotes.png', count: totals.remotes, color: 'emerald' }, { id: 'pinkslips', img: 'pinkslips.png', count: totals.pinkslips, color: 'orange' }, { id: 'summons', img: 'summons.png', count: totals.summons, color: 'purple' }];
                      return types.map(rt => (
                        <div key={rt.id} className="relative group/reward flex flex-col items-center gap-1">
                          <div className={`${isExpanded ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-black/40 border border-white/10 p-1.5 flex items-center justify-center relative transition-all group-hover/reward:scale-110 group-hover/reward:border-white/30 group-hover/reward:bg-black/60 shadow-lg`}>
                            <img src={getExtensionImageUrl(`images/${rt.img}`)} alt={rt.id} className="w-full h-full object-contain filter drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]" />
                            {rt.count > 0 && <div className={`${isExpanded ? 'min-w-[20px] h-[20px] text-[11px]' : 'min-w-[18px] h-[18px] text-[10px]'} absolute -top-1 -right-1 px-1 rounded-full flex items-center justify-center font-black text-white border border-white/20 shadow-xl z-10 ${rt.color === 'blue' ? 'bg-blue-600' : rt.color === 'pink' ? 'bg-pink-600' : rt.color === 'emerald' ? 'bg-emerald-600' : rt.color === 'orange' ? 'bg-orange-600' : 'bg-purple-600'}`}>{rt.count}</div>}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
                {expandedSections.rewards && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="bg-slate-950/30 rounded-lg border border-sky-200/10 overflow-hidden">
                      <div className="px-3 py-2 bg-white/[0.04] border-b border-white/5 flex items-center justify-between gap-3"><div className="text-[9px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>{rewardHistory.length > 0 && <div className="text-[10px] text-white/30">{`${visibleRewardHistory.length} most recent`}</div>}</div>
                      {visibleRewardHistory.length > 0 ? (
                        <div className={`divide-y divide-white/5 overflow-y-auto custom-scrollbar ${isExpanded ? 'max-h-[calc(100vh-350px)]' : 'max-h-56'}`}>
                          {visibleRewardHistory.map((entry, i) => (
                            <div key={`${entry.timestamp}-${i}`} className={`relative overflow-hidden px-3 py-2.5 flex justify-between items-start gap-4 transition-colors ${isRecentlyEarned(entry.timestamp) ? 'tracker-reward-recent' : 'hover:bg-white/[0.02]'}`}>
                              <span className={`relative z-[1] font-bold text-emerald-300/90 leading-tight text-[11px]`}>{entry.message}</span>
                              <span className="relative z-[1] text-[9px] font-black text-white/30 tabular-nums shrink-0 uppercase text-right" title={new Date(entry.timestamp).toLocaleString()}><RelativeRewardTime timestamp={entry.timestamp} /></span>
                            </div>
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
                        <div key={id} className={`relative rounded-lg border flex flex-col transition-all hover:brightness-110 shadow-md group/suit ${isMaxed ? 'p-3 gap-0' : 'p-4 gap-3'}`} style={{ backgroundColor: colors.bg, borderColor: `${colors.border}60` }}>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[11.5px] font-bold text-white uppercase tracking-widest truncate">{suit.department}</span>
                            <div className="flex items-center shrink-0">
                              {isMaxed ? <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-black/20" style={{ color: colors.accent, borderColor: `${colors.border}40` }}>Maxed</div>
                                : <div className="flex items-center h-5 px-2 rounded border bg-black/20 shadow-sm" style={{ color: colors.text, borderColor: `${colors.border}40` }}>
                                  <span className="text-[11.5px] font-bold italic whitespace-nowrap opacity-70">{(suit.suit?.name || 'No Disguise').replace(/\u0003/g, '')}{suit.version === 2 ? ' V2.0' : ''}</span>
                                  <div className="w-[1px] h-3 bg-white/20 mx-1.5" /><span className="text-[11.5px] font-black whitespace-nowrap">Lv. {suit.level}</span>
                                </div>}
                            </div>
                          </div>
                          {!isMaxed && (
                            <div className="flex-1 min-w-0">
                              {isReady ? <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-1.5 rounded border text-center shadow-sm" style={{ color: '#ffffff', backgroundColor: colors.border, borderColor: colors.border }}>Ready for promotion</div>
                                : suit.promotion ? (
                                  <div className="relative h-6 w-full bg-black/30 rounded border overflow-hidden flex items-center justify-center p-[1px]" style={{ borderColor: `${colors.border}40` }}>
                                    <div className="absolute inset-y-0 left-0 transition-all duration-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ width: `${Math.min(100, progress)}%`, backgroundColor: `${colors.border}80` }} />
                                    <span className="relative z-10 text-[10.5px] font-black uppercase tracking-widest text-center leading-none" style={{ color: colors.text }}>{remaining.toLocaleString()} {statName} remaining</span>
                                  </div>
                                ) : null}
                            </div>
                          )}
                          {!isMaxed && suit.promotion && remaining > 0 && (
                            <div className="pt-1 mt-1 border-t border-white/10">
                              <button onClick={(e) => { e.stopPropagation(); setExpandedSuitId(expandedSuitId === id ? null : id); }} className="w-full py-1.5 flex items-center justify-center gap-2 rounded hover:bg-black/10 transition-colors group">
                                <span className="text-[9.5px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: colors.text }}>{expandedSuitId === id ? 'Hide Recommendations' : 'Show Recommendations'}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${expandedSuitId === id ? 'rotate-180' : ''}`} style={{ color: colors.accent }}><polyline points="6 9 12 15 18 9" /></svg>
                              </button>
                              {expandedSuitId === id && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-2 space-y-1.5 pb-1">
                                  {(() => {
                                    const facilities: any = {
                                      sell: { items: [{ name: 'Long Steel', val: 1630 }, { name: 'Short Steel, +5 Battles', val: 1503 }, { name: 'Short Steel, +4 Battles', val: 1376 }, { name: 'Short Steel, +3 Battles', val: 1249 }, { name: 'Short Steel, +2 Battles', val: 1121 }, { name: 'Short Steel, +1 Battle', val: 994 }, { name: 'Short Steel', val: 867 }, { name: 'Long Scrap', val: 638 }, { name: 'Short Scrap, +5 Battles', val: 590 }, { name: 'Short Scrap, +4 Battles', val: 542 }, { name: 'Short Scrap, +3 Battles', val: 494 }, { name: 'Short Scrap, +2 Battles', val: 446 }, { name: 'Short Scrap, +1 Battle', val: 398 }, { name: 'Short Scrap', val: 350 }] },
                                      cash: { items: [{ name: 'Bullion Mint', val: 1850 }, { name: 'Bullion Mint, 1 Skip', val: 1738 }, { name: 'Bullion Mint, 2 Skips', val: 1626 }, { name: 'Coin Mint', val: 807 }, { name: 'Coin Mint, 1 Skip', val: 755 }, { name: 'Coin Mint, 2 Skips', val: 702 }] },
                                      law: { items: [{ name: 'Senior Wing', val: 2082 }, { name: 'Senior Wing, 1 Skip', val: 1968 }, { name: 'Senior Wing, 2 Skips', val: 1854 }, { name: 'Junior Wing', val: 889 }, { name: 'Junior Wing, 1 Skip', val: 835 }, { name: 'Junior Wing, 2 Skips', val: 781 }] },
                                      boss: { items: [{ name: 'Final Fringe', val: 2305 }, { name: 'Final Fringe, 1 Skip', val: 2201 }, { name: 'Final Fringe, 2 Skips', val: 2097 }, { name: 'First Fairway', val: 975 }, { name: 'First Fairway, 1 Skip', val: 929 }, { name: 'First Fairway, 2 Skips', val: 882 }] }
                                    };
                                    const items = facilities[dept].items;
                                    const highest = items[0]; const lowest = items[items.length - 1];
                                    let highestCount = Math.floor(remaining / highest.val); let rem = remaining - (highestCount * highest.val); let lowestCount = rem > 0 ? Math.ceil(rem / lowest.val) : 0;
                                    const rows = []; for (let c = 0; c < highestCount; c++) rows.push(highest); for (let c = 0; c < lowestCount; c++) rows.push(lowest);
                                    const total = (highestCount * highest.val) + (lowestCount * lowest.val);
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
                        <div key={i} className="p-4 bg-[#fcf8ef] rounded-lg border border-[#5c4a33]/30 flex flex-col gap-3 transition-all hover:bg-white shadow-md">
                          <div className="space-y-0.5">
                            <div className="text-sm font-black text-[#4a3728] leading-tight select-all">{task.objective.text}</div>
                            {task.objective.where && <div className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#5c4a33]/60"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg><span className="text-[9.5px] font-black text-[#5c4a33]/60 uppercase tracking-widest">{task.objective.where}</span></div>}
                          </div>
                          <div className="space-y-1 pt-1">
                            <div className="h-2 w-full bg-[#5c4a33]/10 rounded-full overflow-hidden border border-[#5c4a33]/5 p-[1px]"><div className="h-full bg-emerald-600 rounded-full transition-all duration-700 shadow-[0_0_5px_rgba(16,185,129,0.3)]" style={{ width: `${Math.min(100, progress)}%` }} /></div>
                            <div className="text-right text-[11.5px] font-black uppercase tracking-[0.1em] text-emerald-700">{task.objective.progress.text}</div>
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
          <div className="h-full flex flex-col items-center justify-center opacity-20 py-12">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400/50 mb-4 animate-pulse"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <p className="text-[11.5px] font-black text-green-200 uppercase tracking-[0.3em] text-center px-4 leading-relaxed">Connect to your toon<br />to see stats</p>
          </div>
        )}
      </div>
    </section>
  );
}
