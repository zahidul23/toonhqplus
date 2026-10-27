export type CeoOilCans = { cans: 0 | 1 | 2 | 3; vip: boolean };
export const NO_OIL_CANS: CeoOilCans = { cans: 0, vip: false };

export const CEO_OIL_HEALTH_OPTIONS = [
  { label: 'None', cans: 0, vip: false, color: null },
  { label: 'Orange', cans: 1, vip: false, color: '#f97316' },
  { label: 'Red', cans: 2, vip: false, color: '#ef4444' },
  { label: 'Yellow 2.0', cans: 1, vip: true, color: '#facc15' },
  { label: 'Orange 2.0', cans: 2, vip: true, color: '#f97316' },
  { label: 'Red 2.0', cans: 3, vip: true, color: '#ef4444' },
] as const;

// Cleanup HP observed in the September 2026 CEO damage chart:
// https://www.mmocentralforums.com/forums/showthread.php?t=381591
// https://i.ibb.co/7x3c2Lpy/Oil-Cans-Damage-to-v2-and-regular-Bossbots.png
// Percentages are of the original HP, rounded down, not successive reductions.
// The inspected VLT client exposes health-light stages, not this numeric formula.
// See docs/ceo-oil-source-audit.md for the client/server evidence and limits.
const REGULAR_HP_PERCENT = [100, 65, 25] as const;
const VIP_HP_PERCENT = [100, 75, 55, 25] as const;

export function getCeoOilCanHealthPercent(oil: CeoOilCans) {
  const percentages = oil.vip ? VIP_HP_PERCENT : REGULAR_HP_PERCENT;
  return percentages[Math.min(oil.cans, percentages.length - 1)];
}

/** Banquet damage affects CEO levels 10–14; VIP values apply to the outer layer. */
export function getCeoOilCanHealth(maxHp: number, oil: CeoOilCans = NO_OIL_CANS) {
  return Math.floor(maxHp * getCeoOilCanHealthPercent(oil) / 100);
}
