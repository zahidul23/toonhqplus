/** Read an existing setting without creating a database or blocking startup. */
export function readStartupSetting<T>(key: string, timeoutMs = 1000): Promise<T | undefined> {
  return new Promise((resolve) => {
    let db: IDBDatabase | undefined;
    let settled = false;
    const finish = (value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db?.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(), timeoutMs);

    try {
      const request = indexedDB.open('toonhqplus');
      // Only db.ts may create/upgrade the database and its object stores.
      request.onupgradeneeded = () => request.transaction?.abort();
      request.onerror = () => finish();
      request.onblocked = () => finish();
      request.onsuccess = () => {
        db = request.result;
        // An open request can complete after our startup timeout has expired.
        if (settled) {
          db.close();
          return;
        }
        db.onversionchange = () => finish();
        try {
          if (!db.objectStoreNames.contains('settings')) {
            finish();
            return;
          }
          const transaction = db.transaction('settings', 'readonly');
          const get = transaction.objectStore('settings').get(key);
          get.onsuccess = () => finish(get.result?.value);
          get.onerror = () => finish();
          transaction.onabort = () => finish();
          transaction.onerror = () => finish();
        } catch {
          finish();
        }
      };
    } catch {
      finish();
    }
  });
}
