import React, { useState, useEffect, useRef } from 'react';
import { getSetting, setSetting } from './db';
import type { ToonTrackerData } from './tracker';
import { browser } from 'wxt/browser';

type RewardHistoryEntry = {
  message: string;
  timestamp: number;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_REWARD_LIMIT = 5;

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

    const update = () => {
      setDisplay(formatRelativeTime(timestamp));
    };

    update();
    const intervalId = window.setInterval(update, 30000);
    return () => window.clearInterval(intervalId);
  }, [timestamp]);

  return <span>{display}</span>;
}

export function ToonTrackerTab() {
  const [toonTrackerData, setToonTrackerData] = useState<ToonTrackerData | null>(null);
  const [expandedSuitId, setExpandedSuitId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'idle' | 'connecting'>('idle');
  const [showSuccessGlow, setShowSuccessGlow] = useState(false);
  const [savedToons, setSavedToons] = useState<{ id: string; name: string; style: string; laff: number }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tasks: true,
    suits: true,
    rewards: true
  });
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryEntry[]>([]);
  const [showAllRewardHistory, setShowAllRewardHistory] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastResponseTime = useRef<number>(0);
  const toonDataRef = useRef<ToonTrackerData | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    toonDataRef.current = toonTrackerData;
  }, [toonTrackerData]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const addNotification = async (message: string) => {
    if (!toonDataRef.current?.data.toon.id) return;
    const toonId = toonDataRef.current.data.toon.id;
    const historyKey = getRewardHistoryKey(toonId);

    const history = await getSetting<RewardHistoryEntry[]>(historyKey) || [];
    const updated = pruneRewardHistory([{ message, timestamp: Date.now() }, ...history]);
    await setSetting(historyKey, updated);

    if (toonDataRef.current?.data.toon.id === toonId) {
      setRewardHistory(updated);
    }
  };

  const checkRewards = (prev: any, next: any) => {
    const changes: string[] = [];
    if (!prev || !next) return changes;

    // Pink Slips
    if (next.pinkslips > (prev.pinkslips || 0)) {
      changes.push(`+${next.pinkslips - (prev.pinkslips || 0)} Pink Slips!`);
    }

    // SOS
    if (next.sos) {
      Object.entries(next.sos).forEach(([name, count]) => {
        const prevCount = prev.sos?.[name] || 0;
        if ((count as number) > prevCount) {
          const cleanName = name.replace(/\u0003/g, '');
          changes.push(`+${(count as number) - prevCount} ${cleanName} SOS!`);
        }
      });
    }

    // Unites
    if (next.unites) {
      Object.entries(next.unites).forEach(([category, sub]) => {
        Object.entries(sub as any).forEach(([name, count]) => {
          const prevCount = prev.unites?.[category]?.[name] || 0;
          if ((count as number) > prevCount) {
            const cleanName = name.replace(/\u0003/g, '');
            changes.push(`+${(count as number) - prevCount} ${cleanName} Unite!`);
          }
        });
      });
    }

    // Remotes
    if (next.remotes) {
      Object.entries(next.remotes).forEach(([type, sub]) => {
        Object.entries(sub as any).forEach(([level, count]) => {
          const prevCount = prev.remotes?.[type]?.[level] || 0;
          if ((count as number) > prevCount) {
            changes.push(`+${(count as number) - prevCount} ${type} (Lvl ${level})!`);
          }
        });
      });
    }

    // Summons
    if (next.summons) {
      Object.entries(next.summons).forEach(([id, summon]: [string, any]) => {
        const prevSummon = prev.summons?.[id];
        const pName = summon.name.replace(/\u0003/g, ''); // Clean control characters
        if (summon.single && (!prevSummon || !prevSummon.single)) {
          changes.push(`New Summon: ${pName} (Single)!`);
        }
        if (summon.building && (!prevSummon || !prevSummon.building)) {
          changes.push(`New Summon: ${pName} (Building)!`);
        }
        if (summon.invasion && (!prevSummon || !prevSummon.invasion)) {
          changes.push(`New Summon: ${pName} (Invasion)!`);
        }
      });
    }

    return changes;
  };

  const loadRewardHistory = async (toonId: string) => {
    const historyKey = getRewardHistoryKey(toonId);
    const storedHistory = await getSetting<RewardHistoryEntry[]>(historyKey) || [];
    const prunedHistory = pruneRewardHistory(storedHistory);

    if (prunedHistory.length !== storedHistory.length) {
      await setSetting(historyKey, prunedHistory);
    }

    setRewardHistory(prunedHistory);
    setShowAllRewardHistory(false);
  };

  const startSync = (providedKey?: string, silent = false, targetToonId?: string) => {
    console.log(`[ToonTracker] Starting sync. Target: ${targetToonId || 'Any'}, Silent: ${silent}`);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!silent) setIsSyncing(true);
    setConnectionStatus('idle');

    const ports = ['1547', '1548', '1549', '1550', '1551', '1552', '1553', '1554'];
    let primaryFound = false;
    let portsAttempted = 0;
    const activeConnections: WebSocket[] = [];

    const cleanupOthers = (keepWs: WebSocket) => {
      activeConnections.forEach(ws => {
        if (ws !== keepWs) {
          ws.onclose = null;
          ws.close();
        }
      });
    };

    ports.forEach((port) => {
      const ws = new WebSocket(`ws://localhost:${port}/`);

      const timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, 1500);

      ws.onopen = () => {
        clearTimeout(timeoutId);
        console.log(`[ToonTracker] Port ${port} opened`);
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
          if (msgData.type === 'authorize') {
            ws.send(JSON.stringify({ type: 'authorize', id: msgData.id }));
          }

          if (msgData.event === 'all' && msgData.data?.toon) {
            const toonId = msgData.data.toon.id;
            console.log(`[ToonTracker] Received data from port ${port} for toon:`, msgData.data.toon.name);

            // 1. Always update the saved list for any toon we find
            const updatedToon = {
              id: toonId,
              name: msgData.data.toon.name,
              style: msgData.data.toon.style,
              laff: msgData.data.laff.max
            };

            setSavedToons(prev => {
              const existingIndex = prev.findIndex(t => t.id === toonId);
              let updated;
              if (existingIndex >= 0) {
                // Update existing toon info
                if (prev[existingIndex].laff === updatedToon.laff && prev[existingIndex].style === updatedToon.style) {
                  return prev; // No change
                }
                updated = [...prev];
                updated[existingIndex] = updatedToon;
                console.log(`[ToonTracker] Updated existing toon in list: ${updatedToon.name}`);
              } else {
                // Add new toon
                updated = [...prev, updatedToon];
                console.log(`[ToonTracker] Added new toon to list: ${updatedToon.name}`);
              }
              setSetting('tracker-toon-list', updated).catch(console.error);
              return updated;
            });

            // 2. Decide if this connection should be our primary "tracked" one
            const isTarget = targetToonId === toonId;
            const isFirstAny = !targetToonId && !primaryFound;

            const isCurrentPrimary = wsRef.current === ws && toonDataRef.current?.data.toon.id === toonId;

            if (isTarget || isFirstAny || isCurrentPrimary) {
              console.log(`[ToonTracker] Port ${port} matches criteria, promoting to primary connection`);
              const previousRewards = toonDataRef.current?.data.rewards;
              const nextRewards = msgData.data.rewards;
              const rewardChanges = checkRewards(previousRewards, nextRewards);

              primaryFound = true;
              wsRef.current = ws;
              setToonTrackerData(msgData);
              setConnectionStatus('connected');
              setIsSyncing(false);
              cleanupOthers(ws);

              // Persist as last used
              setSetting(`tracker-data-${toonId}`, msgData).catch(console.error);
              setSetting('last-tracker-toon-id', toonId).catch(console.error);
              rewardChanges.forEach((message) => {
                addNotification(message).catch(console.error);
              });

              // Setup heartbeat for this primary connection IF NOT ALREADY STARTED
              if (!(ws as any)._heartbeatStarted) {
                (ws as any)._heartbeatStarted = true;
                const intervalId = setInterval(() => {
                  if (ws.readyState === WebSocket.OPEN && (Date.now() - lastResponseTime.current < 25000)) {
                    ws.send(JSON.stringify({ request: "all" }));
                  } else {
                    clearInterval(intervalId);
                    if (wsRef.current === ws) setConnectionStatus('disconnected');
                    ws.close();
                  }
                }, 15000);

                const originalOnClose = ws.onclose;
                ws.onclose = (e) => {
                  clearInterval(intervalId);
                  if (originalOnClose) originalOnClose.call(ws, e);
                  if (wsRef.current === ws) {
                    setConnectionStatus('disconnected');
                    wsRef.current = null;
                  }
                };
              }
            } else {
              // Not our primary toon, we got the data for the list, so we can close this
              console.log(`[ToonTracker] Port ${port} is a secondary toon, closing connection`);
              ws.onclose = null;
              ws.close();
            }
          }
        } catch (e) { }
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        ws.close();
      };

      ws.onclose = () => {
        portsAttempted++;
        if (portsAttempted === ports.length && !primaryFound) {
          setIsSyncing(false);
          if (!silent && connectionStatus !== 'connected') {
            alert('Could not find TTR client. Make sure the game is running and "Companion App Support" is enabled in your settings.');
          }
        }
      };
    });
  };

  // Restore last tracker state and attempt auto-reconnect
  useEffect(() => {
    let lastId: string | undefined;
    getSetting<string>('last-tracker-toon-id').then(id => {
      lastId = id;
      if (id) {
        getSetting<any>(`tracker-data-${id}`).then(data => {
          if (data) {
            setToonTrackerData(prev => prev || data);
            loadRewardHistory(id).catch(console.error);
          }
        });
      }
    });

    getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list').then(list => {
      if (list) setSavedToons(list);
    });

    getSetting<string>('tracker-auth-key').then(key => {
      if (key) {
        // Attempt silent reconnect on load if we have a key
        startSync(key, true, lastId);
      }
    });
  }, []);

  useEffect(() => {
    const toonId = toonTrackerData?.data.toon.id;
    if (!toonId) {
      setRewardHistory([]);
      setShowAllRewardHistory(false);
      return;
    }

    loadRewardHistory(toonId).catch(console.error);
  }, [toonTrackerData?.data.toon.id]);

  const isDropdownOpenRef = useRef(false);
  useEffect(() => {
    isDropdownOpenRef.current = isDropdownOpen;
  }, [isDropdownOpen]);

  // Handle outside click for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!isDropdownOpenRef.current) return;

      // If the target is no longer in the document, it was likely removed by a React render
      // (e.g. clicking the X button). We should ignore these clicks for "outside" checks.
      if (!target.isConnected) {
        console.log('[ToonTracker] Click on detached element, ignoring outside check');
        return;
      }

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        console.log('[ToonTracker] Clicked outside, closing dropdown. Target:', target);
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const removeSavedToon = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    console.log('[ToonTracker] X button clicked for ID:', id);

    // If this is the active toon, disconnect first
    if (toonTrackerData?.data.toon.id === id) {
      console.log('[ToonTracker] Removing active toon, disconnecting first...');
      await disconnect();
      setToonTrackerData(null);
    }

    console.log('[ToonTracker] Updating savedToons list...');
    const updated = savedToons.filter(t => t.id !== id);
    setSavedToons(updated);
    await setSetting('tracker-toon-list', updated);

    console.log('[ToonTracker] Clearing cached data for ID:', id);
    await setSetting(`tracker-data-${id}`, null);

    const lastId = await getSetting('last-tracker-toon-id');
    if (lastId === id) {
      console.log('[ToonTracker] Clearing last-tracker-toon-id...');
      await setSetting('last-tracker-toon-id', null);
    }
    console.log('[ToonTracker] Removal complete for ID:', id);
  };

  const disconnect = async () => {
    console.log('Disconnecting...');
    if (wsRef.current) {
      // Prevent the onclose handler from firing
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('idle');
    setIsSyncing(false);
    setShowAllRewardHistory(false);
    await setSetting('tracker-auth-key', null);
  };

  const selectToon = (id: string) => {
    console.log('Selecting toon:', id);

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    getSetting<ToonTrackerData>(`tracker-data-${id}`).then(data => {
      if (data) {
        console.log('Loaded cached data for:', data.data.toon.name);
        setToonTrackerData(data);
        setSetting('last-tracker-toon-id', id).catch(console.error);
        setConnectionStatus('idle');
        setIsSyncing(false);

        // Attempt to connect to this specifically
        getSetting<string>('tracker-auth-key').then(key => {
          if (key) {
            console.log('Attempting auto-reconnect for selected toon');
            startSync(key, true, id);
          }
        });
      } else {
        console.warn('No cached data found for toon ID:', id);
      }
    });
    setIsDropdownOpen(false);
  };

  // Success glow effect for connection
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setShowSuccessGlow(true);
      const timer = setTimeout(() => setShowSuccessGlow(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus]);

  // Cleanup websocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const weeklyRewardHistory = rewardHistory;
  const visibleRewardHistory = showAllRewardHistory
    ? weeklyRewardHistory
    : weeklyRewardHistory.slice(0, RECENT_REWARD_LIMIT);

  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      {/* Header with Toon Info and Sync Button */}
      <div className="px-3 py-2 flex items-center gap-3 relative" ref={dropdownRef}>
        <div
          className="flex-1 flex items-center min-w-0 gap-3 cursor-pointer group/header"
          onMouseDown={(e) => {
            e.stopPropagation();
            console.log('[ToonTracker] Header clicked, toggling dropdown. Current state:', isDropdownOpen);
            if (savedToons.length > 0) {
              setIsDropdownOpen(!isDropdownOpen);
            }
          }}
        >
          {toonTrackerData ? (
            <>
              <div className="w-10 h-10 rounded-full border border-white/10 bg-emerald-500/5 overflow-hidden shrink-0 relative flex items-center justify-center">
                <img
                  src={`https://rendition.toontownrewritten.com/render/${toonTrackerData.data.toon.style}/portrait/256x256.webp`}
                  alt={toonTrackerData.data.toon.name}
                  className="w-full h-full object-contain scale-[1.25]"
                />
                {savedToons.length > 1 && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">
                    {toonTrackerData.data.toon.name}
                  </h3>
                  {savedToons.length > 1 && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-white/20 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
                  )}
                </div>
                <div className={`text-[9.5px] font-black uppercase tracking-widest truncate ${connectionStatus === 'connected' ? 'text-emerald-400' : connectionStatus === 'connecting' ? 'text-blue-400' : 'text-red-400/60'}`}>
                  {isSyncing ? 'Syncing...' : connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Requesting...' : 'Disconnected'}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-[11.5px] font-black text-green-200/30 uppercase tracking-[0.2em]">Toon Tracker</h3>
              {savedToons.length > 0 && (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/20"><polyline points="6 9 12 15 18 9" /></svg>
              )}
            </div>
          )}
        </div>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 mx-2 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl z-[150] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
              {savedToons.map((toon) => (
                <div
                  key={toon.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    console.log('[ToonTracker] Toon item mousedown:', toon.name, toon.id);
                    selectToon(toon.id);
                  }}
                  className={`flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer transition-colors group/item ${toonTrackerData?.data.toon.id === toon.id ? 'bg-emerald-500/10' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full border border-white/5 bg-black/20 overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={`https://rendition.toontownrewritten.com/render/${toon.style}/portrait/256x256.webp`}
                      alt={toon.name}
                      className="w-full h-full object-contain scale-[1.3]"
                    />
                  </div>
                  <span className={`flex-1 text-[11.5px] font-bold truncate ${toonTrackerData?.data.toon.id === toon.id ? 'text-emerald-400' : 'text-white/80'}`}>
                    {toon.name} <span className="text-[10px] opacity-40 font-black ml-1">({toon.laff})</span>
                  </span>
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      console.log('[ToonTracker] X button mousedown for ID:', toon.id);
                      removeSavedToon(e as any, toon.id);
                    }}
                    className="p-1.5 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all text-white/40 pointer-events-auto"
                    title="Remove from history"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
              disconnect();
            } else {
              getSetting<string>('tracker-auth-key').then(key => {
                startSync(key || undefined);
              });
            }
          }}
          disabled={isSyncing}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer border border-white/10 shrink-0 ${isSyncing ? 'bg-emerald-900 opacity-50' :
            connectionStatus === 'connected' ? 'bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)]' :
              connectionStatus === 'connecting' ? 'bg-blue-600' :
                'bg-emerald-600 hover:bg-emerald-500 shadow-md'
            }`}
          title={isSyncing ? 'Searching...' : connectionStatus === 'connected' ? 'Disconnect' : connectionStatus === 'connecting' ? 'Cancel' : 'Sync Tracker'}
        >
          {isSyncing ? (
            <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ) : connectionStatus === 'connecting' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : connectionStatus === 'connected' ? (
            <div className="relative flex items-center justify-center">
              {showSuccessGlow && <div className="absolute w-full h-full rounded-full bg-white/40 animate-ping scale-150" />}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white relative z-10"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.3" /></svg>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {toonTrackerData ? (
          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Rewards Section */}
            <div className="space-y-2 rounded-xl border border-sky-300/10 bg-[linear-gradient(180deg,rgba(8,47,73,0.4),rgba(3,7,18,0.55))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                onClick={() => toggleSection('rewards')}
                className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer"
              >
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">Rewards</h4>
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-300 ${expandedSections.rewards ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </button>

              {expandedSections.rewards && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  {toonTrackerData.data.rewards && (
                    <div className="flex justify-between items-center px-2 py-3 ">
                      {(() => {
                        const rewards = toonTrackerData.data.rewards;
                        const totals = {
                          pinkslips: rewards.pinkslips || 0,
                          sos: Object.values(rewards.sos || {}).reduce((a: number, b) => a + (b as number), 0),
                          unites: Object.values(rewards.unites || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
                          remotes: Object.values(rewards.remotes || {}).reduce((a: number, b) => a + Object.values(b as Record<string, number>).reduce((c: number, d) => c + (d as number), 0), 0),
                          summons: Object.values(rewards.summons || {}).reduce((a: number, b: any) => a + (b.single ? 1 : 0) + (b.building ? 1 : 0) + (b.invasion ? 1 : 0), 0),
                        };

                        const rewardTypes = [
                          { id: 'sos', img: 'sos.png', count: totals.sos, color: 'blue' },
                          { id: 'unites', img: 'unites.png', count: totals.unites, color: 'pink' },
                          { id: 'remotes', img: 'remotes.png', count: totals.remotes, color: 'emerald' },
                          { id: 'pinkslips', img: 'pinkslips.png', count: totals.pinkslips, color: 'orange' },
                          { id: 'summons', img: 'summons.png', count: totals.summons, color: 'purple' },
                        ];

                        return rewardTypes.map(rt => (
                          <div key={rt.id} className="relative group/reward flex flex-col items-center gap-1">
                            <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 p-1.5 flex items-center justify-center relative transition-all group-hover/reward:scale-110 group-hover/reward:border-white/30 group-hover/reward:bg-black/60 shadow-lg">
                              <img
                                src={getExtensionImageUrl(`images/${rt.img}`)}
                                alt={rt.id}
                                className="w-full h-full object-contain filter drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]"
                              />
                              {rt.count > 0 && (
                                <div className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white border border-white/20 shadow-xl z-10 
                                  ${rt.color === 'blue' ? 'bg-blue-600' :
                                    rt.color === 'pink' ? 'bg-pink-600' :
                                      rt.color === 'emerald' ? 'bg-emerald-600' :
                                        rt.color === 'orange' ? 'bg-orange-600' :
                                          'bg-purple-600'}`}
                                >
                                  {rt.count}
                                </div>
                              )}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}

                  {/* Reward History List */}
                  <div className="bg-slate-950/30 rounded-lg border border-sky-200/10 overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.04] border-b border-white/5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-widest text-sky-100/45">Recent Rewards</div>
                        <div className="text-[10px] text-white/30">
                          {weeklyRewardHistory.length > 0
                            ? `${Math.min(RECENT_REWARD_LIMIT, weeklyRewardHistory.length)} recent rewards${weeklyRewardHistory.length > RECENT_REWARD_LIMIT ? ` of ${weeklyRewardHistory.length} this week` : ' this week'}`
                            : 'No rewards recorded in the past week'}
                        </div>
                      </div>
                      {weeklyRewardHistory.length > RECENT_REWARD_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllRewardHistory((prev) => !prev)}
                          className="shrink-0 rounded-md border border-sky-200/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-sky-100/60 hover:bg-white/[0.08] hover:text-sky-100 transition-colors"
                        >
                          {showAllRewardHistory ? 'Show 5' : 'Show Week'}
                        </button>
                      )}
                    </div>

                    {visibleRewardHistory.length > 0 ? (
                      <div className="divide-y divide-white/5 max-h-56 overflow-y-auto custom-scrollbar">
                        {visibleRewardHistory.map((entry, i) => (
                          <div key={`${entry.timestamp}-${i}`} className="px-3 py-2.5 flex justify-between items-start gap-4 hover:bg-white/[0.02] transition-colors">
                            <span className="text-[11px] font-bold text-emerald-300/90 leading-tight">{entry.message}</span>
                            <span
                              className="text-[9px] font-black text-white/30 tabular-nums shrink-0 uppercase text-right"
                              title={new Date(entry.timestamp).toLocaleString()}
                            >
                              <RelativeRewardTime timestamp={entry.timestamp} />
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-5 text-center text-[10px] font-black uppercase tracking-[0.24em] text-white/25">
                        Nothing obtained yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cog Suits Section */}
            <div className="space-y-2 rounded-xl border border-fuchsia-300/10 bg-[linear-gradient(180deg,rgba(88,28,135,0.22),rgba(17,24,39,0.5))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                onClick={() => toggleSection('suits')}
                className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer"
              >
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">Cog Suits</h4>
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-300 ${expandedSections.suits ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>                </div>
              </button>

              {expandedSections.suits && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  {Object.entries(toonTrackerData.data.cogsuits || {})
                    .filter(([_, suit]) => suit.hasDisguise)
                    .map(([id, suit]) => {
                      const dept = suit.department.toLowerCase().replace('bot', '');
                      const deptColors: Record<string, { bg: string, border: string, text: string, accent: string }> = {
                        sell: { bg: '#4c0d6b', border: '#9d4edd', text: '#f3e8ff', accent: '#d8b4fe' },
                        cash: { bg: '#14532d', border: '#22c55e', text: '#f0fdf4', accent: '#86efac' },
                        law: { bg: '#1e3a8a', border: '#60a5fa', text: '#eff6ff', accent: '#93c5fd' },
                        boss: { bg: '#4a3728', border: '#8c5d3d', text: '#fafaf9', accent: '#d6d3d1' }
                      };
                      const colors = deptColors[dept] || { bg: '#1f2937', border: '#374151', text: '#f9fafb', accent: '#9ca3af' };

                      const statMap: Record<string, string> = {
                        boss: 'Stock Options',
                        law: 'Jury Notices',
                        cash: 'Cogbucks',
                        sell: 'Merits'
                      };
                      const statName = statMap[dept] || 'Points';
                      const isMaxed = suit.level >= 50;
                      const isReady = suit.promotion && suit.promotion.current >= suit.promotion.target;
                      const remaining = suit.promotion ? suit.promotion.target - suit.promotion.current : 0;
                      const progress = suit.promotion ? (suit.promotion.current / suit.promotion.target) * 100 : 0;

                      return (
                        <div
                          key={id}
                          className={`relative rounded-lg border flex flex-col transition-all hover:brightness-110 shadow-md group/suit ${isMaxed ? 'p-3 gap-0' : 'p-4 gap-3'}`}
                          style={{
                            backgroundColor: colors.bg,
                            borderColor: `${colors.border}60`,
                          }}
                        >
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[11.5px] font-bold text-white uppercase tracking-widest truncate">{suit.department}</span>
                            <div className="flex items-center shrink-0">
                              {isMaxed ? (
                                <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-black/20" style={{
                                  color: colors.accent,
                                  borderColor: `${colors.border}40`
                                }}>
                                  Maxed
                                </div>
                              ) : (
                                <div className="flex items-center h-5 px-2 rounded border bg-black/20 shadow-sm" style={{
                                  color: colors.text,
                                  borderColor: `${colors.border}40`
                                }}>
                                  <span className="text-[11.5px] font-bold italic whitespace-nowrap opacity-70">
                                    {(suit.suit?.name || 'No Disguise').replace(/\u0003/g, '')}{suit.version === 2 ? ' V2.0' : ''}
                                  </span>
                                  <div className="w-[1px] h-3 bg-white/20 mx-1.5" />
                                  <span className="text-[11.5px] font-black whitespace-nowrap">Lv. {suit.level}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {!isMaxed && (
                            <div className="flex-1 min-w-0">
                              {isReady ? (
                                <div className="text-[10.5px] font-black uppercase tracking-widest px-2 py-1.5 rounded border text-center shadow-sm" style={{
                                  color: '#ffffff',
                                  backgroundColor: colors.border,
                                  borderColor: colors.border,
                                }}>
                                  Ready for promotion
                                </div>
                              ) : suit.promotion ? (
                                <div className="relative h-6 w-full bg-black/30 rounded border overflow-hidden flex items-center justify-center p-[1px]" style={{ borderColor: `${colors.border}40` }}>
                                  <div
                                    className="absolute inset-y-0 left-0 transition-all duration-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                                    style={{
                                      width: `${Math.min(100, progress)}%`,
                                      backgroundColor: `${colors.border}80`
                                    }}
                                  />
                                  <span className="relative z-10 text-[10.5px] font-black uppercase tracking-widest text-center leading-none" style={{ color: colors.text }}>
                                    {remaining.toLocaleString()} {statName} remaining
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {/* Expansion Lip */}
                          {!isMaxed && suit.promotion && remaining > 0 && (
                            <div className="pt-1 mt-1 border-t border-white/10">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSuitId(expandedSuitId === id ? null : id);
                                }}
                                className="w-full py-1.5 flex items-center justify-center gap-2 rounded hover:bg-black/10 transition-colors group"
                              >
                                <span className="text-[9.5px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: colors.text }}>
                                  {expandedSuitId === id ? 'Hide Recommendations' : 'Show Recommendations'}
                                </span>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`transition-transform duration-300 ${expandedSuitId === id ? 'rotate-180' : ''}`}
                                  style={{ color: colors.accent }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>

                              {expandedSuitId === id && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-2 space-y-1.5 pb-1">
                                  {(() => {
                                    const facilities: any = {
                                      sell: {
                                        items: [
                                          { name: 'Long Steel', val: 1630 },
                                          { name: 'Short Steel, +5 Battles', val: 1503 },
                                          { name: 'Short Steel, +4 Battles', val: 1376 },
                                          { name: 'Short Steel, +3 Battles', val: 1249 },
                                          { name: 'Short Steel, +2 Battles', val: 1121 },
                                          { name: 'Short Steel, +1 Battle', val: 994 },
                                          { name: 'Short Steel', val: 867 },
                                          { name: 'Long Scrap', val: 638 },
                                          { name: 'Short Scrap, +5 Battles', val: 590 },
                                          { name: 'Short Scrap, +4 Battles', val: 542 },
                                          { name: 'Short Scrap, +3 Battles', val: 494 },
                                          { name: 'Short Scrap, +2 Battles', val: 446 },
                                          { name: 'Short Scrap, +1 Battle', val: 398 },
                                          { name: 'Short Scrap', val: 350 }
                                        ]
                                      },
                                      cash: {
                                        items: [
                                          { name: 'Bullion Mint', val: 1850 },
                                          { name: 'Bullion Mint, 1 Skip', val: 1738 },
                                          { name: 'Bullion Mint, 2 Skips', val: 1626 },
                                          { name: 'Coin Mint', val: 807 },
                                          { name: 'Coin Mint, 1 Skip', val: 755 },
                                          { name: 'Coin Mint, 2 Skips', val: 702 }
                                        ]
                                      },
                                      law: {
                                        items: [
                                          { name: 'Senior Wing', val: 2082 },
                                          { name: 'Senior Wing, 1 Skip', val: 1968 },
                                          { name: 'Senior Wing, 2 Skips', val: 1854 },
                                          { name: 'Junior Wing', val: 889 },
                                          { name: 'Junior Wing, 1 Skip', val: 835 },
                                          { name: 'Junior Wing, 2 Skips', val: 781 }
                                        ]
                                      },
                                      boss: {
                                        items: [
                                          { name: 'Final Fringe', val: 2305 },
                                          { name: 'Final Fringe, 1 Skip', val: 2201 },
                                          { name: 'Final Fringe, 2 Skips', val: 2097 },
                                          { name: 'First Fairway', val: 975 },
                                          { name: 'First Fairway, 1 Skip', val: 929 },
                                          { name: 'First Fairway, 2 Skips', val: 882 }
                                        ]
                                      }
                                    };

                                    const facilityData = facilities[dept];
                                    if (!facilityData) return null;
                                    const items = facilityData.items;
                                    const highest = items[0];
                                    const lowest = items[items.length - 1];

                                    let highestCount = Math.floor(remaining / highest.val);
                                    let rem = remaining - (highestCount * highest.val);
                                    let lowestCount = rem > 0 ? Math.ceil(rem / lowest.val) : 0;

                                    const rows = [];
                                    for (let c = 0; c < highestCount; c++) rows.push(highest);
                                    for (let c = 0; c < lowestCount; c++) rows.push(lowest);

                                    const total = (highestCount * highest.val) + (lowestCount * lowest.val);

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

            {/* ToonTasks Section */}
            <div className="space-y-2 rounded-xl border border-amber-300/20 bg-[linear-gradient(180deg,rgba(120,53,15,0.22),rgba(28,25,23,0.45))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                onClick={() => toggleSection('tasks')}
                className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer"
              >
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors">ToonTasks</h4>
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-300 ${expandedSections.tasks ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </button>

              {expandedSections.tasks && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  {toonTrackerData?.data?.tasks && toonTrackerData.data.tasks.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {toonTrackerData.data.tasks.map((task: any, i: number) => {
                        const progress = (task.objective.progress.current / task.objective.progress.target) * 100;
                        return (
                          <div key={i} className="p-4 bg-[#fcf8ef] rounded-lg border border-[#5c4a33]/30 flex flex-col gap-3 transition-all hover:bg-white shadow-md">
                            <div className="space-y-0.5">
                              <div className="text-sm font-black text-[#4a3728] leading-tight select-all">{task.objective.text}</div>
                              {task.objective.where && (
                                <div className="flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#5c4a33]/60"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                  <span className="text-[9.5px] font-black text-[#5c4a33]/60 uppercase tracking-widest">{task.objective.where}</span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1 pt-1">
                              <div className="h-2 w-full bg-[#5c4a33]/10 rounded-full overflow-hidden border border-[#5c4a33]/5 p-[1px]">
                                <div
                                  className="h-full bg-emerald-600 rounded-full transition-all duration-700 shadow-[0_0_5px_rgba(16,185,129,0.3)]"
                                  style={{ width: `${Math.min(100, progress)}%` }}
                                />
                              </div>
                              <div className="text-right text-[11.5px] font-black uppercase tracking-[0.1em] text-emerald-700">
                                {task.objective.progress.text}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center rounded-lg border border-dashed border-[#5c4a33]/30 bg-black/5">
                      <span className="text-[11.5px] font-bold text-[#5c4a33]/50 uppercase tracking-[0.3em]">No Active Tasks</span>
                    </div>
                  )}
                </div>
              )}
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
