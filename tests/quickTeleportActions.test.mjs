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

function setup(t, overrides = {}) {
  const h = harness(), service = createBoardingStatusService(h.client), view = {}, timers = [], requests = [];
  const active = { current: true };
  t.after(() => { active.current = false; service.dispose(); h.close(); });
  const handlers = vm.runInNewContext(actions, {
    nativeState: h.client.state, getNativeBridge: () => h.client, quickTeleportActiveRef: active,
    toonId: '1', districtId: '21', busy: false, checkingStatus: false, refreshCooldown: 0,
    boardingStatus: { district: 21 }, toonIsOffline: false, hasActiveBoardingGroup: false, inListedGroup: false, setInListedGroup: () => {},
    selectedToon: { sellbot: '13' }, destinationIndex: 0,
    DESTINATIONS: [{ suitKey: 'sellbot', type: 3, location: 23, options: {}, maxPlayers: 8 }],
    getDestinationFullName: () => 'VP', getToonSuitLevel: () => 13, getCsrfToken: () => 'test-token',
    LOCATION_REFRESH_COOLDOWN_SECONDS: 10, TELEPORT_VERIFICATION_DELAY_MS: 10000,
    districts: [], coreData: { locations: [] }, describeBoardingStatus: result => `district ${result?.district}`,
    getBoardingGroupStatus: (id, force) => service.get(id, force),
    setStatus: value => { view.status = value; }, showNotice: value => { view.status = value; }, setBoardingStatus: value => { view.boarding = value; },
    setDistrictId: value => { view.district = value; }, setCheckingStatus: value => { view.checking = value; },
    setRefreshCooldown: value => { view.cooldown = value; }, setBusy: value => { view.busy = value; }, setListing: () => {},
    window: { location: { origin: 'https://toonhq.org' }, setTimeout: callback => { timers.push(callback); } },
    URL, pageFetch: async url => { requests.push(url); return { ok: true, json: async () => ({ id: 42 }) }; },
    ...overrides,
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
  assert.equal(h.view.status, 'Refreshing location…');
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

test('List on HQ creates the group without delisting or waiting on the Toon location', async t => {
  const h = setup(t, { toonIsOffline: true, checkingStatus: true, getBoardingGroupStatus: async () => null });
  await h.teleport(false);
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0], /\/api\/groups\/create\/$/);
  assert.equal(h.timers.length, 0);
  assert.match(h.view.status, /now listed on ToonHQ/);
  assert.equal(h.view.busy, false);
});

test('neither action creates a group while the Toon is already in a ToonHQ group', async t => {
  const h = setup(t, { inListedGroup: true });
  await h.teleport(true); await h.teleport(false);
  assert.equal(h.requests.length, 0);
});

test('Teleport Only waits until the Toon location is known', async t => {
  const h = setup(t, { boardingStatus: undefined });
  await h.teleport(true);
  assert.equal(h.requests.length, 0);
});

// The real lobby list and in-game helpers, so these tests cover the matching too.
const inGameHelpers = vm.runInNewContext(ts.transpileModule(`(() => {
  ${source.slice(source.indexOf('function getDestinationFullName'), source.indexOf('function getExtensionImageUrl'))}
  ${source.slice(source.indexOf('const DESTINATIONS'), source.indexOf('const TTR_DISTRICTS'))}
  ${source.slice(source.indexOf('type GroupFields'), source.indexOf('function getCsrfToken'))}
  return { getInGameGroup, getDestinationFullName, DESTINATIONS };
})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);

function listSetup(t, status, overrides = {}) {
  const bodies = [];
  const h = setup(t, {
    ...inGameHelpers, hasActiveBoardingGroup: !!status?.type,
    getBoardingGroupStatus: async () => status,
    pageFetch: async (url, init) => { h.requests.push(url); if (init?.body) bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ id: 42 }) }; },
    ...overrides,
  });
  return { ...h, bodies };
}

test('List on HQ lists the in-game boarding group instead of the picked lobby', async t => {
  // A Scrap Factory group with 2 Toons. Only the lister is counted: ToonHQ counts the other
  // member when they join, so holding a spot for them would count them twice.
  const h = listSetup(t, { district: 30, location: 23, type: 2, options: { 3: '10', 4: '12' }, num_players: 2 });
  await h.teleport(false);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.bodies[0], { toon: 1, type: 2, district: 30, location: 23, options: { 3: 10, 4: 12 },
    max_players: 4, num_players: 1, note: null, id: null, game: 1 });
  assert.match(h.view.status, /Scrap Factory group is now listed/);
  assert.equal(h.view.boarding.num_players, 2);
});

test('List on HQ lists the picked lobby when the Toon is not in an in-game group', async t => {
  const h = listSetup(t, { district: 29, location: null });
  await h.teleport(false);
  assert.equal(h.bodies[0].type, 3);
  assert.equal(h.bodies[0].district, 21);
});

test('List on HQ lists an in-game group without needing the picked lobby disguise', async t => {
  const h = listSetup(t, { district: 30, location: 4, type: 9, options: {}, num_players: 5 }, { getToonSuitLevel: () => 0 });
  await h.teleport(false);
  assert.equal(h.bodies[0].type, 9);
  assert.equal(h.bodies[0].num_players, 1);
});

test('List on HQ does not list when the in-game check fails or its details are unreadable', async t => {
  const failed = setup(t, { getBoardingGroupStatus: async () => { throw new Error('ToonHQ did not answer the boarding check in time.'); } });
  await failed.teleport(false);
  assert.equal(failed.requests.length, 0);
  assert.match(failed.view.status, /Couldn’t check your in-game group/);
  assert.equal(failed.view.busy, false);

  const unreadable = listSetup(t, { district: 30, location: 5, type: 4, options: { 7: 0 } });
  await unreadable.teleport(false);
  assert.equal(unreadable.requests.length, 0);
  assert.match(unreadable.view.status, /details/);
});
