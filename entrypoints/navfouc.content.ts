export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  runAt: 'document_start',
  async main() {
    const config = await browser.storage.local.get('toonhqplus-navbar-config');
    
    // Only hide the navbar if the user has actually customized it
    if (config['toonhqplus-navbar-config']) {
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
    }
  }
});
