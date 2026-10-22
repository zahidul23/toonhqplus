import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../entrypoints/sidebar.content/index.tsx', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('const IDLE_RELOAD_AFTER_MS'), source.indexOf('const DEFAULT_SETTINGS:'));
const lifecycle = source.slice(source.indexOf('    let lastUserActivityAt'), source.indexOf('    const bossValuesExist'));
const compiled = ts.transpileModule(helper + '\n' + lifecycle, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  let now = 0, reloads = 0, fetches = 0, fetchResult = Promise.resolve({ ok: true });
  const listeners = new Map(), timers = new Map(), cleanup = [];
  let nextTimer = 0;
  const window = {
    location: { reload() { reloads++; } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const document = { visibilityState: 'hidden', dialog: false, querySelector() { return this.dialog ? {} : null; } };
  const navigator = { onLine: true };
  const context = {
    window, document, navigator, AbortController,
    Date: { now: () => now },
    fetch: () => { fetches++; return fetchResult; },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
    ctx: { onInvalidated(fn) { cleanup.push(fn); } },
  };
  vm.runInNewContext(compiled, context);
  return {
    window, document, navigator, listeners, timers,
    advance(ms) { now += ms; },
    activity(name = 'pointerdown') { listeners.get(name)(); },
    setResponse(response) { fetchResult = response; },
    async check() { [...timers.values()].find(timer => timer.delay === 60_000).fn(); for (let i = 0; i < 12; i++) await Promise.resolve(); },
    close() { cleanup.forEach(fn => fn()); },
    get reloads() { return reloads; }, get fetches() { return fetches; },
  };
}

test('the hourly idle hidden-tab refresh remains enabled with its reachability guard', async () => {
  const h = setup(); await h.check(); assert.equal(h.fetches, 0);
  h.advance(60 * 60 * 1000 - 1); await h.check(); assert.equal(h.reloads, 0);
  h.advance(1); await h.check(); assert.equal(h.fetches, 1); assert.equal(h.reloads, 1);
  h.close(); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
});

test('visible tabs, open dialogs and recent activity postpone the memory refresh', async () => {
  const h = setup(); h.advance(61 * 60 * 1000);
  h.document.visibilityState = 'visible'; await h.check(); assert.equal(h.fetches, 0);
  h.document.visibilityState = 'hidden'; h.document.dialog = true; await h.check(); assert.equal(h.fetches, 0);
  h.document.dialog = false; h.activity(); await h.check(); assert.equal(h.fetches, 0);
  h.advance(60 * 60 * 1000); await h.check(); assert.equal(h.reloads, 1); h.close();
});

test('offline and unreachable ToonHQ do not trigger the memory refresh', async () => {
  const h = setup(); h.advance(61 * 60 * 1000); h.navigator.onLine = false;
  await h.check(); assert.equal(h.fetches, 0); assert.equal(h.reloads, 0);
  h.navigator.onLine = true; h.setResponse(Promise.resolve({ ok: false })); await h.check(); assert.equal(h.reloads, 0);
  h.setResponse(Promise.reject(new Error('unreachable'))); await h.check(); assert.equal(h.reloads, 0); h.close();
});

test('a pending reachability check is not duplicated by the periodic timer', async () => {
  const h = setup(); h.advance(61 * 60 * 1000); let resolve;
  h.setResponse(new Promise(done => { resolve = done; }));
  await h.check(); await h.check(); assert.equal(h.fetches, 1);
  resolve({ ok: true }); for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(h.reloads, 1); h.close();
});

test('invalidation cancels a late reachability response before it can reload the page', async () => {
  const h = setup(); h.advance(61 * 60 * 1000); let resolve;
  h.setResponse(new Promise(done => { resolve = done; })); await h.check();
  h.close(); resolve({ ok: true });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(h.reloads, 0); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
});
