import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardingStatusService } from '../entrypoints/sidebar.content/boardingStatus.ts';
import { harness } from './helpers/nativeBridgeHarness.mjs';

function setup(t) {
  const h = harness(); const service = createBoardingStatusService(h.client);
  t.after(() => { service.dispose(); h.close(); });
  return { ...h, service };
}

test('boarding service is passive until explicitly called and coalesces forced refreshes', async t => {
  const h = setup(t); await h.flush(); assert.equal(h.nativeRequests.length, 0);
  const first = h.service.get(1, true), second = h.service.get(1, true);
  assert.equal(first, second); assert.equal(h.nativeRequests.length, 1);
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } });
  assert.deepEqual(await first, { district: 21 });
  assert.deepEqual(await h.service.get(1), { district: 21 });
  assert.equal(h.nativeRequests.length, 1);
});

test('offline null is cached and explicit refresh performs exactly one new check', async t => {
  const h = setup(t); const first = h.service.get(1);
  h.emit('boarding_response', { nonce: 1, success: true, result: null });
  assert.equal(await first, null); assert.equal(await h.service.get(1), null);
  const second = h.service.get(1, true); assert.equal(h.nativeRequests.length, 2);
  h.emit('boarding_response', { nonce: 2, success: true, result: { district: 30 } });
  assert.equal((await second).district, 30);
});

test('failures cool down automatic repeats but an explicit retry remains possible', async t => {
  const h = setup(t); const failure = assert.rejects(h.service.get(1), /failed/);
  h.emit('boarding_response', { nonce: 1, success: false, message: 'failed' }); await failure;
  await assert.rejects(h.service.get(1), /failed/); assert.equal(h.nativeRequests.length, 1);
  const retry = h.service.get(1, true);
  h.emit('boarding_response', { nonce: 2, success: true, result: { district: 30 } });
  assert.equal((await retry).district, 30);
});

test('reconnect invalidates cached data and rejects an in-flight status result', async t => {
  const h = setup(t); const initial = h.service.get(1);
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21 } }); await initial;
  const pending = assert.rejects(h.service.get(2), /changed/);
  h.commit('setSid', 'new', state => { state.socket.sid = 'new'; }); await h.flush(); await pending;
  assert.equal(h.service.getCached(1), undefined);
  h.emit('boarding_response', { nonce: 2, success: true, result: { district: 99 } }); await h.flush();
  assert.equal(h.service.getCached(2), undefined);
});

test('native creation notifications populate the cache and dispose removes subscribers', async t => {
  const h = setup(t); const results = []; const stop = h.service.subscribe(value => results.push(value));
  h.emit('boarding_created', { district: 30, type: 3 });
  assert.equal(h.service.getCached(1).type, 3); assert.equal(results.length, 1);
  stop(); h.emit('boarding_created', { district: 21 }); assert.equal(results.length, 1);
  h.service.dispose(); h.emit('boarding_created', { district: 22 });
  assert.equal(h.service.getCached(1), undefined);
  await assert.rejects(h.service.get(1), /closed/);
});
