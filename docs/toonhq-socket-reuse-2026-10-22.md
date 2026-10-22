# ToonHQ connection reuse investigation — 2026-10-22

Reusing ToonHQ's existing connection is feasible for group history, member/toon caching, and boarding notifications. The best route is a page-context bridge to the site's existing Vue event bus and Vuex store. The extension does not need access to the raw WebSocket object. Passive listeners and state reads add local browser work, without additional ToonHQ requests or socket subscriptions.

The investigation below led to the implemented native bridge. See [implementation and test notes](toonhq-socket-reuse-implementation-2026-10-22.md) for the final behavior and validation. The existing hourly idle-tab refresh is retained at the user's request because the source of memory growth remains unresolved.

## Archive and verification

- Checked public page: <https://toonhq.org/groups/>
- Referenced application script: <https://toonhq.org/static/dist/js/app.a5a51d0c.js>
- Saved original bytes: `native-toonhq/toonhq-groups-app-2026-10-22.a5a51d0c.js`
- Size: **435,836 bytes**.
- SHA-256: `cb82ee54d8fbf5f3e5bcaa8d5abfa23179ed94b6863272451df14dce08b8531b`
- Byte-for-byte identical to `toonhq-groups-app-2026-09-16.a5a51d0c.js`. This is the latest bundle referenced by the public groups page checked today; no newer application hash was advertised there.
- The page also references `/static/dist/js/chunk-vendors.542bfc0a.js`. That vendor bundle was not downloaded; previous archives contain only the application bundle.
- `native-toonhq/` is already Git-ignored and excluded from extension source ZIPs; the new snapshot follows that convention.

Run the reproducible, network-free experiment:

```powershell
node tools/verify-toonhq-socket-reuse.mjs
```

Result: **PASS**. It parses the archived JavaScript using the parser already installed through WXT, extracts the actual native event-bus plugin and socket initialization function, and runs those functions with stubbed Vue/Socket.IO dependencies. It checks late attachment, seven relevant event types, multiple event arguments, copying data before native mutation, the native namespace SID, listener cleanup, no additional socket construction from listening, and no outbound emits from listening. The one socket factory invocation in this experiment is the site's simulated initialization.

This establishes the local relay behavior, not a measured production bandwidth reduction or a live-browser compatibility result. There was no connected ToonHQ browser tab available. No extra real socket or boarding/API test requests were made for the experiment.

## What ToonHQ already provides

The minified application's useful symbols and **zero-based character offsets** in the saved file are:

| Hook | Evidence | Purpose |
| --- | --- | --- |
| Native Vue event bus | `Ft = new Z.default()` at 23427; alias `Bt = Ft` | Already exists in the page; the socket itself (`me`) is private to the bundle. |
| Listener helper | Plugin `Lt` at 23444 defines `Vue.prototype.$listenFor(event, callback)` | Registers `Ft.$on` and records callbacks in `this.$radioCallbacks`. Its `beforeDestroy` mixin removes those callbacks. |
| Socket initialization | `initSocketIO` function at 38267 | Creates Socket.IO with WebSocket transport and protocol 3. Registers `me.onAny(...)`, which relays every incoming named event as `Bt.$emit('socket:' + event, ...args)`. |
| Connection state | `he.state` at 37351 | Holds `status`, `sid`, and `rooms`. On connect, the site commits `setSid(me.id)`: the **Socket.IO namespace ID**, not the Engine.IO transport ID. |
| Bootstrap/live groups | `_o.state` at 145328 | Starts from `window.STATE.groups`; Vuex stores the current group map and active IDs independently of rendered card filters. |
| Native state updates | `applyGroupEvent` at 156678 | Handles group creation/update/disband, member changes, chat events, and game closure. The extension currently handles a narrower set. |
| Native boarding request | `boardingRequest` at 164167; `loadExistingBoardingGroup` at 165009 | Allocates a native nonce, sends the HTTP request with the native SID, and resolves the promise through the existing socket handler. |
| Root store | Vue root construction around 423909 | The app mounts on `#app` with `store: Do`. Discover the root or another mounted component's `__vue__` and `$store` in page context. |

The relevant incoming names include `socket:group_created`, `socket:group_updated`, `socket:group_disbanded`, `socket:member_joined`, `socket:member_left`, `socket:boarding_response`, and `socket:boarding_created`. Subscribe only to events the extension needs. Account changes can instead be read from `store.state.accounts` and watched locally.

The [Socket.IO client API](https://socket.io/docs/v4/client-api/#socketonanycallback) confirms catch-all listeners receive incoming named events but not acknowledgement packets. ToonHQ already converts the named events into its Vue bus, so adding another Socket.IO client is unnecessary.

## Current additional ToonHQ work

| Extension behavior | Location | Proposed replacement |
| --- | --- | --- |
| Initial `GET /api/groups/list/1/` | `entrypoints/sidebar.content/index.tsx:2276` | Copy native group state when ready, and observe native `setActiveGroups` replacements. |
| Second socket, handshake, ping/pong and `track('groups', 1)` | `index.tsx:2370–2543` | Consume the existing Vue bus and store; do not emit another `track`. |
| Separate socket auth and fallback `POST /api/accounts/socket_auth/` | `index.tsx:2331` | Let the site own authentication, login/logout, token consumption, and reconnects. |
| Hourly socket restart; full page reload on unplanned reconnect | `index.tsx:2355`, `2408` | Observe native reconnect/resync; let the site recover its own connection. |
| Additional boarding subscribe/unsubscribe POSTs | `entrypoints/sidebar.content/boardingStatus.ts` | Observe native `toonBoardingGroupSubscription`; let the site maintain it. |
| Separate boarding nonce map starting at 1 | `boardingStatus.ts` | Route requests through native `loadExistingBoardingGroup` rather than sharing the SID with our existing nonce generator. |
| Idle reachability request and full reload | Original `index.tsx:1692`, `2586` | Retained with its existing idle/hidden/dialog/connectivity safeguards. Memory growth may originate in native ToonHQ code. This intentional refresh still causes page/bootstrap traffic. |
| Owned-toons API fallbacks | `index.tsx:2128`, `QuickTeleport.tsx:231` | Prefer live `state.accounts.toons`, including SPA login updates; use offline cached data if native state is unavailable in a strict passive mode. |

The content script matches all ToonHQ pages. Its current groups fetch and socket setup have no groups-page guard, so this work can occur outside the groups tracker too. On a normal groups tab where the site has its own socket, removing the extension-owned socket eliminates one redundant connection and its duplicated group feed. This is a connection-count observation, not a claim that total server load drops by 50%.

`entrypoints/background.ts` has separate **localhost ToonTracker** sockets; those do not connect to ToonHQ and are outside this server-load problem. District population polling targets the TTR API and already shares a cache across tabs; it is also a different server.

## Recommended implementation

1. Extend the existing `public/vue-logger.js` page-context bridge. It already finds Vue components/stores and sends stringified `CustomEvent` payloads to the isolated content script. Add discovery through the root/parent component as well as cards/filters so an empty or fully filtered group list still works. Keep discovery bounded and respond to SPA navigation/component recreation.
2. Create an extension-owned listener context or child Vue instance with `$radioCallbacks` and register allowlisted `$listenFor('socket:...', handler)` callbacks. Dispose it when the bridge is replaced, its owner is destroyed, or the content script is invalidated. Do not attach callbacks to a long-lived native component and assume our own invalidation will destroy that component. Do not remove native listeners.
3. Register listeners **before** copying the initial store state. Copy the active game, active IDs and full group/member data synchronously in page context, then send a snapshot and sequenced deltas to the extension. Buffer while IndexedDB/settings initialize. Use a request/ready handshake so early snapshots are replayed locally to a late content-script consumer; avoid a missed-snapshot race or a fallback API fetch.
4. Prefer the unfiltered group map/active IDs to `getters.groupsList`, which applies UI filters. Copy data rather than passing live Vue objects to `applyToonHash` or other extension normalizers. `processGroupEvent` explicitly deletes incoming `data.sync_id`; immediately clone any raw event data we retain.
5. Use `store.subscribe` for processed group mutations and full `setActiveGroups` refreshes; use the bus for boarding events and any required raw event details. The site buffers/replays events around list snapshots using sync IDs, and some native actions mutate state directly. Handle `gameChanged`, disconnect/reconnect, group initialization, and resync as explicit transitions. A raw bus listener alone is not a complete replacement for native resync. Deduplicate replays and history records; do not write the entire group list to IndexedDB on every socket event.
6. Keep game state separate. The native groups room follows the active page game; our current socket always tracks game 1. In passive mode, capture TTR while the native room tracks TTR, capture CC only if the feature supports CC, and pause otherwise. Do not force another game subscription or join a groups room merely to keep background history collection running. Collection outside the page's active feed cannot be preserved with strictly zero additional server work.
7. Replace the extension-owned groups socket, initial list fetch, separate auth, heartbeat, reconnection/restart timers, and automatic extra boarding subscriptions once equivalent bridge behavior is validated. An incompatible bridge should pause live collection and expose a clear unavailable state; it should not silently open a fallback socket or start polling.

The [Vuex 3 API](https://v3.vuex.vuejs.org/api/#subscribe) provides local subscriptions and unsubscribe functions. [Chrome's content-script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#work_in_isolated_worlds) explains why these page objects need a main-world bridge. This repository already uses an external packaged script for that boundary; validate the existing path on both Chrome MV3 and Firefox MV2.

Bridge messages are page-controlled input. Validate message shape/game/size, send JSON strings for Firefox compatibility, keep exception handling inside our callbacks, and never expose a generic page-to-extension command executor. Allow only explicitly supported requests. Do not bridge auth tokens or arbitrary store contents.

## Quick Teleport and boarding caveats

- Native `boardingRequest` maintains a private nonce counter starting at 1 and a private pending-request table. Our separate implementation also starts at 1. **Replacing our SID with the native SID while keeping our nonce counter can resolve the wrong request.** Prefer `store.dispatch('loadExistingBoardingGroup', toonId)` and return its result through a correlated bridge request. This lets the native code allocate the nonce and consume the socket response.
- Wrap the bridge request in a bounded timeout and discard stale results after game, account, or connection changes. The inspected native action has no explicit response timeout and does not expose cancellation of its private pending-request entry; a bridge timeout alone does not cancel native/server work. Deduplicate checks and avoid retry loops.
- ToonHQ already subscribes the active external TTR toon to boarding creation, and its `boarding_created` handler opens a native dialog. Merely observing that event does not add another subscription or open another dialog. Our status handling should preserve the native behavior and avoid initiating duplicate actions.
- The native subscription is for the active eligible toon. Tracking other toons or rooms requires server work unless their needed data already arrives naturally. Make that a deliberate feature tradeoff.
- Quick Teleport's status checks, group creation, optional delisting, and post-action verification are explicit HTTP operations. Sharing a socket does **not** eliminate them. A strict zero-additional-request mode must avoid checks/actions that the page would not otherwise perform. Normal user-requested actions can remain available, with the distinction documented as zero *passive monitoring* traffic rather than zero total traffic.

## Other approaches

| Approach | Added ToonHQ traffic | Assessment |
| --- | --- | --- |
| Native event bus + Vuex snapshot/subscriptions | None for passive observation of the page's existing feed | Recommended. Works after connection startup and reuses native auth/reconnect/resync. Depends on private site interfaces; version-check and fail closed. |
| Vuex state/mutation observation alone | None | Good for group/member state; lacks boarding responses not stored in Vuex, and some lifecycle state changes bypass mutations. Combine with the event bus. |
| Wrap `window.WebSocket` at `document_start` | None if observation-only | Possible fallback if the Vue hook disappears. Must run in the page world before socket creation, preserve native constructor behavior, handle replacement connections and frame decoding. Cannot discover an already-created socket by replacing the constructor afterward. Higher risk than the available bus. |
| DOM/MutationObserver only | None | Useful degraded mode for visible cards/rows. Filters, unmounted dialogs, omitted fields and fleeting events prevent complete history/status capture. |
| `webRequest` | Not a solution for message capture | Chrome exposes the upgrade handshake, not frames on an established connection. See [the API's WebSocket limitation](https://developer.chrome.com/docs/extensions/reference/api/webRequest). |
| Debugger/CDP frame capture | None from observation | Technically useful for development diagnostics, but introduces powerful permissions and debugger attachment; not appropriate for ordinary extension operation. |
| Shared extension socket/leader tab | Still adds a connection if it is extension-owned | Reduces duplicate extension connections across tabs, but does not meet the passive-reuse target as well as local listeners on each existing page socket. |
| HTTP polling / extension-hosted proxy | Additional requests or upstream connections | Does not meet the zero-additional-load goal. |
| Official ToonHQ integration hook | None if exposed locally | Most stable long-term option: a documented local event/state bridge would remove dependence on private Vue interfaces. No outreach was sent. |

## Validation before changing runtime behavior

Compare otherwise equivalent Chrome and Firefox sessions with and without the extension, using the page's existing connection. There should be no additional `/socket.io/` connection, no extension-triggered group-list or socket-auth request, no duplicated `track`/boarding subscription, and no hourly extension restart/reload. Check reconnects against the native baseline rather than assuming the page never reconnects itself.

Exercise empty/filtered lists; late bridge startup; active-group membership and history; partial `group_updated`; `member_left`/disband; native resync; offline/online; login/logout and toon switching; TTR/CC and non-groups SPA navigation; repeated injection/invalidation; simultaneous native and extension boarding checks; boarding-created dialogs; multiple tabs; and bridge schema mismatch. Verify local data remains consistent and unsupported live collection pauses without creating hidden networking fallbacks.
