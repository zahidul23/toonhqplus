import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const durationMinutes = Number(valueAfter('--duration-min', '20'));
if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
  throw new Error('--duration-min must be a positive number.');
}

const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outputPath = path.resolve(valueAfter('--output', `docs/captures/toonhq-groups-${stamp}.jsonl`));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const output = fs.createWriteStream(outputPath, { flags: 'wx' });

const startedAt = Date.now();
const endsAt = startedAt + durationMinutes * 60_000;
let socket;
let reconnectTimer;
let stopped = false;
let ackId = 0;

function write(kind, data = {}) {
  output.write(`${JSON.stringify({ captured_at: new Date().toISOString(), kind, ...data })}\n`);
}

async function captureInitialGroups() {
  try {
    const response = await fetch('https://toonhq.org/api/groups/list/1/');
    const body = await response.json();
    write('initial_groups', { status: response.status, body });
  } catch (error) {
    write('initial_groups_error', { error: String(error?.stack || error) });
  }
}

function sendEventWithAck(eventName, ...eventArgs) {
  socket.send(`42${ackId++}${JSON.stringify([eventName, ...eventArgs])}`);
}

function connect() {
  if (stopped) return;
  write('socket_connecting');
  socket = new WebSocket('wss://toonhq.org/socket.io/?protocol=3&EIO=4&transport=websocket');

  socket.addEventListener('open', () => write('socket_open'));
  socket.addEventListener('message', (event) => {
    const raw = String(event.data);
    if (raw === '2') {
      socket.send('3');
      write('socket_ping');
      return;
    }
    if (raw.startsWith('0')) {
      write('engine_open', { raw });
      socket.send('40');
      return;
    }

    const match = raw.match(/^(\d+)(.*)$/s);
    if (!match) {
      write('socket_raw', { raw });
      return;
    }

    const [, prefix, payloadText] = match;
    let payload;
    try {
      payload = payloadText ? JSON.parse(payloadText) : null;
    } catch {
      write('socket_raw', { prefix, raw });
      return;
    }

    if (prefix === '40' && payload && !Array.isArray(payload)) {
      write('namespace_ready', { payload });
      sendEventWithAck('track', 'groups', 1);
      return;
    }

    if (Array.isArray(payload) && typeof payload[0] === 'string') {
      write('socket_event', { event: payload[0], data: payload[1] ?? null, prefix });
    } else {
      write('socket_packet', { prefix, payload });
    }
  });
  socket.addEventListener('error', (event) => write('socket_error', { message: event?.message || 'WebSocket error' }));
  socket.addEventListener('close', (event) => {
    write('socket_close', { code: event.code, reason: event.reason, clean: event.wasClean });
    if (!stopped && Date.now() < endsAt) reconnectTimer = setTimeout(connect, 5_000);
  });
}

async function stop(reason) {
  if (stopped) return;
  stopped = true;
  clearTimeout(reconnectTimer);
  write('capture_end', { reason, elapsed_ms: Date.now() - startedAt });
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'capture complete');
  await new Promise((resolve) => output.end(resolve));
  console.log(outputPath);
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));

write('capture_start', { duration_minutes: durationMinutes, ends_at: new Date(endsAt).toISOString() });
await captureInitialGroups();
connect();
setTimeout(() => void stop('duration_elapsed'), Math.max(0, endsAt - Date.now()));
