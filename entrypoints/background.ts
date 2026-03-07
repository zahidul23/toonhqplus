// The extension used to show a right‑click context menu for rows, but that
// behavior was migrated into the content script itself.  The background
// script remains essentially empty; storage is still accessed directly from
// the content script and the background is reserved for any future use.
export default defineBackground(() => {});
