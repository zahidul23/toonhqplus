export const DISPLAY_MODE_SETTING = 'display-mode' as const;
export const DARK_MODE_NOTICE_DISMISSED_KEY = 'toonhqplus-dark-mode-notice-dismissed' as const;

export type DisplayMode = 'auto' | 'light' | 'dark';

export function normalizeDisplayMode(value: unknown): DisplayMode {
  return value === 'light' || value === 'dark' ? value : 'auto';
}
