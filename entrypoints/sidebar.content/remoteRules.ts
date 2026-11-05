export function wakeRemoteControlledCog<T extends { isLured: boolean; lureDuration?: number }>(cog: T) {
  cog.isLured = false;
  cog.lureDuration = 0;
}

export type RemoteStars = 1 | 2 | 3;

export const REMOTE_DAMAGE = { 1: 45, 2: 60, 3: 75 } as const;
export const REMOTE_SELF_DAMAGE = { 1: 45, 2: 90, 3: 150 } as const;

export function changeRemoteDamageStars(current: readonly RemoteStars[], stars: RemoteStars, change: 1 | -1): RemoteStars[] {
  if (change === 1) return current.length < 3 ? [...current, stars] : [...current];
  const index = current.indexOf(stars);
  return current.filter((_, entryIndex) => entryIndex !== index);
}

export function getRemoteDamage(damageStars: readonly RemoteStars[], selfDamageStars: RemoteStars | null) {
  return damageStars.reduce((total, stars) => total + REMOTE_DAMAGE[stars], 0)
    + (selfDamageStars === null ? 0 : REMOTE_SELF_DAMAGE[selfDamageStars]);
}

// A v2.0 Cog keeps its remote when only its outer shell breaks; the remote
// is removed once the Cog is fully destroyed.
export function clearRemoteIfDestroyed<T extends { remote?: unknown; isRemoteDmg?: boolean; isRemoteHeal?: boolean }>(cog: T, layersLeft: number) {
  if (layersLeft > 0) return;
  cog.remote = undefined;
  cog.isRemoteDmg = false;
  cog.isRemoteHeal = false;
}
