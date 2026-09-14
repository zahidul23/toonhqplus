/**
 * This script runs in the "main" world (the same as the page).
 * It can access el.__vue__ which is not visible to the content script.
 * 
 * We use it to bridge the small pieces of Vue state needed by the content
 * script: toon/group identifiers, district names, and the native group filters.
 */
(function () {
  if (window.__TOONHQ_PLUS_VUE_LOGGER_DISCONNECT__) {
    window.__TOONHQ_PLUS_VUE_LOGGER_DISCONNECT__();
  } else if (window.__TOONHQ_PLUS_VUE_LOGGER__) {
    return;
  }
  window.__TOONHQ_PLUS_VUE_LOGGER__ = true;

  let groupStore = null;
  let stopWatchingGroupFilters = null;

  function dispatchGroupFilters(filters) {
    window.dispatchEvent(new CustomEvent('toonhqplus-group-filters-changed', {
      detail: JSON.stringify({ gameId: groupStore && groupStore.getters.gameId, filters: filters }),
    }));
  }

  function connectGroupStore(vue) {
    const store = vue && vue.$store;
    if (!store || store === groupStore || !store.state || !store.state.groups) return;

    if (stopWatchingGroupFilters) stopWatchingGroupFilters();
    groupStore = store;
    stopWatchingGroupFilters = store.watch(
      function (state) { return state.groups.filters; },
      function (filters) { dispatchGroupFilters(filters); },
      { deep: true, immediate: true }
    );
    window.dispatchEvent(new CustomEvent('toonhqplus-group-filter-store-ready', {
      detail: JSON.stringify({ gameId: store.getters.gameId }),
    }));
  }

  function restoreGroupFilters(event) {
    if (!groupStore || typeof event.detail !== 'string') return;
    try {
      const payload = JSON.parse(event.detail);
      if (payload.gameId !== groupStore.getters.gameId) return;
      groupStore.commit('setGroupFilters', payload.filters);
    } catch (error) {
      console.warn('[ToonHQ+] Could not restore group filters.', error);
    }
  }

  window.addEventListener('toonhqplus-restore-group-filters', restoreGroupFilters);

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
        }

        if (el.getAttribute('toon-id') !== tid) {
          el.setAttribute('toon-id', tid);
        }
      }
    });

    document.querySelectorAll('.groups-list-item').forEach(groupCard => {
      const vue = groupCard.__vue__;
      connectGroupStore(vue);
      if (vue && vue.group && vue.group.id != null) {
        const gid = String(vue.group.id);
        if (groupCard.getAttribute('group-id') !== gid) {
          groupCard.setAttribute('group-id', gid);
        }

        const district = vue.$store && vue.$store.state && vue.$store.state.core &&
          vue.$store.state.core.districts && vue.$store.state.core.districts[vue.group.district];
        if (district && district.name && groupCard.getAttribute('district-name') !== district.name) {
          groupCard.setAttribute('district-name', district.name);
        }
      }
    });

    document.querySelectorAll('.group-details-dialog').forEach(dialog => {
      const vue = dialog.__vue__;
      connectGroupStore(vue);
      if (!vue || !vue.group || !vue.$store || !vue.$store.state.core) return;
      const district = vue.$store.state.core.districts &&
        vue.$store.state.core.districts[vue.group.district];
      if (district && district.name && dialog.getAttribute('district-name') !== district.name) {
        dialog.setAttribute('district-name', district.name);
      }
    });

    const filters = document.querySelector('.group-filters');
    if (filters) connectGroupStore(filters.__vue__);
  }

  let syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      sync();
    });
  }

  // Watch for DOM changes to catch new dialogs/rows. Batch work so frequent
  // Vue updates do not trigger full-page scans for every individual mutation.
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });

  window.__TOONHQ_PLUS_VUE_LOGGER_DISCONNECT__ = function () {
    observer.disconnect();
    window.removeEventListener('toonhqplus-restore-group-filters', restoreGroupFilters);
    if (stopWatchingGroupFilters) stopWatchingGroupFilters();
    stopWatchingGroupFilters = null;
    groupStore = null;
    window.__TOONHQ_PLUS_VUE_LOGGER__ = false;
    delete window.__TOONHQ_PLUS_VUE_LOGGER_DISCONNECT__;
  };

  // Initial run
  scheduleSync();
})();
