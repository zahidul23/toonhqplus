/* Packaged page-world adapter. Passive observation never opens a connection or
 * dispatches a native action. Only an explicit boarding request uses the network. */
(function () {
  'use strict';
  const KEY = '__TOONHQ_PLUS_NATIVE_BRIDGE_DISCONNECT__';
  if (window[KEY]) window[KEY]();
  const REQUEST = 'toonhqplus-native-request';
  const MESSAGE = 'toonhqplus-native-message';
  const session = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const toonFields = ['id', 'game', 'external', 'name', 'species', 'color', 'laff', 'level',
    'photo', 'photo_bg', 'ring', 'toonup', 'trap', 'lure', 'sound', 'throw', 'squirt',
    'drop', 'prestiges', 'organic_level', 'sellbot', 'cashbot', 'lawbot', 'bossbot'];
  const groupFields = ['id', 'game', 'type', 'created', 'options', 'district', 'location',
    'went_in', 'num_players', 'max_players'];
  const groupMutations = new Set(['setActiveGroups', 'addOrUpdateGroup', 'addOrUpdateGroupMember',
    'removeGroupMember', 'archiveGroup', 'gameChanged', 'updateGameOpen']);
  let disposed = false, client = null, sequence = 0, generation = 0;
  let root = null, store = null, listener = null, unsubscribe = null, unwatch = null;
  let observer, timer = null, attempts = 0, scheduled = false, forceFull = true;
  let fingerprint = null, lastAccounts = null, publishedState = null;
  let activeSnapshot = new Set();
  const changed = new Set(), archived = new Set(), inFlight = new Map(), requestTimers = new Set();

  function safeCopy(value, depth) {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value.slice(0, 16384);
    if (depth <= 0) return null;
    if (Array.isArray(value)) return value.slice(0, 128).map(item => safeCopy(item, depth - 1));
    if (typeof value !== 'object') return null;
    const result = {};
    Object.keys(value).slice(0, 128).forEach(key => {
      if (!['__proto__', 'constructor', 'prototype'].includes(key)) result[key] = safeCopy(value[key], depth - 1);
    });
    return result;
  }
  function pick(value, fields) {
    const result = {};
    fields.forEach(key => { if (value[key] !== undefined) result[key] = safeCopy(value[key], 6); });
    return result;
  }
  function validId(id) { return Number.isSafeInteger(id) && id > 0; }
  function copyGroup(group) {
    // Native members include past joins/leaves, so long-running groups can
    // exceed 128 entries. Bound the serialized message in send(), not history.
    if (!group || !validId(group.id) || group.game !== 1 || !Array.isArray(group.members)) return null;
    const result = pick(group, groupFields);
    result.members = group.members.filter(member => member && typeof member === 'object').map(member => {
      const copy = pick(member, ['id', 'group', 'joined', 'left', 'owner', 'name', 'photo', 'num_players']);
      if (member.toon && typeof member.toon === 'object') copy.toon = pick(member.toon, toonFields);
      return copy;
    });
    return result;
  }
  function send(message) {
    if (disposed || !client) return false;
    try {
      const detail = JSON.stringify(Object.assign({ version: 1, client, session, sequence: sequence + 1 }, message));
      if (detail.length > 4_000_000) {
        send({ type: 'unavailable', reason: 'Native group data exceeds the supported size.' });
        return false;
      }
      sequence++;
      window.dispatchEvent(new CustomEvent(MESSAGE, { detail }));
      return true;
    } catch (error) { console.warn('[ToonHQ+] Could not copy native page state.', error); }
    return false;
  }
  function context() {
    const state = store.state, getters = store.getters, accounts = state.accounts;
    const gameId = Number(getters.gameId), socket = state.socket, room = socket.rooms && socket.rooms.groups;
    const pathname = window.location.pathname.replace(/\/+$/, '');
    const onGroups = pathname === '/groups' || pathname.startsWith('/groups/');
    // Group details/report dialogs use nested routes on the same Groups page.
    // Opening or closing one must not reset the feed or pending boarding checks.
    const pageContext = onGroups ? '/groups' : pathname;
    const ready = onGroups && gameId === 1 && getters.socketActive === true &&
      getters.roomConnectedToGame('groups', 1) === true && state.groups.groups !== null &&
      typeof state.groups.groups === 'object' && !Array.isArray(state.groups.groups);
    const ownedToons = Object.values(accounts.toons || {}).slice(0, 256)
      .filter(toon => toon && validId(toon.id)).map(toon => pick(toon, toonFields));
    return {
      signature: JSON.stringify([pageContext, gameId, socket.status, socket.sid, room && room.game,
        room && room.status, accounts.user && accounts.user.id, accounts.currentToon, ready,
        ownedToons.map(toon => [toon.id, toon.game, toon.external])]),
      state: {
        available: true, connected: ready, gameId: Number.isFinite(gameId) ? gameId : null,
        authenticated: !!accounts.user,
        currentToonId: accounts.currentToon == null ? null : String(accounts.currentToon),
        subscriptionToonId: validId(state.groups.toonBoardingGroupSubscription) ? state.groups.toonBoardingGroupSubscription : null,
        ownedToons,
        reason: ready ? null : gameId !== 1 ? 'Live history is paused outside Toontown Rewritten.'
          : !onGroups ? 'Open ToonHQ Groups to enable live history and boarding checks.'
            : 'Waiting for ToonHQ\'s groups connection.',
      },
    };
  }
  function flush() {
    scheduled = false;
    if (disposed || !store || !client) return;
    try {
      const current = context();
      if (current.signature !== fingerprint) {
        fingerprint = current.signature;
        generation++;
        forceFull = true;
        // Native requests cannot be cancelled. Keep old promises isolated by context.
        inFlight.clear();
      }
      const state = Object.assign(current.state, { context: session + ':' + generation });
      const accountSignature = JSON.stringify(state);
      const full = forceFull;
      const groups = store.state.groups;
      const ids = state.connected ? (full ? groups.activeGroups : Array.from(changed)) : [];
      if (ids.length > 5000) throw new Error('Unsupported native group count');
      const active = new Set(groups.activeGroups);
      const requiredGroup = id => {
        const copy = copyGroup(groups.groups && groups.groups[id]);
        if (!copy) throw new Error('Unsupported native group data');
        return copy;
      };
      const upserts = ids.filter(id => active.has(id)).map(requiredGroup);
      // Native state retains archived groups for dialogs and late events. Never
      // repopulate the extension's active map from those retained records.
      const archiveIds = new Set(archived);
      // updateGameOpen(false) closes all members and clears the active list
      // without emitting archiveGroup. Resyncs alone do not prove a closure.
      if (state.connected) activeSnapshot.forEach(id => {
        const group = groups.groups[id];
        if (!active.has(id) && group && Array.isArray(group.members) &&
            group.members.length && group.members.every(member => member && member.left)) archiveIds.add(id);
      });
      if (archiveIds.size > 5000) throw new Error('Unsupported native archive count');
      const archives = state.connected ? Array.from(archiveIds).filter(id => !active.has(id)).map(requiredGroup) : [];
      const pendingChanged = Array.from(changed), pendingArchived = Array.from(archived);
      publishedState = state;
      forceFull = false;
      changed.clear(); archived.clear();
      if (full || accountSignature !== lastAccounts || upserts.length || archives.length) {
        lastAccounts = accountSignature;
        if (!send({ type: 'state', full, state, groups: upserts, archived: archives })) {
          // An unavailable notification is not an acknowledgement of this state.
          // Retry locally with a full snapshot and preserve unsent final events.
          publishedState = lastAccounts = null; forceFull = true;
          pendingChanged.forEach(id => changed.add(id));
          pendingArchived.forEach(id => archived.add(id));
        } else activeSnapshot = state.connected ? active : new Set();
      }
    } catch (error) {
      publishedState = null; forceFull = true;
      send({ type: 'unavailable', reason: 'ToonHQ\'s page data is incompatible. Live history is paused.' });
      console.warn('[ToonHQ+] Native page bridge is unavailable.', error);
    }
  }
  function schedule() {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }
  function detach() {
    if (unsubscribe) unsubscribe();
    if (unwatch) unwatch();
    if (listener) listener.$destroy();
    unsubscribe = unwatch = listener = root = store = null;
    fingerprint = lastAccounts = publishedState = null;
    activeSnapshot.clear();
    changed.clear(); archived.clear(); inFlight.clear(); forceFull = true;
  }
  function compatible(vue) {
    const candidate = vue && vue.$store, state = candidate && candidate.state;
    return !!(vue && typeof vue.$listenFor === 'function' && vue.$root &&
      typeof vue.$root.constructor === 'function' && candidate && typeof candidate.subscribe === 'function' &&
      typeof candidate.watch === 'function' && typeof candidate.dispatch === 'function' && state &&
      state.groups && Array.isArray(state.groups.activeGroups) &&
      (state.groups.groups === null || typeof state.groups.groups === 'object') && state.socket && state.accounts &&
      candidate.getters && typeof candidate.getters.roomConnectedToGame === 'function');
  }
  function discover() {
    if (disposed) return;
    // Vue 2 replaces the original #app mount with ToonHqApp's .sl.theme div.
    // Component fallbacks also work with empty/filtered lists and root changes.
    let vue = null;
    for (const selector of ['.sl.theme', '#app', '.group-filters', '.groups-list-item', '.group-details-dialog']) {
      const element = document.querySelector(selector);
      let candidate = element && element.__vue__;
      while (candidate && !compatible(candidate)) candidate = candidate.$parent;
      if (candidate) { vue = candidate; break; }
    }
    if (store && root && !root._isDestroyed && vue && vue.$store === store && compatible(root)) return;
    if (store) { detach(); send({ type: 'unavailable', reason: 'Waiting for ToonHQ\'s page state.' }); }
    if (!compatible(vue)) return;
    try {
      root = vue.$root; store = vue.$store;
      // An unmounted child owns just our listeners. Destroying it runs the site's
      // radio cleanup mixin without removing any native component listeners.
      listener = new root.constructor({ parent: root });
      root.$listenFor.call(listener, 'socket:boarding_created', function (status) {
        try {
          flush();
          const toonId = publishedState && publishedState.subscriptionToonId;
          if (!publishedState || !publishedState.connected || !publishedState.authenticated ||
              toonId !== Number(publishedState.currentToonId) || !validId(toonId) || !status || typeof status !== 'object') return;
          send({ type: 'boarding-created', context: publishedState.context, toonId,
            result: pick(status, ['district', 'location', 'type', 'options', 'num_players']) });
        } catch (error) { console.warn('[ToonHQ+] Could not read native boarding notification.', error); }
      });
      unsubscribe = store.subscribe(function (mutation) {
        if (groupMutations.has(mutation.type)) {
          const payload = mutation.payload;
          if (mutation.type === 'setActiveGroups' || mutation.type === 'gameChanged' || mutation.type === 'updateGameOpen') forceFull = true;
          else if (mutation.type === 'archiveGroup') archived.add(payload);
          else {
            const id = mutation.type === 'addOrUpdateGroup' ? payload && payload.id
              : mutation.type === 'addOrUpdateGroupMember' ? payload && payload.member && payload.member.group
                : payload && payload.group;
            if (validId(id)) changed.add(id);
          }
        }
        schedule();
      });
      unwatch = store.watch(function () { return context().signature; }, schedule);
      forceFull = true;
      flush();
    } catch (error) {
      detach();
      send({ type: 'unavailable', reason: 'ToonHQ\'s native event bridge is incompatible.' });
      console.warn('[ToonHQ+] Could not attach native page bridge.', error);
    }
  }
  async function boarding(request) {
    flush();
    const owner = client, state = publishedState, toonId = request.toonId;
    const reply = data => { if (!disposed && client === owner) send(Object.assign({ type: 'boarding-result', id: request.id }, data)); };
    if (!state || !state.connected || !state.authenticated || !state.ownedToons.some(toon => toon.id === toonId && toon.external === true && toon.game === 1) ||
        !store._actions || !store._actions.loadExistingBoardingGroup) {
      reply({ error: state && state.reason || 'ToonHQ\'s boarding checks are unavailable for this Toon.' }); return;
    }
    const requestContext = state.context;
    const key = requestContext + ':' + toonId;
    if (!inFlight.has(key)) {
      if (inFlight.size >= 8) { reply({ error: 'Too many pending ToonHQ requests. Please wait.' }); return; }
      // Allocate the native nonce and consume the response through the native
      // action. Never send our old nonce or auth/subscription on the shared SID.
      let promise;
      try { promise = Promise.resolve(store.dispatch('loadExistingBoardingGroup', toonId)); }
      catch (error) { promise = Promise.reject(error); }
      inFlight.set(key, promise);
      promise.then(() => { if (inFlight.get(key) === promise) inFlight.delete(key); },
        () => { if (inFlight.get(key) === promise) inFlight.delete(key); });
    }
    let timeout;
    try {
      const result = await Promise.race([inFlight.get(key), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('ToonHQ did not answer the boarding check in time.')), 10_000);
        requestTimers.add(timeout);
      })]);
      flush();
      if (!publishedState || publishedState.context !== requestContext) throw new Error('ToonHQ connection or active Toon changed. Try again.');
      if (result !== null && (!result || typeof result !== 'object' || Array.isArray(result))) throw new Error('ToonHQ returned an invalid boarding status.');
      reply({ context: requestContext, result: result === null ? null : pick(result, ['district', 'location', 'type', 'options', 'num_players']) });
    } catch (error) { reply({ error: String(error && error.message || error).slice(0, 300) }); }
    finally { clearTimeout(timeout); requestTimers.delete(timeout); }
  }
  function receive(event) {
    if (disposed || typeof event.detail !== 'string' || event.detail.length > 2048) return;
    let request;
    try { request = JSON.parse(event.detail); } catch (_) { return; }
    if (!request || request.version !== 1 || typeof request.client !== 'string' || request.client.length > 100) return;
    if (request.type === 'snapshot') {
      client = request.client; forceFull = true; discover(); flush();
      if (!store) send({ type: 'unavailable', reason: 'Waiting for ToonHQ\'s native page state. Live history is paused.' });
    } else if (request.client === client && request.type === 'boarding' &&
        typeof request.id === 'string' && request.id.length <= 100 && validId(request.toonId)) {
      void boarding(request);
    } else if (request.client === client && request.type === 'dispose') disconnect();
  }
  function disconnect() {
    if (disposed) return;
    disposed = true;
    detach();
    if (observer) observer.disconnect();
    if (timer) clearInterval(timer);
    requestTimers.forEach(clearTimeout); requestTimers.clear();
    window.removeEventListener(REQUEST, receive);
    window.removeEventListener('popstate', scheduleDiscovery);
    if (window[KEY] === disconnect) delete window[KEY];
  }
  function scheduleDiscovery() { discover(); schedule(); }
  window[KEY] = disconnect;
  window.addEventListener(REQUEST, receive);
  window.addEventListener('popstate', scheduleDiscovery);
  observer = new MutationObserver(scheduleDiscovery);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Bounded startup discovery; later DOM changes, navigation and local snapshot
  // requests can attach again. This timer never contacts ToonHQ.
  timer = setInterval(function () {
    scheduleDiscovery();
    if (++attempts >= 30) { clearInterval(timer); timer = null; }
  }, 1000);
  discover();
})();
