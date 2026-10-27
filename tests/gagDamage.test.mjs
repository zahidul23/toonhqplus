import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGagDamage, getDamageAfterDefense } from '../entrypoints/sidebar.content/gagDamage.ts';
import { getRemoteDamage } from '../entrypoints/sidebar.content/remoteRules.ts';

const gag = (trackId, damage) => ({ trackId, damage });

// Reference calculation and regression cases:
// https://github.com/zzzachzzz/toontown-combos/blob/main/src/gags.ts#L248-L294
// https://github.com/zzzachzzz/toontown-combos/blob/main/src/gags.test.ts
test('Field Office defense reduces each gag before calculating Sound combo damage', () => {
  const combo = [gag('sound', 50), gag('sound', 50), gag('sound', 50), gag('sound', 90)];
  for (const [defense, base, bonus, total] of [
    [0, 240, 48, 288],
    [10, 216, 44, 260],
    [15, 202, 41, 243],
    [20, 192, 39, 231],
    [25, 178, 36, 214], // Upstream's 25% defense regression case.
  ]) {
    const result = calculateGagDamage(combo, false, 0, defense);
    assert.equal(result.base, base);
    assert.deepEqual(result.bonuses, [{ trackId: 'sound', amount: bonus }]);
    assert.equal(result.total, total, `${defense}% defense`);
  }
});

test('Lure knockback and Throw combo bonuses use defense-reduced damage', () => {
  const attacks = [gag('throw', 40), gag('throw', 40), gag('throw', 100)];
  for (const [defense, total] of [[0, 306], [10, 276], [15, 261], [20, 245], [25, 230]]) {
    // The upstream Lure + two cream pies + birthday cake case is 230 at 25%.
    assert.equal(calculateGagDamage([gag('lure', 80), ...attacks], false, 0, defense).total, total);
    assert.equal(calculateGagDamage(attacks, true, 0, defense).total, total);
  }
});

test('defense rounds down each gag separately, including organic and SOS damage', () => {
  const twoTrunks = calculateGagDamage([gag('sound', 21), gag('sound', 21)], false, 0, 25);
  assert.equal(twoTrunks.base, 30);
  assert.equal(twoTrunks.total, 36);
  const mixedPies = calculateGagDamage([gag('throw', 44), gag('throw', 40)], true, 0, 25);
  assert.deepEqual(mixedPies, {
    base: 63, knockback: 32, bonuses: [{ trackId: 'throw', amount: 13 }], remote: 0, total: 108,
  });
  assert.equal(calculateGagDamage([gag('sound', 75)], false, 0, 25).total, 56);
});

test('defense applies to every damaging track while preserving Lure and Toons Hit values', () => {
  for (const track of ['trap', 'sound', 'throw', 'squirt', 'drop']) {
    for (const [defense, expected] of [[0, 21], [10, 18], [15, 17], [20, 16], [25, 15]]) {
      assert.equal(getDamageAfterDefense(gag(track, 21), defense), expected, `${track} ${defense}%`);
    }
    const combo = [gag(track, 21), ...(track === 'trap' ? [gag('lure', 80)] : [])];
    assert.equal(calculateGagDamage(combo, false, 0, 25).total, 15, track);
  }
  assert.equal(getDamageAfterDefense(gag('lure', 80), 25), 80);
  assert.equal(getDamageAfterDefense(gag('toonsHit', 75), 25), 75);
  assert.equal(calculateGagDamage([gag('lure', 80), gag('toonsHit', 75)], false, 0, 25).total, 0);
});

test('defense preserves Trap activation, strongest Trap selection, and lured Drop behavior', () => {
  assert.equal(calculateGagDamage([gag('trap', 200)], false, 0, 25).total, 0);
  assert.equal(calculateGagDamage([gag('drop', 170)], true, 0, 25).total, 0);
  assert.equal(calculateGagDamage([
    gag('trap', 180), gag('trap', 200), gag('lure', 80), gag('drop', 170),
  ], true, 0, 25).total, 277); // 150 Trap + 127 Drop, no knockback.
  const soundWake = calculateGagDamage([gag('sound', 50), gag('throw', 100), gag('drop', 170)], true, 0, 25);
  assert.equal(soundWake.knockback, 0);
  assert.equal(soundWake.total, 239);
});

test('Field Office defense leaves remote damage unchanged and adds it after gag bonuses', () => {
  const remote = getRemoteDamage([1, 3], 2);
  for (const defense of [0, 10, 15, 20, 25]) {
    assert.equal(calculateGagDamage([], false, remote, defense).total, remote);
    assert.equal(calculateGagDamage([gag('throw', 100)], true, remote, defense).total,
      calculateGagDamage([gag('throw', 100)], true, 0, defense).total + remote);
  }
  assert.equal(calculateGagDamage([null, null], false).total, 0);
});
