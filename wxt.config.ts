import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
    content_scripts: [
      {
        matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
        js: ['entrypoints/sidebar.content/index.tsx'],
        css: ['entrypoints/sidebar.content/style.css'],
        run_at: 'document_idle',
      },
    ],
    action: { default_popup: 'sidebar/content/index.html' },
    background: { service_worker: 'entrypoints/background.ts' },
  },
});
