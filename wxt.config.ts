import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ToonHQ+',
    description: 'ToonHQ+ (ToonHQ Plus) is a browser extension that enhances the ToonHQ experience.',
    version: '1.2.4',
    permissions: ['storage', 'alarms'],
    host_permissions: ['*://*.toonhq.org/*', '*://toonhq.org/*'],

    web_accessible_resources: [
      {
        resources: ['vue-logger.js', 'images/*.webp', 'images/*.png'],
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
  runner: {
    chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    startUrls: ['https://toonhq.org/groups']
  },
  vite: () => ({
    build: {
      minify: false,
    },
  }),
});
