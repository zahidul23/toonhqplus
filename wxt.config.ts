import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ToonHQ+',
    description: 'ToonHQ+ is a browser extension that enhances the ToonHQ experience.',
    version: '1.0.0',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
    content_scripts: [
      {
        matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
        js: ['entrypoints/sidebar.content/index.tsx'],
        css: ['entrypoints/sidebar.content/style.css'],
        run_at: 'document_idle',
        world: "MAIN"
      },
    ],
    web_accessible_resources: [
      {
        resources: ['vue-logger.js'],
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
});
