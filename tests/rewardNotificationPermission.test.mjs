import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRewardNotificationPermissionWithFallback } from '../entrypoints/lib/rewardNotificationPermission.ts';

test('successful inline permission does not open settings', async () => {
  let opened = 0;
  const granted = await requestRewardNotificationPermissionWithFallback(
    async () => ({ ok: true, granted: true }), async () => { opened++; },
  );
  assert.equal(granted, true);
  assert.equal(opened, 0);
});

test('explicit denial does not offer the fallback or open a page', async () => {
  let offered = 0;
  const granted = await requestRewardNotificationPermissionWithFallback(
    async () => ({ ok: true, granted: false }), async () => { offered++; },
  );
  assert.equal(granted, false);
  assert.equal(offered, 0);
});

for (const [name, response] of [
  ['failed', { ok: false, granted: true }],
  ['missing reply', undefined],
]) {
  test(`${name} inline request offers fallback once without enabling`, async () => {
    let opened = 0;
    const granted = await requestRewardNotificationPermissionWithFallback(
      async () => response, async () => { opened++; },
    );
    assert.equal(granted, false);
    assert.equal(opened, 1);
  });
}

test('rejected inline request offers fallback', async () => {
  let opened = 0;
  const granted = await requestRewardNotificationPermissionWithFallback(
    async () => { throw new Error('User gesture is unavailable'); }, async () => { opened++; },
  );
  assert.equal(granted, false);
  assert.equal(opened, 1);
});

test('unanswered request offers fallback without waiting indefinitely', async () => {
  let opened = 0;
  let finishRequest;
  const request = new Promise(resolve => { finishRequest = resolve; });
  const granted = await requestRewardNotificationPermissionWithFallback(
    () => request, async () => { opened++; }, 1,
  );
  assert.equal(granted, false);
  assert.equal(opened, 1);
  // A late reply cannot open another tab or change the returned result.
  finishRequest({ ok: true, granted: true });
  await Promise.resolve();
  assert.equal(opened, 1);
});

test('fallback failure is propagated to the caller', async () => {
  await assert.rejects(requestRewardNotificationPermissionWithFallback(
    async () => ({ ok: false }),
    async () => { throw new Error('Cannot open settings'); },
  ), /Cannot open settings/);
});
