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
  window.dispatchEvent(new CustomEvent('toonhqplus-db-changed', { detail: { store, key } }));
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

export async function putToon(toon: ToonRecord): Promise<void> {
  const id = normalizeToonId(toon.id);
  if (!id) return;
  const db = await openDB();
  const t = tx(db, 'toons', 'readwrite');
  t.objectStore('toons').put({ ...toon, id });
  await promisifyTx(t);
  notifyChanged('toons', id);
}

export async function putToons(toons: ToonRecord[]): Promise<void> {
  const valid = toons
    .map((t) => {
      const id = normalizeToonId(t.id);
      return id ? ({ ...t, id } as ToonRecord) : null;
    })
    .filter((t): t is ToonRecord => t !== null);
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
  const recs = await promisifyRequest<any[]>(tx(db, 'toons').objectStore('toons').getAll());
  return recs.map(normalizeToonRecord);
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
  const id = normalizeToonId(toonId);
  if (!id) return;
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
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

  // Clean up notes if toon is completely unlisted
  const toonyIds = await getAllFromList('toony_toons');
  const stinkyIds = await getAllFromList('stinky_toons');
  if (!toonyIds.includes(id) && !stinkyIds.includes(id)) {
    // Calling setNote with empty text will delete the note and dispatch 'notes' change event
    await setNote(id, '');
  }
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
  const id = normalizeToonId(toonId);
  if (!id) return;
  const db = await openDB();
  const t = tx(db, 'notes', 'readwrite');
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

export async function cleanupToonCache(): Promise<void> {
  const db = await openDB();
  const stores = ['toons', 'toony_toons', 'stinky_toons', 'notes', 'group_members'];
  const t = tx(db, stores, 'readwrite');

  const [toony, stinky, notes, members] = await Promise.all([
    promisifyRequest<any[]>(t.objectStore('toony_toons').getAll()),
    promisifyRequest<any[]>(t.objectStore('stinky_toons').getAll()),
    promisifyRequest<any[]>(t.objectStore('notes').getAll()),
    promisifyRequest<any[]>(t.objectStore('group_members').getAll()),
  ]);

  const keepIds = new Set<string>();
  toony.forEach(r => keepIds.add(String(r.toonId)));
  stinky.forEach(r => keepIds.add(String(r.toonId)));
  notes.forEach(r => keepIds.add(String(r.toonId)));
  members.forEach(r => keepIds.add(String(r.toonId)));

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const toonStore = t.objectStore('toons');
  const allToons = await promisifyRequest<ToonRecord[]>(toonStore.getAll());

  let deletedCount = 0;
  for (const toon of allToons) {
    if (keepIds.has(String(toon.id))) continue;

    const lastSeen = toon.lastSeen ? new Date(toon.lastSeen) : new Date(0);
    if (lastSeen < fiveDaysAgo) {
      toonStore.delete(toon.id);
      deletedCount++;
    }
  }

  await promisifyTx(t);
  if (deletedCount > 0) {
    console.log(`[ToonHQ+] Cleaned up ${deletedCount} old unused toon records.`);
    notifyChanged('toons');
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

