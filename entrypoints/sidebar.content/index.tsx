import ReactDOM from 'react-dom/client';
import { SidebarApp } from './SidebarApp';
import { extractToonName } from './toonUtils';
import './style.css';



const STORAGE_KEYS = { FAVORITES: 'toonhq-favorites', BLOCKED: 'toonhq-blocked' } as const;
const ROW_CLASS_FAVORITE = 'toonhq-plus-favorite';
const ROW_CLASS_BLOCKED = 'toonhq-plus-blocked';

interface ToonData {
  id: number;
  name: string;
  photo?: string;
  // include any other fields we care about
  [key: string]: any;
}

const toons: Record<string, ToonData> = {};

// track whether we've seen any Vue instances from the page yet and queue dialog
// elements until that happens.  moved from lower in the file to avoid runtime
// reference errors.
let vueReady = false;
const pendingFixes: HTMLElement[] = [];

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
    .group-details-dialog { width: 1000px !important; max-width: 1000px !important; }

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

function updateRowButtons(row: HTMLElement, toonName: string, toonData: ToonData | null) {
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
        // lookup toonData fresh using row attribute in case closure was stale
        const toonIdAttr = row.getAttribute('toon-id');
        const currentData: ToonData | null =
          toonIdAttr && toons[toonIdAttr] ? toons[toonIdAttr] : null;

        void browser.storage.local
          .get(listKey)
          .then((result) => {
            const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
            let existingIndex = -1;
            if (currentData) {
              existingIndex = list.findIndex(
                (t) => t.id === currentData.id || t.name === currentData.name,
              );
            }
            if (existingIndex >= 0) {
              list.splice(existingIndex, 1);
            } else if (currentData) {
              // remove any stray string-only entries with same name
              const strayIdx = list.findIndex((t) => typeof t === 'string' && t === currentData.name);
              if (strayIdx >= 0) list.splice(strayIdx, 1);
              // push normally; sidebar renders reversed order
              list.push(currentData);
            }
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
  // normalize stored values to ToonData[]; previous versions stored string names
  const normalize = (raw: unknown): ToonData[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      if (typeof item === 'string') {
        return { id: -1, name: item };
      }
      return item as ToonData;
    });
  };

  const favorites: ToonData[] = normalize(result[STORAGE_KEYS.FAVORITES]);
  const blocked: ToonData[] = normalize(result[STORAGE_KEYS.BLOCKED]);


  const processRow = (row: HTMLElement) => {
    row.classList.remove(ROW_CLASS_FAVORITE, ROW_CLASS_BLOCKED);
    const nameEl = row.querySelector('.toon__name');
    const raw = nameEl?.textContent?.trim();
    if (!raw) return;
    const name = extractToonName(raw);
    const id = row.getAttribute('toon-id');
    const data: ToonData | null = id && toons[id] ? toons[id] : null;

    const favIds = new Set(favorites.map((t) => t.id?.toString()));
    const blkIds = new Set(blocked.map((t) => t.id?.toString()));
    const favNames = new Set(favorites.map((t) => t.name));
    const blkNames = new Set(blocked.map((t) => t.name));

    if ((id && favIds.has(id)) || favNames.has(name)) row.classList.add(ROW_CLASS_FAVORITE);
    else if ((id && blkIds.has(id)) || blkNames.has(name)) row.classList.add(ROW_CLASS_BLOCKED);

    updateRowButtons(row, name, data);

    const container = row.querySelector('.toonhq-plus-buttons');
    if (container) {
      const [upBtn, downBtn] = Array.from(
        container.querySelectorAll('button'),
      ) as HTMLButtonElement[];
      // adjust button opacities using the same id/name logic as above
      const favIds = new Set(favorites.map((t) => t.id?.toString()));
      const blkIds = new Set(blocked.map((t) => t.id?.toString()));
      const favNames = new Set(favorites.map((t) => t.name));
      const blkNames = new Set(blocked.map((t) => t.name));
      if ((id && favIds.has(id)) || favNames.has(name)) {
        upBtn.style.opacity = '1';
        downBtn.style.opacity = '0.4';
      } else if ((id && blkIds.has(id)) || blkNames.has(name)) {
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
    // also ensure any .group-details-dialog gets forced to 1000px width inline
    const fixDialog = (d: HTMLElement) => {
      d.style.setProperty('width', '1000px', 'important');
      // if dialog contains an h4, log its text and maybe append info
      const h4 = d.querySelector('h4');
      if (h4) {
        console.debug('toonhq-plus dialog h4:', h4.innerText);
        const title = h4.innerText.trim();
        if (title === 'CEO' || title === 'CJ' || title === 'CFO') {
          // create a wrapper div to hold both headings
          const wrapper = document.createElement('div');
          wrapper.className = 'text-center mt-2 mb-3';
          // flex-center with gap
          wrapper.style.display = 'flex';
          wrapper.style.justifyContent = 'center';
          wrapper.style.alignItems = 'center';
          wrapper.style.gap = '2em';

          // move the original h4 into wrapper
          const parent = h4.parentElement;
          if (parent) {
            parent.insertBefore(wrapper, h4);
            wrapper.appendChild(h4);
          }

          // new h4 for fires
          const newH4 = document.createElement('h4');
          newH4.textContent = '0 Fires';
          wrapper.appendChild(newH4);

          // extra debug: iterate through rows and log name + relevant bot stat
          const statKey = title === 'CEO' ? 'bossbot' : title === 'CJ' ? 'lawbot' : 'cashbot';
          // because the logger may not have written toon-id yet, retry a few times
          const logRows = (tries = 0) => {
            const rows = Array.from(document.querySelectorAll('.group-member-row'));
            let pending = false;
            rows.forEach((row) => {
              const id = row.getAttribute('toon-id');
              if (id && !toons[id]) pending = true;
            });
            if (pending && tries < 5) {
              setTimeout(() => logRows(tries + 1), 100);
              return;
            }
            rows.forEach((row) => {
              const id = row.getAttribute('toon-id');
              if (id) {
                const t = toons[id];
                if (t) console.debug('toon stat', t.name, statKey, t[statKey]);
              }
            });
          };
          logRows();
        }
      }
    };
    document.querySelectorAll('.group-details-dialog').forEach(el => {
      const h = el as HTMLElement;
      if (vueReady) fixDialog(h);
      else pendingFixes.push(h);
    });
    const dialogObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const handle = (h: HTMLElement) => {
            if (vueReady) fixDialog(h);
            else pendingFixes.push(h);
          };
          if (node.matches('.group-details-dialog')) handle(node as HTMLElement);
          node.querySelectorAll('.group-details-dialog').forEach(el => handle(el as HTMLElement));
        });
      }
    });
    dialogObserver.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => dialogObserver.disconnect());

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
        // also re-run the vue logger so new rows get logged
        injectVueLogger();
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());

    // state to hold whether the page's main Vue app has been observed.
    // debug helper: log Vue instances for rows with class "group-member-row".
    function injectVueLogger() {
      // listen for messages coming back from page script
      window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const type = e.data?.type;
        if (type === 'VUE_DEBUG') {
          const payload: ToonData[] = e.data.payload || [];
          let sawOne = false;
          for (const toondata of payload) {
            if (toondata && toondata.id != null) {
              toons[toondata.id] = toondata;
              sawOne = true;
            }
          }
          // if this is our first useful payload, consider Vue "ready"
          if (!vueReady && sawOne) setReady();
        } else if (type === 'VUE_READY') {
          // an explicit hint that Vue has finished bootstrapping
          if (!vueReady) setReady();
        }
      });

      function setReady() {
        vueReady = true;
        pendingFixes.forEach(el => fixDialog(el));
        pendingFixes.length = 0;
      }


      // load an external script from the extension (CSP allows chrome-extension://)
      const script = document.createElement('script');
      // runtime.getURL is typed narrowly by wxt; cast to any to bypass
      script.src = (browser.runtime as any).getURL('vue-logger.js');
      script.onload = () => script.remove();
      document.documentElement.appendChild(script);
    }

    // run the logger once initially (or you could attach it to observer updates)
    injectVueLogger();

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
