/**
 * This script runs in the "main" world (the same as the page).
 * It can access el.__vue__ which is not visible to the content script.
 * 
 * We use it solely to bridge the toon-id attribute from Vue state to the DOM,
 * so our content script can link rows to the toon data we fetch via API/WebSockets.
 */
(function () {
  function generateToonHash(name, photo) {
    let str = name || '';
    if (photo && photo.includes('https://rendition.toontownrewritten.com/render/')) {
      const start = 'https://rendition.toontownrewritten.com/render/'.length;
      str += photo.substring(start, start + 10);
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return '#' + Math.abs(hash).toString(16);
  }

  function sync() {
    document.querySelectorAll('.group-member-row').forEach(el => {
      // Access Vue instance data
      const vue = el.__vue__;
      if (vue && vue.toon) {
        let tid;
        if (vue.toon.id) {
          tid = String(vue.toon.id);
        } else {
          tid = generateToonHash(vue.toon.name, vue.toon.photo);
          el.style.setProperty('filter', 'blur(1px)');
        }

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
