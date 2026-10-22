import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { harness, group, clone } from './helpers/nativeBridgeHarness.mjs';
import { createNativeGroupTracker } from '../entrypoints/sidebar.content/nativeGroupTracker.ts';
import { getNativeBridge } from '../entrypoints/sidebar.content/nativeBridge.ts';
import { isToonHqAuthenticated, getToonHqOwnedToons, getToonHqActiveToonId } from '../entrypoints/sidebar.content/toonHqPageState.ts';

const source = readFileSync(new URL('../entrypoints/sidebar.content/index.tsx', import.meta.url), 'utf8');
const marker = '  async main(ctx) {';
const start = source.indexOf(marker) + marker.length;
// Execute the production startup wiring before its first asynchronous operation.
const startup = source.slice(start, source.indexOf('    injectHighlightStyles();', start));
const compiled = ts.transpileModule(`(async function(ctx) { ${startup}
  capture(historyTracker);
  await migration;
  if (ctx.isInvalid) return;
  releaseHistory();
})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

for (const scheme of ['chrome-extension', 'moz-extension']) {
  test(`${scheme}: early observation preserves transient history while database migration is pending`, async t => {
    const h = harness(); t.after(() => h.close());
    let finishMigration, tracker, script;
    const migration = new Promise(resolve => { finishMigration = resolve; });
    const calls = [], callbacks = [], ctx = { isInvalid: false, onInvalidated(fn) { callbacks.push(fn); } };
    const record = name => async value => { calls.push({ name, value: clone(value) }); };
    const document = {
      createElement() { return { remove() {} }; },
      documentElement: { appendChild(value) { script = value; } },
    };
    const context = {
      getNativeBridge: () => h.client, createNativeGroupTracker, document,
      browser: { runtime: { getURL: path => `${scheme}://test/${path}` } },
      groupsState: {}, activeToons: {}, toons: {},
      generateToonHash: name => `#${name}`, applyCurrentGroupHighlights() {},
      putToons: record('toons'), putGroup: record('group'), putGroupMembers: record('members'), deleteGroup: record('delete'),
      setSetting: async (key, value) => calls.push({ name: key, value }), disposeBoardingStatus() {},
      migration, capture(value) { tracker = value; }, console,
    };
    const boot = vm.runInNewContext(compiled, context)(ctx);
    assert.equal(script.src, `${scheme}://test/native-bridge.js`); script.onload();
    const added = group(20);
    h.commit('addOrUpdateGroup', added, state => { state.groups.groups[20] = added; state.groups.activeGroups.push(20); }); await h.flush();
    h.commit('archiveGroup', 20, state => { state.groups.groups[20].members.forEach(member => { member.left = 'closed-during-startup'; }); state.groups.activeGroups = [10]; }); await h.flush();
    assert.equal(calls.length, 0, 'database work waits for migration');
    finishMigration(); await boot; await tracker.settled();
    assert.ok(calls.some(call => call.name === 'group' && call.value.groupId === 20));
    assert.ok(calls.filter(call => call.name === 'members').at(-1).value.every(member => member.left === 'closed-during-startup'));
    ctx.isInvalid = true; callbacks.forEach(fn => fn()); assert.equal(h.children.size, 0);
    assert.deepEqual(h.forbidden, []);
  });
}

test('live native account state overrides stale persisted login and Toon data', async t => {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage };
  const h = harness({ authenticated: false });
  globalThis.window = h.target;
  globalThis.localStorage = { getItem: () => JSON.stringify({ accounts: { user: { id: 99 }, currentToon: 99, toons: [{ id: 99 }] } }) };
  const bridge = getNativeBridge(); bridge.requestSnapshot();
  t.after(() => { bridge.dispose(); h.close(); globalThis.window = previous.window; globalThis.localStorage = previous.localStorage; });
  assert.equal(isToonHqAuthenticated(), false); assert.deepEqual(getToonHqOwnedToons(), []); assert.equal(getToonHqActiveToonId(), null);
  h.commit('setAuth', null, state => { state.accounts.user = { id: 5 }; state.accounts.toons = { 1: { id: 1, game: 1, external: true } }; state.accounts.currentToon = 1; });
  await h.flush(); assert.equal(isToonHqAuthenticated(), true); assert.equal(getToonHqActiveToonId(), '1');
  assert.equal(getToonHqOwnedToons()[0].id, 1); assert.equal(h.nativeRequests.length, 0);
});
