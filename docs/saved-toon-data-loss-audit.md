# Saved Toony / Stinky Toon data-loss audit

Reviewed October 21, 2026, at repository HEAD `42e961e` (manifest version 1.2.39).

Several code paths can explain the reports. Some actually remove list membership; others leave membership stored but hide the row because its Toon details cannot be loaded. This review establishes reproducible failure mechanisms, not which mechanism affected a particular user. Production code was not changed.

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

Generated harness and machine-readable evidence are in the ignored directory `debug/storage-audit/`: `build.mjs`, `scenarios.js`, `run.mjs`, and `results.json`. The headless browser used dedicated profiles inside that directory; no user's browser profile or saved extension data was accessed. These are diagnostic reproductions of current behavior, not passing regression tests for a fix.

For an affected user's exported backup, compare list membership IDs against Toon records, including numeric versus string keys and hash aliases. That distinguishes hidden records from actual membership loss. Whether Sync Notes was enabled, whether multiple ToonHQ tabs/devices were active, and whether disappearance followed saving, reopening, or reconnecting would help rank these mechanisms.
