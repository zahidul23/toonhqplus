import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDefenseUp, getFacilityDefenseDownStacks, getLayersBeforeLastHit } from '../entrypoints/sidebar.content/facilityDamage.ts';

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

test('Fairway and Fringe Defense Down updates after a mid-round kill', () => {
  const layers = [1, 1, 1, 1];
  assert.equal(getFacilityDefenseDownStacks('golf_fairway', layers, false), 0);

  // Sound resolves and defeats two Cogs before Drop (Piano) is calculated.
  layers[0] = 0;
  layers[1] = 0;
  assert.equal(getFacilityDefenseDownStacks('golf_fairway', layers, false), 2);
  assert.equal(getFacilityDefenseDownStacks('golf_fringe', layers, false), 2);
});

// First Fairway: Level 11, President, Level 11, Level 10.
const fairwayCogs = () => [
  { layer: 1, remainingHpOnLayer: 156, isImmune: false },
  { layer: 1, remainingHpOnLayer: 1300, isImmune: false },
  { layer: 1, remainingHpOnLayer: 156, isImmune: false },
  { layer: 1, remainingHpOnLayer: 132, isImmune: false },
];
const DEFENSE_DOWN = [0, 0.2, 0.4, 0.6];

// slots: damage per Foghorn by slot index (all Foghorns hit all cogs).
function presidentFoghornBonus(slotDamages) {
  const hits = slotDamages.flatMap((damage, slot) => [0, 1, 2, 3].map(cogIdx => ({ slot, gagIndex: 5, cogIdx, damage })));
  const layers = getLayersBeforeLastHit(hits, 1, fairwayCogs());
  const stacks = getFacilityDefenseDownStacks('golf_fairway', layers, false);
  const base = slotDamages.reduce((sum, damage) => sum + damage, 0);
  return { base, sameGag: Math.ceil(base * 0.2), defense: Math.ceil(base * DEFENSE_DOWN[stacks]) };
}

test('President Defense Down counts kills before the last gag of the track', () => {
  assert.deepEqual(presidentFoghornBonus([50, 50, 50, 50]), { base: 200, sameGag: 40, defense: 40 });
  assert.deepEqual(presidentFoghornBonus([50, 50, 50, 55]), { base: 205, sameGag: 41, defense: 41 });
  assert.deepEqual(presidentFoghornBonus([55, 55, 55, 55]), { base: 220, sameGag: 44, defense: 132 });
});

test('President Defense Down ignores kills made by the last gag itself', () => {
  // After 2 Foghorns (100) nobody is dead, even though 150 + 30 kills the Level 10.
  assert.deepEqual(presidentFoghornBonus([50, 50, 50]), { base: 150, sameGag: 30, defense: 0 });
});

test('Same-level gags go rightmost slot first', () => {
  // Organics in the two rightmost slots land first: 55 + 55 + 50 = 160 kills all supports.
  assert.equal(presidentFoghornBonus([50, 50, 55, 55]).defense, 126);
  // Organics in the two leftmost slots land last: 50 + 50 + 55 = 155 only kills the Level 10.
  assert.equal(presidentFoghornBonus([55, 55, 50, 50]).defense, 42);
});

test('Lower gag levels land before higher ones regardless of slot', () => {
  // Elephant Trunk (level 4, 30) in the leftmost slot, Opera (level 7, 170) in the rightmost.
  const hits = [
    ...[0, 1, 2, 3].map(cogIdx => ({ slot: 0, gagIndex: 3, cogIdx, damage: 30 })),
    ...[0, 1, 2, 3].map(cogIdx => ({ slot: 3, gagIndex: 6, cogIdx, damage: 170 })),
  ];
  // Opera (level 7) is last even though it is in the rightmost slot, so only 30 lands first.
  assert.deepEqual(getLayersBeforeLastHit(hits, 1, fairwayCogs()), [1, 1, 1, 1]);
});
