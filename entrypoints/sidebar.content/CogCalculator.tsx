import React, { useState, useMemo, memo, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gags as gagsConfig } from './gags';

// ─── Constants & Types ────────────────────────────────────────────────────────

const COG_HEALTH: Record<number, number> = {
  1: 6, 2: 12, 3: 20, 4: 30, 5: 42, 6: 56, 7: 72, 8: 90, 9: 110, 10: 132,
  11: 156, 12: 196, 13: 224, 14: 254, 15: 286, 16: 320, 17: 356, 18: 394, 19: 434, 20: 476
};

// Keep these as canonical decimal values. Constructing 0.6 as 0.2 * 3
// produces 0.6000000000000001 in JavaScript and changes Math.ceil outcomes.
const DEFENSE_DOWN_MULTIPLIERS = [0, 0.2, 0.4, 0.6];
const TRACK_BASE_ACCURACY: Record<string, readonly number[]> = {
  trap: [100, 100, 100, 100, 100, 100, 100], lure: [60, 55, 70, 65, 80, 75, 90],
  sound: [95, 95, 95, 95, 95, 95, 95], throw: [75, 75, 75, 75, 75, 75, 75],
  squirt: [95, 95, 95, 95, 95, 95, 95], drop: [50, 50, 50, 50, 50, 50, 50],
};
const COG_DEFENSE: Record<number, number> = {
  1: 2, 2: 5, 3: 10, 4: 15, 5: 20, 6: 25, 7: 30, 8: 35, 9: 40, 10: 45,
  11: 50, 12: 55, 13: 60, 14: 60, 15: 60, 16: 65, 17: 65, 18: 65, 19: 65, 20: 65,
};
const SUPERVISOR_EVASION: Record<string, number> = {
  factory_scrap: 50, factory_steel: 50, mint_coin: 50, mint_bullion: 50,
  office_junior: 55, office_senior: 55, golf_fairway: 45, golf_fringe: 45,
};
const MAX_TRACK_EXP_BONUS = 60;
const MAX_TOON_ACCURACY = 95;

import { browser } from 'wxt/browser';

function getExtensionImageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  try {
    return browser.runtime.getURL(cleanPath as any);
  } catch (e) {
    return `/${cleanPath}`;
  }
}

const COG_CHOICES = [
  ...[...Array(20)].map((_, i) => ({
    id: `${i + 1}`,
    label: `Level ${i + 1}`,
    hp: COG_HEALTH[i + 1],
    type: 'normal' as const,
    img: 'https://toonhq.org/static/assets/cogs/skelecog.png'
  })),
  { id: 'factory_scrap', label: 'Scrap Factory Foreman', hp: 250, type: 'boss' as const, img: getExtensionImageUrl('images/foreman.webp') },
  { id: 'factory_steel', label: 'Steel Factory Foreman', hp: 750, type: 'boss' as const, img: getExtensionImageUrl('images/foreman.webp') },
  { id: 'mint_coin', label: 'Coin Mint Auditor', hp: 750, type: 'boss' as const, img: getExtensionImageUrl('images/auditor.webp') },
  { id: 'mint_bullion', label: 'Bullion Mint Auditor', hp: 1150, type: 'boss' as const, img: getExtensionImageUrl('images/auditor.webp') },
  { id: 'office_junior', label: 'Junior Office Clerk', hp: 1100, type: 'boss' as const, img: getExtensionImageUrl('images/clerk.webp') },
  { id: 'office_senior', label: 'Senior Office Clerk', hp: 1500, type: 'boss' as const, img: getExtensionImageUrl('images/clerk.webp') },
  { id: 'golf_fairway', label: 'First Fairway President', hp: 1300, type: 'boss' as const, img: getExtensionImageUrl('images/president.webp') },
  { id: 'golf_fringe', label: 'Final Fringe President', hp: 1750, type: 'boss' as const, img: getExtensionImageUrl('images/president.webp') },
];

const SKELECOG_IMAGES = {
  sellbot: getExtensionImageUrl('images/Skelecog-sellbot-mrhollywood.webp'),
  cashbot: getExtensionImageUrl('images/Skelecog-cashbot-robberbaron.webp'),
  lawbot: getExtensionImageUrl('images/Skelecog-lawbot-bigwig.webp'),
  bossbot: getExtensionImageUrl('images/Skelecog-bossbot-thebigcheese.webp'),
} as const;

function getSkelecogImage(preset?: string | null) {
  if (!preset) return SKELECOG_IMAGES.sellbot;
  if (/mint/i.test(preset)) return SKELECOG_IMAGES.cashbot;
  if (/office/i.test(preset)) return SKELECOG_IMAGES.lawbot;
  if (/fairway|fringe|golf/i.test(preset)) return SKELECOG_IMAGES.bossbot;
  return SKELECOG_IMAGES.sellbot;
}

const SOS_MOE = 'https://rendition.toontownrewritten.com/render/7401000001000000008b010e000e0e010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_SID = 'https://rendition.toontownrewritten.com/render/7401010101000b000b8b0101000101010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_BARB = 'https://rendition.toontownrewritten.com/render/7407020201011a011a0a1d17001717010400000000000000000000000000000000/portrait/128x128.webp';

const SOS_CLERK_WILL = 'https://rendition.toontownrewritten.com/render/740f010201000b000b05000a000a0a010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_CLERK_PENNY = 'https://rendition.toontownrewritten.com/render/74120201000019001908050c000c0c010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_CLERK_CLARA = 'https://rendition.toontownrewritten.com/render/741101020001090109171502000202010400000000000000000000000000000000/portrait/128x128.webp';

const SOS_STINKY_NED = 'https://rendition.toontownrewritten.com/render/7415000001000000008b0206000606010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_NANCY_GAS = 'https://rendition.toontownrewritten.com/render/7412000001010101010e1b08000808010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_LIL_OLDMAN = 'https://rendition.toontownrewritten.com/render/7411020101010501058b0915001515010400000000000000000000000000000000/portrait/128x128.webp';

const SOS_CLUMSY_NED = 'https://rendition.toontownrewritten.com/render/740c020201010701078b0a0c000c0c010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_FRANZ_NECKVEIN = 'https://rendition.toontownrewritten.com/render/740d000101000200028b0607000707010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_BARNACLE_BESSIE = 'https://rendition.toontownrewritten.com/render/7414050200010c010c01190d000d0d010400000000000000000000000000000000/portrait/128x128.webp';


export const SOS_GAGS: Record<string, Array<{ gagIndex: number; damage: number; rounds?: number; dmgOthers?: number; dmgExpire?: number; image: string; name: string; isInstaKill?: boolean; isRemote?: boolean; isHeal?: boolean; stars?: number }>> = {
  trap: [
    { gagIndex: 3, damage: 60, image: SOS_CLERK_WILL, name: "Clerk Will" },
    { gagIndex: 4, damage: 120, image: SOS_CLERK_PENNY, name: "Clerk Penny" },
    { gagIndex: 5, damage: 180, image: SOS_CLERK_CLARA, name: "Clerk Clara" },
  ],
  special: [
    { gagIndex: 0, damage: 9999, image: getExtensionImageUrl('images/pinkslips.png'), name: "Pink Slip", isInstaKill: true },
    { gagIndex: 1, damage: 0, rounds: 2, dmgOthers: 45, dmgExpire: 45, image: getExtensionImageUrl('images/remotes.png'), name: "1-Star Damage Remote", isRemote: true, stars: 1 },
    { gagIndex: 2, damage: 0, rounds: 3, dmgOthers: 60, dmgExpire: 90, image: getExtensionImageUrl('images/remotes.png'), name: "2-Star Damage Remote", isRemote: true, stars: 2 },
    { gagIndex: 3, damage: 0, rounds: 4, dmgOthers: 75, dmgExpire: 150, image: getExtensionImageUrl('images/remotes.png'), name: "3-Star Damage Remote", isRemote: true, stars: 3 },
    { gagIndex: 4, damage: 0, rounds: 2, dmgOthers: 0, dmgExpire: 45, image: getExtensionImageUrl('images/remotesheal.png'), name: "1-Star Heal Remote", isRemote: true, stars: 1, isHeal: true },
    { gagIndex: 5, damage: 0, rounds: 3, dmgOthers: 0, dmgExpire: 90, image: getExtensionImageUrl('images/remotesheal.png'), name: "2-Star Heal Remote", isRemote: true, stars: 2, isHeal: true },
    { gagIndex: 6, damage: 0, rounds: 4, dmgOthers: 0, dmgExpire: 150, image: getExtensionImageUrl('images/remotesheal.png'), name: "3-Star Heal Remote", isRemote: true, stars: 3, isHeal: true },
  ],
  sound: [
    { gagIndex: 3, damage: 35, image: SOS_BARB, name: "Barbara Seville" },
    { gagIndex: 4, damage: 55, image: SOS_SID, name: "Sid Sonata" },
    { gagIndex: 5, damage: 75, image: SOS_MOE, name: "Moe Zart" },
  ],
  lure: [
    { gagIndex: 3, damage: 0, image: SOS_STINKY_NED, name: "Stinky Ned", rounds: 4 },
    { gagIndex: 4, damage: 0, image: SOS_NANCY_GAS, name: "Nancy Gas", rounds: 5 },
    { gagIndex: 5, damage: 0, image: SOS_LIL_OLDMAN, name: "Lil Oldman", rounds: 6 },
  ],
  drop: [
    { gagIndex: 3, damage: 60, image: SOS_CLUMSY_NED, name: "Clumsy Ned" },
    { gagIndex: 4, damage: 100, image: SOS_FRANZ_NECKVEIN, name: "Franz Neckvein" },
    { gagIndex: 5, damage: 170, image: SOS_BARNACLE_BESSIE, name: "Barnacle Bessie" },
  ],
};

const LURE_DURATIONS: Record<number, number> = {
  0: 3, 1: 3, 2: 4, 3: 4, 4: 5, 5: 5, 6: 9
};

type GagVariant = 'base' | 'organic' | 'sos';
type SelectedGag = { trackId: string; gagIndex: number; variant: GagVariant; target: 'single' | 'all'; targetIdx?: number } | null;


type GagTrack = {
  id: string;
  name: string;
  color: string;
  gags: Array<{ name: string; image: string; base: number; organic?: number }>;
};

interface Cog {
  id: string;
  isTrapped: boolean;
  isLured: boolean;
  isAttentive?: boolean;
  isDefenseDown?: boolean;
  isImmunity?: boolean;
  isOverpaid?: boolean;
  isRemoteDmg?: boolean;
  isRemoteHeal?: boolean;
  isTenure?: boolean;
  lureDuration?: number;
  trapDamage?: number;
  isV2?: boolean;
  isDead?: boolean;
  isOfficeSpawnedSupport?: boolean;
  hasTriggeredOfficeImmunity?: boolean;
  immunitySupportCount?: number;
  pendingOfficeSupportLevel?: number;
  simMaxHp?: number;
  simRemainingHp?: number;
  remote?: {
    roundsLeft: number;
    damageToOthers: number;
    damageOnExpire: number;
    stars: number;
    isHeal: boolean;
  };
}

function withoutCogSimulationState(cog: Cog): Cog {
  const { isDead: _isDead, simMaxHp: _simMaxHp, simRemainingHp: _simRemainingHp, ...editableCog } = cog;
  return editableCog;
}

type CogAccuracyEntry = { trackId: string; accuracy: number; baseAccuracy: number; organicBonus: number; defense: number; stunBonus: number; trapPlacementBonus: number; lureBonus: number; rawAccuracy: number; specialRule?: string };
type RoundCogAccuracy = { cogIndex: number; cogName: string; accuracy: number; entries: CogAccuracyEntry[] };

function formatAccuracy(value: number) { return Number(value.toFixed(2)).toString(); }
function applyAccuracySoftCap(rawAccuracy: number) {
  return rawAccuracy <= MAX_TOON_ACCURACY ? Math.max(0, rawAccuracy) : Math.min(100, MAX_TOON_ACCURACY + (rawAccuracy - MAX_TOON_ACCURACY) * 0.04);
}

function getAccuracyLureType(gagIndex: number) { return gagIndex === 6 || gagIndex % 2 === 1 ? 'group' : 'single'; }
function getAccuracyLureTier(gagIndex: number) { return Math.min(3, Math.floor(gagIndex / 2) + 1); }
function getAccuracyMultiLureBonus(lures: NonNullable<SelectedGag>[], baseline: NonNullable<SelectedGag>) {
  const baselineType = getAccuracyLureType(baseline.gagIndex);
  const baselineTier = getAccuracyLureTier(baseline.gagIndex);
  return lures.reduce((bonus, lure) => {
    if (lure === baseline || getAccuracyLureType(lure.gagIndex) !== baselineType) return bonus;
    const tierDifference = baselineTier - getAccuracyLureTier(lure.gagIndex);
    return bonus + (tierDifference <= 0 ? 20 : tierDifference === 1 ? 15 : 10);
  }, 0);
}

function calculateRoundAccuracy(roundGags: SelectedGag[], roundCogs: Cog[]) {
  const perCog: RoundCogAccuracy[] = [];
  const carriedTrapCount = roundCogs.filter((cog) => !cog.isDead && cog.isTrapped).length;
  const groupTargetTracks = new Set(roundGags.filter((gag): gag is NonNullable<SelectedGag> => !!gag && gag.target === 'all').map((gag) => gag.trackId));
  const mixedTrackSourceTargets = new Map<string, Set<number>>();
  groupTargetTracks.forEach((trackId) => {
    const targets = roundGags
      .filter((gag): gag is NonNullable<SelectedGag> => !!gag && gag.trackId === trackId && gag.target === 'single' && typeof gag.targetIdx === 'number')
      .map((gag) => gag.targetIdx!);
    if (targets.length) mixedTrackSourceTargets.set(trackId, new Set(targets));
  });
  roundCogs.forEach((cog, cogIndex) => {
    if (cog.isDead) return;
    const targetedGags = roundGags.filter((gag): gag is NonNullable<SelectedGag> => !!gag && (gag.target === 'all' || gag.targetIdx === cogIndex));
    if (!targetedGags.length) return;
    const choice = COG_CHOICES.find((candidate) => candidate.id === cog.id);
    const defense = SUPERVISOR_EVASION[cog.id] ?? COG_DEFENSE[Number(cog.id)] ?? COG_DEFENSE[20];
    const entries: CogAccuracyEntry[] = [];
    let stunBonus = 0;
    let lured = !!cog.isLured;
    for (const trackId of ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop', 'special']) {
      const trackGags = targetedGags.filter((gag) => gag.trackId === trackId);
      if (!trackGags.length) continue;
      const allTrackGags = roundGags.filter((gag): gag is NonNullable<SelectedGag> => !!gag && gag.trackId === trackId);
      const singleTrackGags = allTrackGags.filter((gag) => gag.target === 'single');
      const hasGroupGag = allTrackGags.some((gag) => gag.target === 'all');
      const baselineCandidates = hasGroupGag && singleTrackGags.length ? singleTrackGags : trackGags;
      const baseline = baselineCandidates.reduce((highest, gag) => gag.gagIndex > highest.gagIndex ? gag : highest);
      const baseAccuracy = TRACK_BASE_ACCURACY[trackId]?.[baseline.gagIndex] ?? 100;
      const organicBonus = trackId === 'lure' && baseline.variant === 'organic' ? 10 : 0;
      const targetedTraps = roundGags.filter((gag): gag is NonNullable<SelectedGag> => !!gag && gag.trackId === 'trap' && (gag.target === 'all' || gag.targetIdx === cogIndex));
      const allRoundTraps = roundGags.filter((gag): gag is NonNullable<SelectedGag> => !!gag && gag.trackId === 'trap');
      const trapBonusCount = trackId === 'lure'
        ? (hasGroupGag ? allRoundTraps.length + carriedTrapCount : targetedTraps.length + Number(cog.isTrapped))
        : 0;
      const trapPlacementBonus = trapBonusCount > 0 ? 10 + (hasGroupGag ? (trapBonusCount - 1) * 5 : 0) : 0;
      const lureBonus = trackId === 'lure' ? getAccuracyMultiLureBonus(trackGags, baseline) : 0;
      const rawAccuracy = Math.min(baseAccuracy + organicBonus, MAX_TOON_ACCURACY) + MAX_TRACK_EXP_BONUS - defense + (trackId === 'lure' ? trapPlacementBonus + lureBonus : stunBonus);
      const hasSos = trackGags.some((gag) => gag.variant === 'sos');
      let accuracy = applyAccuracySoftCap(rawAccuracy);
      let specialRule: string | undefined;
      if (trackId === 'drop' && lured) { accuracy = 0; specialRule = 'Drop always misses a lured Cog'; }
      else if (trackId === 'trap' || trackId === 'special' || hasSos) { accuracy = 100; specialRule = trackId === 'trap' ? 'Trap placement always hits' : 'Special/SOS gag always hits'; }
      else if (lured && trackId !== 'lure') { accuracy = 100; specialRule = 'Attacking a lured Cog always hits'; }
      entries.push({ trackId, accuracy, baseAccuracy, organicBonus: specialRule ? 0 : organicBonus, defense: specialRule ? 0 : defense, stunBonus: specialRule || trackId === 'lure' ? 0 : stunBonus, trapPlacementBonus: specialRule ? 0 : trapPlacementBonus, lureBonus: specialRule ? 0 : lureBonus, rawAccuracy: specialRule ? accuracy : rawAccuracy, specialRule });
      if (accuracy > 0 && trackId !== 'lure' && trackId !== 'special') stunBonus += trackId === 'trap' ? 50 : trackGags.length * 25;
      if (trackId === 'lure' && accuracy > 0) {
        if (cog.isTrapped) stunBonus += 50;
        lured = !(cog.isTrapped || targetedTraps.length > 0);
      }
      if (trackId === 'trap' || trackId === 'sound' || trackId === 'throw' || trackId === 'squirt') lured = false;
    }
    perCog.push({ cogIndex, cogName: choice?.label ?? `Cog ${cogIndex + 1}`, accuracy: entries.reduce((chance, entry) => chance * entry.accuracy / 100, 1) * 100, entries });
  });
  mixedTrackSourceTargets.forEach((sourceTargets, trackId) => {
    const sourceAccuracy = Math.min(...perCog
      .filter((cog) => sourceTargets.has(cog.cogIndex))
      .flatMap((cog) => cog.entries.filter((entry) => entry.trackId === trackId).map((entry) => entry.accuracy)));
    if (!Number.isFinite(sourceAccuracy)) return;
    perCog.forEach((cog) => {
      const entry = cog.entries.find((candidate) => candidate.trackId === trackId);
      if (entry && !sourceTargets.has(cog.cogIndex)) {
        entry.accuracy = sourceAccuracy;
        entry.rawAccuracy = sourceAccuracy;
        entry.specialRule = 'Shared track uses the single-target gag’s accuracy and target state';
      }
      cog.accuracy = cog.entries.reduce((chance, candidate) => chance * candidate.accuracy / 100, 1) * 100;
    });
  });
  const sharedTrackAccuracy = new Map<string, number>();
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
      } else {
        sharedTrackAccuracy.set(entry.trackId, Math.min(sharedTrackAccuracy.get(entry.trackId) ?? 100, entry.accuracy));
      }
    }
    else {
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


const STATUS_EFFECTS = [
  { id: 'isTrapped', label: 'Trapped', icon: 'Statuseffect_trapped.png', color: 'bg-orange-500', shadow: 'rgba(249,115,22,0.4)' },
  { id: 'isLured', label: 'Lured', icon: 'Statuseffect_lured.png', color: 'bg-emerald-500', shadow: 'rgba(16,185,129,0.4)' },
  { id: 'isAttentive', label: 'Attentive', icon: 'Statuseffect_attentive.png', color: 'bg-blue-500', shadow: 'rgba(59,130,246,0.4)' },
  { id: 'isDefenseDown', label: 'Defense Down', icon: 'Statuseffect_defensedown.png', color: 'bg-red-500', shadow: 'rgba(239,68,68,0.4)' },
  { id: 'isDefenseUp', label: 'Defense Up', icon: 'Statuseffect_defenseup_Cog.png', color: 'bg-blue-600', shadow: 'rgba(37,99,235,0.4)' },
  { id: 'isImmunity', label: 'Immunity', icon: 'Statuseffect_immunity.png', color: 'bg-gray-500', shadow: 'rgba(107,114,128,0.4)' },
  { id: 'isOverpaid', label: 'Overpaid', icon: 'Statuseffect_overpaid.png', color: 'bg-yellow-500', shadow: 'rgba(234,179,8,0.4)' },
  { id: 'isRemoteDmg', label: 'Remote DMG', icon: 'Statuseffect_remotedmg.png', color: 'bg-violet-500', shadow: '#8b5cf6' },
  { id: 'isRemoteHeal', label: 'Remote HEAL', icon: 'Statuseffect_remotedmg.png', color: 'bg-violet-500', shadow: '#8b5cf6' },
  { id: 'isTenure', label: 'Tenure', icon: 'Statuseffect_tenure.png', color: 'bg-amber-500', shadow: 'rgba(245,158,11,0.4)' },
];

function getCogMaxHp(cog: Cog, allCogs: Cog[]): number {
  const choice = COG_CHOICES.find(x => x.id === cog.id);
  let baseHp = choice?.hp || 196;

  const isMintAuditor = cog.id === 'mint_coin' || cog.id === 'mint_bullion';
  if (!isMintAuditor) {
    const hasCoin = allCogs.some(c => c.id === 'mint_coin');
    const hasBullion = allCogs.some(c => c.id === 'mint_bullion');
    if (hasBullion) {
      baseHp += 200;
    } else if (hasCoin) {
      baseHp += 150;
    } else if (cog.isOverpaid) {
      baseHp += 150;
    }
  }

  return baseHp;
}

// ─── Components ───────────────────────────────────────────────────────────────

const GagButton = memo(({ imageSrc, imageAlt, color, title, organicTitle, damage, disabled = false, onClick, onOrganicClick, overlayBottom, targetPopup, organicTargetPopup, hasOrganic }: any) => {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`gag-button relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:brightness-110'
          }`}
        style={{ backgroundColor: color, borderColor: color }}
        title={title}
      >
        <div className="h-8 w-8 flex items-center justify-center">
          <img
            src={imageSrc}
            alt={imageAlt}
            draggable="false"
            className="h-8 w-8 rounded-sm drop-shadow-md object-contain"
          />
        </div>
        {overlayBottom && (
          <div className="absolute inset-x-0 bottom-0.5 flex justify-center gap-0.5 px-1">
            {overlayBottom}
          </div>
        )}
      </button>

      {hasOrganic && (
        <button
          type="button"
          onClick={onOrganicClick}
          className="absolute -top-2 -right-2 z-20 w-6 h-6 transition-all opacity-0 group-hover:opacity-100 grayscale hover:grayscale-0 hover:scale-125 active:scale-90 cursor-pointer flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          title={organicTitle || `Organic ${title}`}
        >
          <img
            src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
            alt="Organic"
            className="w-full h-full object-contain"
          />
        </button>
      )}

      {targetPopup}
      {organicTargetPopup}
    </div>
  );
});

const TargetPopup = ({ trackId, gagIndex, variant, cogs, activePreset, cogDamages, getHealthColor, activePopup, setActivePopup, onSelectGag, currentRoundGags }: any) => {
  const isOpen = activePopup?.trackId === trackId && activePopup?.gagIndex === gagIndex && activePopup?.variant === variant && !activePopup?.subType;
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({ left: '50%', transform: 'translateX(-50%)', visibility: 'hidden' });
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({ left: '50%', transform: 'translateX(-50%)' });

  useLayoutEffect(() => {
    if (isOpen && popupRef.current) {
      const popupRect = popupRef.current.getBoundingClientRect();
      const container = popupRef.current.closest('.gag-picker-container') || document.body;
      const containerRect = container.getBoundingClientRect();

      const button = popupRef.current.parentElement;
      if (!button) return;
      const buttonRect = button.getBoundingClientRect();

      const buttonCenter = buttonRect.left + buttonRect.width / 2;
      let targetLeft = buttonCenter - popupRect.width / 2;

      const margin = 8;
      if (targetLeft < containerRect.left + margin) {
        targetLeft = containerRect.left + margin;
      } else if (targetLeft + popupRect.width > containerRect.right - margin) {
        targetLeft = containerRect.right - margin - popupRect.width;
      }

      const relativeLeft = targetLeft - buttonRect.left;
      setPopupStyle({ left: `${relativeLeft}px`, transform: 'none', visibility: 'visible' });

      const relativeArrowLeft = buttonCenter - targetLeft;
      setArrowStyle({ left: `${relativeArrowLeft}px`, transform: 'translateX(-50%)' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div ref={popupRef} style={popupStyle} className="absolute bottom-full mb-3 w-max bg-[#0c3622] p-2 rounded-2xl border border-white/10 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex gap-2">
        {cogs.map((cog: any, cogIdx: number) => {
          const choice = COG_CHOICES.find(c => c.id === cog.id);
          const maxHp = cog.simMaxHp ?? getCogMaxHp(cog, cogs);
          const dmg = cogDamages[cogIdx] || 0;
          const remainingTotal = cog.simRemainingHp ?? Math.max(0, (cog.isV2 ? maxHp * 2 : maxHp) - dmg);
          const outerHp = cog.isV2 ? Math.max(0, remainingTotal - maxHp) : 0;
          const innerHp = Math.min(maxHp, remainingTotal);
          const pInner = (innerHp / maxHp) * 100;
          const pOuter = (outerHp / maxHp) * 100;
          const labelStr = choice?.type === 'boss' ? choice.label.split(' ').slice(-1)[0] : `Level ${cog.id}`;
          const cogImage = choice?.type === 'normal' ? getSkelecogImage(activePreset) : choice?.img;
          const gagData = (SOS_GAGS[trackId] || []).find(s => s.gagIndex === gagIndex) || gagsConfig.find(t => t.id === trackId)?.gags[gagIndex];

          const isPinkSlip = trackId === 'special' && gagIndex === 0;
          const isRemote = (gagData as any)?.isRemote;
          const isSupervisor = choice?.type === 'boss';
          const hasMintSupervisor = cogs.some((c: any) => c.id === 'mint_coin' || c.id === 'mint_bullion');
          const isTenured = cog.isTenure || isSupervisor || hasMintSupervisor;

          const hasRemoteActive = !!cog.remote;
          const hasRemoteSelectedThisRound = currentRoundGags.some((g: any) => {
            if (!g || g.variant !== 'sos') return false;
            const info = (SOS_GAGS[g.trackId] || []).find(s => s.gagIndex === g.gagIndex);
            if (!info?.isRemote) return false;
            return g.target === 'all' || g.targetIdx === cogIdx;
          });
          const hasRemoteStatus = hasRemoteActive || hasRemoteSelectedThisRound;

          let isDisabled = !!((isPinkSlip || isRemote) && isTenured) || !!cog.isDead;
          if (isRemote && hasRemoteStatus) isDisabled = true;
          if (trackId === 'lure' && !isPinkSlip && !isRemote && cog.isLured && !cog.isDead) isDisabled = true;
          const isRailroadTargeting = trackId === 'trap' && gagIndex === 6;
          if (trackId === 'trap' && !isPinkSlip && !isRailroadTargeting && (cog.isTrapped || cog.isLured) && !cog.isDead) isDisabled = true;
              const spawnedSupportStyle = cog.isOfficeSpawnedSupport ? { filter: 'sepia(1) saturate(5.5) hue-rotate(-45deg) brightness(0.92)' } : undefined;

          return (
            <button
              key={cogIdx}
              disabled={isDisabled}
              onClick={(e) => { e.stopPropagation(); onSelectGag(trackId, gagIndex, variant, cogIdx); setActivePopup(null); }}
              className={`group/target relative flex flex-col items-center justify-between p-2 w-20 h-24 rounded-xl border border-white/10 transition-all overflow-hidden ${isDisabled ? 'opacity-20 cursor-not-allowed grayscale bg-black/80' : 'bg-black/40 hover:bg-emerald-500/20 hover:border-emerald-500 cursor-pointer'}`}
            >
              {cogImage && <img src={cogImage as string} alt={labelStr} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover/target:opacity-80 group-hover/target:scale-110 transition-all duration-500" style={spawnedSupportStyle} />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center">
                <span className="text-[11px] font-black text-white/90 truncate max-w-full drop-shadow-md">{labelStr}</span>
              </div>
              <div className="relative z-10 w-full flex flex-col gap-1 mt-auto">
                <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden relative border border-white/10">
                  <div className={`absolute top-0 left-0 bottom-0 transition-all duration-300 ${cog.isV2 && outerHp > 0 ? 'bg-fuchsia-500' : getHealthColor(pInner)}`} style={{ width: `${cog.isV2 && outerHp > 0 ? pOuter : pInner}%` }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={arrowStyle} className="absolute top-full w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[#0c3622]"></div>
    </div>
  );
};

const RemoteStarsPopup = ({ gagIndex, activePopup, setActivePopup }: any) => {
  const isOpen = activePopup?.trackId === 'special' && activePopup?.gagIndex === gagIndex && activePopup?.subType === 'stars';
  if (!isOpen) return null;

  const isHeal = gagIndex === 4;
  const items = isHeal ? [4, 5, 6] : [1, 2, 3];
  const getRemoteTitle = (remote: any) => {
    if (!remote) return '';

    const selfDamage = `${remote.dmgExpire} self damage after ${remote.rounds} rounds`;
    if (remote.isHeal) return `${remote.name} (${selfDamage})`;

    return `${remote.name} (${remote.dmgOthers} damage for ${remote.rounds} rounds, ${selfDamage})`;
  };

  return (
    <div className="absolute bottom-full mb-3 right-0 w-max bg-[#0c3622] p-4 rounded-2xl border border-white/10 shadow-2xl z-[70] animate-in fade-in slide-in-from-bottom-2">
      <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 text-center">Select Level</div>
      <div className="flex gap-3">
        {items.map(idx => {
          const rem = SOS_GAGS.special.find(s => s.gagIndex === idx);
          return (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setActivePopup({ trackId: 'special', gagIndex: idx, variant: 'sos' }); }}
              className="group/star relative flex flex-col items-center gap-2 p-3 bg-black/40 hover:bg-violet-500/20 hover:border-violet-500/50 rounded-xl border border-white/5 transition-all cursor-pointer min-w-[64px]"
              title={getRemoteTitle(rem)}
            >
              <div className="relative">
                <img src={rem?.image} className="w-10 h-10 object-contain group-hover/star:scale-110 transition-transform" />
                <div className="absolute -top-1.5 inset-x-0 flex justify-center gap-0.5">
                  {[...Array(rem?.stars)].map((_, i) => <span key={i} className="text-yellow-400 text-[10px] drop-shadow-sm">★</span>)}
                </div>
              </div>
              <span className="text-[10px] font-black text-white/80">{rem?.stars} Star</span>
            </button>
          );
        })}
      </div>
      <div className="absolute top-full right-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[#0c3622]"></div>
    </div>
  );
};

function GagTrackRow({ track, mode, onSelectGag, cogs, activePreset, cogDamages, getHealthColor, activePopup, setActivePopup, currentRoundGags }: any) {
  const isBase = mode === 'base';
  const items = isBase ? track.gags : (SOS_GAGS[track.id] || []).filter((s: any) => [3, 4, 5].includes(s.gagIndex));

  const getBaseTitle = (gag: any, idx: number) => {
    if (track.id === 'lure') return `${gag.name} (${LURE_DURATIONS[idx]} rounds)`;
    return `${gag.name} (${gag.base})`;
  };

  const getOrganicTitle = (gag: any, idx: number) => {
    const organicValue = gag.organic ?? gag.base;
    if (track.id === 'lure') return `${gag.name} (Organic ${organicValue}%, ${LURE_DURATIONS[idx]} rounds)`;
    return `${gag.name} (Organic ${organicValue})`;
  };

  const getSosTitle = (gag: any) => {
    if (track.id === 'lure' && gag.rounds) return `${gag.name} (${gag.rounds} rounds)`;
    return `${gag.name} (${gag.damage})`;
  };

  const handleGagClick = (e: React.MouseEvent, idx: number, variant: GagVariant) => {
    e.stopPropagation();
    const isAllTarget = track.id === 'sound' || (['trap', 'lure', 'drop', 'throw', 'squirt'].includes(track.id) && idx === 6) || (track.id === 'lure' && [1, 3, 5].includes(idx)) || (!isBase && [3, 4, 5].includes(idx));

    let livingCount = 0;
    let livingTargetIdx = -1;
    cogs.forEach((c: any, i: number) => { if (!c.isDead) { livingCount++; livingTargetIdx = i; } });

    if (!isAllTarget && livingCount === 1 && livingTargetIdx !== -1) {
      onSelectGag(track.id, idx, variant, livingTargetIdx);
      setActivePopup(null);
    } else if (isAllTarget) {
      onSelectGag(track.id, idx, variant);
      setActivePopup(null);
    } else {
      if (activePopup?.trackId === track.id && activePopup?.gagIndex === idx && activePopup?.variant === variant) setActivePopup(null);
      else setActivePopup({ trackId: track.id, gagIndex: idx, variant });
    }
  };

  return (
    <div className="flex gap-1 h-10 items-center">
      {mode === 'sos' && items.length > 0 && <div className="w-px h-8 bg-white/10 mx-1" />}
      {items.map((gag: any, idx: number) => {
        const itemIdx = isBase ? idx : gag.gagIndex;
        const variant = isBase ? 'base' : 'sos';
        const titleText = isBase ? getBaseTitle(gag, idx) : getSosTitle(gag);
        const organicTitle = isBase ? getOrganicTitle(gag, idx) : undefined;

        let gagDisabled = false;
        if (cogs.filter((c: any) => !c.isDead).length === 0) gagDisabled = true;

        return (
          <GagButton
            key={itemIdx}
            imageSrc={isBase ? `https://toonhq.org/static/assets/gags/${gag.image}` : gag.image}
            imageAlt={gag.name}
            color={track.color}
            title={titleText}
            organicTitle={organicTitle}
            disabled={gagDisabled}
            onClick={(e: any) => handleGagClick(e, itemIdx, variant)}
            onOrganicClick={isBase ? ((e: any) => handleGagClick(e, itemIdx, 'organic')) : undefined}
            hasOrganic={isBase}
            targetPopup={<TargetPopup trackId={track.id} gagIndex={itemIdx} variant={variant} cogs={cogs} activePreset={activePreset} cogDamages={cogDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} onSelectGag={onSelectGag} currentRoundGags={currentRoundGags} />}
            organicTargetPopup={isBase ? <TargetPopup trackId={track.id} gagIndex={itemIdx} variant="organic" cogs={cogs} activePreset={activePreset} cogDamages={cogDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} onSelectGag={onSelectGag} currentRoundGags={currentRoundGags} /> : undefined}
          />
        );
      })}
    </div>
  );
}

function SpecialGagColumn({ mode, onSelectGag, cogs, activePreset, cogDamages, getHealthColor, activePopup, setActivePopup, currentRoundGags }: any) {
  const isPinkSlip = mode === 'slips';
  const specialGags = SOS_GAGS.special;

  const handleGagClick = (e: React.MouseEvent, gagIndex: number) => {
    e.stopPropagation();
    if (!isPinkSlip) {
      if (activePopup?.trackId === 'special' && activePopup?.gagIndex === gagIndex && activePopup?.subType === 'stars') setActivePopup(null);
      else setActivePopup({ trackId: 'special', gagIndex, variant: 'sos', subType: 'stars' });
    } else {
      if (activePopup?.trackId === 'special' && activePopup?.gagIndex === gagIndex) setActivePopup(null);
      else setActivePopup({ trackId: 'special', gagIndex, variant: 'sos' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {isPinkSlip ? (
        <div className="flex items-center gap-1">
          <div className="w-px h-8 bg-white/10 mx-1" />
          <GagButton
            imageSrc={specialGags[0].image}
            imageAlt="Pink Slip"
            color="#8b5cf6"
            title="Pink Slip"
            onClick={(e: any) => handleGagClick(e, 0)}
            targetPopup={<TargetPopup trackId="special" gagIndex={0} variant="sos" cogs={cogs} activePreset={activePreset} cogDamages={cogDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} onSelectGag={onSelectGag} currentRoundGags={currentRoundGags} />}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[1, 4].map(idx => (
            <div key={idx} className="flex items-center gap-1">
              <div className="w-px h-8 bg-white/10 mx-1" />
              <GagButton
                imageSrc={specialGags[idx].image}
                imageAlt={idx === 1 ? "Damage Remote" : "Heal Remote"}
                color="#8b5cf6"
                title={idx === 1 ? "Damage Remote" : "Heal Remote"}
                onClick={(e: any) => handleGagClick(e, idx)}
                targetPopup={
                  activePopup?.trackId === 'special' && [idx, idx + 1, idx + 2].includes(activePopup.gagIndex) && activePopup.subType !== 'stars'
                    ? <TargetPopup trackId="special" gagIndex={activePopup.gagIndex} variant="sos" cogs={cogs} activePreset={activePreset} cogDamages={cogDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} onSelectGag={onSelectGag} currentRoundGags={currentRoundGags} />
                    : <RemoteStarsPopup gagIndex={idx} activePopup={activePopup} setActivePopup={setActivePopup} />
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FACILITY_PRESETS = [
  { name: "Scrap Factory", bossId: 'factory_scrap', cogs: [{ id: 'factory_scrap', isV2: false }, { id: '5', isV2: false }, { id: '5', isV2: false }, { id: '6', isV2: false }] },
  { name: "Steel Factory", bossId: 'factory_steel', cogs: [{ id: 'factory_steel', isV2: false }, { id: '11', isV2: false }, { id: '11', isV2: false }, { id: '12', isV2: false }] },
  { name: "Coin Mint", bossId: 'mint_coin', cogs: [{ id: 'mint_coin', isV2: false }, { id: '10', isV2: false }, { id: '10', isV2: false }, { id: '9', isV2: false }] },
  { name: "Bullion Mint", bossId: 'mint_bullion', cogs: [{ id: 'mint_bullion', isV2: false }, { id: '12', isV2: false }, { id: '12', isV2: false }, { id: '11', isV2: false }] },
  { name: "Junior Office", bossId: 'office_junior', cogs: [{ id: '11', isV2: false }, { id: 'office_junior', isV2: false }, { id: '11', isV2: false }] },
  { name: "Senior Office", bossId: 'office_senior', cogs: [{ id: '13', isV2: false }, { id: 'office_senior', isV2: false }, { id: '13', isV2: false }] },
  { name: "First Fairway", bossId: 'golf_fairway', cogs: [{ id: '11', isV2: false }, { id: 'golf_fairway', isV2: false }, { id: '11', isV2: false }, { id: '10', isV2: false }] },
  { name: "Final Fringe", bossId: 'golf_fringe', cogs: [{ id: '13', isV2: false }, { id: 'golf_fringe', isV2: false }, { id: '13', isV2: false }, { id: '12', isV2: false }] },
];

const DEFAULT_COGS: Cog[] = [
  { id: '11', isTrapped: false, isLured: false, isV2: false },
  { id: '12', isTrapped: false, isLured: false, isV2: false },
  { id: '13', isTrapped: false, isLured: false, isV2: false },
  { id: '14', isTrapped: false, isLured: false, isV2: false },
];

export function CogCalculator() {
  const [cogs, setCogs] = useState<Cog[]>(() => {
    const saved = localStorage.getItem('cog-calc-cogs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved cogs", e);
      }
    }
    return DEFAULT_COGS.map(c => ({ ...c }));
  });

  const [selectedGagsByRound, setSelectedGagsByRound] = useState<SelectedGag[][]>(() => {
    const saved = localStorage.getItem('cog-calc-gags');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 9) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved gags", e);
      }
    }
    return [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];
  });

  const [activeRound, setActiveRound] = useState<number>(0);
  const [activeGagSlot, setActiveGagSlot] = useState<number>(0);
  const [activePopup, setActivePopup] = useState<{ trackId: string; gagIndex: number; variant: GagVariant, subType?: string } | null>(null);
  const [activeCogSlot, setActiveCogSlot] = useState<number | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string | null>(localStorage.getItem('cog-calc-preset') || null);
  const [roundAccuracyTooltip, setRoundAccuracyTooltip] = useState<{ result: ReturnType<typeof calculateRoundAccuracy>; round: number; anchor: { left: number; top: number; bottom: number }; root: Element | DocumentFragment } | null>(null);
  const [roundAccuracyTooltipPosition, setRoundAccuracyTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const roundAccuracyTooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tooltip = roundAccuracyTooltipRef.current;
    if (!roundAccuracyTooltip || !tooltip) {
      setRoundAccuracyTooltipPosition(null);
      return;
    }

    const viewportPadding = 8;
    const tooltipGap = 12;
    const bounds = tooltip.getBoundingClientRect();
    const halfWidth = bounds.width / 2;
    const left = Math.min(window.innerWidth - viewportPadding - halfWidth, Math.max(viewportPadding + halfWidth, roundAccuracyTooltip.anchor.left));
    const belowTop = roundAccuracyTooltip.anchor.bottom + tooltipGap;
    const aboveTop = roundAccuracyTooltip.anchor.top - bounds.height - tooltipGap;
    const top = belowTop + bounds.height <= window.innerHeight - viewportPadding
      ? belowTop
      : Math.max(viewportPadding, Math.min(window.innerHeight - viewportPadding - bounds.height, aboveTop));

    setRoundAccuracyTooltipPosition({ left, top });
  }, [roundAccuracyTooltip]);

  useEffect(() => {
    localStorage.setItem('cog-calc-cogs', JSON.stringify(cogs));
  }, [cogs]);

  useEffect(() => {
    localStorage.setItem('cog-calc-gags', JSON.stringify(selectedGagsByRound));
  }, [selectedGagsByRound]);

  useEffect(() => {
    if (activePreset) localStorage.setItem('cog-calc-preset', activePreset);
    else localStorage.removeItem('cog-calc-preset');
  }, [activePreset]);

  const gagTracks = useMemo(() => {
    return (gagsConfig as GagTrack[]).filter(t => t.id !== 'toonup');
  }, []);

  const handleSelectGag = (trackId: string, gagIndex: number, variant: GagVariant, targetIdx?: number) => {
    const sosData = variant === 'sos' ? (SOS_GAGS[trackId] || []).find(s => s.gagIndex === gagIndex) : null;
    const isSosInstaKill = sosData?.isInstaKill;
    const isRemote = sosData?.isRemote;
    const isAllTarget = trackId === 'sound' || (variant === 'sos' && !isSosInstaKill && !isRemote) || (['trap', 'lure', 'drop', 'throw', 'squirt'].includes(trackId) && gagIndex === 6) || (trackId === 'lure' && [1, 3, 5].includes(gagIndex));

    setSelectedGagsByRound(prev => {
      const next = [...prev.map(r => [...r])];
      next[activeRound][activeGagSlot] = {
        trackId,
        gagIndex,
        variant,
        target: isAllTarget ? 'all' : 'single',
        targetIdx: isAllTarget ? undefined : (targetIdx ?? 0)
      };
      return next;
    });
    setActiveGagSlot(prev => {
      const nextSlot = (prev + 1) % 4;
      if (nextSlot === 0) {
        setActiveRound(r => Math.min(r + 1, 8));
      }
      return nextSlot;
    });
  };

  const clearGagSlot = (rIdx: number, slotIdx: number) => {
    setSelectedGagsByRound(prev => {
      const next = [...prev.map(r => [...r])];
      next[rIdx][slotIdx] = null;
      return next;
    });
    setActiveRound(rIdx);
    setActiveGagSlot(slotIdx);
  };

  const getGagDamage = (gag: SelectedGag): number => {
    if (!gag) return 0;
    const track = gagTracks.find(t => t.id === gag.trackId);
    if (!track) return 0;

    if (gag.variant === 'sos') {
      const sos = (SOS_GAGS[gag.trackId] || []).find(s => s.gagIndex === gag.gagIndex);
      return sos?.damage ?? 0;
    }

    const gagData = track.gags[gag.gagIndex];
    if (!gagData) return 0;

    return gag.variant === 'organic' ? (gagData.organic ?? gagData.base) : gagData.base;
  };

  const roundResults = useMemo(() => {
    let currentCogs: Cog[] = cogs.map(c => ({
      ...c,
      lureDuration: 0,
      trapDamage: 0,
      remote: c.remote ? { ...c.remote } : undefined
    }));
    let cogStates = cogs.map(c => {
      return {
        maxHp: getCogMaxHp(c, cogs),
        layer: c.isV2 ? 2 : 1,
        damageOnCurrentLayer: 0,
        totalEffectiveDamage: 0,
      };
    });

    let cumulativeDamages = currentCogs.map(() => 0);
    const results = [];

    for (let r = 0; r < 9; r++) {
      const currentCogCount = currentCogs.length;
      const currentCogIndexes = currentCogs.map((_, idx) => idx);
      const selectedGags = selectedGagsByRound[r];
      const cogDamagesThisRound = Array(currentCogCount).fill(0);
      const trackDamages: Record<string, number> = {};
      const trapDamageOnCog = currentCogs.map(c => c.trapDamage || 0);

      const getRemainingHp = (idx: number) => {
        const state = cogStates[idx];
        const cog = currentCogs[idx];
        if (!state || !cog) return 0;
        const totalHp = state.maxHp * (cog.isV2 ? 2 : 1);
        return Math.max(0, totalHp - state.totalEffectiveDamage);
      };

      const getOfficeClerkIndex = () => currentCogs.findIndex(c => c.id === 'office_junior' || c.id === 'office_senior');
      const countAliveOfficeSupports = (clerkIdx: number) =>
        currentCogs.reduce((count, _, idx) => count + (idx !== clerkIdx && cogStates[idx]?.layer > 0 ? 1 : 0), 0);

      const syncExistingOfficeClerkImmunity = () => {
        const clerkIdx = getOfficeClerkIndex();
        if (clerkIdx === -1) return;

        const clerk = currentCogs[clerkIdx];
        const clerkState = cogStates[clerkIdx];
        if (clerkState.layer === 0) {
          clerk.isImmunity = false;
          clerk.hasTriggeredOfficeImmunity = false;
          clerk.immunitySupportCount = undefined;
          clerk.pendingOfficeSupportLevel = undefined;
          return;
        }

        const aliveSupports = countAliveOfficeSupports(clerkIdx);

        if (clerk.isImmunity && (clerk.immunitySupportCount ?? 0) > aliveSupports) {
          clerk.isImmunity = false;
          clerk.immunitySupportCount = undefined;
          clerk.pendingOfficeSupportLevel = undefined;
        }
      };

      const activateOfficeClerkImmunity = () => {
        const clerkIdx = getOfficeClerkIndex();
        if (clerkIdx === -1) return;

        const clerk = currentCogs[clerkIdx];
        const clerkState = cogStates[clerkIdx];
        if (clerkState.layer === 0 || clerk.isImmunity || clerk.hasTriggeredOfficeImmunity) return;

        const totalHp = clerkState.maxHp * (clerk.isV2 ? 2 : 1);
        const remainingHp = getRemainingHp(clerkIdx);
        if (remainingHp > 0 && remainingHp <= totalHp / 2) {
          clerk.isImmunity = true;
          clerk.hasTriggeredOfficeImmunity = true;
          clerk.immunitySupportCount = countAliveOfficeSupports(clerkIdx);
          clerk.pendingOfficeSupportLevel = clerk.id === 'office_junior' ? 8 : 10;
        }
      };

      const spawnPendingOfficeSupport = () => {
        const clerkIdx = getOfficeClerkIndex();
        if (clerkIdx === -1) return;

        const clerk = currentCogs[clerkIdx];
        if (!clerk.isImmunity || !clerk.pendingOfficeSupportLevel) return;
        if (currentCogs.length >= 4) {
          clerk.pendingOfficeSupportLevel = undefined;
          clerk.immunitySupportCount = countAliveOfficeSupports(clerkIdx);
          return;
        }

        const spawnedCog: Cog = {
          id: String(clerk.pendingOfficeSupportLevel),
          isTrapped: false,
          isLured: false,
          isV2: false,
          isOfficeSpawnedSupport: true,
        };
        currentCogs.push(spawnedCog);
        cogStates.push({
          maxHp: getCogMaxHp(spawnedCog, currentCogs),
          layer: 1,
          damageOnCurrentLayer: 0,
          totalEffectiveDamage: 0,
        });
        cumulativeDamages.push(0);
        clerk.pendingOfficeSupportLevel = undefined;
        clerk.immunitySupportCount = countAliveOfficeSupports(clerkIdx);
      };

      const finalizeOfficeClerkImmunity = () => {
        const clerkIdx = getOfficeClerkIndex();
        if (clerkIdx !== -1 && officeClerkHadImmunityAtRoundStart) {
          const clerk = currentCogs[clerkIdx];
          const clerkState = cogStates[clerkIdx];
          if (clerkState.layer === 0) {
            clerk.isImmunity = false;
            clerk.hasTriggeredOfficeImmunity = false;
            clerk.immunitySupportCount = undefined;
            clerk.pendingOfficeSupportLevel = undefined;
          } else {
            const aliveSupports = countAliveOfficeSupports(clerkIdx);
            if (clerk.isImmunity && officeClerkSupportsAtRoundStart > aliveSupports) {
              clerk.isImmunity = false;
              clerk.immunitySupportCount = undefined;
              clerk.pendingOfficeSupportLevel = undefined;
            }
          }
        }
        activateOfficeClerkImmunity();
        spawnPendingOfficeSupport();
      };

      syncExistingOfficeClerkImmunity();
      const officeClerkIdxAtRoundStart = getOfficeClerkIndex();
      const officeClerkHadImmunityAtRoundStart = officeClerkIdxAtRoundStart !== -1 && !!currentCogs[officeClerkIdxAtRoundStart].isImmunity;
      const officeClerkSupportsAtRoundStart = officeClerkIdxAtRoundStart !== -1 ? countAliveOfficeSupports(officeClerkIdxAtRoundStart) : 0;

      const hasForeman = currentCogs.some(c => c.id === 'factory_scrap' || c.id === 'factory_steel');
      // Bullion's Defense Down only exists while the Bullion Auditor is alive.
      // The Auditor can be defeated during the previous round, so check its
      // simulation state rather than only checking whether it remains in the
      // lineup array.
      // Bull Market is driven by the living Auditor in the lineup, independent
      // of the selected preset. Coin grants 25%; Bullion grants 50%.
      const isMintAuditor = (cog: Cog) => cog.id === 'mint_coin' || cog.id === 'mint_bullion';
      const activeMintAuditor = currentCogs.find((c, i) => isMintAuditor(c) && cogStates[i].layer > 0);
      const deadNonAuditorsAtStart = currentCogs.filter((c, i) => !isMintAuditor(c) && cogStates[i].layer === 0).length;
      const bullMarketMultiplier = activeMintAuditor && (deadNonAuditorsAtStart % 2 !== 0)
        ? activeMintAuditor.id === 'mint_bullion' ? 0.5 : 0.25
        : 0;
      const isBullMarketActive = bullMarketMultiplier > 0;

      const deadCogsCountAtStart = cogStates.filter(s => s.layer === 0).length;

      const getDefenseDownStacks = (cog: Cog) => {
        const isPresident = cog.id === 'golf_fairway' || cog.id === 'golf_fringe';
        if (isPresident && deadCogsCountAtStart > 0) return deadCogsCountAtStart;
        return cog.isDefenseDown ? 3 : 0;
      };

      const trackOrder = ['special', 'trap', 'lure', 'sound', 'throw', 'squirt', 'drop'];

      trackOrder.forEach(trackId => {
        const gagsInTrack = selectedGags.filter(g => g?.trackId === trackId);
        if (gagsInTrack.length === 0) return;

        const hitCounts = Array(currentCogCount).fill(0);
        const trackBaseDamages = Array(currentCogCount).fill(0);
        const defenseDownMultipliers = currentCogs.map((cog) => {
          if (['trap', 'lure'].includes(trackId)) return 0;

          const defenseDownStacks = getDefenseDownStacks(cog);
          const statusMultiplier = defenseDownStacks > 0
            ? DEFENSE_DOWN_MULTIPLIERS[defenseDownStacks] ?? (defenseDownStacks * 0.2)
            : 0;
          return statusMultiplier + bullMarketMultiplier;
        });

        gagsInTrack.forEach(gag => {
          if (!gag) return;
          const baseDmg = getGagDamage(gag);
          const targets = gag.target === 'all' ? currentCogIndexes : [gag.targetIdx!];
          targets.forEach(t => {
            if (t < 0 || t >= currentCogCount) return;
            hitCounts[t]++;
          });
        });

        const luredAtStartOfPhase = currentCogs.map(c => c.isLured);
        const trappedAtStartOfPhase = currentCogs.map(c => c.isTrapped);
        const phaseDamage = Array(currentCogCount).fill(0);
        const instaKillThisPhase = Array(currentCogCount).fill(false);

        gagsInTrack.forEach(gag => {
          if (!gag) return;
          let baseDmg = getGagDamage(gag);
          const isPinkSlip = gag.trackId === 'special' && gag.gagIndex === 0;
          const sosData = gag.variant === 'sos' ? (SOS_GAGS[gag.trackId] || []).find(s => s.gagIndex === gag.gagIndex) : null;
          const isInstaKill = sosData?.isInstaKill;
          const isRemote = sosData?.isRemote;
          const targets = gag.target === 'all' ? currentCogIndexes : [gag.targetIdx!];

          targets.forEach(cogIdx => {
            if (cogIdx < 0 || cogIdx >= currentCogCount) return;
            const cog = currentCogs[cogIdx];
            let currentDmg = baseDmg;
            const defenseDownStacks = getDefenseDownStacks(cog);

            const choice = COG_CHOICES.find(c => c.id === cog.id);
            const hasMintSup = currentCogs.some(c => c.id === 'mint_coin' || c.id === 'mint_bullion');
            const isTenured = cog.isTenure || choice?.type === 'boss' || hasMintSup;
            const isImmune = !!cog.isImmunity;

            if (isRemote && sosData && !isTenured) {
              if (trackId === 'lure' || (sosData as any).isHeal) {
                cog.isRemoteHeal = true;
              } else {
                cog.isRemoteDmg = true;
              }
              cog.remote = {
                roundsLeft: sosData.rounds || 0,
                damageToOthers: sosData.dmgOthers || 0,
                damageOnExpire: sosData.dmgExpire || 0,
                stars: sosData.stars || 0,
                isHeal: !!(sosData as any).isHeal,
              };
            }

            if (isInstaKill && !isTenured && !isImmune) {
              instaKillThisPhase[cogIdx] = true;
              return;
            }

            const isForeman = cog.id === 'factory_scrap' || cog.id === 'factory_steel';
            if (hasForeman && !isForeman && !['trap', 'lure'].includes(trackId)) {
              currentDmg = Math.floor(currentDmg * 0.75);
            }

            // Negative facility modifiers apply before knockback and same-gag bonus.
            if (!['trap', 'lure', 'special'].includes(trackId) && !isPinkSlip) {
              trackBaseDamages[cogIdx] += currentDmg;
            }

            if (isImmune && !['trap', 'lure'].includes(trackId)) {
              currentDmg = 0;
            }

            if (trackId === 'trap') {
              const isRailroad = gag.gagIndex === 6;
              if (hitCounts[cogIdx] > 1) {
                // More than 1 trap on the same turn cancels everything out (including previous traps)
                cog.isTrapped = false;
                trapDamageOnCog[cogIdx] = 0;
              } else if (isRailroad) {
                // Railroad overrides existing trap and lure statuses
                cog.isTrapped = true;
                cog.isLured = false;
                cog.lureDuration = 0;
                trapDamageOnCog[cogIdx] = currentDmg;
              } else if (!luredAtStartOfPhase[cogIdx] && !trappedAtStartOfPhase[cogIdx]) {
                // Regular traps only apply if not lured and not already trapped
                cog.isTrapped = true;
                trapDamageOnCog[cogIdx] = currentDmg;
              }
            } else if (trackId === 'lure') {
              if (trappedAtStartOfPhase[cogIdx]) {
                let trapDmg = trapDamageOnCog[cogIdx];
                let trapOrangeMultiplier = 0;
                if (defenseDownStacks > 0) {
                  trapOrangeMultiplier += DEFENSE_DOWN_MULTIPLIERS[defenseDownStacks] ?? (defenseDownStacks * 0.2);
                }
                if (isBullMarketActive) {
                  trapOrangeMultiplier += bullMarketMultiplier;
                }
                if (trapOrangeMultiplier > 0) {
                  trapDmg += Math.ceil(trapDmg * trapOrangeMultiplier);
                }
                phaseDamage[cogIdx] += trapDmg;
                trackDamages['trap'] = (trackDamages['trap'] || 0) + trapDmg;
                trapDamageOnCog[cogIdx] = 0;
                cog.isTrapped = false;
                cog.isLured = false;
                cog.lureDuration = 0;
              } else if (!luredAtStartOfPhase[cogIdx]) {
                cog.isLured = true;
                let newDuration;
                if (gag.variant === 'sos' && sosData?.rounds) {
                  newDuration = sosData.rounds;
                } else {
                  newDuration = LURE_DURATIONS[gag.gagIndex] || 3;
                }
                const choice = COG_CHOICES.find(c => c.id === cog.id);
                const isAttentive = cog.isAttentive || choice?.type === 'boss';
                if (isAttentive) {
                  newDuration = 1;
                }
                cog.lureDuration = Math.max(cog.lureDuration || 0, newDuration);
              }
            } else if (trackId === 'sound') {
              phaseDamage[cogIdx] += currentDmg;
              trackDamages[trackId] = (trackDamages[trackId] || 0) + currentDmg;
              cog.isLured = false;
              cog.lureDuration = 0;
            } else if (trackId === 'throw' || trackId === 'squirt') {
              phaseDamage[cogIdx] += currentDmg;
              trackDamages[trackId] = (trackDamages[trackId] || 0) + currentDmg;
              cog.isLured = false;
              cog.lureDuration = 0;
            } else if (trackId === 'drop') {
              if (!luredAtStartOfPhase[cogIdx]) {
                phaseDamage[cogIdx] += currentDmg;
                trackDamages[trackId] = (trackDamages[trackId] || 0) + currentDmg;
              }
            }
          });
        });

        // Positive Defense Down is added to orange damage. For Throw/Squirt on a
        // lured cog, it combines with the 50% knockback multiplier.
        if (!['trap', 'lure'].includes(trackId)) {
          trackBaseDamages.forEach((totalBase, idx) => {
            if (totalBase <= 0) return;
            if (trackId === 'drop' && luredAtStartOfPhase[idx]) return;

            const knockbackMultiplier =
              (trackId === 'throw' || trackId === 'squirt') && luredAtStartOfPhase[idx] ? 0.5 : 0;
            const orangeBonus = Math.ceil(totalBase * (defenseDownMultipliers[idx] + knockbackMultiplier));
            if (orangeBonus > 0) {
              phaseDamage[idx] += orangeBonus;
              trackDamages[trackId] = (trackDamages[trackId] || 0) + orangeBonus;
            }
          });
        }

        // Apply Combo Bonuses separately based on intervals of 5
        if (!['trap', 'lure'].includes(trackId)) {
          trackBaseDamages.forEach((totalBase, idx) => {
            if (hitCounts[idx] >= 2) {
              // If drop hits a lured cog, it does 0 damage including bonus
              if (trackId === 'drop' && luredAtStartOfPhase[idx]) return;

              const baseBonus = Math.ceil(totalBase * 0.2);

              phaseDamage[idx] += baseBonus;
              trackDamages[trackId] = (trackDamages[trackId] || 0) + baseBonus;
            }
          });
        }

        const resolveDamage = (dmg: number, idx: number) => {
          const state = cogStates[idx];
          if (state.layer === 0) return;
          if (currentCogs[idx].isImmunity) return;
          const remainingHpOnLayer = state.maxHp - state.damageOnCurrentLayer;
          if (dmg >= remainingHpOnLayer) {
            state.totalEffectiveDamage += remainingHpOnLayer;
            cogDamagesThisRound[idx] += remainingHpOnLayer;
            state.layer -= 1;
            state.damageOnCurrentLayer = 0;
            currentCogs[idx].isLured = false;
            currentCogs[idx].lureDuration = 0;
            currentCogs[idx].isTrapped = false;
            currentCogs[idx].trapDamage = 0;
            currentCogs[idx].remote = undefined;
            currentCogs[idx].isRemoteDmg = false;
            currentCogs[idx].isRemoteHeal = false;
            trapDamageOnCog[idx] = 0;
          } else {
            state.damageOnCurrentLayer += dmg;
            state.totalEffectiveDamage += dmg;
            cogDamagesThisRound[idx] += dmg;
          }
        };

        // Resolve phase damage with v2 layer caps
        phaseDamage.forEach((dmg, idx) => {
          const state = cogStates[idx];
          if (state.layer === 0) return; // already dead

          if (instaKillThisPhase[idx]) {
            const cog = currentCogs[idx];
            const hpLeftForKill = (cog.isV2 ? state.maxHp * 2 : state.maxHp) - (cumulativeDamages[idx] + cogDamagesThisRound[idx]);
            state.totalEffectiveDamage += hpLeftForKill;
            cogDamagesThisRound[idx] += hpLeftForKill;
            state.layer = 0;
            state.damageOnCurrentLayer = 0;
            currentCogs[idx].isLured = false;
            currentCogs[idx].lureDuration = 0;
            currentCogs[idx].isTrapped = false;
            currentCogs[idx].trapDamage = 0;
            currentCogs[idx].remote = undefined;
            currentCogs[idx].isRemoteDmg = false;
            currentCogs[idx].isRemoteHeal = false;
            trapDamageOnCog[idx] = 0;
            return;
          }

          if (dmg === 0) return;
          resolveDamage(dmg, idx);
        });

      });

      // NEW: Absolute Final Phase (Remotes)
      // Process from right to left (4, 3, 2, 1) -> Indices 3, 2, 1, 0
      for (let i = currentCogCount - 1; i >= 0; i--) {
        const state = cogStates[i];
        const cog = currentCogs[i];
        // If cog is dead or doesn't have a remote, skip
        if (state.layer === 0 || !cog.remote) continue;

        const remote = cog.remote;
        remote.roundsLeft -= 1;

        // 1. Damage to others
        const dmgOthers = remote.damageToOthers;
        if (dmgOthers > 0) {
          for (let j = 0; j < currentCogCount; j++) {
            if (i === j) continue;
            const targetState = cogStates[j];
            if (targetState.layer === 0) continue;

            // Re-define resolveDamage inside here or make it accessible
            const applyDmg = (d: number, idx: number) => {
              const s = cogStates[idx];
              if (currentCogs[idx].isImmunity) return;
              const rHp = s.maxHp - s.damageOnCurrentLayer;
              if (d >= rHp) {
                s.totalEffectiveDamage += rHp;
                cogDamagesThisRound[idx] += rHp;
                s.layer -= 1;
                s.damageOnCurrentLayer = 0;
                currentCogs[idx].isLured = false;
                currentCogs[idx].lureDuration = 0;
                currentCogs[idx].isTrapped = false;
                currentCogs[idx].trapDamage = 0;
                currentCogs[idx].remote = undefined;
                currentCogs[idx].isRemoteDmg = false;
                currentCogs[idx].isRemoteHeal = false;
              } else {
                s.damageOnCurrentLayer += d;
                s.totalEffectiveDamage += d;
                cogDamagesThisRound[idx] += d;
              }
            };
            applyDmg(dmgOthers, j);
          }
        }

        // 2. Damage to self on expiry
        if (remote.roundsLeft <= 0) {
          const dmgExpire = remote.damageOnExpire;
          const applyDmg = (d: number, idx: number) => {
            const s = cogStates[idx];
            if (currentCogs[idx].isImmunity) return;
            const rHp = s.maxHp - s.damageOnCurrentLayer;
            if (d >= rHp) {
              s.totalEffectiveDamage += rHp;
              cogDamagesThisRound[idx] += rHp;
              s.layer -= 1;
              s.damageOnCurrentLayer = 0;
              currentCogs[idx].isLured = false;
              currentCogs[idx].lureDuration = 0;
              currentCogs[idx].isTrapped = false;
              currentCogs[idx].trapDamage = 0;
              currentCogs[idx].remote = undefined;
              currentCogs[idx].isRemoteDmg = false;
              currentCogs[idx].isRemoteHeal = false;
            } else {
              s.damageOnCurrentLayer += d;
              s.totalEffectiveDamage += d;
              cogDamagesThisRound[idx] += d;
            }
          };
          applyDmg(dmgExpire, i);
          cog.remote = undefined;
          cog.isRemoteDmg = false;
          cog.isRemoteHeal = false;
        }
      }

      finalizeOfficeClerkImmunity();

      currentCogs.forEach((cog, i) => {
        cog.trapDamage = trapDamageOnCog[i] ?? 0;
        if (cog.isLured && cog.lureDuration !== undefined) {
          cog.lureDuration--;
          if (cog.lureDuration <= 0) {
            cog.isLured = false;
            cog.lureDuration = 0;
          }
        }
        cumulativeDamages[i] += cogDamagesThisRound[i] ?? 0;
      });

      results.push({
        finalCogs: currentCogs.map((c, i) => ({
          ...c,
          simMaxHp: cogStates[i].maxHp,
          simRemainingHp: Math.max(0, (c.isV2 ? cogStates[i].maxHp * 2 : cogStates[i].maxHp) - cumulativeDamages[i]),
          isDead: cogStates[i].layer === 0,
          remote: c.remote ? { ...c.remote } : undefined
        })),
        cogDamages: [...cumulativeDamages],
        trackDamages,
        isBullMarketActive,
        bullMarketMultiplier
      });
    }

    return results;
  }, [selectedGagsByRound, gagTracks, cogs]);

  const activeStats = roundResults[activeRound];
  const roundAccuracyResults = useMemo(() => selectedGagsByRound.map((roundGags, roundIndex) =>
    calculateRoundAccuracy(roundGags, roundIndex === 0 ? cogs : roundResults[roundIndex - 1].finalCogs)
  ), [selectedGagsByRound, cogs, roundResults]);
  const startOfRoundStats = activeRound === 0 ? null : roundResults[activeRound - 1];
  const selectionCogs = startOfRoundStats?.finalCogs ?? cogs;
  const selectionDamages = startOfRoundStats?.cogDamages ?? cogs.map(() => 0);
  const displayCogs = activeStats?.finalCogs ?? cogs;

  const getHealthColor = (percentage: number) => {
    if (percentage > 85) return 'bg-emerald-500';
    if (percentage > 65) return 'bg-yellow-500';
    if (percentage > 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="grid grid-cols-[30fr_70fr] gap-3 h-full overflow-visible" onClick={() => { setActivePopup(null); setActiveCogSlot(null); setPresetMenuOpen(false); }}>
      {/* Left Panel: Selected Gags (Rounds) */}
      <div className="bg-[#082416] rounded-xl p-3 flex flex-col gap-2 border border-white/5 shadow-inner min-h-[540px] overflow-hidden">
        <div className="flex items-center justify-between mb-1 flex-shrink-0">
          <h4 className="text-sm font-bold text-white">Rounds</h4>
          <button
            onClick={() => {
              setSelectedGagsByRound([
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
              ]);
              setActiveRound(0);
              setActiveGagSlot(0);
            }}
            className="text-[9px] font-black uppercase text-red-400 hover:text-red-300 transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-1 overflow-y-auto pr-0.5 custom-scrollbar">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(rIdx => (
            <div
              key={rIdx}
              onClick={() => {
                setActiveRound(rIdx);
                setActiveGagSlot(0);
              }}
              className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all 
                cursor-pointer ${activeRound === rIdx
                  ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                  : 'bg-black/20 border-white/5 hover:bg-black/40 hover:border-white/10'
                }`}
            >
              <div className="w-14 flex flex-col items-center flex-shrink-0">
                <span className="text-[10px] font-black text-white/40 uppercase">Round {rIdx + 1}</span>
                {roundAccuracyResults[rIdx].perCog.length > 0 && (
                  <span
                    className="cursor-help whitespace-nowrap text-sm font-black tabular-nums text-sky-300 underline decoration-dotted decoration-sky-300/60 underline-offset-2"
                    onMouseEnter={(event) => {
                      const element = event.currentTarget;
                      const bounds = element.getBoundingClientRect();
                      setRoundAccuracyTooltip({
                        result: roundAccuracyResults[rIdx],
                        round: rIdx + 1,
                        anchor: { left: bounds.left + bounds.width / 2, top: bounds.top, bottom: bounds.bottom },
                        root: element.getRootNode() instanceof ShadowRoot ? element.getRootNode() as ShadowRoot : document.body,
                      });
                    }}
                    onMouseLeave={() => setRoundAccuracyTooltip(null)}
                  >{formatAccuracy(roundAccuracyResults[rIdx].total)}%</span>
                )}
              </div>
              <div className="flex-1 flex gap-1 justify-center">
                {selectedGagsByRound[rIdx].map((gag, gIdx) => {
                  const track = gag ? gagTracks.find(t => t.id === gag.trackId) : null;
                  const gagData = track ? track.gags[gag!.gagIndex] : null;
                  const sosInfo = gag?.variant === 'sos' ? (SOS_GAGS[gag!.trackId] || []).find(s => s.gagIndex === gag!.gagIndex) : null;
                  const imgSrc = sosInfo ? sosInfo.image : (gagData ? `https://toonhq.org/static/assets/gags/${gagData.image}` : null);
                  const isSlotActive = activeRound === rIdx && activeGagSlot === gIdx;

                  return (
                    <div key={gIdx} className="flex flex-col items-center">
                      <div className="flex flex-col gap-0.5 mb-0.5 items-center">
                        {/* Target visualization (X and -) */}
                        <div className="flex gap-0.5 h-2.5 items-center">
                          {[0, 1, 2, 3].map(cIdx => {
                            const isTargeted = gag ? (gag.target === 'all' || gag.targetIdx === cIdx) : false;

                            return (
                              <span key={cIdx} className={`text-[8px] font-black w-1.5 text-center transition-colors ${gag ? 'text-emerald-400' : 'text-white/10'}`}>
                                {isTargeted ? 'X' : '-'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (gag) clearGagSlot(rIdx, gIdx);
                          else {
                            setActiveRound(rIdx);
                            setActiveGagSlot(gIdx);
                          }
                        }}
                        className={`w-14 h-10 rounded border flex items-center justify-center relative transition-all cursor-pointer ${isSlotActive ? 'border-emerald-500 bg-emerald-500/20' :
                          gag ? 'border-white/20' : 'border-dashed border-white/5 bg-black/10'
                          }`}
                        style={gag && track ? { backgroundColor: (sosInfo?.isInstaKill || sosInfo?.isRemote) ? '#8b5cf6' : track.color } : {}}
                      >
                        {imgSrc ? (
                          <>
                            <img src={imgSrc} alt="Gag" className="w-9 h-9 object-contain" />
                            {gag?.variant === 'organic' && (
                              <img
                                src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                                alt="Organic"
                                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 shadow-sm z-10 drop-shadow-md object-contain"
                              />
                            )}
                            {sosInfo?.isRemote && sosInfo.stars && (
                              <div className="absolute -top-1.5 inset-x-0 flex justify-center gap-0.5 pointer-events-none">
                                {[...Array(sosInfo.stars)].map((_, i) => (
                                  <span key={i} className="text-yellow-400 text-[7px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">★</span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] font-black text-white/5">{gIdx + 1}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel: Cogs & Gag Picker */}
      <div className="flex flex-col gap-3 min-w-0 relative overflow-visible">
        {/* Cogs Panel */}
        <div className="bg-black/40 rounded-xl p-4 flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <h4 className="text-base font-bold text-white">Cogs After Round {activeRound + 1}</h4>
            <div className="relative justify-self-center">
              <button
                onClick={(e) => { e.stopPropagation(); setPresetMenuOpen(!presetMenuOpen); setActiveCogSlot(null); }}
                className="flex max-w-[380px] cursor-pointer items-center justify-center gap-2.5 text-xl font-black text-white/85 transition-colors hover:text-white"
              >
                <span className="truncate">{activePreset || "No Facility Selected"}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 flex-shrink-0"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {presetMenuOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-3 bg-[#0c3622] rounded-xl border border-white/10 shadow-2xl z-[60] w-[320px] flex flex-col gap-3">
                  {activePreset && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCogs(DEFAULT_COGS.map(c => ({ ...c })));
                        setActivePreset(null);
                        setPresetMenuOpen(false);
                      }}
                      className="text-center px-3 py-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer border border-white/5"
                    >
                      Clear Facility Selection
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {FACILITY_PRESETS.map((preset, i) => {
                      const boss = COG_CHOICES.find(c => c.id === preset.bossId);
                      return (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCogs(preset.cogs.map(c => ({ id: c.id, isTrapped: false, isLured: false, isV2: c.isV2 })));
                            setActivePreset(preset.name);
                            setPresetMenuOpen(false);
                          }}
                          className={`flex flex-col items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer group/preset ${activePreset === preset.name ? 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)]' : 'bg-black/30 border-white/5 hover:bg-black/50 hover:border-white/20'}`}
                        >
                          <div className="w-16 h-16 relative overflow-hidden rounded-lg bg-black/40 border border-white/5 flex items-center justify-center">
                            {boss?.img && (
                              <img src={boss.img as string} alt={preset.name} className="w-full h-full object-cover opacity-60 group-hover/preset:opacity-100 group-hover/preset:scale-110 transition-all duration-500" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                          </div>
                          <span className={`text-[10px] font-bold text-center leading-tight transition-colors ${activePreset === preset.name ? 'text-emerald-300' : 'text-white/70 group-hover/preset:text-white'}`}>
                            {preset.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div aria-hidden="true" />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {displayCogs.map((cog, idx) => {
              const choice = COG_CHOICES.find(c => c.id === cog.id);
              const cogImage = choice?.type === 'normal' ? getSkelecogImage(activePreset) : choice?.img;
              const maxHp = cog.simMaxHp ?? getCogMaxHp(cog, displayCogs);
              const dmg = activeStats.cogDamages[idx] || 0;
              const totalMax = maxHp * (cog.isV2 ? 2 : 1);
              const remainingTotal = cog.simRemainingHp ?? Math.max(0, totalMax - dmg);
              const outerHp = cog.isV2 ? Math.max(0, remainingTotal - maxHp) : 0;
              const innerHp = Math.min(maxHp, remainingTotal);
              const pInner = (innerHp / maxHp) * 100;
              const pOuter = (outerHp / maxHp) * 100;
              const finalCog = activeStats.finalCogs[idx];
          const spawnedSupportStyle = cog.isOfficeSpawnedSupport ? { filter: 'sepia(1) saturate(5.5) hue-rotate(-45deg) brightness(0.92)' } : undefined;

              return (
                <div key={idx} className="flex flex-col gap-2">
                  <div className="relative group">
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveCogSlot(activeCogSlot === idx ? null : idx); }}
                      className={`w-full aspect-square relative rounded-xl border border-white/10 bg-black/40 overflow-hidden cursor-pointer hover:border-emerald-400/50 hover:shadow-[0_0_15px_rgba(52,211,153,0.2)] transition-all group p-0 m-0 ${finalCog.isDead ? 'grayscale opacity-40' : ''}`}
                    >
                      {finalCog.isDead && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                          <span className="text-red-500 font-black text-xs uppercase tracking-tighter shadow-black drop-shadow-lg [text-shadow:_0_1px_4px_rgb(0_0_0_/_100%)]">Defeated</span>
                        </div>
                      )}
                      {(() => {
                        if (!choice) return null;
                        if (choice.type === 'normal') {
                          return (
                            <div className="flex flex-col items-center justify-center h-full w-full relative">
                              <img src={cogImage as string} alt={choice.label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-100" style={spawnedSupportStyle} />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
                              <div className="relative flex h-full w-full flex-col items-center justify-center pointer-events-none">
                                {cog.isV2 && (
                                  <div className="absolute top-0 right-0 bg-fuchsia-600/90 text-[8px] font-black px-1.5 py-0.5 rounded-bl shadow text-white tracking-widest uppercase">
                                    v2.0
                                  </div>
                                )}
                              </div>
                              <div className="absolute bottom-0 inset-x-0 pointer-events-none">
                                <span className="block bg-black/70 px-2 py-1.5 text-center text-base font-black text-white leading-tight">Level {choice.id}</span>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <>
                            <img src={choice.img as string} alt={choice.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" style={spawnedSupportStyle} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
                            <div className="absolute bottom-0 inset-x-0 pointer-events-none">
                              <span className="block bg-black/70 px-2 py-1.5 text-center text-sm font-black text-white leading-tight">{choice.label}</span>
                            </div>
                          </>
                        );
                      })()}
                    </button>
                    {activeCogSlot === idx && (
                      <div className={`absolute top-full mt-2 p-2 bg-[#0c3622] rounded-xl border border-white/10 shadow-2xl z-[60] w-max max-w-[320px] ${idx < 2 ? 'left-0' : 'right-0'}`}>
                        <div className="flex items-center justify-between mb-2 ml-1 mr-1">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-white/40">Levels</div>
                          <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setCogs((current) => current.map((entry, entryIndex) => entryIndex === idx
                                  ? { ...withoutCogSimulationState(entry), isV2: !entry.isV2 }
                                  : entry));
                              }}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors border ${cog.isV2 ? 'bg-fuchsia-900/40 border-fuchsia-500/50 text-fuchsia-300' : 'bg-black/20 border-white/5 text-white/40 hover:bg-black/40 hover:text-white/60'}`}
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">v2.0</span>
                            <div className={`w-6 h-3 rounded-full relative transition-colors ${cog.isV2 ? 'bg-fuchsia-500' : 'bg-white/10'}`}>
                              <div className={`absolute top-0.5 bottom-0.5 w-2 rounded-full bg-white transition-all ${cog.isV2 ? 'left-[14px]' : 'left-0.5'}`} />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-1 mb-3">
                                  {COG_CHOICES.filter(c => c.type === 'normal').map(c => (
                                    <button
                                      key={c.id}
                                      onClick={(e) => { e.stopPropagation(); setCogs((current) => current.map((entry, entryIndex) => entryIndex === idx ? { ...withoutCogSimulationState(entry), id: c.id } : entry)); setActiveCogSlot(null); }}
                                      className={`relative w-9 h-9 rounded-md border flex items-center justify-center text-xs font-black transition-all cursor-pointer overflow-hidden ${cog.id === c.id ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100 shadow-[0_0_10px_rgba(52,211,153,0.3)]' : 'bg-black/30 border-white/5 text-white/60 hover:bg-black/50 hover:text-white'}`}
                                    >
                              <img src={c.img as string} className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-40 transition-opacity" />
                              <span className="relative z-10">{c.id}</span>
                            </button>
                          ))}
                        </div>
                        {/* 
                         * SUPERVISOR PICKER HIDDEN:
                         * Supervisors are now automatically assigned based on the facility type.
                         */}
                        {/* <div className="text-[10px] uppercase tracking-widest font-bold mb-2 ml-1 text-white/40">Supervisors</div>
                        <div className="grid grid-cols-4 gap-1 mb-3">
                          {COG_CHOICES.filter(c => c.type === 'boss').map(c => (
                            <button key={c.id} onClick={(e) => { e.stopPropagation(); const next = [...cogs]; next[idx] = { ...next[idx], id: c.id, isV2: false }; setCogs(next); setActiveCogSlot(null); }} className={`relative w-[60px] h-16 rounded-md border flex flex-col items-center justify-center gap-1 transition-all p-1 cursor-pointer ${cog.id === c.id ? 'bg-emerald-500/30 border-emerald-400' : 'bg-black/30 border-white/5 hover:bg-black/50'}`}>
                              <img src={c.img as string} alt={c.label} className="w-8 h-8 object-contain" />
                              <span className="text-[8px] font-bold text-center leading-tight text-white/80">{c.label}</span>
                            </button>
                          ))}
                        </div> */}
                        {/* 
                         * STATUS PICKER HIDDEN: 
                         * Manual status effects are currently disabled to prevent confusion 
                         * as most are now automatically derived from facility presets and boss presence.
                        <div className="text-[10px] uppercase tracking-widest font-bold mb-2 ml-1 text-white/40">Status Effects</div>
                        <div className="grid grid-cols-4 gap-1">
                          {STATUS_EFFECTS.map(effect => {
                            const isSupervisor = COG_CHOICES.find(c => c.id === cog.id)?.type === 'boss';
                            const hasMintSupervisor = cogs.some(c => c.id === 'mint_coin' || c.id === 'mint_bullion');
                            const hasForeman = cogs.some(c => c.id === 'factory_scrap' || c.id === 'factory_steel');
                            const isAuditor = cog.id === 'mint_coin' || cog.id === 'mint_bullion';

                            let isForced = false;
                            if (effect.id === 'isTenure' && (isSupervisor || hasMintSupervisor)) isForced = true;
                            if (effect.id === 'isAttentive' && isSupervisor) isForced = true;
                            if (effect.id === 'isOverpaid') pickerTitle = 'Overpaid: +150 Max HP';
                            const isForeman = cog.id === 'factory_scrap' || cog.id === 'factory_steel';
                            if (effect.id === 'isDefenseUp' && hasForeman && !isForeman) isForced = true;

                            const isActive = !!(cog as any)[effect.id] || isForced;

                            let pickerTitle = effect.label;
                            if (effect.id === 'isTenure') pickerTitle = 'Tenure: Immune to Pink Slips and Remotes';
                            if (effect.id === 'isAttentive') pickerTitle = 'Attentive: Lure Reduced to 1 Round';
                            if (effect.id === 'isDefenseUp') pickerTitle = 'Defense Up: 25%';
                            if (effect.id === 'isDefenseDown') pickerTitle = 'Defense Down: 60%';

                            return (
                              <button
                                key={effect.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isForced) return;
                                  const next = [...cogs];
                                  (next[idx] as any)[effect.id] = !isActive;
                                  setCogs(next);
                                }}
                                className={`relative w-[60px] h-[60px] rounded-md border flex flex-col items-center justify-center gap-1 transition-all p-1 ${isForced ? 'cursor-not-allowed' : 'cursor-pointer'} ${isActive ? `${effect.color}/30 border-white/40 shadow-[0_0_10px_${effect.shadow}]` : 'bg-black/30 border-white/5 opacity-40 hover:opacity-100 hover:bg-black/50'}`}
                                title={pickerTitle}
                              >
                                <img src={getExtensionImageUrl(`images/statuses/${effect.icon}`)} alt={effect.label} className="w-8 h-8 object-contain" />
                                <span className="text-[8px] font-bold text-center leading-tight text-white/80">{effect.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        */}
                      </div>
                    )}
                  </div>
                  <div className="bg-black/20 border border-white/5 rounded-lg p-2 flex flex-col gap-2">
                    <div className="h-8 w-full bg-white/5 rounded-md overflow-hidden relative">
                      <div
                        className={`absolute top-0 left-0 bottom-0 transition-all duration-500 ${cog.isV2 && outerHp > 0 ? 'bg-fuchsia-500' : getHealthColor(pInner)}`}
                        style={{ width: `${cog.isV2 && outerHp > 0 ? pOuter : pInner}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                        {cog.isV2 && outerHp > 0 && (
                          <span className="bg-fuchsia-600 rounded px-1 text-[8px] font-black text-white tracking-wider shadow-sm">V2.0</span>
                        )}
                        <span className="text-[10px] font-black text-white tabular-nums">
                          {cog.isV2 && outerHp > 0 ? outerHp : innerHp} / {maxHp}
                        </span>
                      </div>
                    </div>
                    {/* Status Indicators Area */}
                    <div className="flex flex-col gap-1.5 items-center justify-center py-1 text-center">
                      <div className="flex flex-wrap gap-2 min-h-8 items-center justify-center px-1">
                        {STATUS_EFFECTS.map(effect => {
                          const isSupervisor = COG_CHOICES.find(c => c.id === finalCog.id)?.type === 'boss';
                          const hasMintSupervisorAny = cogs.some(c => c.id === 'mint_coin' || c.id === 'mint_bullion');
                          const hasForeman = cogs.some(c => c.id === 'factory_scrap' || c.id === 'factory_steel');
                          const isAuditor = finalCog.id === 'mint_coin' || finalCog.id === 'mint_bullion';
                          const isForeman = finalCog.id === 'factory_scrap' || finalCog.id === 'factory_steel';

                          let isForced = false;
                          if (effect.id === 'isTenure' && (isSupervisor || hasMintSupervisorAny)) isForced = true;
                          if (effect.id === 'isAttentive' && isSupervisor) isForced = true;
                          if (effect.id === 'isOverpaid' && (!isAuditor && hasMintSupervisorAny)) isForced = true;
                          if (effect.id === 'isDefenseUp' && hasForeman && !isForeman) isForced = true;

                          let activeLocal = !!(finalCog as any)[effect.id] || isForced;

                          let badgeValue: string | number | undefined = undefined;
                          if (effect.id === 'isLured' && activeLocal && finalCog.lureDuration !== undefined) {
                            badgeValue = finalCog.lureDuration;
                          }

                          if ((effect.id === 'isRemoteDmg' || effect.id === 'isRemoteHeal') && activeLocal && finalCog.remote?.roundsLeft !== undefined) {
                            badgeValue = finalCog.remote.roundsLeft;
                          }

                          let currentDefenseDownStacks = 0;
                          if (effect.id === 'isDefenseDown') {
                            const isPresident = finalCog.id === 'golf_fairway' || finalCog.id === 'golf_fringe';
                            const deadCogsCount = activeStats.finalCogs.filter((c: Cog, i: number) => {
                              const maxHp = c.simMaxHp ?? getCogMaxHp(c, activeStats.finalCogs);
                              const cdmg = activeStats.cogDamages[i] || 0;
                              return (c.isV2 ? maxHp * 2 : maxHp) <= cdmg;
                            }).length;

                            if (activeStats.isBullMarketActive) {
                              activeLocal = true;
                              badgeValue = undefined;
                            } else if (isPresident && deadCogsCount > 0) {
                              activeLocal = true;
                              currentDefenseDownStacks = deadCogsCount;
                              badgeValue = deadCogsCount;
                            } else if (activeLocal) {
                              currentDefenseDownStacks = 3;
                              badgeValue = 1;
                            }
                          }

                          // Dynamic Title logic
                          let statusTitle = effect.label;
                          if (effect.id === 'isTenure' && activeLocal) statusTitle = 'Tenure: Immune to Pink Slips and Remotes';
                          if (effect.id === 'isAttentive' && activeLocal) statusTitle = 'Attentive: Lure Reduced to 1 Round';
                          if (effect.id === 'isDefenseUp' && activeLocal) statusTitle = 'Defense Up: 25%';
                          if (effect.id === 'isDefenseDown' && activeLocal) {
                            if (activeStats.isBullMarketActive) statusTitle = `Bull Market: Defense Down ${activeStats.bullMarketMultiplier * 100}%`;
                            else statusTitle = `Defense Down: ${currentDefenseDownStacks * 20}%`;
                          }
                          if (effect.id === 'isLured' && activeLocal && finalCog.lureDuration !== undefined) statusTitle = `Lured: ${finalCog.lureDuration} Turns Remaining`;
                          if ((effect.id === 'isRemoteDmg' || effect.id === 'isRemoteHeal') && activeLocal && finalCog.remote) {
                            const r = finalCog.remote;
                            const starStr = r.stars ? `${r.stars} Star ` : '';
                            const typeStr = r.isHeal ? 'Heal' : 'Damage';
                            statusTitle = `${starStr}${typeStr} Remote - ${r.roundsLeft} round${r.roundsLeft === 1 ? '' : 's'} remaining`;
                          }
                          if (effect.id === 'isOverpaid' && activeLocal) {
                            const hasBullionAny = cogs.some(c => c.id === 'mint_bullion');
                            statusTitle = `Overpaid: +${hasBullionAny ? '200' : '150'} Max HP`;
                          }
                          if (effect.id === 'isImmunity' && activeLocal) {
                            statusTitle = 'Immunity: Clerk cannot be damaged until another cog is defeated';
                          }

                          return (
                            <div
                              key={effect.id}
                              className={`transition-all relative flex items-center justify-center ${activeLocal ? 'opacity-100' : 'hidden'}`}
                              style={activeLocal ? { filter: `drop-shadow(0 0 4px ${effect.shadow})` } : {}}
                              title={statusTitle}
                            >
                              <img
                                src={getExtensionImageUrl(`images/statuses/${effect.icon}`)}
                                alt={effect.label}
                                className="w-5 h-5 object-contain"
                                style={effect.id === 'isImmunity' ? { filter: 'hue-rotate(-60deg) saturate(1) brightness(1.5)' } : undefined}
                              />
                              {badgeValue !== undefined && (
                                <div className={`absolute -top-1.5 -right-1.5 text-[8px] font-black text-white px-1 rounded-full border border-black/20 shadow-sm z-10 min-w-[12px] h-3 flex items-center justify-center ${effect.id === 'isDefenseDown' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                                  {badgeValue}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gag Picker Panel (Now at the bottom) */}
        <div className="flex flex-col gap-2 bg-black/40 rounded-xl p-3 h-fit">
          <div className="text-base font-bold text-white px-2 mb-1">Gag Picker (Round {activeRound + 1})</div>
          <div className="bg-black/20 rounded-lg p-4 border border-white/5 gag-picker-container">
            <div className="flex gap-1 items-start min-w-max">
              {/* Column 1: Gags */}
              <div className="flex flex-col gap-2">
                {gagTracks.map(track => (
                  <GagTrackRow key={track.id} track={track} mode="base" onSelectGag={handleSelectGag} cogs={selectionCogs} activePreset={activePreset} cogDamages={selectionDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} currentRoundGags={selectedGagsByRound[activeRound]} />
                ))}
              </div>

              {/* Column 2: SOS */}
              <div className="flex flex-col gap-2">
                {gagTracks.map(track => (
                  <GagTrackRow key={track.id} track={track} mode="sos" onSelectGag={handleSelectGag} cogs={selectionCogs} activePreset={activePreset} cogDamages={selectionDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} currentRoundGags={selectedGagsByRound[activeRound]} />
                ))}
              </div>

              {/* Column 3: Remotes */}
              <div className="flex flex-col gap-2">
                <SpecialGagColumn mode="remotes" onSelectGag={handleSelectGag} cogs={selectionCogs} activePreset={activePreset} cogDamages={selectionDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} currentRoundGags={selectedGagsByRound[activeRound]} />
              </div>

              {/* Column 4: Pink Slips */}
              <div className="flex flex-col gap-2">
                <SpecialGagColumn mode="slips" onSelectGag={handleSelectGag} cogs={selectionCogs} activePreset={activePreset} cogDamages={selectionDamages} getHealthColor={getHealthColor} activePopup={activePopup} setActivePopup={setActivePopup} currentRoundGags={selectedGagsByRound[activeRound]} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {roundAccuracyTooltip && createPortal(
        <div ref={roundAccuracyTooltipRef} role="tooltip" className="gag-calculator-tooltip pointer-events-none fixed z-[2147483647] max-h-[calc(100vh-1rem)] w-max min-w-64 max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-y-auto rounded-md border border-white/15 bg-[#020712] px-3 py-2 text-left shadow-xl" style={{ left: roundAccuracyTooltipPosition?.left ?? roundAccuracyTooltip.anchor.left, top: roundAccuracyTooltipPosition?.top ?? roundAccuracyTooltip.anchor.bottom + 12, visibility: roundAccuracyTooltipPosition ? 'visible' : 'hidden' }}>
          <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-white/15 bg-[#020712]" aria-hidden="true" />
          <div className="mb-1.5 text-xs font-black text-white">Round {roundAccuracyTooltip.round} accuracy</div>
          {roundAccuracyTooltip.result.perCog.map((cog) => (
            <div key={cog.cogIndex} className="mb-2 text-[11px] font-black text-white last:mb-0">
              <div>{cog.cogName}: <span className="text-sky-300">{formatAccuracy(cog.accuracy)}%</span></div>
              {cog.entries.map((entry) => {
                const track = gagTracks.find((candidate) => candidate.id === entry.trackId);
                return <div key={entry.trackId} className="mb-1 pl-2 text-[10px] font-bold leading-snug text-white/65 last:mb-0">
                  <div className="font-black" style={{ color: track?.color ?? '#c4b5fd' }}>{track?.name ?? 'Special'}: {formatAccuracy(entry.accuracy)}%</div>
                  {entry.specialRule ? (entry.trackId !== 'trap' ? <div className="pl-2">{entry.specialRule}</div> : null) : <div className="pl-2">
                    <div>Base accuracy: {entry.baseAccuracy}%</div>
                    {entry.organicBonus > 0 && <div>Organic bonus: +{entry.organicBonus}%{entry.baseAccuracy + entry.organicBonus > MAX_TOON_ACCURACY ? ' (base capped at 95%)' : ''}</div>}
                    <div>Estimated effective evasion: {MAX_TRACK_EXP_BONUS - entry.defense > 0 ? '+' : ''}{MAX_TRACK_EXP_BONUS - entry.defense}%</div>
                    {entry.trapPlacementBonus > 0 && <div>Trap Bonus: +{entry.trapPlacementBonus}%</div>}
                    {entry.lureBonus > 0 && <div>Multi-Lure Bonus: +{entry.lureBonus}%</div>}
                    {entry.stunBonus > 0 && <div>Stun bonus: +{entry.stunBonus}%</div>}
                    <div className="mt-0.5 text-white">{entry.rawAccuracy > MAX_TOON_ACCURACY ? `Result: ${entry.rawAccuracy}% raw → ~${formatAccuracy(entry.accuracy)}% estimated soft cap` : `Result: ${formatAccuracy(entry.accuracy)}%`}</div>
                  </div>}
                </div>;
              })}
            </div>
          ))}
          <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] font-bold text-white/65">
            <div>All-target-only tracks use one roll against the strongest Cog.</div>
            <div>In mixed tracks, single-target rolls stay independent and the all-target gag inherits them.</div>
            <div className="mt-1 tabular-nums">{roundAccuracyTooltip.result.factors.map((factor) => `${formatAccuracy(factor.accuracy)}%`).join(' × ')}</div>
            <div className="text-[11px] font-black text-sky-300">= {formatAccuracy(roundAccuracyTooltip.result.total)}% chance every gag hits every attacked Cog</div>
          </div>
        </div>, roundAccuracyTooltip.root)}
    </div>
  );
}
