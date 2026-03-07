import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
} as const;

function loadLists(): Promise<{ favorites: string[]; blocked: string[] }> {
  return browser.storage.local
    .get([STORAGE_KEYS.FAVORITES, STORAGE_KEYS.BLOCKED])
    .then((result) => ({
      favorites: Array.isArray(result[STORAGE_KEYS.FAVORITES])
        ? result[STORAGE_KEYS.FAVORITES]
        : [],
      blocked: Array.isArray(result[STORAGE_KEYS.BLOCKED])
        ? result[STORAGE_KEYS.BLOCKED]
        : [],
    }));
}

function removeFromList(
  listKey: (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  name: string,
) {
  return browser.storage.local.get(listKey).then((result) => {
    const list: string[] = Array.isArray(result[listKey]) ? result[listKey] : [];
    const next = list.filter((n) => n !== name);
    return browser.storage.local.set({ [listKey]: next });
  });
}

export function SidebarApp() {
  const [open, setOpen] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

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
            ? (changes[STORAGE_KEYS.FAVORITES].newValue as string[])
            : [],
        );
      if (STORAGE_KEYS.BLOCKED in changes)
        setBlocked(
          Array.isArray(changes[STORAGE_KEYS.BLOCKED]?.newValue)
            ? (changes[STORAGE_KEYS.BLOCKED].newValue as string[])
            : [],
        );
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  return (
    <div className="fixed top-4 right-4 z-[2147483647] flex flex-col gap-2 font-sans">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        {open ? 'Close' : 'Open'} ToonHQ Plus
      </button>
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
                favorites.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
                  >
                    <span className="truncate">{name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        removeFromList(STORAGE_KEYS.FAVORITES, name).then(refresh)
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
                blocked.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
                  >
                    <span className="truncate">{name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        removeFromList(STORAGE_KEYS.BLOCKED, name).then(refresh)
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
