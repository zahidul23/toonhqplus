export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  runAt: 'document_start',
  async main() {
    // Read navbar-config from IndexedDB (can't import db.ts at document_start)
    let hasConfig = false;
    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('toonhqplus', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('settings')) { resolve(); return; }
          const t = db.transaction('settings', 'readonly');
          const get = t.objectStore('settings').get('navbar-config');
          get.onsuccess = () => {
            hasConfig = !!(get.result?.value);
            resolve();
          };
          get.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      });
    } catch { /* ignore */ }

    // Fallback: check old local storage key for users who haven't migrated yet
    if (!hasConfig) {
      try {
        const old = await browser.storage.local.get('toonhqplus-navbar-config');
        hasConfig = !!(old['toonhqplus-navbar-config']);
      } catch { /* ignore */ }
    }

    // Only hide the navbar if the user has actually customized it
    if (hasConfig) {
      const style = document.createElement('style');
      style.textContent = `
        ul.navbar-nav.ml-auto:not([data-toonhq-customized]) {
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      
      const injectStyle = () => {
        (document.head || document.documentElement).appendChild(style);
      };
      
      if (document.head || document.documentElement) {
        injectStyle();
      } else {
        document.addEventListener('DOMContentLoaded', injectStyle);
      }
    }
  }
});
