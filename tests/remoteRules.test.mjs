import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRemoteDamageStars, getRemoteDamage, wakeRemoteControlledCog } from '../entrypoints/sidebar.content/remoteRules.ts';

test('damage remotes allow repeats and mixed tiers up to three total', () => {
  let selected = changeRemoteDamageStars([], 3, 1);
  selected = changeRemoteDamageStars(selected, 3, 1);
  selected = changeRemoteDamageStars(selected, 1, 1);
  assert.deepEqual(selected, [3, 3, 1]);
  assert.equal(getRemoteDamage(selected, 3), 375);
  assert.deepEqual(changeRemoteDamageStars(selected, 2, 1), selected);
  assert.deepEqual(changeRemoteDamageStars(selected, 3, -1), [3, 1]);
  assert.deepEqual(changeRemoteDamageStars(selected, 2, -1), selected);
  assert.equal(getRemoteDamage([2, 2, 2], null), 180);
});

test('remote damage uses the selected star values and optional self damage', () => {
  assert.equal(getRemoteDamage([], null), 0);
  for (const [stars, damage, selfDamage] of [[1, 45, 45], [2, 60, 90], [3, 90, 150]]) {
    assert.equal(getRemoteDamage([stars], null), damage);
    assert.equal(getRemoteDamage([], stars), selfDamage);
  }
  assert.equal(getRemoteDamage([1, 2, 3], 3), 345);
  assert.equal(getRemoteDamage([1, 3], 2), 225);
});

test('a remote-controlled Cog wakes from Lure at the end of its round', () => {
  const cog = { isLured: true, lureDuration: 4 };
  wakeRemoteControlledCog(cog);
  assert.deepEqual(cog, { isLured: false, lureDuration: 0 });
});
