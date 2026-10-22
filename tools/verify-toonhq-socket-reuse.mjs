// Offline feasibility check against the archived site's actual event bridge.
// No browser, HTTP request, or real WebSocket is used. This does not load the app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parse } from '@babel/parser'; // Available through this repo's WXT tooling.

const file = process.argv[2] || 'native-toonhq/toonhq-groups-app-2026-10-22.a5a51d0c.js';
const bytes = readFileSync(file);
const source = bytes.toString('utf8');
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
    declarations.set(node.id.name, node);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(parse(source));
const property = (node, name) => {
  const result = node?.properties?.find(item => item.key?.name === name);
  assert.ok(result, `Site schema changed: missing ${name}`);
  return result.value;
};
const declaration = name => {
  const result = declarations.get(name);
  assert.ok(result, `Site bundle changed: missing ${name}`);
  return result;
};
const code = node => source.slice(node.start, node.end);

// Only evaluate the reviewed event-bus plugin and socket initialization action.
// Dependencies below are stubs; outbound network APIs are absent from this VM.
const mixins = [];
class FakeVue {
  constructor() { this.listeners = new Map(); }
  $on(event, callback) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
  }
  $off(event, callback) {
    this.listeners.set(event, (this.listeners.get(event) || []).filter(fn => fn !== callback));
  }
  $emit(event, ...args) {
    for (const callback of [...(this.listeners.get(event) || [])]) callback(...args);
  }
  static mixin(mixin) { mixins.push(mixin); }
}
const socketHandlers = new Map();
let catchAll;
let socketFactoryCalls = 0;
let outgoingEmits = 0;
const fakeSocket = {
  id: 'native-socket-io-namespace-id',
  on(event, callback) { socketHandlers.set(event, callback); return this; },
  onAny(callback) { catchAll = callback; return this; },
  emit() { outgoingEmits++; },
};
const sandbox = vm.createContext({
  Z: { default: FakeVue },
  dt: { a: { each: (items, callback) => items.forEach(callback) } },
  Kt: { a: () => { socketFactoryCalls++; return fakeSocket; } },
  console,
});
const run = text => vm.runInContext(text, sandbox, { timeout: 1000 });
for (const name of ['Ft', 'Lt', 'se', 'ie', 're']) run(`var ${code(declaration(name))};`);
run('var Bt = Ft; var me = null; Lt.install();');
const socketModule = declaration('he').init;
const initSocket = property(property(socketModule, 'actions'), 'initSocketIO');
const setSid = property(property(socketModule, 'mutations'), 'setSid');
const nativeState = { status: null, sid: null };
const dispatches = [];
sandbox.actionContext = {
  state: nativeState,
  commit(name, value) {
    if (name === 'setSocketStatus') nativeState.status = value;
    else if (name === 'setSid') nativeState.sid = value;
    else assert.fail(`Unexpected mutation: ${name}`);
  },
  dispatch(name) { dispatches.push(name); },
};
run(`(${code(initSocket)})(actionContext);`);
socketHandlers.get('connect')();
assert.equal(nativeState.sid, fakeSocket.id);
assert.equal(socketFactoryCalls, 1);
assert.equal(typeof catchAll, 'function');
assert.deepEqual(dispatches, ['registerSocketHandlers', 'socketConnected']);

// Attach after initialization, matching document_idle injection into a live page.
const bridge = { $radioCallbacks: [] };
const received = [];
const events = ['group_created', 'group_updated', 'group_disbanded', 'member_joined',
  'member_left', 'boarding_response', 'boarding_created'];
for (const event of events) {
  FakeVue.prototype.$listenFor.call(bridge, `socket:${event}`, (...args) => {
    // Production must also catch its own errors and validate/limit forwarded data.
    received.push({ event, args: JSON.parse(JSON.stringify(args)) });
  });
}
for (const event of events) {
  const payload = { id: 12, game: 1, sync_id: 34 };
  catchAll(event, payload, 'second-argument');
  // Native processGroupEvent deletes sync_id. Our copied message must survive.
  delete payload.sync_id;
}
assert.equal(received.length, events.length);
for (const message of received) {
  assert.equal(message.args[0].sync_id, 34);
  assert.equal(message.args[1], 'second-argument');
}
assert.equal(socketFactoryCalls, 1, 'Listening must not construct another socket');
assert.equal(outgoingEmits, 0, 'Listening must not send anything');

// Exercise the site's actual callback cleanup hook on our dedicated context.
assert.equal(mixins.length, 1);
mixins[0].beforeDestroy.call(bridge);
for (const event of events) catchAll(event, { id: 99 });
assert.equal(received.length, events.length, 'Cleanup must detach every listener');

console.log(JSON.stringify({
  file,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  result: 'PASS',
  events,
  checks: ['late attachment', 'all arguments relayed', 'payload copy survives native mutation',
    'native namespace SID', 'no extra socket construction', 'zero outbound emits', 'listener cleanup'],
  limitation: 'Native functions with stubbed Vue/Socket.IO dependencies; not a live browser or server test.',
  sourceOffsets: { eventBusPlugin: declaration('Lt').start, socketInit: initSocket.start, setSid: setSid.start },
}, null, 2));
