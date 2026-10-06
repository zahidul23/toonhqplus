type PermissionReply = { ok?: boolean; granted?: boolean } | undefined;

export async function requestRewardNotificationPermissionWithFallback(
  request: () => Promise<PermissionReply>,
  showFallback: () => Promise<void>,
  timeoutMs = 15_000,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let granted = false;
  try {
    // Browsers expose the outcome, not whether the native prompt is visible.
    const response = await Promise.race([
      request(),
      new Promise<undefined>(resolve => { timeout = setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
    // An explicit denial is a completed choice, not a missing prompt.
    if (response?.ok !== false && response?.granted === false) return false;
    granted = response?.ok !== false && response?.granted === true;
  } catch (error) {
    console.warn('[ToonHQ+] Inline notification permission failed; offering notification settings.', error);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  if (!granted) await showFallback();
  return granted;
}
