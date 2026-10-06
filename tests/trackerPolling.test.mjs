import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replaceAll('import.meta.env', 'testEnv'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function createTracker(enabled = true, initialize = true, storedPreference) {
  let onMessage;
  const sockets = [];
  const timers = [];
  const storage = storedPreference === undefined ? {} : { 'tracker-enabled': storedPreference };
  const event = () => ({ addListener() {} });
  class Socket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    open() { this.readyState = 1; this.onopen(); }
    fail() { this.readyState = 3; this.onerror(); this.onclose(); }
  }
  const context = {
    exports: {},
    testEnv: { DEV: false },
    require: name => name.endsWith('/db') ? {
      getSetting: async key => key === 'tracker-enabled' ? enabled : undefined,
      setSetting: async () => {},
    } : {},
    defineBackground: fn => fn(),
    WebSocket: Socket,
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
    console: { info() {}, error() {} },
    browser: {
      runtime: {
        onConnect: event(), onStartup: event(), onUpdateAvailable: event(), onInstalled: event(),
        onMessage: { addListener(fn) { onMessage = fn; } },
      },
      alarms: { create() {}, clear: async () => {}, onAlarm: event() },
      contextMenus: { onClicked: event() },
      storage: { local: {
        get: async () => ({ ...storage }),
        set: async values => { Object.assign(storage, values); },
      } },
    },
  };
  vm.runInNewContext(compiled, context);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  if (initialize) await flush();
  const sync = message => new Promise(resolve => {
    assert.equal(onMessage({ type: 'SYNC_GAMES', ...message }, {}, resolve), true);
  });
  return { sockets, timers, sync, flush, storage };
}

test('manual search polls open clients and retries every failed local port', async () => {
  const tracker = await createTracker();
  assert.equal(tracker.sockets.length, 8);
  const [active, ...missing] = tracker.sockets;
  active.open();
  assert.equal(active.sent.at(-1).request, 'all', 'new connections get an immediate poll');
  missing.forEach(socket => socket.fail());
  active.sent.length = 0;
  const search = tracker.sync();
  await tracker.flush();
  tracker.sockets.slice(8).forEach(socket => socket.fail());
  assert.equal((await search).sync, true);
  assert.equal(active.sent.length, 1);
  assert.equal(active.sent[0].request, 'all');
  assert.equal(tracker.sockets.length, 15);
  assert.deepEqual(tracker.sockets.slice(8).map(socket => socket.url), missing.map(socket => socket.url));
  const retry = tracker.sync();
  await tracker.flush();
  const socketCount = tracker.sockets.length;
  const repeated = tracker.sync();
  await tracker.flush();
  assert.equal(tracker.sockets.length, socketCount, 'pending connections are not duplicated');
  tracker.sockets.slice(15).forEach(socket => socket.fail());
  await Promise.all([retry, repeated]);
});

test('targeted sync polls only the selected client', async () => {
  const tracker = await createTracker();
  tracker.sockets.forEach(socket => { socket.open(); socket.sent.length = 0; });
  await tracker.sync({ port: '1548' });
  assert.equal(tracker.sockets[1].sent[0].request, 'all');
  assert.equal(tracker.sockets.reduce((count, socket) => count + socket.sent.length, 0), 1);
});

test('automatic polling refreshes active clients without retrying failed ports', async () => {
  const tracker = await createTracker();
  tracker.sockets[0].open();
  tracker.sockets[0].sent.length = 0;
  tracker.sockets.slice(1).forEach(socket => socket.fail());
  tracker.timers.find(timer => timer.delay === 5000).fn();
  assert.equal(tracker.sockets[0].sent[0].request, 'all');
  assert.equal(tracker.sockets.length, 8);
});

test('manual search waits for startup preference and respects disabled tracking', async () => {
  const cold = await createTracker(true, false);
  const search = cold.sync();
  await cold.flush();
  cold.sockets.forEach(socket => socket.open());
  assert.equal((await search).sync, true);
  assert.equal(cold.sockets.length, 8);
  const disabled = await createTracker(false, false);
  assert.equal((await disabled.sync()).sync, false);
  assert.equal(disabled.sockets.length, 0);
});

test('search waits for pending connections and finishes after the scan timeout', async () => {
  const tracker = await createTracker();
  let finished = false;
  const search = tracker.sync().then(response => { finished = true; return response; });
  await tracker.flush();
  assert.equal(finished, false);
  tracker.timers.find(timer => timer.delay === 3000).fn();
  assert.equal((await search).sync, true);
});

test('enabled content tracker restores a missing background preference', async () => {
  const tracker = await createTracker(null);
  const search = tracker.sync({ trackerEnabled: true });
  await tracker.flush();
  tracker.sockets.forEach(socket => socket.open());
  assert.equal((await search).sync, true);
  assert.equal(tracker.sockets.length, 8);
  assert.equal(tracker.storage['tracker-enabled'], true);
});

test('shared extension preference overrides legacy IndexedDB preference', async () => {
  const tracker = await createTracker(false, true, true);
  tracker.sockets.forEach(socket => socket.open());
  assert.equal((await tracker.sync()).sync, true);
  assert.equal(tracker.sockets.length, 8);
});

test('content tracker cannot override an explicitly disabled shared preference', async () => {
  const tracker = await createTracker(true, true, false);
  assert.equal((await tracker.sync({ trackerEnabled: true })).sync, false);
  assert.equal(tracker.sockets.length, 0);
});
