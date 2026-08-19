import React, { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo, memo } from 'react';
import { groupTypes } from './groupTypes';
import { getGroupDisplayName, getGroupSimpleName } from './toonUtils';
import { gags as gagsConfig } from './gags';
import { cogs as cogsConfig } from './cogs';
import { ShtickerBook } from './ShtickerBook.tsx';
import { QuickTeleport } from './QuickTeleport';
import {
  closeDB,
  getAllFromList,
  addToList,
  removeFromList,
  clearList,
  getToon,
  getToons,
  searchToons,
  putToon,
  getAllGroups,
  getGroupMembers,
  getAllGroupMembers,
  getAllNotes,
  getNote,
  setNote,
  clearNotes,
  getSetting,
  getSettings,
  setSetting,
  deleteGroup as dbDeleteGroup,
  clearAllGroups,
  exportSavedToonData,
  replaceSavedToonData,
  type ToonRecord,
  type ToonId,
  type SavedToonDataSnapshot,
} from './db';
import {
  createLocalSyncNotesPayload,
  importSyncNotesPayload,
  initSyncNotesRemoteListener,
  isSyncNotesEnabled,
  mutateSavedToonsWithSyncRollback,
  readSyncNotesPayload,
  setSyncNotesEnabled,
  syncSavedToonsAfterLocalMutation,
  writeSyncNotesPayload,
  type SyncNotesPayload,
} from './syncNotes';
import {
  createTransferDocument,
  formatBytes,
  formatTransferFilename,
  mergeImportPlanSummaries,
  mergeIndexedDatabases,
  mergeLocalStorage,
  measureBytes,
  parseTransferDocument,
  pruneIndexedDbSnapshotForExport,
  restoreIndexedDatabases,
  restoreLocalStorage,
  snapshotIndexedDatabases,
  snapshotLocalStorage,
  analyzeOriginStorageMerge,
  type ImportComparisonKind,
  type ImportConflictPolicy,
  type ImportMode,
  type ImportPlanSummary,
  type TransferSnapshot,
  type IndexedDbDatabaseSnapshot,
} from '../lib/storageTransfer';

const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
  SIDEBAR_OPEN: 'toonhqplus-sidebar-open',
  NAVBAR_CONFIG: 'toonhqplus-navbar-config',
  NOTES: 'toonhqplus-notes',
  BOSS_INFO_ENABLED: 'toonhqplus-boss-info-enabled',
  NOTES_ENABLED: 'toonhqplus-notes-enabled',
  ACTIVE_TAB: 'toonhqplus-active-tab',
} as const;

interface ToonData {
  id: ToonId;
  name: string;
  species?: number;
  color?: string;
  laff?: number;
  level?: number;
  photo?: string;
  photo_bg?: string;
  ring?: string | null;
  toonup?: number;
  trap?: number;
  lure?: number;
  sound?: number;
  throw?: number;
  squirt?: number;
  drop?: number;
  prestiges?: string[];
  organic_level?: number | null;
  sellbot?: string | number;
  cashbot?: string | number;
  lawbot?: string | number;
  bossbot?: string | number;
  note?: string;
  [key: string]: any;
}

interface DialogState {
  isOpen: boolean;
  type: 'add' | 'move' | 'remove' | 'delete_group';
  listKey?: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
  toon?: ToonData;
  source: 'main' | 'sidebar';
  otherListName?: string;
  groupId?: number;
}

interface ResetSettingsDialogState {
  isOpen: boolean;
  isBusy: boolean;
  selections: {
    history: boolean;
    savedToons: boolean;
    navigation: boolean;
  };
  message?: string;
  error?: string;
}

interface TransferDialogState {
  mode: 'import' | 'export';
  text: string;
  isBusy: boolean;
  importMode?: ImportMode;
  conflictPolicy?: ImportConflictPolicy;
  parsedSnapshot?: TransferSnapshot;
  importPlan?: ImportPlanSummary;
  includeFullToonCache?: boolean;
  fileName?: string;
  totalBytes?: number;
  rawBytes?: number;
  message?: string;
  error?: string;
}

const SPECIES_MAP: Record<number, string> = {
  1: 'bear',
  2: 'cat',
  3: 'dog',
  4: 'duck',
  5: 'horse',
  6: 'monkey',
  7: 'mouse',
  8: 'pig',
  9: 'rabbit',
  10: 'deer',
  11: 'crocodile',
};

function getToonPhoto(toon: ToonData): string | undefined {
  if (toon.photo) return toon.photo;
  if (toon.species != null && SPECIES_MAP[toon.species]) {
    return `https://toonhq.org/static/assets/species/${SPECIES_MAP[toon.species]}.png`;
  }
  return undefined;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `${mins}m ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SyncNotesChoiceDialogState {
  payload: SyncNotesPayload;
  localSnapshot: SavedToonDataSnapshot;
  isBusy: boolean;
  error?: string;
}

function getImportPlanTotals(plan?: ImportPlanSummary) {
  if (!plan) return { added: 0, updated: 0, conflicts: 0, unchanged: 0 };
  return {
    added: plan.localStorage.added + plan.indexedDB.added + plan.browserStorageLocal.added,
    updated: plan.localStorage.updated + plan.indexedDB.updated + plan.browserStorageLocal.updated,
    conflicts: plan.localStorage.conflicts + plan.indexedDB.conflicts + plan.browserStorageLocal.conflicts,
    unchanged: plan.localStorage.unchanged + plan.indexedDB.unchanged + plan.browserStorageLocal.unchanged,
  };
}

const browserSyncProfileName = import.meta.env.FIREFOX ? 'Firefox' : 'Chrome';

function getSyncNotesDescription(): string {
  return `Syncs your saved Stinky and Toony toons lists and notes across your devices through ${browserSyncProfileName} Profile Sync.`;
}

const importAnalysisLabels: Record<ImportComparisonKind, string> = {
  added: 'New Data',
  updated: 'Updated Data',
  conflict: 'Conflicts',
  unchanged: 'Unchanged Data',
};

function formatComparisonValue(value: unknown): string {
  if (value === undefined) return 'No existing value';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type SyncPreviewKind = 'toony' | 'stinky' | 'notes';

function getSyncPreviewCount(snapshot: SavedToonDataSnapshot, kind: SyncPreviewKind): number {
  if (kind === 'toony') return snapshot.toonyToonIds.length;
  if (kind === 'stinky') return snapshot.stinkyToonIds.length;
  return Object.keys(snapshot.notes).length;
}

function getSyncPreviewToonLabel(snapshot: SavedToonDataSnapshot, toonId: string): string {
  const toon = snapshot.toons.find((entry) => String(entry.id) === String(toonId));
  if (!toon) return String(toonId);
  return `${toon.name || toon.id}${toon.laff != null ? ` (${toon.laff})` : ''}`;
}

function getSyncPreviewItems(snapshot: SavedToonDataSnapshot, kind: SyncPreviewKind): string[] {
  if (kind === 'toony') {
    return snapshot.toonyToonIds.map((toonId) => getSyncPreviewToonLabel(snapshot, toonId));
  }
  if (kind === 'stinky') {
    return snapshot.stinkyToonIds.map((toonId) => getSyncPreviewToonLabel(snapshot, toonId));
  }
  return Object.entries(snapshot.notes).map(([toonId, text]) => {
    const label = getSyncPreviewToonLabel(snapshot, toonId);
    return `${label}: ${text}`;
  });
}

function SyncNotesPreviewCell({ snapshot, kind }: { snapshot: SavedToonDataSnapshot; kind: SyncPreviewKind }) {
  const items = getSyncPreviewItems(snapshot, kind);
  return (
    <div className="min-h-0 rounded-lg border border-white/5 bg-black/15 p-2">
      {items.length === 0 ? (
        <div className="py-4 text-center text-[11px] italic text-green-100/35">No saved data</div>
      ) : (
        <ul className="max-h-[6.5rem] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
          {items.map((item, index) => (
            <li
              key={`${kind}-${item}-${index}`}
              className="rounded bg-white/5 px-2 py-1.5 text-[11px] leading-snug text-green-50/90"
              title={item}
            >
              <span className="line-clamp-2">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SyncNotesPreviewGrid({
  synced,
  local,
  onUseSynced,
  onUseLocal,
  disabled,
}: {
  synced: SavedToonDataSnapshot;
  local: SavedToonDataSnapshot;
  onUseSynced: () => void;
  onUseLocal: () => void;
  disabled: boolean;
}) {
  const rows: Array<{ kind: SyncPreviewKind; label: string }> = [
    { kind: 'toony', label: 'Toony' },
    { kind: 'stinky', label: 'Stinky' },
    { kind: 'notes', label: 'Notes' },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div />
        <button
          type="button"
          onClick={onUseSynced}
          disabled={disabled}
          className="rounded-lg bg-emerald-600 px-2 py-2 text-center text-white shadow-lg transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block text-[10px] font-black uppercase tracking-widest">Use Synced Data</span>
          <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-emerald-100/80">(Overwrites Local)</span>
        </button>
        <button
          type="button"
          onClick={onUseLocal}
          disabled={disabled}
          className="rounded-lg bg-amber-600 px-2 py-2 text-center text-white shadow-lg transition-all hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block text-[10px] font-black uppercase tracking-widest">Use Local Data</span>
          <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-amber-100/80">(Overwrites Sync)</span>
        </button>

        {rows.map((row) => (
          <React.Fragment key={row.kind}>
            <div className="flex flex-col justify-center rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <span className="text-xs font-bold text-white">{row.label}</span>
              <span className="mt-0.5 text-[10px] font-semibold text-green-200/55">
                {getSyncPreviewCount(synced, row.kind)} synced
              </span>
              <span className="text-[10px] font-semibold text-amber-200/60">
                {getSyncPreviewCount(local, row.kind)} local
              </span>
            </div>
            <SyncNotesPreviewCell snapshot={synced} kind={row.kind} />
            <SyncNotesPreviewCell snapshot={local} kind={row.kind} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const RelativeTime = memo(({ date }: { date: string }) => {
  const [display, setDisplay] = useState(() => formatRelativeTime(date));

  useEffect(() => {
    setDisplay(formatRelativeTime(date));
    const getDelay = () => {
      const diff = Date.now() - new Date(date).getTime();
      if (diff < 3600000) return 30000;
      if (diff < 86400000) return 300000;
      return 3600000;
    };

    let timeoutId: any;
    const update = () => {
      setDisplay(formatRelativeTime(date));
      timeoutId = setTimeout(update, getDelay());
    };

    timeoutId = setTimeout(update, getDelay());
    return () => clearTimeout(timeoutId);
  }, [date]);

  return (
    <span title={`${new Date(date).toDateString()} ${new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}>
      {display}
    </span>
  );
});

async function updateToonList(
  type: 'add' | 'move' | 'remove',
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  toon: ToonData,
  note?: string
) {
  const toonStore: 'toony_toons' | 'stinky_toons' =
    listKey === STORAGE_KEYS.FAVORITES ? 'toony_toons' : 'stinky_toons';
  const otherStore: 'toony_toons' | 'stinky_toons' =
    toonStore === 'toony_toons' ? 'stinky_toons' : 'toony_toons';
  const toonId = toon.id;

  await mutateSavedToonsWithSyncRollback(async () => {
    if (type === 'remove') {
      await removeFromList(toonStore, toonId);
    } else {
      await addToList(toonStore, toonId);
      await removeFromList(otherStore, toonId);
      await putToon({
        id: toonId,
        name: toon.name || '',
        species: toon.species,
        color: toon.color,
        laff: toon.laff,
        level: toon.level,
        photo: toon.photo,
        photo_bg: toon.photo_bg,
        ring: toon.ring,
        toonup: toon.toonup,
        trap: toon.trap,
        lure: toon.lure,
        sound: toon.sound,
        throw: toon.throw,
        squirt: toon.squirt,
        drop: toon.drop,
        prestiges: toon.prestiges,
        organic_level: toon.organic_level,
        sellbot: toon.sellbot,
        cashbot: toon.cashbot,
        lawbot: toon.lawbot,
        bossbot: toon.bossbot,
        lastSeen: new Date().toISOString(),
      });

      if (note !== undefined) {
        await setNote(toonId, note);
      }
    }
  });
}

async function exportAllData(includeFullToonCache: boolean): Promise<{ json: string; totalBytes: number; rawBytes: number; fileName: string }> {
  const extensionResponse = await browser.runtime.sendMessage({ type: 'EXPORT_EXTENSION_STORAGE', includeFullToonCache });
  if (extensionResponse?.error) {
    throw new Error(extensionResponse.error);
  }

  const snapshot: TransferSnapshot = {
    app: 'toonhqplus',
    version: 1,
    exportedAt: new Date().toISOString(),
    origins: {
      site: {
        localStorage: snapshotLocalStorage(window.localStorage),
        indexedDB: includeFullToonCache
          ? await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] })
          : pruneIndexedDbSnapshotForExport(await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] })),
      },
      extension: extensionResponse?.snapshot ?? {
        localStorage: {},
        indexedDB: {},
        browserStorageLocal: {},
      },
    },
  };

  const { json, document } = await createTransferDocument(snapshot);
  return {
    json,
    totalBytes: measureBytes(json),
    rawBytes: document.rawBytes,
    fileName: formatTransferFilename(new Date(snapshot.exportedAt)),
  };
}

async function buildImportPlan(snapshot: TransferSnapshot): Promise<ImportPlanSummary> {
  const siteCurrent = {
    localStorage: snapshotLocalStorage(window.localStorage),
    indexedDB: await snapshotIndexedDatabases({ fallbackNames: ['toonhqplus'] }),
  };
  const sitePlan = analyzeOriginStorageMerge(siteCurrent, snapshot.origins.site, 'Site');

  const extensionResponse = await browser.runtime.sendMessage({
    type: 'ANALYZE_EXTENSION_IMPORT',
    snapshot: snapshot.origins.extension,
  });

  if (extensionResponse?.error) {
    throw new Error(extensionResponse.error);
  }

  if (!extensionResponse?.plan) {
    throw new Error('Extension storage analysis did not return an import plan.');
  }

  return mergeImportPlanSummaries(sitePlan, extensionResponse.plan);
}

function stableImportSerializeJsonValue(value: unknown, inArray: boolean = false): string | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? 'null' : undefined;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stableImportSerializeJsonValue(entry, true) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => {
        const serialized = stableImportSerializeJsonValue(record[key]);
        return serialized === undefined ? null : `${JSON.stringify(key)}:${serialized}`;
      })
      .filter((entry): entry is string => entry !== null);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableImportStringify(value: unknown): string {
  return stableImportSerializeJsonValue(value) ?? 'undefined';
}

function importValuesEqual(a: unknown, b: unknown): boolean {
  return stableImportStringify(a) === stableImportStringify(b);
}

function normalizeSavedToonId(value: unknown): string | null {
  if (typeof value === 'string') {
    const id = value.trim();
    return id.length > 0 ? id : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function getToonLastSeenTime(toon: unknown): number | null {
  if (!toon || typeof toon !== 'object') return null;
  const time = Date.parse(String((toon as Record<string, unknown>).lastSeen ?? ''));
  return Number.isFinite(time) ? time : null;
}

function mergeStagedToonRecord(current: ToonRecord | undefined, incoming: ToonRecord, conflictPolicy: ImportConflictPolicy): ToonRecord {
  if (!current || importValuesEqual(current, incoming)) return incoming;

  const currentSeen = getToonLastSeenTime(current);
  const incomingSeen = getToonLastSeenTime(incoming);
  if (currentSeen != null && incomingSeen != null) {
    return incomingSeen >= currentSeen ? incoming : current;
  }

  return conflictPolicy === 'use-import' ? incoming : current;
}

function getSavedToonSnapshotFromIndexedDb(database?: IndexedDbDatabaseSnapshot): SavedToonDataSnapshot {
  const toons = (database?.stores.toons?.records ?? [])
    .map((record) => {
      const id = normalizeSavedToonId(record?.id);
      return id ? { ...record, id } as ToonRecord : null;
    })
    .filter((record): record is ToonRecord => record !== null);

  const toonyToonIds = (database?.stores.toony_toons?.records ?? [])
    .map((record) => normalizeSavedToonId(record?.toonId))
    .filter((id): id is string => id !== null);

  const stinkyToonIds = (database?.stores.stinky_toons?.records ?? [])
    .map((record) => normalizeSavedToonId(record?.toonId))
    .filter((id): id is string => id !== null);

  const notes: Record<string, string> = {};
  for (const record of database?.stores.notes?.records ?? []) {
    const id = normalizeSavedToonId(record?.toonId);
    if (id && typeof record?.text === 'string') notes[id] = record.text;
  }

  const referencedIds = new Set([...toonyToonIds, ...stinkyToonIds, ...Object.keys(notes)]);
  return {
    toons: toons.filter((toon) => referencedIds.has(String(toon.id))),
    toonyToonIds,
    stinkyToonIds,
    notes,
  };
}

function mergeUniqueToonIds(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming])];
}

function mergeSavedToonSnapshots(
  current: SavedToonDataSnapshot,
  incoming: SavedToonDataSnapshot,
  conflictPolicy: ImportConflictPolicy
): SavedToonDataSnapshot {
  const toonsById = new Map<string, ToonRecord>();
  for (const toon of current.toons) {
    const id = normalizeSavedToonId(toon.id);
    if (id) toonsById.set(id, { ...toon, id });
  }
  for (const toon of incoming.toons) {
    const id = normalizeSavedToonId(toon.id);
    if (!id) continue;
    toonsById.set(id, mergeStagedToonRecord(toonsById.get(id), { ...toon, id }, conflictPolicy));
  }

  const notes = { ...current.notes };
  for (const [toonId, text] of Object.entries(incoming.notes)) {
    if (!(toonId in notes) || notes[toonId] === text || conflictPolicy === 'use-import') {
      notes[toonId] = text;
    }
  }

  const toonyToonIds = mergeUniqueToonIds(current.toonyToonIds.map(String), incoming.toonyToonIds.map(String));
  const stinkyToonIds = mergeUniqueToonIds(current.stinkyToonIds.map(String), incoming.stinkyToonIds.map(String));
  const referencedIds = new Set([...toonyToonIds, ...stinkyToonIds, ...Object.keys(notes)]);

  return {
    toons: Array.from(toonsById.values()).filter((toon) => referencedIds.has(String(toon.id))),
    toonyToonIds,
    stinkyToonIds,
    notes,
  };
}

async function stageSyncNotesForImport(
  snapshot: TransferSnapshot,
  options: { mode: ImportMode; conflictPolicy: ImportConflictPolicy },
  currentSavedToons: SavedToonDataSnapshot
): Promise<boolean> {
  if (!(await isSyncNotesEnabled())) return false;

  const incomingSavedToons = getSavedToonSnapshotFromIndexedDb(snapshot.origins.site.indexedDB?.toonhqplus);
  const stagedSavedToons = options.mode === 'replace'
    ? incomingSavedToons
    : mergeSavedToonSnapshots(currentSavedToons, incomingSavedToons, options.conflictPolicy);

  const payload: SyncNotesPayload = {
    app: 'toonhqplus',
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...stagedSavedToons,
  };

  await writeSyncNotesPayload(payload, { allowRemoteOverwrite: true });
  return true;
}

async function importAllData(text: string, options: { mode: ImportMode; conflictPolicy: ImportConflictPolicy; parsedSnapshot?: TransferSnapshot }): Promise<void> {
  const snapshot = options.parsedSnapshot ?? await parseTransferDocument(text);
  const savedToonRollback = await exportSavedToonData();
  const syncStaged = await stageSyncNotesForImport(snapshot, options, savedToonRollback);

  // Sync Notes defaults to disabled when its setting is absent. Materialize that
  // effective local value so a merge using Keep Local treats an imported value as
  // a conflict instead of adding it as a new setting.
  if (options.mode === 'merge' && options.conflictPolicy === 'keep-local') {
    await setSyncNotesEnabled(await isSyncNotesEnabled());
  }

  try {
    const extensionResponse = await browser.runtime.sendMessage({
      type: 'IMPORT_EXTENSION_STORAGE',
      snapshot: snapshot.origins.extension,
      mode: options.mode,
      conflictPolicy: options.conflictPolicy,
    });

    if (extensionResponse?.error) {
      throw new Error(extensionResponse.error);
    }

    closeDB();
    if (options.mode === 'replace') {
      restoreLocalStorage(window.localStorage, snapshot.origins.site.localStorage || {});
      await restoreIndexedDatabases(snapshot.origins.site.indexedDB || {}, { fallbackNames: ['toonhqplus'] });
    } else {
      mergeLocalStorage(window.localStorage, snapshot.origins.site.localStorage || {}, {
        conflictPolicy: options.conflictPolicy,
      });
      await mergeIndexedDatabases(snapshot.origins.site.indexedDB || {}, {
        conflictPolicy: options.conflictPolicy,
      });
    }

    if (!syncStaged) {
      await syncSavedToonsAfterLocalMutation();
    }
  } catch (error) {
    await replaceSavedToonData(savedToonRollback);
    if (syncStaged) {
      try {
        await writeSyncNotesPayload({
          app: 'toonhqplus',
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          ...savedToonRollback,
        }, { allowRemoteOverwrite: true });
      } catch (rollbackError) {
        console.warn('[ToonHQ+] Failed to roll back staged Sync Notes import.', rollbackError);
      }
    }
    throw error;
  }
}

// GAG_TRACKS is replaced by gagsConfig from gags.ts

const SUIT_TRACKS = [
  { name: 'Sellbot', key: 'sellbot', color: '#7b00ae' },
  { name: 'Cashbot', key: 'cashbot', color: '#108000' },
  { name: 'Lawbot', key: 'lawbot', color: '#2e5db1' },
  { name: 'Bossbot', key: 'bossbot', color: '#8c5d3d' },
];

const decodeSuit = (trackId: string, suitCode: string | number | undefined) => {
  if (suitCode == null) return null;
  const s = String(suitCode).padStart(4, '0');

  const cogHex = s[0];
  const versionDigit = s[1];
  const levelHex = s.substring(2);

  const cogIndex = parseInt(cogHex, 16) - 1;
  const isVersion2 = versionDigit === '2';
  const level = parseInt(levelHex, 16);

  if (cogIndex < 0 || level === 0) return null;

  const track = cogsConfig.find((t) => t.id === trackId);
  const rank = track?.ranks[cogIndex];

  if (!rank) return null;

  return {
    name: rank.name,
    image: rank ? `https://toonhq.org/static/assets/cogs/${rank.image}` : null,
    level,
    isVersion2,
  };
};

const ToonTooltip = memo(({ toon, isFavorited, isBlocked, note }: { toon: ToonData, isFavorited: boolean, isBlocked: boolean, note?: string }) => {
  if (!toon) return null;
  let toonClass = 'myToon';
  if (isFavorited) {
    // toonClass = 'bg-[#1f8454]';
    toonClass = 'favoritedToon';
  } else if (isBlocked) {
    toonClass = 'blockedToon';
  }

  return (
    <div className={`toon-tooltip w-[19rem] ${toonClass} border border-emerald-500/30 rounded-xl shadow-2xl p-4 flex flex-col gap-5 text-white pointer-events-none animate-in fade-in duration-200`} >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-full" />
          {(() => {
            const photo = getToonPhoto(toon);
            return photo ? (
              <img
                src={photo}
                alt={toon.name}
                className="relative h-16 w-auto max-w-none rounded-full border-2 border-white/20 bg-black/40 object-cover shadow-lg"
              />
            ) : (
              <div className="relative h-16 w-auto max-w-none rounded-full border-2 border-white/20 bg-black/40 flex items-center justify-center text-white/20 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
            );
          })()}
        </div>
        <div className="flex flex-col min-w-0">
          <h4 className="font-bold text-lg leading-tight break-words">
            {toon.name}{' '}
            {toon.laff != null && (
              <span className="text-emerald-400 font-black text-sm tabular-nums">({toon.laff})</span>
            )}
          </h4>
        </div>
      </div>

      {note && (
        <p className="text-xs italic text-white/80 break-words pl-2 pr-2">{note}</p>
      )}
      <div className="flex flex-col rounded-lg border border-white/10 bg-black/40 shadow-inner overflow-hidden">
        {gagsConfig.map((track) => {
          const level = (toon[track.id] as number) || 0;
          const isPrestiged = toon.prestiges?.includes(track.id);
          const isMissing = level === 0;
          const organicLvl = isPrestiged ? toon.organic_level || 0 : 0;

          return (
            <div
              key={track.id}
              className={`flex h-9 p-1 items-center gap-0.5 border-b border-white/10 last:border-0 transition-all ${isMissing ? 'opacity-20 grayscale' : 'opacity-100'}`}
              style={{ background: isMissing ? undefined : `${track.color}11` }}
            >
              {track.gags.map((gag, idx) => {
                const gagLvl = idx + 1;
                const isUnlocked = level >= gagLvl;
                return (
                  <div
                    key={gag.name}
                    className={`flex-1 h-full flex items-center justify-center relative transition-all duration-300 rounded-sm ${isUnlocked ? 'opacity-100 scale-100 shadow-lg' : 'opacity-10 scale-90 grayscale-10'}`}
                    style={{
                      backgroundColor: track.color,
                    }}
                    title={`${gagLvl}: ${gag.name}`}
                  >
                    <img
                      src={`https://toonhq.org/static/assets/gags/${gag.image}`}
                      alt={gag.name}
                      draggable="false"
                      className="w-6 h-6 object-contain drop-shadow-md"
                    />
                    {isPrestiged && isUnlocked && organicLvl >= gagLvl && (
                      <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                        <img
                          src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                          alt="Organic"
                          className="w-5 h-5 object-contain"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 px-1">
        {SUIT_TRACKS.map((suit) => {
          const suitData = decodeSuit(suit.key, toon[suit.key]);
          return (
            <div
              key={suit.name}
              className={`flex flex-col gap-1 rounded-lg p-2 border relative overflow-hidden group/suit transition-all duration-300 ${suitData ? 'shadow-xl border-white/20' : 'bg-black/20 border-white/5'}`}
              style={{
                backgroundColor: suitData ? suit.color : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-black uppercase tracking-widest ${suitData ? 'text-white/80' : 'text-white/30'}`}>
                  {suit.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {suitData?.image ? (
                  <img src={suitData.image} alt={suitData.name} className="w-5 h-5 object-contain" />
                ) : (
                  <svg className="w-5 h-5 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                )}
                <div className="flex flex-col">
                  {suitData ? (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] font-black tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                          {`Lvl ${suitData.level}`}
                        </span>
                        {suitData.isVersion2 && (
                          <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter self-end mb-0.5">V2.0</span>
                        )}
                      </div>
                      <span className="text-[8px] font-medium text-white/70 leading-tight truncate max-w-[80px]" title={suitData.name}>
                        {suitData.name}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div >
  );
});


function loadLists(): Promise<{ favorites: ToonId[]; blocked: ToonId[] }> {
  return Promise.all([
    getAllFromList('toony_toons'),
    getAllFromList('stinky_toons'),
  ]).then(([favorites, blocked]) => ({ favorites, blocked }));
}

const ToonRow = memo(({
  toon,
  isFavorited,
  isBlocked,
  isOwnToon,
  note,
  refresh,
  isHovered,
  isJustAdded,
  onRequestDialog,
  onMouseEnter,
  onMouseLeave
}: {
  toon: ToonData;
  isFavorited: boolean;
  isBlocked: boolean;
  isOwnToon: boolean;
  note?: string;
  refresh: () => void;
  isHovered: boolean;
  isJustAdded?: boolean;
  onRequestDialog: (type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'sidebar' | 'main') => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || '');
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    setNoteDraft(note || '');
  }, [note]);

  const listKey = isFavorited ? STORAGE_KEYS.FAVORITES : isBlocked ? STORAGE_KEYS.BLOCKED : null;

  const defaultHoverClass = isBlocked ? 'blockedToon shadow-md ring-1 ring-red-400' : 'bg-[#e6ffed]/20 shadow-md ring-1 ring-emerald-400';
  let bgColorClass = isHovered ? defaultHoverClass : 'bg-white/5 hover:bg-[#10462d]/60';
  let textColorClass = 'text-white';

  if (isJustAdded) {
    bgColorClass = isBlocked ? 'blockedToon ring-2 ring-red-400' : 'bg-emerald-500/60 ring-2 ring-emerald-400';
  } else if (!isHovered) {
    if (isOwnToon) {
      bgColorClass = 'bg-[#cae9fcbd]';
      textColorClass = 'text-[#cae9fc]';
    } else if (isFavorited) {
      bgColorClass = 'bg-[#1f8454]';
      textColorClass = 'text-[#e6ffed]';
    } else if (isBlocked) {
      bgColorClass = 'bg-[#ad130dde]';
      textColorClass = 'text-[#ffebe9]';
    }
  }

  const saveNote = () => {
    setNoteError(null);
    mutateSavedToonsWithSyncRollback(() => setNote(toon.id, noteDraft))
      .then(() => {
        refresh();
        setIsEditing(false);
      })
      .catch((error) => {
        setNoteError(error instanceof Error ? error.message : String(error));
      });
  };

  const rowRef = React.useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (isHovered && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHovered]);

  return (
    <li
      ref={rowRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative flex flex-col gap-1 rounded px-2 py-1.5 text-sm transition-all duration-250 ${bgColorClass} ${textColorClass}`}
    >
      <div className="flex items-center gap-1">
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          {(() => {
            const photo = getToonPhoto(toon);
            return photo ? (
              <img src={photo} alt={toon.name} className="h-6 w-6 shrink-0 rounded-full bg-black/10" />
            ) : null;
          })()}
          <span className="truncate">
            {toon.name}
            {toon.laff != null ? ` (${toon.laff})` : ''}
          </span>
          {toon.id?.startsWith('#') && (
            <span
              title="This toon has no ToonHQ ID and may not get highlighted in groups"
              className="shrink-0 text-yellow-400/70"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 w-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-200 overflow-hidden">
          {!isOwnToon && (
            <>
              {listKey ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setNoteDraft(toon.note || note || '');
                    }}
                    className={`shrink-0 rounded p-1 cursor-pointer transition-colors ${isBlocked
                      ? 'text-red-400/70 hover:bg-red-600 text-red-300/60'
                      : 'text-green-100/50 hover:bg-[#1f8454] hover:text-white'
                      }`}
                    title="Edit note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetKey = listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
                      onRequestDialog('move', targetKey, toon, 'sidebar');
                    }}
                    className={`shrink-0 rounded p-1 text-green-100/50 hover:text-white cursor-pointer transition-colors ${isBlocked ? 'hover:bg-red-600' : 'hover:bg-emerald-600'}`}
                    title={listKey === STORAGE_KEYS.FAVORITES ? "Move to Stinky Toons" : "Move to Toony Toons"}
                  >
                    {listKey === STORAGE_KEYS.FAVORITES ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (listKey) onRequestDialog('remove', listKey, toon, 'sidebar');
                    }}
                    className="shrink-0 rounded p-1 text-[#cf222e] text-[#ff7b72] hover:bg-[#ad130dde] cursor-pointer"
                    title="Remove from list"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                </>
              ) : (
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                      setNoteDraft(toon.note || note || '');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white cursor-pointer transition-colors"
                    title="Add note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.FAVORITES, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-[#1f8454] hover:text-white cursor-pointer"
                    title="Add to Toony Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDialog('add', STORAGE_KEYS.BLOCKED, toon, 'sidebar');
                    }}
                    className="rounded p-1 text-green-100/50 hover:bg-red-600 hover:text-white cursor-pointer"
                    title="Add to Stinky Toons"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className={`mt-2 flex flex-col gap-2 rounded border bg-black/60 p-2 shadow-inner ${isBlocked ? 'border-red-500/40' : 'border-[#1f8454]/40'}`}>
          <textarea
            autoFocus
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            className={`w-full flex-1 resize-y custom-scrollbar max-h-32 rounded border bg-black/20 px-2 py-1 text-xs text-white focus:outline-none transition-colors ${isBlocked
              ? 'border-red-500/60 placeholder-red-200/40 focus:border-red-400'
              : 'border-[#1f8454] placeholder-green-100/30 focus:border-green-400'
              }`}
            placeholder={isBlocked ? "Rude, griefing, bad gags, etc..." : "Nice, helpful, communicative, strategic etc..."}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveNote();
              }
              if (e.key === 'Escape') setIsEditing(false);
            }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setNoteError(null);
                mutateSavedToonsWithSyncRollback(() => setNote(toon.id, ''))
                  .then(() => {
                    refresh();
                    setIsEditing(false);
                  })
                  .catch((error) => {
                    setNoteError(error instanceof Error ? error.message : String(error));
                  });
              }}
              className="mr-auto shrink-0 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300-400 hover:bg-red-500 hover:text-white cursor-pointer transition-all flex items-center gap-1 border border-red-500/20"
              title="Remove note"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
              Remove
            </button>
            <button
              onClick={saveNote}
              className={`shrink-0 rounded px-2 py-1 text-xs text-white cursor-pointer transition-colors ${isBlocked ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="shrink-0 rounded bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60 cursor-pointer"
            >
              Cancel
            </button>
          </div>
          {noteError && <div className="text-[10px] font-semibold text-red-300">{noteError}</div>}
        </div>
      ) : note ? (
        <div className={`ml-8 whitespace-pre-wrap text-xs leading-snug italic ${isBlocked ? 'text-red-300/80' : 'text-green-100/80'}`}>
          {note}
        </div>
      ) : null}
    </li>
  );
});

const DEFAULT_NAV_ITEMS = [
  { id: 'invasions', label: 'Invasions', href: '/invasions/', colorClass: 'blue' },
  { id: 'groups', label: 'Groups', href: '/groups/', colorClass: 'green' },
  { id: 'fishing', label: 'Fishing', href: '/fishing/', colorClass: 'fishing' },
  { id: 'ccg', label: 'CCG', href: '/ccg/', colorClass: 'steel' },
  { id: 'field-offices', label: 'Field Offices', href: '/field-offices/', colorClass: 'steel' },
  { id: 'gardening', label: 'Gardening', href: '/gardening/', colorClass: 'green' },
  { id: 'doodles', label: 'Pet Shop Doodles', href: '/doodles/', colorClass: 'shop' },
];

function NavbarSettings({
  config,
  onUpdate
}: {
  config: { pinned: string[], dropdown: string[] },
  onUpdate: (newConfig: { pinned: string[], dropdown: string[] }) => void
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ list: 'pinned' | 'dropdown', index: number } | null>(null);

  const moveItem = (id: string, from: 'pinned' | 'dropdown', to: 'pinned' | 'dropdown', atIndex?: number) => {
    const newConfig = { ...config };
    const items = [...newConfig[from]].filter(itemId => itemId !== id);
    newConfig[from] = items;

    const targetItems = [...newConfig[to]];
    const insertAt = atIndex !== undefined ? atIndex : targetItems.length;
    targetItems.splice(insertAt, 0, id);
    newConfig[to] = targetItems;

    onUpdate(newConfig);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent, list: 'pinned' | 'dropdown', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverInfo({ list, index });
  };

  const onDragOverRow = (e: React.DragEvent, list: 'pinned' | 'dropdown', id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const items = config[list];
    const index = items.indexOf(id);

    const targetIndex = e.clientY < midY ? index : index + 1;
    setDragOverInfo({ list, index: targetIndex });
  };

  const onDrop = (e: React.DragEvent, targetList: 'pinned' | 'dropdown', targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    const sourceList = config.pinned.includes(id) ? 'pinned' : 'dropdown';
    let finalIndex = targetIndex !== undefined ? targetIndex : config[targetList].length;

    if (sourceList === targetList) {
      const items = [...config[targetList]];
      const oldIndex = items.indexOf(id);
      if (oldIndex !== -1) {
        items.splice(oldIndex, 1);
        const adjustedIndex = finalIndex > oldIndex ? finalIndex - 1 : finalIndex;
        items.splice(adjustedIndex, 0, id);
        onUpdate({ ...config, [targetList]: items });
      }
    } else {
      moveItem(id, sourceList, targetList, finalIndex);
    }
    setDraggedId(null);
    setDragOverInfo(null);
  };

  const renderDropZone = (list: 'pinned' | 'dropdown', index: number) => {
    const isActive = dragOverInfo?.list === list && dragOverInfo?.index === index;
    if (draggedId) {
      const isSourceList = config[list].includes(draggedId);
      if (isSourceList) {
        const itemIdx = config[list].indexOf(draggedId);
        if (index === itemIdx || index === itemIdx + 1) return null;
      }
    }

    return (
      <div
        onDragOver={(e) => onDragOver(e, list, index)}
        onDragLeave={() => setDragOverInfo(null)}
        onDrop={(e) => onDrop(e, list, index)}
        className={`transition-all duration-200 rounded ${isActive ? 'h-10 bg-emerald-500/20 border-2 border-dashed border-emerald-500/40 my-1' : 'h-1'}`}
      />
    );
  };

  const renderItemRow = (id: string, listType: 'pinned' | 'dropdown') => {
    const item = DEFAULT_NAV_ITEMS.find(n => n.id === id);
    if (!item) return null;
    const isDragging = draggedId === id;

    return (
      <div
        key={id}
        draggable
        onDragStart={(e) => onDragStart(e, id)}
        onDragOver={(e) => onDragOverRow(e, listType, id)}
        onDrop={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const index = config[listType].indexOf(id);
          onDrop(e, listType, e.clientY < midY ? index : index + 1);
        }}
        onDragEnd={() => {
          setDraggedId(null);
          setDragOverInfo(null);
        }}
        className={`flex items-center justify-between gap-2 rounded bg-black/20 p-2 hover:bg-black/30 cursor-move transition-all ${isDragging ? 'opacity-20 scale-95' : 'opacity-100'}`}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30"><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></svg>
          <div className={`h-2 w-2 rounded-full bg-current ${item.colorClass === 'blue' ? 'text-blue-400' : item.colorClass === 'green' ? 'text-green-400' : item.colorClass === 'steel' ? 'text-slate-400' : item.colorClass === 'fishing' ? 'text-cyan-400' : 'text-pink-400'}`} />
          <span className="text-sm font-medium text-white">{item.label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
      <p className="text-xs text-green-100/70 leading-relaxed bg-black/20 p-2 rounded border border-white/5">
        Drag and drop items to customize your navigation bar. <strong>Pinned Pages</strong> show in the main bar, while <strong>Hidden Pages</strong> move to the "More" menu.
      </p>
      <div>
        <h5 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]/60">Pinned Pages</h5>
        <div className="flex flex-col">
          {config.pinned.map((id, i) => (
            <React.Fragment key={id}>
              {renderDropZone('pinned', i)}
              {renderItemRow(id, 'pinned')}
            </React.Fragment>
          ))}
          {config.pinned.length > 0 && renderDropZone('pinned', config.pinned.length)}
          {config.pinned.length === 0 && (
            <div
              onDragOver={(e) => onDragOver(e, 'pinned', 0)}
              onDragLeave={() => setDragOverInfo(null)}
              onDrop={(e) => onDrop(e, 'pinned', 0)}
              className={`transition-all duration-200 text-center text-xs italic p-4 border-2 border-dashed rounded ${dragOverInfo?.list === 'pinned' && dragOverInfo?.index === 0 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' : 'text-green-200/30 border-white/5'}`}
            >
              Drop items here to pin.
            </div>
          )}
        </div>
      </div>
      <div>
        <h5 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]/60">Hidden Pages</h5>
        <div className="flex flex-col">
          {config.dropdown.map((id, i) => (
            <React.Fragment key={id}>
              {renderDropZone('dropdown', i)}
              {renderItemRow(id, 'dropdown')}
            </React.Fragment>
          ))}
          {config.dropdown.length > 0 && renderDropZone('dropdown', config.dropdown.length)}
          {config.dropdown.length === 0 && (
            <div
              onDragOver={(e) => onDragOver(e, 'dropdown', 0)}
              onDragLeave={() => setDragOverInfo(null)}
              onDrop={(e) => onDrop(e, 'dropdown', 0)}
              className={`transition-all duration-200 text-center text-xs italic p-4 border-2 border-dashed rounded ${dragOverInfo?.list === 'dropdown' && dragOverInfo?.index === 0 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' : 'text-green-200/30 border-white/5'}`}
            >
              Drop items here to hide.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TOOLTIP_GAP = 24; // px gap between tooltip and the anchor row

function TooltipAnchor({
  anchorRect,
  children,
}: {
  anchorRect: { top: number; left: number; height: number };
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden', position: 'fixed' });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const tooltipHeight = el.offsetHeight;
    const tooltipWidth = el.offsetWidth;
    const vh = window.innerHeight;
    const PADDING = 8; // min distance from viewport edge

    // Vertical: centre on the anchor row, clamped within viewport
    const idealTop = anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2;
    const top = Math.max(PADDING, Math.min(vh - tooltipHeight - PADDING, idealTop));

    // Horizontal: place tooltip to the left of the anchor, clamped within viewport
    const idealLeft = anchorRect.left - tooltipWidth - TOOLTIP_GAP;
    const left = Math.max(PADDING, idealLeft);

    setStyle({ position: 'fixed', top, left, visibility: 'visible' });
  }, [anchorRect]);

  return (
    <div ref={ref} style={style} className="z-[2147483648] pointer-events-none">
      {children}
    </div>
  );
}

import { ToonTrackerTab } from './ToonTrackerTab';

export function SidebarApp() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tracker' | 'history' | 'toons' | 'settings'>('history');
  const [favorites, setFavorites] = useState<ToonId[]>([]);
  const [blocked, setBlocked] = useState<ToonId[]>([]);
  const [historyToons, setHistoryToons] = useState<Record<ToonId, ToonData>>({});
  const [historyGroups, setHistoryGroups] = useState<Record<number, any>>({});
  const [historyGroupMembers, setHistoryGroupMembers] = useState<Record<number, any>>({});
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [navbarConfig, setNavbarConfig] = useState<{ pinned: string[]; dropdown: string[] }>({
    pinned: ['invasions', 'groups', 'fishing', 'ccg'],
    dropdown: ['field-offices', 'gardening', 'doodles'],
  });
  const [bossInfoEnabled, setBossInfoEnabled] = useState(true);
  const [notesEnabled, setNotesEnabled] = useState(true);
  const [syncNotesEnabledState, setSyncNotesEnabledState] = useState(false);
  const [syncNotesError, setSyncNotesError] = useState<string | null>(null);
  const [syncNotesChoiceDialog, setSyncNotesChoiceDialog] = useState<SyncNotesChoiceDialogState | null>(null);
  const [highlightGroupsEnabled, setHighlightGroupsEnabled] = useState(false);
  const [sidebarOnLeft, setSidebarOnLeft] = useState(false);
  const [trackerEnabled, setTrackerEnabled] = useState<boolean | undefined>(undefined);
  const [rewardNotificationsEnabled, setRewardNotificationsEnabled] = useState(false);
  const [rewardNotificationError, setRewardNotificationError] = useState<string | null>(null);
  const [activeToonIds, setActiveToonIds] = useState<ToonId[]>([]);
  const [justAddedId, setJustAddedId] = useState<ToonId | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [resetSettingsDialog, setResetSettingsDialog] = useState<ResetSettingsDialogState | null>(null);
  const [transferDialog, setTransferDialog] = useState<TransferDialogState | null>(null);
  const [openImportMenu, setOpenImportMenu] = useState<'mode' | 'conflicts' | null>(null);
  const [importAnalysisKind, setImportAnalysisKind] = useState<ImportComparisonKind | null>(null);
  const [dialogNote, setDialogNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [toonyCollapsed, setToonyCollapsed] = useState(false);
  const [stinkyCollapsed, setStinkyCollapsed] = useState(false);
  const [neutralCollapsed, setNeutralCollapsed] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const pageSize = 10;
  const [isAnimatingCollapse, setIsAnimatingCollapse] = useState(false);
  const collapseTimeoutRef = React.useRef<NodeJS.Timeout | number | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const importAnalysisRequestIdRef = useRef(0);
  const lastAutoAnalyzedImportTextRef = useRef('');

  const startCollapseAnimation = () => {
    setIsAnimatingCollapse(true);
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current as number);
    collapseTimeoutRef.current = setTimeout(() => setIsAnimatingCollapse(false), 300);
  };
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ToonData[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);

  // Debounce search term
  useEffect(() => {
    if (searchTerm.length < 2) {
      setDebouncedSearchTerm('');
      setIsSearching(false);
      setSearchPage(1);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setSearchPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle paginated search fetching
  useEffect(() => {
    if (!debouncedSearchTerm) {
      setSearchResults([]);
      setSearchTotal(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchToons(debouncedSearchTerm, searchPage, pageSize).then(({ results, total }) => {
      setSearchResults(results as ToonData[]);
      setSearchTotal(total);
      setIsSearching(false);
    }).catch(err => {
      console.error('Search failed:', err);
      setIsSearching(false);
    });
  }, [debouncedSearchTerm, searchPage]);


  // Tooltip tracking state
  const [hoveredToonId, setHoveredToonId] = useState<string | null>(null);
  const [hoveredToonName, setHoveredToonName] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<'sidebar' | 'main' | null>(null);
  const [hoveredRect, setHoveredRect] = useState<{ top: number; left: number; height: number } | null>(null);

  const [selectedToonId, setSelectedToonId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ favorites: f, blocked: b }, groups, groupMembers, allNotes, ids] = await Promise.all([
      loadLists(),
      getAllGroups(),
      getAllGroupMembers(),
      getAllNotes(),
      getSetting<string[]>('active-toon-ids'),
    ]);

    setFavorites(f);
    setBlocked(b);
    setNotes(allNotes);
    if (ids) setActiveToonIds(ids);

    // Selective loading: Load only toons that are actually visible in UI sections
    const visibleIds = new Set<string>([...f, ...b, ...Object.keys(allNotes), ...(ids || [])]);
    groupMembers.forEach(m => visibleIds.add(String(m.toonId)));

    const toonsArr = await getToons(Array.from(visibleIds));

    const toonsMap: Record<ToonId, ToonData> = {};
    for (const t of toonsArr) toonsMap[t.id] = t;
    setHistoryToons(toonsMap);

    const groupsMap: Record<number, any> = {};
    for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
    setHistoryGroups(groupsMap);

    const historyGroupMembersMap: Record<number, any> = {};
    groupMembers.forEach((m) => {
      if (historyGroupMembersMap[m.groupId]) {
        historyGroupMembersMap[m.groupId].toons.push({ toonId: m.toonId, left: m.left });
      } else {
        historyGroupMembersMap[m.groupId] = { toons: [{ toonId: m.toonId, left: m.left }] };
      }
    });
    setHistoryGroupMembers(historyGroupMembersMap);
  }, []);

  const handleOpenResetSettings = useCallback(() => {
    setResetSettingsDialog({
      isOpen: true,
      isBusy: false,
      selections: {
        history: false,
        savedToons: false,
        navigation: false,
      },
    });
  }, []);

  const enableSyncNotesWithThisDevice = useCallback(async () => {
    const payload = await createLocalSyncNotesPayload();
    await writeSyncNotesPayload(payload, { allowRemoteOverwrite: true });
    await setSyncNotesEnabled(true);
    setSyncNotesEnabledState(true);
    setSyncNotesChoiceDialog(null);
    setSyncNotesError(null);
  }, []);

  const handleToggleSyncNotes = useCallback(async () => {
    const next = !syncNotesEnabledState;
    setSyncNotesError(null);

    if (!next) {
      setSyncNotesEnabledState(false);
      await setSyncNotesEnabled(false);
      return;
    }

    try {
      const payload = await readSyncNotesPayload();
      if (payload) {
        const localSnapshot = await exportSavedToonData();
        setSyncNotesChoiceDialog({ payload, localSnapshot, isBusy: false });
      } else {
        await enableSyncNotesWithThisDevice();
      }
    } catch (error) {
      setSyncNotesEnabledState(false);
      setSyncNotesError(error instanceof Error ? error.message : String(error));
    }
  }, [enableSyncNotesWithThisDevice, syncNotesEnabledState]);

  const handleUseSyncedNotesData = useCallback(async () => {
    const payload = syncNotesChoiceDialog?.payload;
    if (!payload) return;
    setSyncNotesChoiceDialog((current) => current ? { ...current, isBusy: true, error: undefined } : current);
    try {
      await importSyncNotesPayload(payload);
      await setSyncNotesEnabled(true);
      setSyncNotesEnabledState(true);
      setSyncNotesChoiceDialog(null);
      setSyncNotesError(null);
      await refresh();
    } catch (error) {
      setSyncNotesChoiceDialog((current) => current
        ? { ...current, isBusy: false, error: error instanceof Error ? error.message : String(error) }
        : current);
    }
  }, [refresh, syncNotesChoiceDialog]);

  const handleUseLocalNotesData = useCallback(async () => {
    setSyncNotesChoiceDialog((current) => current ? { ...current, isBusy: true, error: undefined } : current);
    try {
      await enableSyncNotesWithThisDevice();
    } catch (error) {
      setSyncNotesChoiceDialog((current) => current
        ? { ...current, isBusy: false, error: error instanceof Error ? error.message : String(error) }
        : current);
    }
  }, [enableSyncNotesWithThisDevice]);

  const buildExportDialog = useCallback((includeFullToonCache: boolean) => {
    setTransferDialog({
      mode: 'export',
      text: '',
      isBusy: true,
      includeFullToonCache,
      message: 'Building compressed backup...',
    });

    exportAllData(includeFullToonCache).then((result) => {
      setTransferDialog({
        mode: 'export',
        text: result.json,
        isBusy: false,
        includeFullToonCache,
        fileName: result.fileName,
        totalBytes: result.totalBytes,
        rawBytes: result.rawBytes,
        message: 'Backup ready to copy or download.',
      });
    }).catch((error) => {
      setTransferDialog({
        mode: 'export',
        text: '',
        isBusy: false,
        includeFullToonCache,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);

  const handleOpenExport = useCallback(() => {
    buildExportDialog(false);
  }, [buildExportDialog]);

  const handleOpenImport = useCallback(() => {
    setTransferDialog({
      mode: 'import',
      text: '',
      isBusy: false,
      importMode: 'merge',
      conflictPolicy: 'keep-local',
    });
    setImportAnalysisKind(null);
    setOpenImportMenu(null);
  }, []);

  const setImportMode = useCallback((importMode: ImportMode) => {
    setTransferDialog((current) => current && current.mode === 'import'
      ? { ...current, importMode }
      : current);
    setOpenImportMenu(null);
  }, []);

  const setImportConflictPolicy = useCallback((conflictPolicy: ImportConflictPolicy) => {
    setTransferDialog((current) => current && current.mode === 'import'
      ? { ...current, conflictPolicy }
      : current);
    setOpenImportMenu(null);
  }, []);

  const analyzeImportText = useCallback(async (text: string, fileName?: string) => {
    if (!text.trim()) {
      importAnalysisRequestIdRef.current += 1;
      setTransferDialog((current) => current && current.mode === 'import'
        ? { ...current, error: 'Paste backup data or upload a backup file first.' }
        : current);
      return;
    }

    const requestId = importAnalysisRequestIdRef.current + 1;
    importAnalysisRequestIdRef.current = requestId;
    lastAutoAnalyzedImportTextRef.current = text;
    setTransferDialog((current) => current && current.mode === 'import'
      ? {
        ...current,
        text,
        fileName: fileName ?? current.fileName,
        isBusy: true,
        error: undefined,
        message: 'Analyzing backup...',
        parsedSnapshot: undefined,
        importPlan: undefined,
      }
      : current);
    setImportAnalysisKind(null);

    try {
      const snapshot = await parseTransferDocument(text);
      const plan = await buildImportPlan(snapshot);
      if (importAnalysisRequestIdRef.current !== requestId) return;
      setTransferDialog((current) => current && current.mode === 'import' && current.text === text
        ? {
          ...current,
          text,
          fileName: fileName ?? current.fileName,
          isBusy: false,
          parsedSnapshot: snapshot,
          importPlan: plan,
          message: 'Backup analyzed. Review the import options below.',
          error: undefined,
        }
        : current);
    } catch (error) {
      if (importAnalysisRequestIdRef.current !== requestId) return;
      setTransferDialog((current) => current && current.mode === 'import' && current.text === text
        ? {
          ...current,
          text,
          fileName: fileName ?? current.fileName,
          isBusy: false,
          parsedSnapshot: undefined,
          importPlan: undefined,
          message: undefined,
          error: error instanceof Error ? error.message : String(error),
        }
        : current);
    }
  }, []);

  useEffect(() => {
    if (!transferDialog || transferDialog.mode !== 'import') return;

    const text = transferDialog.text;
    if (!text.trim()) {
      lastAutoAnalyzedImportTextRef.current = '';
      return;
    }
    if (lastAutoAnalyzedImportTextRef.current === text) return;

    const timer = setTimeout(() => {
      lastAutoAnalyzedImportTextRef.current = text;
      analyzeImportText(text, transferDialog.fileName);
    }, 600);

    return () => clearTimeout(timer);
  }, [transferDialog?.mode, transferDialog?.text, transferDialog?.fileName, analyzeImportText]);

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await analyzeImportText(text, file.name);
    event.target.value = '';
  }, [analyzeImportText]);

  const handleCopyExport = useCallback(async () => {
    if (!transferDialog?.text) return;
    await navigator.clipboard.writeText(transferDialog.text);
    setTransferDialog((current) => current && current.mode === 'export'
      ? { ...current, message: 'Backup copied to clipboard.', error: undefined }
      : current);
  }, [transferDialog]);

  const handleDownloadExport = useCallback(() => {
    if (!transferDialog?.text) return;
    const blob = new Blob([transferDialog.text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = transferDialog.fileName || formatTransferFilename();
    anchor.click();
    URL.revokeObjectURL(url);
    setTransferDialog((current) => current && current.mode === 'export'
      ? { ...current, message: 'Backup downloaded.', error: undefined }
      : current);
  }, [transferDialog]);

  const handleToggleFullExport = useCallback((includeFullToonCache: boolean) => {
    buildExportDialog(includeFullToonCache);
  }, [buildExportDialog]);

  const handleConfirmResetSettings = useCallback(async () => {
    if (!resetSettingsDialog) return;

    const { history, savedToons, navigation } = resetSettingsDialog.selections;
    if (!history && !savedToons && !navigation) {
      setResetSettingsDialog((current) => current
        ? { ...current, error: 'Select at least one item to reset.' }
        : current);
      return;
    }

    setResetSettingsDialog((current) => current
      ? { ...current, isBusy: true, error: undefined, message: 'Resetting selected settings...' }
      : current);

    try {
      if (history) {
        await clearAllGroups();
        setHistoryGroups({});
        setHistoryGroupMembers({});
        setSelectedHistoryGroup(null);
      }

      if (savedToons) {
        await mutateSavedToonsWithSyncRollback(async () => {
          await Promise.all([
            clearList('toony_toons'),
            clearList('stinky_toons'),
            clearNotes(),
          ]);
        });
        setFavorites([]);
        setBlocked([]);
        setNotes({});
      }

      if (navigation) {
        const defaultConfig = {
          pinned: ['invasions', 'groups', 'fishing', 'ccg'],
          dropdown: ['field-offices', 'gardening', 'doodles']
        };
        await setSetting('navbar-config', defaultConfig);
        setNavbarConfig(defaultConfig);
      }

      await refresh();
      setResetSettingsDialog((current) => current
        ? { ...current, isBusy: true, message: 'Delete complete. Reloading ToonHQ...', error: undefined }
        : current);
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setResetSettingsDialog((current) => current
        ? {
          ...current,
          isBusy: false,
          error: error instanceof Error ? error.message : String(error),
        }
        : current);
    }
  }, [resetSettingsDialog, refresh]);

  const hasSelectedResetSetting = !!resetSettingsDialog && Object.values(resetSettingsDialog.selections).some(Boolean);
  const groupHistoryDeleteCount = Object.keys(historyGroups).length;
  const savedToonsDeleteCount = favorites.length + blocked.length + Object.keys(notes).length;

  const handleConfirmImport = useCallback(async () => {
    if (!transferDialog?.text.trim()) {
      setTransferDialog((current) => current && current.mode === 'import'
        ? { ...current, error: 'Paste backup data or upload a backup file first.' }
        : current);
      return;
    }

    let parsedSnapshot = transferDialog.parsedSnapshot;
    if (!parsedSnapshot) {
      try {
        parsedSnapshot = await parseTransferDocument(transferDialog.text);
      } catch (error) {
        setTransferDialog((current) => current && current.mode === 'import'
          ? {
            ...current,
            isBusy: false,
            error: error instanceof Error ? error.message : String(error),
          }
          : current);
        return;
      }
    }

    const importMode = transferDialog.importMode ?? 'merge';
    const conflictPolicy = transferDialog.conflictPolicy ?? 'keep-local';

    setTransferDialog((current) => current && current.mode === 'import'
      ? {
        ...current,
        isBusy: true,
        error: undefined,
        message: importMode === 'replace'
          ? 'Importing backup and replacing existing data...'
          : 'Merging backup into existing data...',
      }
      : current);

    try {
      await importAllData(transferDialog.text, {
        mode: importMode,
        conflictPolicy,
        parsedSnapshot,
      });
      setTransferDialog((current) => current && current.mode === 'import'
        ? { ...current, isBusy: true, message: 'Import complete. Reloading ToonHQ...', error: undefined }
        : current);
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setTransferDialog((current) => current && current.mode === 'import'
        ? {
          ...current,
          isBusy: false,
          error: error instanceof Error ? error.message : String(error),
        }
        : current);
    }
  }, [transferDialog]);

  const handleDeleteGroup = useCallback((e: React.MouseEvent, groupId: number) => {
    e.stopPropagation();
    setDialog({ isOpen: true, type: 'delete_group', groupId, source: 'sidebar' });
  }, []);

  const handleRequestDialog = useCallback(
    (type: 'add' | 'move' | 'remove', listKey: any, toon: ToonData, source: 'sidebar' | 'main') => {
      const isFavorited = favorites.includes(toon.id);
      const isBlocked = blocked.includes(toon.id);
      const otherListName = listKey === STORAGE_KEYS.FAVORITES ? 'Stinky Toons' : 'Toony Toons';

      let actualType = type;
      if (type === 'add') {
        if ((listKey === STORAGE_KEYS.FAVORITES && isBlocked) || (listKey === STORAGE_KEYS.BLOCKED && isFavorited)) {
          actualType = 'move';
        }
      }

      setDialog({
        isOpen: true,
        type: actualType,
        listKey,
        toon,
        source,
        otherListName,
      });
      setDialogNote(notes[String(toon.id)] || '');

      if (source === 'main') {
        setOpen(true);
        setActiveTab('toons');
        setSetting('sidebar-open', true).catch(console.error);
        setSetting('active-tab', 'toons').catch(console.error);
      } else if (!open) {
        setOpen(true);
        setSetting('sidebar-open', true).catch(console.error);
      }
    },
    [favorites, blocked, open, notes]
  );

  useEffect(() => {
    const handleHover = (e: Event) => {
      const customEvent = e as CustomEvent;
      setHoveredToonId(customEvent.detail?.id?.toString() || null);
      setHoveredToonName(customEvent.detail?.name || null);
      setHoverSource(customEvent.detail?.source || 'main');
      if (customEvent.detail?.rect) {
        setHoveredRect(customEvent.detail.rect);
      }
    };
    const handleUnhover = () => {
      setHoveredToonId(null);
      setHoveredToonName(null);
      setHoverSource(null);
    };

    window.addEventListener('toonhq-plus-toon-hover', handleHover);
    window.addEventListener('toonhq-plus-toon-unhover', handleUnhover);

    const handleRemoteRequest = (e: Event) => {
      const { type, listKey, toon, source } = (e as CustomEvent).detail;
      handleRequestDialog(type, listKey, toon, source || 'main');
    };
    window.addEventListener('toonhqplus-request-dialog', handleRemoteRequest);

    return () => {
      window.removeEventListener('toonhq-plus-toon-hover', handleHover);
      window.removeEventListener('toonhq-plus-toon-unhover', handleUnhover);
      window.removeEventListener('toonhqplus-request-dialog', handleRemoteRequest);
    };
  }, [handleRequestDialog]);


  useEffect(() => {
    initSyncNotesRemoteListener(refresh);
    refresh();
    getSettings(['sidebar-open', 'active-tab', 'boss-info-enabled', 'notes-enabled', 'sync-notes-enabled', 'highlight-groups', 'toony-collapsed', 'stinky-collapsed', 'neutral-collapsed', 'tracker-enabled', 'sidebar-on-left', 'reward-notifications-enabled']).then(values => {
      if (values['sidebar-open'] !== undefined) setOpen(!!values['sidebar-open']);
      if (values['active-tab'] !== undefined) setActiveTab(values['active-tab']);
      if (values['boss-info-enabled'] !== undefined) setBossInfoEnabled(!!values['boss-info-enabled']);
      if (values['notes-enabled'] !== undefined) setNotesEnabled(!!values['notes-enabled']);
      if (values['sync-notes-enabled'] !== undefined) setSyncNotesEnabledState(values['sync-notes-enabled'] === true);
      if (values['highlight-groups'] !== undefined) setHighlightGroupsEnabled(!!values['highlight-groups']);
      if (values['sidebar-on-left'] !== undefined) setSidebarOnLeft(!!values['sidebar-on-left']);
      if (values['tracker-enabled'] !== undefined) setTrackerEnabled(!!values['tracker-enabled']);
      Promise.all([
        browser.storage.local.get('reward-notifications-enabled'),
        browser.runtime.sendMessage({ type: 'GET_REWARD_NOTIFICATION_PERMISSION' }),
      ]).then(([stored, permission]: any[]) => {
        if (permission?.ok === false) throw new Error(permission.error || 'Could not check notification permission.');
        const storedValue = stored['reward-notifications-enabled'];
        const enabled = storedValue === true || (storedValue === undefined && values['reward-notifications-enabled'] === true);
        if (storedValue === undefined && values['reward-notifications-enabled'] === true) {
          browser.storage.local.set({ 'reward-notifications-enabled': true }).catch(console.error);
        }
        setRewardNotificationsEnabled(enabled && permission?.granted === true);
      }).catch(console.error);

      let initialTab = values['active-tab'];
      if (initialTab === 'tracker' && values['tracker-enabled'] === false) {
        initialTab = 'history';
      }
      if (initialTab !== undefined) setActiveTab(initialTab);

      if (values['toony-collapsed'] !== undefined) setToonyCollapsed(!!values['toony-collapsed']);
      if (values['stinky-collapsed'] !== undefined) setStinkyCollapsed(!!values['stinky-collapsed']);
      if (values['neutral-collapsed'] !== undefined) setNeutralCollapsed(!!values['neutral-collapsed']);
      setHasLoadedSettings(true);

      // Sync from background script as source of truth for tracker-enabled
      browser.runtime.sendMessage({ type: 'GET_TRACKER_PREF' }).then((res: any) => {
        if (res && res.enabled !== undefined) {
          setTrackerEnabled(res.enabled);
          setSetting('tracker-enabled', res.enabled).catch(console.error);
        }
      }).catch(console.error);
    });

    const handleDbChange = (e: Event) => {
      const { store } = (e as CustomEvent).detail || {};
      if (store === 'toony_toons' || store === 'stinky_toons') {
        loadLists().then(({ favorites: f, blocked: b }) => { setFavorites(f); setBlocked(b); });
      }
      if (store === 'groups') {
        getAllGroups().then(groups => {
          const groupsMap: Record<number, any> = {};
          for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
          setHistoryGroups(groupsMap);
        });
        getAllGroupMembers().then(groupMembers => {
          const historyGroupMembersMap: Record<number, any> = {};
          groupMembers.forEach(m => {
            if (historyGroupMembersMap[m.groupId]) {
              historyGroupMembersMap[m.groupId].toons.push({ toonId: m.toonId, left: m.left });
            } else {
              historyGroupMembersMap[m.groupId] = { toons: [{ toonId: m.toonId, left: m.left }] };
            }
          });
          setHistoryGroupMembers(historyGroupMembersMap);
        });
      }
      if (store === 'toons') {
        // Only refresh history cache if the change affects currently loaded toons
        refresh();
      }
      if (store === 'notes') {
        getAllNotes().then(setNotes);
      }
      if (store === 'settings') {
        getSetting<{ pinned: string[], dropdown: string[] }>('navbar-config').then(c => { if (c) setNavbarConfig(c); });
        getSetting<boolean>('boss-info-enabled').then(v => { if (v !== undefined) setBossInfoEnabled(v !== false); });
        getSetting<boolean>('notes-enabled').then(v => { if (v !== undefined) setNotesEnabled(v !== false); });
        getSetting<boolean>('sync-notes-enabled').then(v => { if (v !== undefined) setSyncNotesEnabledState(v === true); });
        getSetting<boolean>('tracker-enabled').then(v => { if (v !== undefined) setTrackerEnabled(v !== false); });
        Promise.all([
          browser.storage.local.get('reward-notifications-enabled'),
          browser.runtime.sendMessage({ type: 'GET_REWARD_NOTIFICATION_PERMISSION' }),
      ]).then(([v, permission]: any[]) => {
        if (permission?.ok === false) throw new Error(permission.error || 'Could not check notification permission.');
        setRewardNotificationsEnabled(v['reward-notifications-enabled'] === true && permission?.granted === true);
      });
        getSetting<string>('active-tab').then(v => { if (v) setActiveTab(v as any); });
        getSetting<boolean>('sidebar-open').then(v => { if (v !== undefined) setOpen(!!v); });
        getSetting<string[]>('active-toon-ids').then(ids => { if (ids) setActiveToonIds(ids); });
        getSetting<boolean>('toony-collapsed').then(v => { if (v !== undefined) setToonyCollapsed(!!v); });
        getSetting<boolean>('stinky-collapsed').then(v => { if (v !== undefined) setStinkyCollapsed(!!v); });
        getSetting<boolean>('neutral-collapsed').then(v => { if (v !== undefined) setNeutralCollapsed(!!v); });
      }
    };

    const handleMessage = (message: any) => {
      if (message.type === 'TRACKER_PREF_CHANGED') {
        setTrackerEnabled(message.enabled);
        setSetting('tracker-enabled', message.enabled).catch(console.error);
        if (!message.enabled) {
          setActiveTab(currentTab => {
            if (currentTab === 'tracker') {
              setSetting('active-tab', 'history').catch(console.error);
              return 'history';
            }
            return currentTab;
          });
        }
      }
    };

    const handleExtensionStorageChange = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !changes['reward-notifications-enabled']) return;
      setRewardNotificationsEnabled(changes['reward-notifications-enabled'].newValue === true);
      setRewardNotificationError(null);
    };

    window.addEventListener('toonhqplus-db-changed', handleDbChange);
    browser.runtime.onMessage.addListener(handleMessage);
    browser.storage?.onChanged?.addListener(handleExtensionStorageChange);
    return () => {
      window.removeEventListener('toonhqplus-db-changed', handleDbChange);
      browser.runtime.onMessage.removeListener(handleMessage);
      browser.storage?.onChanged?.removeListener(handleExtensionStorageChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (trackerEnabled !== true) return;

    let port: ReturnType<typeof browser.runtime.connect> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let backoff = 1000;
    let handleDisconnect: (() => void) | null = null;

    function connect() {
      port = browser.runtime.connect({ name: 'toonhqplus-tracker' });

      // If the connection stays alive for 2 seconds without disconnecting, it's successful; reset backoff
      const resetBackoff = setTimeout(() => {
        backoff = 1000;
      }, 2000);

      handleDisconnect = () => {
        clearTimeout(resetBackoff);

        const err = browser.runtime.lastError;
        if (err?.message?.includes('Extension context invalidated')) {
          console.info('[ToonTracker UI] Extension updated or invalidated. Stopping tracker.');
          return; // Stop trying to reconnect, the user needs to refresh the page
        }

        // Try reconnecting with a progressively longer delay up to max 10 seconds
        reconnectTimeout = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 1.5, 10000);
      };

      port.onDisconnect.addListener(handleDisconnect);
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (port && handleDisconnect) {
        port.onDisconnect.removeListener(handleDisconnect);
        port.disconnect();
      }
    };
  }, [trackerEnabled]);

  return (
    <>
      <ShtickerBook
        selectedToonId={selectedToonId}
        onToonSelect={setSelectedToonId}
        sidebarOnLeft={sidebarOnLeft}
      />


      <div className={`fixed top-0 z-[2147483647] flex h-screen max-h-screen flex-col p-4 pointer-events-none overflow-hidden ${sidebarOnLeft ? 'left-0 items-start' : 'right-0 items-end'}`}>
        <div className="mb-2 pointer-events-auto">
          <button
            onClick={() => {
              const next = !open;
              setOpen(next);
              setSetting('sidebar-open', next).catch(console.error);
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 cursor-pointer transition-all active:scale-95"
          >
            {open ? 'Close' : 'HQ+'}
          </button>
        </div>

        {open && (
          <aside className="w-80 flex flex-col min-h-0 max-h-[90vh] rounded-lg border border-[#0a2e1d] bg-[#10462d] shadow-xl overflow-hidden pointer-events-auto shrink-0">
            <div className="flex border-b border-[#0a2e1d]/80 bg-[#0c3622]">
              {hasLoadedSettings && trackerEnabled !== false && (
                <button
                  className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'tracker' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
                  onClick={() => {
                    setActiveTab('tracker');
                    setSetting('active-tab', 'tracker').catch(console.error);
                  }}
                >
                  Tracker
                </button>
              )}
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'history' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
                onClick={() => {
                  setActiveTab('history');
                  setSelectedHistoryGroup(null);
                  setSetting('active-tab', 'history').catch(console.error);
                }}
              >
                Groups
              </button>
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'toons' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
                onClick={() => {
                  setActiveTab('toons');
                  setSetting('active-tab', 'toons').catch(console.error);
                }}
              >
                Toons
              </button>
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'settings' ? 'bg-[#10462d] text-white shadow-inner' : 'text-green-200 hover:bg-green-800/30'}`}
                onClick={() => {
                  setActiveTab('settings');
                  setSetting('active-tab', 'settings').catch(console.error);
                }}
              >
                Settings
              </button>
            </div>

            <div className="flex-1 flex flex-col min-h-0 p-3">
              {activeTab === 'tracker' && (
                <ToonTrackerTab
                  selectedToonId={selectedToonId}
                  onToonSelect={setSelectedToonId}
                />
              )}

              {activeTab === 'toons' && (
                <>
                  <div className="mb-3 shrink-0 relative">
                    <input
                      type="text"
                      placeholder="Search for a toon..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded border border-[#0a2e1d] bg-black/20 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-500/50 focus:outline-none placeholder:text-green-100/30 transition-all"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-green-100/30 hover:text-white transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                      </button>
                    )}
                  </div>

                  {searchTerm ? (
                    <section className="flex-1 flex flex-col min-h-0">
                      <h3 className="mb-1 shrink-0 text-[10px] font-bold uppercase tracking-widest text-green-200/50 px-1">Search Results</h3>
                      <ul className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                        {searchTerm.length < 2 ? (
                          <div className="py-6 text-center text-green-200/40 italic text-xs">Enter at least 2 characters to search...</div>
                        ) : isSearching ? (
                          <div className="py-8 text-center text-green-200/40 italic">Searching...</div>
                        ) : searchResults.length === 0 ? (
                          <div className="py-8 text-center text-green-200/40 italic">No toons found matching "{searchTerm}"</div>
                        ) : (
                          searchResults.map((toon) => {
                            const isHovered = hoveredToonId
                              ? String(toon.id) === hoveredToonId
                              : (hoveredToonName && toon.name === hoveredToonName);
                            return (
                              <ToonRow
                                key={toon.id}
                                toon={toon}
                                isFavorited={favorites.includes(toon.id)}
                                isBlocked={blocked.includes(toon.id)}
                                isOwnToon={activeToonIds.includes(toon.id)}
                                note={notes[String(toon.id)]}
                                refresh={refresh}
                                isHovered={!!isHovered}
                                isJustAdded={justAddedId === toon.id}
                                onRequestDialog={handleRequestDialog}
                                onMouseEnter={(e) => {
                                  setHoveredToonId(String(toon.id));
                                  setHoveredToonName(toon.name);
                                  setHoverSource('sidebar');
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredRect({ top: rect.top, left: rect.left, height: rect.height });
                                }}
                                onMouseLeave={() => {
                                  setHoveredToonId(null);
                                  setHoveredToonName(null);
                                  setHoverSource(null);
                                  setHoveredRect(null);
                                }}
                              />
                            );
                          })
                        )}
                      </ul>

                      {searchTotal > pageSize && (
                        <div className="mt-2 flex items-center justify-between px-2 py-1.5 bg-black/20 rounded border border-white/5 mx-2 mb-2">
                          <button
                            onClick={() => setSearchPage((p) => Math.max(1, p - 1))}
                            disabled={searchPage === 1}
                            className="p-1 rounded text-green-200 hover:bg-emerald-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                            title="Previous page"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                          </button>
                          <span className="text-[10px] font-bold text-green-200/50 uppercase tracking-widest tabular-nums">
                            Page {searchPage} of {Math.ceil(searchTotal / pageSize)}
                          </span>
                          <button
                            onClick={() => setSearchPage((p) => Math.min(Math.ceil(searchTotal / pageSize), p + 1))}
                            disabled={searchPage >= Math.ceil(searchTotal / pageSize)}
                            className="p-1 rounded text-green-200 hover:bg-emerald-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                            title="Next page"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                          </button>
                        </div>
                      )}
                    </section>
                  ) : (
                    <>
                      {favorites.length === 0 && blocked.length === 0 && Object.keys(notes).length === 0 ? (
                        <div className="py-8 text-center text-green-200/40 italic">No saved toons yet.</div>
                      ) : (
                        <div className="flex-1 flex flex-col min-h-0 gap-2">
                          {(() => {
                            const toonyToons = [...new Set(favorites)].filter(id => historyToons[id]).sort((a, b) => historyToons[a].name.localeCompare(historyToons[b].name));
                            const stinkyToons = [...new Set(blocked)].filter(id => historyToons[id]).sort((a, b) => historyToons[a].name.localeCompare(historyToons[b].name));
                            const neutralToons = [...new Set(Object.keys(notes))].filter(id => !favorites.includes(id) && !blocked.includes(id) && historyToons[id]).sort((a, b) => historyToons[a].name.localeCompare(historyToons[b].name));
                            const getSectionClass = (collapsed: boolean) =>
                              `transition-all duration-300 ease-in-out flex flex-col min-h-2 ${collapsed ? 'flex-[0_0_auto]' : 'flex-[1_1_0%]'}`;
                            const sectionStyle = (collapsed: boolean): React.CSSProperties | undefined =>
                              collapsed ? undefined : { maxHeight: 'max-content' };
                            const getSectionBodyClass = (collapsed: boolean) =>
                              `transition-all duration-300 ease-in-out flex flex-col min-h-0 overflow-hidden ${collapsed ? 'opacity-0 flex-[0_0_0px] mb-0' : 'opacity-100 flex-1 mb-1'}`;

                            const renderToonRow = (id: string) => {
                              const toon = historyToons[id];
                              if (!toon) return null;
                              const isHovered = hoveredToonId
                                ? String(toon.id) === hoveredToonId
                                : (hoveredToonName && toon.name === hoveredToonName);
                              return (
                                <ToonRow
                                  key={toon.id}
                                  toon={toon}
                                  isFavorited={favorites.includes(toon.id)}
                                  isBlocked={blocked.includes(toon.id)}
                                  isOwnToon={activeToonIds.includes(toon.id)}
                                  note={notes[String(toon.id)]}
                                  refresh={refresh}
                                  isHovered={!!isHovered}
                                  isJustAdded={justAddedId === toon.id}
                                  onRequestDialog={handleRequestDialog}
                                  onMouseEnter={(e) => {
                                    setHoveredToonId(String(toon.id));
                                    setHoveredToonName(toon.name);
                                    setHoverSource('sidebar');
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredRect({ top: rect.top, left: rect.left, height: rect.height });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredToonId(null);
                                    setHoveredToonName(null);
                                    setHoverSource(null);
                                    setHoveredRect(null);
                                  }}
                                />
                              );
                            };

                            return (
                              <>
                                {toonyToons.length > 0 && (
                                  <section className={getSectionClass(toonyCollapsed)} style={sectionStyle(toonyCollapsed)}>
                                    <button
                                      onClick={() => {
                                        startCollapseAnimation();
                                        const next = !toonyCollapsed;
                                        setToonyCollapsed(next);
                                        setSetting('toony-collapsed', next).catch(console.error);
                                      }}
                                      className="mb-1 ml-2 shrink-0 flex items-center justify-between text-sm font-medium text-green-50 hover:text-white cursor-pointer transition-colors outline-none pb-0.5"
                                    >
                                      <span>Toony Toons</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${toonyCollapsed ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                    <div className={getSectionBodyClass(toonyCollapsed)}>
                                      <ul className={`flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0 border border-white/5 rounded-lg bg-black/10 transition-colors ${isAnimatingCollapse ? 'pointer-events-none' : ''}`}>
                                        {toonyToons.map(renderToonRow)}
                                      </ul>
                                    </div>
                                  </section>
                                )}
                                {stinkyToons.length > 0 && (
                                  <section className={getSectionClass(stinkyCollapsed)} style={sectionStyle(stinkyCollapsed)}>
                                    <button
                                      onClick={() => {
                                        startCollapseAnimation();
                                        const next = !stinkyCollapsed;
                                        setStinkyCollapsed(next);
                                        setSetting('stinky-collapsed', next).catch(console.error);
                                      }}
                                      className="mb-1 ml-2 shrink-0 flex items-center justify-between text-sm font-medium text-green-50 hover:text-white cursor-pointer transition-colors outline-none pb-0.5"
                                    >
                                      <span>Stinky Toons</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${stinkyCollapsed ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                    <div className={getSectionBodyClass(stinkyCollapsed)}>
                                      <ul className={`flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0 border border-white/5 rounded-lg bg-black/10 transition-colors ${isAnimatingCollapse ? 'pointer-events-none' : ''}`}>
                                        {stinkyToons.map(renderToonRow)}
                                      </ul>
                                    </div>
                                  </section>
                                )}
                                {neutralToons.length > 0 && (
                                  <section className={getSectionClass(neutralCollapsed)} style={sectionStyle(neutralCollapsed)}>
                                    <button
                                      onClick={() => {
                                        startCollapseAnimation();
                                        const next = !neutralCollapsed;
                                        setNeutralCollapsed(next);
                                        setSetting('neutral-collapsed', next).catch(console.error);
                                      }}
                                      className="mb-1 ml-2 shrink-0 flex items-center justify-between text-sm font-medium text-green-50 hover:text-white cursor-pointer transition-colors outline-none pb-0.5"
                                    >
                                      <span>Notes</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${neutralCollapsed ? '-rotate-90' : 'rotate-0'}`}><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                    <div className={getSectionBodyClass(neutralCollapsed)}>
                                      <ul className={`flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0 border border-white/5 rounded-lg bg-black/10 transition-colors ${isAnimatingCollapse ? 'pointer-events-none' : ''}`}>
                                        {neutralToons.map(renderToonRow)}
                                      </ul>
                                    </div>
                                  </section>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {activeTab === 'history' && (
                <section className="flex-1 flex flex-col min-h-0">
                  <QuickTeleport />
                  {selectedHistoryGroup === null ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="mb-2 ml-2 shrink-0 flex items-center justify-between">
                        <h3 className="text-sm font-medium text-green-50">Recent Groups</h3>
                      </div>
                      <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar p-1.5 min-h-0">
                        {Object.values(historyGroups).length === 0 ? (
                          <div className="py-2 text-sm text-green-100/70 text-center">No history yet.</div>
                        ) : (
                          Object.values(historyGroups)
                            .sort((a: any, b: any) => {
                              const timeA = new Date(a.userJoinedAt || a.created).getTime();
                              const timeB = new Date(b.userJoinedAt || b.created).getTime();
                              return timeB - timeA;
                            })
                            .slice(0, 20)
                            .map((group: any) => {
                              const groupName = getGroupSimpleName(group.type, group.id, group.options);
                              const groupMembers = historyGroupMembers[group.id];
                              return (
                                <div
                                  key={group.id}
                                  className="group relative"
                                  style={{ viewTransitionName: `group-card-${group.id}` } as React.CSSProperties}
                                >
                                  <button
                                    onClick={() => {
                                      if ((document as any).startViewTransition) {
                                        (document as any).startViewTransition(() => {
                                          setSelectedHistoryGroup(group.id);
                                        });
                                      } else {
                                        setSelectedHistoryGroup(group.id);
                                      }
                                    }}
                                    className="w-full text-left rounded border border-black/50 bg-black/40 hover:bg-black/60 p-3 shadow-sm transition-colors flex justify-between items-center cursor-pointer"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span
                                        className="block text-sm font-bold text-white truncate"
                                        style={{ viewTransitionName: `group-title-${group.id}` } as React.CSSProperties}
                                      >
                                        {groupName}
                                      </span>
                                      <span className="block text-xs text-green-200 mt-1">
                                        <RelativeTime date={group.userJoinedAt || group.created} />
                                      </span>
                                    </div>
                                    <div className="text-sm font-medium text-emerald-300 shrink-0">
                                      {groupMembers?.toons?.length} toon{groupMembers?.toons?.length === 1 ? '' : 's'}
                                    </div>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteGroup(e, group.id)}
                                    className="absolute -right-1 -top-1 p-1 bg-[#10462d] border border-red-500/30 text-red-400 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full hover:bg-red-500 hover:text-white hover:border-red-500 z-10 cursor-pointer"
                                    title="Delete from history"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                  </button>
                                </div>
                              );
                            })
                        )}
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const group = historyGroups[selectedHistoryGroup!];
                      if (!group) return null;
                      const toons = historyGroupMembers[group.id]?.toons || [];

                      const activeMemberIds: ToonId[] = [];
                      const otherActiveIds: ToonId[] = [];
                      const leftMemberIds: ToonId[] = [];

                      toons.forEach((toon: { toonId: ToonId, left: boolean }) => {
                        if (toon.left) {
                          leftMemberIds.push(toon.toonId);
                        } else if (activeToonIds.includes(toon.toonId)) {
                          activeMemberIds.push(toon.toonId);
                        } else {
                          otherActiveIds.push(toon.toonId);
                        }
                      });

                      const activeToRender = [...activeMemberIds, ...otherActiveIds];

                      const renderRows = (targetIds: ToonId[]) =>
                        targetIds.map((id: ToonId) => {
                          const toonData = historyToons[id];
                          if (!toonData) return null;
                          const isHovered = hoveredToonId
                            ? String(toonData.id) === hoveredToonId
                            : (hoveredToonName && toonData.name === hoveredToonName);
                          return (
                            <ToonRow
                              key={toonData.id}
                              toon={toonData}
                              isFavorited={favorites.includes(toonData.id)}
                              isBlocked={blocked.includes(toonData.id)}
                              isOwnToon={activeToonIds.includes(toonData.id)}
                              note={notes[String(toonData.id)]}
                              refresh={refresh}
                              isHovered={!!isHovered}
                              isJustAdded={justAddedId === toonData.id}
                              onRequestDialog={handleRequestDialog}
                              onMouseEnter={(e: React.MouseEvent) => {
                                setHoveredToonId(String(toonData.id));
                                setHoveredToonName(toonData.name);
                                setHoverSource('sidebar');
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setHoveredRect({ top: rect.top, left: rect.left, height: rect.height });
                              }}
                              onMouseLeave={() => {
                                setHoveredToonId(null);
                                setHoveredToonName(null);
                                setHoverSource(null);
                                setHoveredRect(null);
                              }}
                            />
                          );
                        });

                      return (
                        <div className="flex-1 flex flex-col min-h-0">
                          <div className="flex items-center gap-2 mb-3 shrink-0">
                            <button
                              onClick={() => {
                                if ((document as any).startViewTransition) {
                                  (document as any).startViewTransition(() => {
                                    setSelectedHistoryGroup(null);
                                  });
                                } else {
                                  setSelectedHistoryGroup(null);
                                }
                              }}
                              className="rounded bg-black/30 hover:bg-black/50 px-2 py-1 text-xs text-white cursor-pointer"
                            >
                              ← Back
                            </button>
                            <div className="flex-1 min-w-0">
                              <h3
                                className="text-sm font-bold text-green-50 break-words leading-tight"
                                style={{ viewTransitionName: `group-title-${group.id}` } as React.CSSProperties}
                              >
                                {getGroupDisplayName(group.type, group.id, group.options)}
                              </h3>
                              <div className="text-[10px] text-green-200/50 mt-0.5 flex items-center gap-1.5">
                                <RelativeTime date={group.userJoinedAt || group.created} />
                                <span className="opacity-30">•</span>
                                <span>
                                  {`${new Date(group.userJoinedAt || group.created).toDateString()} ${new Date(group.userJoinedAt || group.created).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                                </span>
                              </div>
                            </div>
                          </div>
                          <ul className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto custom-scrollbar min-h-0">
                            {activeToRender.length > 0 && (
                              <>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-green-200/50 px-1 py-1 mt-1">Group Members</div>
                                {renderRows(activeToRender)}
                              </>
                            )}
                            {leftMemberIds.length > 0 && (
                              <>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-green-200/50 px-1 py-1 mt-2 opacity-50">Toons that left</div>
                                <div className="opacity-60">{renderRows(leftMemberIds)}</div>
                              </>
                            )}
                          </ul>
                        </div>
                      );
                    })()
                  )}
                </section>
              )}

              {activeTab === 'settings' && (
                <section className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 flex flex-col gap-3 p-1 overflow-y-auto custom-scrollbar min-h-0">
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-green-300/80">Customization</h4>
                      <NavbarSettings
                        config={navbarConfig}
                        onUpdate={(newConfig) => {
                          setNavbarConfig(newConfig);
                          setSetting('navbar-config', newConfig).catch(console.error);
                        }}
                      />

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Show Group Tiers</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Shows Fires for CEOs, Lawyers for CJs, and estimated Merits, Cogbucks, Jury Notices, and Stock Options from facilities.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !bossInfoEnabled;
                            setBossInfoEnabled(next);
                            setSetting('boss-info-enabled', next).catch(console.error);
                            window.location.replace(window.location.href);
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${bossInfoEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${bossInfoEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Show Toon Notes</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Shows notes for saved Toony and Stinky Toons directly in the group members list.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !notesEnabled;
                            setNotesEnabled(next);
                            setSetting('notes-enabled', next).catch(console.error);
                            window.location.replace(window.location.href);
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${notesEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${notesEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Sync Notes</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            {getSyncNotesDescription()}
                          </div>
                          {syncNotesError && (
                            <div className="mt-1 text-[10px] font-semibold text-red-300">{syncNotesError}</div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            handleToggleSyncNotes().catch((error) => {
                              setSyncNotesEnabledState(false);
                              setSyncNotesError(error instanceof Error ? error.message : String(error));
                            });
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${syncNotesEnabledState ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${syncNotesEnabledState ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Highlight Groups</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Highlight groups that have toony or stinky toons on the main page.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !highlightGroupsEnabled;
                            setHighlightGroupsEnabled(next);
                            setSetting('highlight-groups', next).catch(console.error);
                            window.location.replace(window.location.href);
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${highlightGroupsEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${highlightGroupsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Sidebar on Left</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Move the sidebar to the left side of the screen, with the Shticker Book on the right.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !sidebarOnLeft;
                            setSidebarOnLeft(next);
                            setSetting('sidebar-on-left', next).catch(console.error);
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${sidebarOnLeft ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${sidebarOnLeft ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">Toon Tracker Integration</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Connect directly to your Toontown Rewritten game to track your toon stats.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = !(trackerEnabled !== false);
                            setTrackerEnabled(next);
                            setSetting('tracker-enabled', next).catch(console.error);
                            // Notify background script about the change
                            browser.runtime.sendMessage({ type: 'TRACKER_PREF_CHANGED', enabled: next });
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${trackerEnabled !== false ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${trackerEnabled !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-black/20 p-2.5 border border-white/5">
                        <div className="flex flex-col flex-1 mr-4">
                          <div className="text-sm font-bold text-white">New Reward Notifications</div>
                          <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">
                            Show a browser notification your toon receives a new reward.
                          </div>
                          <div className="mt-1 text-[10px] font-semibold text-amber-300">Requires Toon Tracker Integration</div>
                          {rewardNotificationError && (
                            <div className="mt-1 text-[10px] font-semibold text-amber-300">{rewardNotificationError}</div>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            const previousEnabled = rewardNotificationsEnabled;
                            try {
                              if (previousEnabled) {
                                setRewardNotificationsEnabled(false);
                                setRewardNotificationError(null);
                                await browser.storage.local.set({ 'reward-notifications-enabled': false });
                                const removal = await browser.runtime.sendMessage({ type: 'REMOVE_REWARD_NOTIFICATION_PERMISSION' });
                                if (removal?.ok === false) throw new Error(removal.error || 'Could not remove notification permission.');
                                return;
                              }
                              const permission = await browser.runtime.sendMessage({ type: 'REQUEST_REWARD_NOTIFICATION_PERMISSION' });
                              if (permission?.ok === false) throw new Error(permission.error || 'Could not request notification permission.');
                              if (permission?.granted === true) {
                                setRewardNotificationsEnabled(true);
                                setRewardNotificationError(null);
                                await browser.storage.local.set({ 'reward-notifications-enabled': true });
                              } else {
                                setRewardNotificationsEnabled(false);
                                await browser.storage.local.set({ 'reward-notifications-enabled': false });
                                setRewardNotificationError('Extension notification permission was not granted.');
                              }
                            } catch (error) {
                              console.error('[ToonHQ+] Failed to update reward notifications.', error);
                              try {
                                const [stored, permission] = await Promise.all([
                                  browser.storage.local.get('reward-notifications-enabled'),
                                  browser.runtime.sendMessage({ type: 'GET_REWARD_NOTIFICATION_PERMISSION' }),
                                ]);
                                if (permission?.ok === false) throw new Error(permission.error || 'Could not check notification permission.');
                                setRewardNotificationsEnabled(stored['reward-notifications-enabled'] === true && permission?.granted === true);
                              } catch {
                                setRewardNotificationsEnabled(previousEnabled);
                              }
                              window.alert('ToonHQ+ could not update reward notifications. Please try again.');
                            }
                          }}
                          aria-label="Toggle new reward notifications"
                          aria-pressed={rewardNotificationsEnabled}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ring-1 ring-white/10 ${rewardNotificationsEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rewardNotificationsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-green-300/80">Maintenance</h4>

                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={handleOpenExport}
                          className="flex items-center gap-3 w-full rounded-lg bg-black/20 p-2.5 text-left hover:bg-sky-500/10 group transition-all cursor-pointer border border-white/5"
                        >
                          <div className="h-7 w-7 rounded bg-sky-500/10 flex items-center justify-center text-sky-300 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                          </div>
                          <div className="flex flex-col">
                            <div className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors">Export Data</div>
                            <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">Export your data so you can copy or download it for safekeeping.</div>
                          </div>
                        </button>

                        <button
                          onClick={handleOpenImport}
                          className="flex items-center gap-3 w-full rounded-lg bg-black/20 p-2.5 text-left hover:bg-amber-500/10 group transition-all cursor-pointer border border-white/5"
                        >
                          <div className="h-7 w-7 rounded bg-amber-500/10 flex items-center justify-center text-amber-300 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9" /><path d="m17 14-5-5-5 5" /><path d="M5 3h14" /></svg>
                          </div>
                          <div className="flex flex-col">
                            <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">Import Data</div>
                            <div className="text-[10px] text-green-200/50 leading-tight mt-0.5">Paste or upload an export file to replace your current saved ToonHQ+ data.</div>
                          </div>
                        </button>

                        <button
                          onClick={handleOpenResetSettings}
                          className="flex items-center gap-3 w-full rounded-lg bg-black/20 p-2.5 text-left hover:bg-red-500/10 group transition-all cursor-pointer border border-white/5"
                        >
                          <div className="h-7 w-7 rounded bg-red-500/10 flex items-center justify-center text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                          </div>
                          <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">Delete Settings</div>
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </aside>
        )}
      </div>
      {dialog?.isOpen && (
        <div
          className={`fixed inset-0 z-[2147483647] bg-black/40 animate-in fade-in duration-200 flex ${dialog.source === 'main' ? 'items-center justify-center p-4' : 'items-start justify-end p-4 pt-16'}`}
          onClick={() => setDialog(null)}
        >
          <div
            className={`w-full max-w-xs rounded-xl border border-white/20 p-5 shadow-2xl animate-in zoom-in-95 duration-200 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'bg-[#450a0a]' : 'bg-[#0c3622]'} ${dialog.source === 'main' ? '' : 'mr-4'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.type === 'delete_group' ? (
              <div className="mb-4 flex flex-col items-center gap-3 text-center">
                <div className="h-16 w-16 rounded-full flex items-center justify-center border-2 border-red-500/30 bg-red-500/10 border-red-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white leading-tight">Delete Group</h4>
                  <p className="mt-1 text-sm text-red-100 opacity-90">
                    Are you sure you want to remove this group from your history?
                  </p>
                </div>
              </div>
            ) : dialog.toon ? (
              <div className="mb-4 flex flex-col items-center gap-3 text-center">
                {(() => {
                  const photo = getToonPhoto(dialog.toon);
                  return photo ? (
                    <img src={photo} className={`h-16 w-16 rounded-full border-2 shadow-md bg-black/10 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'border-red-400' : 'border-emerald-400'}`} alt="" />
                  ) : null;
                })()}
                <div>
                  <h4 className="text-lg font-bold text-white leading-tight">
                    {dialog.toon!.name}
                    {dialog.toon!.laff != null && <span className="ml-1.5 opacity-60">({dialog.toon!.laff})</span>}
                  </h4>
                  <p className={`text-sm opacity-90 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'text-red-100' : 'text-green-200'}`}>
                    {dialog.type === 'remove' ? `Remove from ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                      dialog.type === 'move' ? `Move to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?` :
                        `Add to ${dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Toony Toons' : 'Stinky Toons'}?`}
                  </p>
                </div>
              </div>
            ) : null}

            {(dialog.type === 'add' || dialog.type === 'move') && (
              <div className="mb-5">
                <label className={`mb-1.5 block text-xs font-bold uppercase tracking-wider opacity-80 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'text-red-300' : 'text-green-300'}`}>
                  Private Note
                </label>
                <textarea
                  autoFocus
                  onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                  className={`w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all shadow-inner custom-scrollbar resize-y min-h-[5rem] max-h-32 ${dialog.listKey === STORAGE_KEYS.BLOCKED ? 'focus:border-red-400 focus:ring-red-400' : 'focus:border-emerald-400 focus:ring-emerald-400'}`}
                  placeholder={dialog.listKey === STORAGE_KEYS.BLOCKED ? "Rude, griefing, bad gags, etc..." : "Nice, helpful, communicative, strategic etc..."}
                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                  value={dialogNote}
                  onChange={(e) => setDialogNote(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (dialog.type === 'delete_group' && dialog.groupId) {
                    dbDeleteGroup(dialog.groupId).then(() => {
                      getAllGroups().then(groups => {
                        const groupsMap: Record<number, any> = {};
                        for (const g of groups) groupsMap[g.groupId] = { id: g.groupId, ...g };
                        setHistoryGroups(groupsMap);
                        setDialog(null);
                      });
                    });
                  } else if (dialog.toon && dialog.listKey && (dialog.type === 'add' || dialog.type === 'move' || dialog.type === 'remove')) {
                    updateToonList(dialog.type, dialog.listKey!, dialog.toon, dialogNote).then(() => {
                      if (dialog.type === 'add' || dialog.type === 'move') {
                        setJustAddedId(dialog.toon!.id);
                        setTimeout(() => setJustAddedId(null), 500);
                      }
                      refresh();
                      setDialog(null);
                    }).catch((error) => {
                      setSyncNotesError(error instanceof Error ? error.message : String(error));
                    });
                  }
                }}
                className={`w-full rounded-lg py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95 cursor-pointer ${(dialog.type === 'remove' || dialog.type === 'delete_group' || dialog.listKey === STORAGE_KEYS.BLOCKED)
                  ? 'bg-red-600 hover:bg-red-700 ring-red-400/50'
                  : 'bg-emerald-600 hover:bg-emerald-700 ring-emerald-400/50'
                  } focus:outline-none focus:ring-2`}
              >
                {dialog.type === 'remove' ? 'Remove Toon' :
                  dialog.type === 'delete_group' ? 'Delete Group' :
                    dialog.type === 'move' ? 'Move Toon' : 'Confirm Add'}
              </button>
              {dialog.type === 'remove' && dialog.listKey && (
                <button
                  onClick={() => {
                    const otherKey = dialog.listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;
                    setDialog({
                      ...dialog,
                      type: 'move',
                      listKey: otherKey
                    });
                  }}
                  className="w-full rounded-lg bg-black/20 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all active:scale-95 cursor-pointer"
                >
                  Move to {dialog.listKey === STORAGE_KEYS.FAVORITES ? 'Stinky Toons' : 'Toony Toons'}
                </button>
              )}
              <button
                onClick={() => setDialog(null)}
                className="w-full rounded-lg bg-black/20 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {transferDialog && (
        <div
          className="fixed inset-0 z-[2147483647] bg-black/50 animate-in fade-in duration-200 flex items-center justify-center p-4"
          onClick={() => {
            if (!transferDialog.isBusy) setTransferDialog(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-white/20 bg-[#0c3622] p-5 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />

            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-white leading-tight">
                  {transferDialog.mode === 'export' ? 'Export Data' : 'Import Data'}
                </h4>
                <p className={`mt-1 text-sm ${transferDialog.mode === 'export' ? 'text-green-100/80' : 'text-amber-100/90'}`}>
                  {transferDialog.mode === 'export'
                    ? 'This export includes your saved ToonHQ+ data from both the website and the extension.'
                    : 'Merge an export into your current ToonHQ+ data, or replace everything with that export.'}
                </p>
              </div>
              {!transferDialog.isBusy && (
                <button
                  onClick={() => {
                    setTransferDialog(null);
                    setImportAnalysisKind(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 text-green-100 hover:bg-black/40 transition-colors cursor-pointer"
                  aria-label="Close import or export dialog"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              )}
            </div>

            {transferDialog.mode === 'export' && (
              <>
                {/*
                <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <input
                    type="checkbox"
                    checked={transferDialog.includeFullToonCache === true}
                    onChange={(e) => handleToggleFullExport(e.target.checked)}
                    disabled={transferDialog.isBusy}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 text-emerald-500 focus:ring-emerald-400 disabled:cursor-not-allowed"
                  />
                  <div>
                    <div className="text-sm font-bold text-white">Include All Searchable Toons</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-green-100/70">
                      Turn this on to include all searchable toons too. Leave unchecked if you are not sure.
                    </div>
                  </div>
                </label>
                */}
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-green-300/70">Compressed Size</div>
                    <div className="mt-1 text-sm font-bold text-white">{transferDialog.totalBytes != null ? formatBytes(transferDialog.totalBytes) : 'Calculating...'}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-green-300/70">Uncompressed Size</div>
                    <div className="mt-1 text-sm font-bold text-white">{transferDialog.rawBytes != null ? formatBytes(transferDialog.rawBytes) : 'Calculating...'}</div>
                  </div>
                </div>
              </>
            )}

            {transferDialog.mode === 'import' && (
              <div className="mb-4 space-y-3">
                <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                  Merge adds data from the export without deleting anything already saved here. If the same item differs, your conflict choice decides which version to keep.
                  <button
                    onClick={() => buildExportDialog(false)}
                    disabled={transferDialog.isBusy}
                    className="ml-1 text-amber-200 underline underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Backup your current data first to be safe.
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="relative rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-green-300/70">Import Mode</div>
                    <button
                      type="button"
                      onClick={() => setOpenImportMenu((current) => current === 'mode' ? null : 'mode')}
                      disabled={transferDialog.isBusy}
                      className="mt-2 flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left text-sm font-bold text-white shadow-inner transition-colors hover:bg-black/40 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{(transferDialog.importMode ?? 'merge') === 'merge' ? 'Merge with current data' : 'Replace current data'}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-green-200/70 transition-transform ${openImportMenu === 'mode' ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {openImportMenu === 'mode' && !transferDialog.isBusy && (
                      <div className="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-10 overflow-hidden rounded-lg border border-white/15 bg-[#082818] shadow-2xl">
                        <button
                          type="button"
                          onClick={() => setImportMode('merge')}
                          className={`w-full px-3 py-2.5 text-left text-sm font-bold transition-colors ${transferDialog.importMode !== 'replace' ? 'bg-emerald-500/15 text-white' : 'text-green-100 hover:bg-white/10'}`}
                        >
                          <span>Merge with current data</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMode('replace')}
                          className={`w-full px-3 py-2.5 text-left text-sm font-bold transition-colors ${transferDialog.importMode === 'replace' ? 'bg-amber-500/15 text-white' : 'text-green-100 hover:bg-white/10'}`}
                        >
                          <span>Replace current data</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-green-300/70">Conflicts</div>
                    <button
                      type="button"
                      onClick={() => setOpenImportMenu((current) => current === 'conflicts' ? null : 'conflicts')}
                      disabled={transferDialog.isBusy || transferDialog.importMode === 'replace'}
                      className="mt-2 flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left text-sm font-bold text-white shadow-inner transition-colors hover:bg-black/40 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{(transferDialog.conflictPolicy ?? 'keep-local') === 'keep-local' ? 'Keep local version' : 'Use imported version'}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-green-200/70 transition-transform ${openImportMenu === 'conflicts' ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {openImportMenu === 'conflicts' && !transferDialog.isBusy && transferDialog.importMode !== 'replace' && (
                      <div className="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-10 overflow-hidden rounded-lg border border-white/15 bg-[#082818] shadow-2xl">
                        <button
                          type="button"
                          onClick={() => setImportConflictPolicy('keep-local')}
                          className={`w-full px-3 py-2.5 text-left text-sm font-bold transition-colors ${(transferDialog.conflictPolicy ?? 'keep-local') === 'keep-local' ? 'bg-emerald-500/15 text-white' : 'text-green-100 hover:bg-white/10'}`}
                        >
                          <span>Keep local version</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportConflictPolicy('use-import')}
                          className={`w-full px-3 py-2.5 text-left text-sm font-bold transition-colors ${transferDialog.conflictPolicy === 'use-import' ? 'bg-amber-500/15 text-white' : 'text-green-100 hover:bg-white/10'}`}
                        >
                          <span>Use imported version</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {transferDialog.importPlan && (() => {
                  const totals = getImportPlanTotals(transferDialog.importPlan);
                  const analysisCardClass = 'rounded-lg border border-white/10 bg-black/20 p-3 text-left transition-colors hover:bg-black/35 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60';
                  return (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => setImportAnalysisKind('added')}
                        disabled={totals.added === 0}
                        className={analysisCardClass}
                      >
                        <div className="text-[10px] uppercase tracking-widest text-green-300/70">New</div>
                        <div className="mt-1 text-sm font-bold text-white">{totals.added}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportAnalysisKind('updated')}
                        disabled={totals.updated === 0}
                        className={analysisCardClass}
                      >
                        <div className="text-[10px] uppercase tracking-widest text-sky-300/80">Updated</div>
                        <div className="mt-1 text-sm font-bold text-white">{totals.updated}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportAnalysisKind('conflict')}
                        disabled={totals.conflicts === 0}
                        className={analysisCardClass}
                      >
                        <div className="text-[10px] uppercase tracking-widest text-amber-300/80">Conflicts</div>
                        <div className="mt-1 text-sm font-bold text-white">{totals.conflicts}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportAnalysisKind('unchanged')}
                        disabled={totals.unchanged === 0}
                        className={analysisCardClass}
                      >
                        <div className="text-[10px] uppercase tracking-widest text-green-300/70">Unchanged</div>
                        <div className="mt-1 text-sm font-bold text-white">{totals.unchanged}</div>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            <textarea
              value={transferDialog.text}
              readOnly={transferDialog.mode === 'export'}
              onChange={(e) => {
                const nextText = e.target.value;
                importAnalysisRequestIdRef.current += 1;
                if (!nextText.trim()) lastAutoAnalyzedImportTextRef.current = '';
                setImportAnalysisKind(null);
                setTransferDialog((current) => current
                  ? {
                    ...current,
                    text: nextText,
                    isBusy: false,
                    error: undefined,
                    parsedSnapshot: undefined,
                    importPlan: undefined,
                    message: current.mode === 'import' && nextText.trim()
                      ? 'Waiting to analyze pasted backup...'
                      : undefined,
                  }
                  : current);
              }}
              className="h-72 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-inner custom-scrollbar"
              placeholder={transferDialog.mode === 'export' ? 'Preparing your export...' : 'Paste your ToonHQ+ export here.'}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-green-100/80">
              {transferDialog.fileName && <span className="rounded-full bg-black/20 px-2.5 py-1">{transferDialog.fileName}</span>}
              {transferDialog.message && <span>{transferDialog.message}</span>}
              {transferDialog.error && <span className="text-red-300">{transferDialog.error}</span>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2">
                {transferDialog.mode === 'export' ? (
                  <>
                    <button
                      onClick={handleCopyExport}
                      disabled={transferDialog.isBusy || !transferDialog.text}
                      className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 transition-colors active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Copy Export
                    </button>
                    <button
                      onClick={handleDownloadExport}
                      disabled={transferDialog.isBusy || !transferDialog.text}
                      className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Download Export
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => importFileInputRef.current?.click()}
                      disabled={transferDialog.isBusy}
                      className="rounded-lg bg-black/20 px-4 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-colors active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Upload Export File
                    </button>
                    <button
                      onClick={() => analyzeImportText(transferDialog.text, transferDialog.fileName)}
                      disabled={transferDialog.isBusy || !transferDialog.text.trim()}
                      className="rounded-lg bg-black/20 px-4 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-colors active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Analyze Backup
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={transferDialog.isBusy}
                      className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700 transition-colors active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Import Data
                    </button>
                  </>
                )}
              </div>
              {!transferDialog.isBusy && (
                <button
                  onClick={() => {
                    setTransferDialog(null);
                    setImportAnalysisKind(null);
                  }}
                  className="ml-auto rounded-lg bg-black/20 px-4 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-colors active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {transferDialog?.mode === 'import' && transferDialog.importPlan && importAnalysisKind && (() => {
        const comparisons = (transferDialog.importPlan.comparisons || []).filter((entry) => entry.kind === importAnalysisKind);
        return (
          <div
            className="fixed inset-0 z-[2147483647] bg-black/60 animate-in fade-in duration-200 flex items-center justify-center p-4"
            onClick={() => setImportAnalysisKind(null)}
          >
            <div
              className="w-full max-w-4xl rounded-xl border border-white/20 bg-[#0a2f1e] p-5 shadow-2xl animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-white leading-tight">{importAnalysisLabels[importAnalysisKind]}</h4>
                  <p className="mt-1 text-sm text-green-100/80">
                    {comparisons.length} {comparisons.length === 1 ? 'record' : 'records'} found in the analyzed backup.
                  </p>
                </div>
                <button
                  onClick={() => setImportAnalysisKind(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 text-green-100 hover:bg-black/40 transition-colors cursor-pointer"
                  aria-label="Close import analysis details"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {comparisons.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-green-100/80">
                    No comparison rows are available for this category.
                  </div>
                ) : comparisons.map((entry, index) => (
                  <div key={`${entry.kind}-${entry.area}-${entry.location}-${entry.key}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-100">{entry.area}</span>
                      <span className="rounded-full bg-black/30 px-2.5 py-1 text-green-100/80">{entry.location}</span>
                      <span className="break-all rounded-full bg-black/30 px-2.5 py-1 font-mono text-green-100/80">{entry.key}</span>
                    </div>
                    <div className={`grid grid-cols-1 gap-3 ${entry.merged !== undefined ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-green-300/70">Existing</div>
                        <pre className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-green-50/90 custom-scrollbar whitespace-pre-wrap break-words">{formatComparisonValue(entry.existing)}</pre>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-sky-300/80">Incoming</div>
                        <pre className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-green-50/90 custom-scrollbar whitespace-pre-wrap break-words">{formatComparisonValue(entry.incoming)}</pre>
                      </div>
                      {entry.merged !== undefined && (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-widest text-emerald-300/80">Merged Result</div>
                          <pre className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-green-50/90 custom-scrollbar whitespace-pre-wrap break-words">{formatComparisonValue(entry.merged)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {syncNotesChoiceDialog && (
        <div
          className="fixed inset-0 z-[2147483647] bg-black/50 animate-in fade-in duration-200 flex items-center justify-center p-4"
          onClick={() => {
            if (!syncNotesChoiceDialog.isBusy) setSyncNotesChoiceDialog(null);
          }}
        >
          <div
            className="w-full max-w-4xl rounded-xl border border-white/20 bg-[#0c3622] p-5 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-white leading-tight">Sync Notes</h4>
                <p className="mt-1 text-sm text-amber-100/90">
                  Synced saved toon lists and notes already exist for this browser profile. Compare the saved data below, then choose which copy to keep.
                </p>
              </div>
              {!syncNotesChoiceDialog.isBusy && (
                <button
                  onClick={() => setSyncNotesChoiceDialog(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 text-green-100 hover:bg-black/40 transition-colors cursor-pointer"
                  aria-label="Close sync notes dialog"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              )}
            </div>
            {syncNotesChoiceDialog.error && (
              <div className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {syncNotesChoiceDialog.error}
              </div>
            )}
            <div className="mb-4">
              <SyncNotesPreviewGrid
                synced={syncNotesChoiceDialog.payload}
                local={syncNotesChoiceDialog.localSnapshot}
                onUseSynced={handleUseSyncedNotesData}
                onUseLocal={handleUseLocalNotesData}
                disabled={syncNotesChoiceDialog.isBusy}
              />
            </div>
            <div className="flex justify-end">
              {!syncNotesChoiceDialog.isBusy && (
                <button
                  onClick={() => setSyncNotesChoiceDialog(null)}
                  className="rounded-lg bg-black/20 px-4 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {resetSettingsDialog?.isOpen && (
        <div
          className="fixed inset-0 z-[2147483647] bg-black/50 animate-in fade-in duration-200 flex items-center justify-center p-4"
          onClick={() => {
            if (!resetSettingsDialog.isBusy) setResetSettingsDialog(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-white/20 bg-[#0c3622] p-5 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-white leading-tight">Delete Settings</h4>
                <p className="mt-1 text-sm text-amber-100/90">
                  Choose which saved settings you want to delete.
                </p>
              </div>
              {!resetSettingsDialog.isBusy && (
                <button
                  onClick={() => setResetSettingsDialog(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 text-green-100 hover:bg-black/40 transition-colors cursor-pointer"
                  aria-label="Close reset settings dialog"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              )}
            </div>

            <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              This will permanently remove your saved data for the selected categories.
              <button
                onClick={() => {
                  setResetSettingsDialog(null);
                  buildExportDialog(false);
                }}
                disabled={resetSettingsDialog.isBusy}
                className="text-amber-200 underline underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Backup your current data first to be safe.
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <input
                  type="checkbox"
                  checked={resetSettingsDialog.selections.history}
                  onChange={(e) => setResetSettingsDialog((current) => current
                    ? {
                      ...current,
                      selections: { ...current.selections, history: e.target.checked },
                      error: undefined,
                    }
                    : current)}
                  disabled={resetSettingsDialog.isBusy}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 text-red-500 focus:ring-red-400 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-sm font-bold text-white">Group History</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-green-100/70">
                    Clears your saved group history and past group member records.
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-red-300">
                    {groupHistoryDeleteCount} {groupHistoryDeleteCount === 1 ? 'group' : 'groups'} will be deleted.
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <input
                  type="checkbox"
                  checked={resetSettingsDialog.selections.savedToons}
                  onChange={(e) => setResetSettingsDialog((current) => current
                    ? {
                      ...current,
                      selections: { ...current.selections, savedToons: e.target.checked },
                      error: undefined,
                    }
                    : current)}
                  disabled={resetSettingsDialog.isBusy}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 text-red-500 focus:ring-red-400 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-sm font-bold text-white">Saved Toon Lists and Notes</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-green-100/70">
                    Clears your Toony Toons, Stinky Toons, and Toon Notes.
                  </div>
                  {syncNotesEnabledState && (
                    <div className="mt-1 text-[11px] font-semibold text-amber-200">
                      Sync Notes is enabled. These saved toon lists and notes will be deleted from all synced devices.
                    </div>
                  )}
                  <div className="mt-1 text-[11px] font-semibold text-red-300">
                    {savedToonsDeleteCount} total toon entries will be deleted.
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <input
                  type="checkbox"
                  checked={resetSettingsDialog.selections.navigation}
                  onChange={(e) => setResetSettingsDialog((current) => current
                    ? {
                      ...current,
                      selections: { ...current.selections, navigation: e.target.checked },
                      error: undefined,
                    }
                    : current)}
                  disabled={resetSettingsDialog.isBusy}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 text-red-500 focus:ring-red-400 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-sm font-bold text-white">Navigation Layout</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-green-100/70">
                    Resets your ToonHQ navigation layout back to the default arrangement.
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-green-100/80">
              {resetSettingsDialog.message && <span>{resetSettingsDialog.message}</span>}
              {resetSettingsDialog.error && <span className="text-red-300">{resetSettingsDialog.error}</span>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={handleConfirmResetSettings}
                disabled={resetSettingsDialog.isBusy || !hasSelectedResetSetting}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition-colors active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
              {!resetSettingsDialog.isBusy && (
                <button
                  onClick={() => setResetSettingsDialog(null)}
                  className="ml-auto rounded-lg bg-black/20 px-4 py-2.5 text-sm font-medium text-green-100 hover:bg-black/40 transition-colors active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {(() => {
        const hoveredToon = (hoveredToonId
          ? historyToons[String(hoveredToonId)] || searchResults.find(t => String(t.id) === String(hoveredToonId))
          : hoveredToonName
            ? Object.values(historyToons).find((t) => t.name === hoveredToonName) || searchResults.find(t => t.name === hoveredToonName)
            : null);
        if (!hoveredToon || !hoveredRect) return null;
        return (
          <TooltipAnchor anchorRect={hoveredRect}>
            <ToonTooltip
              toon={hoveredToon}
              isFavorited={favorites.includes(hoveredToon.id)}
              isBlocked={blocked.includes(hoveredToon.id)}
              note={notes[String(hoveredToon.id)]}
            />
          </TooltipAnchor>
        );
      })()}
    </>
  );
}
