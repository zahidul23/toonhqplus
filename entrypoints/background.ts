import { closeDB, getSetting, setSetting } from './sidebar.content/db';
import { normalizeDisplayMode } from './lib/displayMode';
import { checkRewards, getRewardHistoryKey, pruneRewardHistory, isDeepEqual } from './sidebar.content/trackerUtils';
import type { ToonTrackerData } from './sidebar.content/tracker';
import type { RewardChange, RewardHistoryEntry } from './sidebar.content/trackerUtils';
import { createRewardNotificationIcon } from './lib/rewardNotificationIcon';
import { formatSosReward } from './sidebar.content/sosData';
import {
  analyzeExtensionStorageMerge,
  mergeIndexedDatabases,
  pruneIndexedDbSnapshotForExport,
  restoreIndexedDatabases,
  snapshotIndexedDatabases,
  type ImportConflictPolicy,
  type ImportMode,
  type ExtensionStorageSnapshot,
} from './lib/storageTransfer';

export default defineBackground(() => {
  const connections = new Map<string, { ws: WebSocket; data: ToonTrackerData | null; authorized: boolean }>();
  let primaryPort: string | null = null;
  const TRACKED_PORTS = ['1547', '1548', '1549', '1550', '1551', '1552', '1553', '1554'];
  const failedPorts = new Set<string>();
  const connectingPorts = new Set<string>();
  const intentionalDisconnectSockets = new WeakSet<WebSocket>();
  const TRACKER_ENABLED_KEY = 'tracker-enabled';
  const REWARD_NOTIFICATIONS_ENABLED_KEY = 'reward-notifications-enabled';
  const REWARD_NOTIFICATION_MERGE_MS = 5 * 1000;
  const recentRewardNotifications = new Map<string, {
    toonIds: Set<string>;
    expiresAt: number;
  }>();
  let rewardNotificationSequence = 0;
  let rewardNotificationQueue: Promise<void> = Promise.resolve();
  let trackerEnabled: boolean | undefined = undefined;
  let trackingTimeout: ReturnType<typeof setTimeout> | null = null;
  let autoDiscoverTimeout: ReturnType<typeof setTimeout> | null = null;
  const KEEP_ALIVE_ALARM = 'toontracker-keepalive';
  const TRACKING_POLL_MS = 5000;
  const AUTO_DISCOVER_MS = 60000;

  async function exportExtensionStorage(includeFullToonCache: boolean): Promise<ExtensionStorageSnapshot> {
    return {
      localStorage: {},
      indexedDB: includeFullToonCache
        ? await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] })
        : pruneIndexedDbSnapshotForExport(await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] })),
      browserStorageLocal: await browser.storage.local.get(null),
    };
  }

  async function syncTrackerRuntimeState() {
    trackerEnabled = await getSetting<boolean>(TRACKER_ENABLED_KEY);
    if (trackerEnabled === true) {
      startAutoDiscover();
      startTracking();
      TRACKED_PORTS.forEach(port => {
        if (!connections.has(port)) {
          failedPorts.delete(port);
          try { connectToPort(port); } catch (e) { }
        } else {
          authorizePort(port, connections.get(port));
        }
      });
    } else {
      stopAutoDiscover();
      stopTracking();
      disconnectAll();
    }
    broadcastStatus();
  }

  async function getExtensionStorageSnapshot(includeFullToonCache: boolean = true): Promise<ExtensionStorageSnapshot> {
    return {
      localStorage: {},
      indexedDB: includeFullToonCache
        ? await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] })
        : pruneIndexedDbSnapshotForExport(await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] })),
      browserStorageLocal: await browser.storage.local.get(null),
    };
  }

  async function analyzeExtensionImport(snapshot: ExtensionStorageSnapshot) {
    return analyzeExtensionStorageMerge(await getExtensionStorageSnapshot(true), snapshot);
  }

  async function importExtensionStorage(
    snapshot: ExtensionStorageSnapshot,
    options: { mode: ImportMode; conflictPolicy: ImportConflictPolicy }
  ) {
    closeDB();

    if (options.mode === 'replace') {
      await browser.storage.local.clear();
      if (Object.keys(snapshot.browserStorageLocal || {}).length > 0) {
        await browser.storage.local.set(snapshot.browserStorageLocal);
      }
      await restoreIndexedDatabases(snapshot.indexedDB || {}, { fallbackNames: ['toonhqplus'] });
    } else {
      const currentBrowserStorage = await browser.storage.local.get(null);
      const updates: Record<string, any> = {};
      for (const [key, value] of Object.entries(snapshot.browserStorageLocal || {})) {
        if (!(key in currentBrowserStorage) || JSON.stringify(currentBrowserStorage[key]) === JSON.stringify(value) || options.conflictPolicy === 'use-import') {
          updates[key] = value;
        }
      }
      if (Object.keys(updates).length > 0) {
        await browser.storage.local.set(updates);
      }
      await mergeIndexedDatabases(snapshot.indexedDB || {}, { conflictPolicy: options.conflictPolicy });
    }

    await syncTrackerRuntimeState();
  }

  async function isTrackerEnabled() {
    const storedTrackerEnabled = await getSetting<boolean>(TRACKER_ENABLED_KEY);
    return storedTrackerEnabled === true;
  }

  async function initializeBackground() {
    trackerEnabled = await getSetting<boolean>(TRACKER_ENABLED_KEY);
    if (trackerEnabled === true) {
      startAutoDiscover();
      startTracking();
      // On boot attempt initial sync
      TRACKED_PORTS.forEach(port => {
        if (!connections.has(port)) {
          failedPorts.delete(port);
          try { connectToPort(port); } catch (e) { }
        }
      });
    }
  }

  let broadcastTimeout: ReturnType<typeof setTimeout> | null = null;

  async function _broadcastStatus() {
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
      browser.runtime.sendMessage(payload).catch(() => { });
      const tabs = await browser.tabs.query({ url: ['*://*.toonhq.org/*', '*://toonhq.org/*'] });
      tabs.forEach(tab => {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, payload).catch(() => { });
        }
      });
    } catch (e) { }
  }

  function broadcastStatus() {
    if (broadcastTimeout) clearTimeout(broadcastTimeout);
    broadcastTimeout = setTimeout(() => {
      _broadcastStatus().catch(() => { });
    }, 100);
  }

  async function broadcastToonLaffUpdated(toonId: string, laff: ToonTrackerData['data']['laff']) {
    const payload = { type: 'TRACKER_TOON_LAFF_UPDATED', toonId, laff };

    try {
      browser.runtime.sendMessage(payload).catch(() => { });
      const tabs = await browser.tabs.query({ url: ['*://*.toonhq.org/*', '*://toonhq.org/*'] });
      tabs.forEach(tab => {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, payload).catch(() => { });
        }
      });
    } catch (e) { }
  }

  async function sendRewardNotifications(data: ToonTrackerData, changes: RewardChange[]) {
    const notificationSettings = await browser.storage.local.get(REWARD_NOTIFICATIONS_ENABLED_KEY);
    if (notificationSettings[REWARD_NOTIFICATIONS_ENABLED_KEY] !== true) return;
    if (!await browser.permissions.contains({ permissions: ['notifications'] })) return;

    const presentation: Record<string, { label: string }> = {
      sos: { label: 'SOS Card' },
      unites: { label: 'Unite' },
      summons: { label: 'Cog Summons' },
      pinkslips: { label: 'Pink Slips' },
      remotes: { label: 'Remote' },
    };

    const remoteChanges = changes.filter(change => change.type === 'remotes');
    const individualChanges = changes.filter(change => change.type !== 'remotes');

    const notifications = (await Promise.all(individualChanges.map(async change => {
      const style = presentation[change.type];
      if (!style) return null;
      const detail = change.type === 'sos'
        ? formatSosReward(change.subtype)
        : change.type === 'summons' && change.metadata?.summonType
          ? `${change.subtype} — ${change.metadata.summonType}`
          : change.subtype;

      return {
        signature: JSON.stringify([change.type, change.subtype, change.count, change.metadata || null]),
        options: {
          type: 'basic',
          iconUrl: await createRewardNotificationIcon(change),
          title: `+${change.count} ${style.label}${import.meta.env.FIREFOX ? ' • ToonHQ+' : ''}`,
          message: import.meta.env.FIREFOX ? `${detail}\n\n${data.data.toon.name}` : detail,
          ...(!import.meta.env.FIREFOX ? { contextMessage: `ToonHQ+\n${data.data.toon.name}` } : {}),
        },
      } as const;
    }))).filter((notification): notification is NonNullable<typeof notification> => notification !== null);

    if (remoteChanges.length > 0) {
      const total = remoteChanges.reduce((sum, change) => sum + change.count, 0);
      const hasHealingRemote = remoteChanges.some(change => /heal/i.test(change.subtype));
      const hasDamageRemote = remoteChanges.some(change => !/heal/i.test(change.subtype));
      const details = remoteChanges.map(change => {
        const level = change.metadata?.remoteLevel ? `${change.metadata.remoteLevel}-star ` : '';
        return `${change.count}× ${level}${change.subtype}`;
      });
      notifications.push({
        signature: JSON.stringify(remoteChanges.map(change => [
          change.type,
          change.subtype,
          change.count,
          change.metadata || null,
        ])),
        options: {
          type: 'basic',
          iconUrl: hasHealingRemote && hasDamageRemote
            ? browser.runtime.getURL('images/remotes-combined.png' as any)
            : await createRewardNotificationIcon(remoteChanges[0]),
          title: `+${total} ${total === 1 ? 'Remote' : 'Remotes'}${import.meta.env.FIREFOX ? ' • ToonHQ+' : ''}`,
          message: import.meta.env.FIREFOX ? `${details.join('\n')}\n\n${data.data.toon.name}` : details.join('\n'),
          ...(!import.meta.env.FIREFOX ? { contextMessage: `ToonHQ+\n${data.data.toon.name}` } : {}),
        },
      });
    }

    const toonId = data.data.toon.id;
    if (!toonId) return;

    // Serialize creates and updates so simultaneous tracker messages cannot both
    // create a notification before either one registers the recent match.
    const operation = async () => {
      for (const notification of notifications) {
        const now = Date.now();
        for (const [signature, recent] of recentRewardNotifications) {
          if (recent.expiresAt <= now) recentRewardNotifications.delete(signature);
        }

        const recent = recentRewardNotifications.get(notification.signature);
        if (recent && !recent.toonIds.has(toonId)) {
          // Leave the first notification untouched. Updating it immediately when
          // another toon reports the same reward can prevent the original toast
          // and sound from being presented by the operating system.
          recent.toonIds.add(toonId);
          recent.expiresAt = now + REWARD_NOTIFICATION_MERGE_MS;
          continue;
        }

        const id = `toonhqplus-reward-${now}-${rewardNotificationSequence++}`;
        await browser.notifications.create(id, notification.options);
        recentRewardNotifications.set(notification.signature, {
          toonIds: new Set([toonId]),
          expiresAt: now + REWARD_NOTIFICATION_MERGE_MS,
        });
      }
    };

    const queued = rewardNotificationQueue.then(operation, operation);
    rewardNotificationQueue = queued.then(() => undefined, () => undefined);
    await queued;
  }

  async function addNotifications(data: ToonTrackerData, changes: RewardChange[]) {
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

    console.info(`[ToonTracker BG] Detected ${newEntries.length} new rewards for ${data.data.toon.name}`);
    const updated = pruneRewardHistory([...newEntries, ...history]);
    await setSetting(historyKey, updated);
    await sendRewardNotifications(data, changes);

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
      } catch (e) { }
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
      if (trackerEnabled !== true) {
        conn.close();
        return;
      }
      // Only push to state when completely open to stop UI panels from flashing
      const info = { ws: conn, data: null, authorized: false };
      connections.set(port, info);
      failedPorts.delete(port);
      authorizePort(port, info);
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

          if (previousData && isDeepEqual(previousData.data, msgData.data)) {
            return;
          }

          info.data = msgData;

          if (
            previousData?.data?.laff?.current !== msgData.data.laff.current ||
            previousData?.data?.laff?.max !== msgData.data.laff.max
          ) {
            broadcastToonLaffUpdated(toonId, msgData.data.laff).catch(() => { });
          }

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
      } catch (e) { }
    };

    conn.onclose = () => {
      connectingPorts.delete(port);
      const wasIntentionalDisconnect = intentionalDisconnectSockets.has(conn);
      if (connections.get(port)?.ws === conn) {
        connections.delete(port);
      }
      if (!wasIntentionalDisconnect && trackerEnabled === true) {
        failedPorts.add(port);
      }
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


  async function startTracking() {
    if (trackerEnabled !== true) return;
    if (trackingTimeout) return;
    console.info("[ToonTracker BG] Starting active tracking...");
    TRACKED_PORTS.forEach(port => {
      try { connectToPort(port); } catch (e) { }
    });

    const scheduleTrackingPoll = () => {
      trackingTimeout = setTimeout(() => {
        trackingTimeout = null;
        pollTrackedPorts();
        if (trackerEnabled === true) scheduleTrackingPoll();
      }, TRACKING_POLL_MS);
    };

    const pollTrackedPorts = () => {
      if (trackerEnabled !== true) return;
      TRACKED_PORTS.forEach(port => {
        const info = connections.get(port);
        if (!info && !failedPorts.has(port)) {
          try { connectToPort(port); } catch (e) { }
        } else if (info && info.ws.readyState === WebSocket.OPEN && info.authorized) {
          try { info.ws.send(JSON.stringify({ request: "all" })); } catch (e) { }
        }
      });
    };

    scheduleTrackingPoll();

    browser.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 1 });
  }

  function startAutoDiscover() {
    if (autoDiscoverTimeout) return;
    const discover = () => {
      autoDiscoverTimeout = null;
      if (trackerEnabled !== true) return;
      TRACKED_PORTS.forEach(port => {
        if (!connections.has(port)) {
          failedPorts.delete(port);
          try { connectToPort(port); } catch (e) { }
        }
      });
      autoDiscoverTimeout = setTimeout(discover, AUTO_DISCOVER_MS);
    };
    autoDiscoverTimeout = setTimeout(discover, AUTO_DISCOVER_MS);
  }
  function stopAutoDiscover() {
    if (autoDiscoverTimeout) clearTimeout(autoDiscoverTimeout);
    autoDiscoverTimeout = null;
  }

  function stopTracking() {
    if (trackingTimeout) {
      console.info("[ToonTracker BG] No active clients, stopping tracker...");
      clearTimeout(trackingTimeout);
      trackingTimeout = null;
    }
    browser.alarms.clear(KEEP_ALIVE_ALARM).catch(() => { });
  }

  function disconnectAll() {
    for (const [port, info] of connections.entries()) {
      intentionalDisconnectSockets.add(info.ws);
      try { info.ws.close(); } catch (e) { }
      connections.delete(port);
    }
    failedPorts.clear();
    connectingPorts.clear();
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'toonhqplus-tracker') {
      if (trackerEnabled === true) startTracking();
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Re-initialize if the SW was killed and restarted mid-session
    if (trackerEnabled === undefined) {
      initializeBackground().catch(console.error);
    }
    if (message.type === 'TRACKER_PREF_CHANGED') {
      trackerEnabled = message.enabled;
      setSetting(TRACKER_ENABLED_KEY, trackerEnabled).catch(console.error);

      // Broadcast setting change to all other open tabs
      browser.tabs.query({ url: ['*://*.toonhq.org/*', '*://toonhq.org/*'] }).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { type: 'TRACKER_PREF_CHANGED', enabled: message.enabled }).catch(() => { });
          }
        });
      }).catch(console.error);

      if (trackerEnabled) {
        startAutoDiscover();
        startTracking();
        TRACKED_PORTS.forEach(port => {
          if (!connections.has(port)) {
            failedPorts.delete(port);
            try { connectToPort(port); } catch (e) { }
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
    } else if (message.type === 'GET_TRACKER_PREF') {
      sendResponse({ enabled: trackerEnabled });
    } else if (message.type === 'DISPLAY_MODE_CHANGED') {
      const mode = normalizeDisplayMode(message.mode);
      browser.tabs.query({ url: ['*://*.toonhq.org/*', '*://toonhq.org/*'] }).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { type: 'DISPLAY_MODE_CHANGED', mode }).catch(() => { });
          }
        });
      }).catch(console.error);
      sendResponse({ received: true });
    } else if (message.type === 'GET_REWARD_NOTIFICATION_PERMISSION') {
      browser.permissions.contains({ permissions: ['notifications'] }).then(granted => {
        sendResponse({ ok: true, granted });
      }).catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    } else if (message.type === 'REQUEST_REWARD_NOTIFICATION_PERMISSION') {
      browser.permissions.request({ permissions: ['notifications'] }).then(granted => {
        sendResponse({ ok: true, granted });
      }).catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    } else if (message.type === 'OPEN_REWARD_NOTIFICATION_SETTINGS') {
      const openRewardNotificationSettings = async () => {
        if (import.meta.env.FIREFOX) {
          await browser.tabs.create({ url: browser.runtime.getURL('notification-settings.html' as any) });
          return { ok: true, opened: 'tab' };
        }

        const popupApi = (browser as any).action?.openPopup
          ? (browser as any).action
          : (browser as any).browserAction;

        if (popupApi?.openPopup) {
          try {
            await popupApi.openPopup();
            return { ok: true, opened: 'popup' };
          } catch {
            // Firefox before 149 requires an extension user gesture to open a
            // toolbar popup. Fall back to the same extension page in a tab.
          }
        }

        await browser.tabs.create({
          url: browser.runtime.getURL('notification-settings.html' as any),
        });
        return { ok: true, opened: 'tab' };
      };

      openRewardNotificationSettings().then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    } else if (message.type === 'REMOVE_REWARD_NOTIFICATION_PERMISSION') {
      browser.permissions.remove({ permissions: ['notifications'] }).then(async () => {
        const stillGranted = await browser.permissions.contains({ permissions: ['notifications'] });
        if (stillGranted) {
          sendResponse({ ok: false, error: 'The browser did not remove notification permission.' });
        } else {
          sendResponse({ ok: true, removed: true });
        }
      }).catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    } else if (message.type === 'SYNC_GAMES') {
      if (trackerEnabled === true) {
        const portsToSync = message.port ? [message.port] : TRACKED_PORTS;

        portsToSync.forEach(port => {
          failedPorts.delete(port);
          const info = connections.get(port);
          if (info && info.ws.readyState === WebSocket.OPEN) {
            authorizePort(port, info);
          } else if (!info) {
            try { connectToPort(port); } catch (e) { }
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
            try { connectToPort(port); } catch (e) { }
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
    } else if (message.type === 'EXPORT_EXTENSION_STORAGE') {
      exportExtensionStorage(message.includeFullToonCache === true).then((snapshot) => {
        sendResponse({ snapshot });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    } else if (message.type === 'IMPORT_EXTENSION_STORAGE') {
      importExtensionStorage(message.snapshot as ExtensionStorageSnapshot, {
        mode: message.mode === 'replace' ? 'replace' : 'merge',
        conflictPolicy: message.conflictPolicy === 'use-import' ? 'use-import' : 'keep-local',
      }).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    } else if (message.type === 'ANALYZE_EXTENSION_IMPORT') {
      analyzeExtensionImport(message.snapshot as ExtensionStorageSnapshot).then((plan) => {
        sendResponse({ plan });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEP_ALIVE_ALARM) {
      // Re-initialize if the SW was killed and restarted mid-session
      if (trackerEnabled === undefined) {
        initializeBackground().catch(console.error);
      }
    }
  });

  browser.runtime.onStartup.addListener(() => {
    initializeBackground().catch(console.error);
  });

  // A downloaded update cannot activate while this worker is kept alive by
  // tracker WebSockets. Reload immediately so users do not need to restart
  // their browser; the updated worker will restore the tracker from storage.
  browser.runtime.onUpdateAvailable.addListener(() => {
    browser.runtime.reload();
  });

  browser.runtime.onInstalled.addListener(() => {
    initializeBackground().catch(console.error);
  });

  // Firefox temporary-extension reloads do not reliably emit onStartup or
  // onInstalled for the newly created background page. Always restore the
  // persisted tracker preference when this background context starts.
  initializeBackground().catch(error => {
    console.error('[ToonTracker BG] Failed to initialize tracker:', error);
  });

  // Add installation/update listener to reload toonhq tabs
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'update' || details.reason === 'install') {
      try {
        const tabs = await browser.tabs.query({ url: ['*://*.toonhq.org/*', '*://toonhq.org/*'] });
        tabs.forEach(tab => {
          if (tab.id) {
            browser.tabs.reload(tab.id).catch(() => { });
          }
        });
      } catch (e) {
        console.error('[ToonTracker BG] Error reloading tabs on update/install:', e);
      }
    }
  });

});
