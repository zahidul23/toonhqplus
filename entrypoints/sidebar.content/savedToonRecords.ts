import type { SavedToonDataSnapshot } from './db';

export type SavedRecordVersion = { counter: number; writer: string; deleted: boolean };
export type SavedRecordVersions = Record<string, SavedRecordVersion>;
export type SavedRecordKind = 'toony' | 'stinky' | 'note';
export const SAVED_RECORD_META_KEY = 'saved-toon-record-versions';
export const SAVED_RECOVERY_KEY = 'saved-toon-recovery';
export type SavedRecordMeta = { writer: string; counter: number; versions: SavedRecordVersions };
export const savedRecordKey = (kind: SavedRecordKind, id: string) => `${kind}:${encodeURIComponent(id)}`;
export function parseSavedRecordKey(key: string): [SavedRecordKind, string] | null {
  const match = /^(toony|stinky|note):(.+)$/.exec(key);
  if (!match || key.length > 2048) return null;
  try { return [match[1] as SavedRecordKind, decodeURIComponent(match[2])]; } catch { return null; }
}
export function compareSavedVersions(a: SavedRecordVersion, b: SavedRecordVersion) {
  return a.counter - b.counter || (a.writer === b.writer ? Number(a.deleted) - Number(b.deleted) : a.writer > b.writer ? 1 : -1);
}
export function validSavedVersions(value: unknown): value is SavedRecordVersions {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, version]) =>
    parseSavedRecordKey(key) && version && Number.isSafeInteger(version.counter) && version.counter >= 0 &&
    typeof version.writer === 'string' && version.writer.length > 0 && version.writer.length <= 100 && typeof version.deleted === 'boolean');
}
export function savedSnapshotValues(snapshot: SavedToonDataSnapshot) {
  const values = new Map<string, string | true>();
  snapshot.toonyToonIds.forEach(id => values.set(savedRecordKey('toony', String(id)), true));
  snapshot.stinkyToonIds.forEach(id => values.set(savedRecordKey('stinky', String(id)), true));
  Object.entries(snapshot.notes).forEach(([id, text]) => { if (text.trim()) values.set(savedRecordKey('note', id), text.trim()); });
  return values;
}
export function completeSavedVersions(snapshot: SavedToonDataSnapshot): SavedRecordVersions {
  const versions = { ...snapshot.recordVersions };
  for (const key of savedSnapshotValues(snapshot).keys()) versions[key] ??= { counter: 0, writer: 'legacy', deleted: false };
  return versions;
}

/** Absence is not deletion. Only an explicit, newer tombstone removes a record.
 * Logical counters avoid timestamp-based replacement of unrelated records. */
export function mergeSavedToonSnapshots(local: SavedToonDataSnapshot, remote: SavedToonDataSnapshot): SavedToonDataSnapshot {
  const localValues = savedSnapshotValues(local), remoteValues = savedSnapshotValues(remote);
  const localVersions = completeSavedVersions(local), remoteVersions = completeSavedVersions(remote);
  const versions: SavedRecordVersions = {}, values = new Map<string, string | true>();
  for (const key of new Set([...Object.keys(localVersions), ...Object.keys(remoteVersions)])) {
    const a = localVersions[key], b = remoteVersions[key];
    const order = a && b ? compareSavedVersions(a, b) : a ? 1 : -1;
    const winner = order >= 0 ? a : b;
    if (!winner || !parseSavedRecordKey(key)) continue;
    versions[key] = { ...winner };
    if (!winner.deleted) {
      const value = order > 0 ? localValues.get(key) : order < 0 ? remoteValues.get(key)
        : [localValues.get(key), remoteValues.get(key)].filter(value => value !== undefined).sort().at(-1);
      if (value !== undefined) values.set(key, value);
    }
  }
  const toonyToonIds: string[] = [], stinkyToonIds: string[] = [], notes: Record<string, string> = {};
  for (const [key, value] of values) {
    const [kind, id] = parseSavedRecordKey(key)!;
    if (kind === 'note') Object.defineProperty(notes, id, { value: String(value), enumerable: true, configurable: true });
    else if (kind === 'toony') toonyToonIds.push(id);
    else stinkyToonIds.push(id);
  }
  // Moves explicitly stamp both categories in the database. Never invent a
  // tombstone for overlapping legacy lists here: that would make merge order
  // affect whether a later deletion also erases an unrelated older flag.
  const toons = new Map(local.toons.map(toon => [String(toon.id), { ...toon, id: String(toon.id) }]));
  for (const toon of remote.toons) {
    const id = String(toon.id), previous = toons.get(id);
    if (!previous || (Date.parse(toon.lastSeen || '') || 0) > (Date.parse(previous.lastSeen || '') || 0)) {
      toons.set(id, { ...previous, ...Object.fromEntries(Object.entries(toon).filter(([, value]) => value !== undefined)), id, name: toon.name || previous?.name || '' });
    }
  }
  return { toons: [...toons.values()], toonyToonIds: toonyToonIds.sort(), stinkyToonIds: stinkyToonIds.sort(), notes, recordVersions: versions };
}

/** Local origin tabs use Web Locks; transactional record revisions also protect
 * data when this API is unavailable. There is no cross-device cloud lock. */
let queue = Promise.resolve();
export async function withSavedToonLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return await navigator.locks.request('toonhqplus-saved-toons', work);
  const operation = queue.then(work, work);
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}

/** Keep saved IDs visible without requiring another ToonHQ request. */
export function buildSavedToonMap(records: { id: string; name: string; hashId?: string; [key: string]: any }[], referencedIds: string[], savedIds = referencedIds) {
  const map: Record<string, any> = Object.create(null);
  const aliases = new Map<string, Set<string>>();
  for (const record of records) {
    map[record.id] = record;
    if (record.hashId && !record.id.startsWith('#')) {
      if (!aliases.has(record.hashId)) aliases.set(record.hashId, new Set());
      aliases.get(record.hashId)!.add(record.id);
    }
  }
  const saved = new Set(savedIds);
  for (const [hash, ids] of aliases) if (!map[hash] && !saved.has(hash) && ids.size === 1) map[hash] = map[[...ids][0]];
  for (const id of referencedIds) if (!map[id]) map[id] = { id, name: `Saved Toon ${id}`, detailsUnavailable: true };
  return map;
}

/** A short synthetic hash is only a hint. Moving saved identity also requires
 * exactly one numeric candidate and matching complete name/photo evidence. */
export function getSafeToonAliases(records: { id: unknown; hashId?: string; name?: string; photo?: string }[]) {
  const candidates = new Map<string, Map<string, typeof records[number]>>();
  for (const record of records) {
    const id = String(record.id);
    if (!id.startsWith('#') && record.hashId) {
      if (!candidates.has(record.hashId)) candidates.set(record.hashId, new Map());
      candidates.get(record.hashId)!.set(id, record);
    }
  }
  const aliases = new Map<string, string>();
  for (const record of records) {
    const id = String(record.id), matches = candidates.get(record.hashId || id);
    if (!id.startsWith('#') || matches?.size !== 1 || !record.name || !record.photo) continue;
    const [canonicalId, canonical] = [...matches][0];
    if (canonical.name === record.name && canonical.photo === record.photo) aliases.set(id, canonicalId);
  }
  return aliases;
}
