import {
  exportSavedToonData,
  replaceSavedToonData,
  getSetting,
  setSetting,
  type SavedToonDataSnapshot,
} from './db';

export const SYNC_NOTES_SETTING_KEY = 'sync-notes-enabled';

const SYNC_META_KEY = 'toonhqplus-sync-notes-meta';
const SYNC_CHUNK_PREFIX = 'toonhqplus-sync-notes-chunk-';
const SCHEMA_VERSION = 1;
const CHUNK_SIZE = 7000;
const MAX_TOTAL_BYTES = 100 * 1024;

export interface SyncNotesPayload extends SavedToonDataSnapshot {
  app: 'toonhqplus';
  schemaVersion: 1;
  updatedAt: string;
}

interface SyncNotesMeta {
  app: 'toonhqplus';
  schemaVersion: 1;
  updatedAt: string;
  chunkCount: number;
  compression: 'gzip-base64';
}

let lastLocalWriteUpdatedAt: string | null = null;
let listenerInitialized = false;
let importTimer: ReturnType<typeof setTimeout> | null = null;

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
    throw new Error('Sync Notes needs an internet connection. Reconnect and try again.');
  }
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
  if (!meta || meta.app !== 'toonhqplus' || meta.schemaVersion !== SCHEMA_VERSION || meta.compression !== 'gzip-base64') {
    return null;
  }

  const chunkKeys = Array.from({ length: meta.chunkCount }, (_, index) => `${SYNC_CHUNK_PREFIX}${index}`);
  const chunks = await browser.storage.sync.get(chunkKeys);
  const encoded = chunkKeys.map((key) => {
    const chunk = chunks[key];
    if (typeof chunk !== 'string') throw new Error('Synced Notes data is incomplete. Try syncing again from another device.');
    return chunk;
  }).join('');

  const raw = await decompressToString(base64ToBytes(encoded));
  const parsed = JSON.parse(raw) as SyncNotesPayload;
  if (parsed.app !== 'toonhqplus' || parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Synced Notes data uses an unsupported format.');
  }
  return normalizePayload({ ...parsed, updatedAt: meta.updatedAt });
}

export async function writeSyncNotesPayload(payload: SyncNotesPayload): Promise<void> {
  assertOnlineForSync();
  const normalized = normalizePayload(payload);
  const compressed = await compressString(JSON.stringify(normalized));
  const encoded = bytesToBase64(compressed);
  const chunkCount = Math.max(1, Math.ceil(encoded.length / CHUNK_SIZE));
  const chunks: Record<string, string> = {};
  for (let index = 0; index < chunkCount; index += 1) {
    chunks[`${SYNC_CHUNK_PREFIX}${index}`] = encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
  }

  const meta: SyncNotesMeta = {
    app: 'toonhqplus',
    schemaVersion: SCHEMA_VERSION,
    updatedAt: normalized.updatedAt,
    chunkCount,
    compression: 'gzip-base64',
  };
  const update = { ...chunks, [SYNC_META_KEY]: meta };
  const totalBytes = measureBytes(JSON.stringify(update));
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('Sync Notes data is too large for browser sync storage. Remove saved toon notes or saved toons, then try again.');
  }

  const existing = await browser.storage.sync.get(SYNC_META_KEY);
  const oldChunkCount = Math.max(0, Number((existing[SYNC_META_KEY] as SyncNotesMeta | undefined)?.chunkCount || 0));
  await browser.storage.sync.set(update);
  lastLocalWriteUpdatedAt = normalized.updatedAt;

  const staleKeys: string[] = [];
  for (let index = chunkCount; index < oldChunkCount; index += 1) staleKeys.push(`${SYNC_CHUNK_PREFIX}${index}`);
  if (staleKeys.length) await browser.storage.sync.remove(staleKeys);
}

export async function writeCurrentSavedToonsToSync(): Promise<void> {
  await writeSyncNotesPayload(await createLocalSyncNotesPayload());
}

export async function importSyncNotesPayload(payload: SyncNotesPayload): Promise<void> {
  await replaceSavedToonData(payload);
}

export async function setSyncNotesEnabled(enabled: boolean): Promise<void> {
  await setSetting(SYNC_NOTES_SETTING_KEY, enabled);
}

export async function syncSavedToonsAfterLocalMutation(): Promise<void> {
  if (await isSyncNotesEnabled()) {
    await writeCurrentSavedToonsToSync();
  }
}

export async function mutateSavedToonsWithSyncRollback(mutation: () => Promise<void>): Promise<void> {
  if (!(await isSyncNotesEnabled())) {
    await mutation();
    return;
  }

  assertOnlineForSync();
  const before = await exportSavedToonData();
  try {
    await mutation();
    await writeCurrentSavedToonsToSync();
  } catch (error) {
    await replaceSavedToonData(before);
    throw error;
  }
}

export function initSyncNotesRemoteListener(onImported?: () => void): void {
  if (listenerInitialized || !browser.storage?.onChanged) return;
  listenerInitialized = true;

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !Object.keys(changes).some(isSyncKey)) return;
    const nextMeta = changes[SYNC_META_KEY]?.newValue as SyncNotesMeta | undefined;
    if (nextMeta?.updatedAt && nextMeta.updatedAt === lastLocalWriteUpdatedAt) {
      return;
    }
    if (importTimer) clearTimeout(importTimer);
    importTimer = setTimeout(async () => {
      importTimer = null;
      if (!(await isSyncNotesEnabled())) return;
      const payload = await readSyncNotesPayload();
      if (!payload) return;
      if (payload.updatedAt === lastLocalWriteUpdatedAt) return;
      await importSyncNotesPayload(payload);
      onImported?.();
    }, 250);
  });
}
