import { getToonsHitRounds, TOONS_HIT_BONUS } from './toonsHit.ts';

export const MAX_TRACK_EXP_BONUS = 60;
export const MAX_TOON_ACCURACY = 95;

const TRACK_BASE_ACCURACY: Record<string, readonly number[]> = {
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

const SUPERVISOR_EVASION: Record<string, number> = {
  factory_scrap: 50,
  factory_steel: 50,
  mint_coin: 50,
  mint_bullion: 50,
  office_junior: 50,
  office_senior: 50,
  golf_fairway: 50,
  golf_fringe: 50,
};

export type AccuracyGag = {
  trackId: string;
  gagIndex: number;
  variant: 'base' | 'organic' | 'sos';
  target: 'single' | 'all';
  targetIdx?: number;
} | null;

export type AccuracyCog = {
  id: string;
  isDead?: boolean;
  isLured: boolean;
  isTrapped: boolean;
  remote?: unknown;
};

export type CogAccuracyEntry = {
  trackId: string;
  accuracy: number;
  baseAccuracy: number;
  organicBonus: number;
  defense: number;
  stunBonus: number;
  trapPlacementBonus: number;
  lureBonus: number;
  luredRatio: number;
  rawAccuracy: number;
  toonsHitBonus: number;
  specialRule?: string;
};

export type RoundCogAccuracy = {
  cogIndex: number;
  cogName: string;
  accuracy: number;
  entries: CogAccuracyEntry[];
};

function applyAccuracySoftCap(rawAccuracy: number) {
  return rawAccuracy <= MAX_TOON_ACCURACY
    ? Math.max(0, rawAccuracy)
    : Math.min(100, MAX_TOON_ACCURACY + (rawAccuracy - MAX_TOON_ACCURACY) * 0.04);
}

function getAccuracyLureType(gagIndex: number) { return gagIndex === 6 || gagIndex % 2 === 1 ? 'group' : 'single'; }
function getAccuracyLureTier(gagIndex: number) { return Math.min(3, Math.floor(gagIndex / 2) + 1); }
function getAccuracyMultiLureBonus(lures: NonNullable<AccuracyGag>[], baseline: NonNullable<AccuracyGag>) {
  const baselineType = getAccuracyLureType(baseline.gagIndex);
  const baselineTier = getAccuracyLureTier(baseline.gagIndex);
  return lures.reduce((bonus, lure) => {
    if (lure === baseline || getAccuracyLureType(lure.gagIndex) !== baselineType) return bonus;
    const tierDifference = baselineTier - getAccuracyLureTier(lure.gagIndex);
    return bonus + (tierDifference <= 0 ? 20 : tierDifference === 1 ? 15 : 10);
  }, 0);
}

const ACCURACY_TRACK_ORDER = ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop', 'special'] as const;

function isRemoteControlled(roundGags: AccuracyGag[], cog: AccuracyCog, cogIndex: number) {
  if (cog.remote) return true;
  return roundGags.some((gag) => !!gag
    && gag.trackId === 'special'
    && gag.gagIndex >= 1
    && gag.gagIndex <= 6
    && (gag.target === 'all' || gag.targetIdx === cogIndex));
}

function getTrapPhaseState(roundGags: AccuracyGag[], cog: AccuracyCog, cogIndex: number) {
  const allSelectedTraps = roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag
    && gag.trackId === 'trap');
  const targetedTraps = roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag
    && gag.trackId === 'trap'
    && (gag.target === 'all' || gag.targetIdx === cogIndex));

  if (targetedTraps.length === 0) return { trapped: cog.isTrapped, lured: cog.isLured };
  // Railroad is one indivisible group placement. If any other Trap is used
  // with it, the entire Railroad combination cancels rather than leaving
  // Railroad active on the non-overlapping Cogs.
  if (allSelectedTraps.length > 1 && allSelectedTraps.some((trap) => trap.gagIndex === 6)) {
    return { trapped: false, lured: cog.isLured };
  }
  // Multiple Trap gags aimed at the same Cog cancel one another without
  // waking a Cog that was already lured. Unlike Railroad, an all-target Trap
  // SOS still applies normally to its non-overlapping Cogs.
  if (targetedTraps.length > 1) return { trapped: false, lured: cog.isLured };

  const trap = targetedTraps[0];
  if (trap.gagIndex === 6) {
    // Railroad overrides both carried Traps and carried Lure.
    return { trapped: true, lured: false };
  }
  // Trap SOS cards (and ordinary single-target Traps) only place on a Cog
  // with a vacant Trap spot; they do not wake an already-lured Cog.
  if (!cog.isLured && !cog.isTrapped) return { trapped: true, lured: false };
  return { trapped: cog.isTrapped, lured: cog.isLured };
}

function getGroupInheritedStunBonus(roundGags: AccuracyGag[], roundCogs: AccuracyCog[], trackId: string) {
  const currentTrackIndex = ACCURACY_TRACK_ORDER.indexOf(trackId as (typeof ACCURACY_TRACK_ORDER)[number]);
  if (currentTrackIndex <= 0) return 0;

  const previousTracks = new Set<string>(ACCURACY_TRACK_ORDER.slice(0, currentTrackIndex));
  const hasLiveTarget = (gag: NonNullable<AccuracyGag>) => gag.target === 'all'
    ? roundCogs.some((cog) => !cog.isDead)
    : typeof gag.targetIdx === 'number' && !roundCogs[gag.targetIdx]?.isDead;
  const lures = previousTracks.has('lure')
    ? roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag && gag.trackId === 'lure')
    : [];
  const activatedTrapTargetCount = roundCogs.filter((cog, cogIndex) => {
    if (cog.isDead || !lures.some((lure) => lure.target === 'all' || lure.targetIdx === cogIndex)) return false;
    return getTrapPhaseState(roundGags, cog, cogIndex).trapped;
  }).length;
  const ordinaryStunBonus = roundGags
    .filter((gag): gag is NonNullable<AccuracyGag> => !!gag
      && previousTracks.has(gag.trackId)
      && gag.trackId !== 'trap'
      && gag.trackId !== 'lure'
      && gag.trackId !== 'special'
      && hasLiveTarget(gag))
    .reduce((bonus) => bonus + 25, 0);
  return ordinaryStunBonus + activatedTrapTargetCount * 50;
}

function getLuredRatioBonus(roundGags: AccuracyGag[], roundCogs: AccuracyCog[], trackId: string) {
  const currentTrackIndex = ACCURACY_TRACK_ORDER.indexOf(trackId as (typeof ACCURACY_TRACK_ORDER)[number]);
  if (currentTrackIndex < 0) return 0;
  const livingCogIndexes = roundCogs.map((cog, index) => !cog.isDead ? index : -1).filter((index) => index >= 0);
  if (!livingCogIndexes.length) return 0;

  const isTargeted = (gag: NonNullable<AccuracyGag>, cogIndex: number) => gag.target === 'all' || gag.targetIdx === cogIndex;
  const luredOrRemoteCount = livingCogIndexes.filter((cogIndex) => {
    const cog = roundCogs[cogIndex];
    let lured = !!cog.isLured;
    for (const priorTrack of ACCURACY_TRACK_ORDER.slice(0, currentTrackIndex)) {
      const targetedGags = roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag
        && gag.trackId === priorTrack
        && isTargeted(gag, cogIndex));
      if (!targetedGags.length) continue;
      if (priorTrack === 'trap') {
        lured = getTrapPhaseState(roundGags, cog, cogIndex).lured;
      } else if (priorTrack === 'lure') {
        lured = !getTrapPhaseState(roundGags, cog, cogIndex).trapped;
      } else if (priorTrack === 'sound' || priorTrack === 'throw' || priorTrack === 'squirt') {
        lured = false;
      }
    }
    return lured || isRemoteControlled(roundGags, cog, cogIndex);
  }).length;

  if (luredOrRemoteCount === 0 || luredOrRemoteCount === livingCogIndexes.length) return 0;
  return luredOrRemoteCount / livingCogIndexes.length * 100;
}

export function calculateRoundAccuracy(
  roundGags: AccuracyGag[],
  roundCogs: AccuracyCog[],
  getCogName: (cog: AccuracyCog, index: number) => string = (_cog, index) => `Cog ${index + 1}`,
  presetToonsHit = false,
) {
  const toonsHitBonus = presetToonsHit || getToonsHitRounds([roundGags])[0] > 0 ? TOONS_HIT_BONUS : 0;
  const perCog: RoundCogAccuracy[] = [];
  const trapPhaseStates = roundCogs.map((cog, cogIndex) => getTrapPhaseState(roundGags, cog, cogIndex));
  const placedTrapCount = roundCogs.filter((cog, cogIndex) => !cog.isDead && trapPhaseStates[cogIndex].trapped).length;
  const groupTargetTracks = new Set(roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag && gag.target === 'all').map((gag) => gag.trackId));
  const mixedTrackSourceTargets = new Map<string, Set<number>>();
  groupTargetTracks.forEach((trackId) => {
    const targets = roundGags
      .filter((gag): gag is NonNullable<AccuracyGag> => !!gag && gag.trackId === trackId && gag.target === 'single' && typeof gag.targetIdx === 'number')
      .map((gag) => gag.targetIdx!);
    if (targets.length) mixedTrackSourceTargets.set(trackId, new Set(targets));
  });

  roundCogs.forEach((cog, cogIndex) => {
    if (cog.isDead) return;
    const targetedGags = roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag && (gag.target === 'all' || gag.targetIdx === cogIndex));
    if (!targetedGags.length) return;
    const defense = SUPERVISOR_EVASION[cog.id] ?? COG_DEFENSE[Number(cog.id)] ?? COG_DEFENSE[20];
    const entries: CogAccuracyEntry[] = [];
    let stunBonus = 0;
    let lured = !!cog.isLured;
    const trapPhaseState = trapPhaseStates[cogIndex];
    for (const trackId of ACCURACY_TRACK_ORDER) {
      const trackGags = targetedGags.filter((gag) => gag.trackId === trackId);
      if (!trackGags.length) continue;
      const allTrackGags = roundGags.filter((gag): gag is NonNullable<AccuracyGag> => !!gag && gag.trackId === trackId);
      const singleTrackGags = allTrackGags.filter((gag) => gag.target === 'single');
      const hasGroupGag = allTrackGags.some((gag) => gag.target === 'all');
      const inheritedStunBonus = hasGroupGag ? getGroupInheritedStunBonus(roundGags, roundCogs, trackId) : stunBonus;
      const baselineCandidates = hasGroupGag && singleTrackGags.length ? singleTrackGags : trackGags;
      const baseline = baselineCandidates.reduce((highest, gag) => gag.gagIndex > highest.gagIndex ? gag : highest);
      const baseAccuracy = TRACK_BASE_ACCURACY[trackId]?.[baseline.gagIndex] ?? 100;
      const organicBonus = trackId === 'lure' && baseline.variant === 'organic' ? 10 : 0;
      // In a mixed single/group Lure track, the single-target gag supplies the
      // shared accuracy roll. Its Trap bonus therefore comes only from the
      // Trap on that gag's target, not every Trap covered by the group Lure.
      const lureAffectsGroup = trackId === 'lure' && baseline.target === 'all';
      const trapBonusCount = trackId === 'lure'
        ? (lureAffectsGroup ? placedTrapCount : Number(trapPhaseState.trapped))
        : 0;
      const trapPlacementBonus = trapBonusCount > 0 ? 10 + (lureAffectsGroup ? (trapBonusCount - 1) * 5 : 0) : 0;
      const lureBonus = trackId === 'lure' ? getAccuracyMultiLureBonus(trackGags, baseline) : 0;
      const receivesLuredRatio = trackId === 'sound'
        || ((trackId === 'throw' || trackId === 'squirt') && allTrackGags.some((gag) => gag.gagIndex === 6));
      const luredRatio = receivesLuredRatio ? getLuredRatioBonus(roundGags, roundCogs, trackId) : 0;
      const rawAccuracy = Math.min(baseAccuracy + organicBonus, MAX_TOON_ACCURACY) + MAX_TRACK_EXP_BONUS - defense
        + (trackId === 'lure' ? trapPlacementBonus + lureBonus : inheritedStunBonus + luredRatio) + toonsHitBonus;
      const hasSos = trackGags.some((gag) => gag.variant === 'sos');
      let accuracy = applyAccuracySoftCap(rawAccuracy);
      let specialRule: string | undefined;
      if (trackId === 'drop' && lured) { accuracy = 0; specialRule = 'Drop always misses a lured Cog'; }
      else if (trackId === 'trap' || trackId === 'special' || hasSos) { accuracy = 100; specialRule = trackId === 'trap' ? 'Trap placement always hits' : 'Special/SOS gag always hits'; }
      else if (isRemoteControlled(roundGags, cog, cogIndex)) { accuracy = 100; specialRule = 'Gags cannot miss a remote-controlled Cog'; }
      else if (lured && trackId !== 'lure') { accuracy = 100; specialRule = 'Attacking a lured Cog always hits'; }
      entries.push({ toonsHitBonus: specialRule ? 0 : toonsHitBonus, trackId, accuracy, baseAccuracy, organicBonus: specialRule ? 0 : organicBonus, defense: specialRule ? 0 : defense, stunBonus: specialRule || trackId === 'lure' ? 0 : inheritedStunBonus, trapPlacementBonus: specialRule ? 0 : trapPlacementBonus, lureBonus: specialRule ? 0 : lureBonus, luredRatio: specialRule ? 0 : luredRatio, rawAccuracy: specialRule ? accuracy : rawAccuracy, specialRule });
      if (accuracy > 0 && trackId !== 'trap' && trackId !== 'lure' && trackId !== 'special') stunBonus += trackGags.length * 25;
      if (trackId === 'lure' && accuracy > 0) {
        if (trapPhaseState.trapped) stunBonus += 50;
        lured = !trapPhaseState.trapped;
      }
      if (trackId === 'trap') lured = trapPhaseState.lured;
      if (trackId === 'sound' || trackId === 'throw' || trackId === 'squirt') lured = false;
    }
    perCog.push({ cogIndex, cogName: getCogName(cog, cogIndex), accuracy: entries.reduce((chance, entry) => chance * entry.accuracy / 100, 1) * 100, entries });
  });

  mixedTrackSourceTargets.forEach((sourceTargets, trackId) => {
    const sourceAccuracy = Math.min(...perCog
      .filter((cog) => sourceTargets.has(cog.cogIndex))
      .flatMap((cog) => cog.entries.filter((entry) => entry.trackId === trackId).map((entry) => entry.accuracy)));
    if (!Number.isFinite(sourceAccuracy)) return;
    perCog.forEach((cog) => {
      const entry = cog.entries.find((candidate) => candidate.trackId === trackId);
      if (entry && !sourceTargets.has(cog.cogIndex)
        && !isRemoteControlled(roundGags, roundCogs[cog.cogIndex], cog.cogIndex)) {
        entry.accuracy = sourceAccuracy;
        entry.rawAccuracy = sourceAccuracy;
        entry.specialRule = 'Shared track uses the single-target gag accuracy and target state';
      }
      cog.accuracy = cog.entries.reduce((chance, candidate) => chance * candidate.accuracy / 100, 1) * 100;
    });
  });

  const sharedTrackAccuracy = new Map<string, number>();
  perCog.forEach((cog) => cog.entries.forEach((entry) => {
    if (groupTargetTracks.has(entry.trackId) && !mixedTrackSourceTargets.has(entry.trackId)) {
      sharedTrackAccuracy.set(entry.trackId, Math.min(sharedTrackAccuracy.get(entry.trackId) ?? 100, entry.accuracy));
    }
  }));
  const sharedTrackBreakdowns = new Map<string, CogAccuracyEntry>();
  sharedTrackAccuracy.forEach((sharedAccuracy, trackId) => {
    const candidates = perCog.flatMap((cog) => cog.entries.filter((entry) => entry.trackId === trackId && entry.accuracy === sharedAccuracy));
    const representative = candidates.find((entry) => !entry.specialRule) ?? candidates[0];
    if (representative) sharedTrackBreakdowns.set(trackId, representative);
  });
  perCog.forEach((cog) => {
    cog.entries.forEach((entry) => {
      const representative = sharedTrackBreakdowns.get(entry.trackId);
      if (!representative) return;
      Object.assign(entry, representative, { trackId: entry.trackId });
    });
    cog.accuracy = cog.entries.reduce((chance, entry) => chance * entry.accuracy / 100, 1) * 100;
  });

  const factors: Array<{ label: string; accuracy: number }> = [];
  let totalChance = 1;
  perCog.forEach((cog) => cog.entries.forEach((entry) => {
    if (groupTargetTracks.has(entry.trackId)) {
      const sourceTargets = mixedTrackSourceTargets.get(entry.trackId);
      if (sourceTargets) {
        if (sourceTargets.has(cog.cogIndex)) {
          totalChance *= entry.accuracy / 100;
          factors.push({ label: `${cog.cogName} ${entry.trackId}`, accuracy: entry.accuracy });
        }
      }
    } else {
      totalChance *= entry.accuracy / 100;
      factors.push({ label: `${cog.cogName} ${entry.trackId}`, accuracy: entry.accuracy });
    }
  }));
  sharedTrackAccuracy.forEach((accuracy, trackId) => {
    totalChance *= accuracy / 100;
    factors.push({ label: `${trackId} group`, accuracy });
  });
  return { total: perCog.length ? totalChance * 100 : 0, perCog, factors };
}
