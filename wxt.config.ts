import { defineConfig } from 'wxt';
import { DEV_ADBLOCK_PATH, DEV_ADBLOCK_RULES, DEV_ADBLOCK_RULESET } from './tools/dev-adblock';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ToonHQ+',
    description: 'ToonHQ+ (ToonHQ Plus) is an unofficial independently created browser extension that enhances the ToonHQ experience.',
    version: '1.2.39',
    permissions: ['storage', 'alarms', 'contextMenus'],
    optional_permissions: ['notifications'],
    host_permissions: [
      '*://*.toonhq.org/*',
      '*://toonhq.org/*',
    ],

    web_accessible_resources: [
      {
        resources: ['vue-logger.js', 'images/*.webp', 'images/*.png', 'fonts/MinnieFont.woff'],
        matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
      },
    ],
    action: { default_popup: 'sidebar/content/index.html' },
    background: { service_worker: 'entrypoints/background.ts' },
    icons: {
      "16": "icon/logo-16.png",
      "32": "icon/logo-32.png",
      "48": "icon/logo-48.png",
      "128": "icon/logo-128.png"
    },
    browser_specific_settings: {
      gecko: {
        id: 'toonhqplus@zhoque.com',
        data_collection_permissions: {
          required: ["none"]
        }
      } as any,
    },
  },
  hooks: {
    'build:manifestGenerated'(wxt, manifest) {
      if (wxt.config.command !== 'serve' || wxt.config.manifestVersion !== 3) return;
      manifest.permissions ??= [];
      manifest.permissions.push('declarativeNetRequest');
      manifest.declarative_net_request = {
        rule_resources: [{ id: DEV_ADBLOCK_RULESET, enabled: true, path: DEV_ADBLOCK_PATH }],
      };
    },
    'build:publicAssets'(wxt, files) {
      if (wxt.config.command !== 'serve' || wxt.config.manifestVersion !== 3) return;
      files.push({ relativeDest: DEV_ADBLOCK_PATH, contents: JSON.stringify(DEV_ADBLOCK_RULES) });
    },
  },
  webExt: {
    chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    startUrls: ['https://toonhq.org/groups']
  },
  vite: () => ({
    build: {
      minify: false,
    },
  }),
});
