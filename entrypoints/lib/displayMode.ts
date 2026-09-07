export const DISPLAY_MODE_SETTING = 'display-mode' as const;

export type DisplayMode = 'auto' | 'light' | 'dark';

export function normalizeDisplayMode(value: unknown): DisplayMode {
  return value === 'light' || value === 'dark' ? value : 'auto';
}
