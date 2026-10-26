import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createBoardingStatusService } from '../entrypoints/sidebar.content/boardingStatus.ts';
import { validBoardingStatus } from '../entrypoints/sidebar.content/nativeBridge.ts';
import { harness } from './helpers/nativeBridgeHarness.mjs';

const source = readFileSync(new URL('../entrypoints/sidebar.content/QuickTeleport.tsx', import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = compile(source.slice(source.indexOf('const LOCATION_REFRESH_COOLDOWN_SECONDS'), source.indexOf('function HoverTooltip'))
  + source.slice(source.indexOf('function formatLocationName'), source.indexOf('export function QuickTeleport')));
const lifecycle = compile(`(() => { ${source.slice(source.indexOf('  const boardingCheckReady'), source.indexOf('  const selectedToon ='))} })()`);
const key = id => `toonhqplus-quick-teleport-last-auto-boarding-check:${id}`;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function setup(t, storage = new Map()) {
  const h = harness(), service = createBoardingStatusService(h.client);
  const mounts = [];
  t.after(() => { mounts.forEach(mount => mount.close()); service.dispose(); h.close(); });
  let now = 1_000_000;
  function mount(overrides = {}) {
    const effects = [];
    let cursor = 0;
    const view = {};
    const context = vm.createContext({
      Date: { now: () => now }, validBoardingStatus,
      localStorage: { getItem: name => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value) },
      nativeState: h.client.state, toonId: '1', preferencesLoaded: true,
      districts: [{ id: 21, name: 'Gulp Gulch' }, { id: 30, name: 'Bounceboro' }],
      coreData: { locations: [{ id: 23, name: 'Sellbot HQ' }] }, quickTeleportActiveRef: { current: true },
      getCachedBoardingGroupStatus: id => service.getCached(id),
      getBoardingGroupStatus: (id, force) => service.get(id, force), onBoardingCreated: listener => service.subscribe(listener),
      setBoardingStatus: value => { view.boarding = value; }, setCheckingStatus: value => { view.checking = value; },
      setStatus: value => { view.status = value; }, setDistrictId: value => { view.district = value; },
      useEffect(callback, deps) {
        const index = cursor++, previous = effects[index];
        if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      }, ...overrides,
    });
    vm.runInContext(helpers, context);
    const instance = {
      view, context,
      render(update = {}) { Object.assign(context, update); cursor = 0; vm.runInContext(lifecycle, context); },
      close() { context.quickTeleportActiveRef.current = false; effects.forEach(effect => effect.cleanup?.()); effects.length = 0; },
    };
    mounts.push(instance); instance.render(); return instance;
  }
  return { ...h, service, storage, mount, advance(ms) { now += ms; }, get now() { return now; } };
}

test('automatic mount check reserves the original 60-second cooldown and uses the native request', async t => {
  const h = setup(t), ui = h.mount();
  assert.equal(h.nativeRequests.length, 1); assert.equal(h.nativeRequests[0].name, 'loadExistingBoardingGroup');
  assert.equal(JSON.parse(h.storage.get(key(1))).checkedAt, h.now); assert.equal(ui.view.checking, true);
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21, location: 23 } }); await flush();
  assert.equal(ui.view.checking, false); assert.equal(ui.view.district, '21');
  assert.match(ui.view.status, /Online in Gulp Gulch at Sellbot HQ/);
  assert.deepEqual(JSON.parse(h.storage.get(key(1))).result, { district: 21, location: 23 });
  assert.equal(h.forbidden.length, 0);
});

test('remounts and another page reuse persisted results until the 60-second boundary', async t => {
  const h = setup(t); const first = h.mount();
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } }); await flush(); first.close();
  h.advance(59_999); const remount = h.mount(); assert.equal(h.nativeRequests.length, 1); assert.equal(remount.view.district, '21');
  const otherPage = setup(t, h.storage); otherPage.advance(59_999); const restored = otherPage.mount();
  assert.equal(otherPage.nativeRequests.length, 0); assert.equal(restored.view.district, '21');
  remount.close(); h.advance(1); h.mount(); assert.equal(h.nativeRequests.length, 2);
  h.emit('boarding_response', { nonce: 2, success: true, result: null }); await flush();
});

test('offline null results are restored without another automatic request', async t => {
  const h = setup(t); const first = h.mount(); h.emit('boarding_response', { nonce: 1, success: true, result: null }); await flush(); first.close();
  const otherPage = setup(t, h.storage), restored = otherPage.mount();
  assert.equal(otherPage.nativeRequests.length, 0); assert.equal(restored.view.boarding, null); assert.match(restored.view.status, /offline/);
});

test('failures retain the full automatic cooldown while explicit refresh can bypass it', async t => {
  const h = setup(t), first = h.mount();
  h.emit('boarding_response', { nonce: 1, success: false, message: 'simulated failure' }); await flush();
  assert.match(first.view.status, /simulated failure/); assert.equal(first.view.checking, false); first.close();
  h.advance(30_000); const remount = h.mount(); assert.equal(h.nativeRequests.length, 1);
  const explicit = h.service.get(1, true); assert.equal(h.nativeRequests.length, 2);
  h.emit('boarding_response', { nonce: 2, success: true, result: null }); await explicit;
  remount.close(); h.advance(30_000); h.mount(); assert.equal(h.nativeRequests.length, 3);
  h.emit('boarding_response', { nonce: 3, success: true, result: null }); await flush();
});

test('unchanged group updates and elapsed time do not create an automatic polling loop', async t => {
  const h = setup(t), ui = h.mount(); h.emit('boarding_response', { nonce: 1, success: true, result: null }); await flush();
  h.advance(60_000);
  for (let i = 0; i < 100; i++) ui.render({ nativeState: { ...h.client.state } });
  assert.equal(h.nativeRequests.length, 1);
});

test('opening and closing group modals does not trigger another automatic boarding check', async t => {
  const h = setup(t), ui = h.mount();
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } }); await flush();
  h.advance(60_000);
  for (const pathname of ['/groups/10/', '/groups/20/', '/groups/']) {
    h.target.location.pathname = pathname; h.mutateDom(); await h.flush(); ui.render({ nativeState: h.client.state });
    assert.equal(h.client.state.connected, true); assert.equal(ui.view.district, '21');
  }
  assert.equal(h.nativeRequests.length, 1);
});

test('a concurrent remount cannot duplicate an automatic check still in flight', async t => {
  const h = setup(t), first = h.mount(), second = h.mount();
  assert.equal(h.nativeRequests.length, 1); first.close();
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } }); await flush();
  assert.equal(first.view.boarding, undefined);
  second.close(); assert.equal(h.nativeRequests.length, 1);
});

test('automatic checks wait for preferences and the connected native active owned TTR Toon', async t => {
  const h = setup(t);
  for (const update of [
    { preferencesLoaded: false }, { toonId: '' },
    { nativeState: { ...h.client.state, connected: false } },
    { nativeState: { ...h.client.state, authenticated: false } },
    { nativeState: { ...h.client.state, gameId: 2 } },
    { nativeState: { ...h.client.state, currentToonId: '2' } },
    { nativeState: { ...h.client.state, ownedToons: [] } },
    { nativeState: { ...h.client.state, ownedToons: [{ id: 1, game: 2 }] } },
  ]) { const ui = h.mount(update); ui.close(); }
  assert.equal(h.nativeRequests.length, 0); assert.equal(h.storage.size, 0);
  const ui = h.mount({ preferencesLoaded: false }); ui.render({ preferencesLoaded: true });
  assert.equal(h.nativeRequests.length, 1); h.emit('boarding_response', { nonce: 1, success: true, result: null }); await flush();
});

test('Toon changes cancel stale UI updates and use independent persisted cooldowns', async t => {
  const h = setup(t), ui = h.mount();
  h.commit('selectToon', 2, state => { state.accounts.currentToon = 2; state.groups.toonBoardingGroupSubscription = 2; });
  await h.flush();
  ui.render({ nativeState: h.client.state }); assert.equal(h.nativeRequests.length, 1);
  ui.render({ toonId: '2' }); assert.equal(h.nativeRequests.length, 2);
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 99 } });
  h.emit('boarding_response', { nonce: 2, success: true, result: { district: 30 } }); await flush();
  assert.equal(ui.view.district, '30'); assert.equal(ui.view.boarding.district, 30);
  assert.ok(h.storage.has(key(1))); assert.ok(h.storage.has(key(2)));
});

test('legacy timestamp-only cooldowns and malformed saved entries are handled safely', async t => {
  const h = setup(t); h.storage.set(key(1), JSON.stringify(h.now)); const legacy = h.mount();
  assert.equal(h.nativeRequests.length, 0); legacy.close();
  h.storage.set(key(1), '{invalid'); h.mount(); assert.equal(h.nativeRequests.length, 1);
  h.emit('boarding_response', { nonce: 1, success: true, result: null }); await flush();
});

test('native reconnects respect the persisted cooldown and check again after it expires', async t => {
  const h = setup(t), ui = h.mount();
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } }); await flush();
  h.commit('disconnect', null, state => { state.socket.status = 'disconnected'; }); await h.flush();
  ui.render({ nativeState: h.client.state }); assert.equal(ui.view.boarding, undefined);
  h.advance(30_000);
  h.commit('reconnect', null, state => { state.socket.status = 'connected'; state.socket.sid = 'reconnected'; }); await h.flush();
  ui.render({ nativeState: h.client.state }); assert.equal(h.nativeRequests.length, 1); assert.equal(ui.view.district, '21');
  h.advance(30_000);
  h.commit('reconnectAgain', null, state => { state.socket.sid = 'reconnected-again'; }); await h.flush();
  ui.render({ nativeState: h.client.state }); assert.equal(h.nativeRequests.length, 2);
  h.emit('boarding_response', { nonce: 2, success: true, result: null }); await flush();
  assert.equal(ui.view.boarding, null);
});

test('unmount suppresses late UI results while retaining the result for a later mount', async t => {
  const h = setup(t), ui = h.mount(); ui.close();
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } }); await flush();
  assert.equal(ui.view.district, undefined); assert.equal(JSON.parse(h.storage.get(key(1))).result.district, 21);
  assert.equal(h.mount().view.district, '21'); assert.equal(h.nativeRequests.length, 1);
});
