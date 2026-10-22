import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, group, toon, clone } from './helpers/nativeBridgeHarness.mjs';
import { createNativeBridgeClient } from '../entrypoints/sidebar.content/nativeBridge.ts';

function setup(t, options) { const h = harness(options); t.after(() => h.close()); return h; }

test('late attachment reads the unfiltered bootstrap and never adds network work', async t => {
  const h = setup(t);
  const updates = [];
  h.client.subscribe(update => updates.push(update));
  assert.equal(updates[0].groups.length, 1);
  assert.equal(h.client.state.connected, true);
  assert.equal(h.client.state.currentToonId, '1');
  assert.equal(h.children.size, 1);
  for (let i = 0; i < 35; i++) h.runTimers(1000);
  h.mutateDom(); await h.flush();
  assert.deepEqual(h.nativeRequests, []);
  assert.deepEqual(h.forbidden, []);
  assert.equal(h.messages.length, 1, 'idle DOM changes do not repeatedly publish snapshots');
  const serialized = JSON.stringify(h.messages);
  assert.ok(!serialized.includes('never-forward'));
  assert.ok(!serialized.includes('native-namespace-id'), 'the SID stays in the native page');
});

test('empty lists and a bridge loaded before Vue recover locally on mount', async t => {
  const h = setup(t, { mounted: false, groups: [] });
  assert.equal(h.client.state.available, false);
  assert.equal(h.children.size, 0);
  h.mount(); await h.flush();
  assert.equal(h.client.state.connected, true);
  const updates = [];
  h.client.subscribe(update => updates.push(update));
  assert.deepEqual(updates[0].groups, []);
  assert.deepEqual(h.forbidden, []);
});

test('native member mutations are batched and copied after processing', async t => {
  const h = setup(t); const updates = [];
  h.client.subscribe(update => updates.push(update));
  const joined = { id: 104, group: 10, toon: toon(4), left: null };
  h.commit('addOrUpdateGroupMember', { member: joined }, state => state.groups.groups[10].members.push(joined));
  h.commit('removeGroupMember', { id: 101, group: 10 }, state => { state.groups.groups[10].members[1].left = 'left-at'; });
  await h.flush();
  assert.equal(updates.length, 2);
  assert.equal(updates[1].full, false);
  assert.equal(updates[1].groups[0].members.length, 4);
  assert.equal(updates[1].groups[0].members[1].left, 'left-at');
  updates[1].groups[0].members[0].toon.name = 'extension copy';
  assert.equal(h.store.state.groups.groups[10].members[0].toon.name, 'Toon 1');
});

test('partial native updates, full resyncs and archive processing use the native state', async t => {
  const h = setup(t); const updates = [];
  h.client.subscribe(update => updates.push(update));
  h.commit('addOrUpdateGroup', { id: 10, district: 30 }, state => { state.groups.groups[10].district = 30; });
  await h.flush();
  assert.equal(updates.at(-1).groups[0].members.length, 3);
  h.commit('setActiveGroups', [group(20)], state => { state.groups.groups[20] = group(20); state.groups.activeGroups = [20]; });
  await h.flush();
  assert.equal(updates.at(-1).full, true);
  assert.deepEqual(updates.at(-1).groups.map(value => value.id), [20]);
  h.commit('archiveGroup', 20, state => { state.groups.groups[20].members.forEach(member => { member.left = 'closed'; }); state.groups.activeGroups = []; });
  await h.flush();
  assert.equal(updates.at(-1).archived[0].members[0].left, 'closed');
  const replay = []; h.client.subscribe(update => replay.push(update));
  assert.deepEqual(replay[0].groups, []);
});

test('disconnect, reconnect, SPA navigation, game changes and logout pause without fallback', async t => {
  const h = setup(t); const initial = h.client.state.context;
  h.commit('setSocketStatus', 'reconnecting', state => { state.socket.status = 'reconnecting'; state.socket.sid = null; });
  await h.flush(); assert.equal(h.client.state.connected, false);
  h.commit('setSid', 'next', state => { state.socket.status = 'connected'; state.socket.sid = 'next'; });
  await h.flush(); assert.equal(h.client.state.connected, true); assert.notEqual(h.client.state.context, initial);
  h.target.location.pathname = '/fishing/'; h.mutateDom(); await h.flush();
  assert.equal(h.client.state.connected, false); assert.match(h.client.state.reason, /Open ToonHQ Groups/);
  h.target.location.pathname = '/cc/groups/';
  h.commit('gameChanged', 2, state => { state.core.game = 2; state.socket.rooms.groups.game = 2; });
  await h.flush(); assert.equal(h.client.state.connected, false); assert.equal(h.client.state.gameId, 2);
  h.commit('logout', null, state => { state.accounts.user = null; state.accounts.currentToon = null; state.accounts.toons = {}; });
  await h.flush(); assert.equal(h.client.state.authenticated, false); assert.deepEqual(h.client.state.ownedToons, []);
  assert.deepEqual(h.nativeRequests, []); assert.deepEqual(h.forbidden, []);
});

test('root recreation, reinjection and disposal leave exactly one observer/listener owner', async t => {
  const h = setup(t);
  h.replaceRoot(); await h.flush();
  assert.equal(h.children.size, 1); assert.equal(h.subscribers.size, 1); assert.equal(h.watchers.size, 1);
  h.inject(); h.client.requestSnapshot(); await h.flush();
  assert.equal(h.disconnectedObservers, 1);
  assert.equal(h.children.size, 1); assert.equal(h.subscribers.size, 1);
  assert.equal(h.client.state.connected, true);
  h.commit('switchToon', null, state => { state.accounts.currentToon = 2; }); await h.flush();
  assert.equal(h.client.state.currentToonId, '2', 'a new bridge session resets sequence tracking');
  const before = h.messages.length;
  h.client.dispose(); h.commit('setActiveGroups', []); await h.flush();
  assert.equal(h.messages.length, before);
  assert.equal(h.children.size, 0); assert.equal(h.subscribers.size, 0); assert.equal(h.watchers.size, 0);
  assert.equal(h.timers.size, 0);
});

test('native schema changes pause collection and recover without opening a connection', async t => {
  const h = setup(t);
  h.store.state.groups.groups = undefined;
  h.mutateDom(); await h.flush(); assert.equal(h.client.state.available, false);
  await assert.rejects(h.client.requestBoarding(1), /Waiting/);
  h.store.state.groups.groups = { 10: group() };
  h.mutateDom(); await h.flush(); assert.equal(h.client.state.connected, true);
  assert.equal(h.nativeRequests.length, 0); assert.equal(h.forbidden.length, 0);
});

test('boarding uses native nonce allocation alongside simultaneous native UI requests', async t => {
  const h = setup(t);
  const native = h.store.dispatch('loadExistingBoardingGroup', 2);
  const extension = h.client.requestBoarding(1);
  await h.flush();
  assert.deepEqual(h.nativeRequests.map(value => value.nonce), [1, 2]);
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } });
  h.emit('boarding_response', { nonce: 2, success: true, result: { district: 30 } });
  assert.equal((await native).district, 21);
  assert.equal((await extension).district, 30);
  assert.deepEqual(h.forbidden, []);
});

test('concurrent explicit requests share one native action and handle offline null', async t => {
  const h = setup(t); const first = h.client.requestBoarding(1), second = h.client.requestBoarding(1);
  await h.flush(); assert.equal(h.nativeRequests.length, 1);
  h.emit('boarding_response', { nonce: 1, success: true, result: null });
  assert.equal(await first, null); assert.equal(await second, null);
});

test('boarding errors, thrown native actions and timeouts are bounded without retries', async t => {
  const h = setup(t);
  const failure = assert.rejects(h.client.requestBoarding(1), /native error/);
  h.emit('boarding_response', { nonce: 1, success: false, message: 'native error' }); await failure;
  h.setDispatch(() => { throw new Error('action threw'); });
  await assert.rejects(h.client.requestBoarding(1), /action threw/);
  h.setDispatch(() => new Promise(() => {}));
  const timeout = assert.rejects(h.client.requestBoarding(1), /in time/);
  h.runTimers(10000); await h.flush(); await timeout;
  const retry = assert.rejects(h.client.requestBoarding(1), /in time/);
  h.runTimers(10000); await retry;
  assert.equal(h.forbidden.length, 0);
});

test('stale boarding results cannot cross a reconnect or active-Toon switch', async t => {
  const h = setup(t);
  const request = assert.rejects(h.client.requestBoarding(1), /changed/);
  h.commit('switchToon', { toonId: 2 }, state => { state.accounts.currentToon = 2; });
  await h.flush(); await request;
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 99 } }); await h.flush();
  const next = h.client.requestBoarding(2); await h.flush();
  h.emit('boarding_response', { nonce: 2, success: true, result: { district: 21 } });
  assert.equal((await next).district, 21);
});

test('boarding-created only follows the native active-Toon subscription', async t => {
  const h = setup(t); const results = [];
  h.client.onBoardingCreated((status, toonId) => results.push({ status, toonId }));
  h.emit('boarding_created', { district: 21, token: 'do not forward' });
  assert.deepEqual(results, [{ status: { district: 21 }, toonId: 1 }]);
  h.commit('setToonBoardingGroupSubscription', 2, state => { state.groups.toonBoardingGroupSubscription = 2; });
  await h.flush(); h.emit('boarding_created', { district: 22 });
  assert.equal(results.length, 1);
  assert.equal(h.nativeRequests.length, 0);
});

test('unowned and incompatible boarding requests do not dispatch native actions', async t => {
  const h = setup(t);
  await assert.rejects(h.client.requestBoarding(900), /not available/);
  h.store._actions = {};
  await assert.rejects(h.client.requestBoarding(1), /unavailable/);
  h.raw({ version: 1, client: 'test-client', type: 'dispatch', action: 'createGroup' });
  h.raw({ version: 1, client: 'foreign', type: 'boarding', id: 'attack', toonId: 1 });
  h.raw({ version: 1, client: 'test-client', type: 'boarding', id: 'attack', toonId: -1 });
  assert.equal(h.nativeRequests.length, 0);
});

test('malformed, foreign, duplicate and out-of-order messages cannot corrupt client state', async t => {
  const h = setup(t); const original = h.client.state.context;
  const stateMessage = clone(h.messages[0]);
  const send = value => h.target.dispatchEvent(new CustomEvent('toonhqplus-native-message', { detail: typeof value === 'string' ? value : JSON.stringify(value) }));
  send('{bad json'); send({ ...stateMessage, client: 'another-client', sequence: 100 });
  send({ ...stateMessage, sequence: 0 });
  send({ ...stateMessage, sequence: 2, state: { ...stateMessage.state, ownedToons: [null] } });
  assert.equal(h.client.state.context, original);
  const before = h.messages.length;
  send({ ...stateMessage, sequence: 4, full: false }); await h.flush();
  assert.ok(h.messages.length > before, 'a sequence gap asks for a local snapshot');
  assert.equal(h.forbidden.length, 0);
});

test('client timeout and disposal reject pending checks and remove local listeners', async t => {
  const h = setup(t);
  await assert.rejects(h.client.requestBoarding(1, 5), /in time/);
  const pending = assert.rejects(h.client.requestBoarding(2), /closed/);
  h.client.dispose(); await pending;
});

test('a late isolated-world consumer recovers buffered snapshots without HTTP', async t => {
  const h = setup(t);
  const changed = group(20);
  h.commit('setActiveGroups', [changed], state => { state.groups.groups[20] = changed; state.groups.activeGroups = [20]; });
  await h.flush();
  const late = createNativeBridgeClient(h.target, 'late-consumer'); t.after(() => late.dispose());
  late.requestSnapshot();
  const updates = []; late.subscribe(update => updates.push(update));
  assert.equal(updates[0].groups[0].id, 20);
  assert.equal(h.forbidden.length, 0);
});

test('invalid schema and oversized page data fail closed, then recover with a full snapshot', async t => {
  const h = setup(t);
  h.commit('addOrUpdateGroup', { id: 10 }, state => { state.groups.groups[10].members = Array(129).fill(state.groups.groups[10].members[0]); });
  await h.flush(); assert.equal(h.client.state.available, false);
  assert.equal(h.client.state.connected, false);
  h.commit('setActiveGroups', [], state => { state.groups.groups[10] = group(); });
  await h.flush(); assert.equal(h.client.state.connected, true);
  h.target.dispatchEvent(new CustomEvent('toonhqplus-native-message', { detail: 'x'.repeat(4_000_001) }));
  assert.equal(h.client.state.connected, true);
  assert.equal(h.forbidden.length, 0);
});

test('one failing extension callback cannot stop other native state consumers', async t => {
  const h = setup(t); let delivered = 0;
  let fail = false;
  h.client.subscribe(() => { if (fail) throw new Error('consumer error'); });
  h.client.subscribe(() => { delivered++; });
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  fail = true;
  h.commit('switchToon', null, state => { state.accounts.currentToon = 2; }); await h.flush();
  assert.equal(delivered, 2); assert.equal(h.client.state.currentToonId, '2');
});

test('invalid high-sequence packets do not poison subsequent legitimate state updates', async t => {
  const h = setup(t); const packet = clone(h.messages[0]);
  h.target.dispatchEvent(new CustomEvent('toonhqplus-native-message', { detail: JSON.stringify({
    ...packet, sequence: 99999, state: { ...packet.state, ownedToons: [null] },
  }) }));
  h.commit('switchToon', null, state => { state.accounts.currentToon = 2; }); await h.flush();
  assert.equal(h.client.state.currentToonId, '2');
});

test('repeated injection and 1000 native updates keep one listener owner and bounded timers', async t => {
  const h = setup(t);
  for (let index = 0; index < 25; index++) {
    h.inject(); h.client.requestSnapshot(); await h.flush();
    assert.equal(h.children.size, 1); assert.equal(h.watchers.size, 1); assert.equal(h.subscribers.size, 1);
    assert.equal(h.timers.size, 1);
  }
  for (let index = 0; index < 1000; index++) {
    h.commit('addOrUpdateGroup', { id: 10 }, state => { state.groups.groups[10].district = index % 2 ? 21 : 30; });
    await h.flush();
  }
  assert.equal(h.client.state.connected, true);
  assert.equal(h.children.size, 1); assert.equal(h.timers.size, 1);
  assert.equal(h.nativeRequests.length, 0); assert.equal(h.forbidden.length, 0);
  h.client.dispose(); assert.equal(h.children.size, 0); assert.equal(h.timers.size, 0);
});

test('runtime passive paths contain no ToonHQ socket, bootstrap fetch or automatic status checks', () => {
  const index = readFileSync(new URL('../entrypoints/sidebar.content/index.tsx', import.meta.url), 'utf8');
  const boarding = readFileSync(new URL('../entrypoints/sidebar.content/boardingStatus.ts', import.meta.url), 'utf8');
  const quickTeleport = readFileSync(new URL('../entrypoints/sidebar.content/QuickTeleport.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /WebSocket|socket_auth|api\/groups\/list/);
  assert.doesNotMatch(boarding, /pageFetch|fetch\(|WebSocket|boarding_request|nextNonce/);
  assert.doesNotMatch(quickTeleport, /api\/toons\/|AUTO_BOARDING_CHECK|loadTtrToons/);
});
