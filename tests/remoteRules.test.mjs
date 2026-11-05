import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRemoteDamageStars, clearRemoteIfDestroyed, getRemoteDamage, wakeRemoteControlledCog } from '../entrypoints/sidebar.content/remoteRules.ts';

test('damage remotes allow repeats and mixed tiers up to three total', () => {
  let selected = changeRemoteDamageStars([], 3, 1);
  selected = changeRemoteDamageStars(selected, 3, 1);
  selected = changeRemoteDamageStars(selected, 1, 1);
  assert.deepEqual(selected, [3, 3, 1]);
  assert.equal(getRemoteDamage(selected, 3), 345);
  assert.deepEqual(changeRemoteDamageStars(selected, 2, 1), selected);
  assert.deepEqual(changeRemoteDamageStars(selected, 3, -1), [3, 1]);
  assert.deepEqual(changeRemoteDamageStars(selected, 2, -1), selected);
  assert.equal(getRemoteDamage([2, 2, 2], null), 180);
});

test('remote damage uses the selected star values and optional self damage', () => {
  assert.equal(getRemoteDamage([], null), 0);
  for (const [stars, damage, selfDamage] of [[1, 45, 45], [2, 60, 90], [3, 75, 150]]) {
    assert.equal(getRemoteDamage([stars], null), damage);
    assert.equal(getRemoteDamage([], stars), selfDamage);
  }
  assert.equal(getRemoteDamage([1, 2, 3], 3), 330);
  assert.equal(getRemoteDamage([1, 3], 2), 210);
});

test('a remote-controlled Cog wakes from Lure at the end of its round', () => {
  const cog = { isLured: true, lureDuration: 4 };
  wakeRemoteControlledCog(cog);
  assert.deepEqual(cog, { isLured: false, lureDuration: 0 });
});

// Mirrors the layer-break step in CogCalculator's round simulation: damage that
// meets the current layer's remaining HP removes one layer, and the remote is
// only cleared through clearRemoteIfDestroyed.
function applyLayerDamage(cog, state, damage) {
  const remainingHpOnLayer = state.maxHp - state.damageOnCurrentLayer;
  if (damage >= remainingHpOnLayer) {
    state.layer -= 1;
    state.damageOnCurrentLayer = 0;
    clearRemoteIfDestroyed(cog, state.layer);
  } else {
    state.damageOnCurrentLayer += damage;
  }
}

const remoteCog = (overrides = {}) => ({
  remote: { roundsLeft: 3, damageToOthers: 60, damageOnExpire: 90 },
  isRemoteDmg: true,
  isRemoteHeal: false,
  ...overrides,
});

test('clearRemoteIfDestroyed keeps the remote while any layer is left', () => {
  const cog = remoteCog();
  clearRemoteIfDestroyed(cog, 1);
  assert.deepEqual(cog.remote, { roundsLeft: 3, damageToOthers: 60, damageOnExpire: 90 });
  assert.equal(cog.isRemoteDmg, true);
});

test('clearRemoteIfDestroyed removes the remote and both status flags at zero layers', () => {
  const cog = remoteCog({ isRemoteDmg: false, isRemoteHeal: true });
  clearRemoteIfDestroyed(cog, 0);
  assert.deepEqual(cog, { remote: undefined, isRemoteDmg: false, isRemoteHeal: false });
});

test('a v2.0 Cog keeps its remote when Toon damage breaks only its outer shell', () => {
  const cog = remoteCog();
  const state = { maxHp: 156, layer: 2, damageOnCurrentLayer: 0 };
  applyLayerDamage(cog, state, 200); // more than one layer of damage still only breaks one
  assert.equal(state.layer, 1);
  assert.equal(cog.remote.roundsLeft, 3);
  assert.equal(cog.isRemoteDmg, true);
});

test('a v2.0 Cog keeps its remote when another remote breaks its outer shell', () => {
  const cog = remoteCog();
  const state = { maxHp: 56, layer: 2, damageOnCurrentLayer: 10 };
  applyLayerDamage(cog, state, 60); // 3-star remote splash from a neighbour
  assert.equal(state.layer, 1);
  assert.ok(cog.remote);
});

test('a remote Cog still loses its remote when it is destroyed', () => {
  const v2 = remoteCog();
  const v2State = { maxHp: 56, layer: 2, damageOnCurrentLayer: 0 };
  applyLayerDamage(v2, v2State, 56); // break shell
  applyLayerDamage(v2, v2State, 56); // destroy inner Cog
  assert.equal(v2State.layer, 0);
  assert.equal(v2.remote, undefined);
  assert.equal(v2.isRemoteDmg, false);

  const regular = remoteCog();
  const regularState = { maxHp: 56, layer: 1, damageOnCurrentLayer: 0 };
  applyLayerDamage(regular, regularState, 56);
  assert.equal(regularState.layer, 0);
  assert.equal(regular.remote, undefined);
});

test('damage that does not break a layer leaves the remote alone', () => {
  const cog = remoteCog();
  const state = { maxHp: 156, layer: 2, damageOnCurrentLayer: 0 };
  applyLayerDamage(cog, state, 155);
  assert.equal(state.layer, 2);
  assert.equal(state.damageOnCurrentLayer, 155);
  assert.ok(cog.remote);
});

test('a heal remote is kept through a shell break the same way', () => {
  const cog = remoteCog({ isRemoteDmg: false, isRemoteHeal: true, remote: { roundsLeft: 2, damageToOthers: 0, damageOnExpire: 45 } });
  const state = { maxHp: 56, layer: 2, damageOnCurrentLayer: 0 };
  applyLayerDamage(cog, state, 80);
  assert.equal(state.layer, 1);
  assert.equal(cog.isRemoteHeal, true);
  assert.equal(cog.remote.roundsLeft, 2);
});
