import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGagAccuracy } from '../entrypoints/sidebar.content/gagAccuracy.ts';

const gag = (trackId, gagIndex, variant = 'base') => ({ trackId, gagIndex, variant });
const entry = (result, trackId) => result.breakdown.find((item) => item.trackId === trackId);

test('standalone calculator aggregates every earlier gag in a different track', () => {
  const result = calculateGagAccuracy(
    [gag('throw', 4), gag('throw', 4), gag('squirt', 6)],
    false,
    20,
  );
  assert.equal(entry(result, 'squirt').stunBonus, 50);
  assert.deepEqual(entry(result, 'squirt').stunSources, [
    { trackId: 'throw', gagCount: 2, amount: 50 },
  ]);
});

test('standalone Trap placement without Lure does not supply stun', () => {
  const result = calculateGagAccuracy([gag('trap', 5), gag('sound', 5)], false, 20);
  assert.equal(entry(result, 'sound').stunBonus, 0);
});

test('standalone activated Trap supplies stun and lets later Drop hit', () => {
  const result = calculateGagAccuracy([gag('trap', 5), gag('lure', 4), gag('drop', 5)], false, 20);
  assert.equal(entry(result, 'drop').stunBonus, 50);
  assert.notEqual(entry(result, 'drop').accuracy, 0);
});

test('Clerk Will and Lil Oldman give Foghorn four activated Trap stuns', () => {
  const result = calculateGagAccuracy(
    [gag('trap', 3, 'sos'), gag('lure', 5, 'sos'), gag('sound', 5)],
    false,
    20,
  );
  assert.equal(entry(result, 'sound').stunBonus, 200);
  assert.equal(entry(result, 'sound').accuracy, 100);
});

test('an all-target Trap with single-target Lure activates only one Trap stun', () => {
  const result = calculateGagAccuracy(
    [gag('trap', 3, 'sos'), gag('lure', 4), gag('sound', 5)],
    false,
    20,
  );
  assert.equal(entry(result, 'sound').stunBonus, 50);
});

test('an all-target Trap gives group Lure four placement bonuses', () => {
  const result = calculateGagAccuracy(
    [gag('trap', 3, 'sos'), gag('lure', 6), gag('sound', 5)],
    false,
    20,
  );
  assert.equal(entry(result, 'lure').trapPlacementCount, 4);
  assert.equal(entry(result, 'lure').trapPlacementBonus, 25);
  assert.equal(entry(result, 'sound').stunBonus, 200);
});

test('standalone Drop misses when Lure remains active', () => {
  const result = calculateGagAccuracy([gag('lure', 4), gag('drop', 5)], false, 20);
  assert.equal(entry(result, 'drop').accuracy, 0);
});

test('standalone pre-lured Drop misses', () => {
  const result = calculateGagAccuracy([gag('drop', 5)], true, 20);
  assert.equal(entry(result, 'drop').accuracy, 0);
});

test('standalone group Lure receives escalating Trap placement bonus', () => {
  const result = calculateGagAccuracy(
    [gag('trap', 5), gag('trap', 5), gag('trap', 5), gag('lure', 6)],
    false,
    20,
  );
  assert.equal(entry(result, 'lure').trapPlacementBonus, 20);
  assert.equal(entry(result, 'lure').trapPlacementCount, 3);
});

test('standalone compatible multiple Lures receive multi-Lure bonus', () => {
  const result = calculateGagAccuracy([gag('lure', 3), gag('lure', 5)], false, 20);
  assert.equal(entry(result, 'lure').lureBonus, 15);
});

test('standalone SOS gag always hits', () => {
  const result = calculateGagAccuracy([gag('drop', 5, 'sos')], false, 20);
  assert.equal(entry(result, 'drop').accuracy, 100);
});
