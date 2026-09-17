const TRACK_IDS = ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop'] as const;
export type GagAccuracyTrackId = (typeof TRACK_IDS)[number];
export type GagAccuracySelection = {
  trackId: GagAccuracyTrackId;
  gagIndex: number;
  variant: 'base' | 'organic' | 'sos';
};

const TRACK_BASE_ACCURACY: Record<GagAccuracyTrackId, readonly number[]> = {
  trap: [100, 100, 100, 100, 100, 100, 100],
  lure: [60, 55, 70, 65, 80, 75, 90],
  sound: [95, 95, 95, 95, 95, 95, 95],
  throw: [75, 75, 75, 75, 75, 75, 75],
  squirt: [95, 95, 95, 95, 95, 95, 95],
  drop: [50, 50, 50, 50, 50, 50, 50],
};
const COG_DEFENSE: Record<number, number> = {
  1: 2, 2: 5, 3: 10, 4: 15, 5: 20, 6: 25, 7: 30, 8: 35, 9: 40, 10: 45,
  11: 50, 12: 55, 13: 60, 14: 60, 15: 60, 16: 65, 17: 65, 18: 65, 19: 65, 20: 65,
};
const MAX_TRACK_EXP_BONUS = 60;
const MAX_TOON_ACCURACY = 95;

function applyEstimatedSoftCap(rawAccuracy: number) {
  if (rawAccuracy <= MAX_TOON_ACCURACY) return Math.max(0, rawAccuracy);
  return Math.min(100, MAX_TOON_ACCURACY + (rawAccuracy - MAX_TOON_ACCURACY) * 0.04);
}
function getLureType(gagIndex: number) { return gagIndex === 6 || gagIndex % 2 === 1 ? 'group' : 'single'; }
function getLureTier(gagIndex: number) { return Math.min(3, Math.floor(gagIndex / 2) + 1); }
function getMultiLureBonus(lures: GagAccuracySelection[], baseline: GagAccuracySelection) {
  const baselineType = getLureType(baseline.gagIndex);
  const baselineTier = getLureTier(baseline.gagIndex);
  return lures.reduce((bonus, lure) => {
    if (lure === baseline || getLureType(lure.gagIndex) !== baselineType) return bonus;
    const tierDifference = baselineTier - getLureTier(lure.gagIndex);
    return bonus + (tierDifference <= 0 ? 20 : tierDifference === 1 ? 15 : 10);
  }, 0);
}

export function calculateGagAccuracy(gags: Array<GagAccuracySelection | null>, preLured: boolean, cogLevel: number) {
  const cogDefense = COG_DEFENSE[cogLevel] ?? COG_DEFENSE[20];
  const breakdown: Array<{
    trackId: GagAccuracyTrackId;
    baseAccuracy: number;
    organicBonus: number;
    expBonus: number;
    defense: number;
    stunBonus: number;
    stunSources: Array<{ trackId: GagAccuracyTrackId; gagCount: number; amount: number }>;
    lureBonus: number;
    trapPlacementBonus: number;
    trapPlacementCount: number;
    uncappedAccuracy: number;
    accuracy: number;
    specialRule?: string;
  }> = [];
  let stunBonus = 0;
  const stunSources: Array<{ trackId: GagAccuracyTrackId; gagCount: number; amount: number }> = [];
  let lured = preLured;
  const hasSelectedLure = gags.some((gag) => gag?.trackId === 'lure');
  const selectedTrapCount = gags.filter((gag) => gag?.trackId === 'trap').length;
  const hasGroupTrap = gags.some((gag) => gag?.trackId === 'trap' && (gag.variant === 'sos' || gag.gagIndex === 6));
  const hasGroupLure = gags.some((gag) => gag?.trackId === 'lure'
    && (gag.variant === 'sos' || getLureType(gag.gagIndex) === 'group'));
  const activatedTrapCount = hasGroupTrap && hasGroupLure ? 4 : Math.min(selectedTrapCount, 1);

  for (const trackId of TRACK_IDS) {
    const trackGags = gags.filter((gag): gag is GagAccuracySelection => gag?.trackId === trackId);
    if (!trackGags.length) continue;
    const baselineGag = trackGags.reduce((highest, gag) => gag.gagIndex > highest.gagIndex ? gag : highest);
    const gagLevel = baselineGag.gagIndex;
    const organicBonus = trackId === 'lure' && baselineGag.variant === 'organic' ? 10 : 0;
    const baseAccuracy = TRACK_BASE_ACCURACY[trackId][gagLevel];
    const adjustedBaseAccuracy = Math.min(baseAccuracy + organicBonus, MAX_TOON_ACCURACY);
    const lureBonus = trackId === 'lure' ? getMultiLureBonus(trackGags, baselineGag) : 0;
    const lureAffectsGroup = baselineGag.variant === 'sos' || getLureType(baselineGag.gagIndex) === 'group';
    const trapPlacementCount = trackId === 'lure'
      ? lureAffectsGroup && hasGroupTrap ? 4 : lureAffectsGroup ? selectedTrapCount : Math.min(selectedTrapCount, 1)
      : 0;
    const trapPlacementBonus = trackId === 'lure' && trapPlacementCount > 0
      ? 10 + (lureAffectsGroup ? (trapPlacementCount - 1) * 5 : 0)
      : 0;
    const appliedStunBonus = trackId === 'lure' ? trapPlacementBonus : stunBonus;
    const uncappedAccuracy = adjustedBaseAccuracy + MAX_TRACK_EXP_BONUS - cogDefense + appliedStunBonus + lureBonus;
    let accuracy: number;
    let specialRule: string | undefined;
    if (trackId === 'drop' && lured) { accuracy = 0; specialRule = 'Drop always misses lured Cogs'; }
    else if (trackId === 'trap' || trackGags.some((gag) => gag.variant === 'sos')) {
      accuracy = 100;
      specialRule = trackId === 'trap' ? 'Trap placement always hits' : 'SOS gag always hits';
    } else if (lured && trackId !== 'lure') { accuracy = 100; specialRule = 'Attacking a lured Cog always hits'; }
    else accuracy = applyEstimatedSoftCap(uncappedAccuracy);

    breakdown.push({
      trackId, baseAccuracy, organicBonus: specialRule ? 0 : organicBonus,
      expBonus: specialRule ? 0 : MAX_TRACK_EXP_BONUS, defense: specialRule ? 0 : cogDefense,
      stunBonus: specialRule || trackId === 'lure' ? 0 : stunBonus,
      stunSources: specialRule || trackId === 'lure' ? [] : [...stunSources],
      lureBonus: specialRule ? 0 : lureBonus, trapPlacementBonus: specialRule ? 0 : trapPlacementBonus,
      trapPlacementCount: specialRule ? 0 : trapPlacementCount,
      uncappedAccuracy: specialRule ? accuracy : uncappedAccuracy, accuracy, specialRule,
    });
    if (accuracy > 0 && trackId !== 'lure' && (trackId !== 'trap' || hasSelectedLure)) {
      const amount = trackId === 'trap' ? activatedTrapCount * 50 : trackGags.length * 25;
      stunBonus += amount;
      stunSources.push({ trackId, gagCount: trackGags.length, amount });
    }
    if (trackId === 'lure' && accuracy > 0) lured = selectedTrapCount === 0;
    if (trackId === 'sound' || trackId === 'throw' || trackId === 'squirt') lured = false;
  }
  const total = breakdown.length ? breakdown.reduce((chance, item) => chance * item.accuracy / 100, 1) * 100 : 0;
  return { total, breakdown, cogLevel, cogDefense };
}
