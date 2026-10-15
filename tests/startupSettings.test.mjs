import test from 'node:test';
import assert from 'node:assert/strict';
import { readStartupSetting } from '../entrypoints/lib/startupSettings.ts';

function setup(t, hasSettings = true) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const get = {};
  const transaction = {
    objectStore: () => ({ get: () => get }),
  };
  const db = {
    close: t.mock.fn(),
    objectStoreNames: { contains: () => hasSettings },
    transaction: () => transaction,
  };
  const request = { result: db, transaction: { abort: t.mock.fn() } };
  const open = t.mock.fn(() => request);
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else delete globalThis.indexedDB;
  });
  return { request, db, get, transaction, open };
}

test('fresh startup aborts database creation so the schema owner can initialize it', async (t) => {
  const { request, open } = setup(t);
  const result = readStartupSetting('navbar-config');
  assert.deepEqual(open.mock.calls[0].arguments, ['toonhqplus']);
  request.onupgradeneeded();
  assert.equal(request.transaction.abort.mock.callCount(), 1);
  request.onerror();
  assert.equal(await result, undefined);
});

test('reading an existing setting closes the connection before startup continues', async (t) => {
  const { request, db, get } = setup(t);
  const result = readStartupSetting('display-mode');
  request.onsuccess();
  get.result = { key: 'display-mode', value: 'dark' };
  get.onsuccess();
  assert.equal(await result, 'dark');
  assert.equal(db.close.mock.callCount(), 1);
});

test('an empty legacy database is closed without holding up its schema upgrade', async (t) => {
  const { request, db } = setup(t, false);
  const result = readStartupSetting('navbar-config');
  request.onsuccess();
  assert.equal(await result, undefined);
  assert.equal(db.close.mock.callCount(), 1);
});

test('a version change releases an in-progress settings read', async (t) => {
  const { request, db } = setup(t);
  const result = readStartupSetting('navbar-config');
  request.onsuccess();
  db.onversionchange();
  assert.equal(await result, undefined);
  assert.equal(db.close.mock.callCount(), 1);
});

test('blocked database opens fail open and close a later connection', async (t) => {
  const { request, db } = setup(t);
  const result = readStartupSetting('navbar-config');
  request.onblocked();
  assert.equal(await result, undefined);
  request.onsuccess();
  assert.equal(db.close.mock.callCount(), 1);
});

test('a stalled database open times out and closes a later connection', async (t) => {
  const { request, db } = setup(t);
  assert.equal(await readStartupSetting('navbar-config', 5), undefined);
  request.onsuccess();
  assert.equal(db.close.mock.callCount(), 1);
});

test('failed and stalled transactions both release the database connection', async (t) => {
  const { request, db, transaction } = setup(t);
  const failed = readStartupSetting('navbar-config');
  request.onsuccess();
  transaction.onabort();
  assert.equal(await failed, undefined);
  const stalled = readStartupSetting('navbar-config', 5);
  request.onsuccess();
  assert.equal(await stalled, undefined);
  assert.equal(db.close.mock.callCount(), 2);
});
