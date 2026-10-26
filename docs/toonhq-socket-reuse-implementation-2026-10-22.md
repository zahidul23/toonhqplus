# Native connection reuse — implementation and validation

The extension now observes ToonHQ's existing page state and boarding event bus. It no longer constructs a ToonHQ WebSocket, fetches its own initial groups list, requests its own socket auth token, emits its own tracking subscription, or maintains its own boarding subscription/nonce counter. Localhost ToonTracker sockets are unaffected.

## Behavior

- `public/native-bridge.js` is a packaged page-world script. Discovery supports the native rendered `.sl.theme` root (Vue replaces the original `#app` mount), with component fallbacks. It subscribes before reading a snapshot and owns boarding listeners through a dedicated, unmounted Vue child. Disposal removes that child, watchers, observers, subscriptions, timers and DOM transport listeners.
- `nativeBridge.ts` is the isolated-world client. Versioned JSON messages carry a client ID, bridge session, monotonically increasing sequence and connection/account context. Invalid messages are rejected. A missing delta requests a **local** snapshot; reinjection starts a new session, and retired-session messages are ignored. No network fallback exists.
- Native processed group mutations supply full copied groups for joins/leaves/updates. Native `setActiveGroups` supplies resyncs. Archive records preserve final leave times, including when archive and resync happen in one turn. Retained native archives and late member events never repopulate the active cache.
- History observation starts before database/settings initialization. Its persistence waits for startup readiness, so groups that appear and disband during migration are retained in the correct order. Writes are serialized and identical snapshots are deduplicated. Existing short-lived group cleanup is preserved.
- Live owned-Toon/account state follows native login, logout and Toon changes. Cached persisted login state cannot override an available native state. Public event data and owned Toon fields are explicitly selected; tokens, full account objects and the socket SID are not bridged.
- Live TTR collection pauses on CC/non-groups pages, disconnection, incompatible schemas or unsupported payload sizes. The History view shows the reason. The extension does not join a different native room to continue collecting data.
- Nested TTR group routes (group details, TTR-ID links and reports) belong to the same Groups connection context. Opening or closing a group modal keeps history active and pending boarding checks valid, without resetting the feed or triggering another automatic check.
- Boarding checks use native `loadExistingBoardingGroup`, so native UI and extension requests share the native nonce allocator. Concurrent extension checks for the same Toon are coalesced and cached, including offline `null`. Context changes reject stale results. Native actions cannot be cancelled; a timed-out native promise remains coalesced until it settles or the connection/account context changes.
- Quick Teleport retains automatic status checks with the original **60-second per-Toon cooldown**, persisted before the request so remounts, reloads and failures cannot burst checks. Recent results (including offline `null`) are restored during that cooldown. Checks wait for preferences and the connected native active owned TTR Toon; group-state updates do not trigger polling. Refresh and Teleport retain their explicit requests, and owned Toons come from native state without a fetch fallback. The boarding path requires the TTR Groups page to be connected.

## Memory safeguard retained

The original page refresh policy remains: once the page has been idle for an hour, a check every minute can refresh it while the tab is hidden, no group dialog/modal is open, and the existing reachability check succeeds. Keyboard/pointer/touch/wheel activity postpones it. Overlapping reachability checks are suppressed; invalidation now also prevents a late response from refreshing the page.

This deliberate refresh and its reachability request remain, along with the restored bounded automatic boarding checks, exceptions to zero passive monitoring traffic. Automatic boarding checks still send native status requests; sharing the socket does not eliminate their HTTP work. The memory growth was never conclusively attributed to the extension or the native site, so connection reuse is not treated as a replacement for the safeguard. Extension-owned hourly socket restarts are gone because that socket no longer exists.

## Automated coverage

The tests execute the production page adapter in a VM against a native-shaped Vue/Vuex/Socket.IO contract and connect it to the production isolated-world client, history tracker and boarding service. The harness forbids real `fetch` and `WebSocket` construction. It does not contact ToonHQ.

- Late/early attachment; empty lists; filtered-state independence; rendered-root discovery; root recreation; repeated script injection; unsupported schemas; oversized/malformed/foreign/duplicate/stale messages; sequence recovery and listener isolation.
- Login/logout and owned-Toon changes; disconnect/reconnect; TTR/CC and non-groups navigation; full resync; partial updates; joins/leaves; archives; late events; resync/archive batching; deduplicated persistence and database errors.
- A replay of the saved **20-minute public capture** exercises **685 applicable group/member events** and compares active membership against native state after every event. Chat events and events for groups absent from the captured state are excluded; production leaves any required resync to ToonHQ itself.
- Simultaneous native UI and extension boarding requests use distinct native nonces; same-Toon coalescing; offline results; native errors; timeouts; stale responses after context changes; passive boarding-created notifications; cleanup.
- Production startup wiring is exercised for both Chrome/Firefox extension resource schemes with database migration held pending; transient group history survives until persistence is ready.
- The preserved idle refresh covers idle threshold, visible tabs, dialogs, activity, offline/unreachable servers, overlapping checks and invalidation.
- A repeated-injection/1,000-update test checks that listener owners, subscriptions and timers remain bounded. This checks lifecycle leaks in the adapter; it does not diagnose the original site's long-term memory growth.

Validation commands:

```powershell
npm test
npm run compile
npm run build
npm run build:firefox
node tools/verify-toonhq-socket-reuse.mjs
```

Results on 2026-10-22: **141 tests passed (50 new)**; TypeScript passed; Chrome MV3 and Firefox MV2 production builds passed; archive relay verification passed; diff whitespace checks passed. Both built manifests expose `native-bridge.js`, both packaged copies match the source bytes, and both sidebar bundles omit the duplicate socket/list/auth paths while retaining the idle-refresh implementation.

No new browser permissions or dependencies were added. The optional archive verifier uses the locally saved native bundle; the regular test suite uses tracked fixtures and does not require that ignored archive.

The restored auto-check lifecycle adds **12 tests** in `tests/quickTeleportAutoCheck.test.mjs`: cooldown boundary, reload/remount persistence, offline results, failed checks, explicit refresh bypass, native readiness/ownership/game gates, unchanged group updates, concurrent mounts, Toon switches, reconnects, group-modal navigation, legacy timestamps and unmount cancellation. These tests execute the production lifecycle and helpers against the native bridge/boarding-service harness. Additional bridge/history regressions cover initial group deep links, modal/report routes, pending boarding replies and member persistence while a dialog is open. With the saved-data regressions, the full suite passes **195 tests**; TypeScript checking also passes.

Authenticated live-server/browser testing has not been performed. Before release, verify the installed builds on Chrome and Firefox with actual login/toon switching, native reconnect/resync, simultaneous boarding checks and Quick Teleport. Compare network traffic against the site without the extension: no additional groups socket/bootstrap/auth/subscription should appear; cooldown-limited automatic boarding checks, explicit actions and the retained idle refresh are expected traffic.

## Follow-up bridge audit — 2026-10-22

The public bootstrap included a legitimate group with 134 member records. Native member arrays retain past joins and leaves, so both bridge validators now rely on the existing serialized-message size limit rather than rejecting history after 128 records.

The follow-up review also fixed these reproduced cases:

- An oversized publish discarded pending archives and marked the snapshot sent. Failed publishes now retain pending changes and retry with a full local snapshot. The history tracker retains bounded member counts across temporary unavailability so recovered archives still save final leave times.
- Native `updateGameOpen(false)` closes all active members without individual `archiveGroup` mutations. The bridge now includes retained, fully closed records for previously active groups, preserving final history without treating an ordinary resync as a disband.
- Late boarding-check results or errors could replace a newer boarding-created notification. The status service now keeps the newer per-Toon notification.
- Removing or unlinking an owned Toon did not invalidate its cached or pending boarding checks when the active Toon stayed unchanged. Boarding eligibility now participates in the connection/account context; ordinary Toon stat changes do not change that context.
- Manual Refresh and delayed teleport verification could update another Toon's UI after a Toon switch. Action handlers now check the live Toon context before requesting verification or applying asynchronous results and errors.

Regression coverage includes snapshots, member updates and archives beyond 128 records; oversized-message recovery with pending archives; closure history; boarding notification races; ownership changes; and Quick Teleport switches during Refresh, the verification delay and verification itself. The full suite passes 209 tests; TypeScript checking passes. These checks use the native-state harness and do not replace authenticated browser verification.
