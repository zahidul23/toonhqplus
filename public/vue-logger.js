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
  let stopWatchingGameId = null;
  let stopWatchingGroupState = null;
  let groupStateAvailable = false;
  let groupStorePathname = null;
  let warnedIncompatibleFilterSchema = false;

  const persistedFilterKeys = ['groupType', 'hideGroupType', 'district', 'area', 'sortBy', 'showFull'];
  const validFilterSorts = ['oldest', 'newest', 'most_toons', 'least_toons'];
  const quickGroupFilters = [
    { label: 'All Bosses', gameId: 1, groupTypes: [3, 5, 7, 9] },
    { label: 'All Facilities', gameId: 1, groupTypes: [2, 4, 6, 8] },
  ];

  function hasGroupFilterModule(store) {
    const groups = store && store.state && store.state.groups;
    if (!groups || !groups.filters || typeof groups.filters !== 'object') return false;

    // Vuex exposes registered mutations on the store. If that metadata is
    // available, do not send a group-filter commit to a different game store
    // that happens to expose a similarly named state object.
    return !store._mutations || !!store._mutations.setGroupFilters;
  }

  function getGameId(store) {
    return store && store.getters ? store.getters.gameId : undefined;
  }

  function isCompatibleFilterValue(key, value) {
    if (key === 'groupType' || key === 'hideGroupType' || key === 'area') {
      return Array.isArray(value) && value.every(Number.isFinite);
    }
    if (key === 'district') return value === null || typeof value === 'string';
    if (key === 'sortBy') return typeof value === 'string' && validFilterSorts.includes(value);
    if (key === 'showFull') return typeof value === 'boolean';
    return false;
  }

  function mergeCompatibleGroupFilters(currentFilters, savedFilters) {
    if (!currentFilters || typeof currentFilters !== 'object' || Array.isArray(currentFilters) ||
        !savedFilters || typeof savedFilters !== 'object' || Array.isArray(savedFilters)) return null;

    for (const key of persistedFilterKeys) {
      if (!Object.prototype.hasOwnProperty.call(currentFilters, key) ||
          !Object.prototype.hasOwnProperty.call(savedFilters, key) ||
          !isCompatibleFilterValue(key, currentFilters[key]) ||
          !isCompatibleFilterValue(key, savedFilters[key])) return null;
    }

    // Preserve any new native fields while restoring only the fields whose
    // schema this extension understands.
    const merged = Object.assign({}, currentFilters);
    persistedFilterKeys.forEach(function (key) {
      merged[key] = savedFilters[key];
    });
    return merged;
  }

  function patchGroupStoreMutations(store) {
    const mutations = store && store._mutations;
    if (!mutations) return;

    function groupBelongsToActiveGame(group) {
      const activeGameId = Number(getGameId(store));
      const groupGameId = Number(group && group.game);
      return !!group && Number.isFinite(activeGameId) && Number.isFinite(groupGameId) && groupGameId === activeGameId;
    }

    function wrapMutation(name, preparePayload) {
      const handlers = mutations[name];
      if (!Array.isArray(handlers)) return;

      handlers.forEach(function (handler, index) {
        if (!handler || handler.__TOONHQ_PLUS_GROUP_GUARD__) return;

        const guardedHandler = function (payload) {
          const prepared = preparePayload(payload);
          if (!prepared.apply) return;
          return handler.call(this, prepared.payload);
        };
        guardedHandler.__TOONHQ_PLUS_GROUP_GUARD__ = true;
        handlers[index] = guardedHandler;
      });
    }

    wrapMutation('addGroupMessageCount', function (payload) {
      const groups = store.state && store.state.groups && store.state.groups.groups;
      const groupId = payload && payload.id;
      const group = groups && groupId != null ? groups[groupId] : null;
      return {
        apply: groupBelongsToActiveGame(group),
        payload: payload,
      };
    });

    wrapMutation('addOrUpdateGroup', function (payload) {
      if (!payload || payload.id == null) return { apply: false, payload: payload };

      const groups = store.state && store.state.groups && store.state.groups.groups;
      const existingGroup = groups && groups[payload.id];
      let safePayload = payload;

      // A queued event from the previous socket room can arrive after the
      // site's active game has changed. Never allow it to repopulate the new
      // game's group state.
      const eventGameId = Number(payload.game != null ? payload.game : existingGroup && existingGroup.game);
      const activeGameId = Number(getGameId(store));
      if (!Number.isFinite(eventGameId) || !Number.isFinite(activeGameId) || eventGameId !== activeGameId) {
        return { apply: false, payload: payload };
      }

      // ToonHQ sends partial group updates that may omit members or omit the
      // owner. Its native mutation reads the owner before merging with the
      // existing group, so preserve that existing list for partial updates.
      const payloadHasOwner = Array.isArray(safePayload.members) && safePayload.members.some(function (member) {
        return member && member.owner;
      });
      const existingHasOwner = existingGroup && Array.isArray(existingGroup.members) && existingGroup.members.some(function (member) {
        return member && member.owner;
      });
      if (!payloadHasOwner && existingHasOwner) {
        safePayload = Object.assign({}, safePayload, { members: existingGroup.members });
      }

      const hasOwner = Array.isArray(safePayload.members) && safePayload.members.some(function (member) {
        return member && member.owner;
      });
      return { apply: hasOwner, payload: safePayload };
    });

    // These mutations have the same check-then-commit race in ToonHQ's socket
    // action. A game change can clear the group after the action checks it.
    wrapMutation('removeGroupMember', function (payload) {
      const groups = store.state && store.state.groups && store.state.groups.groups;
      const group = payload && groups && groups[payload.group];
      return {
        apply: groupBelongsToActiveGame(group) && Array.isArray(group.members),
        payload: payload,
      };
    });

    wrapMutation('archiveGroup', function (groupId) {
      const groups = store.state && store.state.groups && store.state.groups.groups;
      const group = groups && groupId != null ? groups[groupId] : null;
      return {
        apply: groupBelongsToActiveGame(group) && Array.isArray(group.members),
        payload: groupId,
      };
    });

    wrapMutation('removeMessage', function (payload) {
      const messages = store.state && store.state.groups && store.state.groups.messages;
      return {
        apply: !!(payload && messages && messages[payload.group]),
        payload: payload,
      };
    });
  }

  function dispatchGroupFilterStoreReady(store) {
    window.dispatchEvent(new CustomEvent('toonhqplus-group-filter-store-ready', {
      detail: JSON.stringify({ gameId: getGameId(store) }),
    }));
  }

  function dispatchGroupFilters(filters) {
    if (!filters || typeof filters !== 'object') return;
    window.dispatchEvent(new CustomEvent('toonhqplus-group-filters-changed', {
      detail: JSON.stringify({ gameId: getGameId(groupStore), filters: filters }),
    }));
  }

  function toggleQuickGroupTypes(groupTypeIds) {
    if (!hasGroupFilterModule(groupStore)) return;
    const currentFilters = groupStore.state.groups.filters;
    const currentGroupTypes = Array.isArray(currentFilters.groupType) ? currentFilters.groupType : [];
    const allSelected = groupTypeIds.every(function (id) { return currentGroupTypes.includes(id); });
    const nextGroupTypes = allSelected
      ? currentGroupTypes.filter(function (id) { return !groupTypeIds.includes(id); })
      : Array.from(new Set(currentGroupTypes.concat(groupTypeIds)));
    groupStore.commit('setGroupFilters', Object.assign({}, currentFilters, { groupType: nextGroupTypes }));
  }

  function syncQuickGroupFilters(filtersElement) {
    if (!filtersElement || !hasGroupFilterModule(groupStore)) return;

    const gameId = Number(getGameId(groupStore));
    const availableQuickFilters = quickGroupFilters.filter(function (quickFilter) {
      return quickFilter.gameId === gameId;
    });
    let container = filtersElement.querySelector('.toonhq-plus-quick-filters');

    if (availableQuickFilters.length === 0) {
      if (container) container.remove();
      return;
    }

    if (!container) {
      container = document.createElement('div');
      container.className = 'group-filters__filter toonhq-plus-quick-filters';

      const heading = document.createElement('h6');
      heading.textContent = 'Quick Filters';
      container.appendChild(heading);

      const buttons = document.createElement('div');
      buttons.className = 'toonhq-plus-quick-filter-buttons';
      availableQuickFilters.forEach(function (quickFilter) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-default btn-sm toonhq-plus-quick-filter';
        button.textContent = quickFilter.label;
        button.addEventListener('click', function () {
          toggleQuickGroupTypes(quickFilter.groupTypes);
        });
        buttons.appendChild(button);
      });
      container.appendChild(buttons);

      const groupTypeFilter = filtersElement.querySelector('.group-filters__filter');
      if (groupTypeFilter) {
        filtersElement.insertBefore(container, groupTypeFilter);
      } else {
        filtersElement.appendChild(container);
      }
    }

    const selectedGroupTypes = groupStore.state.groups.filters.groupType;
    container.querySelectorAll('.toonhq-plus-quick-filter').forEach(function (button, index) {
      const quickFilter = availableQuickFilters[index];
      const isActive = Array.isArray(selectedGroupTypes) && quickFilter.groupTypes.every(function (id) {
        return selectedGroupTypes.includes(id);
      });
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function disconnectGroupStore() {
    if (stopWatchingGroupFilters) stopWatchingGroupFilters();
    if (stopWatchingGameId) stopWatchingGameId();
    if (stopWatchingGroupState) stopWatchingGroupState();
    stopWatchingGroupFilters = null;
    stopWatchingGameId = null;
    stopWatchingGroupState = null;
    groupStateAvailable = false;
    groupStore = null;
    groupStorePathname = null;
  }

  function connectGroupStore(vue) {
    const store = vue && vue.$store;
    if (!hasGroupFilterModule(store)) {
      if (store === groupStore) disconnectGroupStore();
      return;
    }
    if (store === groupStore) {
      if (!groupStateAvailable) {
        groupStateAvailable = true;
        dispatchGroupFilterStoreReady(store);
      }
      return;
    }

    disconnectGroupStore();
    patchGroupStoreMutations(store);
    groupStore = store;
    groupStorePathname = window.location.pathname;
    groupStateAvailable = true;
    stopWatchingGroupFilters = store.watch(
      function (state) { return state && state.groups ? state.groups.filters : undefined; },
      function (filters) { dispatchGroupFilters(filters); },
      { deep: true, immediate: true }
    );
    stopWatchingGroupState = store.watch(
      function (state) { return hasGroupFilterModule({ state: state }); },
      function (hasGroups, hadGroups) {
        groupStateAvailable = hasGroups;
        if (hasGroups && !hadGroups) dispatchGroupFilterStoreReady(store);
      },
    );
    stopWatchingGameId = store.watch(
      function (_state, getters) { return getters ? getters.gameId : undefined; },
      function (gameId, previousGameId) {
        if (String(gameId) === String(previousGameId) || !hasGroupFilterModule(store)) return;
        dispatchGroupFilterStoreReady(store);
      },
    );
    dispatchGroupFilterStoreReady(store);
  }

  function restoreGroupFilters(event) {
    if (!hasGroupFilterModule(groupStore) || typeof event.detail !== 'string') return;
    try {
      const payload = JSON.parse(event.detail);
      const payloadGameId = Number(payload.gameId);
      const storeGameId = Number(getGameId(groupStore));
      if (!Number.isFinite(payloadGameId) || payloadGameId !== storeGameId) return;
      if (!payload.filters || typeof payload.filters !== 'object') return;
      const currentFilters = groupStore.state.groups.filters;
      const mergedFilters = mergeCompatibleGroupFilters(currentFilters, payload.filters);
      if (!mergedFilters) {
        if (!warnedIncompatibleFilterSchema) {
          warnedIncompatibleFilterSchema = true;
          console.warn('[ToonHQ+] Native group filters changed; persisted filters were not restored.');
        }
        return;
      }
      warnedIncompatibleFilterSchema = false;
      if (JSON.stringify(currentFilters) === JSON.stringify(mergedFilters)) return;
      groupStore.commit('setGroupFilters', mergedFilters);
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
    const pathname = window.location.pathname.replace(/\/+$/, '');
    if (pathname !== '/groups' && pathname !== '/cc/groups') {
      disconnectGroupStore();
    } else if (groupStore && groupStorePathname !== window.location.pathname) {
      // Vue reuses the root store across the TTR/CC SPA navigation. Do not
      // keep the previous game's watcher alive while the new page is loading.
      disconnectGroupStore();
    }

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

    let unresolvedDistrictNames = 0;
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
        if (!district || !district.name) unresolvedDistrictNames += 1;
      } else unresolvedDistrictNames += 1;
    });

    document.querySelectorAll('.group-details-dialog').forEach(dialog => {
      const vue = dialog.__vue__;
      connectGroupStore(vue);
      if (!vue || !vue.group || !vue.$store || !vue.$store.state.core) {
        unresolvedDistrictNames += 1;
        return;
      }
      const district = vue.$store.state.core.districts &&
        vue.$store.state.core.districts[vue.group.district];
      if (district && district.name && dialog.getAttribute('district-name') !== district.name) {
        dialog.setAttribute('district-name', district.name);
      }
      if (!district || !district.name) unresolvedDistrictNames += 1;
    });

    const filters = document.querySelector('.group-filters');
    if (filters) {
      connectGroupStore(filters.__vue__);
      syncQuickGroupFilters(filters);
    }

    if (unresolvedDistrictNames > 0) {
      scheduleDistrictNameRetry();
    } else {
      districtNameRetryAttempts = 0;
      if (districtNameRetryTimer !== null) clearTimeout(districtNameRetryTimer);
      districtNameRetryTimer = null;
    }
  }

  let syncScheduled = false;
  let districtNameRetryTimer = null;
  let districtNameRetryAttempts = 0;
  const maxDistrictNameRetryAttempts = 40;

  function scheduleDistrictNameRetry() {
    if (districtNameRetryTimer !== null || districtNameRetryAttempts >= maxDistrictNameRetryAttempts) return;
    districtNameRetryAttempts += 1;
    districtNameRetryTimer = setTimeout(function () {
      districtNameRetryTimer = null;
      scheduleSync();
    }, 250);
  }

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
    if (districtNameRetryTimer !== null) clearTimeout(districtNameRetryTimer);
    districtNameRetryTimer = null;
    window.removeEventListener('toonhqplus-restore-group-filters', restoreGroupFilters);
    disconnectGroupStore();
    window.__TOONHQ_PLUS_VUE_LOGGER__ = false;
    delete window.__TOONHQ_PLUS_VUE_LOGGER_DISCONNECT__;
  };

  // Initial run
  scheduleSync();
})();
