import { getSafeToonAliases } from '../sidebar.content/savedToonRecords.ts';
export interface IndexedDbIndexSnapshot {
  keyPath: string | string[] | null;
  unique: boolean;
  multiEntry: boolean;
}

export interface IndexedDbStoreSnapshot {
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: Record<string, IndexedDbIndexSnapshot>;
  records: any[];
}

export interface IndexedDbDatabaseSnapshot {
  version: number;
  stores: Record<string, IndexedDbStoreSnapshot>;
}

export interface OriginStorageSnapshot {
  localStorage: Record<string, string>;
  indexedDB: Record<string, IndexedDbDatabaseSnapshot>;
}

export interface ExtensionStorageSnapshot extends OriginStorageSnapshot {
  browserStorageLocal: Record<string, any>;
}

export interface TransferSnapshot {
  app: 'toonhqplus';
  version: 1;
  exportedAt: string;
  origins: {
    site: OriginStorageSnapshot;
    extension: ExtensionStorageSnapshot;
  };
}

export interface TransferDocument {
  app: 'toonhqplus';
  version: 1;
  exportedAt: string;
  compression: 'gzip-base64';
  rawBytes: number;
  compressedBytes: number;
  payload: string;
}

export type ImportMode = 'merge' | 'replace';
export type ImportConflictPolicy = 'keep-local' | 'use-import';

export interface ImportOptions {
  mode: ImportMode;
  conflictPolicy: ImportConflictPolicy;
}

export interface ImportPlanSummary {
  localStorage: {
    added: number;
    updated: number;
    conflicts: number;
    unchanged: number;
  };
  indexedDB: {
    databases: number;
    stores: number;
    added: number;
    updated: number;
    conflicts: number;
    unchanged: number;
  };
  browserStorageLocal: {
    added: number;
    updated: number;
    conflicts: number;
    unchanged: number;
  };
  comparisons?: ImportComparisonDetail[];
}

export type ImportComparisonKind = 'added' | 'updated' | 'conflict' | 'unchanged';

export interface ImportComparisonDetail {
  kind: ImportComparisonKind;
  area: string;
  location: string;
  key: string;
  existing?: unknown;
  incoming: unknown;
  merged?: unknown;
}

function createEmptyImportPlanSummary(): ImportPlanSummary {
  return {
    localStorage: { added: 0, updated: 0, conflicts: 0, unchanged: 0 },
    indexedDB: { databases: 0, stores: 0, added: 0, updated: 0, conflicts: 0, unchanged: 0 },
    browserStorageLocal: { added: 0, updated: 0, conflicts: 0, unchanged: 0 },
    comparisons: [],
  };
}

export function mergeImportPlanSummaries(...summaries: ImportPlanSummary[]): ImportPlanSummary {
  const out = createEmptyImportPlanSummary();
  for (const summary of summaries) {
    for (const key of ['added', 'updated', 'conflicts', 'unchanged'] as const) {
      out.localStorage[key] += summary.localStorage[key];
      out.browserStorageLocal[key] += summary.browserStorageLocal[key];
      out.indexedDB[key] += summary.indexedDB[key];
    }
    out.indexedDB.databases += summary.indexedDB.databases;
    out.indexedDB.stores += summary.indexedDB.stores;
    out.comparisons?.push(...(summary.comparisons || []));
  }
  return out;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableSerializeJsonValue(value: unknown, inArray: boolean = false): string | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? 'null' : undefined;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeJsonValue(entry, true) ?? 'null').join(',')}]`;
  }
  if (isObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const serialized = stableSerializeJsonValue(value[key]);
        return serialized === undefined ? null : `${JSON.stringify(key)}:${serialized}`;
      })
      .filter((entry): entry is string => entry !== null);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableStringify(value: unknown): string {
  return stableSerializeJsonValue(value) ?? 'undefined';
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function getRecordKey(record: any, keyPath: string | string[] | null): string {
  if (Array.isArray(keyPath)) {
    return stableStringify(keyPath.map((key) => record?.[key]));
  }
  if (typeof keyPath === 'string') {
    return stableStringify(record?.[keyPath]);
  }
  return stableStringify(record);
}

function isTrackerRewardHistoryRecord(record: any): boolean {
  return typeof record?.key === 'string'
    && record.key.startsWith('tracker-reward-history-')
    && Array.isArray(record.value);
}

function getRewardHistoryEntryKey(entry: any): string {
  return stableStringify({
    category: entry?.category,
    item: entry?.item,
    amount: entry?.amount,
    timestamp: entry?.timestamp,
    metadata: entry?.metadata,
    message: entry?.message,
  });
}

function mergeRewardHistoryValues(localValue: unknown, importedValue: unknown): unknown {
  if (!Array.isArray(localValue) || !Array.isArray(importedValue)) return importedValue;

  const byEntryKey = new Map<string, any>();
  for (const entry of [...localValue, ...importedValue]) {
    if (!isObject(entry) || typeof entry.timestamp !== 'number') continue;
    byEntryKey.set(getRewardHistoryEntryKey(entry), entry);
  }

  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  return Array.from(byEntryKey.values())
    .filter((entry) => entry.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500);
}

function mergeIndexedDbRecord(storeName: string, current: any, incoming: any): any {
  if (storeName === 'settings' && isTrackerRewardHistoryRecord(current) && isTrackerRewardHistoryRecord(incoming)) {
    return {
      ...incoming,
      value: mergeRewardHistoryValues(current.value, incoming.value),
    };
  }
  if (storeName === 'toons' && isObject(current) && isObject(incoming)) {
    const currentSeen = Date.parse(String(current.lastSeen ?? ''));
    const incomingSeen = Date.parse(String(incoming.lastSeen ?? ''));
    if (Number.isFinite(currentSeen) && Number.isFinite(incomingSeen)) {
      return incomingSeen >= currentSeen ? incoming : current;
    }
  }
  return incoming;
}

function canMergeIndexedDbRecord(storeName: string, current: any, incoming: any): boolean {
  return (storeName === 'settings' && isTrackerRewardHistoryRecord(current) && isTrackerRewardHistoryRecord(incoming))
    || (storeName === 'toons'
      && isObject(current)
      && isObject(incoming)
      && Number.isFinite(Date.parse(String(current.lastSeen ?? '')))
      && Number.isFinite(Date.parse(String(incoming.lastSeen ?? ''))));
}

function compareMapRecords(
  current: Record<string, any>,
  incoming: Record<string, any>,
  bucket: { added: number; updated: number; conflicts: number; unchanged: number },
  comparisons: ImportComparisonDetail[] | undefined,
  area: string,
  location: string
): void {
  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (!(key in current)) {
      bucket.added += 1;
      comparisons?.push({ kind: 'added', area, location, key, incoming: incomingValue });
    } else if (valuesEqual(current[key], incomingValue)) {
      bucket.unchanged += 1;
      comparisons?.push({ kind: 'unchanged', area, location, key, existing: current[key], incoming: incomingValue });
    } else {
      bucket.conflicts += 1;
      comparisons?.push({ kind: 'conflict', area, location, key, existing: current[key], incoming: incomingValue });
    }
  }
}

export function analyzeLocalStorageMerge(current: Record<string, string>, incoming: Record<string, string>, area = 'Local Storage'): ImportPlanSummary {
  const summary = createEmptyImportPlanSummary();
  compareMapRecords(
    filterLocalStorageSnapshot(current),
    filterLocalStorageSnapshot(incoming),
    summary.localStorage,
    summary.comparisons,
    area,
    'localStorage'
  );
  return summary;
}

export function analyzeBrowserStorageLocalMerge(current: Record<string, any>, incoming: Record<string, any>, area = 'Browser Storage Local'): ImportPlanSummary {
  const summary = createEmptyImportPlanSummary();
  compareMapRecords(current, incoming, summary.browserStorageLocal, summary.comparisons, area, 'browser.storage.local');
  return summary;
}

export function analyzeIndexedDbMerge(
  current: Record<string, IndexedDbDatabaseSnapshot>,
  incoming: Record<string, IndexedDbDatabaseSnapshot>,
  area = 'IndexedDB'
): ImportPlanSummary {
  const summary = createEmptyImportPlanSummary();

  for (const [databaseName, incomingDatabase] of Object.entries(incoming)) {
    summary.indexedDB.databases += 1;
    const currentDatabase = current[databaseName];

    for (const [storeName, incomingStore] of Object.entries(incomingDatabase.stores)) {
      summary.indexedDB.stores += 1;
      const currentStore = currentDatabase?.stores?.[storeName];
      if (!currentStore) {
        summary.indexedDB.added += incomingStore.records.length;
        for (const incomingRecord of incomingStore.records) {
          summary.comparisons?.push({
            kind: 'added',
            area,
            location: `${databaseName}.${storeName}`,
            key: getRecordKey(incomingRecord, incomingStore.keyPath),
            incoming: incomingRecord,
          });
        }
        continue;
      }

      const currentByKey = new Map<string, any>();
      for (const record of currentStore.records) {
        currentByKey.set(getRecordKey(record, incomingStore.keyPath), record);
      }

      for (const incomingRecord of incomingStore.records) {
        const key = getRecordKey(incomingRecord, incomingStore.keyPath);
        const existingRecord = currentByKey.get(key);
        const location = `${databaseName}.${storeName}`;
        if (!currentByKey.has(key)) {
          summary.indexedDB.added += 1;
          summary.comparisons?.push({ kind: 'added', area, location, key, incoming: incomingRecord });
        } else if (valuesEqual(currentByKey.get(key), incomingRecord)) {
          summary.indexedDB.unchanged += 1;
          summary.comparisons?.push({ kind: 'unchanged', area, location, key, existing: existingRecord, incoming: incomingRecord });
        } else if (canMergeIndexedDbRecord(storeName, currentByKey.get(key), incomingRecord)) {
          const merged = mergeIndexedDbRecord(storeName, existingRecord, incomingRecord);
          if (valuesEqual(existingRecord, merged)) {
            summary.indexedDB.unchanged += 1;
            summary.comparisons?.push({
              kind: 'unchanged',
              area,
              location,
              key,
              existing: existingRecord,
              incoming: incomingRecord,
              merged,
            });
            continue;
          }
          summary.indexedDB.updated += 1;
          summary.comparisons?.push({
            kind: 'updated',
            area,
            location,
            key,
            existing: existingRecord,
            incoming: incomingRecord,
            merged,
          });
        } else {
          summary.indexedDB.conflicts += 1;
          summary.comparisons?.push({ kind: 'conflict', area, location, key, existing: existingRecord, incoming: incomingRecord });
        }
      }
    }
  }

  return summary;
}

export function analyzeOriginStorageMerge(current: OriginStorageSnapshot, incoming: OriginStorageSnapshot, areaPrefix = 'Site'): ImportPlanSummary {
  return mergeImportPlanSummaries(
    analyzeLocalStorageMerge(current.localStorage || {}, incoming.localStorage || {}, `${areaPrefix} Local Storage`),
    analyzeIndexedDbMerge(current.indexedDB || {}, incoming.indexedDB || {}, `${areaPrefix} IndexedDB`),
  );
}

export function analyzeExtensionStorageMerge(current: ExtensionStorageSnapshot, incoming: ExtensionStorageSnapshot): ImportPlanSummary {
  return mergeImportPlanSummaries(
    analyzeOriginStorageMerge(current, incoming, 'Extension'),
    analyzeBrowserStorageLocalMerge(current.browserStorageLocal || {}, incoming.browserStorageLocal || {}, 'Extension Browser Storage'),
  );
}

function extractSettingValue<T = any>(records: any[], key: string): T | undefined {
  const record = records.find((entry) => String(entry?.key) === key);
  return record?.value as T | undefined;
}

function normalizeToonIdentityDatabase(database: IndexedDbDatabaseSnapshot): IndexedDbDatabaseSnapshot {
  const toonsStore = database.stores.toons;
  if (!toonsStore) return database;

  const canonicalIdByHash = getSafeToonAliases(toonsStore.records);
  // Backups must keep saved IDs and their revision markers together. Saved
  // aliases are migrated by cleanupToonCache in a transaction that stamps both
  // identities; a transfer normalization cannot perform that migration.
  const savedIds = new Set(['toony_toons', 'stinky_toons', 'notes'].flatMap(name =>
    (database.stores[name]?.records || []).map(record => String(record.toonId))));
  for (const hash of canonicalIdByHash.keys()) if (savedIds.has(hash)) canonicalIdByHash.delete(hash);

  if (canonicalIdByHash.size === 0) return database;

  const canonicalizeId = (value: unknown): unknown => {
    if (value == null) return value;
    const id = String(value);
    return canonicalIdByHash.get(id) ?? id;
  };

  const stores = { ...database.stores };
  const toonsById = new Map<string, any>();
  for (const toon of toonsStore.records) {
    if (toon?.id == null) continue;
    const id = String(canonicalizeId(toon.id));
    const normalized = { ...toon, id };
    const existing = toonsById.get(id);
    // Prefer the already-canonical record over its older synthetic duplicate.
    if (!existing || !String(toon.id).startsWith('#')) toonsById.set(id, normalized);
  }
  stores.toons = { ...toonsStore, records: Array.from(toonsById.values()) };

  for (const storeName of ['toony_toons', 'stinky_toons'] as const) {
    const store = stores[storeName];
    if (!store) continue;
    const records = new Map<string, any>();
    for (const record of store.records) {
      if (record?.toonId == null) continue;
      const toonId = String(canonicalizeId(record.toonId));
      records.set(toonId, { ...record, toonId });
    }
    stores[storeName] = { ...store, records: Array.from(records.values()) };
  }

  const notesStore = stores.notes;
  if (notesStore) {
    const records = new Map<string, any>();
    for (const record of notesStore.records) {
      if (record?.toonId == null) continue;
      const originalId = String(record.toonId);
      const toonId = String(canonicalizeId(originalId));
      // Prefer a note already stored under the canonical ID.
      if (!records.has(toonId) || originalId === toonId) records.set(toonId, { ...record, toonId });
    }
    stores.notes = { ...notesStore, records: Array.from(records.values()) };
  }

  const membersStore = stores.group_members;
  if (membersStore) {
    const records = new Map<string, any>();
    for (const record of membersStore.records) {
      if (record?.toonId == null) continue;
      const toonId = String(canonicalizeId(record.toonId));
      const key = JSON.stringify([record.groupId, toonId]);
      const existing = records.get(key);
      if (!existing) {
        records.set(key, { ...record, toonId });
        continue;
      }

      const joinedTimes = [existing.joined, record.joined]
        .filter(Boolean)
        .sort((a, b) => Date.parse(String(a)) - Date.parse(String(b)));
      const isActive = !existing.left || !record.left;
      const leftTimes = [existing.left, record.left]
        .filter(Boolean)
        .sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)));
      records.set(key, {
        ...existing,
        ...record,
        toonId,
        joined: joinedTimes[0] ?? existing.joined ?? record.joined,
        left: isActive ? null : (leftTimes[0] ?? existing.left ?? record.left),
      });
    }
    stores.group_members = { ...membersStore, records: Array.from(records.values()) };
  }

  const settingsStore = stores.settings;
  if (settingsStore) {
    stores.settings = {
      ...settingsStore,
      records: settingsStore.records.map((record) => record?.key === 'active-toon-ids' && Array.isArray(record.value)
        ? { ...record, value: [...new Set(record.value.map(canonicalizeId).map(String))] }
        : record),
    };
  }

  return { ...database, stores };
}

export function normalizeToonIdentitiesInSnapshot(
  snapshot: Record<string, IndexedDbDatabaseSnapshot>
): Record<string, IndexedDbDatabaseSnapshot> {
  return Object.fromEntries(
    Object.entries(snapshot).map(([name, database]) => [name, normalizeToonIdentityDatabase(database)])
  );
}

function collectReferencedToonIds(database: IndexedDbDatabaseSnapshot): Set<string> {
  const referenced = new Set<string>();
  const toonyRecords = database.stores.toony_toons?.records ?? [];
  const stinkyRecords = database.stores.stinky_toons?.records ?? [];
  const noteRecords = database.stores.notes?.records ?? [];
  const groupMemberRecords = database.stores.group_members?.records ?? [];
  const settingRecords = database.stores.settings?.records ?? [];

  for (const record of toonyRecords) {
    if (record?.toonId != null) referenced.add(String(record.toonId));
  }
  for (const record of stinkyRecords) {
    if (record?.toonId != null) referenced.add(String(record.toonId));
  }
  for (const record of noteRecords) {
    if (record?.toonId != null) referenced.add(String(record.toonId));
  }
  for (const record of groupMemberRecords) {
    if (record?.toonId != null) referenced.add(String(record.toonId));
  }

  const activeToonIds = extractSettingValue<any[]>(settingRecords, 'active-toon-ids');
  if (Array.isArray(activeToonIds)) {
    for (const toonId of activeToonIds) {
      if (toonId != null) referenced.add(String(toonId));
    }
  }

  return referenced;
}

const EXPORT_GROUP_HISTORY_LIMIT = 20;
const EXPORT_GROUP_MEMBER_LIMIT = 20;

function getGroupTime(group: any): number {
  const time = new Date(group?.userJoinedAt || group?.created || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getExportableGroupIds(database: IndexedDbDatabaseSnapshot): Set<number> | null {
  const groupsStore = database.stores.groups;
  const membersStore = database.stores.group_members;
  if (!groupsStore || !membersStore) return null;

  const memberCounts = new Map<number, number>();
  for (const member of membersStore.records) {
    const groupId = Number(member?.groupId);
    if (!Number.isFinite(groupId)) continue;
    memberCounts.set(groupId, (memberCounts.get(groupId) || 0) + 1);
  }

  return new Set(
    groupsStore.records
      .filter((group) => (memberCounts.get(Number(group?.groupId)) || 0) <= EXPORT_GROUP_MEMBER_LIMIT)
      .sort((a, b) => getGroupTime(b) - getGroupTime(a))
      .slice(0, EXPORT_GROUP_HISTORY_LIMIT)
      .map((group) => Number(group?.groupId))
      .filter((groupId) => Number.isFinite(groupId))
  );
}

export function pruneIndexedDbSnapshotForExport(snapshot: Record<string, IndexedDbDatabaseSnapshot>): Record<string, IndexedDbDatabaseSnapshot> {
  const pruned: Record<string, IndexedDbDatabaseSnapshot> = {};

  for (const [databaseName, database] of Object.entries(normalizeToonIdentitiesInSnapshot(snapshot))) {
    const toonsStore = database.stores.toons;
    if (!toonsStore) {
      pruned[databaseName] = database;
      continue;
    }

    const exportableGroupIds = getExportableGroupIds(database);
    const stores = { ...database.stores };
    if (exportableGroupIds) {
      if (stores.groups) {
        stores.groups = {
          ...stores.groups,
          records: stores.groups.records.filter((record) => exportableGroupIds.has(Number(record?.groupId))),
        };
      }
      if (stores.group_members) {
        stores.group_members = {
          ...stores.group_members,
          records: stores.group_members.records.filter((record) => exportableGroupIds.has(Number(record?.groupId))),
        };
      }
    }

    const databaseForReferences = { ...database, stores };
    const referencedToonIds = collectReferencedToonIds(databaseForReferences);
    pruned[databaseName] = {
      ...database,
      stores: {
        ...stores,
        toons: {
          ...toonsStore,
          records: toonsStore.records.filter((record) => referencedToonIds.has(String(record?.id))),
        },
      },
    };
  }

  return pruned;
}

function cloneKeyPath(keyPath: IDBObjectStore['keyPath'] | IDBIndex['keyPath']): string | string[] | null {
  if (keyPath == null) return null;
  return Array.isArray(keyPath) ? [...keyPath] : keyPath;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

async function listKnownDatabases(fallbackNames: string[] = []): Promise<Array<{ name: string; version?: number }>> {
  const databases = (indexedDB as any).databases;
  if (typeof databases === 'function') {
    const results = await databases.call(indexedDB);
    return (results || [])
      .filter((entry: any) => typeof entry?.name === 'string' && entry.name)
      .map((entry: any) => ({ name: String(entry.name), version: typeof entry.version === 'number' ? entry.version : undefined }));
  }

  return fallbackNames.map((name) => ({ name }));
}

async function openExistingDatabase(name: string, version?: number): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let createdDuringOpen = false;
    const request = version ? indexedDB.open(name, version) : indexedDB.open(name);

    request.onupgradeneeded = (event) => {
      if ((event as IDBVersionChangeEvent).oldVersion === 0) {
        createdDuringOpen = true;
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (createdDuringOpen && db.objectStoreNames.length === 0) {
        db.close();
        indexedDB.deleteDatabase(name);
        resolve(null);
        return;
      }
      resolve(db);
    };

    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB database "${name}".`));
  });
}

async function exportIndexedDatabase(name: string, version?: number): Promise<IndexedDbDatabaseSnapshot | null> {
  const db = await openExistingDatabase(name, version);
  if (!db) return null;

  try {
    const storeNames = Array.from(db.objectStoreNames);
    if (storeNames.length === 0) {
      return {
        version: db.version,
        stores: {},
      };
    }

    const transaction = db.transaction(storeNames, 'readonly');
    const stores: Record<string, IndexedDbStoreSnapshot> = {};

    await Promise.all(storeNames.map(async (storeName) => {
      const store = transaction.objectStore(storeName);
      const indexes: Record<string, IndexedDbIndexSnapshot> = {};
      for (const indexName of Array.from(store.indexNames)) {
        const index = store.index(indexName);
        indexes[indexName] = {
          keyPath: cloneKeyPath(index.keyPath),
          unique: index.unique,
          multiEntry: index.multiEntry,
        };
      }

      stores[storeName] = {
        keyPath: cloneKeyPath(store.keyPath),
        autoIncrement: store.autoIncrement,
        indexes,
        records: await requestToPromise(store.getAll()),
      };
    }));

    await transactionToPromise(transaction);
    return {
      version: db.version,
      stores,
    };
  } finally {
    db.close();
  }
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete IndexedDB database "${name}".`));
    request.onblocked = () => reject(new Error(`Deleting IndexedDB database "${name}" was blocked by another open connection.`));
  });
}

async function importIndexedDatabase(name: string, snapshot: IndexedDbDatabaseSnapshot): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, Math.max(snapshot.version || 1, 1));

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const existingName of Array.from(db.objectStoreNames)) {
        if (!(existingName in snapshot.stores)) {
          db.deleteObjectStore(existingName);
        }
      }

      for (const [storeName, storeSnapshot] of Object.entries(snapshot.stores)) {
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName, {
            keyPath: storeSnapshot.keyPath,
            autoIncrement: storeSnapshot.autoIncrement,
          });
        } else {
          store = request.transaction!.objectStore(storeName);
        }

        for (const indexName of Array.from(store.indexNames)) {
          if (!(indexName in storeSnapshot.indexes)) {
            store.deleteIndex(indexName);
          }
        }

        for (const [indexName, indexSnapshot] of Object.entries(storeSnapshot.indexes)) {
          if (!store.indexNames.contains(indexName)) {
            store.createIndex(indexName, indexSnapshot.keyPath as any, {
              unique: indexSnapshot.unique,
              multiEntry: indexSnapshot.multiEntry,
            });
          }
        }
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      try {
        const storeNames = Object.keys(snapshot.stores);
        if (storeNames.length > 0) {
          const transaction = db.transaction(storeNames, 'readwrite');
          for (const [storeName, storeSnapshot] of Object.entries(snapshot.stores)) {
            const store = transaction.objectStore(storeName);
            for (const record of storeSnapshot.records) {
              store.put(record);
            }
          }
          await transactionToPromise(transaction);
        }
        db.close();
        resolve();
      } catch (error) {
        db.close();
        reject(error);
      }
    };

    request.onerror = () => reject(request.error ?? new Error(`Failed to import IndexedDB database "${name}".`));
  });
}

function hasMissingMergeSchema(db: IDBDatabase, snapshot: IndexedDbDatabaseSnapshot): boolean {
  for (const [storeName, storeSnapshot] of Object.entries(snapshot.stores)) {
    if (!db.objectStoreNames.contains(storeName)) return true;
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    for (const indexName of Object.keys(storeSnapshot.indexes)) {
      if (!store.indexNames.contains(indexName)) return true;
    }
  }
  return false;
}

async function ensureIndexedDbMergeSchema(name: string, snapshot: IndexedDbDatabaseSnapshot): Promise<void> {
  const existing = await openExistingDatabase(name);
  const currentVersion = existing?.version ?? 0;
  const needsSchemaUpgrade = existing ? hasMissingMergeSchema(existing, snapshot) : true;
  existing?.close();

  const snapshotVersion = Math.max(snapshot.version || 1, 1);
  const targetVersion = currentVersion === 0
    ? snapshotVersion
    : Math.max(snapshotVersion, needsSchemaUpgrade ? currentVersion + 1 : currentVersion);

  if (currentVersion > 0 && targetVersion === currentVersion && !needsSchemaUpgrade) return;

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, targetVersion);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const [storeName, storeSnapshot] of Object.entries(snapshot.stores)) {
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName, {
            keyPath: storeSnapshot.keyPath,
            autoIncrement: storeSnapshot.autoIncrement,
          });
        } else {
          store = request.transaction!.objectStore(storeName);
        }

        for (const [indexName, indexSnapshot] of Object.entries(storeSnapshot.indexes)) {
          if (!store.indexNames.contains(indexName)) {
            store.createIndex(indexName, indexSnapshot.keyPath as any, {
              unique: indexSnapshot.unique,
              multiEntry: indexSnapshot.multiEntry,
            });
          }
        }
      }
    };

    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error(`Failed to prepare IndexedDB database "${name}" for merge.`));
    request.onblocked = () => reject(new Error(`Preparing IndexedDB database "${name}" for merge was blocked by another open connection.`));
  });
}

export function snapshotLocalStorage(storage: Storage): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key != null && isToonHqPlusLocalStorageKey(key)) snapshot[key] = storage.getItem(key) ?? '';
  }
  return snapshot;
}

function isToonHqPlusLocalStorageKey(key: string): boolean {
  return key.startsWith('toonhqplus')
    || key.startsWith('toonhq-plus')
    || key.startsWith('cog-calc-');
}

function filterLocalStorageSnapshot(snapshot: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => isToonHqPlusLocalStorageKey(key)));
}

export function restoreLocalStorage(storage: Storage, snapshot: Record<string, string>): void {
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (key != null && isToonHqPlusLocalStorageKey(key)) storage.removeItem(key);
  }
  for (const [key, value] of Object.entries(filterLocalStorageSnapshot(snapshot))) {
    storage.setItem(key, value);
  }
}

export function mergeLocalStorage(storage: Storage, snapshot: Record<string, string>, options: Pick<ImportOptions, 'conflictPolicy'>): void {
  for (const [key, value] of Object.entries(filterLocalStorageSnapshot(snapshot))) {
    const current = storage.getItem(key);
    if (current == null || current === value || options.conflictPolicy === 'use-import') {
      storage.setItem(key, value);
    }
  }
}

export async function snapshotIndexedDatabases(options?: { fallbackNames?: string[] }): Promise<Record<string, IndexedDbDatabaseSnapshot>> {
  const databases = await listKnownDatabases(options?.fallbackNames);
  const snapshot: Record<string, IndexedDbDatabaseSnapshot> = {};

  for (const database of databases) {
    const exported = await exportIndexedDatabase(database.name, database.version);
    if (exported) snapshot[database.name] = exported;
  }

  return snapshot;
}

export async function restoreIndexedDatabases(
  snapshot: Record<string, IndexedDbDatabaseSnapshot>,
  options?: { fallbackNames?: string[] }
): Promise<void> {
  const existing = await listKnownDatabases(options?.fallbackNames);
  const existingNames = new Set(existing.map((entry) => entry.name));

  for (const name of existingNames) {
    await deleteDatabase(name);
  }

  for (const [name, databaseSnapshot] of Object.entries(snapshot)) {
    await importIndexedDatabase(name, databaseSnapshot);
  }
}

export async function mergeIndexedDatabases(
  snapshot: Record<string, IndexedDbDatabaseSnapshot>,
  options: Pick<ImportOptions, 'conflictPolicy'>
): Promise<void> {
  for (const [name, databaseSnapshot] of Object.entries(snapshot)) {
    await ensureIndexedDbMergeSchema(name, databaseSnapshot);

    const currentSnapshot = await exportIndexedDatabase(name);
    const db = await openExistingDatabase(name);
    if (!db) continue;

    try {
      const storeNames = Object.keys(databaseSnapshot.stores).filter((storeName) => db.objectStoreNames.contains(storeName));
      if (storeNames.length === 0) continue;

      const transaction = db.transaction(storeNames, 'readwrite');
      for (const [storeName, incomingStore] of Object.entries(databaseSnapshot.stores)) {
        if (!db.objectStoreNames.contains(storeName)) continue;
        const currentStore = currentSnapshot?.stores?.[storeName];
        const currentByKey = new Map<string, any>();
        if (currentStore) {
          for (const record of currentStore.records) {
            currentByKey.set(getRecordKey(record, incomingStore.keyPath), record);
          }
        }

        const store = transaction.objectStore(storeName);
        for (const record of incomingStore.records) {
          const key = getRecordKey(record, incomingStore.keyPath);
          const current = currentByKey.get(key);
          if (current !== undefined && canMergeIndexedDbRecord(storeName, current, record)) {
            const merged = mergeIndexedDbRecord(storeName, current, record);
            if (!valuesEqual(current, merged)) {
              store.put(merged);
            }
          } else if (current === undefined || valuesEqual(current, record) || options.conflictPolicy === 'use-import') {
            store.put(record);
          }
        }
      }
      await transactionToPromise(transaction);
    } finally {
      db.close();
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
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

export function measureBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export async function createTransferDocument(snapshot: TransferSnapshot): Promise<{ document: TransferDocument; json: string }> {
  const rawPayload = JSON.stringify(snapshot);
  const compressed = await compressString(rawPayload);
  const document: TransferDocument = {
    app: 'toonhqplus',
    version: 1,
    exportedAt: snapshot.exportedAt,
    compression: 'gzip-base64',
    rawBytes: measureBytes(rawPayload),
    compressedBytes: compressed.length,
    payload: bytesToBase64(compressed),
  };

  return {
    document,
    json: JSON.stringify(document, null, 2),
  };
}

export async function parseTransferDocument(text: string): Promise<TransferSnapshot> {
  let parsed: TransferDocument;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Import data is not valid JSON.');
  }

  if (parsed.app !== 'toonhqplus' || parsed.version !== 1 || parsed.compression !== 'gzip-base64' || typeof parsed.payload !== 'string') {
    throw new Error('Import data is not a valid ToonHQ+ backup.');
  }

  const rawText = await decompressToString(base64ToBytes(parsed.payload));
  const snapshot = JSON.parse(rawText) as TransferSnapshot;
  if (snapshot.app !== 'toonhqplus' || snapshot.version !== 1 || !snapshot.origins?.site || !snapshot.origins?.extension) {
    throw new Error('Backup payload is missing required ToonHQ+ data.');
  }

  return snapshot;
}

function pad(value: number, length: number = 2): string {
  return String(value).padStart(length, '0');
}

export function formatTransferFilename(date: Date = new Date()): string {
  return `toonhqplus-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}.json`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 1 : 2)} ${units[unitIndex]}`;
}
