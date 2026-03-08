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

    /* tooltip for boss info */
    .boss-info {
      position: relative;
      cursor: help;
    }
    .boss-info[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      top: 50%;
      left: calc(100% + 12px);
      transform: translateY(-50%);
      background: #1f2937;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 15px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: pre-wrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
      z-index: 10000;
      line-height: 1.5;
      font-weight: 500;
      text-align: left;
      min-width: max-content;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .boss-info[data-tooltip]::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 100%;
      transform: translateY(-50%);
      border-width: 6px;
      border-style: solid;
      border-color: transparent #1f2937 transparent transparent;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
      z-index: 10000;
    }
    .boss-info[data-tooltip]:hover::after,
    .boss-info[data-tooltip]:hover::before {
      opacity: 1;
      visibility: visible;
    }

    /* buttons injected inside toon element */
    .toonhq-plus-buttons {
      display: inline-flex;
      gap: 1em;
      vertical-align: middle;
    }
    .toonhq-plus-buttons button {
      cursor: pointer;
      border: none;
      background: transparent;
      border-radius: 50%;
      padding: 2px;
      transition: transform 0.2s, opacity 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .toonhq-plus-buttons button:hover {
      transform: scale(1.1);
    }

    .group-member-row td:nth-child(3) {
      max-width: 7em;
      width: 7em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

    const makeBtn = (
      symbol: string,
      title: string,
      listKey: string,
    ) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = symbol;
      btn.title = title;
      Object.assign(btn.style, {
        cursor: 'pointer',
        border: 'none',
        background: 'none',
        padding: '0',
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // lookup toonData fresh using row attribute in case closure was stale
        const toonIdAttr = row.getAttribute('toon-id');
        const currentData: ToonData | null =
          toonIdAttr && toons[toonIdAttr] ? toons[toonIdAttr] : null;

        const otherKey = listKey === STORAGE_KEYS.FAVORITES ? STORAGE_KEYS.BLOCKED : STORAGE_KEYS.FAVORITES;

        void browser.storage.local
          .get([listKey, otherKey])
          .then((result) => {
            const list: ToonData[] = Array.isArray(result[listKey]) ? result[listKey] : [];
            const otherList: ToonData[] = Array.isArray(result[otherKey]) ? result[otherKey] : [];

            let existingIndex = -1;
            let otherIndex = -1;

            if (currentData) {
              existingIndex = list.findIndex(
                (t) => t.id === currentData.id || t.name === currentData.name,
              );
              otherIndex = otherList.findIndex(
                (t) => t.id === currentData.id || t.name === currentData.name,
              );
            }

            if (existingIndex >= 0) {
              // Toggle off
              list.splice(existingIndex, 1);
            } else if (currentData) {
              // Add to current list
              const strayIdx = list.findIndex((t) => typeof t === 'string' && t === currentData.name);
              if (strayIdx >= 0) list.splice(strayIdx, 1);
              list.push(currentData);

              // Remove from the other list if it exists there
              if (otherIndex >= 0) {
                otherList.splice(otherIndex, 1);
              } else {
                const otherStrayIdx = otherList.findIndex((t) => typeof t === 'string' && t === currentData.name);
                if (otherStrayIdx >= 0) otherList.splice(otherStrayIdx, 1);
              }
            }
            return browser.storage.local.set({ [listKey]: list, [otherKey]: otherList });
          })
          .then(() => applyRowHighlights());
      });
      return btn;
    };

    const thumbsUpSvg = `<div style="background-color: #1f8454; border-radius: 50%; padding: 6px; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg></div>`;
    const blockSvg = `<div style="background-color: #dc2626; border-radius: 50%; padding: 6px; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg></div>`;

    container.append(
      makeBtn(thumbsUpSvg, 'Add to Toony Toons', STORAGE_KEYS.FAVORITES),
      makeBtn(blockSvg, 'Add to Stinky Toons', STORAGE_KEYS.BLOCKED),
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

    // Hide buttons for owned toons
    const isOwnToon = id && activeToons[id];
    if (isOwnToon) {
      const existingContainer = row.querySelector('.toonhq-plus-buttons');
      if (existingContainer) existingContainer.remove();
    } else {
      updateRowButtons(row, name, data);
    }

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

    // Attach hover listeners for sidebar highlight sync
    if (!row.dataset.toonhqHoverAttached) {
      row.dataset.toonhqHoverAttached = 'true';
      row.addEventListener('mouseenter', () => {
        window.dispatchEvent(
          new CustomEvent('toonhq-plus-toon-hover', { detail: { id, name } })
        );
      });
      row.addEventListener('mouseleave', () => {
        window.dispatchEvent(new CustomEvent('toonhq-plus-toon-unhover'));
      });
    }
  };


  document.querySelectorAll('.group-member-row').forEach((el) => {
    processRow(el as HTMLElement);
  });
}

const getSuitLevel = (suitString: string) => {
  const cogPart = parseInt(suitString.substring(0, 1), 16);
  const isPrestiged = suitString.substring(1, 2) === '2';
  const levelPart = parseInt(suitString.substring(2), 16);

  // Do presiged levels add onto the normal levels? Assume no for now
  let totalValue = isPrestiged ? 78 : ((4 * cogPart) + levelPart - 4);

  // if prestiged levels do add on top of normal levels, use this calculation instead:
  // let totalValue = isPrestiged ? (78 + (levelPart - 8)) : ((4 * cogPart) + levelPart - 4);

  return totalValue;
};

const getPinkSlips = (value: number): number => {
  // Determine Pink Slips based on the Difficulty Tier table
  if (value >= 63) {
    return 6; // Tier 5: 63+ value
  } else if (value >= 48) {
    return 5; // Tier 4: 48-62 value
  } else if (value >= 33) {
    return 4; // Tier 3: 33-47 value
  } else if (value >= 17) {
    return 3; // Tier 2: 17-32 value
  } else if (value >= 1) {
    return 2; // Tier 1: 1-16 value
  } else {
    return 0; // Below minimum requirements
  }
}

const getCogNameForLevel = (level: number, suit: string) => {
  if (level <= 5) {
    return (suit === "lawbot" ? "Bottom Feeder" : "Flunky") + " Lv " + level;
  } else if (level <= 10) {
    return (suit === "lawbot" ? "Bloodsucker" : "Pencil Pusher") + " Lv " + (level - 5);
  } else if (level <= 15) {
    return (suit === "lawbot" ? "Double Talker" : "Yesman") + " Lv " + (level - 10);
  } else if (level <= 20) {
    return (suit === "lawbot" ? "Ambulance Chaser" : "Micromanager") + " Lv " + (level - 15);
  } else if (level <= 25) {
    return (suit === "lawbot" ? "Back Stabber" : "Downsizer") + " Lv " + (level - 20);
  } else if (level <= 30) {
    return (suit === "lawbot" ? "Spin Doctor" : "Head Hunter") + " Lv " + (level - 25);
  } else if (level <= 35) {
    return (suit === "lawbot" ? "Legal Eagle" : "Corporate Raider") + " Lv " + (level - 30);
  } else {
    return (suit === "lawbot" ? "Big Wig" : "The Big Cheese") + " Lv " + (level - 35);
  }
}

interface CJDifficultyTier {
  tier: number;
  minlevel: number;
  lawyers: number;
  gavels: number;
  evidence: number;
  hasBonusWeight: boolean;
  laffHeal: number;
}

const CJ_DIFFICULTY_TIERS: CJDifficultyTier[] = [
  { tier: 9, minlevel: 70, lawyers: 10, gavels: 8, evidence: 22, hasBonusWeight: true, laffHeal: 4 },
  { tier: 8, minlevel: 61, lawyers: 9, gavels: 8, evidence: 24, hasBonusWeight: true, laffHeal: 4 },
  { tier: 7, minlevel: 53, lawyers: 9, gavels: 7, evidence: 26, hasBonusWeight: true, laffHeal: 3 },
  { tier: 6, minlevel: 44, lawyers: 8, gavels: 7, evidence: 28, hasBonusWeight: false, laffHeal: 3 },
  { tier: 5, minlevel: 36, lawyers: 8, gavels: 6, evidence: 30, hasBonusWeight: false, laffHeal: 2 },
  { tier: 4, minlevel: 27, lawyers: 8, gavels: 6, evidence: 32, hasBonusWeight: false, laffHeal: 2 },
  { tier: 3, minlevel: 19, lawyers: 8, gavels: 5, evidence: 34, hasBonusWeight: false, laffHeal: 1 },
  { tier: 2, minlevel: 10, lawyers: 8, gavels: 5, evidence: 36, hasBonusWeight: false, laffHeal: 1 },
  { tier: 1, minlevel: 1, lawyers: 8, gavels: 4, evidence: 38, hasBonusWeight: false, laffHeal: 1 },
];

const getCJDifficultyTier = (value: number): CJDifficultyTier => {
  // Determine the difficulty tier based on the value
  return CJ_DIFFICULTY_TIERS.find(t => value >= t.minlevel) || CJ_DIFFICULTY_TIERS[8];
};

const updateBossInfo = () => {
  const rows = document.querySelectorAll('.group-member-row');
  const bossTypes = { 'CEO': 'bossbot', 'CJ': 'lawbot', 'CFO': 'bossbot' };
  const thisBossInfo = document.querySelector("h4.boss-info");
  const thisBoss = document.querySelector('.group-details-dialog h4')?.textContent?.trim();
  const thisBossKey = thisBoss ? bossTypes[thisBoss as keyof typeof bossTypes] : null;
  if (!thisBossKey) return;

  let suitValues: number[] = [];
  for (const row of rows) {
    const id = row.getAttribute('toon-id');
    if (id && toons[id]) {
      const t = toons[id];
      const cogString = t[thisBossKey] || "";
      const suitValue = getSuitLevel(cogString);
      suitValues.push(suitValue);
    }
  }
  const averageSuitValue = Math.round(suitValues.reduce((sum, val) => sum + val, 0) / suitValues.length) || 0;

  if (thisBossKey === 'lawbot') {
    const tier = getCJDifficultyTier(averageSuitValue);
    const suitString = getCogNameForLevel(averageSuitValue, thisBossKey);
    const text = `(${tier.lawyers} lawyers)`;
    if (thisBossInfo && tier) {
      const tooltipText =
        `Average: ${suitString}
---------------------------
Tier ${tier.tier}
Gavels: ${tier.gavels}
Evidence: ${tier.evidence}
Bonus Weight: ${tier.hasBonusWeight ? 'Yes' : 'No'}
Laff Heal: ${tier.laffHeal}`;

      if (thisBossInfo.textContent !== text || thisBossInfo.getAttribute('data-tooltip') !== tooltipText) {
        thisBossInfo.textContent = text;
        thisBossInfo.setAttribute('data-tooltip', tooltipText);
      }
    }
  } else //if (thisBossKey === 'bossbot') 
  {
    const pinkSlips = getPinkSlips(averageSuitValue);
    const suitString = getCogNameForLevel(averageSuitValue, thisBossKey);
    const text = `(${pinkSlips} Pink Slips)`;
    if (thisBossInfo && pinkSlips !== null) {
      const tooltipText =
        `Average: ${suitString}
---------------------------
1-16: 2 Slips
17-32: 3 Slips
33-47: 4 Slips
48-62: 5 Slips
63+: 6 Slips`;

      if (thisBossInfo.textContent !== text || thisBossInfo.getAttribute('data-tooltip') !== tooltipText) {
        thisBossInfo.textContent = text;
        thisBossInfo.setAttribute('data-tooltip', tooltipText);
      }
    }
  }

}
const groupsState: Record<number, any> = {};
const activeToons: Record<number, any> = {};

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    try {
      const toonsResp = await fetch('https://toonhq.org/api/toons/');
      const toonsData = await toonsResp.json();
      if (Array.isArray(toonsData)) {
        toonsData.forEach((toon: any) => {
          activeToons[toon.id] = toon;
        });
        console.log('[ToonHQ+] Initial active toons loaded:', Object.keys(activeToons).length, 'toons.');
        browser.storage.local.set({ 'toonhqplus-active-toon-ids': Object.keys(activeToons).map(Number) });
      }
    } catch (e) {
      console.error('[ToonHQ+] Failed to fetch active toons', e);
    }

    const syncGroupHistory = (group: any) => {
      if (!group || !Array.isArray(group.members)) return;

      const hasActiveToon = group.members.some((m: any) => m.toon && activeToons[m.toon.id]);
      if (!hasActiveToon) return;

      browser.storage.local.get(['toonhqplus-history', 'toonhqplus-toons']).then((result) => {
        const history = (result['toonhqplus-history'] as Record<number, any>) || {};
        const toonsCache = (result['toonhqplus-toons'] as Record<number, any>) || {};

        // Update toon cache
        group.members.forEach((m: any) => {
          if (m.toon && m.toon.id) {
            toonsCache[m.toon.id] = {
              id: m.toon.id,
              name: m.toon.name,
              photo: m.toon.photo,
              species: m.toon.species,
              lastSeen: new Date().toISOString()
            };
          }
        });

        if (history[group.id]) {
          const memberMap = new Map();
          // Safety check for m.toon and m.toon.id
          history[group.id].members.forEach((m: any) => {
            if (m.toon && m.toon.id) {
              memberMap.set(m.toon.id, m);
            }
          });
          group.members.forEach((m: any) => {
            if (m.toon && m.toon.id) {
              memberMap.set(m.toon.id, m);
            }
          });
          history[group.id].members = Array.from(memberMap.values());
        } else {
          history[group.id] = {
            id: group.id,
            type: group.type,
            created: group.created,
            members: [...group.members],
          };
        }

        browser.storage.local.set({
          'toonhqplus-history': history,
          'toonhqplus-toons': toonsCache
        });
      });
    };

    try {
      const resp = await fetch('https://toonhq.org/api/groups/list/1/');
      const data = await resp.json();
      if (data && Array.isArray(data.groups)) {
        data.groups.forEach((group: any) => {
          groupsState[group.id] = group;
          syncGroupHistory(group);
        });
        console.log('[ToonHQ+] Initial groups state loaded:', Object.keys(groupsState).length, 'groups.');
      }
    } catch (e) {
      console.error('[ToonHQ+] Failed to fetch initial groups list', e);
    }

    const ws = new WebSocket('wss://toonhq.org/socket.io/?protocol=3&EIO=4&transport=websocket');

    ws.addEventListener('open', () => {
      console.log('[ToonHQ+] Direct WebSocket connection opened, sending initialization sequence...');
      // 4 = Engine.io message, 0 = connect
      ws.send('40');

      // 4 = Engine.io message, 2 = event, 0 = namespace/ID
      ws.send('420["track","groups",1]');
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        const str = event.data;

        // Handle Socket.io Ping (2)
        if (str === '2') {
          ws.send('3'); // send Pong
          return;
        }

        // Handle Event Payloads
        const match = str.match(/^(\d+)(.*)$/);
        if (match) {
          const prefix = match[1];
          const payloadString = match[2];

          if (payloadString) {
            try {
              const payload = JSON.parse(payloadString);
              if (Array.isArray(payload) && typeof payload[0] === 'string') {
                const eventName = payload[0];
                const data = payload[1];
                if (eventName === 'group_created') {
                  groupsState[data.id] = data;
                  syncGroupHistory(data);
                } else if (eventName === 'group_disbanded') {
                  delete groupsState[data.id];
                } else if (eventName === 'member_joined') {
                  if (groupsState[data.group]) {
                    groupsState[data.group].members.push(data);
                    syncGroupHistory(groupsState[data.group]);
                  }
                } else if (eventName === 'member_left') {
                  if (groupsState[data.group]) {
                    groupsState[data.group].members = groupsState[data.group].members.filter(
                      (m: any) => m.id !== data.id
                    );
                  }
                }
              } else {
                console.log(`[ToonHQ+] Socket Message (${prefix}):`, payload);
              }
            } catch (e) {
              console.log(`[ToonHQ+] Socket Msg (Raw ${prefix}):`, payloadString);
            }
          }
        }
      }
    });

    injectHighlightStyles();
    // also ensure any .group-details-dialog gets forced to 1000px width inline
    const fixDialog = (d: HTMLElement) => {
      d.style.setProperty('width', '980px', 'important');
      // if dialog contains an h4, log its text and maybe append info
      const h4 = d.querySelector('h4');
      if (h4) {
        const title = h4.innerText.trim();
        if (title === 'CEO' || title === 'CJ') {
          // create a wrapper div to hold both headings
          const wrapper = document.createElement('div');
          wrapper.className = 'text-center mt-2 mb-3';
          // flex-center with gap
          wrapper.style.display = 'flex';
          wrapper.style.justifyContent = 'center';
          wrapper.style.alignItems = 'center';
          wrapper.style.gap = '1em';

          // move the original h4 into wrapper
          const parent = h4.parentElement;
          if (parent) {
            parent.insertBefore(wrapper, h4);
            wrapper.appendChild(h4);
          }

          // new h4 for boss info (pink slips, lawyer count, etc)
          const newH4 = document.createElement('h4');
          newH4.classList.add('boss-info');
          wrapper.appendChild(newH4);
        }
        setTimeout(() => {
          updateBossInfo();
        }, 500);
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


    updateBossInfo();
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
        updateBossInfo();
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
