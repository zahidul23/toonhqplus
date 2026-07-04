/**
 * db.ts -- ToonHQ+ IndexedDB wrapper
 *
 * Database: "toonhqplus"  Version: 2
 *
 * Object stores:
 *   toons         -- keyed by toon id (string); hashId secondary index
 *   toony_toons   -- keyed by toonId (string); presence = toony
 *   stinky_toons  -- keyed by toonId (string); presence = stinky
 *   notes         -- keyed by toonId; stores { toonId, text }
 *   groups        -- keyed by groupId; stores metadata
 *   group_members -- compound key [groupId, toonId]; indexed by both
 *   settings      -- keyed by string key; stores any serialisable value
 */

const DB_NAME = 'toonhqplus';
const DB_VERSION = 3;

// --- Types -------------------------------------------------------------------

export interface ToonRecord {
  /** Toon id from API (stringified number) or generated hash (e.g. "#abc12") when API provides no id. */
  id: string;
  name: string;
  species?: number;
  color?: string;
  laff?: number;
  level?: number;
  photo?: string;
  photo_bg?: string;
  ring?: string | null;
  toonup?: number;
  trap?: number;
  lure?: number;
  sound?: number;
  throw?: number;
  squirt?: number;
  drop?: number;
  prestiges?: string[];
  organic_level?: number | null;
  sellbot?: string | number;
  cashbot?: string | number;
  lawbot?: string | number;
  bossbot?: string | number;
  lastSeen?: string;
  hashId?: string;
  [key: string]: any;
}

/** Toon id: always a string (either stringified numeric id or a hash like "#abc12"). */
export type ToonId = string;

export interface NoteRecord {
  toonId: ToonId;
  text: string;
}

export interface GroupRecord {
  groupId: number;
  type: number;
  created: string;
  userJoinedAt: string;
  options?: Record<string, number>;
}

export interface GroupMemberRecord {
  groupId: number;
  toonId: ToonId;
  joined?: string;
  left?: string;
}

export type ListStore = 'toony_toons' | 'stinky_toons';

// --- DB open / upgrade --------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;
let openDbHandle: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // toons
      if (!db.objectStoreNames.contains('toons')) {
        const toonStore = db.createObjectStore('toons', { keyPath: 'id' });
        toonStore.createIndex('hashId', 'hashId', { unique: false });
      }

      // toony_toons / stinky_toons -- key-only stores
      if (!db.objectStoreNames.contains('toony_toons')) {
        db.createObjectStore('toony_toons', { keyPath: 'toonId' });
      }
      if (!db.objectStoreNames.contains('stinky_toons')) {
        db.createObjectStore('stinky_toons', { keyPath: 'toonId' });
      }

      // notes
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'toonId' });
      }

      // groups
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'groupId' });
      }

      // group_members -- compound key, indexed by each component
      if (!db.objectStoreNames.contains('group_members')) {
        const gmStore = db.createObjectStore('group_members', { keyPath: ['groupId', 'toonId'] });
        gmStore.createIndex('by_groupId', 'groupId', { unique: false });
        gmStore.createIndex('by_toonId', 'toonId', { unique: false });
      }

      // settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      openDbHandle = db;
      db.onversionchange = () => {
        db.close();
        if (openDbHandle === db) openDbHandle = null;
        dbPromise = null;
      };
      // Recover from empty DB (e.g. navfouc opened first with a high version and no onupgradeneeded)
      if (db.objectStoreNames.length === 0) {
        db.close();
        if (openDbHandle === db) openDbHandle = null;
        dbPromise = null;
        const delReq = indexedDB.deleteDatabase(DB_NAME);
        delReq.onsuccess = () => openDB().then(resolve).catch(reject);
        delReq.onerror = () => reject(delReq.error);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function closeDB(): void {
  if (openDbHandle) {
    openDbHandle.close();
    openDbHandle = null;
  }
  dbPromise = null;
}

// --- Internal helpers ---------------------------------------------------------

const EXPECTED_STORES = ['toons', 'toony_toons', 'stinky_toons', 'notes', 'groups', 'group_members', 'settings'] as const;

function tx(db: IDBDatabase, stores: string | string[], mode: IDBTransactionMode = 'readonly'): IDBTransaction {
  const list = Array.isArray(stores) ? stores : [stores];
  const missing = list.filter(s => !db.objectStoreNames.contains(s));
  if (missing.length > 0) {
    const existing = Array.from(db.objectStoreNames);
    throw new Error(
      `[ToonHQ+] IndexedDB: object store(s) not found: ${missing.join(', ')}. ` +
      `Requested: ${list.join(', ')}. Existing in DB: ${existing.length ? existing.join(', ') : '(none)'}. ` +
      `DB version may need upgrade (current: ${db.version}).`
    );
  }
  return db.transaction(stores, mode);
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function promisifyTx(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Dispatch a lightweight change event so listeners can refresh. */
function notifyChanged(store: string, key?: IDBValidKey) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('toonhqplus-db-changed', { detail: { store, key } }));
  }
}

/** IndexedDB valid key for toon ids: non-empty string. */
function isValidIdKey(id: unknown): id is ToonId {
  return typeof id === 'string' && id.length > 0;
}

function normalizeToonId(id: unknown): ToonId | null {
  if (typeof id === 'string') {
    const s = id.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return null;
}

function legacyNumericKeyCandidate(id: ToonId): number | null {
  // Older DBs stored toon ids as numbers. If we have a numeric-looking string id,
  // try the legacy numeric key as a fallback for reads/deletes.
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

function normalizeToonRecord(rec: any): ToonRecord {
  return { ...rec, id: String(rec?.id) } as ToonRecord;
}

// --- Toon ID Resolution ------------------------------------------------------
async function resolveHashIdInStore(id: string, store: IDBObjectStore): Promise<string> {
  if (!id.startsWith('#')) return id;
  const index = store.index('hashId');
  const candidates = await promisifyRequest<any[]>(index.getAll(IDBKeyRange.only(id)));
  const real = candidates.find(c => !String(c.id).startsWith('#'));
  return real ? String(real.id) : id;
}

export async function resolveToonId(id: ToonId): Promise<ToonId> {
  const tid = normalizeToonId(id);
  if (!tid || !tid.startsWith('#')) return tid || id;
  const db = await openDB();
  const store = tx(db, 'toons').objectStore('toons');
  return resolveHashIdInStore(tid, store);
}

// --- Toons --------------------------------------------------------------------


export async function getToon(id: ToonId): Promise<ToonRecord | undefined> {
  const toonId = normalizeToonId(id);
  if (!toonId) return undefined;

  const db = await openDB();
  const store = tx(db, 'toons').objectStore('toons');

  const direct = await promisifyRequest<any>(store.get(toonId));
  if (direct) return normalizeToonRecord(direct);

  const legacy = legacyNumericKeyCandidate(toonId);
  if (legacy == null) return undefined;

  const legacyRec = await promisifyRequest<any>(store.get(legacy));
  if (!legacyRec) return undefined;

  const normalized = normalizeToonRecord(legacyRec);
  // Best-effort self-heal: write a string-keyed copy and delete the legacy numeric key.
  try {
    const t = tx(db, 'toons', 'readwrite');
    t.objectStore('toons').put(normalized);
    t.objectStore('toons').delete(legacy);
    await promisifyTx(t);
    notifyChanged('toons', toonId);
  } catch {
    // Ignore migration failures; still return the record.
  }

  return normalized;
}

export async function getToonByHashId(hashId: string): Promise<ToonRecord | undefined> {
  const db = await openDB();
  const rec = await promisifyRequest<any>(
    tx(db, 'toons').objectStore('toons').index('hashId').get(hashId)
  );
  return rec ? normalizeToonRecord(rec) : undefined;
}

export async function getToonsByHashIds(hashIds: string[]): Promise<ToonRecord[]> {
  const db = await openDB();
  const index = tx(db, 'toons').objectStore('toons').index('hashId');
  const results = await Promise.all(
    hashIds.map(h => promisifyRequest<any>(index.get(h)))
  );
  return results.filter(Boolean).map(normalizeToonRecord);
}

export async function searchToons(query: string, page: number, pageSize: number): Promise<{ results: ToonRecord[], total: number }> {
  const db = await openDB();
  const store = tx(db, 'toons').objectStore('toons');
  const lowerQuery = query.toLowerCase();
  
  // We have to scan because there's no name index, but we can at least avoid loading all into memory
  const allMatches: ToonRecord[] = [];
  
  return new Promise((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const toon = normalizeToonRecord(cursor.value);
        if (toon.name.toLowerCase().includes(lowerQuery)) {
          allMatches.push(toon);
        }
        cursor.continue();
      } else {
        // Sort by name
        allMatches.sort((a, b) => a.name.localeCompare(b.name));
        const total = allMatches.length;
        const start = (page - 1) * pageSize;
        const results = allMatches.slice(start, start + pageSize);
        resolve({ results, total });
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// --- Write Buffering ---------------------------------------------------------
const toonWriteBuffer = new Map<string, ToonRecord>();
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

export async function flushToonWriteBuffer() {
  if (toonWriteBuffer.size === 0) return;
  const toonsToSave = Array.from(toonWriteBuffer.values());
  toonWriteBuffer.clear();
  flushTimeout = null;

  try {
    const db = await openDB();
    const t = tx(db, 'toons', 'readwrite');
    const store = t.objectStore('toons');
    toonsToSave.forEach(toon => {
      store.put(toon);
    });
    await promisifyTx(t);
    notifyChanged('toons');
  } catch (e) {
    console.error('[ToonHQ+] Batch write failed:', e);
  }
}

export async function putToon(toon: ToonRecord): Promise<void> {
  let id = normalizeToonId(toon.id);
  if (!id) return;

  if (id.startsWith('#')) {
    const db = await openDB();
    const store = tx(db, 'toons').objectStore('toons');
    id = await resolveHashIdInStore(id, store);
  }
  
  toonWriteBuffer.set(id, { ...toon, id });
  
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushToonWriteBuffer, 1000);
  }
}

export async function putToons(toons: ToonRecord[]): Promise<void> {
  let hasValid = false;
  const db = await openDB();
  const store = tx(db, 'toons').objectStore('toons');

  for (const t of toons) {
    let id = normalizeToonId(t.id);
    if (id) {
      if (id.startsWith('#')) {
        id = await resolveHashIdInStore(id, store);
      }
      toonWriteBuffer.set(id, { ...t, id });
      hasValid = true;
    }
  }

  if (hasValid && !flushTimeout) {
    flushTimeout = setTimeout(flushToonWriteBuffer, 1000);
  }
}

export async function getAllToons(): Promise<ToonRecord[]> {
  const db = await openDB();
  const recs = await promisifyRequest<any[]>(tx(db, 'toons').objectStore('toons').getAll());
  return recs.map(normalizeToonRecord);
}

export async function getToons(ids: ToonId[]): Promise<ToonRecord[]> {
  const validIds = [...new Set(ids.map(normalizeToonId).filter((id): id is ToonId => id !== null))];
  if (!validIds.length) return [];

  const db = await openDB();
  const store = tx(db, 'toons').objectStore('toons');
  
  // Use Promise.all with store.get for each ID in the same transaction
  const results = await Promise.all(
    validIds.map((id) => promisifyRequest<any>(store.get(id)))
  );
  
  return results.filter(Boolean).map(normalizeToonRecord);
}

// --- Toony / Stinky lists ------------------------------------------------------

export async function getAllFromList(store: ListStore): Promise<ToonId[]> {
  const db = await openDB();
  const records: { toonId: any }[] = await promisifyRequest(
    tx(db, store).objectStore(store).getAll()
  );
  return records
    .map(r => normalizeToonId(r.toonId))
    .filter((id): id is ToonId => id !== null);
}

export async function addToList(store: ListStore, toonId: ToonId): Promise<void> {
  let id = normalizeToonId(toonId);
  if (!id) return;
  const db = await openDB();
  
  // Resolve hash ID if possible
  if (id.startsWith('#')) {
    const toonStore = tx(db, 'toons').objectStore('toons');
    id = await resolveHashIdInStore(id, toonStore);
  }

  const t = tx(db, [store, 'toons'], 'readwrite');
  const os = t.objectStore(store);
  os.put({ toonId: id });
  const legacy = legacyNumericKeyCandidate(id);
  if (legacy != null) os.delete(legacy);
  await promisifyTx(t);
  notifyChanged(store, id);
}

export async function removeFromList(store: ListStore, toonId: ToonId): Promise<void> {
  const id = normalizeToonId(toonId);
  if (!id) return;
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  const os = t.objectStore(store);
  os.delete(id);
  const legacy = legacyNumericKeyCandidate(id);
  if (legacy != null) os.delete(legacy);
  await promisifyTx(t);
  notifyChanged(store, id);
}

export async function clearList(store: ListStore): Promise<void> {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  t.objectStore(store).clear();
  await promisifyTx(t);
  notifyChanged(store);
}

// --- Notes --------------------------------------------------------------------

export async function getNote(toonId: ToonId): Promise<string | undefined> {
  const id = normalizeToonId(toonId);
  if (!id) return undefined;
  const db = await openDB();
  const store = tx(db, 'notes').objectStore('notes');

  const direct: NoteRecord | undefined = await promisifyRequest(store.get(id));
  if (direct) return direct.text;

  const legacy = legacyNumericKeyCandidate(id);
  if (legacy == null) return undefined;
  const legacyRec: NoteRecord | undefined = await promisifyRequest(store.get(legacy));
  return legacyRec?.text;
}

export async function setNote(toonId: ToonId, text: string): Promise<void> {
  let id = normalizeToonId(toonId);
  if (!id) return;
  const db = await openDB();

  // Resolve hash ID if possible
  if (id.startsWith('#')) {
    const toonStore = tx(db, 'toons').objectStore('toons');
    id = await resolveHashIdInStore(id, toonStore);
  }

  const t = tx(db, ['notes', 'toons'], 'readwrite');
  const store = t.objectStore('notes');
  const legacy = legacyNumericKeyCandidate(id);

  if (text.trim()) {
    store.put({ toonId: id, text: text.trim() });
    if (legacy != null) store.delete(legacy);
  } else {
    store.delete(id);
    if (legacy != null) store.delete(legacy);
  }

  await promisifyTx(t);
  notifyChanged('notes', id);
}

export async function getAllNotes(): Promise<Record<string, string>> {
  const db = await openDB();
  const records: NoteRecord[] = await promisifyRequest(
    tx(db, 'notes').objectStore('notes').getAll()
  );
  const out: Record<string, string> = {};
  for (const r of records) out[String(r.toonId)] = r.text;
  return out;
}

export async function clearNotes(): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'notes', 'readwrite');
  t.objectStore('notes').clear();
  await promisifyTx(t);
  notifyChanged('notes');
}

export interface SavedToonDataSnapshot {
  toons: ToonRecord[];
  toonyToonIds: ToonId[];
  stinkyToonIds: ToonId[];
  notes: Record<string, string>;
}

export async function exportSavedToonData(): Promise<SavedToonDataSnapshot> {
  await flushToonWriteBuffer();
  const [toonyToonIds, stinkyToonIds, notes] = await Promise.all([
    getAllFromList('toony_toons'),
    getAllFromList('stinky_toons'),
    getAllNotes(),
  ]);
  const referencedIds = [...new Set([...toonyToonIds, ...stinkyToonIds, ...Object.keys(notes)])];
  const toons = await getToons(referencedIds);
  return { toons, toonyToonIds, stinkyToonIds, notes };
}

export async function replaceSavedToonData(snapshot: SavedToonDataSnapshot): Promise<void> {
  const db = await openDB();
  const t = tx(db, ['toons', 'toony_toons', 'stinky_toons', 'notes'], 'readwrite');
  const toonStore = t.objectStore('toons');
  const toonyStore = t.objectStore('toony_toons');
  const stinkyStore = t.objectStore('stinky_toons');
  const notesStore = t.objectStore('notes');

  toonyStore.clear();
  stinkyStore.clear();
  notesStore.clear();

  for (const toon of snapshot.toons) {
    const id = normalizeToonId(toon.id);
    if (id) toonStore.put({ ...toon, id });
  }
  for (const toonId of snapshot.toonyToonIds) {
    const id = normalizeToonId(toonId);
    if (id) toonyStore.put({ toonId: id });
  }
  for (const toonId of snapshot.stinkyToonIds) {
    const id = normalizeToonId(toonId);
    if (id) stinkyStore.put({ toonId: id });
  }
  for (const [toonId, text] of Object.entries(snapshot.notes)) {
    const id = normalizeToonId(toonId);
    if (id && text.trim()) notesStore.put({ toonId: id, text: text.trim() });
  }

  await promisifyTx(t);
  notifyChanged('toons');
  notifyChanged('toony_toons');
  notifyChanged('stinky_toons');
  notifyChanged('notes');
}

// --- Groups -------------------------------------------------------------------

export async function getGroup(groupId: number): Promise<GroupRecord | undefined> {
  const db = await openDB();
  return promisifyRequest(tx(db, 'groups').objectStore('groups').get(groupId));
}

export async function putGroup(group: GroupRecord): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'groups', 'readwrite');
  t.objectStore('groups').put(group);
  await promisifyTx(t);
  notifyChanged('groups', group.groupId);
}

export async function deleteGroup(groupId: number): Promise<void> {
  const db = await openDB();
  // Also clean up all group_members for this group
  const t = tx(db, ['groups', 'group_members'], 'readwrite');
  t.objectStore('groups').delete(groupId);
  const idx = t.objectStore('group_members').index('by_groupId');
  const req = idx.getAllKeys(IDBKeyRange.only(groupId));
  req.onsuccess = () => {
    const keys = req.result as [number, ToonId][];
    for (const k of keys) t.objectStore('group_members').delete(k);
  };
  await promisifyTx(t);
  notifyChanged('groups', groupId);
}

export async function getAllGroups(): Promise<GroupRecord[]> {
  const db = await openDB();
  return promisifyRequest(tx(db, 'groups').objectStore('groups').getAll());
}

export async function clearAllGroups(): Promise<void> {
  const db = await openDB();
  const t = tx(db, ['groups', 'group_members'], 'readwrite');
  t.objectStore('groups').clear();
  t.objectStore('group_members').clear();
  await promisifyTx(t);
  notifyChanged('groups');
}

// --- Group Members ------------------------------------------------------------

export async function getAllGroupMembers(): Promise<GroupMemberRecord[]> {
  const db = await openDB();
  const recs = await promisifyRequest<any[]>(tx(db, 'group_members').objectStore('group_members').getAll());
  return recs.map((r) => ({ ...r, toonId: String(r.toonId) })) as GroupMemberRecord[];
}

export async function getGroupMembers(groupId: number): Promise<GroupMemberRecord[]> {
  const db = await openDB();
  const recs = await promisifyRequest<any[]>(
    tx(db, 'group_members').objectStore('group_members').index('by_groupId').getAll(IDBKeyRange.only(groupId))
  );
  return recs.map((r) => ({ ...r, toonId: String(r.toonId) })) as GroupMemberRecord[];
}

export async function putGroupMember(record: GroupMemberRecord): Promise<void> {
  const id = normalizeToonId(record.toonId);
  if (!id) return;
  const db = await openDB();
  const t = tx(db, 'group_members', 'readwrite');
  t.objectStore('group_members').put({ ...record, toonId: id });
  await promisifyTx(t);
}

export async function putGroupMembers(records: GroupMemberRecord[]): Promise<void> {
  const valid = records
    .map((r) => {
      const id = normalizeToonId(r.toonId);
      return id ? ({ ...r, toonId: id } as GroupMemberRecord) : null;
    })
    .filter((r): r is GroupMemberRecord => r !== null);
  if (!valid.length) return;
  const db = await openDB();
  const t = tx(db, 'group_members', 'readwrite');
  const store = t.objectStore('group_members');
  for (const r of valid) store.put(r);
  await promisifyTx(t);
}

export async function markMemberLeft(groupId: number, toonId: ToonId): Promise<void> {
  const id = normalizeToonId(toonId);
  if (!id) return;
  const db = await openDB();
  const t = tx(db, 'group_members', 'readwrite');
  const store = t.objectStore('group_members');

  const directKey: any = [groupId, id];
  let existing: GroupMemberRecord | undefined = await promisifyRequest(store.get(directKey));
  let legacyKey: any = null;

  if (!existing) {
    const legacy = legacyNumericKeyCandidate(id);
    if (legacy != null) {
      legacyKey = [groupId, legacy] as any;
      existing = await promisifyRequest(store.get(legacyKey));
    }
  }

  if (existing && !existing.left) {
    store.put({ ...existing, toonId: id, left: new Date().toISOString() });
    if (legacyKey) store.delete(legacyKey);
  }

  await promisifyTx(t);
}

// --- Settings -----------------------------------------------------------------

export async function getSetting<T = any>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const rec: { key: string; value: T } | undefined = await promisifyRequest(
    tx(db, 'settings').objectStore('settings').get(key)
  );
  return rec?.value;
}

export async function setSetting(key: string, value: any): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'settings', 'readwrite');
  t.objectStore('settings').put({ key, value });
  await promisifyTx(t);
  notifyChanged('settings', key);
}

export async function getSettings(keys: string[]): Promise<Record<string, any>> {
  const db = await openDB();
  const t = tx(db, 'settings');
  const store = t.objectStore('settings');
  const results = await Promise.all(
    keys.map(k => promisifyRequest<{ key: string; value: any } | undefined>(store.get(k)))
  );
  const out: Record<string, any> = {};
  results.forEach((rec, i) => {
    if (rec !== undefined) out[keys[i]] = rec.value;
  });
  return out;
}

export async function cleanupHistory(limit: number = 20, maxMembers: number = 20): Promise<void> {
  const db = await openDB();
  const readTx = tx(db, ['groups', 'group_members']);
  const groupsRequest = promisifyRequest<GroupRecord[]>(readTx.objectStore('groups').getAll());
  const membersRequest = promisifyRequest<GroupMemberRecord[]>(readTx.objectStore('group_members').getAll());
  const [allGroups, allMembers] = await Promise.all([groupsRequest, membersRequest]);

  const memberCounts = new Map<number, number>();
  for (const member of allMembers) {
    memberCounts.set(member.groupId, (memberCounts.get(member.groupId) || 0) + 1);
  }

  allGroups.sort((a, b) => {
    const timeA = new Date(a.userJoinedAt || a.created).getTime();
    const timeB = new Date(b.userJoinedAt || b.created).getTime();
    return timeB - timeA;
  });

  const keepGroupIds = new Set(
    allGroups
      .filter((group) => (memberCounts.get(group.groupId) || 0) <= maxMembers)
      .slice(0, limit)
      .map((group) => group.groupId)
  );
  const deleteGroupIds = allGroups
    .map((group) => group.groupId)
    .filter((groupId) => !keepGroupIds.has(groupId));

  if (deleteGroupIds.length === 0) return;

  const t = tx(db, ['groups', 'group_members'], 'readwrite');
  const groupStore = t.objectStore('groups');
  const memberStore = t.objectStore('group_members');

  for (const gid of deleteGroupIds) {
    groupStore.delete(gid);
    // We don't necessarily need to wait for each delete within the loop as the transaction
    // will handle the atomic completion. Using a cursor to delete by index.
    const index = memberStore.index('by_groupId');
    const request = index.openKeyCursor(IDBKeyRange.only(gid));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        memberStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  }

  await promisifyTx(t);
  console.log(`[ToonHQ+] Cleaned up ${deleteGroupIds.length} groups from history.`);
  notifyChanged('groups');
}

export async function cleanupToonCache(): Promise<void> {
  // 1. Prune old/oversized groups to match the history UI/export window.
  try {
    await cleanupHistory(20, 20);
  } catch (e) {
    console.error('[ToonHQ+] History cleanup failed:', e);
  }

  const db = await openDB();
  const stores = ['toons', 'toony_toons', 'stinky_toons', 'notes', 'group_members'];
  const t = tx(db, stores, 'readwrite');

  const toonStore = t.objectStore('toons');
  const toonyStore = t.objectStore('toony_toons');
  const stinkyStore = t.objectStore('stinky_toons');
  const notesStore = t.objectStore('notes');
  const membersStore = t.objectStore('group_members');

  const [toons, toonyRecl, stinkyRecl, notesRecl, membersRecl] = await Promise.all([
    promisifyRequest<ToonRecord[]>(toonStore.getAll()),
    promisifyRequest<any[]>(toonyStore.getAll()),
    promisifyRequest<any[]>(stinkyStore.getAll()),
    promisifyRequest<any[]>(notesStore.getAll()),
    promisifyRequest<any[]>(membersStore.getAll()),
  ]);

  // 2. Identification of duplicates (hash ID vs numeric ID)
  const realIdsByHash = new Map<string, string>(); // hashId -> numeric ID string
  toons.forEach(tn => {
    const sid = String(tn.id);
    if (!sid.startsWith('#') && tn.hashId) {
      realIdsByHash.set(tn.hashId, sid);
    }
  });

  const hashToReal = new Map<string, string>(); // hash-ID string -> real ID string
  toons.forEach(tn => {
    const sid = String(tn.id);
    if (sid.startsWith('#') && tn.hashId && realIdsByHash.has(tn.hashId)) {
      hashToReal.set(sid, realIdsByHash.get(tn.hashId)!);
    }
  });

  // 3. Consolidate Lists and Notes (from hash ID to real ID)
  for (const [hashId, realId] of hashToReal.entries()) {
    // Notes
    const hashNote = notesRecl.find(n => String(n.toonId) === hashId);
    if (hashNote) {
      const realNoteExist = notesRecl.some(n => String(n.toonId) === realId);
      if (!realNoteExist) {
        notesStore.put({ toonId: realId, text: hashNote.text });
      }
      notesStore.delete(hashId);
    }

    // Toony
    if (toonyRecl.some(r => String(r.toonId) === hashId)) {
      if (!toonyRecl.some(r => String(r.toonId) === realId)) {
        toonyStore.put({ toonId: realId });
      }
      toonyStore.delete(hashId);
    }

    // Stinky
    if (stinkyRecl.some(r => String(r.toonId) === hashId)) {
      if (!stinkyRecl.some(r => String(r.toonId) === realId)) {
        stinkyStore.put({ toonId: realId });
      }
      stinkyStore.delete(hashId);
    }

    // Update group memberships
    const hashMembers = membersRecl.filter(m => String(m.toonId) === hashId);
    for (const m of hashMembers) {
      const realExists = membersRecl.some(mr => mr.groupId === m.groupId && String(mr.toonId) === realId);
      if (!realExists) {
        membersStore.put({ ...m, toonId: realId });
      }
      // Note: primary key for group_members is [groupId, toonId]
      membersStore.delete([m.groupId, hashId]);
    }

    // Finally, remove the duplicate hash toon record
    toonStore.delete(hashId);
  }

  // 4. Standard cleanup of remaining unused/old toons
  const keepIds = new Set<string>();
  
  // Re-collect keepIds to account for the merges we just performed
  const [updatedToony, updatedStinky, updatedNotes, updatedMembers] = await Promise.all([
    promisifyRequest<any[]>(toonyStore.getAll()),
    promisifyRequest<any[]>(stinkyStore.getAll()),
    promisifyRequest<any[]>(notesStore.getAll()),
    promisifyRequest<any[]>(membersStore.getAll()),
  ]);

  updatedToony.forEach(r => keepIds.add(String(r.toonId)));
  updatedStinky.forEach(r => keepIds.add(String(r.toonId)));
  updatedNotes.forEach(r => keepIds.add(String(r.toonId)));
  updatedMembers.forEach(r => keepIds.add(String(r.toonId)));

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  let deletedCount = 0;
  const remainingToons = await promisifyRequest<ToonRecord[]>(toonStore.getAll());
  for (const toon of remainingToons) {
    if (keepIds.has(String(toon.id))) continue;

    const lastSeen = toon.lastSeen ? new Date(toon.lastSeen) : new Date(0);
    if (lastSeen < fiveDaysAgo) {
      toonStore.delete(toon.id);
      deletedCount++;
    }
  }

  await promisifyTx(t);
  if (hashToReal.size > 0 || deletedCount > 0) {
    console.log(`[ToonHQ+] Cleaned up ${deletedCount} old toons; de-duplicated ${hashToReal.size} toons.`);
    notifyChanged('toons');
    if (hashToReal.size > 0) {
      notifyChanged('toony_toons');
      notifyChanged('stinky_toons');
      notifyChanged('notes');
      notifyChanged('groups');
    }
  }
}

// --- One-time migration from browser.storage.local ---------------------------

export async function migrateFromLocalStorage(): Promise<void> {
  // Check if already migrated
  const alreadyMigrated = await getSetting('migrated-v1');
  if (alreadyMigrated) return;

  try {
    const oldKeys = [
      'toonhq-favorites',
      'toonhq-blocked',
      'toonhqplus-toons',
      'toonhqplus-history',
      'toonhqplus-notes',
      'toonhqplus-sidebar-open',
      'toonhqplus-active-tab',
      'toonhqplus-navbar-config',
      'toonhqplus-boss-info-enabled',
      'toonhqplus-active-toon-ids',
    ];

    const result = await browser.storage.local.get(oldKeys);

    const toonsCache: Record<number, any> = (result['toonhqplus-toons'] as Record<number, any>) || {};
    const favorites: ToonId[] = Array.isArray(result['toonhq-favorites']) ? result['toonhq-favorites'].map(normalizeToonId).filter((v): v is ToonId => v !== null) : [];
    const blocked: ToonId[] = Array.isArray(result['toonhq-blocked']) ? result['toonhq-blocked'].map(normalizeToonId).filter((v): v is ToonId => v !== null) : [];
    const oldNotes: Record<number, string> = (result['toonhqplus-notes'] as Record<number, string>) || {};
    const oldHistory: Record<number, any> = (result['toonhqplus-history'] as Record<number, any>) || {};

    // Migrate toons (skip entries without valid id to avoid IDB invalid-key errors)
    const toonRecords: ToonRecord[] = Object.values(toonsCache)
      .map((t: any) => ({
        id: normalizeToonId(t.id) ?? '',
        name: t.name || '',
        species: t.species,
        color: t.color,
        laff: t.laff,
        level: t.level,
        photo: t.photo,
        photo_bg: t.photo_bg,
        ring: t.ring,
        toonup: t.toonup,
        trap: t.trap,
        lure: t.lure,
        sound: t.sound,
        throw: t.throw,
        squirt: t.squirt,
        drop: t.drop,
        prestiges: t.prestiges,
        organic_level: t.organic_level,
        sellbot: t.sellbot,
        cashbot: t.cashbot,
        lawbot: t.lawbot,
        bossbot: t.bossbot,
        lastSeen: t.lastSeen,
        hashId: t.hashId,
      }))
      .filter(t => isValidIdKey(t.id));
    if (toonRecords.length) await putToons(toonRecords);

    // Migrate lists
    for (const id of favorites) await addToList('toony_toons', id);
    for (const id of blocked) await addToList('stinky_toons', id);

    // Migrate notes
    for (const [toonId, text] of Object.entries(oldNotes)) {
      if (text?.trim()) await setNote(toonId, text);
    }

    // Migrate history -> groups + group_members
    for (const [, group] of Object.entries(oldHistory)) {
      const g = group as any;
      await putGroup({
        groupId: Number(g.id),
        type: g.type,
        created: g.created,
        userJoinedAt: g.userJoinedAt || g.created,
      });

      const memberMetadata: Record<number, any> = g.memberMetadata || {};
      const members: GroupMemberRecord[] = Object.entries(memberMetadata).map(([toonId, meta]: [string, any]) => ({
        groupId: Number(g.id),
        toonId: toonId,
        joined: meta.joined,
        left: meta.left,
      }));
      if (members.length) await putGroupMembers(members);
    }

    // Migrate simple settings
    const settingMap: Record<string, string> = {
      'toonhqplus-sidebar-open': 'sidebar-open',
      'toonhqplus-active-tab': 'active-tab',
      'toonhqplus-navbar-config': 'navbar-config',
      'toonhqplus-boss-info-enabled': 'boss-info-enabled',
      'toonhqplus-active-toon-ids': 'active-toon-ids',
    };
    for (const [oldKey, newKey] of Object.entries(settingMap)) {
      if (result[oldKey] !== undefined) {
        await setSetting(newKey, result[oldKey]);
      }
    }

    await setSetting('migrated-v1', true);
    console.log('[ToonHQ+] Migration from local storage complete.');
  } catch (e) {
    console.error('[ToonHQ+] Migration from local storage failed:', e);
  }
}

