import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as transfer from '../entrypoints/lib/storageTransfer.ts';
const { normalizeToonIdentitiesInSnapshot } = transfer;
import * as db from '../entrypoints/sidebar.content/db.ts';
import { buildSavedToonMap, mergeSavedToonSnapshots, savedRecordKey, getSafeToonAliases, SAVED_RECOVERY_KEY, SAVED_RECORD_META_KEY, withSavedToonLock } from '../entrypoints/sidebar.content/savedToonRecords.ts';

const empty = () => ({ toons: [], toonyToonIds: [], stinkyToonIds: [], notes: {} });
const toon = (id, fields = {}) => ({ id: String(id), name: `Toon ${id}`, photo: `https://example.test/render/${id}`, lastSeen: '2026-10-22T10:00:00Z', ...fields });
const txDone = t => new Promise((resolve, reject) => { t.oncomplete = resolve; t.onabort = () => reject(t.error); });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let i = 0; i < 500; i++) { if (await check()) return; await tick(); }
  assert.fail('Expected asynchronous work to finish');
}
function cloudPayload(payload, generation = 'test-generation') {
  return {
    'toonhqplus-sync-notes-meta': { app: 'toonhqplus', schemaVersion: 1, compression: 'gzip-base64', updatedAt: '2026-10-22', chunkCount: 1, generation },
    [`toonhqplus-sync-notes-chunk-${generation}-0`]: gzipSync(JSON.stringify({ app: 'toonhqplus', schemaVersion: 1, updatedAt: '2026-10-22', ...payload })).toString('base64'),
  };
}
async function setup(t) {
  await db.flushToonWriteBuffer(); db.closeDB(); globalThis.indexedDB = new IDBFactory();
  t.after(async () => { await db.flushToonWriteBuffer(); db.closeDB(); });
  let cloud = {}, fail = false, writes = 0;
  const storageListeners = new Set();
  globalThis.browser = { storage: {
    sync: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in cloud).map(key => [key, structuredClone(cloud[key])])),
      set: async update => { if (fail) throw new Error('Simulated cloud quota failure'); writes++; Object.assign(cloud, structuredClone(update)); },
      remove: async keys => keys.forEach(key => delete cloud[key]),
    },
    onChanged: { addListener(fn) { storageListeners.add(fn); }, removeListener(fn) { storageListeners.delete(fn); } },
  } };
  const sync = await import(`../entrypoints/sidebar.content/syncNotes.ts?test=${crypto.randomUUID()}`);
  return { sync, failCloud(value = true) { fail = value; }, get writes() { return writes; }, get cloud() { return cloud; },
    setCloud(value) { cloud = value; }, listeners: storageListeners,
  };
}
async function rawPut(name, value) {
  const t = (await db.openDB()).transaction(name, 'readwrite'), done = txDone(t);
  t.objectStore(name).put(value); await done;
}
// Execute the application's import workflow, including its staging helpers,
// against the same database implementation used by the tests below.
const sidebarSource = readFileSync(new URL('../entrypoints/sidebar.content/SidebarApp.tsx', import.meta.url), 'utf8');
const importWorkflow = ts.transpileModule(sidebarSource.slice(sidebarSource.indexOf('function stableImportSerializeJsonValue'), sidebarSource.indexOf('// GAG_TRACKS')), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
async function runBackupImport(h, site, options) {
  const values = new Map();
  const localStorage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const context = vm.createContext({ ...db, ...transfer, withSavedToonLock,
    isSyncNotesEnabled: h.sync.isSyncNotesEnabled, setSyncNotesEnabled: h.sync.setSyncNotesEnabled,
    syncSavedToonsAfterLocalMutation: h.sync.syncSavedToonsAfterLocalMutation,
    browser: { runtime: { sendMessage: async () => ({}) } }, window: { localStorage },
  });
  vm.runInContext(importWorkflow, context);
  const snapshot = { origins: { site: { localStorage: {}, indexedDB: site }, extension: { localStorage: {}, indexedDB: {}, browserStorageLocal: {} } } };
  await context.importAllData('', { mode: 'merge', conflictPolicy: 'keep-local', ...options, parsedSnapshot: snapshot });
}

test('a user save durably commits membership, details and note before it resolves', async t => {
  await setup(t);
  await db.saveToonToList('toony_toons', toon(101), 'add', 'Remember this Toon');
  db.closeDB();
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101']);
  assert.equal((await db.getToons(['101']))[0].name, 'Toon 101');
  assert.equal(await db.getNote('101'), 'Remember this Toon');
});

test('atomic moves preserve details and notes while removing the other list', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add', 'saved note');
  await db.saveToonToList('stinky_toons', toon(101), 'move');
  assert.deepEqual(await db.getAllFromList('toony_toons'), []);
  assert.deepEqual(await db.getAllFromList('stinky_toons'), ['101']);
  assert.equal(await db.getNote('101'), 'saved note');
  const snapshot = await db.exportSavedToonData();
  assert.equal(snapshot.recordVersions[savedRecordKey('toony', '101')].deleted, true);
  assert.equal(snapshot.recordVersions[savedRecordKey('stinky', '101')].deleted, false);
});

test('invalid metadata cannot commit only list membership', async t => {
  await setup(t);
  await assert.rejects(db.saveToonToList('toony_toons', toon(101, { invalid() {} }), 'add'));
  assert.deepEqual(await db.getAllFromList('toony_toons'), []);
  assert.deepEqual(await db.getAllToons(), []);
});

test('legacy numeric IDs are returned by the batch reader without visiting the Toon again', async t => {
  await setup(t); await rawPut('toons', { ...toon(42), id: 42 }); await rawPut('stinky_toons', { toonId: 42 });
  assert.equal((await db.getToons(await db.getAllFromList('stinky_toons')))[0].name, 'Toon 42');
  assert.equal((await db.exportSavedToonData()).toons[0].id, '42');
});

test('saved IDs with missing details remain identifiable and removable', async t => {
  await setup(t); await db.addToList('stinky_toons', '101');
  const snapshot = await db.exportSavedToonData();
  const rows = buildSavedToonMap(snapshot.toons, snapshot.stinkyToonIds);
  assert.equal(rows['101'].id, '101'); assert.equal(rows['101'].detailsUnavailable, true);
  assert.match(rows['101'].name, /101/);
  await db.removeFromList('stinky_toons', '101'); assert.deepEqual(await db.getAllFromList('stinky_toons'), []);
});

test('cloud failure keeps the local edit and unrelated successful saves', async t => {
  const h = await setup(t); await db.setSetting(h.sync.SYNC_NOTES_SETTING_KEY, true);
  await h.sync.mutateSavedToons(() => db.saveToonToList('toony_toons', toon(101), 'add'));
  h.failCloud();
  await h.sync.mutateSavedToons(() => db.saveToonToList('stinky_toons', toon(202), 'add', 'local note'));
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101']);
  assert.deepEqual(await db.getAllFromList('stinky_toons'), ['202']);
  assert.equal(await db.getNote('202'), 'local note');
  assert.match(await db.getSetting(h.sync.SYNC_PENDING_KEY), /Saved on this device/);
  h.failCloud(false); await h.sync.syncSavedToonsAfterLocalMutation();
  const cloud = await h.sync.readSyncNotesPayload();
  assert.deepEqual(cloud.toonyToonIds, ['101']); assert.deepEqual(cloud.stinkyToonIds, ['202']);
  assert.equal(await db.getSetting(h.sync.SYNC_PENDING_KEY), null);
});

test('stale tab payload cannot remove a newer successful save even with a newer timestamp', async t => {
  const h = await setup(t); await db.setSetting(h.sync.SYNC_NOTES_SETTING_KEY, true);
  await db.saveToonToList('toony_toons', toon(101), 'add');
  const stale = await h.sync.createLocalSyncNotesPayload();
  await h.sync.mutateSavedToons(() => db.saveToonToList('toony_toons', toon(202), 'add'));
  stale.updatedAt = '2099-01-01T00:00:00Z';
  const otherTab = await import(`../entrypoints/sidebar.content/syncNotes.ts?tab=${crypto.randomUUID()}`);
  await otherTab.writeSyncNotesPayload(stale);
  assert.deepEqual((await otherTab.readSyncNotesPayload()).toonyToonIds, ['101', '202']);
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101', '202']);
});

test('incomplete legacy remote snapshots merge without deleting local lists or notes', async t => {
  const h = await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add', 'local');
  await db.saveToonToList('toony_toons', toon(202), 'add');
  await h.sync.importSyncNotesPayload({ ...empty(), app: 'toonhqplus', schemaVersion: 1, updatedAt: '2099-01-01', toonyToonIds: ['101'], toons: [toon(101)] });
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101', '202']); assert.equal(await db.getNote('101'), 'local');
});

test('explicit deletion markers propagate and stale additions cannot resurrect them', async t => {
  const h = await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add');
  const added = await h.sync.createLocalSyncNotesPayload();
  await db.removeFromList('toony_toons', '101'); const removed = await h.sync.createLocalSyncNotesPayload();
  assert.deepEqual(mergeSavedToonSnapshots(added, removed).toonyToonIds, []);
  await h.sync.importSyncNotesPayload(added); assert.deepEqual(await db.getAllFromList('toony_toons'), []);
});

test('an explicit synced-data replacement has a durable recovery snapshot', async t => {
  const h = await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add', 'recover me');
  await h.sync.importSyncNotesPayload({ ...empty(), app: 'toonhqplus', schemaVersion: 1, updatedAt: '2026-10-22' }, { replace: true });
  assert.deepEqual(await db.getAllFromList('toony_toons'), []);
  const backups = await db.getSetting(SAVED_RECOVERY_KEY);
  assert.equal(backups[0].snapshot.notes['101'], 'recover me');
  assert.deepEqual(backups[0].snapshot.toonyToonIds, ['101']);
});

test('cache flush failures retain their batch and a later retry commits it', async t => {
  await setup(t); await db.putToon(toon(101));
  const handle = await db.openDB(), original = handle.transaction;
  handle.transaction = function (...args) { const transaction = original.apply(this, args); if (args[1] === 'readwrite') transaction.abort(); return transaction; };
  await assert.rejects(db.flushToonWriteBuffer()); handle.transaction = original;
  await db.flushToonWriteBuffer(); assert.equal((await db.getToon('101')).name, 'Toon 101');
});

test('background cache writes preserve richer fields instead of overwriting them with undefined', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101, { laff: 140, sellbot: '4232' }), 'add');
  await db.putToon({ id: '101', name: '', laff: undefined, sellbot: undefined }); await db.flushToonWriteBuffer();
  const saved = await db.getToon('101'); assert.equal(saved.name, 'Toon 101'); assert.equal(saved.laff, 140); assert.equal(saved.sellbot, '4232');
});

test('ambiguous synthetic identities retain their list membership and notes during cleanup/export', async t => {
  await setup(t); const hash = '#collision';
  await rawPut('toons', toon(hash, { hashId: hash, name: 'Same', photo: 'same-photo' }));
  await rawPut('toons', toon(101, { hashId: hash, name: 'Same', photo: 'same-photo' }));
  await rawPut('toons', toon(202, { hashId: hash, name: 'Same', photo: 'same-photo' }));
  await db.addToList('stinky_toons', hash); await db.setNote(hash, 'belongs to synthetic');
  await db.cleanupToonCache();
  assert.deepEqual(await db.getAllFromList('stinky_toons'), [hash]); assert.equal(await db.getNote(hash), 'belongs to synthetic');
  assert.equal(await db.resolveToonId(hash), hash);
});

test('unique hash candidates still require complete identity evidence and preserve conflicting notes', async t => {
  await setup(t); const hash = '#unique';
  const records = [toon(hash, { hashId: hash, name: 'Same', photo: 'full-photo' }), toon(101, { hashId: hash, name: 'Same', photo: 'full-photo' })];
  assert.equal(getSafeToonAliases(records).get(hash), '101');
  assert.equal(getSafeToonAliases([{ ...records[0], photo: 'different' }, records[1]]).size, 0);
  for (const record of records) await rawPut('toons', record);
  await db.addToList('stinky_toons', hash); await db.setNote(hash, 'synthetic note'); await db.setNote('101', 'numeric note');
  await db.cleanupToonCache();
  assert.deepEqual(await db.getAllFromList('stinky_toons'), [hash]); assert.equal(await db.getNote(hash), 'synthetic note'); assert.equal(await db.getNote('101'), 'numeric note');
});

test('ordinary age cleanup retains saved metadata and prunes old unused cache records', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101, { lastSeen: '2000-01-01' }), 'add');
  await db.putToon(toon(202, { lastSeen: '2000-01-01' })); await db.flushToonWriteBuffer(); await db.cleanupToonCache();
  assert.ok(await db.getToon('101')); assert.equal(await db.getToon('202'), undefined);
});

test('automatic reconciliation retries the first failed upload when the cloud is empty', async t => {
  const h = await setup(t); await h.sync.setSyncNotesEnabled(true); h.failCloud();
  await h.sync.mutateSavedToons(() => db.saveToonToList('toony_toons', toon(101), 'add'));
  assert.equal(h.writes, 0); db.closeDB(); h.failCloud(false);
  await h.sync.reconcileSyncNotes();
  assert.deepEqual((await h.sync.readSyncNotesPayload()).toonyToonIds, ['101']);
  assert.equal(await db.getSetting(h.sync.SYNC_PENDING_KEY), null);
});

test('automatic reconciliation merges remote omissions and converges without repeated uploads', async t => {
  const h = await setup(t); await h.sync.setSyncNotesEnabled(true);
  await db.saveToonToList('toony_toons', toon(101), 'add', 'local');
  h.setCloud(cloudPayload({ ...empty(), toonyToonIds: ['202'], toons: [toon(202)] }));
  await h.sync.reconcileSyncNotes();
  assert.deepEqual((await h.sync.readSyncNotesPayload()).toonyToonIds, ['101', '202']);
  assert.equal(await db.getNote('101'), 'local'); const writes = h.writes;
  await h.sync.reconcileSyncNotes(); assert.equal(h.writes, writes);
});

test('disabled sync leaves cloud data and the local saved list untouched', async t => {
  const h = await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add');
  h.setCloud(cloudPayload({ ...empty(), toonyToonIds: ['202'] }));
  await h.sync.reconcileSyncNotes(); assert.equal(h.writes, 0);
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101']);
});

test('sync listeners reconcile on mount and clean up before remounting', async t => {
  const h = await setup(t); await h.sync.setSyncNotesEnabled(true);
  h.setCloud(cloudPayload({ ...empty(), toonyToonIds: ['202'] }));
  let imported = 0;
  const stop = h.sync.initSyncNotesRemoteListener(() => { imported++; });
  t.after(stop);
  assert.equal(h.listeners.size, 1); await until(() => imported === 1);
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['202']);
  stop(); assert.equal(h.listeners.size, 0);
  const stopAgain = h.sync.initSyncNotesRemoteListener(); assert.equal(h.listeners.size, 1);
  stopAgain(); assert.equal(h.listeners.size, 0);
});

test('simultaneous saves in two database connections retain every edit and unique revisions', async t => {
  await setup(t);
  const other = await import(`../entrypoints/sidebar.content/db.ts?tab=${crypto.randomUUID()}`);
  t.after(() => other.closeDB());
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? db : other).saveToonToList('toony_toons', toon(i + 1), 'add')));
  const snapshot = await db.exportSavedToonData();
  assert.equal(snapshot.toonyToonIds.length, 20);
  assert.equal(new Set(Object.entries(snapshot.recordVersions).filter(([key]) => key.startsWith('toony:')).map(([, version]) => version.counter)).size, 20);
});

test('two sync module instances serialize mutations and publish both saves', async t => {
  const h = await setup(t); await h.sync.setSyncNotesEnabled(true);
  const other = await import(`../entrypoints/sidebar.content/syncNotes.ts?tab=${crypto.randomUUID()}`);
  await Promise.all([
    h.sync.mutateSavedToons(() => db.saveToonToList('toony_toons', toon(101), 'add')),
    other.mutateSavedToons(() => db.saveToonToList('stinky_toons', toon(202), 'add', 'concurrent note')),
  ]);
  const payload = await h.sync.readSyncNotesPayload();
  assert.deepEqual(payload.toonyToonIds, ['101']); assert.deepEqual(payload.stinkyToonIds, ['202']);
  assert.equal(payload.notes['202'], 'concurrent note');
});

test('record reconciliation is commutative, associative and idempotent across edits and deletion', () => {
  const record = (kind, id, counter, writer, deleted = false) => ({ [savedRecordKey(kind, id)]: { counter, writer, deleted } });
  const a = { ...empty(), toonyToonIds: ['101'], notes: { '101': 'a' }, recordVersions: { ...record('toony', '101', 1, 'a'), ...record('note', '101', 1, 'a') } };
  const b = { ...empty(), stinkyToonIds: ['101'], notes: { '101': 'b' }, recordVersions: { ...record('stinky', '101', 1, 'b'), ...record('note', '101', 1, 'b') } };
  const c = { ...empty(), recordVersions: record('stinky', '101', 2, 'c', true) };
  const canonical = snapshot => JSON.stringify({ ...snapshot, recordVersions: Object.fromEntries(Object.entries(snapshot.recordVersions || {}).sort()) });
  const merge = mergeSavedToonSnapshots;
  assert.equal(canonical(merge(a, b)), canonical(merge(b, a)));
  assert.equal(canonical(merge(merge(a, b), c)), canonical(merge(a, merge(b, c))));
  assert.equal(canonical(merge(merge(a, b), merge(a, b))), canonical(merge(a, b)));
  assert.deepEqual(merge(merge(a, b), c).toonyToonIds, ['101']);
  assert.equal(merge(a, b).notes['101'], 'b');
});

test('simultaneous opposite moves choose one operation consistently on either device', () => {
  const move = (kind, writer) => ({ ...empty(), [kind === 'toony' ? 'toonyToonIds' : 'stinkyToonIds']: ['101'],
    recordVersions: Object.fromEntries(['toony', 'stinky'].map(key => [savedRecordKey(key, '101'), { counter: 2, writer, deleted: key !== kind }])) });
  const a = move('toony', 'a'), b = move('stinky', 'b');
  for (const result of [mergeSavedToonSnapshots(a, b), mergeSavedToonSnapshots(b, a)]) {
    assert.deepEqual(result.toonyToonIds, []); assert.deepEqual(result.stinkyToonIds, ['101']);
  }
});

test('malformed sync data, missing chunks and inconsistent revisions cannot modify local saves', async t => {
  const h = await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add', 'keep');
  for (const payload of [
    { ...empty(), toonyToonIds: [{}] },
    { ...empty(), recordVersions: { [savedRecordKey('toony', '101')]: { counter: 999, writer: 'bad', deleted: false } } },
    { ...empty(), notes: { '101': 5 } },
    { ...empty(), recordVersions: { invalid: {} } },
  ]) {
    h.setCloud(cloudPayload(payload)); await assert.rejects(h.sync.readSyncNotesPayload());
  }
  h.setCloud({ 'toonhqplus-sync-notes-meta': cloudPayload(empty())['toonhqplus-sync-notes-meta'] });
  await assert.rejects(h.sync.readSyncNotesPayload(), /incomplete/);
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101']); assert.equal(await db.getNote('101'), 'keep');
});

test('a generation changed during a cloud read is rejected instead of importing mixed data', async t => {
  const h = await setup(t); h.setCloud(cloudPayload(empty()));
  const original = browser.storage.sync.get; let metadataReads = 0;
  browser.storage.sync.get = async keys => {
    if (keys === 'toonhqplus-sync-notes-meta' && ++metadataReads === 2) h.setCloud(cloudPayload(empty(), 'different-generation'));
    return original(keys);
  };
  await assert.rejects(h.sync.readSyncNotesPayload(), /changed while reading/);
});

test('a synchronous write failure aborts details, membership, note and revisions together', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add', 'keep');
  const before = await db.exportSavedToonData(), original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...args) {
    if (this.name === 'toons' && String(value.id) === '202') throw new DOMException('simulated full disk', 'QuotaExceededError');
    return original.call(this, value, ...args);
  };
  try { await assert.rejects(db.saveToonToList('stinky_toons', toon(202), 'add', 'cannot commit')); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.deepEqual(await db.exportSavedToonData(), before);
});

test('a failed import transaction preserves all saved records instead of committing a cleared list', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add', 'keep');
  const before = await db.exportSavedToonData(), original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...args) {
    if (this.name === 'toons' && String(value.id) === '202') throw new Error('simulated write failure');
    return original.call(this, value, ...args);
  };
  try { await assert.rejects(db.replaceSavedToonData({ ...empty(), toons: [toon(202)], stinkyToonIds: ['202'] })); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.deepEqual(await db.exportSavedToonData(), before);
});

test('moving a legacy row or saving a fallback note preserves richer durable metadata', async t => {
  await setup(t); await rawPut('toons', { ...toon(101, { laff: 140 }), id: 101 });
  await db.saveToonToList('stinky_toons', { id: '101', name: 'Saved Toon 101', detailsUnavailable: true }, 'move');
  await db.saveToonNote({ id: '101', name: 'Saved Toon 101', detailsUnavailable: true }, 'note');
  const result = await db.getToon('101'); assert.equal(result.name, 'Toon 101'); assert.equal(result.laff, 140);
  assert.notEqual(result.detailsUnavailable, true);
});

test('safe cleanup migrates flags and notes with revisions that supersede stale synthetic data', async t => {
  await setup(t); const hash = '#unique';
  for (const id of [hash, '101']) await rawPut('toons', toon(id, { hashId: hash, name: 'Same', photo: 'complete-photo' }));
  await db.saveToonToList('stinky_toons', toon(hash, { hashId: hash, name: 'Same', photo: 'complete-photo' }), 'add', 'keep note');
  const stale = await db.exportSavedToonData(); await db.cleanupToonCache();
  const current = await db.exportSavedToonData();
  assert.deepEqual(current.stinkyToonIds, ['101']); assert.equal(current.notes['101'], 'keep note');
  assert.equal(current.recordVersions[savedRecordKey('stinky', hash)].deleted, true);
  assert.deepEqual(mergeSavedToonSnapshots(current, stale).stinkyToonIds, ['101']);
});

test('backup normalization preserves saved identities, notes and their revision keys', () => {
  const hash = '#unique', records = [toon(hash, { hashId: hash, name: 'Same', photo: 'complete' }), toon(101, { hashId: hash, name: 'Same', photo: 'complete' })];
  const store = records => ({ records, keyPath: 'toonId', autoIncrement: false, indexes: {} });
  const snapshot = { test: { version: 1, stores: { toons: store(records), stinky_toons: store([{ toonId: hash }]),
    notes: store([{ toonId: hash, text: 'hash note' }, { toonId: '101', text: 'numeric note' }]),
    settings: store([{ key: 'saved-toon-record-versions', value: { versions: { [savedRecordKey('stinky', hash)]: { counter: 2, writer: 'a', deleted: false } } } }]),
  } } };
  assert.deepEqual(normalizeToonIdentitiesInSnapshot(snapshot), snapshot);
});

test('backup merge keeps a successful local save when its later cloud upload fails', async t => {
  const h = await setup(t); await h.sync.setSyncNotesEnabled(true);
  await db.saveToonToList('toony_toons', toon(101), 'add', 'local note');
  const site = await transfer.snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] });
  site.toonhqplus.stores.toons.records = [toon(202)];
  site.toonhqplus.stores.toony_toons.records = [{ toonId: '202' }];
  site.toonhqplus.stores.notes.records = [{ toonId: '202', text: 'imported note' }];
  h.failCloud(); await runBackupImport(h, site);
  assert.deepEqual(await db.getAllFromList('toony_toons'), ['101', '202']);
  assert.equal(await db.getNote('101'), 'local note'); assert.equal(await db.getNote('202'), 'imported note');
  assert.match(await db.getSetting(h.sync.SYNC_PENDING_KEY), /sync is pending/);
});

test('backup replacement restamps imported IDs and deletion markers after restoring old metadata', async t => {
  const h = await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add');
  const stale = await db.exportSavedToonData();
  const site = await transfer.snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] });
  site.toonhqplus.stores.toons.records = [toon(202)];
  site.toonhqplus.stores.toony_toons.records = [{ toonId: '202' }];
  await runBackupImport(h, site, { mode: 'replace' });
  const result = await db.exportSavedToonData();
  assert.deepEqual(result.toonyToonIds, ['202']);
  assert.equal(result.recordVersions[savedRecordKey('toony', '101')].deleted, true);
  assert.equal(result.recordVersions[savedRecordKey('toony', '202')].deleted, false);
  assert.deepEqual(mergeSavedToonSnapshots(result, stale).toonyToonIds, ['202']);
  assert.ok((await db.getSetting(SAVED_RECOVERY_KEY)).some(backup => backup.snapshot.toonyToonIds.includes('101')));
});

test('Web Locks coordinate independently loaded saved-data modules and release after rejection', async t => {
  await setup(t); const locks = navigator.locks; let tail = Promise.resolve(), active = 0, maximum = 0;
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request(name, work) {
    assert.equal(name, 'toonhqplus-saved-toons');
    const next = tail.then(work, work); tail = next.catch(() => {}); return next;
  } } });
  t.after(() => { if (locks === undefined) delete navigator.locks; else Object.defineProperty(navigator, 'locks', { configurable: true, value: locks }); });
  const other = await import(`../entrypoints/sidebar.content/savedToonRecords.ts?tab=${crypto.randomUUID()}`);
  const work = fail => async () => { active++; maximum = Math.max(active, maximum); await tick(); active--; if (fail) throw new Error('expected'); };
  const results = await Promise.allSettled([withSavedToonLock(work(true)), other.withSavedToonLock(work(false)), withSavedToonLock(work(false))]);
  assert.equal(maximum, 1); assert.deepEqual(results.map(result => result.status), ['rejected', 'fulfilled', 'fulfilled']);
});

test('newer cache entries arriving during a flush remain queued for the next flush', async t => {
  await setup(t); await db.putToon(toon(101, { laff: 100 }));
  const pending = db.flushToonWriteBuffer();
  await db.putToon(toon(101, { laff: 140, lastSeen: '2026-10-22T11:00:00Z' }));
  await pending; await db.flushToonWriteBuffer();
  assert.equal((await db.getToon('101')).laff, 140);
});

test('old buffered cache data cannot overwrite a newer durable user save', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101, { laff: 140, lastSeen: '2026-10-22T11:00:00Z' }), 'add');
  await db.putToon(toon(101, { laff: 100 })); await db.flushToonWriteBuffer();
  assert.equal((await db.getToon('101')).laff, 140);
});

test('a user save keeps fields from unflushed cache data it replaces', async t => {
  await setup(t); await rawPut('toons', toon(101, { laff: 100 }));
  await db.putToon(toon(101, { organic_level: 5, lastSeen: '2026-10-22T11:00:00Z' }));
  await db.saveToonToList('toony_toons', toon(101, { laff: 140, lastSeen: '2026-10-22T12:00:00Z' }), 'add');
  await db.flushToonWriteBuffer();
  const result = await db.getToon('101'); assert.equal(result.laff, 140); assert.equal(result.organic_level, 5);
});

test('removing a saved Toon leaves unflushed cache data queued', async t => {
  await setup(t); await db.saveToonToList('toony_toons', toon(101), 'add');
  await db.putToon(toon(101, { laff: 150, lastSeen: '2026-10-22T11:00:00Z' }));
  await db.saveToonToList('toony_toons', toon(101), 'remove'); await db.flushToonWriteBuffer();
  assert.equal((await db.getToon('101')).laff, 150);
});

test('rewriting a legacy numeric-key Toon removes the numeric copy', async t => {
  await setup(t);
  await rawPut('toons', { ...toon(42, { laff: 120 }), id: 42 }); await rawPut('toons', { ...toon(43), id: 43 });
  await db.saveToonToList('toony_toons', toon(42), 'add');
  await db.putToon(toon(43, { laff: 90 })); await db.flushToonWriteBuffer();
  const t2 = (await db.openDB()).transaction('toons'), done = txDone(t2);
  const ids = await new Promise(resolve => { t2.objectStore('toons').getAllKeys().onsuccess = e => resolve(e.target.result); });
  await done;
  assert.deepEqual(ids, ['42', '43']);
  assert.equal((await db.getToon('42')).laff, 120); assert.equal((await db.getToon('43')).laff, 90);
});

test('legacy unversioned sync chunks are readable and new uploads use an explicit v2 generation', async t => {
  const h = await setup(t), legacy = cloudPayload({ ...empty(), toonyToonIds: ['101'] });
  delete legacy['toonhqplus-sync-notes-meta'].generation;
  legacy['toonhqplus-sync-notes-chunk-0'] = legacy['toonhqplus-sync-notes-chunk-test-generation-0'];
  delete legacy['toonhqplus-sync-notes-chunk-test-generation-0']; h.setCloud(legacy);
  const old = await h.sync.readSyncNotesPayload(); assert.deepEqual(old.toonyToonIds, ['101']);
  await h.sync.importSyncNotesPayload(old); await h.sync.writeCurrentSavedToonsToSync();
  assert.equal(h.cloud['toonhqplus-sync-notes-meta'].schemaVersion, 2);
  assert.equal((await h.sync.readSyncNotesPayload()).schemaVersion, 2);
  assert.equal('toonhqplus-sync-notes-chunk-0' in h.cloud, false);
});
