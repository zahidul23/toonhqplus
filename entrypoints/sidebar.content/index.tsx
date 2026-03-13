import ReactDOM from 'react-dom/client';
import { SidebarApp } from './SidebarApp';
import { extractToonName } from './toonUtils';
import './style.css';
import {
  openDB,
  migrateFromLocalStorage,
  getAllFromList,
  getToon,
  getToonByHashId,
  putToon,
  putToons,
  putGroup,
  putGroupMember,
  putGroupMembers,
  markMemberLeft,
  getAllGroups,
  getAllGroupMembers,
  getGroupMembers,
  getSetting,
  setSetting,
  type ToonRecord,
  type GroupRecord,
  type GroupMemberRecord,
} from './db';



const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
  NAVBAR_CONFIG: 'toonhqplus-navbar-config',
  BOSS_INFO_ENABLED: 'toonhqplus-boss-info-enabled',
} as const;
const ROW_CLASS_FAVORITE = 'toonhq-plus-favorite';
const ROW_CLASS_BLOCKED = 'toonhq-plus-blocked';


interface ToonData {
  id: string;
  name: string;
  photo?: string;
  // include any other fields we care about
  [key: string]: any;
}

const toons: Record<string, ToonData> = {};

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
    .group-details-dialog { width: 980px !important; max-width: 980px !important; }

    /* tooltip for boss info */
    .boss-info {
      position: relative;
      cursor: help;
    }
    .boss-info-tooltip {
      position: absolute;
      top: 50%;
      left: calc(100% + 12px);
      transform: translateY(-50%);
      background: #064e3b;
      color: #fff;
      padding: 14px 18px;
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
      z-index: 10000;
      min-width: 240px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.4);
      pointer-events: none;
      backdrop-filter: blur(8px);
      line-height: 1.4;
      text-transform: none;
      letter-spacing: normal;
    }
    .boss-info-tooltip.lawbot-tip {
      padding: 12px 16px;
    }
    .boss-info:hover .boss-info-tooltip {
      opacity: 1;
      visibility: visible;
    }
    .boss-info-tooltip::before {
      content: '';
      position: absolute;
      top: 50%;
      right: 100%;
      transform: translateY(-50%);
      border-width: 6px;
      border-style: solid;
      border-color: transparent #064e3b transparent transparent;
    }
    .tooltip-boss-info {
      display: flex;
      flex-direction: column;
      gap: 6px 12px;
    }
    .tooltip-label {
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      text-align: right;
    }
    .tooltip-value {
      color: #fff;
      font-weight: 500;
      width: 60px;
      text-align: right;
    }
    .bossbot-info .tooltip-value {
      width: 36px;
    }
    .tooltip-divider {
      grid-column: 1 / -1;
      height: 1px;
      background: rgba(16, 185, 129, 0.2);
      margin: 6px 0;
    }
    .tooltip-header {
      grid-column: 1 / -1;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      margin-bottom: -2px;
      text-align: center;
    }
    .tooltip-header.emerald { color: #10b981; font-size: 13px; }
    .tooltip-header.gray { color: #9ca3af; }
    
    .tooltip-sub-header {
      grid-column: 1 / -1;
      font-weight: 800;
      color: #10b981;
      margin-bottom: 4px;
      font-size: 14px;
      text-align: center;
    }
    .tooltip-tier-row {
      gap: 12px;
      padding: 4px 8px;
      margin: 0 -8px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
    }
    .tooltip-tier-row .tooltip-label {
      text-align: right;
    }
    .tooltip-tier-row .tooltip-value {
      text-align: left;
    }
    .tooltip-tier-row.active {
      background: rgba(16, 185, 129, 0.25);
      color: #fff;
      font-weight: 700;
      box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.4);
    }
    .tooltip-tier-row.active .tooltip-label {
      color: #34d399;
    }
    .tooltip-tier-row.active .tooltip-value {
      color: #fff;
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
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const toonIdAttr = row.getAttribute('toon-id');
        let currentData: ToonData | null =
          toonIdAttr && toons[toonIdAttr] ? toons[toonIdAttr] : null;

        // If row uses hash id (#...), resolve toon from DB: first by numeric id, then by hash
        if (!currentData && toonIdAttr?.startsWith('#')) {
          const afterHash = toonIdAttr.slice(1);
          let rec: ToonRecord | undefined =
            /^\d+$/.test(afterHash) ? await getToon(afterHash) : undefined;
          if (!rec) rec = await getToonByHashId(afterHash) ?? await getToonByHashId(toonIdAttr);
          if (rec) {
            toons[toonIdAttr] = rec as ToonData;
            currentData = rec as ToonData;
          }
        }

        if (!currentData || !toonIdAttr) return;

        // Resolve current list membership from IndexedDB (use resolved toon's numeric id)
        Promise.all([
          getAllFromList('toony_toons'),
          getAllFromList('stinky_toons'),
        ]).then(([favs, blks]) => {
          const tid = currentData!.id;
          const isFavorited = favs.includes(tid);
          const isBlocked = blks.includes(tid);
          const currentListKey = isFavorited ? STORAGE_KEYS.FAVORITES : isBlocked ? STORAGE_KEYS.BLOCKED : null;

          let type: 'add' | 'remove' | 'move' = 'add';
          if (currentListKey === listKey) {
            type = 'remove';
          }

          window.dispatchEvent(new CustomEvent('toonhqplus-request-dialog', {
            detail: {
              type,
              listKey,
              toon: currentData,
              source: 'main'
            }
          }));
        });
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
  const [favorites, blocked] = await Promise.all([
    getAllFromList('toony_toons'),
    getAllFromList('stinky_toons'),
  ]);

  const processRow = async (row: HTMLElement) => {
    row.classList.remove(ROW_CLASS_FAVORITE, ROW_CLASS_BLOCKED);
    const nameEl = row.querySelector('.toon__name');
    const raw = nameEl?.textContent?.trim();
    if (!raw) return;
    const name = extractToonName(raw);
    const idAttr = row.getAttribute('toon-id');

    // Resolve toon: check in-memory cache first, then DB (supports hash IDs)
    let data: ToonData | null = idAttr && toons[idAttr] ? toons[idAttr] : null;
    if (!data && idAttr) {
      let rec: ToonRecord | undefined;
      if (idAttr.startsWith('#')) {
        const afterHash = idAttr.slice(1);
        rec = /^\d+$/.test(afterHash) ? await getToon(afterHash) : undefined;
        if (!rec) rec = await getToonByHashId(afterHash) ?? await getToonByHashId(idAttr);
      } else {
        rec = await getToon(idAttr);
      }
      if (rec) {
        toons[idAttr] = rec as ToonData;
        data = rec as ToonData;
      }
    }

    const favIds = new Set(favorites);
    const blkIds = new Set(blocked);
    const resolvedId = data?.id ?? idAttr ?? null;

    if (resolvedId != null && favIds.has(resolvedId)) row.classList.add(ROW_CLASS_FAVORITE);
    else if (resolvedId != null && blkIds.has(resolvedId)) row.classList.add(ROW_CLASS_BLOCKED);

    // Hide buttons for owned toons
    const isOwnToon = idAttr && activeToons[String(idAttr)];
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

      const isFav = resolvedId != null && favIds.has(resolvedId);
      const isBlk = resolvedId != null && blkIds.has(resolvedId);

      if (isFav) {
        upBtn.style.opacity = '1';
        upBtn.title = `Remove from Toony Toons`;
        downBtn.style.opacity = '0.4';
        downBtn.title = `Add to Stinky Toons`;
      } else if (isBlk) {
        upBtn.style.opacity = '0.4';
        upBtn.title = `Add to Toony Toons`;
        downBtn.style.opacity = '1';
        downBtn.title = `Remove from Stinky Toons`;
      } else {
        upBtn.style.opacity = '0.5';
        upBtn.title = `Add to Toony Toons`;
        downBtn.style.opacity = '0.5';
        downBtn.title = `Add to Stinky Toons`;
      }
    }

    // Attach hover listeners for sidebar highlight sync
    if (!row.dataset.toonhqHoverAttached) {
      row.dataset.toonhqHoverAttached = 'true';
      row.addEventListener('mouseenter', () => {
        window.dispatchEvent(
          new CustomEvent('toonhq-plus-toon-hover', { detail: { id: idAttr, name } })
        );
      });
      row.addEventListener('mouseleave', () => {
        window.dispatchEvent(new CustomEvent('toonhq-plus-toon-unhover'));
      });
    }
  };

  const rows = Array.from(document.querySelectorAll('.group-member-row')) as HTMLElement[];
  await Promise.all(rows.map(r => processRow(r)));
}

const getSuitLevel = (suitString: string) => {
  const cogPart = parseInt(suitString.substring(0, 1), 16);
  const isPrestiged = suitString.substring(1, 2) === '2';
  const levelPart = parseInt(suitString.substring(2), 16);

  if (levelPart == 0) return 1;

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
    return (suit === "lawbot" ? "Bottom Feeder" : "Flunky") + " " + level;
  } else if (level <= 10) {
    return (suit === "lawbot" ? "Bloodsucker" : "Pencil Pusher") + " " + (level - 4);
  } else if (level <= 15) {
    return (suit === "lawbot" ? "Double Talker" : "Yesman") + " " + (level - 8);
  } else if (level <= 20) {
    return (suit === "lawbot" ? "Ambulance Chaser" : "Micromanager") + " " + (level - 12);
  } else if (level <= 25) {
    return (suit === "lawbot" ? "Back Stabber" : "Downsizer") + " " + (level - 16);
  } else if (level <= 30) {
    return (suit === "lawbot" ? "Spin Doctor" : "Head Hunter") + " " + (level - 20);
  } else if (level <= 35) {
    return (suit === "lawbot" ? "Legal Eagle" : "Corporate Raider") + " " + (level - 24);
  } else {
    return (suit === "lawbot" ? "Big Wig" : "The Big Cheese") + " " + (level - 28);
  }
}

const getCogValueFromName = (name: string) => {
    const cleanName = name.replace(/<[^>]*>?/gm, ' ');
    if (cleanName.includes("2.0")) return 78;

    const levelMatch = cleanName.match(/Level\s+(\d+)/i) || cleanName.match(/(\d+)$/);
    const level = levelMatch ? parseInt(levelMatch[1]) : 1;

    const offsets = {
      "Bottom Feeder": 0, "Flunky": 0,
      "Bloodsucker": 4, "Pencil Pusher": 4,
      "Double Talker": 8, "Yesman": 8,
      "Ambulance Chaser": 12, "Micromanager": 12,
      "Back Stabber": 16, "Downsizer": 16,
      "Spin Doctor": 20, "Head Hunter": 20,
      "Legal Eagle": 24, "Corporate Raider": 24,
      "Big Wig": 28, "The Big Cheese": 28,
    };

    for (const [cog, offset] of Object.entries(offsets)) {
      if (cleanName.includes(cog)) {
        return level + offset;
      }
    }
    return level;
  };

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

const BOSS_CONFIG: Record<string, string> = {
  'CEO': 'bossbot',
  'CJ': 'lawbot',
};

const LAWYER_THRESHOLDS = [
  { minSuitValue: 70, lawyerCount: 10 },
  { minSuitValue: 53, lawyerCount: 9 },
  { minSuitValue: 1, lawyerCount: 8 }
];

const PINK_SLIP_THRESHOLDS = [
  { minSuitValue: 63, slipCount: 6 },
  { minSuitValue: 48, slipCount: 5 },
  { minSuitValue: 33, slipCount: 4 },
  { minSuitValue: 17, slipCount: 3 },
  { minSuitValue: 1, slipCount: 2 }
];

const renderTierRow = (label: string, value: string | number, isActive: boolean, extraClass = '') => `
  <div class="tooltip-tier-row ${isActive ? 'active' : ''} ${extraClass}">
    <div class="tooltip-label">${label}</div>
    <div class="tooltip-value">${value}</div>
  </div>
`;

const renderLawbotTooltip = (tierData: CJDifficultyTier, suitString: string, bossKey: string) => {
  const lawyerRowsHtml = LAWYER_THRESHOLDS.map(threshold =>
    renderTierRow(`${getCogNameForLevel(threshold.minSuitValue, bossKey)}+`, `${threshold.lawyerCount} Lawyers`, tierData.lawyers === threshold.lawyerCount)
  ).join('');

  const statsList = [
    { label: 'Lawyers', value: tierData.lawyers },
    { label: 'Gavels', value: tierData.gavels },
    { label: 'Bonus Weight', value: tierData.hasBonusWeight ? 'Yes' : 'No' },
    { label: 'Evidence Count', value: tierData.evidence },
    { label: 'Evidence Heal', value: tierData.laffHeal + " Laff" }
  ];

  const statsHtml = statsList.map(stat => renderTierRow(stat.label, stat.value, false)).join('');

  return `
    <div class="tooltip-boss-info">
      <div class="tooltip-header">Group Average</div>
      <div class="tooltip-sub-header">${suitString}</div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-header emerald">Tier ${tierData.tier}</div>
      ${statsHtml}
      <div class="tooltip-divider"></div>
      <div class="tooltip-header gray">Lawyer Thresholds</div>
      ${lawyerRowsHtml}
    </div>
  `;
};

const renderBossbotTooltip = (suitString: string, currentPinkSlips: number, bossKey: string) => {
  const rowsHtml = PINK_SLIP_THRESHOLDS.map(threshold =>
    renderTierRow(`${getCogNameForLevel(threshold.minSuitValue, bossKey)}+`, `${threshold.slipCount} Slips`, currentPinkSlips === threshold.slipCount, 'bossbot-info')
  ).join('');

  return `
    <div class="tooltip-boss-info">
      <div class="tooltip-header">Group Average</div>
      <div class="tooltip-sub-header">${suitString}</div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-header gray">Pink Slip Thresholds</div>
      ${rowsHtml}
    </div>
  `;
};

const updateBossInfo = () => {
  if (bossInfoEnabled === false) {
    const dialog = document.querySelector('.group-details-dialog');
    const thisBossInfo = dialog?.querySelector(".boss-info");
    if (thisBossInfo) {
      // If it exists but we are disabled, hide/remove it
      thisBossInfo.remove();
      // If we made a wrapper, we might need to revert that too, but removing the info is usually enough
    }
    return;
  }
  const dialog = document.querySelector('.group-details-dialog');
  const thisBossInfo = dialog?.querySelector(".boss-info");
  if (!dialog || !thisBossInfo) return;

  const thisBossName = dialog.querySelector('h4')?.textContent?.trim();
  const thisBossKey = thisBossName ? BOSS_CONFIG[thisBossName] : null;
  if (!thisBossKey) return;

  const rows = dialog.querySelectorAll('.group-member-row');
  let suitValues: number[] = [];
  for (const row of rows) {
    const suitImg = row.querySelector('.toon__track--suit img');
    if (suitImg instanceof HTMLImageElement && suitImg.title) {
      suitValues.push(getCogValueFromName(suitImg.title));
    }
  }

  if (suitValues.length === 0) return;
  const averageSuitValue = Math.round(suitValues.reduce((sum, value) => sum + value, 0) / suitValues.length);
  const suitString = getCogNameForLevel(averageSuitValue, thisBossKey);

  let infoText = '';
  let html = '';

  if (thisBossKey === 'lawbot') {
    const tierData = getCJDifficultyTier(averageSuitValue);
    infoText = `(${tierData.lawyers} lawyers)`;
    html = renderLawbotTooltip(tierData, suitString, thisBossKey);
  } else {
    const currentPinkSlips = getPinkSlips(averageSuitValue);
    infoText = `(${currentPinkSlips} Pink Slips)`;
    html = renderBossbotTooltip(suitString, currentPinkSlips, thisBossKey);
  }

  // Ensure tooltip exists
  let tooltipEl = thisBossInfo.querySelector('.boss-info-tooltip') as HTMLElement | null;
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = `boss-info-tooltip ${thisBossKey === 'lawbot' ? 'lawbot-tip' : ''}`;
    thisBossInfo.appendChild(tooltipEl);
  }

  // Update content only if changed
  if (thisBossInfo.firstChild?.textContent !== infoText || tooltipEl.innerHTML !== html) {
    if (thisBossInfo.firstChild?.nodeType === Node.TEXT_NODE) {
      thisBossInfo.firstChild.textContent = infoText;
    } else {
      thisBossInfo.prepend(document.createTextNode(infoText));
    }
    tooltipEl.innerHTML = html;
  }
}
const CONFIGURABLE_NAV_ITEMS: Record<string, { label: string, href: string, colorClass: string }> = {
  'invasions': { label: 'Invasions', href: '/invasions/', colorClass: 'blue' },
  'groups': { label: 'Groups', href: '/groups/', colorClass: 'green' },
  'fishing': { label: 'Fishing', href: '/fishing/', colorClass: 'fishing' },
  'ccg': { label: 'CCG', href: '/ccg/', colorClass: 'steel' },
  'field-offices': { label: 'Field Offices', href: '/field-offices/', colorClass: 'steel' },
  'gardening': { label: 'Gardening', href: '/gardening/', colorClass: 'green' },
  'doodles': { label: 'Pet Shop Doodles', href: '/doodles/', colorClass: 'shop' },
};

function applyNavbarCustomization(config: { pinned: string[], dropdown: string[] }) {
  const navbarUl = document.querySelector('ul.navbar-nav.ml-auto');
  if (!navbarUl) return;

  // Force synchronize active state in case Vue Router detached elements
  navbarUl.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href');
    // Ensure we don't accidentally match empty string or root on everything
    if (href && href.length > 1 && window.location.pathname.endsWith(href)) {
      a.classList.add('router-link-exact-active', 'active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('router-link-exact-active', 'active');
      a.removeAttribute('aria-current');
    }
  });

  // Avoid infinite loops & redundant updates
  const currentConfigStr = JSON.stringify(config);
  if (navbarUl.getAttribute('data-toonhq-customized') === currentConfigStr) return;
  navbarUl.setAttribute('data-toonhq-customized', currentConfigStr);

  // 1. Identify "More" dropdown and its components
  const moreLi = navbarUl.querySelector('.nav-item.b-nav-dropdown.dropdown.red') as HTMLElement | null;
  const moreDropdownUl = moreLi?.querySelector('.dropdown-menu') as HTMLElement | null;
  if (!moreLi || !moreDropdownUl) return;

  // 2. Map all configurable nodes (both main and dropdown versions)
  // We want to keep the original nodes to preserve Vue/Bootstrap listeners
  const nodesMap: Record<string, { mobile?: HTMLElement, desktop?: HTMLElement }> = {};

  // Scrape everything currently in the DOM
  const allLis = navbarUl.querySelectorAll('li');
  allLis.forEach(li => {
    if (li === moreLi) return;
    const a = li.querySelector('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;

    for (const [id, item] of Object.entries(CONFIGURABLE_NAV_ITEMS)) {
      if (href.includes(item.href)) {
        if (!nodesMap[id]) nodesMap[id] = {};

        const isDropdownItem = a.classList.contains('dropdown-item');
        const isMobileOnly = li.classList.contains('d-lg-none');

        if (isDropdownItem) {
          nodesMap[id].desktop = li as HTMLElement;
        } else if (isMobileOnly) {
          nodesMap[id].mobile = li as HTMLElement;
        } else {
          // It's a standard pinned item
          nodesMap[id].mobile = li as HTMLElement;
        }
      }
    }
  });

  // 3. Clear the containers temporarily
  // We don't use innerHTML = '' to avoid losing event listeners on the "More" toggle
  const fragment = document.createDocumentFragment();
  moreDropdownUl.innerHTML = '';

  // 4. Re-append items based on config

  // Process Pinned
  config.pinned.forEach(id => {
    const item = CONFIGURABLE_NAV_ITEMS[id];
    let node = nodesMap[id]?.mobile || nodesMap[id]?.desktop;

    if (node) {
      // Ensure it has pinned styling
      node.className = item.colorClass;
      node.removeAttribute('role');
      const a = node.querySelector('a');
      if (a) {
        a.className = ''; // Remove dropdown-item
        const href = a.getAttribute('href');
        if (href && window.location.pathname.endsWith(href)) {
          a.classList.add('router-link-exact-active', 'active');
          a.setAttribute('aria-current', 'page');
        } else {
          a.removeAttribute('aria-current');
        }
        a.removeAttribute('role');
      }
      fragment.appendChild(node);
    }
  });

  // Process Dropdown
  config.dropdown.forEach(id => {
    const item = CONFIGURABLE_NAV_ITEMS[id];

    // We need two versions: Mobile-only in main UL, and Dropdown-item in More menu
    let mobileNode = nodesMap[id]?.mobile;
    let desktopNode = nodesMap[id]?.desktop;

    // Ensure we have a mobile version (pinned style + hidden on desktop)
    if (!mobileNode && desktopNode) {
      mobileNode = desktopNode.cloneNode(true) as HTMLElement;
    }
    if (mobileNode) {
      mobileNode.className = `${item.colorClass} d-block d-lg-none`;
      mobileNode.removeAttribute('role');
      const a = mobileNode.querySelector('a');
      if (a) {
        a.className = '';
        const href = a.getAttribute('href');
        if (href && window.location.pathname.endsWith(href)) {
          a.classList.add('router-link-exact-active', 'active');
          a.setAttribute('aria-current', 'page');
        } else {
          a.classList.remove('router-link-exact-active', 'active');
          a.removeAttribute('aria-current');
        }
        a.removeAttribute('role');
      }
      fragment.appendChild(mobileNode);
    }

    // Ensure we have a desktop version (inside the dropdown)
    if (!desktopNode && mobileNode) {
      desktopNode = mobileNode.cloneNode(true) as HTMLElement;
    }
    if (desktopNode) {
      desktopNode.className = item.colorClass;
      desktopNode.setAttribute('role', 'presentation');
      const a = desktopNode.querySelector('a');
      if (a) {
        a.className = 'dropdown-item';
        const href = a.getAttribute('href');
        if (href && window.location.pathname.endsWith(href)) {
          a.classList.add('router-link-exact-active', 'active');
          a.setAttribute('aria-current', 'page');
        } else {
          a.classList.remove('router-link-exact-active', 'active');
          a.removeAttribute('aria-current');
        }
        a.setAttribute('role', 'menuitem');
      }
      moreDropdownUl.appendChild(desktopNode);
    }
  });

  // 5. Finalize the navbar
  // Keep the "More" button visible only if needed
  if (config.dropdown.length > 0) {
    moreLi.classList.remove('d-none');
    moreLi.classList.add('d-lg-block');
  } else {
    moreLi.classList.add('d-none');
    moreLi.classList.remove('d-lg-block');
  }
  fragment.appendChild(moreLi);

  navbarUl.innerHTML = '';
  navbarUl.appendChild(fragment);
}

const groupsState: Record<number, any> = {};
/** Member id (from API/websocket) -> toon id, for resolving member_left events. */
const memberIdToToonId: Record<number, string> = {};
/** Group id -> set of member ids in that group; cleared on group_disbanded. */
const groupMemberIds: Record<number, Set<number>> = {};
const activeToons: Record<string, any> = {};
let bossInfoEnabled = true;

function generateToonHash(name: string, photo: string) {
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

function applyToonHash(toon: any) {
  if (toon.name) {
    toon.hashId = generateToonHash(toon.name, toon.photo);
  }
  if (!toon.id) {
    toon.id = toon.hashId;
  }
}

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Run migration from old local storage on first start
    await migrateFromLocalStorage();

    // 1) Fetch owned toons first
    // Load active toons from /api/toons/ (toons belonging to the current user)
    try {
      const toonsResp = await fetch('https://toonhq.org/api/toons/');
      const toonsData = await toonsResp.json();
      if (Array.isArray(toonsData)) {
        const newToons: ToonRecord[] = toonsData.map((toon: any) => {
          const id = String(toon.id);
          const normalized = { ...toon, id };
          activeToons[id] = normalized;
          toons[id] = normalized;
          return {
            id,
            name: toon.name || '',
            photo: toon.photo,
            species: toon.species,
            laff: toon.laff,
            level: toon.level,
            lastSeen: new Date().toISOString(),
          } as ToonRecord;
        });
        console.log('[ToonHQ+] Initial active toons loaded:', newToons.length, 'toons.');
        await putToons(newToons);
        await setSetting('active-toon-ids', newToons.map(t => t.id));
      }
    } catch (e) {
      console.error('[ToonHQ+] Failed to fetch active toons', e);
    }


    /** Update in-memory member id -> toon id mapping (and per-group sets) from a members list. */
    const updateMemberIdMaps = (groupId: number, members: any[]) => {
      if (!Array.isArray(members)) return;
      if (!groupMemberIds[groupId]) groupMemberIds[groupId] = new Set();
      for (const m of members) {
        const memberId = m?.id != null ? Number(m.id) : undefined;
        const toonId = m?.toon?.id != null ? String(m.toon.id) : String(generateToonHash(m.name || '', m.photo || ''));
        if (memberId != null && toonId != null) {
          memberIdToToonId[memberId] = toonId;
          groupMemberIds[groupId].add(memberId);
        }
      }
    };

    const syncToonData = (members: any[]) => {
      if (!members || !Array.isArray(members)) return;
      const newToons: ToonRecord[] = [];
      members.forEach((m) => {
        const incoming = m.toon || (m.id && m.name ? m : { ...m });
        if (!incoming?.name && !incoming?.photo) return;

        const numericId = incoming.id != null && !isNaN(Number(incoming.id)) ? String(Number(incoming.id)) : null;
        const hashId = incoming.hashId ?? incoming.toon?.hashId ?? generateToonHash(incoming.name || '', incoming.photo || '');

        const id: string = numericId ?? String(hashId);
        const rec: ToonRecord = {
          id,
          name: incoming.name || '',
          photo: incoming.photo,
          species: incoming.species,
          laff: incoming.laff,
          level: incoming.level,
          lastSeen: new Date().toISOString(),
          hashId,
        };
        toons[id] = rec as ToonData;
        newToons.push(rec);
      });
      if (newToons.length) putToons(newToons).catch(console.error);
    };

    const cleanupToonCache = async () => {
      console.log('[ToonHQ+] Running toon cache cleanup...');
      // (IndexedDB-based; no-op stub — toon records are kept as long as they are in a list/group)
    };

    const syncGroupHistory = (group: any, leavingToonId?: string) => {
      if (!group || !Array.isArray(group.members)) return;

      const groupId = Number(group.id);
      updateMemberIdMaps(groupId, group.members);

      const activeMember = group.members.find((m: any) => m.toon && activeToons[String(m.toon.id)]);
      if (!activeMember) return;

      // Persist group metadata
      putGroup({
        groupId,
        type: group.type,
        created: group.created,
        userJoinedAt: activeMember.joined || group.created,
      }).catch(console.error);

      // Persist all members
      const currentMemberIds = new Set(group.members.map((m: any) => m.toon?.id).filter(Boolean));
      const memberRecords: GroupMemberRecord[] = group.members
        .map((m: any) => ({
          groupId,
          toonId: String(m.toon.id || generateToonHash(m.name || '', m.photo || '')),
          joined: m.joined || group.created,
          left: m.left || null,
        }));
      if (memberRecords.length) putGroupMembers(memberRecords).catch(console.error);
    };



    // 2) Fetch current groups
    try {
      const resp = await fetch('https://toonhq.org/api/groups/list/1/');
      const data = await resp.json();
      if (data && Array.isArray(data.groups)) {
        data.groups.forEach((group: any) => {
          group.members?.forEach((m: any) => {
            if (m.toon) {
            applyToonHash(m.toon);
            }
          });
          groupsState[group.id] = group;
          syncToonData(group.members);
          syncGroupHistory(group);
        });
        console.log('[ToonHQ+] Initial groups state loaded:', Object.keys(groupsState).length, 'groups.');
      }
    } catch (e) {
      console.error('[ToonHQ+] Failed to fetch initial groups list', e);
    }

    // 3) Then start websocket to listen for group changes
    // Run cleanup on startup and every 30 minutes
    cleanupToonCache();
    setInterval(cleanupToonCache, 30 * 60 * 1000);

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
                  syncToonData(data.members);
                  syncGroupHistory(data);
                } else if (eventName === 'group_disbanded') {
                  const gid = data.id;
                  if (groupMemberIds[gid]) {
                    for (const mid of groupMemberIds[gid]) delete memberIdToToonId[mid];
                    delete groupMemberIds[gid];
                  }
                  delete groupsState[gid];
                } else if (eventName === 'member_joined') {
                  if (groupsState[data.group]) {
                    
                    data.toon.hashId = generateToonHash(data.toon.name || '', data.toon.photo || '');
                    if (!data.toon.id) {
                      data.toon.id = data.toon.hashId;
                    }

                    groupsState[data.group].members.push(data);
                    updateMemberIdMaps(Number(data.group), [data]);
                    syncToonData([data]);
                    syncGroupHistory(groupsState[data.group]);
                  }
                } else if (eventName === 'member_left') {
                  if (groupsState[data.group]) {
                    const leavingToonId = memberIdToToonId[data.id];
                    markMemberLeft(data.group, leavingToonId);
                    groupsState[data.group].members.filter((m: any) => m.id === data.id).forEach((m: any) => {
                      m.left = new Date().toISOString();
                    });
                    syncGroupHistory(groupsState[data.group]);
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
    // also ensure any .group-details-dialog gets forced to 980px width inline
    const fixDialog = (d: HTMLElement) => {
      d.style.setProperty('width', '980px', 'important');
      if (bossInfoEnabled === false) return;

      const wrapper = d.querySelector('.boss-title-wrapper') as HTMLElement | null;
      const allH4s = Array.from(d.querySelectorAll('h4'));
      const originalH4 = allH4s.find(h => !h.classList.contains('boss-info'));

      if (!originalH4) {
        // Native h4 is gone, remove our wrapper to clean up state
        if (wrapper) wrapper.remove();
        d.querySelectorAll('.boss-info').forEach(el => el.remove());
        return;
      }

      if (wrapper) {
        if (!wrapper.contains(originalH4)) {
          // The native h4 got regenerated outside our wrapper
          wrapper.remove();
        } else {
          // Everything is intact
          updateBossInfo();
          return;
        }
      }

      const title = originalH4.innerText.trim();
      if (title === 'CEO' || title === 'CJ') {
        const newWrapper = document.createElement('div');
        newWrapper.className = 'boss-title-wrapper';
        newWrapper.style.display = 'flex';
        newWrapper.style.justifyContent = 'center';
        newWrapper.style.alignItems = 'center';
        newWrapper.style.gap = '1em';

        const parent = originalH4.parentElement;
        if (parent) {
          parent.insertBefore(newWrapper, originalH4);
          originalH4.classList.add('text-center', 'mt-2', 'mb-3');
          newWrapper.appendChild(originalH4);
        }

        const newH4 = document.createElement('h4');
        newH4.classList.add('boss-info', 'text-center', 'mt-2', 'mb-3');
        newWrapper.appendChild(newH4);

        setTimeout(() => {
          updateBossInfo();
        }, 100);
      }
    };
    document.querySelectorAll('.group-details-dialog').forEach(el => {
      fixDialog(el as HTMLElement);
    });
    const dialogObserver = new MutationObserver((mutations) => {
      let checkAll = false;
      const dialogs = new Set<HTMLElement>();

      for (const m of mutations) {
        if (m.target instanceof HTMLElement && (m.target.classList.contains('boss-title-wrapper') || m.target.classList.contains('boss-info'))) {
          continue;
        }

        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList?.contains('boss-title-wrapper') || node.classList?.contains('boss-info')) return;

          if (node.matches?.('.group-details-dialog')) dialogs.add(node);
          const closest = node.closest?.('.group-details-dialog') as HTMLElement | null;
          if (closest) dialogs.add(closest);

          if (node.tagName === 'H4' || node.querySelector?.('h4')) checkAll = true;
        });

        m.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList?.contains('boss-title-wrapper') || node.classList?.contains('boss-info')) return;

          if (m.target instanceof HTMLElement) {
            const closest = m.target.closest?.('.group-details-dialog') as HTMLElement | null;
            if (closest) dialogs.add(closest);
          }
          if (node.tagName === 'H4' || node.querySelector?.('h4')) checkAll = true;
        });
      }

      if (checkAll) {
        document.querySelectorAll('.group-details-dialog').forEach(el => fixDialog(el as HTMLElement));
      } else {
        dialogs.forEach(d => fixDialog(d));
      }
    });
    dialogObserver.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => dialogObserver.disconnect());


    updateBossInfo();
    applyRowHighlights();

    // Load navbar config and boss-info setting from IndexedDB
    getSetting<{ pinned: string[], dropdown: string[] }>('navbar-config').then(config => {
      if (config) applyNavbarCustomization(config);
    });
    getSetting<boolean>('boss-info-enabled').then(enabled => {
      if (enabled !== undefined) bossInfoEnabled = enabled !== false;
    });

    // Listen for DB changes (replaces browser.storage.onChanged)
    window.addEventListener('toonhqplus-db-changed', ((e: CustomEvent) => {
      const { store } = e.detail || {};
      if (store === 'toony_toons' || store === 'stinky_toons') {
        applyRowHighlights();
      }
      if (store === 'settings') {
        getSetting<{ pinned: string[], dropdown: string[] }>('navbar-config').then(config => {
          if (config) applyNavbarCustomization(config);
        });
        getSetting<boolean>('boss-info-enabled').then(enabled => {
          if (enabled !== undefined) {
            bossInfoEnabled = enabled !== false;
            if (bossInfoEnabled) {
              document.querySelectorAll('.group-details-dialog').forEach(el => fixDialog(el as HTMLElement));
            } else {
              updateBossInfo();
            }
          }
        });
      }
    }) as EventListener);

    let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (highlightTimeout) clearTimeout(highlightTimeout);
      highlightTimeout = setTimeout(() => {
        highlightTimeout = null;
        applyRowHighlights();
        updateBossInfo();

        getSetting<{ pinned: string[], dropdown: string[] }>('navbar-config').then(config => {
          if (config) applyNavbarCustomization(config);
        });
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());

    function injectVueLogger() {
      // load an external script from the extension (CSP allows chrome-extension://)
      const script = document.createElement('script');
      // runtime.getURL is typed narrowly by wxt; cast to any to bypass
      script.src = (browser.runtime as any).getURL('vue-logger.js');
      script.onload = () => script.remove();
      document.documentElement.appendChild(script);
    }

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
