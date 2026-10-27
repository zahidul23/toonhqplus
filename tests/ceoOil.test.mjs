import test from 'node:test';
import assert from 'node:assert/strict';
import { CEO_OIL_HEALTH_OPTIONS, getCeoOilCanHealth } from '../entrypoints/sidebar.content/ceoOil.ts';

test('health-meter choices select the correct regular and 2.0 feeding stages', () => {
  assert.deepEqual(CEO_OIL_HEALTH_OPTIONS.map(option => [option.label, getCeoOilCanHealth(196, option)]), [
    ['None', 196], ['Orange', 127], ['Red', 49],
    ['Yellow 2.0', 147], ['Orange 2.0', 107], ['Red 2.0', 49],
  ]);
});

// Observed values from the September 2026 player research chart linked in ceoOil.ts.
test('regular CEO cleanup HP matches the oil-can chart', () => {
  for (const [, maxHp, one, two] of [
    [11, 156, 101, 39], [12, 196, 127, 49], [13, 224, 145, 56], [14, 254, 165, 63],
  ]) {
    assert.equal(getCeoOilCanHealth(maxHp), maxHp);
    assert.equal(getCeoOilCanHealth(maxHp, { cans: 1, vip: false }), one);
    assert.equal(getCeoOilCanHealth(maxHp, { cans: 2, vip: false }), two);
  }
});

test('VIP outer-layer cleanup HP matches every oil-can chart entry', () => {
  for (const [, maxHp, one, two, three] of [
    [11, 156, 117, 85, 39], [12, 196, 147, 107, 49],
    [13, 224, 168, 123, 56], [14, 254, 190, 139, 63],
  ]) {
    for (const [cans, expected] of [[0, maxHp], [1, one], [2, two], [3, three]]) {
      assert.equal(getCeoOilCanHealth(maxHp, { cans, vip: true }), expected);
    }
  }
});

test('oil applies across all cog HP values and uses original HP for each can count', () => {
  assert.equal(getCeoOilCanHealth(132, { cans: 1, vip: false }), 85);
  assert.equal(getCeoOilCanHealth(132, { cans: 2, vip: true }), 72);
  for (const [, maxHp] of [[1, 6], [9, 110], [15, 286], [20, 476]]) {
    assert.equal(getCeoOilCanHealth(maxHp, { cans: 3, vip: true }), Math.floor(maxHp * 0.25));
  }
  assert.equal(getCeoOilCanHealth(196, { cans: 3, vip: false }), 49);
  assert.equal(getCeoOilCanHealth(196, { cans: 0, vip: true }), 196);
});
