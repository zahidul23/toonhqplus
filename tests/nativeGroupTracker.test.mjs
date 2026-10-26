import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeGroupTracker } from '../entrypoints/sidebar.content/nativeGroupTracker.ts';
import { harness, group, toon, clone } from './helpers/nativeBridgeHarness.mjs';
import { readFileSync } from 'node:fs';

function setup(t, options) {
  const h = harness(options); const groups = {}, ownedToons = {}, toons = {}, calls = [], errors = [];
  let fail = false;
  const record = name => async value => {
    if (fail) { fail = false; throw new Error('database temporarily unavailable'); }
    calls.push({ name, value: clone(value) });
  };
  const tracker = createNativeGroupTracker({ groups, ownedToons, toons, hash: name => `#${name}`,
    persistence: { putToons: record('toons'), putGroup: record('group'), putGroupMembers: record('members'),
      deleteGroup: record('delete'), setActiveToonIds: record('owned') },
    onChanged() {}, onError(error) { errors.push(error); },
  });
  const stop = h.client.subscribe(tracker.apply);
  t.after(() => { stop(); tracker.dispose(); h.close(); });
  return { ...h, tracker, groups, ownedToons, toons, calls, errors, failNext() { fail = true; },
    settle: async () => { await h.flush(); await tracker.settled(); },
  };
}

test('native bootstrap persists owned Toons, group history and members without mutating page data', async t => {
  const h = setup(t); await h.settle();
  assert.deepEqual(Object.keys(h.groups), ['10']);
  assert.equal(h.groups[10].members[0].toon.id, '1');
  assert.equal(h.store.state.groups.groups[10].members[0].toon.id, 1);
  assert.equal(h.store.state.groups.groups[10].members[0].toon.hashId, undefined);
  assert.equal(h.toons['1'].hashId, '#Toon 1');
  assert.deepEqual(h.calls.find(call => call.name === 'owned').value, ['1', '2']);
  assert.equal(h.calls.find(call => call.name === 'group').value.groupId, 10);
  assert.equal(h.calls.find(call => call.name === 'members').value.length, 3);
});

test('long-running group history persists owned Toons and members beyond record 128', async t => {
  const value = group(10, 134);
  value.members.forEach((member, index) => {
    member.toon = toon(200 + index);
    member.left = index < 3 ? null : 'left-earlier';
  });
  value.members[133].toon = toon(1);
  const h = setup(t, { groups: [value] }); await h.settle();
  assert.equal(h.groups[10].members.length, 134);
  assert.equal(h.calls.find(call => call.name === 'members').value[133].toonId, '1');
  assert.equal(h.calls.find(call => call.name === 'members').value.length, 134);
  assert.equal(h.toons['333'], undefined);
  assert.equal(h.toons['332'].name, 'Toon 332');
  h.commit('archiveGroup', 10, state => {
    state.groups.groups[10].members.forEach(member => { member.left = 'closed'; });
    state.groups.activeGroups = [];
  });
  await h.settle();
  const saved = h.calls.filter(call => call.name === 'members').at(-1).value;
  assert.equal(saved.length, 134);
  assert.ok(saved.every(member => member.left === 'closed'));
  assert.deepEqual(h.groups, {});
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.forbidden, []);
});

test('snapshot replay deduplicates persistence and keeps unfiltered groups', async t => {
  const h = setup(t); await h.settle();
  const count = h.calls.length;
  h.client.requestSnapshot(); await h.settle();
  assert.equal(h.calls.length, count);
  assert.equal(Object.keys(h.groups).length, 1);
});

test('joins, leaves and partial updates persist processed member history in order', async t => {
  const h = setup(t); await h.settle();
  const member = { id: 104, group: 10, joined: 'joined-later', left: null, toon: toon(4) };
  h.commit('addOrUpdateGroupMember', { member }, state => state.groups.groups[10].members.push(member));
  await h.settle();
  h.commit('removeGroupMember', { id: 104, group: 10 }, state => { state.groups.groups[10].members.at(-1).left = 'left-later'; });
  await h.settle();
  h.commit('addOrUpdateGroup', { id: 10, options: { 3: 11 } }, state => { state.groups.groups[10].options = { 3: 11 }; });
  await h.settle();
  const writes = h.calls.filter(call => call.name === 'members');
  assert.equal(writes.at(-2).value.at(-1).left, 'left-later');
  assert.equal(writes.at(-1).value.at(-1).left, 'left-later');
  assert.deepEqual(h.calls.filter(call => call.name === 'group').at(-1).value.options, { 3: 11 });
});

test('history keeps recording members while a group modal is open', async t => {
  const h = setup(t); await h.settle(); const context = h.client.state.context;
  h.target.location.pathname = '/groups/10/'; h.mutateDom(); await h.settle();
  assert.equal(h.client.state.context, context); assert.deepEqual(Object.keys(h.groups), ['10']);
  const member = { id: 104, group: 10, joined: 'joined-in-modal', left: null, toon: toon(4) };
  h.commit('addOrUpdateGroupMember', { member }, state => state.groups.groups[10].members.push(member)); await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'members').at(-1).value.at(-1).joined, 'joined-in-modal');
  h.commit('removeGroupMember', { id: 104, group: 10 }, state => { state.groups.groups[10].members.at(-1).left = 'left-in-modal'; }); await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'members').at(-1).value.at(-1).left, 'left-in-modal');
  const count = h.calls.length;
  h.target.location.pathname = '/groups/'; h.mutateDom(); await h.settle();
  assert.equal(h.calls.length, count); assert.equal(h.client.state.context, context);
  assert.equal(h.nativeRequests.length, 0); assert.equal(h.forbidden.length, 0);
});

test('anonymous public Toons are cached without creating user history', async t => {
  const h = setup(t, { authenticated: false }); await h.settle();
  assert.ok(h.toons['1']);
  assert.equal(h.calls.filter(call => call.name === 'group').length, 0);
  assert.deepEqual(h.ownedToons, {});
});

test('SPA login starts history for already-known groups and logout clears only active ownership', async t => {
  const h = setup(t, { authenticated: false }); await h.settle();
  h.commit('setAuth', null, state => { state.accounts.user = { id: 5 }; state.accounts.toons = { 1: toon() }; state.accounts.currentToon = 1; });
  await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'group').length, 1);
  h.commit('logout', null, state => { state.accounts.user = null; state.accounts.toons = {}; state.accounts.currentToon = null; });
  await h.settle(); assert.deepEqual(h.ownedToons, {});
  assert.deepEqual(h.calls.filter(call => call.name === 'owned').at(-1).value, []);
  assert.equal(h.calls.filter(call => call.name === 'delete').length, 0);
});

test('adding an owned Toon updates history for unchanged groups without a new list request', async t => {
  const value = group(20, 1); value.members[0].toon = toon(3);
  const h = setup(t, { groups: [value] }); await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'group').length, 0);
  h.commit('setToons', null, state => { state.accounts.toons[3] = toon(3); }); await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'group').length, 1);
  assert.equal(h.nativeRequests.length, 0);
});

test('native resync replaces active groups without deleting existing saved history', async t => {
  const h = setup(t); await h.settle();
  h.commit('setActiveGroups', [group(20)], state => { state.groups.groups[20] = group(20); state.groups.activeGroups = [20]; });
  await h.settle(); assert.deepEqual(Object.keys(h.groups), ['20']);
  assert.equal(h.calls.filter(call => call.name === 'delete').length, 0);
});

test('large-group disband records all native leave times once', async t => {
  const h = setup(t); await h.settle();
  const disband = () => h.commit('archiveGroup', 10, state => { state.groups.groups[10].members.forEach(member => { member.left = 'closed'; }); state.groups.activeGroups = []; });
  disband(); await h.settle();
  assert.deepEqual(h.groups, {});
  assert.ok(h.calls.filter(call => call.name === 'members').at(-1).value.every(member => member.left === 'closed'));
  const count = h.calls.length; disband(); await h.settle(); assert.equal(h.calls.length, count);
});

test('short-lived groups are deleted after pending writes, never recreated by a late join', async t => {
  const h = setup(t, { groups: [group(10, 2)] });
  h.commit('archiveGroup', 10, state => { state.groups.groups[10].members.forEach(member => { member.left = 'closed'; }); state.groups.activeGroups = []; });
  await h.settle();
  assert.equal(h.calls.at(-1).name, 'delete'); assert.equal(h.calls.at(-1).value, 10);
  assert.deepEqual(h.groups, {});
});

test('CC transitions and disconnected snapshots cannot pollute TTR history', async t => {
  const h = setup(t); await h.settle(); const count = h.calls.length;
  h.target.location.pathname = '/cc/groups/';
  h.commit('gameChanged', 2, state => { state.core.game = 2; state.socket.rooms.groups.game = 2; state.groups.groups = { 20: { ...group(20), game: 2 } }; state.groups.activeGroups = [20]; });
  await h.settle(); assert.deepEqual(h.groups, {}); assert.equal(h.calls.length, count);
  assert.deepEqual(h.forbidden, []);
});

test('database failures are reported and do not prevent later state persistence', async t => {
  const h = setup(t); await h.settle(); h.failNext();
  h.commit('addOrUpdateGroup', { id: 10 }, state => { state.groups.groups[10].district = 21; });
  await h.settle(); assert.equal(h.errors.length, 1);
  h.client.requestSnapshot(); await h.settle();
  assert.equal(h.calls.filter(call => call.name === 'members').at(-1).value.length, 3);
});

test('local copies support missing public Toon IDs and persist stable hash identities', async t => {
  const value = group(); delete value.members[2].toon.id;
  const h = setup(t, { groups: [value] }); await h.settle();
  assert.equal(h.groups[10].members[2].toon.id, '#Toon 3');
  assert.equal(h.calls.find(call => call.name === 'members').value[2].toonId, '#Toon 3');
});

test('disposed tracking ignores future native updates', async t => {
  const h = setup(t); await h.settle(); h.tracker.dispose(); const count = h.calls.length;
  h.commit('addOrUpdateGroup', { id: 10 }, state => { state.groups.groups[10].district = 21; });
  await h.settle(); assert.equal(h.calls.length, count); assert.deepEqual(h.groups, {});
});

test('the saved 20-minute public capture replays group/member changes without extra networking', async t => {
  const rows = readFileSync(new URL('../docs/captures/toonhq-groups-2026-08-21-20min.jsonl', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).map(JSON.parse);
  const initial = rows.find(row => row.kind === 'initial_groups').body.groups;
  const h = setup(t, { groups: initial, authenticated: false });
  await h.settle();
  let processed = 0;
  for (const row of rows) {
    if (row.kind !== 'socket_event') continue;
    const data = clone(row.data), native = h.store.state.groups;
    if (row.event === 'group_created') {
      h.commit('addOrUpdateGroup', data, () => { native.groups[data.id] = data; if (!native.activeGroups.includes(data.id)) native.activeGroups.push(data.id); });
    } else if (row.event === 'group_updated' && native.groups[data.id]) {
      h.commit('addOrUpdateGroup', data, () => { native.groups[data.id] = { ...native.groups[data.id], ...data }; });
    } else if (row.event === 'member_joined' && native.groups[data.group]) {
      h.commit('addOrUpdateGroupMember', { member: data }, () => {
        const members = native.groups[data.group].members, index = members.findIndex(member => member.id === data.id);
        if (index < 0) members.push(data); else members[index] = data;
      });
    } else if (row.event === 'member_left' && native.groups[data.group]) {
      h.commit('removeGroupMember', data, () => {
        const member = native.groups[data.group].members.find(member => member.id === data.id);
        if (member) member.left = row.captured_at;
      });
    } else if (row.event === 'group_disbanded' && native.groups[data.id]) {
      h.commit('archiveGroup', data.id, () => {
        native.groups[data.id].members.forEach(member => { member.left = row.captured_at; });
        native.activeGroups = native.activeGroups.filter(id => id !== data.id);
      });
    } else continue;
    processed++;
    await h.settle();
    assert.deepEqual(Object.keys(h.groups).map(Number).sort((a, b) => a - b), [...native.activeGroups].sort((a, b) => a - b));
    for (const id of native.activeGroups) {
      const actual = h.groups[id], expected = native.groups[id];
      assert.equal(actual.type, expected.type);
      assert.equal(actual.members.length, expected.members.length);
      assert.deepEqual(actual.members.map(member => [member.id, member.left, member.toon?.name]),
        expected.members.map(member => [member.id, member.left, member.toon?.name]));
    }
  }
  assert.equal(processed, 685, 'replay every applicable group/member event for groups present in the captured state');
  assert.deepEqual(h.errors, []); assert.deepEqual(h.forbidden, []); assert.equal(h.nativeRequests.length, 0);
});

test('late events for retained native archives do not resurrect an active group', async t => {
  const h = setup(t); await h.settle();
  h.commit('archiveGroup', 10, state => { state.groups.groups[10].members.forEach(member => { member.left = 'closed'; }); state.groups.activeGroups = []; });
  await h.settle(); const count = h.calls.length;
  h.commit('removeGroupMember', { id: 101, group: 10 }, state => { state.groups.groups[10].members[1].left = 'late'; });
  await h.settle(); assert.deepEqual(h.groups, {}); assert.equal(h.calls.length, count);
});

test('disband and full resync in the same turn preserve final member leave times', async t => {
  const h = setup(t); await h.settle();
  h.commit('archiveGroup', 10, state => { state.groups.groups[10].members.forEach(member => { member.left = 'closed'; }); state.groups.activeGroups = []; });
  h.commit('setActiveGroups', [], state => { state.groups.activeGroups = []; });
  await h.settle(); assert.deepEqual(h.groups, {});
  assert.ok(h.calls.filter(call => call.name === 'members').at(-1).value.every(member => member.left === 'closed'));
});

test('native game closure preserves final member leave times without individual archive mutations', async t => {
  const h = setup(t); await h.settle();
  h.commit('updateGameOpen', false, state => {
    state.groups.groups[10].members.forEach(member => { member.left = 'game-closed'; });
    state.groups.activeGroups = [];
  });
  await h.settle();
  assert.deepEqual(h.groups, {});
  assert.ok(h.calls.filter(call => call.name === 'members').at(-1).value.every(member => member.left === 'game-closed'));
});

test('a temporary oversized publish does not lose the final archive history', async t => {
  const h = setup(t, { groups: [group(10), group(20)] }); await h.settle();
  h.commit('addOrUpdateGroup', { id: 10 }, state => {
    state.groups.groups[10] = group(10, 300);
    state.groups.groups[10].members.forEach(member => { member.toon.name = 'x'.repeat(16384); });
  });
  h.commit('archiveGroup', 20, state => {
    state.groups.groups[20].members.forEach(member => { member.left = 'closed-during-gap'; });
    state.groups.activeGroups = [10];
  });
  await h.settle();
  assert.deepEqual(h.groups, {});
  h.store.state.groups.groups[10] = group(10);
  h.mutateDom(); await h.settle();
  const saved = h.calls.filter(call => call.name === 'members' && call.value[0].groupId === 20).at(-1).value;
  assert.ok(saved.every(member => member.left === 'closed-during-gap'));
  assert.deepEqual(Object.keys(h.groups), ['10']);
});
