/** Apply the Factory Foreman's Defense Up status to gag base damage. */
export function applyDefenseUp(
  damage: number,
  hasDefenseUp: boolean,
  isDefenseUpSource: boolean,
  trackId: string,
): number {
  // Lure deals no damage. The Foreman does not grant Defense Up to itself.
  if (!hasDefenseUp || isDefenseUpSource || trackId === 'lure') return damage;
  return Math.floor(damage * 0.75);
}

/** The Cog Golf Club President gains Defense Down per defeated Cog. */
export function isClubPresident(cogId: string): boolean {
  return cogId === 'golf_fairway' || cogId === 'golf_fringe';
}

/** One gag's base damage landing on one cog during a track. */
export type TrackHit = {
  slot: number;
  gagIndex: number;
  cogIdx: number;
  damage: number;
  instaKill?: boolean;
};

export type CogKillState = {
  layer: number;
  remainingHpOnLayer: number;
  isImmune: boolean;
};

/**
 * Game order of gags within one track: lower gag level first, then by toon
 * position. Toon #1 is the rightmost laff meter, so the rightmost slot goes first.
 */
export function compareTrackAttackOrder(
  a: { slot: number; gagIndex: number },
  b: { slot: number; gagIndex: number },
): number {
  return a.gagIndex - b.gagIndex || b.slot - a.slot;
}

/**
 * Cog layers at the moment the last gag of a track lands on `targetIdx`.
 * Only base damage from the earlier gags counts; bonuses land with the last gag.
 * The Club President's Defense Down stacks are read at this moment.
 */
export function getLayersBeforeLastHit(
  hits: readonly TrackHit[],
  targetIdx: number,
  cogs: readonly CogKillState[],
): number[] {
  const attacks = [...new Map(hits.map(hit => [hit.slot, hit])).values()].sort(compareTrackAttackOrder);
  const targetAttacks = attacks.filter(attack => hits.some(hit => hit.slot === attack.slot && hit.cogIdx === targetIdx));
  const lastAttack = targetAttacks[targetAttacks.length - 1];
  if (!lastAttack) return cogs.map(cog => cog.layer);

  const earlierSlots = new Set(attacks.slice(0, attacks.indexOf(lastAttack)).map(attack => attack.slot));
  const damage = cogs.map(() => 0);
  const instaKilled = cogs.map(() => false);
  hits.forEach(hit => {
    if (!earlierSlots.has(hit.slot)) return;
    damage[hit.cogIdx] += hit.damage;
    if (hit.instaKill) instaKilled[hit.cogIdx] = true;
  });

  return cogs.map((cog, idx) => {
    if (idx === targetIdx || cog.layer === 0 || cog.isImmune) return cog.layer;
    if (instaKilled[idx]) return 0;
    // A track can only remove one layer, so v2 outer layers never count as kills here.
    if (cog.layer === 1 && damage[idx] >= cog.remainingHpOnLayer) return 0;
    return cog.layer;
  });
}

/** Return the live Defense Down stacks applied to a facility target. */
export function getFacilityDefenseDownStacks(
  cogId: string,
  cogLayers: readonly number[],
  hasExplicitDefenseDown: boolean,
): number {
  if (isClubPresident(cogId)) return cogLayers.filter(layer => layer === 0).length;
  return hasExplicitDefenseDown ? 3 : 0;
}
