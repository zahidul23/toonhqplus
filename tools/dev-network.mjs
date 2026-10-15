import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from 'wxt';

const logDirectory = fileURLToPath(new URL('../logs/', import.meta.url));
await mkdir(logDirectory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const netLogPath = join(logDirectory, `toonhq-network-${timestamp}.json`);

console.log(`Chrome startup network log: ${netLogPath}`);
const server = await createServer({
  outDir: '.output/network-debug',
  webExt: {
    openDevtools: true,
    chromiumArgs: [`--log-net-log=${netLogPath}`],
    chromiumPref: {
      devtools: {
        preferences: {
          'panel-selectedTab': JSON.stringify('network'),
          'network-log.preserve-log': JSON.stringify(true),
          'network-log.record-log': JSON.stringify(true),
        },
      },
    },
  },
});
await server.start();
