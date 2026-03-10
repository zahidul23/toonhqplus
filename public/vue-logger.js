/**
 * This script runs in the "main" world (the same as the page).
 * It can access el.__vue__ which is not visible to the content script.
 * 
 * We use it solely to bridge the toon-id attribute from Vue state to the DOM,
 * so our content script can link rows to the toon data we fetch via API/WebSockets.
 */
(function () {
  function sync() {
    document.querySelectorAll('.group-member-row').forEach(el => {
      // Access Vue instance data
      const vue = el.__vue__;
      if (vue && vue.toon) {
        const tid = String(vue.toon.id);
        if (el.getAttribute('toon-id') !== tid) {
          el.setAttribute('toon-id', tid);
        }
      }
    });
  }

  // Watch for DOM changes to catch new dialogs/rows
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run
  sync();
})();
