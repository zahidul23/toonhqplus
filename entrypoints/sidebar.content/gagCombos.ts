import { gags as gagsConfig } from './gags';

export const COG_HEALTH: Record<number, number> = {
  1: 6, 2: 12, 3: 20, 4: 30, 5: 42, 6: 56, 7: 72, 8: 90, 9: 110, 10: 132,
  11: 156, 12: 196, 13: 224, 14: 254, 15: 286, 16: 320, 17: 356, 18: 394, 19: 434, 20: 476,
};

export const GAG_TRACK_ORDER = ['trap', 'sound', 'throw', 'squirt', 'drop'] as const;
export type ComboTrackId = (typeof GAG_TRACK_ORDER)[number];
export type ComboGagSpec = readonly [trackId: ComboTrackId, gagIndex: number, organic?: boolean];
type ComboSpec = readonly ComboGagSpec[] | { gags: readonly ComboGagSpec[]; lured: true };

export type ComboGag = {
  trackId: ComboTrackId;
  gagIndex: number;
  organic: boolean;
};

export type GagCombo = {
  gags: ComboGag[];
  damage: number;
  lured: boolean;
};

type GagData = { name: string; image: string; base: number; organic?: number };
type GagTrack = { id: string; name: string; color: string; gags: GagData[] };

const tracks = gagsConfig as GagTrack[];
const trackMap = new Map(tracks.map((track) => [track.id, track]));
const trackOrderMap = new Map(GAG_TRACK_ORDER.map((trackId, index) => [trackId, index]));
const withLure = (...gags: ComboGagSpec[]): ComboSpec => ({ gags, lured: true });

// This is the intentionally hand-maintained reference list. Add, remove, or reorder
// combo rows here; validation below prevents a bad entry from reaching the page.
export const GAG_COMBOS_BY_LEVEL: Record<number, readonly ComboSpec[]> = {
  1: [
    [['throw', 0]],
    [['sound', 0], ['sound', 0]],
    [['squirt', 0], ['squirt', 0]],
    [['drop', 0]],
  ],
  2: [
    [['trap', 0]],
    [['throw', 0], ['throw', 0]],
    [['squirt', 1], ['squirt', 0]],
    [['drop', 0, true]],
  ],
  3: [
    [['trap', 1]],
    [['sound', 4]],
    [['squirt', 3]],
    [['drop', 1, true]],
  ],
  4: [
    [['trap', 2]],
    [['throw', 3, true]],
    [['squirt', 4]],
    [['drop', 2]],
  ],
  5: [
    [['trap', 3]],
    [['sound', 4], ['sound', 3]],
    [['sound', 3, true], ['sound', 3, true]],
    [['throw', 4, true]],
    [['squirt', 3], ['squirt', 3]],
    [['drop', 3]],
  ],
  6: [
    [['trap', 4]],
    [['sound', 3], ['sound', 3], ['sound', 3]],
    [['sound', 4, true], ['sound', 4, true]],
    [['throw', 3], ['throw', 3]],
    [['squirt', 4], ['squirt', 3]],
    [['drop', 4]],
  ],
  7: [
    [['trap', 4]],
    [['sound', 4], ['sound', 4], ['sound', 4]],
    [['throw', 3, true], ['throw', 3, true]],
    [['squirt', 5]],
    [['squirt', 4], ['squirt', 4]],
    [['drop', 4, true]],
  ],
  8: [
    [['trap', 4, true]],
    [['sound', 4], ['sound', 4], ['sound', 4], ['sound', 3]],
    [['sound', 4], ['sound', 3, true], ['sound', 3, true], ['sound', 3, true]],
    [['throw', 5]],
    [['throw', 4], ['throw', 4]],
    [['squirt', 5, true]],
    [['squirt', 4], ['squirt', 4], ['squirt', 3]],
  ],
  9: [
    [['sound', 5], ['sound', 5]],
    [['sound', 5], ['sound', 4], ['sound', 4]],
    [['sound', 4, true], ['sound', 4, true], ['sound', 4, true], ['sound', 4]],
    [['throw', 5, true]],
    [['throw', 4], ['throw', 3], ['throw', 3]],
    withLure(['throw', 4], ['throw', 3]),
    withLure(['squirt', 5]),
    withLure(['squirt', 4], ['squirt', 3], ['squirt', 3]),
    [['squirt', 4], ['squirt', 3], ['squirt', 3], ['squirt', 3]],
  ],
  10: [
    [['sound', 5], ['sound', 4], ['sound', 4], ['sound', 4]],
    [['throw', 6, true]],
    withLure(['throw', 5]),
    withLure(['throw', 4], ['throw', 4]),
    [['throw', 4], ['throw', 4], ['throw', 4]],
    withLure(['squirt', 4], ['squirt', 4], ['squirt', 3]),
    withLure(['squirt', 3], ['squirt', 3], ['squirt', 3], ['squirt', 3]),
    withLure(['squirt', 5, true]),
    [['squirt', 5], ['squirt', 4]],
    [['drop', 4], ['drop', 3]]
  ],
  11: [
    [['trap', 5]],
    [['sound', 5, true], ['sound', 5, true], ['sound', 4]],
    [['sound', 5], ['sound', 5], ['sound', 3], ['sound', 3]],
    withLure(['throw', 5, true]),
    withLure(['throw', 4], ['throw', 3], ['throw', 3]),
    [['throw', 5], ['throw', 4]],
    [['throw', 4], ['throw', 4], ['throw', 3], ['throw', 3]],
    [['squirt', 5], ['squirt', 5]],
    withLure(['squirt', 4], ['squirt', 3], ['squirt', 3], ['squirt', 3]),
    [['drop', 5]],
  ],
  12: [
    [['trap', 5, true]],
    [['sound', 5], ['sound', 5], ['sound', 5], ['sound', 3]],
    [['sound', 5, true], ['sound', 5, true], ['sound', 5, true]],
    [['sound', 5, true], ['sound', 5, true], ['sound', 4], ['throw', 4]],
    [['sound', 6, true], ['sound', 4, true], ['sound', 4, true], ['sound', 3]],
    [['throw', 5], ['throw', 5]],
    [['throw', 4, true], ['throw', 4], ['throw', 4], ['throw', 4]],
     withLure(['throw', 4], ['throw', 4], ['throw', 4]),
     withLure(['squirt', 4], ['squirt', 4], ['squirt', 4], ['squirt', 4]),
    [['drop', 5, true]],
  ],
  13: [
    [['trap', 5], ['throw', 4, true]],
    [['sound', 5], ['sound', 5], ['sound', 5], ['sound', 5]],
    [['sound', 5, true], ['sound', 5, true], ['sound', 5, true], ['sound', 4]],
    [['sound', 6], ['sound', 5], ['sound', 5]],
    [['sound', 6, true], ['sound', 5], ['sound', 4], ['sound', 3]],
    [['throw', 5], ['throw', 5]],
    withLure(['throw', 5], ['throw', 4]),
    withLure(['throw', 4], ['throw', 4], ['throw', 3], ['throw', 3]),
    [['squirt', 4], ['drop', 5, true]],
  ],
  14: [
    [['trap', 5], ['squirt', 5]],
    [['sound', 6], ['sound', 6], ['sound', 5]],
    [['sound', 6], ['sound', 5], ['sound', 5], ['sound', 4]],
    [['sound', 5, true], ['sound', 5, true], ['sound', 5, true], ['sound', 5]],
    [['throw', 5, true], ['throw', 5, true]],
    withLure(['throw', 5, true], ['throw', 4]),
    withLure(['throw', 4], ['throw', 4], ['throw', 4], ['throw', 4]),
    withLure(['squirt', 5], ['squirt', 5]),
    [['drop', 5], ['drop', 3]],
  ],
  15: [
    [['sound', 6], ['sound', 5], ['sound', 5], ['sound', 5]],
    [['throw', 6], ['throw', 6]],
    [['squirt', 5], ['squirt', 5], ['squirt', 5]],
    [['drop', 5], ['drop', 4]],
  ],
  16: [
    [['sound', 6], ['sound', 6], ['sound', 6]],
    withLure(['throw', 5], ['throw', 5]),
    [['drop', 5], ['drop', 5]],
  ],
  17: [
    [['throw', 5], ['throw', 5], ['throw', 5]],
    [['squirt', 6], ['squirt', 6], ['squirt', 6]],
    [['sound', 6, true], ['sound', 6, true], ['sound', 6, true]],
  ],
  18: [
    [['throw', 5], ['throw', 6], ['throw', 6]],
    [['sound', 6], ['sound', 6], ['sound', 6], ['sound', 6]],
    [['drop', 5], ['drop', 5]],
  ],
  19: [
    [['squirt', 5], ['squirt', 5], ['squirt', 6], ['squirt', 6]],
    [['throw', 4], ['throw', 5, true], ['throw', 5, true], ['throw', 5, true]],
    [['drop', 5], ['drop', 5, true]],
  ],
  20: [
    [['throw', 6, true], ['throw', 6, true], ['throw', 6, true]],
    [['sound', 6, true], ['sound', 6, true], ['sound', 6, true], ['sound', 6, true]],
    [['squirt', 5, true], ['squirt', 5, true], ['squirt', 5, true], ['squirt', 6, true]],
  ],
};

export function getComboGagData(gag: ComboGag) {
  return trackMap.get(gag.trackId)?.gags[gag.gagIndex];
}

export function getComboGagTrack(gag: ComboGag) {
  return trackMap.get(gag.trackId);
}

export function getComboGagDamage(gag: ComboGag) {
  const data = getComboGagData(gag);
  if (!data) return 0;
  return gag.organic ? (data.organic ?? data.base) : data.base;
}

export function calculateGagComboDamage(gags: ComboGag[], luredPreset = false) {
  let totalDamage = 0;
  let lured = luredPreset;

  for (const trackId of GAG_TRACK_ORDER) {
    const trackGags = gags.filter((gag) => gag.trackId === trackId);
    if (trackGags.length === 0) continue;

    if (trackId === 'trap') {
      if (trackGags.length === 1) totalDamage += getComboGagDamage(trackGags[0]);
      // Trap implies the lure needed to activate it. That lure is consumed by
      // Trap, so later Throw or Squirt gags do not receive knockback damage.
      lured = false;
      continue;
    }

    const baseDamage = trackGags.reduce((sum, gag) => sum + getComboGagDamage(gag), 0);
    const comboBonus = trackGags.length >= 2 ? Math.floor(Math.ceil(baseDamage / 5) * 5 * 0.2) : 0;
    if (trackId === 'sound') {
      totalDamage += baseDamage + comboBonus;
      lured = false;
    } else if (trackId === 'throw' || trackId === 'squirt') {
      const lureBonus = lured
        ? trackGags.reduce((sum, gag) => sum + Math.ceil(getComboGagDamage(gag) * 0.5), 0)
        : 0;
      totalDamage += baseDamage + lureBonus + comboBonus;
      lured = false;
    } else if (trackId === 'drop' && !lured) {
      totalDamage += baseDamage + comboBonus;
    }
  }
  return totalDamage;
}

function validateHardcodedCombos() {
  const validated: Record<number, GagCombo[]> = {};
  for (let level = 1; level <= 20; level++) {
    const health = COG_HEALTH[level];
    const specs = GAG_COMBOS_BY_LEVEL[level];
    if (!specs?.length) throw new Error(`Level ${level} has no gag combos.`);

    validated[level] = specs.map((spec, comboIndex) => {
      const luredPreset = 'gags' in spec && spec.lured;
      const gagSpecs = 'gags' in spec ? spec.gags : spec;
      if (gagSpecs.length < 1 || gagSpecs.length > 4) throw new Error(`Level ${level}, combo ${comboIndex + 1} must contain 1–4 gags.`);
      const gags = gagSpecs.map(([trackId, gagIndex, organic = false]) => ({ trackId, gagIndex, organic }));
      const hasTrap = gags.some((gag) => gag.trackId === 'trap');
      if (luredPreset && hasTrap) throw new Error(`Level ${level}, combo ${comboIndex + 1} does not need an explicit lure preset because Trap implies lure.`);
      const lured = luredPreset || hasTrap;
      let previousTrack = -1;
      for (const gag of gags) {
        const track = getComboGagTrack(gag);
        const data = getComboGagData(gag);
        if (!track || !data) throw new Error(`Level ${level}, combo ${comboIndex + 1} contains an unknown gag.`);
        const currentTrack = trackOrderMap.get(gag.trackId) ?? -1;
        if (currentTrack < previousTrack) throw new Error(`Level ${level}, combo ${comboIndex + 1} is not in natural track order.`);
        previousTrack = currentTrack;
        if (gag.organic && data.organic == null) throw new Error(`Level ${level}, combo ${comboIndex + 1} uses an unavailable organic gag.`);
      }
      const damage = calculateGagComboDamage(gags, lured);
      if (damage < health) throw new Error(`Level ${level}, combo ${comboIndex + 1} deals ${damage}, below ${health} HP.`);
      if (!isEfficientForHealth(gags, health, lured)) throw new Error(`Level ${level}, combo ${comboIndex + 1} is not minimal for ${health} HP.`);
      return { gags, damage, lured: luredPreset };
    });
  }
  return validated;
}

function isEfficientForHealth(gags: ComboGag[], health: number, lured: boolean) {
  for (let gagIndex = 0; gagIndex < gags.length; gagIndex++) {
    const gag = gags[gagIndex];
    if (gag.gagIndex > 0) {
      const lowered = gags.map((entry, index) => index === gagIndex ? { ...entry, gagIndex: entry.gagIndex - 1 } : entry);
      if (calculateGagComboDamage(lowered, lured) >= health) return false;
    }
    if (gag.organic) {
      const withoutOrganic = gags.map((entry, index) => index === gagIndex ? { ...entry, organic: false } : entry);
      if (calculateGagComboDamage(withoutOrganic, lured) >= health) return false;
    }
  }
  return true;
}

// Validation runs during module initialization, before React can render the list.
export const VALIDATED_GAG_COMBOS = validateHardcodedCombos();
