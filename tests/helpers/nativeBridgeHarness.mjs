import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createNativeBridgeClient } from '../../entrypoints/sidebar.content/nativeBridge.ts';

const source = readFileSync(new URL('../../public/native-bridge.js', import.meta.url), 'utf8');
export const clone = value => JSON.parse(JSON.stringify(value));
export const toon = (id = 1) => ({ id, game: 1, external: true, name: `Toon ${id}`, sellbot: '3100' });
export const group = (id = 10, count = 3) => ({ id, game: 1, type: 3, created: '2026-10-22T12:00:00Z', options: {},
  members: Array.from({ length: count }, (_, index) => ({ id: id * 10 + index, group: id,
    joined: '2026-10-22T12:00:00Z', left: null, owner: index === 0, toon: toon(index + 1) })),
});

export function harness({ mounted = true, groups = [group()], authenticated = true, pathname = '/groups/' } = {}) {
  const target = new EventTarget();
  target.location = { pathname };
  const bus = new Map(), children = new Set(), subscribers = new Set(), watchers = new Set();
  const timers = new Map();
  let nextTimer = 0, present = mounted, observerCallback, dispatchImpl, nonce = 0, disconnectedObservers = 0;
  const pendingNative = new Map(), nativeRequests = [], messages = [], forbidden = [], errors = [];
  const nativeTimers = {
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay, repeat: false }); return id; },
    setInterval(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay, repeat: true }); return id; },
    clearTimeout(id) { timers.delete(id); }, clearInterval(id) { timers.delete(id); },
  };
  const store = {
    state: {
      accounts: { user: authenticated ? { id: 5, secret: 'never-forward-this' } : null, currentToon: authenticated ? 1 : null,
        toons: authenticated ? { 1: toon(), 2: toon(2) } : {}, pendingSocketAuthToken: 'never-forward-token' },
      socket: { status: 'connected', sid: 'native-namespace-id', rooms: { groups: { game: 1, status: 'connected' } } },
      groups: { groups: Object.fromEntries(groups.map(value => [value.id, clone(value)])),
        activeGroups: groups.map(value => value.id), toonBoardingGroupSubscription: authenticated ? 1 : null },
      core: { game: 1 },
    },
    getters: {
      get gameId() { return store.state.core.game; },
      get socketActive() { return store.state.socket.status === 'connected'; },
      roomConnectedToGame(room, game) { return store.state.socket.rooms[room]?.status === 'connected' && store.state.socket.rooms[room]?.game === game; },
    },
    _actions: { loadExistingBoardingGroup: true },
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    watch(selector, callback) {
      const watcher = { selector, callback, value: selector(store.state, store.getters) };
      watchers.add(watcher); return () => watchers.delete(watcher);
    },
    dispatch(name, toonId) {
      if (dispatchImpl) return dispatchImpl(name, toonId);
      if (name !== 'loadExistingBoardingGroup') throw new Error(`Unexpected action: ${name}`);
      const requestNonce = ++nonce;
      nativeRequests.push({ name, toonId, nonce: requestNonce, sid: store.state.socket.sid });
      return new Promise((resolve, reject) => pendingNative.set(requestNonce, { resolve, reject }));
    },
  };
  class Vue {
    constructor({ parent } = {}) {
      this.$root = parent ? parent.$root : this;
      this.$store = parent?.$store || store;
      this.$radioCallbacks = [];
      this._isDestroyed = false;
      if (parent) children.add(this);
    }
    // This is the reviewed native radio-plugin contract from app.a5a51d0c.js:
    // $listenFor records callbacks; its beforeDestroy mixin calls bus.$off.
    $listenFor(event, callback) {
      if (!bus.has(event)) bus.set(event, new Set());
      bus.get(event).add(callback);
      this.$radioCallbacks.push({ event, callback });
    }
    $destroy() {
      for (const { event, callback } of this.$radioCallbacks) bus.get(event)?.delete(callback);
      this.$radioCallbacks = []; this._isDestroyed = true; children.delete(this);
    }
  }
  let root = new Vue();
  const document = { documentElement: {}, querySelector: selector => selector === '.sl.theme' && present ? { __vue__: root } : null };
  const sandbox = vm.createContext({
    window: target, document, CustomEvent, queueMicrotask,
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() { disconnectedObservers++; }
    },
    ...nativeTimers,
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    fetch: () => { forbidden.push('fetch'); throw new Error('Extra HTTP request'); },
    WebSocket: class { constructor() { forbidden.push('WebSocket'); throw new Error('Extra socket'); } },
  });
  target.addEventListener('toonhqplus-native-message', event => {
    try { messages.push(JSON.parse(event.detail)); } catch { /* Malformed-message tests. */ }
  });
  function inject() { vm.runInContext(source, sandbox, { timeout: 1000 }); }
  const client = createNativeBridgeClient(target, 'test-client');
  inject(); client.requestSnapshot();
  const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  const commit = (type, payload, mutate = () => {}) => {
    mutate(store.state);
    for (const callback of subscribers) callback({ type, payload }, store.state);
    for (const watcher of watchers) {
      const value = watcher.selector(store.state, store.getters);
      if (value !== watcher.value) { watcher.value = value; watcher.callback(value); }
    }
  };
  const emit = (name, data) => {
    for (const callback of [...(bus.get(`socket:${name}`) || [])]) callback(data);
    if (name === 'boarding_response') {
      const request = pendingNative.get(data.nonce);
      if (request) { pendingNative.delete(data.nonce); data.success ? request.resolve(data.result) : request.reject(new Error(data.message)); }
    }
  };
  return {
    client, store, target, messages, forbidden, errors, nativeRequests, children, subscribers, watchers, timers, pendingNative,
    flush, commit, emit, inject,
    mount() { present = true; observerCallback(); },
    replaceRoot() { root._isDestroyed = true; root = new Vue(); observerCallback(); },
    mutateDom() { observerCallback(); },
    setDispatch(fn) { dispatchImpl = fn; },
    runTimers(delay) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay) {
        if (!timer.repeat) timers.delete(id);
        timer.fn();
      }
    },
    raw(message) { target.dispatchEvent(new CustomEvent('toonhqplus-native-request', { detail: JSON.stringify(message) })); },
    get disconnectedObservers() { return disconnectedObservers; },
    get root() { return root; },
    close() { client.dispose(); target.__TOONHQ_PLUS_NATIVE_BRIDGE_DISCONNECT__?.(); },
  };
}
