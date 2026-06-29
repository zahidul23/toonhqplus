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

function extractSettingValue<T = any>(records: any[], key: string): T | undefined {
  const record = records.find((entry) => String(entry?.key) === key);
  return record?.value as T | undefined;
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

export function pruneIndexedDbSnapshotForExport(snapshot: Record<string, IndexedDbDatabaseSnapshot>): Record<string, IndexedDbDatabaseSnapshot> {
  const pruned: Record<string, IndexedDbDatabaseSnapshot> = {};

  for (const [databaseName, database] of Object.entries(snapshot)) {
    const toonsStore = database.stores.toons;
    if (!toonsStore) {
      pruned[databaseName] = database;
      continue;
    }

    const referencedToonIds = collectReferencedToonIds(database);
    pruned[databaseName] = {
      ...database,
      stores: {
        ...database.stores,
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

export function snapshotLocalStorage(storage: Storage): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key != null) snapshot[key] = storage.getItem(key) ?? '';
  }
  return snapshot;
}

export function restoreLocalStorage(storage: Storage, snapshot: Record<string, string>): void {
  storage.clear();
  for (const [key, value] of Object.entries(snapshot)) {
    storage.setItem(key, value);
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
