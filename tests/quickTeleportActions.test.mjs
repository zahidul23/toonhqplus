import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { harness } from './helpers/nativeBridgeHarness.mjs';
import { createBoardingStatusService } from '../entrypoints/sidebar.content/boardingStatus.ts';

const source = readFileSync(new URL('../entrypoints/sidebar.content/QuickTeleport.tsx', import.meta.url), 'utf8');
const actions = ts.transpileModule(`(() => {
  ${source.slice(source.indexOf('  const isCurrentToonContext'), source.indexOf('  if (!preferencesLoaded) return null;'))}
  return { refreshLocation, teleport };
})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function setup(t) {
  const h = harness(), service = createBoardingStatusService(h.client), view = {}, timers = [], requests = [];
  const active = { current: true };
  t.after(() => { active.current = false; service.dispose(); h.close(); });
  const handlers = vm.runInNewContext(actions, {
    nativeState: h.client.state, getNativeBridge: () => h.client, quickTeleportActiveRef: active,
    toonId: '1', districtId: '21', busy: false, checkingStatus: false, refreshCooldown: 0,
    toonIsOffline: false, hasActiveBoardingGroup: false, autoDelist: true,
    selectedToon: { sellbot: '13' }, destinationIndex: 0,
    DESTINATIONS: [{ suitKey: 'sellbot', type: 3, location: 23, options: {}, maxPlayers: 8 }],
    getDestinationFullName: () => 'VP', getToonSuitLevel: () => 13, getCsrfToken: () => 'test-token',
    LOCATION_REFRESH_COOLDOWN_SECONDS: 10, TELEPORT_VERIFICATION_DELAY_MS: 10000,
    districts: [], coreData: { locations: [] }, describeBoardingStatus: result => `district ${result?.district}`,
    getBoardingGroupStatus: (id, force) => service.get(id, force),
    setStatus: value => { view.status = value; }, setBoardingStatus: value => { view.boarding = value; },
    setDistrictId: value => { view.district = value; }, setCheckingStatus: value => { view.checking = value; },
    setRefreshCooldown: value => { view.cooldown = value; }, setBusy: value => { view.busy = value; },
    window: { location: { origin: 'https://toonhq.org' }, setTimeout: callback => { timers.push(callback); } },
    URL, pageFetch: async url => { requests.push(url); return { ok: true, json: async () => ({ id: 42 }) }; },
  });
  const switchToon = async () => {
    h.commit('switchToon', 2, state => { state.accounts.currentToon = 2; }); await h.flush();
    view.status = 'New Toon status'; view.checking = true;
  };
  return { ...h, ...handlers, service, view, timers, requests, active, switchToon };
}

test('manual refresh cannot overwrite the next Toon status or stop its loading indicator', async t => {
  const h = setup(t), refresh = h.refreshLocation();
  await h.switchToon(); await refresh;
  assert.equal(h.view.status, 'New Toon status');
  assert.equal(h.view.checking, true);
  assert.equal(h.view.boarding, undefined);
});

test('manual refresh finishing after unmount does not update the closed UI', async t => {
  const h = setup(t), refresh = h.refreshLocation();
  h.active.current = false;
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 30 } });
  await refresh;
  assert.equal(h.view.status, 'Refreshing location...');
  assert.equal(h.view.boarding, undefined);
  assert.equal(h.service.getCached(1).district, 30);
});

test('switching Toons during the teleport delay skips stale verification and retains the new status', async t => {
  const h = setup(t), teleport = h.teleport();
  await h.flush(); assert.equal(h.timers.length, 1); assert.equal(h.requests.length, 2);
  await h.switchToon(); h.timers.shift()(); await teleport;
  assert.equal(h.nativeRequests.length, 0);
  assert.equal(h.view.status, 'New Toon status');
  assert.equal(h.view.busy, false);
});

test('switching Toons during teleport verification suppresses the stale error', async t => {
  const h = setup(t), teleport = h.teleport();
  await h.flush(); h.timers.shift()(); await h.flush();
  assert.equal(h.nativeRequests.length, 1);
  await h.switchToon(); await teleport;
  assert.equal(h.view.status, 'New Toon status');
  assert.equal(h.view.boarding, undefined);
  assert.equal(h.view.busy, false);
});

test('teleport completes normally when the connected Toon context is unchanged', async t => {
  const h = setup(t), teleport = h.teleport();
  await h.flush(); h.timers.shift()(); await h.flush();
  h.emit('boarding_response', { nonce: 1, success: true, result: { district: 21, type: 3 } });
  await teleport;
  assert.match(h.view.status, /in-game boarding group is active/);
  assert.equal(h.view.boarding.type, 3);
  assert.equal(h.view.busy, false);
  assert.equal(h.requests.length, 2);
});
