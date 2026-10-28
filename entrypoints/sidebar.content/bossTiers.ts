// CEO and CJ difficulty tiers, shared by the group dialog tooltip and the
// tier tag on Groups page cards. Keep this module free of extensionless
// imports so the Node test runner can load it directly.

export interface CJDifficultyTier {
  tier: number;
  minlevel: number;
  lawyers: number;
  gavels: number;
  evidence: number;
  hasBonusWeight: boolean;
  laffHeal: number;
}

export const CJ_DIFFICULTY_TIERS: CJDifficultyTier[] = [
  { tier: 9, minlevel: 70, lawyers: 10, gavels: 8, evidence: 22, hasBonusWeight: true, laffHeal: 4 },
  { tier: 8, minlevel: 61, lawyers: 9, gavels: 8, evidence: 24, hasBonusWeight: true, laffHeal: 4 },
  { tier: 7, minlevel: 53, lawyers: 9, gavels: 7, evidence: 26, hasBonusWeight: true, laffHeal: 3 },
  { tier: 6, minlevel: 44, lawyers: 8, gavels: 7, evidence: 28, hasBonusWeight: false, laffHeal: 3 },
  { tier: 5, minlevel: 36, lawyers: 8, gavels: 6, evidence: 30, hasBonusWeight: false, laffHeal: 2 },
  { tier: 4, minlevel: 27, lawyers: 8, gavels: 6, evidence: 32, hasBonusWeight: false, laffHeal: 2 },
  { tier: 3, minlevel: 19, lawyers: 8, gavels: 5, evidence: 34, hasBonusWeight: false, laffHeal: 1 },
  { tier: 2, minlevel: 10, lawyers: 8, gavels: 5, evidence: 36, hasBonusWeight: false, laffHeal: 1 },
  { tier: 1, minlevel: 1, lawyers: 8, gavels: 4, evidence: 38, hasBonusWeight: false, laffHeal: 1 },
];

export const getCJDifficultyTier = (value: number): CJDifficultyTier =>
  CJ_DIFFICULTY_TIERS.find(t => value >= t.minlevel) || CJ_DIFFICULTY_TIERS[8];

export interface CEODifficultyTier {
  tier: number;
  minlevel: number;
  timer: string;
  tables: number;
  cogTypes: string[];
  totalCogs: number;
  slips: number;
}

export const CEO_DIFFICULTY_TIERS: CEODifficultyTier[] = [
  { tier: 5, minlevel: 63, timer: '330s', tables: 13, cogTypes: ['the_big_cheese.png'], totalCogs: 65, slips: 5 },
  { tier: 4, minlevel: 48, timer: '315s', tables: 12, cogTypes: ['corporate_raider.png', 'the_big_cheese.png'], totalCogs: 60, slips: 5 },
  { tier: 3, minlevel: 33, timer: '300s', tables: 10, cogTypes: ['corporate_raider.png'], totalCogs: 55, slips: 4 },
  { tier: 2, minlevel: 17, timer: '285s', tables: 9, cogTypes: ['head_hunter.png', 'corporate_raider.png'], totalCogs: 50, slips: 4 },
  { tier: 1, minlevel: 1, timer: '270s', tables: 8, cogTypes: ['head_hunter.png'], totalCogs: 40, slips: 3 },
];

export const getCEODifficultyTier = (value: number): CEODifficultyTier =>
  CEO_DIFFICULTY_TIERS.find(t => value >= t.minlevel) || CEO_DIFFICULTY_TIERS[4];

export function bankersRound(num: number): number {
  const half = Math.floor(num) + 0.5;
  if (Math.abs(num - half) < 0.000001) {
    const floor = Math.floor(num);
    return (floor % 2 === 0) ? floor : floor + 1;
  }
  return Math.round(num);
}

export const getCogNameForLevel = (level: number, suit: string) => {
  const lawbot = suit === 'lawbot';
  if (level <= 5) return (lawbot ? 'Bottom Feeder' : 'Flunky') + ' ' + level;
  if (level <= 10) return (lawbot ? 'Bloodsucker' : 'Pencil Pusher') + ' ' + (level - 4);
  if (level <= 15) return (lawbot ? 'Double Talker' : 'Yesman') + ' ' + (level - 8);
  if (level <= 20) return (lawbot ? 'Ambulance Chaser' : 'Micromanager') + ' ' + (level - 12);
  if (level <= 25) return (lawbot ? 'Back Stabber' : 'Downsizer') + ' ' + (level - 16);
  if (level <= 30) return (lawbot ? 'Spin Doctor' : 'Head Hunter') + ' ' + (level - 20);
  if (level <= 35) return (lawbot ? 'Legal Eagle' : 'Corporate Raider') + ' ' + (level - 24);
  return (lawbot ? 'Big Wig' : 'The Big Cheese') + ' ' + (level - 28);
};

/**
 * Convert ToonHQ's disguise code (rank hex, version, two-digit level hex) to
 * the same 1-78 scale the dialog reads from suit tooltips. Returns null when
 * ToonHQ would show no disguise, so the Toon is left out of the average.
 */
export function getSuitValueFromCode(code: unknown): number | null {
  if (typeof code !== 'string' || !code) return null;
  const rank = parseInt(code[0], 16);
  if (!Number.isFinite(rank) || rank <= 0 || rank > 8) return null;
  const version = parseInt(code[1], 16);
  if (version >= 2) return 78; // 2.0 suits count as the maximum.
  const level = parseInt(code.substring(2, 4), 16);
  return (Number.isFinite(level) && level > 0 ? level : 1) + 4 * (rank - 1);
}

// TTR group type IDs from ToonHQ (see groupTypes.ts).
const BOSS_GROUP_TYPES: Record<number, { boss: 'CEO' | 'CJ'; suit: 'bossbot' | 'lawbot' }> = {
  9: { boss: 'CEO', suit: 'bossbot' },
  7: { boss: 'CJ', suit: 'lawbot' },
};

export interface GroupBossTier {
  boss: 'CEO' | 'CJ';
  tier: number;
  /** "5 Pink Slips" or "9 Lawyers". */
  detail: string;
  average: number;
  averageName: string;
  /** Sum of member suit values, used for the threshold notes. */
  sum: number;
  toonCount: number;
}

/** Tier for a native CEO/CJ group, matching what its details dialog shows. */
export function getGroupBossTier(group: any): GroupBossTier | null {
  const config = BOSS_GROUP_TYPES[Number(group?.type)];
  if (!config || !Array.isArray(group.members)) return null;

  // Non-moderators only see members who have not left the group.
  const values = group.members
    .filter((member: any) => member && !member.left && member.toon)
    .map((member: any) => getSuitValueFromCode(member.toon[config.suit]))
    .filter((value: number | null): value is number => value !== null);
  if (values.length === 0) return null;

  const sum = values.reduce((total: number, value: number) => total + value, 0);
  const average = bankersRound(sum / values.length);
  const base = { boss: config.boss, average, sum, averageName: getCogNameForLevel(average, config.suit), toonCount: values.length };
  if (config.boss === 'CJ') {
    const tier = getCJDifficultyTier(average);
    return { ...base, tier: tier.tier, detail: `${tier.lawyers} Lawyers` };
  }
  const tier = getCEODifficultyTier(average);
  return { ...base, tier: tier.tier, detail: `${tier.slips} Pink Slips` };
}
