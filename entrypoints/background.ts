import { getSetting, setSetting } from './sidebar.content/db';
import { checkRewards, getRewardHistoryKey, pruneRewardHistory } from './sidebar.content/trackerUtils';
import type { ToonTrackerData } from './sidebar.content/tracker';
import type { RewardHistoryEntry } from './sidebar.content/trackerUtils';

export default defineBackground(() => {
  const connections = new Map<string, { ws: WebSocket; data: ToonTrackerData | null; authorized: boolean }>();
  let primaryPort: string | null = null;
  const TRACKED_PORTS = ['1547', '1548', '1549', '1550', '1551', '1552', '1553', '1554'];
  const failedPorts = new Set<string>();
  const connectingPorts = new Set<string>();
  let stopTimeout: ReturnType<typeof setTimeout> | null = null;
  let trackerEnabled: boolean | undefined = undefined;

  getSetting<boolean>('tracker-enabled').then(v => {
    trackerEnabled = v;
    if (trackerEnabled === true) {
      startAutoDiscover();
      // On boot attempt initial sync
      TRACKED_PORTS.forEach(port => {
        if (!connections.has(port)) {
          failedPorts.delete(port);
          try { connectToPort(port); } catch(e) {}
        }
      });
    }
  });

  async function broadcastStatus() {
    const instances = Array.from(connections.entries()).map(([p, info]) => ({
      port: p,
      toonName: info.data?.data.toon.name || 'Unknown Toon',
      toonId: info.data?.data.toon.id,
      isPrimary: p === primaryPort,
      authorized: info.authorized,
      connected: info.ws.readyState === WebSocket.OPEN
    }));

    const primaryInfo = primaryPort ? connections.get(primaryPort) : null;
    const primaryData = primaryInfo?.data || null;
    const savedToons = await getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list') || [];
    
    let rewardHistory: RewardHistoryEntry[] = [];
    if (primaryData?.data.toon.id) {
      rewardHistory = await getSetting<RewardHistoryEntry[]>(getRewardHistoryKey(primaryData.data.toon.id)) || [];
    }

    const payload = {
      type: 'TRACKER_STATUS_UPDATED',
      instances,
      toonTrackerData: primaryData,
      savedToons,
      rewardHistory,
      primaryToonId: primaryData?.data.toon.id
    };

    try {
      browser.runtime.sendMessage(payload).catch(() => {});
      const tabs = await browser.tabs.query({});
      tabs.forEach(tab => {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, payload).catch(() => {});
        }
      });
    } catch (e) {}
  }

  async function addNotifications(data: ToonTrackerData, changes: any[]) {
    if (changes.length === 0 || !data.data.toon.id) return;
    const toonId = data.data.toon.id;
    const historyKey = getRewardHistoryKey(toonId);
    const history = await getSetting<RewardHistoryEntry[]>(historyKey) || [];
    const now = Date.now();
    const newEntries: RewardHistoryEntry[] = changes.map(change => ({
      category: change.type,
      item: change.subtype,
      amount: change.count,
      timestamp: now,
      ...(change.metadata ? { metadata: change.metadata } : {}),
    }));
    
    console.log(`[ToonTracker BG] Detected ${newEntries.length} new rewards for ${data.data.toon.name}`);
    const updated = pruneRewardHistory([...newEntries, ...history]);
    await setSetting(historyKey, updated);
    
    if (primaryPort && connections.get(primaryPort)?.data?.data.toon.id === toonId) {
      broadcastStatus();
    }
  }

  function authorizePort(port: string, info: any) {
    if (info && info.ws.readyState === WebSocket.OPEN && trackerEnabled === true) {
      const authKey = Math.random().toString(36).substring(2, 11);
      info.authorized = true;
      try {
        info.ws.send(JSON.stringify({ authorization: authKey, name: "ToonHQ Plus" }));
      } catch (e) {}
    }
  }

  function connectToPort(port: string) {
    if (trackerEnabled !== true) return;
    if (connections.has(port)) return; // Already connected or connecting
    if (failedPorts.has(port)) return; // Only attempt once until explicitly synced
    if (connectingPorts.has(port)) return; // Prevent duplicate pending WebSockets

    connectingPorts.add(port);
    const conn = new WebSocket(`ws://localhost:${port}/`);

    conn.onopen = () => {
      connectingPorts.delete(port);
      // Only push to state when completely open to stop UI panels from flashing
      const info = { ws: conn, data: null, authorized: false };
      connections.set(port, info);
      failedPorts.delete(port);
      if (trackerEnabled === true) authorizePort(port, info);
      broadcastStatus();
    };

    conn.onmessage = (event) => {
      const info = connections.get(port);
      if (!info) return;

      try {
        const msgData = JSON.parse(event.data);

        if (msgData.type === 'authorize') {
            if (trackerEnabled === true) {
                conn.send(JSON.stringify({ type: 'authorize', id: msgData.id }));
            }
        }
        
        if (msgData.event === 'all' && msgData.data?.toon) {
          const toonId = msgData.data.toon.id;
          const previousData = info.data;
          info.data = msgData;

          getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list').then(prev => {
            const list = prev || [];
            const updatedToon = { id: toonId, name: msgData.data.toon.name, style: msgData.data.toon.style, laff: msgData.data.laff.max };
            const existingIndex = list.findIndex(t => t.id === toonId);
            let updated;
            if (existingIndex >= 0) {
              if (list[existingIndex].laff === updatedToon.laff && list[existingIndex].style === updatedToon.style) return;
              updated = [...list];
              updated[existingIndex] = updatedToon;
            } else {
              updated = [...list, updatedToon];
            }
            setSetting('tracker-toon-list', updated).catch(console.error);
          });

          if (!primaryPort) {
            primaryPort = port;
            setSetting('last-tracker-toon-id', toonId).catch(console.error);
          }

          const rewardChanges = checkRewards(previousData?.data?.rewards, msgData.data?.rewards, msgData.data?.location?.zone);
          if (rewardChanges.length > 0) addNotifications(msgData, rewardChanges).catch(console.error);

          setSetting(`tracker-data-${toonId}`, msgData).catch(console.error);
          broadcastStatus();
        }
      } catch (e) {}
    };

    conn.onclose = () => {
      connectingPorts.delete(port);
      connections.delete(port);
      failedPorts.add(port);
      if (primaryPort === port) {
        primaryPort = connections.size > 0 ? connections.keys().next().value ?? null : null;
      }
      broadcastStatus();
    };
    
    conn.onerror = () => {
      connectingPorts.delete(port);
      failedPorts.add(port);
      // Conn will fire onclose afterwards natively
    };
  }

  let trackingInterval: ReturnType<typeof setInterval> | null = null;
  const activeClients = new Set<string>();

  async function startTracking() {
    if (trackerEnabled !== true) return;
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
    }
    if (trackingInterval) return;
    console.log("[ToonTracker BG] Starting active tracking...");
    
    TRACKED_PORTS.forEach(port => {
       try { connectToPort(port); } catch(e) {}
    });
    
    trackingInterval = setInterval(() => {
      if (trackerEnabled !== true) return;
      TRACKED_PORTS.forEach(port => {
        const info = connections.get(port);
        if (!info && !failedPorts.has(port)) {
          try { connectToPort(port); } catch(e) {}
        } else if (info && info.ws.readyState === WebSocket.OPEN && info.authorized) {
          try { info.ws.send(JSON.stringify({ request: "all" })); } catch(e) {}
        }
      });
    }, 5000);
  }

  let autoDiscoverInterval: ReturnType<typeof setInterval> | null = null;
  function startAutoDiscover() {
    if (autoDiscoverInterval) return;
    autoDiscoverInterval = setInterval(() => {
      if (trackerEnabled !== true) return;
      TRACKED_PORTS.forEach(port => {
        if (!connections.has(port)) {
          failedPorts.delete(port);
          try { connectToPort(port); } catch (e) {}
        }
      });
    }, 60000);
  }
  function stopAutoDiscover() {
    if (autoDiscoverInterval) clearInterval(autoDiscoverInterval);
    autoDiscoverInterval = null;
  }

  function stopTracking() {
    if (!trackingInterval) return;
    console.log("[ToonTracker BG] No active clients, stopping tracker...");
    clearInterval(trackingInterval);
    trackingInterval = null;
  }

  function disconnectAll() {
    for (const [port, info] of connections.entries()) {
      try { info.ws.close(); } catch(e) {}
      connections.delete(port);
    }
    failedPorts.clear();
    connectingPorts.clear();
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'toonhqplus-tracker') {
      const clientId = Math.random().toString(36).substring(2);
      activeClients.add(clientId);
      if (trackerEnabled === true) startTracking();

      port.onDisconnect.addListener(() => {
        activeClients.delete(clientId);
        if (activeClients.size === 0) {
          if (stopTimeout) clearTimeout(stopTimeout);
          stopTimeout = setTimeout(() => {
            if (activeClients.size === 0) {
              stopTracking();
            }
            stopTimeout = null;
          }, 10000);
        }
      });
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRACKER_PREF_CHANGED') {
      trackerEnabled = message.enabled;
      if (trackerEnabled) {
        startAutoDiscover();
        if (activeClients.size > 0) startTracking();
        TRACKED_PORTS.forEach(port => {
          if (!connections.has(port)) {
            failedPorts.delete(port);
            try { connectToPort(port); } catch (e) {}
          } else {
            authorizePort(port, connections.get(port));
          }
        });
      } else if (trackerEnabled === false) {
        stopAutoDiscover();
        stopTracking();
        disconnectAll();
      }
      broadcastStatus();
      sendResponse({ received: true });
    } else if (message.type === 'SYNC_GAMES') {
      if (trackerEnabled === true) {
        const portsToSync = message.port ? [message.port] : TRACKED_PORTS;
        
        portsToSync.forEach(port => {
          failedPorts.delete(port);
          const info = connections.get(port);
          if (info && info.ws.readyState === WebSocket.OPEN) {
            authorizePort(port, info);
          } else if (!info) {
             try { connectToPort(port); } catch(e) {}
          }
        });
        broadcastStatus();
      }
      sendResponse({ sync: true });
    } else if (message.type === 'DISCOVER_GAMES') {
      if (trackerEnabled === true) {
        TRACKED_PORTS.forEach(port => {
          if (!connections.has(port)) {
            failedPorts.delete(port);
            try { connectToPort(port); } catch(e) {}
          }
        });
      }
      sendResponse({ discovered: true });
    } else if (message.type === 'GET_TRACKER_STATUS') {
      broadcastStatus();
      sendResponse({ statusSent: true });
    } else if (message.type === 'SWITCH_PRIMARY_INSTANCE') {
      if (connections.has(message.port)) {
          primaryPort = message.port;
          broadcastStatus();
      }
      sendResponse({ switched: true });
    } else if (message.type === 'GET_TOON_DATA') {
      if (message.toonId === 'list') {
        getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list').then(list => {
          sendResponse({ list: list || [] });
        });
      } else if (message.toonId === 'last-id') {
        getSetting<string>('last-tracker-toon-id').then(lastId => {
          sendResponse({ lastId });
        });
      } else {
        Promise.all([
          getSetting<ToonTrackerData>(`tracker-data-${message.toonId}`),
          getSetting<RewardHistoryEntry[]>(getRewardHistoryKey(message.toonId))
        ]).then(([data, history]) => {
          sendResponse({ data, history: history || [] });
        });
      }
      return true;
    } else if (message.type === 'SET_LAST_TOON') {
      setSetting('last-tracker-toon-id', message.toonId).catch(console.error);
      sendResponse({ success: true });
    } else if (message.type === 'REMOVE_TOON') {
      getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list').then(list => {
        const updated = (list || []).filter(t => t.id !== message.toonId);
        setSetting('tracker-toon-list', updated).then(() => {
          broadcastStatus();
          sendResponse({ success: true });
        });
      });
      return true;
    }
  });

  // Initial check handled by onConnect
});
