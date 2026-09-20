import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDefenseUp } from '../entrypoints/sidebar.content/facilityDamage.ts';

test('Defense Up reduces Trap base damage by 25 percent', () => {
  assert.equal(applyDefenseUp(200, true, false, 'trap'), 150);
  assert.equal(applyDefenseUp(21, true, false, 'trap'), 15);
});

test('Defense Up consistently reduces every damaging gag track', () => {
  for (const track of ['trap', 'sound', 'throw', 'squirt', 'drop', 'special']) {
    assert.equal(applyDefenseUp(100, true, false, track), 75, track);
  }
});

test('Defense Up does not alter Lure or the Foreman itself', () => {
  assert.equal(applyDefenseUp(100, true, false, 'lure'), 100);
  assert.equal(applyDefenseUp(100, true, true, 'trap'), 100);
  assert.equal(applyDefenseUp(100, false, false, 'trap'), 100);
});
