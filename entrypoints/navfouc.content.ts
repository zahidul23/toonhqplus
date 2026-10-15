import { readStartupSetting } from './lib/startupSettings';

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  runAt: 'document_start',
  async main(ctx) {
    // Read navbar-config from IndexedDB (can't import db.ts at document_start)
    let hasConfig = false;
    try {
      hasConfig = !!(await readStartupSetting('navbar-config'));
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
      // Reveal navigation even if sidebar initialization fails or is delayed.
      const revealTimeout = setTimeout(() => style.remove(), 3000);
      ctx.onInvalidated(() => {
        clearTimeout(revealTimeout);
        document.removeEventListener('DOMContentLoaded', injectStyle);
        style.remove();
      });
    }
  }
});
