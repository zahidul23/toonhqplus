import test from 'node:test';
import assert from 'node:assert/strict';
import { getToonsHitRounds } from '../entrypoints/sidebar.content/toonsHit.ts';
import { calculateGagAccuracy } from '../entrypoints/sidebar.content/gagAccuracy.ts';
import { calculateRoundAccuracy } from '../entrypoints/sidebar.content/cogAccuracy.ts';
import { encodeCogRoundsToSearch, decodeCogRoundsFromSearch } from '../entrypoints/sidebar.content/urlState.ts';

const card = stars => ({ trackId: 'toonsHit', gagIndex: stars, variant: 'sos', target: 'all' });
const drop = { trackId: 'drop', gagIndex: 5, variant: 'base', target: 'all' };
const cog = { id: '20', isTrapped: false, isLured: false };

for (const duration of [3, 4, 5]) {
  test(`${duration}-star Toons Hit includes activation and expires after ${duration} rounds`, () => {
    const rounds = [[], [drop, card(duration)], ...Array.from({ length: 6 }, () => [drop])];
    const remaining = getToonsHitRounds(rounds);
    assert.deepEqual(remaining, [0, ...Array.from({ length: duration }, (_, i) => duration - i), ...Array(7 - duration).fill(0)]);
    const values = rounds.map((round, index) => calculateRoundAccuracy(round, [cog], undefined, remaining[index] > 0));
    assert.equal(values[1].perCog[0].entries[0].toonsHitBonus, 75);
    assert.equal(values[duration + 1].perCog[0].entries[0].toonsHitBonus, 0);
  });
}

test('activation in the last Toon slot boosts all gags without dealing damage or granting stun', () => {
  const result = calculateRoundAccuracy([drop, card(3)], [cog, { ...cog, id: 'factory_steel' }]);
  assert.equal(result.perCog[0].entries.length, 1);
  assert.equal(result.perCog[0].entries[0].rawAccuracy, 120);
  assert.equal(result.perCog[0].entries[0].accuracy, 96);
  assert.equal(result.perCog[0].entries[0].stunBonus, 0);
  assert.equal(result.perCog[1].entries[0].toonsHitBonus, 75);
});

test('preset and SOS apply the same flat bonus without stacking', () => {
  const preset = calculateGagAccuracy([drop], false, 20, true);
  const sos = calculateGagAccuracy([drop, card(5)], false, 20);
  assert.deepEqual(preset, sos);
  assert.deepEqual(calculateGagAccuracy([drop, card(5)], false, 20, true), sos);
  assert.equal(sos.breakdown[0].uncappedAccuracy, 120);
  assert.equal(sos.breakdown[0].accuracy, 96);
});

test('Toons Hit preserves forced misses and refreshes duration without stacking', () => {
  assert.equal(calculateGagAccuracy([drop, card(5)], true, 20).breakdown[0].accuracy, 0);
  assert.equal(calculateRoundAccuracy([drop, card(5)], [{ ...cog, isLured: true }]).perCog[0].entries[0].accuracy, 0);
  assert.deepEqual(getToonsHitRounds([[card(5), card(3)], [], [card(4)], [], [], [], []]), [5, 4, 4, 3, 2, 1, 0]);
});

test('facility links preserve every Toons Hit card', () => {
  const rounds = [[card(3), card(4), card(5), null]];
  const encoded = encodeCogRoundsToSearch(rounds);
  assert.deepEqual(decodeCogRoundsFromSearch(encoded.gagCodes, encoded.targetCodes, 4), rounds);
});
