const TRACK_IDS = ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop'] as const;
type TrackId = (typeof TRACK_IDS)[number];
export type FieldOfficeDefense = 0 | 10 | 15 | 20 | 25;
export type GagDamageSelection = { trackId: TrackId | 'toonsHit'; damage: number };

/** Market Research reduces each gag before combo and knockback bonuses. */
export function getDamageAfterDefense(gag: GagDamageSelection, defense: FieldOfficeDefense) {
  if (gag.trackId === 'lure' || gag.trackId === 'toonsHit') return gag.damage;
  return Math.floor(gag.damage * (1 - defense / 100));
}

function comboBonus(damage: number, count: number) {
  return count >= 2 ? Math.ceil(damage * 0.2) : 0;
}

export function calculateGagDamage(gags: Array<GagDamageSelection | null>, preLured: boolean, remote = 0, defense: FieldOfficeDefense = 0) {
  let base = 0;
  let knockback = 0;
  const bonuses: Array<{ trackId: TrackId; amount: number }> = [];
  let lured = preLured;
  const hasSelectedLure = gags.some((gag) => gag?.trackId === 'lure');
  const selectedTrapCount = gags.filter((gag) => gag?.trackId === 'trap').length;

  for (const trackId of TRACK_IDS) {
    const trackGags = gags.filter((gag): gag is GagDamageSelection => gag?.trackId === trackId);
    if (!trackGags.length) continue;

    if (trackId === 'trap') {
      if (hasSelectedLure) base += Math.max(...trackGags.map((gag) => getDamageAfterDefense(gag, defense)));
      continue;
    }

    if (trackId === 'lure') {
      // A successful Lure immediately springs a Trap selected in the same
      // combo. Once the Trap hits, the Cog is no longer lured, so a later
      // Drop can hit normally.
      lured = selectedTrapCount === 0;
      continue;
    }

    const baseDamage = trackGags.reduce((sum, gag) => sum + getDamageAfterDefense(gag, defense), 0);
    const bonus = comboBonus(baseDamage, trackGags.length);

    if (trackId === 'sound') {
      base += baseDamage;
      if (bonus) bonuses.push({ trackId, amount: bonus });
      lured = false;
    } else if (trackId === 'throw' || trackId === 'squirt') {
      const trackKnockback = lured ? Math.ceil(baseDamage * 0.5) : 0;
      base += baseDamage;
      knockback += trackKnockback;
      if (bonus) bonuses.push({ trackId, amount: bonus });
      lured = false;
    } else if (trackId === 'drop' && !lured) {
      base += baseDamage;
      if (bonus) bonuses.push({ trackId, amount: bonus });
    }
  }

  const bonus = bonuses.reduce((sum, entry) => sum + entry.amount, 0);
  return { total: base + knockback + bonus + remote, base, knockback, bonuses, remote };
}

