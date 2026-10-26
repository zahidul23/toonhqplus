# Saved Toony / Stinky Toon data-loss audit

Original reproductions: October 21, 2026, at `42e961e` (1.2.39). Reassessed October 22 after native connection reuse was committed as `ccdb532` (1.3.0). Line references below describe the original audit baseline; current implementation uses named functions/modules instead.

Several code paths can explain the reports. Some remove list membership; others leave membership stored but hide rows whose Toon details cannot be loaded. The original review established reproducible mechanisms, not which mechanism affected an individual user. Its original diagnostic harness remains historical evidence; regression tests for the fixes must assert preservation rather than reproduce loss.

## Effect of the native WebSocket changes

The extension now consumes copied Vuex state through `nativeBridge.ts` and `nativeGroupTracker.ts`. It no longer fetches a second groups list, authenticates another socket or subscribes to a background TTR room. Tracking pauses outside the native TTR groups feed. Those changes do not fix the database/sync failures below. They also mean an orphaned saved entry must not depend on seeing the Toon again to become visible.

`nativeGroupTracker` serializes history/cache writes, but `putToons` still buffers metadata in memory. The retained hourly idle refresh must wait for accepted history writes and flush buffered metadata before reloading. Explicit user saves must commit list membership, Toon details and optional notes atomically; they must not rely on that background buffer or on a later native event.

## Repair scope after reassessment

1. Keep local saved edits after cloud failures, report pending sync, and serialize sync/import workflows across same-origin tabs. Do not restore a stale full snapshot after an upload error.
2. Reconcile automatic sync per record with durable revisions and explicit deletion markers. Legacy snapshots without markers must not delete omitted local entries. Create a durable recovery snapshot before an explicit replacement. Browser sync has no cross-device compare-and-swap; local durable state and reconciliation on later sync are required for recovery from competing uploads.
3. Commit user list moves/saves/details/notes in one transaction; retain failed background cache batches for retry. Flush pending native history/cache work before the preserved idle refresh.
4. Add numeric-key fallback to batch readers and show identifiable fallback rows for saved IDs without details. Do not fetch missing details from ToonHQ automatically.
5. Preserve ambiguous hash identities. Resolve only unique canonical candidates; require matching full name/photo before cleanup moves saved flags or notes. Keep conflicting notes/recovery data rather than deleting them.

The historical findings follow. Final implementation/validation results are recorded at the end of this document.

## 1. Failed sync rollback can erase a different successful save — high priority

Source: `entrypoints/sidebar.content/syncNotes.ts:242–255`, `entrypoints/sidebar.content/db.ts:562–595`.

`mutateSavedToonsWithSyncRollback` captures the entire saved-data snapshot, runs a mutation, and uploads it. Any error restores the entire earlier snapshot. There is no lock or revision check spanning those operations, including across tabs sharing the database.

Reproduced with actual IndexedDB and simulated browser sync storage:

1. Operation A captures an empty snapshot and pauses inside its mutation.
2. Operation B successfully saves Toon 101 locally and uploads it.
3. Operation A resumes, encounters a simulated sync quota failure, and restores its empty snapshot.
4. Toon 101 disappears from the local saved list despite B having succeeded.

This requires Sync Notes enabled and overlapping operations. A sync error can therefore affect records unrelated to the failed edit.

Repair: serialize saved-data mutations and remote imports across tabs, then use revision-aware updates or narrowly scoped rollback. Avoid restoring a stale whole-list snapshot over newer edits. Consider preserving local edits with a pending-sync state on upload failure.

## 2. Stale snapshots can overwrite newer synced records — high priority

Source: `entrypoints/sidebar.content/syncNotes.ts:151–211`, especially line 177; `entrypoints/sidebar.content/db.ts:562–595`.

The upload guard compares the current cloud timestamp with a shared local "last applied" timestamp. It does not establish that the payload being uploaded includes the latest edits. Two tabs can create different payloads, and there is a separate read/check/write window. Automatic remote imports replace both complete lists and all notes; omitted entries are deleted without per-record conflict handling.

Reproduced using two independent sync module instances sharing actual IndexedDB:

1. Tab B captures a payload containing only Toon 101.
2. Tab A saves Toon 202 and successfully uploads `[101, 202]`, updating the shared timestamp.
3. Tab B uploads its older contents with a later timestamp. The conflict guard accepts it.
4. The cloud list becomes `[101]`.

Separately verified that importing a payload containing only 101 changes a local `[101, 202]` list to `[101]`. The automatic listener calls that same replacement function for a newer remote timestamp. A newer timestamp is therefore insufficient evidence that the snapshot contains all saved records. The test simulated sync storage; actual browser-service replication and cross-device timing were not exercised.

Repair: track the revision from which each payload was created, coordinate local writers/imports, and use per-record updates with explicit deletion markers for cross-device reconciliation. A union-only merge would prevent intentional deletions from propagating. Keep a recovery snapshot before destructive imports.

## 3. A saved list entry can outlive its buffered Toon details — high priority

Source: `entrypoints/sidebar.content/SidebarApp.tsx:373–420`, `entrypoints/sidebar.content/db.ts:335–390`, `entrypoints/sidebar.content/SidebarApp.tsx:2393–2395`.

Saving first commits list membership, then calls `putToon`. That function resolves after queuing details in a one-second memory buffer, before the database write commits. The sidebar silently filters out entries without loaded Toon details. Buffer flush errors also discard the queued records and are logged without rejecting the caller.

Reproduced: after awaiting `addToList` and `putToon`, the database contained membership for 101 but `getToons(['101'])` returned no records. Explicitly flushing the buffer restored the record. Page closure or navigation before a pending flush would discard the memory-only details; that page-closure step is inferred from the buffer lifetime, not exercised by this test. This particularly affects a newly encountered Toon with no existing durable details and Sync Notes disabled, because sync exports explicitly request a flush.

Repair: commit user-saved membership, Toon details, and any note together in one IndexedDB transaction; reserve buffering for background cache refreshes. Preserve/retry failed cache writes. Display an identifiable fallback row for orphaned saved IDs instead of silently hiding them.

## 4. Older numeric database keys are missed by the list's batch reader — medium priority

Source: `entrypoints/sidebar.content/db.ts:244–280`, `:399–425`, `:430–438`.

Earlier versions stored numeric Toon IDs (confirmed in commit `95df2b7`). List loading now converts IDs to strings, but `getToons` only looks up string keys and synthetic hashes. Unlike the single-record `getToon` function, it does not fall back to a legacy numeric key. There is no upgrade migration normalizing every existing record.

Reproduced: a numeric Toon key `42` and numeric Stinky membership loaded as the list ID `"42"`, but batch loading returned no Toon records. Calling `getToon('42')` self-healed the key, after which batch loading worked. The sidebar's missing-details filter makes this look like deletion even though the data is still present. Seeing the Toon again and rewriting its metadata can also change visibility.

Repair: migrate legacy keys transactionally and add the numeric-key fallback to batch loading. Check for orphaned list references during recovery and export.

## 5. Ambiguous synthetic identities can move a flag to the wrong Toon — medium priority

Source: `entrypoints/sidebar.content/index.tsx:1725–1739`, `entrypoints/sidebar.content/db.ts:816–879`.

Synthetic IDs use a Toon name and only the first ten characters of a TTR render identifier, compressed to an absolute 32-bit hash. Other photo URL formats contribute no appearance information. These values do not establish a unique account identity. Cleanup maps each synthetic hash to the last matching numeric ID, moves flags/notes, and deletes the synthetic record without checking for multiple numeric candidates. Readers can also pick the first canonical candidate for the same hash.

Reproduced by seeding two numeric Toons with the same hash: cleanup moved the saved synthetic Stinky entry to numeric Toon 202. The test supplied the ambiguous hash directly; it did not measure natural collision frequency. This can present as the original Toon disappearing or a flag appearing on someone else.

Repair: preserve ambiguous records and require an unambiguous canonical identity before merging. Retain aliases and recovery information.

## Checks and artifacts

Seven isolated browser scenarios completed in Microsoft Edge `155.0.4283.62`, using the repository's actual TypeScript database/sync modules transpiled without behavioral changes. IndexedDB was real; browser sync was an in-memory simulation with controlled failures. Six checks reproduced the issues above; the control confirmed that ordinary five-day cleanup retains an old saved Toon while deleting an old unsaved Toon. Routine age pruning is therefore not the leading explanation when membership and details have matching IDs.

Generated harness and machine-readable evidence are in the ignored directory `debug/storage-audit/`: `build.mjs`, `scenarios.js`, `run.mjs`, and `results.json`. The headless browser used dedicated profiles inside that directory; no user's browser profile or saved extension data was accessed. These are diagnostic reproductions of the historical baseline, not passing regression tests for a fix.

For an affected user's exported backup, compare list membership IDs against Toon records, including numeric versus string keys and hash aliases. That distinguishes hidden records from actual membership loss. Whether Sync Notes was enabled, whether multiple ToonHQ tabs/devices were active, and whether disappearance followed saving, reopening, or reconnecting would help rank these mechanisms.

## Implemented repairs — October 22, 2026

The native connection/release work was committed first as `ccdb532`. The following repairs build on that implementation and retain extension version 1.3.0, with an additional saved-data changelog entry.

| Finding | Implemented behavior |
| --- | --- |
| Failed cloud upload rolls back another save | `mutateSavedToons` commits locally first. Cloud failures keep the edit, record a persistent pending-sync message, and offer Retry sync in the Saved Toons and History views. Startup and reconnect reconciliation retry pending uploads. Same-origin workflows use Web Locks, with a module queue fallback; database revisions are allocated inside transactions. |
| Stale whole snapshots delete newer records | `savedToonRecords.ts` merges each list flag and note using a logical counter and unique operation ID. Missing records carry no deletion meaning; explicit tombstones propagate removals. A deterministic tie break resolves simultaneous edits of the same field. Moves stamp both list categories. Timestamps are informational, not conflict guards. |
| Saved membership survives missing metadata | `saveToonToList` and `saveToonNote` commit details, list changes, notes and revisions together. Synchronous write failures explicitly abort the transaction. Background cache batches stay queued after failure, retry with backoff, and retain newer entries received during a flush. Older cache data cannot overwrite newer durable details. |
| Numeric keys or orphaned details hide saved entries | Batch reads and user-save merges include legacy numeric-key fallback. The sidebar builds fallback rows named `Saved Toon <ID>` with the original saved ID, so the user can still identify, edit and remove the entry. This makes no automatic ToonHQ request. |
| Weak synthetic identity moves saved data | Readers avoid choosing among multiple numeric candidates. Cleanup requires exactly one candidate plus equal full name and photo; conflicting notes prevent consolidation. Successful consolidation stamps old-ID tombstones and new-ID revisions in the same transaction. Portable backup normalization preserves saved IDs with their revision keys instead of independently rewriting them. |

Before a merge or replacement changes saved contents, the database retains up to three prior snapshots in the `settings` record `saved-toon-recovery`, in the same transaction as the change. This is recovery evidence included in full storage backups, not an automatic rollback or a dedicated restore interface. Explicit backup imports remain serialized; their chosen contents are restamped after restoring old database/settings metadata. A subsequent cloud failure cannot undo the successful local import.

Sync writes use schema 2 and immutable generation-specific chunks. Reads verify the manifest again after loading/decompressing chunks, validate data/revision consistency, and reject incomplete or mixed generations. Schema 1 payloads and their original unversioned chunks remain readable. The explicit schema change prevents older clients from interpreting a new manifest alongside leftover legacy chunks. New writers prune only the previous generation they read, rather than deleting a competing writer's new chunks.

The existing hidden-tab refresh still checks hourly inactivity, open dialogs, visibility and ToonHQ reachability. Before reload it waits for accepted native history work and cache persistence; a persistence error postpones reload for retry, and extension disposal cancels late reloads. This preserves the memory-growth safeguard without depending on whether growth originates in ToonHQ or the extension.

## Regression validation

`npm test` passes **180 tests**: the prior 141 plus **36 saved-data regressions** and **3 additional idle-refresh regressions**. TypeScript checking (`npm run compile`) and both production builds (`npm run build`, Chrome MV3; `npm run build:firefox`, Firefox MV2) pass. Both generated manifests report version 1.3.0. `git diff --check` passes.

`tests/savedToonData.test.mjs` executes the actual database/sync modules with `fake-indexeddb` and controlled browser-sync storage. It covers reopen durability; atomic moves and aborted writes; stale, legacy and malformed remote payloads; deletion propagation; concurrent database connections and sync module instances; Web Lock serialization/release; merge order and simultaneous opposite moves; pending first-upload recovery; listener cleanup; generation changes/missing chunks; retryable cache writes; legacy numeric records; orphan visibility; ambiguous identities; safe consolidation; and the actual sidebar backup-import workflow, including cloud failure after a successful local import. `tests/idleRefresh.test.mjs` verifies persistence ordering, retry after failure, and cancellation while persistence is pending, alongside the retained idle/reachability checks.

These regressions use an IndexedDB implementation in Node and simulated browser sync. They do not establish real browser-service replication timing, live cross-device convergence, or the cause of historical user reports. The earlier native-feed replay and bridge tests remain in the suite; authenticated live ToonHQ behavior has not been revalidated by these storage tests.

## Remaining limits

- Browser sync offers no cross-device lock or compare-and-swap. Competing cloud writes can temporarily omit a device's edits; durable local revisions permit reconciliation when that device next starts, reconnects or syncs. If a device's local storage is erased before reconciliation, those unpublished edits cannot be recovered from the cloud.
- Tombstones are retained to prevent stale resurrection. They and generation chunks consume browser sync quota; failures leave local edits intact with pending sync. Concurrent generation writes can leave orphan chunks or temporarily require space for two generations. There is no automatic compaction without an agreed device-revision frontier.
- Older extension versions still have their original whole-snapshot behavior. Reading legacy data is supported; safe behavior on every device requires updating every writer. Deletions made by a legacy client without tombstones cannot be inferred safely from omissions.
- Concurrent edits of the same note use a deterministic winner; the losing local value can be present in a retained recovery snapshot. Separate records are preserved. Matching full appearance/name evidence reduces mistaken alias merges but is not an account-identity proof.
- These repairs prevent the reproduced mechanisms and expose missing-detail entries. They cannot reconstruct metadata or memberships already erased from all local storage, sync data and backups.
