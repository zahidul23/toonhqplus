import { getSetting, setSetting } from './sidebar.content/db';
import { checkRewards, getRewardHistoryKey, pruneRewardHistory } from './sidebar.content/trackerUtils';
import type { ToonTrackerData } from './sidebar.content/tracker';
import type { RewardHistoryEntry } from './sidebar.content/trackerUtils';

export default defineBackground(() => {
  const connections = new Map<string, { ws: WebSocket; data: ToonTrackerData | null; lastResponse: number }>();
  let primaryPort: string | null = null;
  let targetToonId: string | null = null;
  let isSyncing = false;
  let connectionStatus: 'connected' | 'disconnected' | 'idle' | 'connecting' = 'idle';
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  async function broadcastStatus() {
    const instances = Array.from(connections.entries()).map(([port, info]) => ({
      port,
      toonName: info.data?.data.toon.name || 'Unknown Toon',
      toonId: info.data?.data.toon.id,
      isPrimary: port === primaryPort
    })).filter(inst => inst.toonId);

    const primaryInfo = primaryPort ? connections.get(primaryPort) : null;
    const primaryData = primaryInfo?.data || null;
    const savedToons = await getSetting<{ id: string; name: string; style: string; laff: number }[]>('tracker-toon-list') || [];
    
    let rewardHistory: RewardHistoryEntry[] = [];
    if (primaryData?.data.toon.id) {
      rewardHistory = await getSetting<RewardHistoryEntry[]>(getRewardHistoryKey(primaryData.data.toon.id)) || [];
    }

    const payload = {
      type: 'TRACKER_STATUS_UPDATED',
      status: connectionStatus,
      isSyncing: isSyncing,
      toonTrackerData: primaryData,
      instances: instances,
      savedToons: savedToons,
      rewardHistory: rewardHistory,
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

  function setStatus(status: typeof connectionStatus) {
    connectionStatus = status;
    broadcastStatus();
  }

  function setIsSyncing(syncing: boolean) {
    isSyncing = syncing;
    broadcastStatus();
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

  function stopSync() {
    connections.forEach(info => {
      info.ws.onclose = null;
      info.ws.close();
    });
    connections.clear();
    primaryPort = null;
    targetToonId = null;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    setStatus('idle');
    setIsSyncing(false);
  }

  function startHeartbeat() {
    if (heartbeatInterval) return;
    console.log('[ToonTracker BG] Starting heartbeat interval (5s)');
    heartbeatInterval = setInterval(() => {
      const now = Date.now();
      if (connections.size === 0) return;
      
      connections.forEach((info, port) => {
        if (info.ws.readyState === WebSocket.OPEN && (now - info.lastResponse < 25000)) {
          info.ws.send(JSON.stringify({ request: "all" }));
        } else {
          info.ws.close();
        }
      });
    }, 5000);
  }

  async function startSync(providedKey?: string, targetId?: string, isRetry = false) {
    if (targetId) targetToonId = targetId;
    
    if (targetToonId) {
      for (const [port, info] of connections.entries()) {
        if (info.data?.data.toon.id === targetToonId) {
          primaryPort = port;
          setStatus('connected');
          setIsSyncing(false);
          return;
        }
      }
    }

    setIsSyncing(true);
    startHeartbeat();

    const ports = ['1547', '1548', '1549', '1550', '1551', '1552', '1553', '1554'];
    let portsAttempted = 0;
    const agentName = "ToonHQ Plus";

    ports.forEach((port) => {
      if (connections.has(port)) {
        portsAttempted++;
        if (portsAttempted === ports.length) setIsSyncing(false);
        return;
      }

      const authKey = Math.random().toString(36).substring(2, 11);
      const conn = new WebSocket(`ws://localhost:${port}/`);
      const timeoutId = setTimeout(() => { if (conn.readyState === WebSocket.CONNECTING) conn.close(); }, 1500);

      conn.onopen = () => {
        clearTimeout(timeoutId);
        connections.set(port, { ws: conn, data: null, lastResponse: Date.now() });
        conn.send(JSON.stringify({ authorization: authKey, name: agentName }));
        conn.send(JSON.stringify({ request: "all" }));
      };

      conn.onmessage = (event) => {
        const info = connections.get(port);
        if (info) info.lastResponse = Date.now();

        try {
          const msgData = JSON.parse(event.data);
          if (msgData.type === 'authorize') conn.send(JSON.stringify({ type: 'authorize', id: msgData.id }));
          
          if (msgData.event === 'all' && msgData.data?.toon) {
            const toonId = msgData.data.toon.id;
            const previousData = info?.data;
            if (info) info.data = msgData;

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

            if (targetToonId === toonId || !primaryPort) {
              primaryPort = port;
              setStatus('connected');
              setIsSyncing(false);
            }

            const rewardChanges = checkRewards(previousData?.data?.rewards, msgData.data?.rewards, msgData.data?.location?.zone);
            if (rewardChanges.length > 0) addNotifications(msgData, rewardChanges).catch(console.error);

            setSetting(`tracker-data-${toonId}`, msgData).catch(console.error);

            if (port === primaryPort) {
              setSetting('last-tracker-toon-id', toonId).catch(console.error);
              broadcastStatus();
            } else {
              broadcastStatus();
            }
          }
        } catch (e) {}
      };

      conn.onerror = () => {
        clearTimeout(timeoutId);
        conn.close();
      };

      conn.onclose = () => {
        connections.delete(port);
        if (primaryPort === port) {
          primaryPort = null;
          for (const [p, info] of connections.entries()) {
            if (info.data?.data.toon.id === targetToonId) {
              primaryPort = p;
              break;
            }
          }
          if (!primaryPort && connections.size > 0) primaryPort = connections.keys().next().value;
          if (!primaryPort) setStatus('disconnected');
          else broadcastStatus();
        } else {
          broadcastStatus();
        }

        portsAttempted++;
        if (portsAttempted === ports.length && connections.size === 0) {
          if (!isRetry) startSync(providedKey, targetToonId, true);
          else {
            setIsSyncing(false);
            setStatus('disconnected');
          }
        } else if (portsAttempted === ports.length) {
          setIsSyncing(false);
        }
      };
    });
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_TRACKER_SYNC') {
      startSync(message.authKey, message.targetToonId);
      sendResponse({ started: true });
    } else if (message.type === 'STOP_TRACKER_SYNC') {
      stopSync();
      sendResponse({ stopped: true });
    } else if (message.type === 'GET_TRACKER_STATUS') {
      const primaryData = primaryPort ? connections.get(primaryPort)?.data : null;
      const instances = Array.from(connections.entries()).map(([port, info]) => ({
        port,
        toonName: info.data?.data.toon.name || 'Unknown Toon',
        toonId: info.data?.data.toon.id,
        isPrimary: port === primaryPort
      })).filter(inst => inst.toonId);

      sendResponse({
        status: connectionStatus,
        isSyncing: isSyncing,
        toonTrackerData: primaryData,
        instances: instances,
        primaryToonId: primaryData?.data.toon.id
      });
    } else if (message.type === 'SWITCH_PRIMARY_INSTANCE') {
      for (const [port, info] of connections.entries()) {
        if (info.data?.data.toon.id === message.toonId || port === message.port) {
          primaryPort = port;
          targetToonId = info.data?.data.toon.id || null;
          broadcastStatus();
          break;
        }
      }
      sendResponse({ switched: true });
    }
  });
});
