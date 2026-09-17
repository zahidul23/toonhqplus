import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoundAccuracy } from '../entrypoints/sidebar.content/cogAccuracy.ts';
import { decodeCogRoundsFromSearch } from '../entrypoints/sidebar.content/urlState.ts';

const gag = (trackId, gagIndex, targetIdx = 0, variant = 'base') => ({
  trackId,
  gagIndex,
  variant,
  target: targetIdx === 'all' ? 'all' : 'single',
  ...(targetIdx === 'all' ? {} : { targetIdx }),
});
const cog = (id = '20', state = {}) => ({ id, isTrapped: false, isLured: false, ...state });
const entry = (result, cogIndex, trackId) => result.perCog
  .find((item) => item.cogIndex === cogIndex)?.entries.find((item) => item.trackId === trackId);

test('group Geyser inherits both Pie stuns from different Cogs', () => {
  const result = calculateRoundAccuracy(
    [gag('throw', 4, 0), gag('throw', 4, 1), gag('squirt', 6, 'all')],
    [cog(), cog()],
  );
  assert.equal(entry(result, 0, 'squirt').stunBonus, 50);
  assert.equal(entry(result, 1, 'squirt').stunBonus, 50);
});

test('group Foghorn inherits four activated Trap stuns', () => {
  const gags = [0, 1, 2, 3].map((target) => gag('trap', 5, target));
  gags.push(gag('lure', 6, 'all'), gag('sound', 5, 'all'));
  const result = calculateRoundAccuracy(gags, [cog(), cog(), cog(), cog()]);
  assert.equal(entry(result, 0, 'sound').stunBonus, 200);
});

test('shared URL all-target Trap creates one activated stun per Cog', () => {
  const [round] = decodeCogRoundsFromSearch('143646', '555', 4);
  const result = calculateRoundAccuracy(round, [cog(), cog(), cog(), cog()]);
  assert.deepEqual(round, [
    { trackId: 'trap', gagIndex: 3, variant: 'sos', target: 'all' },
    { trackId: 'lure', gagIndex: 5, variant: 'sos', target: 'all' },
    { trackId: 'sound', gagIndex: 5, variant: 'base', target: 'all' },
    null,
  ]);
  assert.equal(entry(result, 0, 'sound').stunBonus, 200);
});

test('Trap placement without Lure supplies no stun to a later gag', () => {
  const result = calculateRoundAccuracy([gag('trap', 5, 0), gag('sound', 5, 'all')], [cog(), cog()]);
  assert.equal(entry(result, 0, 'sound').stunBonus, 0);
  assert.equal(entry(result, 1, 'sound').stunBonus, 0);
});

test('same-round Lure activation makes a selected Trap supply stun', () => {
  const result = calculateRoundAccuracy(
    [gag('trap', 5, 0), gag('lure', 4, 0), gag('drop', 5, 0)],
    [cog()],
  );
  assert.equal(entry(result, 0, 'drop').stunBonus, 50);
  assert.notEqual(entry(result, 0, 'drop').accuracy, 0);
});

test('Lure activation makes a carried Trap supply stun', () => {
  const result = calculateRoundAccuracy([gag('lure', 4, 0), gag('drop', 5, 0)], [cog('20', { isTrapped: true })]);
  assert.equal(entry(result, 0, 'lure').trapPlacementBonus, 10);
  assert.equal(entry(result, 0, 'drop').stunBonus, 50);
});

test('Drop misses a Cog that remains lured', () => {
  const result = calculateRoundAccuracy([gag('lure', 4, 0), gag('drop', 5, 0)], [cog()]);
  assert.equal(entry(result, 0, 'drop').accuracy, 0);
  assert.match(entry(result, 0, 'drop').specialRule, /always misses/i);
});

test('ordinary gags cannot miss an actively remote-controlled Cog', () => {
  const result = calculateRoundAccuracy([gag('drop', 5, 0)], [cog('20', { remote: { roundsLeft: 2 } })]);
  assert.equal(entry(result, 0, 'drop').accuracy, 100);
  assert.match(entry(result, 0, 'drop').specialRule, /remote-controlled/i);
});

test('lured Drop still misses an actively remote-controlled Cog', () => {
  const result = calculateRoundAccuracy([gag('drop', 5, 0)], [cog('20', { isLured: true, remote: { roundsLeft: 2 } })]);
  assert.equal(entry(result, 0, 'drop').accuracy, 0);
});

test('a remote selected this round affects accuracy from the start of the round', () => {
  const cogs = [cog('11'), cog('office_junior'), cog('11')];
  const sameRound = calculateRoundAccuracy(
    [gag('special', 6, 2, 'sos'), gag('sound', 5, 'all')],
    cogs,
  );
  const nextRound = calculateRoundAccuracy(
    [gag('sound', 5, 'all')],
    [cogs[0], cogs[1], cog('11', { remote: { roundsLeft: 3 } })],
  );
  assert.ok(Math.abs(entry(sameRound, 0, 'sound').luredRatio - 100 / 3) < 1e-10);
  assert.equal(
    sameRound.factors.find((factor) => factor.label === 'sound group').accuracy,
    nextRound.factors.find((factor) => factor.label === 'sound group').accuracy,
  );
});

test('Sound receives luredRatio from a mixed group', () => {
  const cogs = [cog('20', { isLured: true }), cog('20', { remote: { roundsLeft: 2 } }), cog(), cog()];
  const result = calculateRoundAccuracy([gag('sound', 5, 'all')], cogs);
  assert.equal(entry(result, 2, 'sound').luredRatio, 50);
  assert.equal(entry(result, 3, 'sound').luredRatio, 50);
});

test('luredRatio excludes dead Cogs from numerator and denominator', () => {
  const cogs = [cog('20', { isLured: true }), cog(), cog('20', { isDead: true })];
  const result = calculateRoundAccuracy([gag('sound', 5, 'all')], cogs);
  assert.equal(entry(result, 1, 'sound').luredRatio, 50);
});

test('level-seven Squirt receives luredRatio but lower Squirt does not', () => {
  const cogs = [cog('20', { isLured: true }), cog()];
  const geyser = calculateRoundAccuracy([gag('squirt', 6, 'all')], cogs);
  const cloud = calculateRoundAccuracy([gag('squirt', 5, 1)], cogs);
  assert.equal(entry(geyser, 1, 'squirt').luredRatio, 50);
  assert.equal(entry(cloud, 1, 'squirt').luredRatio, 0);
});

test('earlier Sound removes Lure before level-seven Squirt luredRatio is evaluated', () => {
  const result = calculateRoundAccuracy(
    [gag('sound', 5, 'all'), gag('squirt', 6, 'all')],
    [cog('20', { isLured: true }), cog()],
  );
  assert.equal(entry(result, 1, 'squirt').luredRatio, 0);
});

test('group Lure includes new and carried Traps in its placement bonus', () => {
  const result = calculateRoundAccuracy(
    [gag('trap', 5, 0), gag('lure', 6, 'all')],
    [cog(), cog('20', { isTrapped: true })],
  );
  assert.equal(entry(result, 0, 'lure').trapPlacementBonus, 15);
});

test('compatible multiple Lures add the historical multi-Lure bonus', () => {
  const result = calculateRoundAccuracy(
    [gag('lure', 3, 'all'), gag('lure', 5, 'all')],
    [cog()],
  );
  assert.equal(entry(result, 0, 'lure').lureBonus, 15);
});

test('a group-only track contributes one shared probability factor', () => {
  const result = calculateRoundAccuracy([gag('sound', 5, 'all')], [cog('20'), cog('10')]);
  assert.equal(result.factors.length, 1);
  assert.equal(result.factors[0].label, 'sound group');
});

test('group Sound shows the same shared breakdown on a lured Cog', () => {
  const result = calculateRoundAccuracy(
    [gag('sound', 5, 'all')],
    [cog('20'), cog('20'), cog('20'), cog('20', { isLured: true })],
  );
  const sharedAccuracy = result.factors.find((factor) => factor.label === 'sound group').accuracy;
  const luredSound = entry(result, 3, 'sound');
  const ordinarySound = entry(result, 0, 'sound');
  assert.equal(luredSound.accuracy, sharedAccuracy);
  assert.notEqual(luredSound.accuracy, 100);
  assert.deepEqual(luredSound, ordinarySound);
  assert.equal(luredSound.specialRule, undefined);
});

test('mixed single/group track keeps the single-target roll as its source', () => {
  const result = calculateRoundAccuracy(
    [gag('throw', 4, 0), gag('throw', 6, 'all')],
    [cog('20'), cog('10')],
  );
  assert.equal(entry(result, 1, 'throw').accuracy, entry(result, 0, 'throw').accuracy);
  assert.match(entry(result, 1, 'throw').specialRule, /single-target gag accuracy/i);
  assert.equal(result.factors.length, 1);
});

test('SOS gags always hit', () => {
  const result = calculateRoundAccuracy([gag('drop', 5, 0, 'sos')], [cog('20')]);
  assert.equal(entry(result, 0, 'drop').accuracy, 100);
});
