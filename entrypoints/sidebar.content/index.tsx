import ReactDOM from 'react-dom/client';
import { SidebarApp } from './SidebarApp';
import { extractToonName } from './toonUtils';
import './style.css';

const STORAGE_KEYS = { FAVORITES: 'toonhq-favorites', BLOCKED: 'toonhq-blocked' } as const;
const ROW_CLASS_FAVORITE = 'toonhq-plus-favorite';
const ROW_CLASS_BLOCKED = 'toonhq-plus-blocked';

function injectHighlightStyles() {
  if (document.querySelector('style[data-toonhq-plus-highlights]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-toonhq-plus-highlights', '');
  style.textContent = `
    tr.group-member-row.${ROW_CLASS_FAVORITE},
    tr.group-member-row.${ROW_CLASS_FAVORITE} td { background: rgba(34, 197, 94, 0.12) !important; }
    tr.group-member-row.${ROW_CLASS_BLOCKED},
    tr.group-member-row.${ROW_CLASS_BLOCKED} td { background: rgba(239, 68, 68, 0.12) !important; }

    /* buttons injected after the toon element */
    .toonhq-plus-buttons {
      display: inline-flex;
      gap: 4px;
      margin-left: 6px;
      vertical-align: middle;
    }
    .toonhq-plus-buttons button {
      cursor: pointer;
      border: none;
      background: none;
      font-size: 16px;
      line-height: 1;
      padding: 0;
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

async function applyRowHighlights() {
  const result = await browser.storage.local.get([
    STORAGE_KEYS.FAVORITES,
    STORAGE_KEYS.BLOCKED,
  ]);
  const favorites: string[] = Array.isArray(result[STORAGE_KEYS.FAVORITES])
    ? result[STORAGE_KEYS.FAVORITES]
    : [];
  const blocked: string[] = Array.isArray(result[STORAGE_KEYS.BLOCKED])
    ? result[STORAGE_KEYS.BLOCKED]
    : [];

  document.querySelectorAll('.group-member-row').forEach((el) => {
    const row = el as HTMLElement;
    row.classList.remove(ROW_CLASS_FAVORITE, ROW_CLASS_BLOCKED);
    const nameEl = row.querySelector('.toon__name');
    const raw = nameEl?.textContent?.trim();
    if (!raw) return;
    const name = extractToonName(raw);

    if (favorites.includes(name)) row.classList.add(ROW_CLASS_FAVORITE);
    else if (blocked.includes(name)) row.classList.add(ROW_CLASS_BLOCKED);

    // make sure the buttons exist and are wired up
    updateRowButtons(row, name);

    // optionally indicate state on the buttons themselves
    const container = row.querySelector('.toonhq-plus-buttons');
    if (container) {
      const [upBtn, downBtn] = Array.from(
        container.querySelectorAll('button'),
      ) as HTMLButtonElement[];
      if (favorites.includes(name)) {
        upBtn.style.opacity = '1';
        downBtn.style.opacity = '0.4';
      } else if (blocked.includes(name)) {
        upBtn.style.opacity = '0.4';
        downBtn.style.opacity = '1';
      } else {
        upBtn.style.opacity = '0.5';
        downBtn.style.opacity = '0.5';
      }
    }
  });
}

// We previously showed a context menu on right-click.  Instead of that
// we now inject two buttons directly into each `.group-member-row` after the
// `.toon` element.  Those buttons manage favorites/blocked lists in storage.

function updateRowButtons(row: HTMLElement, toonName: string) {
  // if buttons already exist, skip creating new ones
  let container = row.querySelector('.toonhq-plus-buttons') as HTMLElement | null;
  if (!container) {
    container = document.createElement('div');
    container.className = 'toonhq-plus-buttons';
    Object.assign(container.style, {
      display: 'inline-flex',
      gap: '4px',
      marginLeft: '6px',
      verticalAlign: 'middle',
    });

    const makeBtn = (symbol: string, title: string, listKey: keyof typeof STORAGE_KEYS) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = symbol;
      btn.title = title;
      Object.assign(btn.style, {
        cursor: 'pointer',
        border: 'none',
        background: 'none',
        fontSize: '16px',
        lineHeight: '1',
        padding: '0',
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void browser.storage.local.get(listKey).then((result) => {
          const list: string[] = Array.isArray(result[listKey]) ? result[listKey] : [];
          if (!list.includes(toonName)) list.push(toonName);
          return browser.storage.local.set({ [listKey]: list });
        }).then(() => applyRowHighlights());
      });
      return btn;
    };

    container.append(
      makeBtn('👍', 'Favorite', STORAGE_KEYS.FAVORITES),
      makeBtn('👎', 'Block', STORAGE_KEYS.BLOCKED),
    );

    const toonEl = row.querySelector('.toon');
    if (toonEl && toonEl.parentNode) {
      toonEl.parentNode.insertBefore(container, toonEl.nextSibling);
    }
  }
}

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {

    injectHighlightStyles();
    applyRowHighlights();
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (STORAGE_KEYS.FAVORITES in changes || STORAGE_KEYS.BLOCKED in changes)
        applyRowHighlights();
    });

    let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (highlightTimeout) clearTimeout(highlightTimeout);
      highlightTimeout = setTimeout(() => {
        highlightTimeout = null;
        applyRowHighlights();
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());

    try {
      const ui = await createShadowRootUi(ctx, {
        name: 'toonhq-plus-sidebar',
        position: 'overlay',
        anchor: 'body',
        append: 'last',
        onMount(container) {
          const wrapper = document.createElement('div');
          container.append(wrapper);
          const root = ReactDOM.createRoot(wrapper);
          root.render(<SidebarApp />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      ui.mount();
    } catch (err) {
      console.error('[ToonHQ Plus] Failed to mount sidebar:', err);
    }
  },
});
