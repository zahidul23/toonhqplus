import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ToonHQ+',
    description: 'ToonHQ+ is a browser extension that enhances the ToonHQ experience.',
    version: '1.1.5',
    permissions: ['storage'],
    host_permissions: ['*://*.toonhq.org/*', '*://toonhq.org/*'],

    web_accessible_resources: [
      {
        resources: ['vue-logger.js', 'images/*.webp'],
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
  },
  runner: {
    startUrls: ['https://toonhq.org/groups']
  },
});
