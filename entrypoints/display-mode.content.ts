import { browser } from 'wxt/browser';
import { DISPLAY_MODE_CSS, DISPLAY_MODE_STYLE_ID } from './lib/displayModeStyles';
import { DISPLAY_MODE_SETTING, normalizeDisplayMode, type DisplayMode } from './lib/displayMode';
import { readStartupSetting } from './lib/startupSettings';

async function readDisplayMode(): Promise<DisplayMode | undefined> {
  const mode = await readStartupSetting<unknown>(DISPLAY_MODE_SETTING);
  return mode === undefined ? undefined : normalizeDisplayMode(mode);
}

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  runAt: 'document_start',

  async main(ctx) {
    const root = document.documentElement;
    const style = document.createElement('style');
    style.id = DISPLAY_MODE_STYLE_ID;
    style.textContent = DISPLAY_MODE_CSS;
    (document.head || root).appendChild(style);

    let selectedMode: DisplayMode = 'auto';
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyMode = () => {
      const isDark = selectedMode === 'dark' || (selectedMode === 'auto' && systemTheme.matches);
      root.dataset.toonhqPlusDisplayMode = isDark ? 'dark' : 'light';
    };
    const loadMode = async () => {
      const storedMode = await readDisplayMode();
      if (storedMode !== undefined) selectedMode = storedMode;
      applyMode();
    };

    applyMode();
    loadMode().catch(() => applyMode());

    const handleSystemThemeChange = () => {
      if (selectedMode === 'auto') applyMode();
    };
    systemTheme.addEventListener('change', handleSystemThemeChange);

    const handleSettingChange = (event: Event) => {
      const detail = (event as CustomEvent<{ store?: string; key?: IDBValidKey }>).detail;
      if (detail?.store === 'settings' && detail.key === DISPLAY_MODE_SETTING) loadMode().catch(() => applyMode());
    };
    window.addEventListener('toonhqplus-db-changed', handleSettingChange);

    const handleRuntimeMessage = (message: any) => {
      if (message?.type === 'DISPLAY_MODE_CHANGED') {
        selectedMode = normalizeDisplayMode(message.mode);
        applyMode();
      }
    };
    browser.runtime.onMessage.addListener(handleRuntimeMessage);

    ctx.onInvalidated(() => {
      systemTheme.removeEventListener('change', handleSystemThemeChange);
      window.removeEventListener('toonhqplus-db-changed', handleSettingChange);
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
      style.remove();
      delete root.dataset.toonhqPlusDisplayMode;
    });
  },
});
