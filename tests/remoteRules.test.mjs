import test from 'node:test';
import assert from 'node:assert/strict';
import { wakeRemoteControlledCog } from '../entrypoints/sidebar.content/remoteRules.ts';

test('a remote-controlled Cog wakes from Lure at the end of its round', () => {
  const cog = { isLured: true, lureDuration: 4 };
  wakeRemoteControlledCog(cog);
  assert.deepEqual(cog, { isLured: false, lureDuration: 0 });
});
