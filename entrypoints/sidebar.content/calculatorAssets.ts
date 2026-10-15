import { browser } from 'wxt/browser';

/** Keep ToonHQ gag URLs and bundled extension assets usable in content scripts. */
export function staticUrl(path: string) {
  if (path.startsWith('/external/static/')) {
    return `https://toonhq.org/static/${path.slice('/external/static/'.length)}`;
  }
  const assetPath = path.replace(/^\/+/, '');
  try {
    return browser.runtime.getURL(assetPath as any);
  } catch {
    return `/${assetPath}`;
  }
}
