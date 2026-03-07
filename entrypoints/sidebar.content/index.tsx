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

    /* enlarge dialog used by site; original rule sets 900px !important */
    .group-details-dialog { width: 1000px !important; }

    /* buttons injected inside toon element */
    .toonhq-plus-buttons {
      display: inline-flex;
      gap: 6px;
      margin-left: 8px;
      vertical-align: middle;
    }
    .toonhq-plus-buttons button {
      cursor: pointer;
      border: none;
      background: rgba(0,0,0,0.1);
      border-radius: 4px;
      font-size: 18px;
      line-height: 1;
      padding: 2px 4px;
      transition: background 0.2s;
    }
    .toonhq-plus-buttons button:hover {
      background: rgba(0,0,0,0.15);
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function updateRowButtons(row: HTMLElement, toonName: string) {
  // ensure buttons exist only once per row
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

    const makeBtn = (
      symbol: string,
      title: string,
      listKey: string,
    ) => {
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
        void browser.storage.local
          .get(listKey)
          .then((result) => {
            const list: string[] = Array.isArray(result[listKey]) ? result[listKey] : [];
            const idx = list.indexOf(toonName);
            if (idx >= 0) list.splice(idx, 1);
            else list.push(toonName);
            return browser.storage.local.set({ [listKey]: list });
          })
          .then(() => applyRowHighlights());
      });
      return btn;
    };

    container.append(
      makeBtn('👍', 'Favorite', STORAGE_KEYS.FAVORITES),
      makeBtn('👎', 'Block', STORAGE_KEYS.BLOCKED),
    );

    // place the buttons inside the toon element itself
    const toonEl = row.querySelector('.toon');
    if (toonEl) {
      toonEl.append(container);
    }
  }
}


async function applyRowHighlights() {
  const result: Record<string, unknown> = await browser.storage.local.get([
    STORAGE_KEYS.FAVORITES,
    STORAGE_KEYS.BLOCKED,
  ]);
  const favorites: string[] = Array.isArray(result[STORAGE_KEYS.FAVORITES])
    ? (result[STORAGE_KEYS.FAVORITES] as string[])
    : [];
  const blocked: string[] = Array.isArray(result[STORAGE_KEYS.BLOCKED])
    ? (result[STORAGE_KEYS.BLOCKED] as string[])
    : [];


  const processRow = (row: HTMLElement) => {
    row.classList.remove(ROW_CLASS_FAVORITE, ROW_CLASS_BLOCKED);
    const nameEl = row.querySelector('.toon__name');
    const raw = nameEl?.textContent?.trim();
    if (!raw) return;
    const name = extractToonName(raw);
    if (favorites.includes(name)) row.classList.add(ROW_CLASS_FAVORITE);
    else if (blocked.includes(name)) row.classList.add(ROW_CLASS_BLOCKED);
    updateRowButtons(row, name);

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
  };


  document.querySelectorAll('.group-member-row').forEach((el) => {
    processRow(el as HTMLElement);
  });
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
