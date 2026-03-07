(function() {
  const rows = document.querySelectorAll('.group-member-row');
  const data = Array.from(rows).map(r => {
    const inst = r.__vue__;
    if (!inst) return null;

    r.setAttribute("toon-id", inst.toon.id); // for easier manual inspection in the DOM
    // try to grab only the serializable bits that are useful for debugging
    // const safe = {};
    // try {
    //   safe.name = inst.$options?.name || inst.$options?._componentTag;
    //   // copy data/props if they are plain objects
    //   if (inst.$data && typeof inst.$data === 'object') safe.data = inst.$data;
    //   if (inst.$props && typeof inst.$props === 'object') safe.props = inst.$props;
    //   safe.el = inst.$el && inst.$el.tagName;
    // } catch {
    //   // fall back to null if anything goes wrong
    // }
    return inst.toon;
  });
  // payload now contains only simple objects, safe for postMessage
  const message = { type: 'VUE_DEBUG', payload: data };
  window.postMessage(message, '*');

  // mark a global flag so other scripts know the logger has run at least once
  try {
    window.__toonhqVueReady = true;
  } catch {}
  // also send an explicit ready event (listeners can ignore if they don't care)
  window.postMessage({ type: 'VUE_READY' }, '*');
})();
