import {
  exportSavedToonData,
  replaceSavedToonData,
  applySavedToonData,
  getSetting,
  setSetting,
  type SavedToonDataSnapshot,
} from './db.ts';
import { completeSavedVersions, savedSnapshotValues, validSavedVersions, withSavedToonLock } from './savedToonRecords.ts';

export const SYNC_NOTES_SETTING_KEY = 'sync-notes-enabled';

const SYNC_META_KEY = 'toonhqplus-sync-notes-meta';
const SYNC_CHUNK_PREFIX = 'toonhqplus-sync-notes-chunk-';
export const SYNC_PENDING_KEY = 'sync-notes-pending-error';
const SYNC_LAST_APPLIED_UPDATED_AT_KEY = 'sync-notes-last-applied-updated-at';
const SCHEMA_VERSION = 2;
const CHUNK_SIZE = 7000;
const MAX_TOTAL_BYTES = 100 * 1024;

const SYNC_ERRORS = {
  offline: 'Sync Notes needs an internet connection. Reconnect and try again.',
  full: 'Sync Notes is full. Remove some saved Toons or notes to resume syncing.',
  newer: 'Sync Notes data was saved by a newer version of ToonHQ+. Update the extension to sync.',
  damaged: 'Sync Notes data is damaged. Your saved Toons on this device were not changed.',
};
// Short banner text for a failed background sync; the full error goes to the console.
const PENDING_MESSAGES: Record<string, string> = {
  [SYNC_ERRORS.offline]: 'Saved on this device. Sync Notes will update when you’re back online.',
  [SYNC_ERRORS.full]: 'Saved on this device, but Sync Notes is full. Remove some saved Toons or notes to resume syncing.',
  [SYNC_ERRORS.newer]: 'Saved on this device, but another device uses a newer version of ToonHQ+. Update the extension to keep syncing.',
};

export interface SyncNotesPayload extends SavedToonDataSnapshot {
  app: 'toonhqplus';
  schemaVersion: 1 | 2;
  updatedAt: string;
}

interface SyncNotesMeta {
  app: 'toonhqplus';
  schemaVersion: 1 | 2;
  updatedAt: string;
  chunkCount: number;
  compression: 'gzip-base64';
  generation?: string;
}

interface WriteSyncNotesOptions {
  allowRemoteOverwrite?: boolean;
}

let lastLocalGeneration: string | null = null;
let listenerInitialized = false;
let importTimer: ReturnType<typeof setTimeout> | null = null;
let remoteImportInFlight: Promise<void> | null = null;
let remoteImportPending = false;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function compressString(value: string): Promise<Uint8Array> {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressToString(bytes: Uint8Array): Promise<string> {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function measureBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isSyncKey(key: string): boolean {
  return key === SYNC_META_KEY || key.startsWith(SYNC_CHUNK_PREFIX);
}

function assertOnlineForSync(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(SYNC_ERRORS.offline);
  }
}

async function setLastAppliedSyncUpdatedAt(updatedAt: string): Promise<void> {
  if (updatedAt) await setSetting(SYNC_LAST_APPLIED_UPDATED_AT_KEY, updatedAt);
}

function normalizePayload(value: SyncNotesPayload): SyncNotesPayload {
  return {
    app: 'toonhqplus',
    schemaVersion: SCHEMA_VERSION,
    updatedAt: value.updatedAt || new Date().toISOString(),
    toons: Array.isArray(value.toons) ? value.toons : [],
    toonyToonIds: Array.isArray(value.toonyToonIds) ? value.toonyToonIds.map(String) : [],
    stinkyToonIds: Array.isArray(value.stinkyToonIds) ? value.stinkyToonIds.map(String) : [],
    notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
    recordVersions: value.recordVersions || {},
  };
}

export async function isSyncNotesEnabled(): Promise<boolean> {
  return (await getSetting<boolean>(SYNC_NOTES_SETTING_KEY)) === true;
}

export async function createLocalSyncNotesPayload(updatedAt = new Date().toISOString()): Promise<SyncNotesPayload> {
  const snapshot = await exportSavedToonData();
  return {
    app: 'toonhqplus',
    schemaVersion: SCHEMA_VERSION,
    updatedAt,
    ...snapshot,
  };
}

export async function readSyncNotesPayload(): Promise<SyncNotesPayload | null> {
  const result = await browser.storage.sync.get(SYNC_META_KEY);
  const meta = result[SYNC_META_KEY] as SyncNotesMeta | undefined;
  if (!meta) return null;
  if (meta.app !== 'toonhqplus' || ![1, SCHEMA_VERSION].includes(meta.schemaVersion) || meta.compression !== 'gzip-base64') throw new Error(SYNC_ERRORS.newer);

  if (!Number.isSafeInteger(meta.chunkCount) || meta.chunkCount < 1 || meta.chunkCount > 64 || (meta.generation !== undefined && !/^[a-zA-Z0-9-]{1,100}$/.test(meta.generation))) throw new Error(SYNC_ERRORS.damaged);
  const prefix = meta.generation ? SYNC_CHUNK_PREFIX + meta.generation + '-' : SYNC_CHUNK_PREFIX;
  const chunkKeys = Array.from({ length: meta.chunkCount }, (_, index) => prefix + index);
  const chunks = await browser.storage.sync.get(chunkKeys);
  const encoded = chunkKeys.map((key) => {
    const chunk = chunks[key];
    if (typeof chunk !== 'string') throw new Error('Sync Notes data is incomplete. Try syncing again from another device.');
    return chunk;
  }).join('');

  const raw = await decompressToString(base64ToBytes(encoded));
  const parsed = JSON.parse(raw) as SyncNotesPayload;
  if (!parsed || parsed.app !== 'toonhqplus' || parsed.schemaVersion !== meta.schemaVersion) {
    throw new Error(SYNC_ERRORS.damaged);
  }
  if (!Array.isArray(parsed.toons) || !parsed.toons.every(toon => toon && (typeof toon.id === 'string' || Number.isSafeInteger(toon.id)) && typeof toon.name === 'string') ||
      !Array.isArray(parsed.toonyToonIds) || !Array.isArray(parsed.stinkyToonIds) || ![...parsed.toonyToonIds, ...parsed.stinkyToonIds].every(id => typeof id === 'string' && id.length > 0 || typeof id === 'number' && Number.isSafeInteger(id)) || !parsed.notes || typeof parsed.notes !== 'object' || Array.isArray(parsed.notes) ||
      !Object.values(parsed.notes).every(text => typeof text === 'string') || (parsed.recordVersions !== undefined && !validSavedVersions(parsed.recordVersions))) throw new Error(SYNC_ERRORS.damaged);
  const present = savedSnapshotValues(parsed);
  if (Object.entries(parsed.recordVersions || {}).some(([key, version]) => version.deleted === present.has(key))) throw new Error(SYNC_ERRORS.damaged);
  const latest = (await browser.storage.sync.get(SYNC_META_KEY))[SYNC_META_KEY] as SyncNotesMeta | undefined;
  if (JSON.stringify(latest) !== JSON.stringify(meta)) throw new Error('Sync Notes changed while reading. Try again.');
  return normalizePayload({ ...parsed, updatedAt: meta.updatedAt });
}

function dataSignature(snapshot: SavedToonDataSnapshot): string {
  return JSON.stringify([[...savedSnapshotValues(snapshot)].sort(), Object.entries(completeSavedVersions(snapshot)).sort()]);
}
async function publish(payload: SyncNotesPayload): Promise<void> {
  assertOnlineForSync();
  const normalized = normalizePayload(payload);
  const encoded = bytesToBase64(await compressString(JSON.stringify(normalized)));
  const generation = crypto.randomUUID();
  const chunkCount = Math.max(1, Math.ceil(encoded.length / CHUNK_SIZE));
  const chunks: Record<string, string> = {};
  for (let index = 0; index < chunkCount; index++) chunks[SYNC_CHUNK_PREFIX + generation + '-' + index] = encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
  const meta: SyncNotesMeta = { app: 'toonhqplus', schemaVersion: SCHEMA_VERSION, updatedAt: normalized.updatedAt, chunkCount, compression: 'gzip-base64', generation };
  const update = { ...chunks, [SYNC_META_KEY]: meta };
  if (measureBytes(JSON.stringify(update)) > MAX_TOTAL_BYTES) throw new Error(SYNC_ERRORS.full);
  const existing = (await browser.storage.sync.get(SYNC_META_KEY))[SYNC_META_KEY] as SyncNotesMeta | undefined;
  await browser.storage.sync.set(update);
  lastLocalGeneration = generation;
  await setLastAppliedSyncUpdatedAt(normalized.updatedAt);
  await setSetting(SYNC_PENDING_KEY, null);
  // Only remove the generation this writer read. Never remove a competing
  // writer's newly published chunks. Versioned names prevent mixed payloads.
  if (existing && existing.generation !== generation && Number.isSafeInteger(existing.chunkCount) && existing.chunkCount <= 64) {
    const oldPrefix = existing.generation ? SYNC_CHUNK_PREFIX + existing.generation + '-' : SYNC_CHUNK_PREFIX;
    try { await browser.storage.sync.remove(Array.from({ length: existing.chunkCount }, (_, index) => oldPrefix + index)); }
    catch (error) { console.warn('[ToonHQ+] Could not prune old sync chunks.', error); }
  }
}
async function writeUnlocked(payload?: SyncNotesPayload, replaceRemote = false): Promise<void> {
  const local = await exportSavedToonData();
  const remote = await readSyncNotesPayload();
  if (replaceRemote) {
    const desired = payload || local;
    // Observe the remote logical clock before an intentional replacement so
    // tombstones supersede even records absent from this device's snapshot.
    if (remote) await applySavedToonData(remote);
    await replaceSavedToonData(desired);
  } else {
    if (payload) await applySavedToonData(payload);
    if (remote) await applySavedToonData(remote);
  }
  const current = await exportSavedToonData();
  await publish({ app: 'toonhqplus', schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), ...current });
}
export async function writeSyncNotesPayload(payload: SyncNotesPayload, options: WriteSyncNotesOptions = {}): Promise<void> {
  return withSavedToonLock(() => writeUnlocked(payload, options.allowRemoteOverwrite));
}
export async function writeCurrentSavedToonsToSync(replaceRemote = false): Promise<void> {
  return withSavedToonLock(() => writeUnlocked(undefined, replaceRemote));
}
export async function importSyncNotesPayload(payload: SyncNotesPayload, options: { replace?: boolean } = {}): Promise<void> {
  await withSavedToonLock(async () => {
    if (options.replace) {
      // Import revisions first, then stamp the explicit user's replacement.
      const desired = normalizePayload(payload);
      await applySavedToonData(payload); await replaceSavedToonData(desired);
    } else await applySavedToonData(payload);
    await setLastAppliedSyncUpdatedAt(payload.updatedAt);
  });
}
export async function reconcileSyncNotes(onImported?: () => void): Promise<void> {
  if (!(await isSyncNotesEnabled()) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  await withSavedToonLock(async () => {
    const payload = await readSyncNotesPayload();
    if (!payload) {
      if (await getSetting(SYNC_PENDING_KEY)) await writeUnlocked();
      return;
    }
    await applySavedToonData(payload);
    const current = await exportSavedToonData();
    // A competing snapshot cannot erase this device's durable edits. Republish
    // the reconciled state when it contains records/markers missing remotely.
    if (dataSignature(current) !== dataSignature(payload)) await publish({ app: 'toonhqplus', schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), ...current });
    else await setSetting(SYNC_PENDING_KEY, null);
    onImported?.();
  });
}

function scheduleRemoteSyncNotesImport(onImported?: () => void, delayMs = 250): void {
  if (importTimer) clearTimeout(importTimer);
  importTimer = setTimeout(() => {
    importTimer = null;
    if (remoteImportInFlight) {
      remoteImportPending = true;
      return;
    }
    remoteImportInFlight = reconcileSyncNotes(onImported)
      .catch(markPending)
      .finally(() => {
        const shouldImportPendingUpdate = remoteImportPending;
        remoteImportPending = false;
        remoteImportInFlight = null;
        if (shouldImportPendingUpdate && listenerInitialized) scheduleRemoteSyncNotesImport(onImported, 0);
      });
  }, delayMs);
}

export async function setSyncNotesEnabled(enabled: boolean): Promise<void> {
  await setSetting(SYNC_NOTES_SETTING_KEY, enabled);
}

async function markPending(error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  await setSetting(SYNC_PENDING_KEY, (Object.hasOwn(PENDING_MESSAGES, detail) ? PENDING_MESSAGES[detail] : 'Saved on this device, but Sync Notes couldn’t update.'));
  console.warn('[ToonHQ+] Sync Notes is pending:', detail);
}
export async function syncSavedToonsAfterLocalMutation(): Promise<void> {
  if (!(await isSyncNotesEnabled())) return;
  try { await writeCurrentSavedToonsToSync(); } catch (error) { await markPending(error); }
}
export async function mutateSavedToons(mutation: () => Promise<void>): Promise<void> {
  await withSavedToonLock(async () => {
    await mutation();
    if (await isSyncNotesEnabled()) {
      try { await writeUnlocked(); } catch (error) { await markPending(error); }
    }
  });
}

export function initSyncNotesRemoteListener(onImported?: () => void): () => void {
  if (listenerInitialized || !browser.storage?.onChanged) return () => {};
  listenerInitialized = true;

  const online = () => scheduleRemoteSyncNotesImport(onImported, 0);
  if (typeof window !== 'undefined') window.addEventListener('online', online);
  scheduleRemoteSyncNotesImport(onImported, 0);

  const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, areaName) => {
    if (areaName !== 'sync' || !Object.keys(changes).some(isSyncKey)) return;
    const nextMeta = changes[SYNC_META_KEY]?.newValue as SyncNotesMeta | undefined;
    if (nextMeta?.generation && nextMeta.generation === lastLocalGeneration) {
      return;
    }
    scheduleRemoteSyncNotesImport(onImported);
  };
  browser.storage.onChanged.addListener(changed);
  return () => {
    listenerInitialized = false;
    if (importTimer) clearTimeout(importTimer);
    importTimer = null; remoteImportPending = false;
    browser.storage.onChanged.removeListener(changed);
    if (typeof window !== 'undefined') window.removeEventListener('online', online);
  };
}
