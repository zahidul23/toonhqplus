import test from 'node:test';
import assert from 'node:assert/strict';
import { getGroupBossTier, getSuitValueFromCode } from '../entrypoints/sidebar.content/bossTiers.ts';

const member = (suits, extra = {}) => ({ toon: { id: Math.random(), ...suits }, ...extra });

test('disguise codes match the suit values read from ToonHQ tooltips', () => {
  assert.equal(getSuitValueFromCode('8132'), 50 + 28); // The Big Cheese 50
  assert.equal(getSuitValueFromCode('6108'), 8 + 20); // Head Hunter 8
  assert.equal(getSuitValueFromCode('1101'), 1); // Flunky 1
  assert.equal(getSuitValueFromCode('8208'), 78); // 2.0 suit
  assert.equal(getSuitValueFromCode('0000'), null); // no disguise shown
  assert.equal(getSuitValueFromCode(null), null);
});

test('CEO groups use pink-slip tiers from current members only', () => {
  const tier = getGroupBossTier({ type: 9, members: [
    member({ bossbot: '8132' }), // 78
    member({ bossbot: '7109' }), // 33
    member({ bossbot: '1101' }, { left: '2026-10-28T00:00:00Z' }), // ignored
    member({ bossbot: '0000' }), // ignored
  ] });
  assert.equal(tier.boss, 'CEO');
  assert.equal(tier.average, 56); // (78 + 33) / 2 = 55.5, banker's rounded
  assert.equal(tier.tier, 4);
  assert.equal(tier.detail, '5 Pink Slips');
  assert.equal(tier.toonCount, 2);
});

test('CJ groups use lawbot suits and lawyer tiers', () => {
  const tier = getGroupBossTier({ type: 7, members: [member({ lawbot: '8132', bossbot: '1101' })] });
  assert.deepEqual([tier.boss, tier.tier, tier.detail, tier.averageName], ['CJ', 9, '10 Lawyers', 'Big Wig 50']);
});

test('non-boss groups and groups without suits get no tier', () => {
  assert.equal(getGroupBossTier({ type: 21, members: [member({ bossbot: '8132' })] }), null);
  assert.equal(getGroupBossTier({ type: 9, members: [member({ lawbot: '8132' })] }), null);
  assert.equal(getGroupBossTier(undefined), null);
});

test('open spots follow ToonHQ: current members, party sizes and the group limit', () => {
  const tier = getGroupBossTier({ type: 9, max_players: 4, members: [
    member({ bossbot: '8132' }, { num_players: 2 }),
    member({ bossbot: '7109' }, { num_players: 1, left: '2026-10-28T00:00:00Z' }),
    member({ bossbot: '7109' }, { num_players: 1 }),
  ] });
  assert.deepEqual([tier.maxPlayers, tier.openSpots], [4, 1]);
  const unlimited = getGroupBossTier({ type: 7, max_players: null, members: [member({ lawbot: '8132' })] });
  assert.deepEqual([unlimited.maxPlayers, unlimited.openSpots], [8, 7]);
});
