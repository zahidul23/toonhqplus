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

/** Return the live Defense Down stacks applied to a facility target. */
export function getFacilityDefenseDownStacks(
  cogId: string,
  cogLayers: readonly number[],
  hasExplicitDefenseDown: boolean,
): number {
  const isClubPresident = cogId === 'golf_fairway' || cogId === 'golf_fringe';
  if (isClubPresident) return cogLayers.filter(layer => layer === 0).length;
  return hasExplicitDefenseDown ? 3 : 0;
}
