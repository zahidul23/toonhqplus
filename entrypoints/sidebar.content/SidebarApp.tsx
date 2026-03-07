import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
} as const;

interface ToonData {
  id: number;
  name: string;
  photo?: string;
  [key: string]: any;
}

function normalize(raw: unknown): ToonData[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') {
      return { id: -1, name: item };
    }
    return item as ToonData;
  });
}

function loadLists(): Promise<{ favorites: ToonData[]; blocked: ToonData[] }> {
  return browser.storage.local
    .get([STORAGE_KEYS.FAVORITES, STORAGE_KEYS.BLOCKED])
    .then((result) => ({
      favorites: normalize(result[STORAGE_KEYS.FAVORITES]),
      blocked: normalize(result[STORAGE_KEYS.BLOCKED]),
    }));
}

function removeFromList(
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  identifier: number | string,
) {
  return browser.storage.local.get(listKey).then((result) => {
    const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
    const next = list.filter((t) => {
      if (typeof identifier === 'number') {
        return t.id !== identifier;
      }
      // treat string as name
      return t.name !== identifier;
    });
    return browser.storage.local.set({ [listKey]: next });
  });
}

export function SidebarApp() {
  const [open, setOpen] = useState(true);
  const [favorites, setFavorites] = useState<ToonData[]>([]);
  const [blocked, setBlocked] = useState<ToonData[]>([]);

  const refresh = useCallback(() => {
    loadLists().then(({ favorites: f, blocked: b }) => {
      setFavorites(f);
      setBlocked(b);
    });
  }, []);

  useEffect(() => {
    refresh();
    const listener = (
      changes: { [key: string]: { newValue?: unknown } },
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (STORAGE_KEYS.FAVORITES in changes)
        setFavorites(
          Array.isArray(changes[STORAGE_KEYS.FAVORITES]?.newValue)
            ? (changes[STORAGE_KEYS.FAVORITES].newValue as ToonData[])
            : [],
        );
      if (STORAGE_KEYS.BLOCKED in changes)
        setBlocked(
          Array.isArray(changes[STORAGE_KEYS.BLOCKED]?.newValue)
            ? (changes[STORAGE_KEYS.BLOCKED].newValue as ToonData[])
            : [],
        );
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  return (
    <div className="fixed top-4 right-4 z-[2147483647] flex flex-col gap-2 font-sans">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          {open ? '-' : '+'}
        </button>
      </div>
      {open && (
        <aside className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            ToonHQ Plus
          </h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Click the 👍/👎 buttons next to a toon’s avatar to favorite or block.
          </p>

          <section className="mb-4">
            <h3 className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Favorites
            </h3>
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-1.5 dark:border-gray-600 dark:bg-gray-700/50">
              {favorites.length === 0 ? (
                <li className="py-1 text-xs text-gray-500 dark:text-gray-400">None yet</li>
              ) : (
                // show newest entries at top
                [...favorites].reverse().map((toon) => (
                  <li
                    key={toon.id}
                    title={JSON.stringify(toon)}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {toon.photo && (
                        <img
                          src={toon.photo}
                          alt={toon.name}
                          className="h-6 w-6 rounded-full"
                        />
                      )}
                      <span className="truncate">
                        {toon.name}{toon.laff != null ? ` (${toon.laff})` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        removeFromList(STORAGE_KEYS.FAVORITES, toon.id).then(refresh)
                      }
                      className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-red-600 dark:hover:bg-gray-600 dark:hover:text-red-400"
                      title="Remove from favorites"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Blocked
            </h3>
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-1.5 dark:border-gray-600 dark:bg-gray-700/50">
              {blocked.length === 0 ? (
                <li className="py-1 text-xs text-gray-500 dark:text-gray-400">None yet</li>
              ) : (
                [...blocked].reverse().map((toon) => (
                  <li
                    key={toon.id}
                    title={JSON.stringify(toon)}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {toon.photo && (
                        <img
                          src={toon.photo}
                          alt={toon.name}
                          className="h-6 w-6 rounded-full"
                        />
                      )}
                      <span className="truncate">
                        {toon.name}{toon.laff != null ? ` (${toon.laff})` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        removeFromList(STORAGE_KEYS.BLOCKED, toon.id).then(refresh)
                      }
                      className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-red-600 dark:hover:bg-gray-600 dark:hover:text-red-400"
                      title="Remove from blocked"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </aside>
      )}
    </div>
  );
}
