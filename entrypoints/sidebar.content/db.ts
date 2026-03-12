/**
 * db.ts — ToonHQ+ IndexedDB wrapper
 *
 * Database: "toonhqplus"  Version: 2
 *
 * Object stores:
 *   toons         — keyed by numeric toon id; hashId secondary index
 *   toony_toons   — keyed by toonId (number); presence = toony
 *   stinky_toons  — keyed by toonId (number); presence = stinky
 *   notes         — keyed by toonId; stores { toonId, text }
 *   groups        — keyed by groupId; stores metadata
 *   group_members — compound key [groupId, toonId]; indexed by both
 *   settings      — keyed by string key; stores any serialisable value
 */

const DB_NAME = 'toonhqplus';
const DB_VERSION = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToonRecord {
  /** Numeric toon id from API, or generated hash (e.g. "#abc12") when API provides no id. */
  id: number | string;
  name: string;
  photo?: string;
  species?: number;
  laff?: number;
  level?: number;
  lastSeen?: string;
  hashId?: string;
  [key: string]: any;
}

/** Toon id: numeric from API or string hash (e.g. "#abc12") when no id. */
export type ToonId = number | string;

export interface NoteRecord {
  toonId: ToonId;
  text: string;
}

export interface GroupRecord {
  groupId: number;
  type: number;
  created: string;
  userJoinedAt: string;
}

export interface GroupMemberRecord {
  groupId: number;
  toonId: ToonId;
  joined?: string;
  left?: string;
}

export type ListStore = 'toony_toons' | 'stinky_toons';

// ─── DB open / upgrade ────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

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

      // toony_toons / stinky_toons — key-only stores
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

      // group_members — compound key, indexed by each component
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
      // Recover from empty DB (e.g. navfouc opened first with a high version and no onupgradeneeded)
      if (db.objectStoreNames.length === 0) {
        db.close();
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
  window.dispatchEvent(new CustomEvent('toonhqplus-db-changed', { detail: { store, key } }));
}

/** IndexedDB valid key: number (not NaN), non-empty string, etc. */
function isValidIdKey(id: unknown): id is number | string {
  if (typeof id === 'number') return !isNaN(id);
  if (typeof id === 'string') return id.length > 0;
  return false;
}

// ─── Toons ────────────────────────────────────────────────────────────────────

export async function getToon(id: number): Promise<ToonRecord | undefined> {
  const db = await openDB();
  return promisifyRequest(tx(db, 'toons').objectStore('toons').get(id));
}

export async function getToonByHashId(hashId: string): Promise<ToonRecord | undefined> {
  const db = await openDB();
  return promisifyRequest(
    tx(db, 'toons').objectStore('toons').index('hashId').get(hashId)
  );
}

export async function putToon(toon: ToonRecord): Promise<void> {
  if (!isValidIdKey(toon.id)) return;
  const db = await openDB();
  const t = tx(db, 'toons', 'readwrite');
  t.objectStore('toons').put(toon);
  await promisifyTx(t);
  notifyChanged('toons', toon.id);
}

export async function putToons(toons: ToonRecord[]): Promise<void> {
  const valid = toons.filter(t => isValidIdKey(t.id));
  if (!valid.length) return;
  const db = await openDB();
  const t = tx(db, 'toons', 'readwrite');
  const store = t.objectStore('toons');
  for (const toon of valid) store.put(toon);
  await promisifyTx(t);
  notifyChanged('toons');
}

export async function getAllToons(): Promise<ToonRecord[]> {
  const db = await openDB();
  return promisifyRequest(tx(db, 'toons').objectStore('toons').getAll());
}

// ─── Toony / Stinky lists ──────────────────────────────────────────────────────

export async function getAllFromList(store: ListStore): Promise<ToonId[]> {
  const db = await openDB();
  const records: { toonId: ToonId }[] = await promisifyRequest(
    tx(db, store).objectStore(store).getAll()
  );
  return records.map(r => r.toonId);
}

export async function addToList(store: ListStore, toonId: ToonId): Promise<void> {
  if (!isValidIdKey(toonId)) return;
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  t.objectStore(store).put({ toonId });
  await promisifyTx(t);
  notifyChanged(store, toonId);
}

export async function removeFromList(store: ListStore, toonId: ToonId): Promise<void> {
  if (!isValidIdKey(toonId)) return;
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  t.objectStore(store).delete(toonId);
  await promisifyTx(t);
  notifyChanged(store, toonId);
}

export async function clearList(store: ListStore): Promise<void> {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  t.objectStore(store).clear();
  await promisifyTx(t);
  notifyChanged(store);
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function getNote(toonId: ToonId): Promise<string | undefined> {
  if (!isValidIdKey(toonId)) return undefined;
  const db = await openDB();
  const rec: NoteRecord | undefined = await promisifyRequest(
    tx(db, 'notes').objectStore('notes').get(toonId)
  );
  return rec?.text;
}

export async function setNote(toonId: ToonId, text: string): Promise<void> {
  if (!isValidIdKey(toonId)) return;
  const db = await openDB();
  const t = tx(db, 'notes', 'readwrite');
  if (text.trim()) {
    t.objectStore('notes').put({ toonId, text: text.trim() });
  } else {
    t.objectStore('notes').delete(toonId);
  }
  await promisifyTx(t);
  notifyChanged('notes', toonId);
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

// ─── Groups ───────────────────────────────────────────────────────────────────

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

// ─── Group Members ────────────────────────────────────────────────────────────

export async function getAllGroupMembers(): Promise<GroupMemberRecord[]> {
  const db = await openDB();
  return promisifyRequest(tx(db, 'group_members').objectStore('group_members').getAll());
}

export async function getGroupMembers(groupId: number): Promise<GroupMemberRecord[]> {
  const db = await openDB();
  return promisifyRequest(
    tx(db, 'group_members').objectStore('group_members').index('by_groupId').getAll(IDBKeyRange.only(groupId))
  );
}

export async function putGroupMember(record: GroupMemberRecord): Promise<void> {
  if (!isValidIdKey(record.toonId)) return;
  const db = await openDB();
  const t = tx(db, 'group_members', 'readwrite');
  t.objectStore('group_members').put(record);
  await promisifyTx(t);
}

export async function putGroupMembers(records: GroupMemberRecord[]): Promise<void> {
  const valid = records.filter(r => isValidIdKey(r.toonId));
  if (!valid.length) return;
  const db = await openDB();
  const t = tx(db, 'group_members', 'readwrite');
  const store = t.objectStore('group_members');
  for (const r of valid) store.put(r);
  await promisifyTx(t);
}

export async function markMemberLeft(groupId: number, toonId: ToonId): Promise<void> {
  if (!isValidIdKey(toonId)) return;
  const db = await openDB();
  const t = tx(db, 'group_members', 'readwrite');
  const store = t.objectStore('group_members');
  const existing: GroupMemberRecord | undefined = await promisifyRequest(store.get([groupId, toonId]));
  if (existing && !existing.left) {
    store.put({ ...existing, left: new Date().toISOString() });
  }
  await promisifyTx(t);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

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

// ─── One-time migration from browser.storage.local ───────────────────────────

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
    const favorites: number[] = Array.isArray(result['toonhq-favorites']) ? result['toonhq-favorites'].map(Number) : [];
    const blocked: number[] = Array.isArray(result['toonhq-blocked']) ? result['toonhq-blocked'].map(Number) : [];
    const oldNotes: Record<number, string> = (result['toonhqplus-notes'] as Record<number, string>) || {};
    const oldHistory: Record<number, any> = (result['toonhqplus-history'] as Record<number, any>) || {};

    // Migrate toons (skip entries without valid id to avoid IDB invalid-key errors)
    const toonRecords: ToonRecord[] = Object.values(toonsCache)
      .map((t: any) => ({
        id: typeof t.id === 'number' && !isNaN(t.id) ? t.id : Number(t.id),
        name: t.name || '',
        photo: t.photo,
        species: t.species,
        laff: t.laff,
        level: t.level,
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
      if (text?.trim()) await setNote(Number(toonId), text);
    }

    // Migrate history → groups + group_members
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
        toonId: Number(toonId),
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
