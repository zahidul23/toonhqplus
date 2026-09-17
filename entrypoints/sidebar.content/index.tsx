import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { SidebarApp } from './SidebarApp';
import { extractToonName, getCogValueFromName, getAverageSuitValue, bankersRound } from './toonUtils';
import { handleBoardingCreated, handleBoardingResponse, rejectPendingBoardingRequests, setBoardingCreationSubscription, setBoardingGroupsSocketSid } from './boardingStatus';
import { getToonHqActiveTtrToonId, getToonHqOwnedToons, isToonHqAuthenticated, takeEmbeddedSocketAuthToken } from './toonHqPageState';
import { pageFetch } from './pageFetch';
import './style.css';
import { DISPLAY_MODE_SETTING } from '../lib/displayMode';
import {
  openDB,
  migrateFromLocalStorage,
  getAllFromList,
  getToon,
  getToonByHashId,
  putToon,
  putToons,
  putGroup,
  deleteGroup,
  putGroupMember,
  putGroupMembers,
  markMemberLeft,
  getAllGroups,
  getAllGroupMembers,
  getGroupMembers,
  getSetting,
  getSettings,
  setSetting,
  getAllNotes,
  cleanupToonCache,
  getToons,
  getToonsByHashIds,
  type ToonRecord,
  type GroupRecord,
  type GroupMemberRecord,
} from './db';



const STORAGE_KEYS = {
  FAVORITES: 'toonhq-favorites',
  BLOCKED: 'toonhq-blocked',
  NAVBAR_CONFIG: 'toonhqplus-navbar-config',
  BOSS_INFO_ENABLED: 'toonhqplus-boss-info-enabled',
  NOTES_ENABLED: 'toonhqplus-notes-enabled',
} as const;
const ROW_CLASS_FAVORITE = 'toonhq-plus-favorite';
const ROW_CLASS_BLOCKED = 'toonhq-plus-blocked';
const GROUP_FILTERS_SETTING_KEY = 'toonhqplus-group-filters';
const DISTRICT_POPULATION_STORAGE_KEY = 'toonhqplus-district-population';
const DISTRICT_POPULATION_URL = 'https://www.toontownrewritten.com/api/population';
const DISTRICT_POPULATION_REFRESH_MS = 5 * 60 * 1000;
const DISTRICT_POPULATION_CHECK_MS = 60 * 1000;
const SPEEDCHAT_ONLY_DISTRICTS = new Set(['Boingbury', 'Gulp Gulch', 'Whoosh Rapids']);

type GroupFilters = {
  groupType: number[];
  hideGroupType: number[];
  district: string | null;
  area: number[];
  sortBy: 'oldest' | 'newest' | 'most_toons' | 'least_toons';
  showFull: boolean;
};

type DistrictPopulationSnapshot = {
  populationByDistrict: Record<string, number>;
  statusByDistrict?: Record<string, string>;
  lastUpdated?: number | null;
  fetchedAt: number;
};

let districtPopulation: DistrictPopulationSnapshot | null = null;
let activeDistrictTooltip: HTMLElement | null = null;
let activeDistrictTooltipAnchor: HTMLElement | null = null;
let districtTooltipSequence = 0;

const MUTED_ICON_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Zm8.1 7 2.45-2.45-1.4-1.4L17.7 10.6l-2.45-2.45-1.4 1.4L16.3 12l-2.45 2.45 1.4 1.4 2.45-2.45 2.45 2.45 1.4-1.4L19.1 12Z"/></svg>';

function hideDistrictTooltip() {
  activeDistrictTooltip?.remove();
  activeDistrictTooltipAnchor?.removeAttribute('aria-describedby');
  activeDistrictTooltip = null;
  activeDistrictTooltipAnchor = null;
}

function showDistrictTooltip(anchor: HTMLElement) {
  const text = anchor.dataset.tooltip;
  if (!text) return;
  hideDistrictTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'toonhq-plus-tooltip';
  tooltip.id = `toonhq-plus-tooltip-${++districtTooltipSequence}`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = text;
  document.body.appendChild(tooltip);

  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(
    window.innerWidth - tooltipRect.width / 2 - 8,
    Math.max(tooltipRect.width / 2 + 8, anchorRect.left + anchorRect.width / 2),
  );
  const fitsAbove = anchorRect.top >= tooltipRect.height + 12;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = fitsAbove
    ? `${anchorRect.top - tooltipRect.height - 9}px`
    : `${anchorRect.bottom + 9}px`;
  tooltip.dataset.placement = fitsAbove ? 'top' : 'bottom';
  anchor.setAttribute('aria-describedby', tooltip.id);
  activeDistrictTooltip = tooltip;
  activeDistrictTooltipAnchor = anchor;
}

function enableDistrictTooltip(indicator: HTMLElement) {
  indicator.addEventListener('mouseenter', () => showDistrictTooltip(indicator));
  indicator.addEventListener('mouseleave', hideDistrictTooltip);
  indicator.addEventListener('focus', () => showDistrictTooltip(indicator));
  indicator.addEventListener('blur', hideDistrictTooltip);
}

function normalizeGroupFilters(value: unknown): GroupFilters | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GroupFilters>;
  const validSorts = new Set(['oldest', 'newest', 'most_toons', 'least_toons']);
  if (!Array.isArray(candidate.groupType) || !Array.isArray(candidate.hideGroupType) ||
      !Array.isArray(candidate.area) || !validSorts.has(String(candidate.sortBy)) ||
      typeof candidate.showFull !== 'boolean') return null;
  if (candidate.district !== null && typeof candidate.district !== 'string') return null;
  return {
    groupType: candidate.groupType.filter(Number.isFinite),
    hideGroupType: candidate.hideGroupType.filter(Number.isFinite),
    district: candidate.district ?? null,
    area: candidate.area.filter(Number.isFinite),
    sortBy: candidate.sortBy as GroupFilters['sortBy'],
    showFull: candidate.showFull,
  };
}

function renderDistrictIndicators(districtLine: HTMLElement, districtName: string) {
    let indicators = districtLine.querySelector<HTMLElement>(':scope > .toonhq-plus-district-indicators');
    if (!indicators) {
      indicators = document.createElement('span');
      indicators.className = 'toonhq-plus-district-indicators';
      districtLine.appendChild(indicators);
    }

    // Keep the indicators inside the clickable district label, but place them
    // before ToonHQ's dropdown affordance instead of after the caret.
    if (districtLine.closest('.group-details-dialog')) {
      const caretDown = districtLine.querySelector<HTMLElement>(':scope > i.fa-caret-down');
      if (caretDown && indicators.nextElementSibling !== caretDown) {
        districtLine.insertBefore(indicators, caretDown);
      }
    }

    const population = districtPopulation?.populationByDistrict[districtName];
    const populationKey = population == null ? '' : String(population);
    if (indicators.dataset.population !== populationKey || indicators.dataset.district !== districtName) {
      indicators.dataset.population = populationKey;
      indicators.dataset.district = districtName;
      indicators.replaceChildren();

      if (SPEEDCHAT_ONLY_DISTRICTS.has(districtName)) {
        const muted = document.createElement('span');
        muted.className = 'toonhq-plus-indicator toonhq-plus-speedchat-only';
        muted.dataset.tooltip = 'SpeedChat-Only District: SpeedChat+ messages are unavailable here.';
        muted.setAttribute('aria-label', muted.dataset.tooltip);
        muted.tabIndex = 0;
        muted.innerHTML = MUTED_ICON_SVG;
        enableDistrictTooltip(muted);
        indicators.appendChild(muted);
      }

      if (population != null) {
        const level = population >= 500 ? 'red' : population >= 301 ? 'green' : 'blue';
        const description = population >= 500
          ? 'Full District (500+ Toons)'
          : population >= 301
            ? 'Ideal District (301–499 Toons)'
            : 'Quiet District (0–300 Toons)';
        const capacity = document.createElement('span');
        capacity.className = `toonhq-plus-indicator toonhq-plus-capacity toonhq-plus-capacity--${level}`;
        capacity.dataset.tooltip = `${description}\nCurrent population: ${population}`;
        capacity.setAttribute('aria-label', capacity.dataset.tooltip);
        capacity.tabIndex = 0;
        capacity.textContent = String(population);
        enableDistrictTooltip(capacity);
        indicators.appendChild(capacity);
      }
    }
}

function applyGroupDistrictIndicators() {
  document.querySelectorAll<HTMLElement>('.groups-list-item[district-name]').forEach(groupCard => {
    const districtName = groupCard.getAttribute('district-name');
    const districtLine = groupCard.querySelectorAll<HTMLElement>('.info-card__content p')[1];
    if (districtName && districtLine) renderDistrictIndicators(districtLine, districtName);
  });

  document.querySelectorAll<HTMLElement>('.group-details-dialog').forEach(dialog => {
    const districtColumn = Array.from(dialog.querySelectorAll<HTMLElement>('.row.text-center > div'))
      .find(column => column.querySelector('h6')?.textContent?.trim() === 'District');
    const districtLine = districtColumn?.querySelector<HTMLElement>('p');
    const districtText = districtLine?.textContent || '';
    const knownDistrictNames = new Set([
      ...Object.keys(districtPopulation?.populationByDistrict || {}),
      ...SPEEDCHAT_ONLY_DISTRICTS,
    ]);
    const districtName = Array.from(knownDistrictNames).find(name => districtText.includes(name));
    if (districtName && districtLine) renderDistrictIndicators(districtLine, districtName);
  });

  const knownDistrictNames = new Set([
    ...Object.keys(districtPopulation?.populationByDistrict || {}),
    ...SPEEDCHAT_ONLY_DISTRICTS,
  ]);
  const districtChoices = document.querySelectorAll<HTMLElement>([
    '.vuedal .multiselect__option',
    '.vuedal .multiselect__single',
    '.group-details-dialog .multiselect__option',
    '.group-details-dialog .multiselect__single',
    '.group-details-dialog [role="option"]',
    '.group-details-dialog .dropdown-menu .dropdown-item',
  ].join(','));
  districtChoices.forEach(choice => {
    const choiceText = choice.textContent?.trim() || '';
    // Invasion options include a second line after the district name.
    const districtName = Array.from(knownDistrictNames).find(name => choiceText.startsWith(name));
    if (districtName) renderDistrictIndicators(choice, districtName);
  });

  if (activeDistrictTooltipAnchor && !activeDistrictTooltipAnchor.isConnected) hideDistrictTooltip();
}

function getExtensionResourceUrl(path: string): string {
  return browser.runtime.getURL(path.replace(/^\/+/, '') as any);
}


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

    .gdetails__main {
      width: 100%;
    }

    .toonhq-plus-buttons {
      padding-left: 1em;
    }

    .toonhq-plus-quick-filter-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .toonhq-plus-quick-filter {
      margin: 0;
    }

    .toonhq-plus-quick-filter.active,
    .toonhq-plus-quick-filter.active:hover,
    .toonhq-plus-quick-filter.active:focus {
      color: #fff;
      background-color: #41b883;
      border-color: #41b883;
      box-shadow: none;
    }

    .toonhq-plus-quick-filter.active:hover,
    .toonhq-plus-quick-filter.active:focus {
      background-color: #369a6e;
      border-color: #369a6e;
    }

    html[data-toonhq-plus-display-mode="dark"] .toonhq-plus-quick-filter.active,
    html[data-toonhq-plus-display-mode="dark"] .toonhq-plus-quick-filter.active:hover,
    html[data-toonhq-plus-display-mode="dark"] .toonhq-plus-quick-filter.active:focus {
      color: #fff;
      background-color: #376447;
      border-color: var(--hq-dark-border-strong);
    }

    /* Keep Vue-owned navbar nodes in their original parents. Navbar
       customization changes visibility through classes instead of moving or
       removing nodes from the native virtual-DOM tree. */
    .navbar.navbar-default .navbar-nav > li.toonhq-plus-nav-hidden,
    .navbar.navbar-default .navbar-nav > li.toonhq-plus-more-hidden,
    .navbar.navbar-default .dropdown-menu > li.toonhq-plus-nav-hidden {
      display: none !important;
    }

    .navbar.navbar-default .navbar-nav > li.toonhq-plus-nav-pinned,
    .navbar.navbar-default .navbar-nav > li.toonhq-plus-nav-mobile-dropdown,
    .navbar.navbar-default .dropdown-menu > li.toonhq-plus-nav-dropdown {
      display: list-item !important;
    }

    @media (min-width: 992px) {
      .navbar.navbar-default .navbar-nav > li.toonhq-plus-nav-mobile-dropdown {
        display: none !important;
      }
    }

    @media (max-width: 991.98px) {
      .navbar.navbar-default .navbar-nav > li.toonhq-plus-more:not(.toonhq-plus-more-hidden) {
        display: none !important;
      }
    }

    /* Reorder the native nodes visually without reparenting them. Bootstrap
       normally displays an open dropdown as a block, so make only the custom
       More menu a column flexbox while it is open for item ordering. */
    .navbar.navbar-default .dropdown-menu.toonhq-plus-nav-ordering.show {
      display: flex !important;
      flex-direction: column;
      align-items: stretch;
    }

    div.group-details-dialog {
      width: 980px !important;
    }

    @media (max-width: 1000px) {
      div.gdetails__speedchat {
        width: clamp(200px, 100vw - 700px, 300px); 
      }
      .toon__info {
        width: 66% !important;
        flex: none !important;
      }
    }

    .row.text-center:has(.col-6):has(> :nth-child(5)) {
      @media (min-width: 576px) {
        div{
          flex: 0 0 20%;
          padding: 0;
        }
      }
    }

    // .group-member-row:not(.toonhq-plus-favorite):not(.toonhq-plus-blocked) .toonhq-plus-buttons {
    //   visibility: hidden;
    //   opacity: 0;
    // }

    // .group-member-row:hover:not(.toonhq-plus-favorite):not(.toonhq-plus-blocked) .toonhq-plus-buttons {
    //   transition: opacity 0.3s ease-in-out;
    //   visibility: visible;
    //   opacity: 1;
    // }

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
      min-width: 280px;
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
      width: 40px;
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
    .tooltip-header .tooltip-header-secondary {
      color: #fff;
      font-weight: 600;
    }
    .tooltip-header.gray { color: #9ca3af; }
    .tooltip-section-label {
      grid-column: 1 / -1;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7280;
      text-align: center;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 6px;
      margin: 4px -8px 2px;
    }
    
    .tooltip-sub-header {
      grid-column: 1 / -1;
      font-weight: 800;
      color: #10b981;
      margin-bottom: 4px;
      font-size: 14px;
      text-align: center;
    }
    .tooltip-tier-row {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0 12px;
      padding: 6px 8px;
      margin: 0 -8px;
      border-radius: 4px;
      font-size: 12px;
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
    .tooltip-tier-row.tier-stats {
      padding: 4px 8px;
    }
    .feeding-round-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 8px;
    }
    .feeding-round-grid .tooltip-tier-row {
      margin: 0;
      min-width: 0;
    }
    .tooltip-bool-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
      border: 1px solid transparent;
    }
    .tooltip-bool-box svg {
      width: 12px;
      height: 12px;
      stroke-width: 6;
    }
    .tooltip-bool-box.yes {
      background: #166534;
      border-color: #22c55e;
      color: #dcfce7;
    }
    .tooltip-bool-box.no {
      background: #991b1b;
      border-color: #ef4444;
      color: #fee2e2;
    }
    .tooltip-note {
      width: 100%;
      font-size: 9px;
      color: #9ca3af;
      margin-top: 2px;
      text-align: left;
      font-style: italic;
      opacity: 0.9;
    }
    .active .tooltip-note {
      color: #34d399;
      font-weight: 500;
      opacity: 1;
    }

    /* buttons injected inside toon element */
    .toonhq-plus-buttons {
      display: inline-flex;
      gap: 1em;
      vertical-align: middle;
      position: relative;
    }
    .toonhq-plus-buttons button {
      cursor: pointer;
      border: none;
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

    .note-bubble {
      background: #fef3c7;
      color: #92400e;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.2;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border: 1px solid #fde68a;
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 8px;
      white-space: nowrap;
      max-width: 34em;
      overflow: hidden;
      text-overflow: ellipsis;
      z-index: 100;
    }
    .note-bubble:hover {
      width: max-content;
      max-width: 34em;
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }
    .note-bubble::before {
      content: '';
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 0 6px 6px 6px;
      border-style: solid;
      border-color: transparent transparent #fde68a transparent;
    }
    .note-bubble::after {
      content: '';
      position: absolute;
      top: -5px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 0 6px 6px 6px;
      border-style: solid;
      border-color: transparent transparent #fef3c7 transparent;
    }

    tr.toonhq-plus-note td {
      border-top: none !important;
      padding: 0 !important;
      height: 25px;
    }
    tr.toonhq-plus-note.toonhq-plus-favorite,
    tr.toonhq-plus-note.toonhq-plus-favorite td { background: rgba(34, 197, 94, 0.12) !important; }
    
    .toonhq-plus-btn-fav, .toonhq-plus-btn-block {
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      padding: 0;
      transition: transform 0.2s, opacity 0.2s;
    }
    .toonhq-plus-btn-fav:hover, .toonhq-plus-btn-block:hover { transform: scale(1.1); }
    
    .toonhq-plus-btn-fav { background-color: #1f8454; }
    .toonhq-plus-btn-block { background-color: #dc2626; }

    .toonhq-plus-btn-fav::after, .toonhq-plus-btn-block::after {
      content: '';
      width: 16px;
      height: 16px;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }
    /* Thumbs Up */
    .toonhq-plus-btn-fav::after {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 10v12'/%3E%3Cpath d='M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z'/%3E%3C/svg%3E");
    }
    /* Block */
    .toonhq-plus-btn-block::after {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='m4.9 4.9 14.2 14.2'/%3E%3C/svg%3E");
    }
    
    tr.toonhq-plus-note.toonhq-plus-blocked,
    tr.toonhq-plus-note.toonhq-plus-blocked td { background: rgba(239, 68, 68, 0.12) !important; }

    .note-bubble {
      background: #fef3c7;
      color: #92400e;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border: 1px solid #fde68a;
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 13px;
      white-space: nowrap;
      max-width: 34em;
      overflow: hidden;
      text-overflow: ellipsis;
      z-index: 100;
    }
    .note-bubble:hover {
      width: max-content;
      max-width: 34em;
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }
    .note-bubble::before {
      content: '';
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 0 6px 6px 6px;
      border-style: solid;
      border-color: transparent transparent #fde68a transparent;
    }
    .note-bubble::after {
      content: '';
      position: absolute;
      top: -5px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 0 6px 6px 6px;
      border-style: solid;
      border-color: transparent transparent #fef3c7 transparent;
    }

    tr.toonhq-plus-favorite .note-bubble {
      background: #1f8454;
      border-color: #1f8454;
      color: white;
    }
    tr.toonhq-plus-favorite .note-bubble::before,
    tr.toonhq-plus-favorite .note-bubble::after {
      border-color: transparent transparent #1f8454 transparent;
    }

    tr.toonhq-plus-blocked .note-bubble {
      background: #dc2626;
      border-color: #dc2626;
      color: white;
    }
    tr.toonhq-plus-blocked .note-bubble::before,
    tr.toonhq-plus-blocked .note-bubble::after {
      border-color: transparent transparent #dc2626 transparent;
    }

    .info-card__bottom-right {
      display: flex !important;
      align-items: center !important;
    }

    .saved-toons-counts {
      display: flex;
      gap: 0.75em;
      margin-right: 0.75em !important;
    }

    .toonhq-plus-district-indicators {
      display: inline-flex;
      flex-direction: row-reverse;
      align-items: center;
      gap: 5px;
      margin-left: 6px;
      vertical-align: middle;
    }

    .group-details-dialog .row.text-center > div p:has(> .toonhq-plus-district-indicators) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    :is(.vuedal, .group-details-dialog) :is(.multiselect__option, .multiselect__single, [role="option"], .dropdown-item):has(> .toonhq-plus-district-indicators) {
      position: relative;
      padding-right: 54px !important;
    }

    :is(.vuedal, .group-details-dialog) :is(.multiselect__option, .multiselect__single, [role="option"], .dropdown-item) > .toonhq-plus-district-indicators {
      position: absolute;
      right: 10px;
      top: 50%;
      flex-direction: row;
      margin-left: 0;
      transform: translateY(-50%);
    }

    .toonhq-plus-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      color: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      cursor: help;
      outline: none;
    }

    .toonhq-plus-indicator:focus-visible {
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 0 5px rgba(17, 24, 39, 0.7);
    }

    .toonhq-plus-tooltip {
      position: fixed;
      z-index: 2147483647;
      transform: translateX(-50%);
      width: max-content;
      max-width: 250px;
      padding: 7px 9px;
      border-radius: 6px;
      background: #111827;
      color: #fff;
      box-shadow: 0 5px 16px rgba(0, 0, 0, 0.35);
      font-family: Arial, sans-serif;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.35;
      text-align: left;
      white-space: pre-line;
      pointer-events: none;
    }

    .toonhq-plus-tooltip::after {
      content: '';
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
    }

    .toonhq-plus-tooltip[data-placement="top"]::after {
      top: 100%;
      border-top-color: #111827;
    }

    .toonhq-plus-tooltip[data-placement="bottom"]::after {
      bottom: 100%;
      border-bottom-color: #111827;
    }

    .toonhq-plus-indicator svg {
      width: 11px;
      height: 11px;
      fill: currentColor;
    }

    .toonhq-plus-capacity {
      width: auto;
      min-width: 17px;
      padding: 0 4px;
      box-sizing: border-box;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .toonhq-plus-capacity--red { background: #a95258; }
    .toonhq-plus-capacity--green { background: #43755c; }
    .toonhq-plus-capacity--blue { background: #4a6998; }

    html[data-toonhq-plus-display-mode="dark"] .toonhq-plus-capacity--red { background: #dc2626; }
    html[data-toonhq-plus-display-mode="dark"] .toonhq-plus-capacity--green { background: #168653; }
    html[data-toonhq-plus-display-mode="dark"] .toonhq-plus-capacity--blue { background: #2563eb; }
    .toonhq-plus-speedchat-only { background: #dc2626; }

    .toony-count {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: bold;
      color: #22c55e;
    }

    .stinky-count {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: bold;
      color: #ef4444;
    }

    .toony-icon,
    .stinky-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    .toony-icon {
      background-color: #1f8454;
    }
    .stinky-icon {
      background-color: #dc2626;
    }

    .info-card--groups:has(.info-card__content.toony-group) {
      background-color: #76ffaa !important;
    }
    .info-card--groups:has(.info-card__content.stinky-group) {
      background-color: #ff9f9f !important;
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
      className: string,
      title: string,
      listKey: string,
    ) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = className;
      btn.title = title;
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

    container.append(
      makeBtn('toonhq-plus-btn-fav', 'Add to Toony Toons', STORAGE_KEYS.FAVORITES),
      makeBtn('toonhq-plus-btn-block', 'Add to Stinky Toons', STORAGE_KEYS.BLOCKED),
    );

    // place the buttons inside the toon element itself
    const toonEl = row.querySelector('.toon');
    if (toonEl) {
      toonEl.append(container);
    }
  }
}


let isApplyingHighlights = false;
let pendingHighlight = false;
type SavedToonLists = {
  favorites: string[];
  blocked: string[];
};

async function applyRowHighlights(savedToonLists?: SavedToonLists) {
  if (isApplyingHighlights) {
    pendingHighlight = true;
    return;
  }
  isApplyingHighlights = true;

  try {
    const savedToonsPromise = savedToonLists
      ? Promise.resolve(savedToonLists)
      : Promise.all([
        getAllFromList('toony_toons'),
        getAllFromList('stinky_toons'),
      ]).then(([favorites, blocked]) => ({ favorites, blocked }));

    const [savedToons, allNotes, settings] = await Promise.all([
      savedToonsPromise,
      getAllNotes(),
      getSettings(['notes-enabled']),
    ]);

    toonyToonsMemory = new Set(savedToons.favorites);
    stinkyToonsMemory = new Set(savedToons.blocked);

    const rows = Array.from(document.querySelectorAll('.group-member-row')) as HTMLElement[];
    if (rows.length === 0) return;

    notesEnabled = settings['notes-enabled'] !== false;
    const favIds = toonyToonsMemory;
    const blkIds = stinkyToonsMemory;

    // Batch Fetch Toon Data
    const idsToFetch = new Set<string>();
    const hashIdsToFetch = new Set<string>();

    rows.forEach(row => {
      const idAttr = row.getAttribute('toon-id');
      if (!idAttr || toons[idAttr]) return;

      if (idAttr.startsWith('#')) {
        hashIdsToFetch.add(idAttr);
        // Fallback for legacy numeric keys that were stringified inside the hash
        const candidate = idAttr.slice(1);
        if (/^\d+$/.test(candidate)) idsToFetch.add(candidate);
      } else {
        idsToFetch.add(idAttr);
      }
    });

    if (idsToFetch.size > 0 || hashIdsToFetch.size > 0) {
      const [fetchedById, fetchedByHash] = await Promise.all([
        idsToFetch.size > 0 ? getToons(Array.from(idsToFetch)) : Promise.resolve([]),
        hashIdsToFetch.size > 0 ? getToonsByHashIds(Array.from(hashIdsToFetch)) : Promise.resolve([]),
      ]);

      [...fetchedById, ...fetchedByHash].forEach(rec => {
        if (rec.id) toons[rec.id] = rec as ToonData;
        if (rec.hashId) toons[rec.hashId] = rec as ToonData;
      });
    }

    rows.forEach((row, index) => {
      row.classList.remove(ROW_CLASS_FAVORITE, ROW_CLASS_BLOCKED);
      const nameEl = row.querySelector('.toon__name');
      const raw = nameEl?.textContent?.trim();
      if (!raw) return;

      const name = extractToonName(raw);
      const idAttr = row.getAttribute('toon-id');

      // Resolve toon using cache
      let data: ToonData | null = null;
      if (idAttr) {
        data = toons[idAttr] || null;
        if (!data && idAttr.startsWith('#')) {
          const afterHash = idAttr.slice(1);
          data = toons[afterHash] || null;
        }
      }

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

      // Add Note Bubble
      if (notesEnabled && (resolvedId != null || index === 0)) {
        const noteText = resolvedId ? allNotes[resolvedId] : '';
        const displayNote = noteText || '';

        const btnContainer = row.querySelector('.toonhq-plus-buttons') as HTMLElement;
        const favClass = row.classList.contains(ROW_CLASS_FAVORITE) ? ROW_CLASS_FAVORITE : '';
        const blkClass = row.classList.contains(ROW_CLASS_BLOCKED) ? ROW_CLASS_BLOCKED : '';
        const combinedClasses = `toonhq-plus-note ${favClass} ${blkClass}`.trim();

        if (btnContainer) {
          if (displayNote) {
            let bubble = btnContainer.querySelector('.note-bubble') as HTMLElement;
            if (!bubble) {
              bubble = document.createElement('div');
              bubble.className = 'note-bubble';
              btnContainer.appendChild(bubble);
            }
            if (bubble.textContent !== noteText) {
              bubble.textContent = noteText;
            }

            const [upBtn, downBtn] = Array.from(btnContainer.querySelectorAll('button')) as HTMLButtonElement[];
            const targetBtn = favClass ? upBtn : (blkClass ? downBtn : upBtn);

            if (targetBtn) {
              const btnLeft = targetBtn.offsetLeft;
              const btnWidth = targetBtn.offsetWidth;
              bubble.style.left = `${btnLeft + (btnWidth / 2)}px`;
              bubble.style.transform = 'translateX(-50%)';
              bubble.style.marginTop = '1.5em';
            }
          } else {
            const bubble = btnContainer.querySelector('.note-bubble');
            if (bubble) bubble.remove();
          }
        }

        // Robust spacer row cleanup logic
        let next = row.nextElementSibling as HTMLElement | null;
        let existingSpacers: HTMLElement[] = [];
        while (next && next.classList.contains('toonhq-plus-note')) {
          existingSpacers.push(next);
          next = next.nextElementSibling as HTMLElement | null;
        }

        if (displayNote) {
          if (existingSpacers.length === 0) {
            const spacerRow = document.createElement('tr');
            spacerRow.className = combinedClasses;
            const cell = document.createElement('td');
            cell.colSpan = 5;
            spacerRow.appendChild(cell);
            row.after(spacerRow);
          } else {
            existingSpacers[0].className = combinedClasses;
            // Clear any orphaned duplicates
            for (let i = 1; i < existingSpacers.length; i++) existingSpacers[i].remove();
          }
        } else {
          existingSpacers.forEach(el => el.remove());
        }
      }
    });

  } finally {
    isApplyingHighlights = false;
    if (pendingHighlight) {
      pendingHighlight = false;
      applyRowHighlights();
    }
  }
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
    return 5; // Tier 5: 63+ value
  } else if (value >= 48) {
    return 5; // Tier 4: 48-62 value
  } else if (value >= 33) {
    return 4; // Tier 3: 33-47 value
  } else if (value >= 17) {
    return 4; // Tier 2: 17-32 value
  } else if (value >= 1) {
    return 3; // Tier 1: 1-16 value
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

interface CEODifficultyTier {
  tier: number;
  minlevel: number;
  timer: string;
  tables: number;
  cogTypes: string[];
  totalCogs: number;
  slips: number;
}

const CEO_DIFFICULTY_TIERS: CEODifficultyTier[] = [
  { tier: 5, minlevel: 63, timer: '330s', tables: 13, cogTypes: ['the_big_cheese.png'], totalCogs: 65, slips: 5 },
  { tier: 4, minlevel: 48, timer: '315s', tables: 12, cogTypes: ['corporate_raider.png', 'the_big_cheese.png'], totalCogs: 60, slips: 5 },
  { tier: 3, minlevel: 33, timer: '300s', tables: 10, cogTypes: ['corporate_raider.png'], totalCogs: 55, slips: 4 },
  { tier: 2, minlevel: 17, timer: '285s', tables: 9, cogTypes: ['head_hunter.png', 'corporate_raider.png'], totalCogs: 50, slips: 4 },
  { tier: 1, minlevel: 1, timer: '270s', tables: 8, cogTypes: ['head_hunter.png'], totalCogs: 40, slips: 3 },
];

const getCEODifficultyTier = (value: number): CEODifficultyTier => {
  return CEO_DIFFICULTY_TIERS.find(t => value >= t.minlevel) || CEO_DIFFICULTY_TIERS[4];
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
  { minSuitValue: 48, slipCount: 5 },
  { minSuitValue: 17, slipCount: 4 },
  { minSuitValue: 1, slipCount: 3 }
];

const renderTierRow = (label: string, value: string | number, isActive: boolean, extraClass = '', note = '') => `
  <div class="tooltip-tier-row ${isActive ? 'active' : ''} ${extraClass}">
    <div class="tooltip-label">${label}</div>
    <div class="tooltip-value">${value}</div>
    ${note ? `<div class="tooltip-note">${note}</div>` : ''}
  </div>
`;

const getTooltipNoteForThreshold = (
  minSuitValue: number,
  currentSum: number,
  currentCount: number,
  currentAvg: number,
  isActive: boolean,
  bossKey: string
) => {
  if (currentCount >= 8 || minSuitValue <= 1) return '';
  if (minSuitValue <= currentAvg && !isActive) return '';

  const targetSum = minSuitValue * 8;
  const action = isActive ? 'maintain' : 'reach';
  const remaining = 8 - currentCount;
  const avgNeeded = Math.ceil((targetSum - currentSum) / remaining);

  if (avgNeeded > 78) {
    return `Impossible to ${action} with 8 members`;
  } else if (avgNeeded > 1) {
    return `${getCogNameForLevel(avgNeeded, bossKey)}+ required to ${action}`;
  }
  return '';
};

const renderTooltipBoolIcon = (value: boolean) => `
  <span class="tooltip-bool-box ${value ? 'yes' : 'no'}" aria-label="${value ? 'Yes' : 'No'}">
    ${value
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>'
  }
  </span>
`;

const renderLawbotTooltip = (tierData: CJDifficultyTier, suitString: string, bossKey: string, currentSum: number, currentCount: number) => {
  const currentAvg = bankersRound(currentSum / currentCount);
  const lawyerRowsHtml = LAWYER_THRESHOLDS.map(threshold => {
    const isActive = tierData.lawyers === threshold.lawyerCount;
    const note = getTooltipNoteForThreshold(threshold.minSuitValue, currentSum, currentCount, currentAvg, isActive, bossKey);
    return renderTierRow(`${getCogNameForLevel(threshold.minSuitValue, bossKey)}+`, `${threshold.lawyerCount} Lawyers`, isActive, '', note);
  }).join('');

  const statsList = [
    { label: 'Gavels', value: tierData.gavels },
    { label: 'Bonus Weight', value: renderTooltipBoolIcon(tierData.hasBonusWeight) },
    { label: 'Evidence Count', value: tierData.evidence },
    { label: 'Evidence Heal', value: tierData.laffHeal + " Laff" }
  ];

  const statsHtml = statsList.map(stat => renderTierRow(stat.label, stat.value, false, "tier-stats")).join('');

  return `
    <div class="tooltip-boss-info">
      <div class="tooltip-header">Group Average</div>
      <div class="tooltip-sub-header">${suitString}</div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-header emerald">Tier ${tierData.tier} <span class="tooltip-header-secondary">- ${tierData.lawyers} Lawyers</span></div>
      <div class="tooltip-section-label">Evidence Round</div>
      <div class="feeding-round-grid">
        ${statsHtml}
      </div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-header gray">Lawyer Thresholds</div>
      ${lawyerRowsHtml}
    </div>
  `;
};

const renderBossbotTooltip = (tierData: CEODifficultyTier, suitString: string, bossKey: string, currentSum: number, currentCount: number) => {
  const currentAvg = bankersRound(currentSum / currentCount);
  const rowsHtml = PINK_SLIP_THRESHOLDS.map(threshold => {
    const isActive = tierData.slips === threshold.slipCount;
    const note = getTooltipNoteForThreshold(threshold.minSuitValue, currentSum, currentCount, currentAvg, isActive, bossKey);
    return renderTierRow(`${getCogNameForLevel(threshold.minSuitValue, bossKey)}+`, `${threshold.slipCount} Slips`, isActive, 'bossbot-info', note);
  }).join('');

  const cogImagesHtml = tierData.cogTypes.map(img => `<img src="https://toonhq.org/static/assets/cogs/${img}" alt="Cog" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;" />`).join('');

  const feedingStatsList = [
    { label: 'Timer', value: tierData.timer },
    { label: 'Cog Types', value: `<div style="display:flex;justify-content:flex-start;align-items:center;">${cogImagesHtml}</div>` },
    { label: 'Tables', value: tierData.tables },
    { label: 'Total Cogs', value: tierData.totalCogs }
  ];

  const feedingStatsHtml = feedingStatsList.map(stat => renderTierRow(stat.label, stat.value, false, "tier-stats bossbot-info")).join('');

  return `
    <div class="tooltip-boss-info">
      <div class="tooltip-header">Group Average</div>
      <div class="tooltip-sub-header">${suitString}</div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-header emerald">Tier ${tierData.tier} <span class="tooltip-header-secondary">- ${tierData.slips} Pink Slips</span></div>
      <div class="tooltip-section-label">Feeding Round</div>
      <div class="feeding-round-grid">
        ${feedingStatsHtml}
      </div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-header gray">Pink Slip Thresholds</div>
      ${rowsHtml}
    </div>
  `;
};

const isBossInfoMutationNode = (node: Node | null | undefined): boolean => {
  if (!(node instanceof HTMLElement)) return false;
  return !!node.closest('.boss-title-wrapper, .boss-info');
};

const updateBossInfo = (dialog?: ParentNode | null) => {
  if (bossInfoEnabled === false) {
    const targetDialog = dialog ?? document.querySelector('.group-details-dialog');
    const thisBossInfo = targetDialog?.querySelector(".boss-info");
    if (thisBossInfo) {
      // If it exists but we are disabled, hide/remove it
      thisBossInfo.remove();
      // If we made a wrapper, we might need to revert that too, but removing the info is usually enough
    }
    return;
  }
  const targetDialog = dialog ?? document.querySelector('.group-details-dialog');
  const thisBossInfo = targetDialog?.querySelector(".boss-info");
  if (!targetDialog || !thisBossInfo) return;

  const thisBossName = targetDialog.querySelector('h4')?.textContent?.trim();
  const thisBossKey = thisBossName ? BOSS_CONFIG[thisBossName] : null;
  if (!thisBossKey) return;

  const rows = targetDialog.querySelectorAll('.group-member-row');
  const suitNames: string[] = [];
  for (const row of rows) {
    const suitImg = row.querySelector('.toon__track--suit');
    if (suitImg instanceof HTMLElement && (suitImg.title || suitImg.dataset.originalTitle)) {
      suitNames.push(suitImg.title || suitImg.dataset.originalTitle || '');
    }
  }

  const suitValues = suitNames.map(name => getCogValueFromName(name));
  const currentSum = suitValues.reduce((sum, v) => sum + v, 0);
  const averageSuitValue = getAverageSuitValue(suitNames);
  if (averageSuitValue === 0) return;
  const suitString = getCogNameForLevel(averageSuitValue, thisBossKey);

  let infoText = '';
  let html = '';
  let tierKey = '';

  if (thisBossKey === 'lawbot') {
    const tierData = getCJDifficultyTier(averageSuitValue);
    tierKey = String(tierData.tier);
    infoText = `(${tierData.lawyers} lawyers)`;
    html = renderLawbotTooltip(tierData, suitString, thisBossKey, currentSum, suitNames.length);
  } else {
    const tierData = getCEODifficultyTier(averageSuitValue);
    tierKey = String(tierData.tier);
    infoText = `(${tierData.slips} Pink Slips)`;
    html = renderBossbotTooltip(tierData, suitString, thisBossKey, currentSum, suitNames.length);
  }

  // Ensure tooltip exists
  let tooltipEl = thisBossInfo.querySelector('.boss-info-tooltip') as HTMLElement | null;
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = `boss-info-tooltip ${thisBossKey === 'lawbot' ? 'lawbot-tip' : ''}`;
    thisBossInfo.appendChild(tooltipEl);
  }

  // Update content only if changed
  const currentInfoText = thisBossInfo.firstChild?.nodeType === Node.TEXT_NODE
    ? thisBossInfo.firstChild.textContent
    : '';
  const cachedTier = tooltipEl.dataset.tooltipTier ?? '';

  if (currentInfoText !== infoText || cachedTier !== tierKey) {
    if (thisBossInfo.firstChild?.nodeType === Node.TEXT_NODE) {
      thisBossInfo.firstChild.textContent = infoText;
    } else {
      thisBossInfo.prepend(document.createTextNode(infoText));
    }
    tooltipEl.innerHTML = html;
    tooltipEl.dataset.tooltipTier = tierKey;
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

  // Identify the native More dropdown without changing the DOM structure.
  const moreLi = navbarUl.querySelector('.nav-item.b-nav-dropdown.dropdown.red') as HTMLElement | null;
  const moreDropdownUl = moreLi?.querySelector('.dropdown-menu') as HTMLElement | null;

  const pinned = new Set(config.pinned);
  const dropdown = new Set(config.dropdown);
  const pinnedOrder = new Map(config.pinned.map((id, index) => [id, index]));
  const dropdownOrder = new Map(config.dropdown.map((id, index) => [id, index]));
  const getItemId = (node: HTMLElement) => {
    const href = node.querySelector<HTMLAnchorElement>(':scope > a')?.getAttribute('href');
    if (!href) return null;
    return Object.entries(CONFIGURABLE_NAV_ITEMS).find(([, item]) => href.includes(item.href))?.[0] ?? null;
  };

  const ensureDropdownProxy = (id: string) => {
    if (!moreDropdownUl) return null;
    const item = CONFIGURABLE_NAV_ITEMS[id];
    if (!item) return null;

    let node = moreDropdownUl.querySelector<HTMLElement>(`:scope > li[data-toonhq-plus-nav-proxy="${id}"]`);
    if (!node) {
      node = document.createElement('li');
      node.dataset.toonhqPlusNavProxy = id;
      node.setAttribute('role', 'presentation');

      const anchor = document.createElement('a');
      anchor.className = 'dropdown-item';
      anchor.setAttribute('role', 'menuitem');
      node.appendChild(anchor);
      moreDropdownUl.appendChild(node);
    }

    node.classList.add(item.colorClass);
    const anchor = node.querySelector<HTMLAnchorElement>(':scope > a');
    if (anchor) {
      const gamePrefix = window.location.pathname.startsWith('/cc/') ? '/cc' : '';
      const href = `${gamePrefix}${item.href}`;
      if (anchor.getAttribute('href') !== href) anchor.setAttribute('href', href);
      if (anchor.textContent !== item.label) anchor.textContent = item.label;
    }
    return node;
  };

  const resetNodeClasses = (node: HTMLElement) => {
    node.classList.remove('toonhq-plus-nav-hidden', 'toonhq-plus-nav-pinned', 'toonhq-plus-nav-mobile-dropdown', 'toonhq-plus-nav-dropdown', 'toonhq-plus-nav-trailing');
    node.style.removeProperty('order');
  };

  // The top-level and More-menu copies stay where Vue rendered them. We only
  // toggle custom classes and use flex-item order for the configured sequence.
  const navbarChildren = Array.from(navbarUl.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI',
  );
  let trailingOrder = config.pinned.length + config.dropdown.length + 1;
  navbarChildren.forEach(child => {
    const node = child as HTMLElement;
    resetNodeClasses(node);
    if (node === moreLi) return;
    const id = getItemId(node);
    if (!id) {
      node.classList.add('toonhq-plus-nav-trailing');
      node.style.order = String(++trailingOrder);
      return;
    }
    if (pinned.has(id)) {
      node.classList.add('toonhq-plus-nav-pinned');
      node.style.order = String(pinnedOrder.get(id));
    } else if (dropdown.has(id)) {
      // ToonHQ renders a top-level mobile copy for links that live in More on
      // desktop. Keep that copy in the configured dropdown order on mobile.
      node.classList.add('toonhq-plus-nav-mobile-dropdown');
      node.style.order = String(config.pinned.length + (dropdownOrder.get(id) ?? 0));
    } else {
      node.classList.add('toonhq-plus-nav-hidden');
    }
  });

  if (moreDropdownUl) {
    moreDropdownUl.classList.add('toonhq-plus-nav-ordering');
    // Use extension-owned links for every configured dropdown item. Mixing
    // native and proxy nodes made their visual order browser-dependent.
    const orderedProxies = config.dropdown
      .map(ensureDropdownProxy)
      .filter((node): node is HTMLElement => node !== null);
    moreDropdownUl.querySelectorAll<HTMLElement>(':scope > li[data-toonhq-plus-nav-proxy]').forEach(node => {
      const id = node.dataset.toonhqPlusNavProxy;
      if (!id || !dropdown.has(id)) node.remove();
    });

    const currentProxyOrder = Array.from(
      moreDropdownUl.querySelectorAll<HTMLElement>(':scope > li[data-toonhq-plus-nav-proxy]'),
    );
    if (currentProxyOrder.some((node, index) => node !== orderedProxies[index]) ||
        currentProxyOrder.length !== orderedProxies.length) {
      orderedProxies.forEach(node => moreDropdownUl.appendChild(node));
    }

    let dropdownTrailingOrder = config.dropdown.length;
    Array.from(moreDropdownUl.children).forEach(child => {
      const node = child as HTMLElement;
      if (node.tagName !== 'LI') return;
      resetNodeClasses(node);
      const id = getItemId(node);
      if (!id) {
        node.style.order = String(++dropdownTrailingOrder);
        return;
      }
      if (dropdown.has(id)) {
        if (node.dataset.toonhqPlusNavProxy) {
          node.classList.add('toonhq-plus-nav-dropdown');
          node.style.order = String(dropdownOrder.get(id));
        } else {
          // Keep Vue's copy in place for its virtual DOM, but render the
          // ordered extension-owned copy instead.
          node.classList.add('toonhq-plus-nav-hidden');
        }
      } else {
        node.classList.add('toonhq-plus-nav-hidden');
      }
    });
  }

  if (moreLi) {
    // Keep More immediately after the ordered pinned pages. Giving all
    // top-level siblings an explicit order prevents its open/closed class
    // changes from affecting its position.
    moreLi.classList.add('toonhq-plus-more');
    moreLi.style.order = String(config.pinned.length + config.dropdown.length);
    moreLi.classList.toggle('toonhq-plus-more-hidden', config.dropdown.length === 0);
  }
}

const groupsState: Record<number, any> = {};
let toonyToonsMemory = new Set<string>();
let stinkyToonsMemory = new Set<string>();
/** Member id (from API/websocket) -> toon id, for resolving member_left events. */
const memberIdToToonId: Record<number, string> = {};
/** Group id -> set of member ids in that group; cleared on group_disbanded. */
const groupMemberIds: Record<number, Set<number>> = {};
const activeToons: Record<string, any> = {};
let bossInfoEnabled = true;
let notesEnabled = true;
let highlightGroupsEnabled = true;
const IDLE_RELOAD_AFTER_MS = 60 * 60 * 1000;

async function toonHQIsReachable(): Promise<boolean> {
  if (navigator.onLine === false) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://toonhq.org/', {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_SETTINGS: Record<string, any> = {
  'boss-info-enabled': true,
  'notes-enabled': true,
  'highlight-groups': false,
  'navbar-config': {
    pinned: ['invasions', 'groups', 'fishing', 'ccg'],
    dropdown: ['field-offices', 'gardening', 'doodles']
  },
  'sidebar-open': false,
  'active-tab': 'history',
  [DISPLAY_MODE_SETTING]: 'auto',
};

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

async function applyGroupHighlights(
  groupsState: Record<number, any>,
  toonyToonsMemory: Set<string>,
  stinkyToonsMemory: Set<string>,
  generateToonHashFn: (name: string, photo: string) => string,
  highlightGroupsEnabled: boolean
) {
  const hashIds = new Set<string>();
  Object.values(groupsState).forEach((group: any) => {
    if (!Array.isArray(group?.members)) return;
    group.members.forEach((member: any) => {
      if (member.left || !member.toon) return;
      const toon = member.toon;
      if (toon.id == null || isNaN(Number(toon.id))) {
        hashIds.add(String(toon.hashId ?? generateToonHashFn(toon.name || '', toon.photo || '')));
      }
    });
  });

  const hashAliases = new Map<string, string>();
  if (hashIds.size > 0) {
    const records = await getToonsByHashIds(Array.from(hashIds));
    records.forEach((record) => {
      if (record.hashId) hashAliases.set(record.hashId, record.id);
    });
  }

  document.querySelectorAll('.groups-list-item').forEach(groupCard => {
    const groupId = groupCard.getAttribute('group-id');
    if (!groupId) return;

    const group = groupsState[Number(groupId)];
    if (!group || !Array.isArray(group.members)) return;

    const bottomRight = groupCard.querySelector('.info-card__bottom-right');
    if (!bottomRight) return;

    let toonyCount = 0;
    let stinkyCount = 0;
    const seenToons = new Set<string>();

    group.members.forEach((m: any) => {
      if (m.left) return;
      const toon = m.toon;
      if (!toon) return;
      const numericId = toon.id != null && !isNaN(Number(toon.id)) ? String(Number(toon.id)) : null;
      const hashId = toon.hashId ?? generateToonHashFn(toon.name || '', toon.photo || '');
      const id = numericId ?? hashAliases.get(String(hashId)) ?? String(hashId);

      if (seenToons.has(id)) return;
      seenToons.add(id);

      if (toonyToonsMemory.has(id)) {
        toonyCount++;
      }
      if (stinkyToonsMemory.has(id)) {
        stinkyCount++;
      }
    });

    const cardContent = groupCard.querySelector('.info-card__content');
    if (cardContent) {
      if (!highlightGroupsEnabled || (toonyCount === 0 && stinkyCount === 0)) {
        cardContent.classList.remove('toony-group', 'stinky-group');
      } else if (stinkyCount >= toonyCount) {
        cardContent.classList.add('stinky-group');
        cardContent.classList.remove('toony-group');
      } else {
        cardContent.classList.add('toony-group');
        cardContent.classList.remove('stinky-group');
      }
    }

    const currentToonyStr = String(toonyCount);
    const currentStinkyStr = String(stinkyCount);
    let countsDiv = bottomRight.querySelector('.saved-toons-counts') as HTMLElement | null;

    if (toonyCount === 0 && stinkyCount === 0) {
      if (countsDiv) countsDiv.remove();
      return;
    }

    if (!countsDiv) {
      countsDiv = document.createElement('div');
      countsDiv.className = 'saved-toons-counts';
      bottomRight.insertBefore(countsDiv, bottomRight.firstChild);
    }

    if (countsDiv.getAttribute('data-toony') !== currentToonyStr || countsDiv.getAttribute('data-stinky') !== currentStinkyStr) {
      countsDiv.setAttribute('data-toony', currentToonyStr);
      countsDiv.setAttribute('data-stinky', currentStinkyStr);

      const ICON_SIZE = 10;
      const CIRCLE_SIZE = 18;

      const toonyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
      const stinkyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`;

      countsDiv.innerHTML = `
        ${toonyCount > 0 ? `
          <span class="toony-count" title="${toonyCount} toony ${toonyCount === 1 ? 'toon' : 'toons'} in this group">
            <span class="toony-icon" style="width: ${CIRCLE_SIZE}px; height: ${CIRCLE_SIZE}px;">
              ${toonyIcon}
            </span>
            ${toonyCount}
          </span>
        ` : ''}
        ${stinkyCount > 0 ? `
          <span class="stinky-count" title="${stinkyCount} stinky ${stinkyCount === 1 ? 'toon' : 'toons'} in this group">
            <span class="stinky-icon" style="width: ${CIRCLE_SIZE}px; height: ${CIRCLE_SIZE}px;">
              ${stinkyIcon}
            </span>
            ${stinkyCount}
          </span>
        ` : ''}
      `.trim();
    }
  });
}

function applyCurrentGroupHighlights() {
  void applyGroupHighlights(
    groupsState,
    toonyToonsMemory,
    stinkyToonsMemory,
    generateToonHash,
    highlightGroupsEnabled,
  ).catch(error => console.error('[ToonHQ+] Failed to apply group highlights:', error));
}

async function getSavedToonLists(): Promise<SavedToonLists> {
  const [favorites, blocked] = await Promise.all([
    getAllFromList('toony_toons'),
    getAllFromList('stinky_toons'),
  ]);

  return { favorites, blocked };
}

async function refreshSavedToonGroupHighlights(savedToonLists?: SavedToonLists) {
  const { favorites, blocked } = savedToonLists ?? (await getSavedToonLists());

  toonyToonsMemory = new Set(favorites);
  stinkyToonsMemory = new Set(blocked);
  applyCurrentGroupHighlights();
}

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    injectHighlightStyles();
    const cachedPopulationPromise = browser.storage.local.get(DISTRICT_POPULATION_STORAGE_KEY);
    const acceptDistrictPopulation = (snapshot: DistrictPopulationSnapshot | undefined) => {
      if (!snapshot?.populationByDistrict) return;
      if (districtPopulation && (snapshot.fetchedAt || 0) < (districtPopulation.fetchedAt || 0)) return;
      districtPopulation = snapshot;
      applyGroupDistrictIndicators();
    };
    const handlePopulationStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local') return;
      acceptDistrictPopulation(
        changes[DISTRICT_POPULATION_STORAGE_KEY]?.newValue as DistrictPopulationSnapshot | undefined,
      );
    };
    // Other ToonHQ tabs share the same cached snapshot through extension storage.
    browser.storage.onChanged.addListener(handlePopulationStorageChange);
    ctx.onInvalidated(() => browser.storage.onChanged.removeListener(handlePopulationStorageChange));

    let districtPopulationRequest: Promise<void> | null = null;
    const refreshDistrictPopulation = () => {
      if (districtPopulationRequest) return districtPopulationRequest;
      districtPopulationRequest = (async () => {
        const stored = await browser.storage.local.get(DISTRICT_POPULATION_STORAGE_KEY);
        const cached = stored[DISTRICT_POPULATION_STORAGE_KEY] as DistrictPopulationSnapshot | undefined;
        if (cached?.fetchedAt && Date.now() - cached.fetchedAt < DISTRICT_POPULATION_REFRESH_MS) {
          acceptDistrictPopulation(cached);
          return;
        }

        try {
          // The public TTR API enables CORS, so this page-principal request does
          // not require extension access to the Toontown Rewritten origin.
          const response = await pageFetch(DISTRICT_POPULATION_URL, {
            cache: 'no-store',
            credentials: 'omit',
          });
          if (!response.ok) throw new Error(`Population API returned ${response.status}.`);
          const data = await response.json();
          if (!data || data.error || typeof data.populationByDistrict !== 'object') {
            throw new Error(data?.error || 'Population API returned an invalid response.');
          }

          const snapshot: DistrictPopulationSnapshot = {
            populationByDistrict: Object.fromEntries(
              Object.entries(data.populationByDistrict)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
            ),
            statusByDistrict: typeof data.statusByDistrict === 'object' && data.statusByDistrict
              ? data.statusByDistrict
              : {},
            lastUpdated: typeof data.lastUpdated === 'number' ? data.lastUpdated : null,
            fetchedAt: Date.now(),
          };
          acceptDistrictPopulation(snapshot);
          await browser.storage.local.set({ [DISTRICT_POPULATION_STORAGE_KEY]: snapshot });
        } catch (error) {
          console.warn('[ToonHQ+] Failed to refresh district population:', error);
        }
      })().finally(() => {
        districtPopulationRequest = null;
      });
      return districtPopulationRequest;
    };

    const populationRefreshInterval = window.setInterval(
      () => void refreshDistrictPopulation(),
      DISTRICT_POPULATION_CHECK_MS,
    );
    ctx.onInvalidated(() => window.clearInterval(populationRefreshInterval));

    // Run migration from old local storage on first start
    await migrateFromLocalStorage();

    // Ensure all default settings are persisted if they don't exist
    await Promise.all(Object.entries(DEFAULT_SETTINGS).map(async ([key, defaultValue]) => {
      const existing = await getSetting(key);
      if (existing === undefined) await setSetting(key, defaultValue);
    }));

    // Now load everything into local state
    const currentSettings = await getSettings(Object.keys(DEFAULT_SETTINGS));
    bossInfoEnabled = currentSettings['boss-info-enabled'] !== false;
    notesEnabled = currentSettings['notes-enabled'] !== false;
    highlightGroupsEnabled = currentSettings['highlight-groups'] !== false;
    if (currentSettings['navbar-config']) {
      applyNavbarCustomization(currentSettings['navbar-config']);
    }

    let savedGroupFiltersByGame = await getSetting<Record<string, GroupFilters>>(GROUP_FILTERS_SETTING_KEY) || {};
    let restoredFilterGameId: number | null = null;
    let groupFiltersWrite = Promise.resolve();

    const restoreFiltersForGame = (gameId: number) => {
      if (!Number.isFinite(gameId) || restoredFilterGameId === gameId) return;
      restoredFilterGameId = gameId;
      const filters = normalizeGroupFilters(savedGroupFiltersByGame[String(gameId)]);
      if (filters) {
        window.dispatchEvent(new CustomEvent('toonhqplus-restore-group-filters', {
          detail: JSON.stringify({ gameId, filters }),
        }));
      }
    };

    const handleGroupFilterStoreReady = ((event: CustomEvent<string>) => {
      try {
        restoreFiltersForGame(Number(JSON.parse(event.detail).gameId));
      } catch { }
    }) as EventListener;

    const handleNativeGroupFiltersChanged = ((event: CustomEvent<string>) => {
      try {
        const payload = JSON.parse(event.detail);
        const gameId = Number(payload.gameId);
        if (restoredFilterGameId !== gameId) {
          restoreFiltersForGame(gameId);
          return;
        }
        const filters = normalizeGroupFilters(payload.filters);
        if (!filters) return;
        savedGroupFiltersByGame = { ...savedGroupFiltersByGame, [String(gameId)]: filters };
        const snapshot = savedGroupFiltersByGame;
        groupFiltersWrite = groupFiltersWrite
          .catch(() => undefined)
          .then(() => setSetting(GROUP_FILTERS_SETTING_KEY, snapshot));
      } catch { }
    }) as EventListener;

    window.addEventListener('toonhqplus-group-filter-store-ready', handleGroupFilterStoreReady);
    window.addEventListener('toonhqplus-group-filters-changed', handleNativeGroupFiltersChanged);
    ctx.onInvalidated(() => {
      window.removeEventListener('toonhqplus-group-filter-store-ready', handleGroupFilterStoreReady);
      window.removeEventListener('toonhqplus-group-filters-changed', handleNativeGroupFiltersChanged);
    });

    try {
      const storedPopulation = await cachedPopulationPromise;
      const snapshot = storedPopulation[DISTRICT_POPULATION_STORAGE_KEY] as DistrictPopulationSnapshot | undefined;
      acceptDistrictPopulation(snapshot);
    } catch (error) {
      console.warn('[ToonHQ+] Could not load cached district population:', error);
    }
    void refreshDistrictPopulation();

    let districtIndicatorFrame: number | null = null;
    const scheduleDistrictIndicators = () => {
      if (districtIndicatorFrame !== null) return;
      districtIndicatorFrame = window.requestAnimationFrame(() => {
        districtIndicatorFrame = null;
        applyGroupDistrictIndicators();
      });
    };
    const districtIndicatorObserver = new MutationObserver(scheduleDistrictIndicators);
    districtIndicatorObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['district-name'],
    });
    ctx.onInvalidated(() => {
      districtIndicatorObserver.disconnect();
      if (districtIndicatorFrame !== null) window.cancelAnimationFrame(districtIndicatorFrame);
    });

    // Start the page bridge and cached indicator rendering before the slower
    // Toon/group history synchronization below.
    injectVueLogger();
    scheduleDistrictIndicators();

    window.addEventListener('pointerdown', hideDistrictTooltip, true);
    window.addEventListener('scroll', hideDistrictTooltip, true);
    window.addEventListener('resize', hideDistrictTooltip);
    ctx.onInvalidated(() => {
      hideDistrictTooltip();
      window.removeEventListener('pointerdown', hideDistrictTooltip, true);
      window.removeEventListener('scroll', hideDistrictTooltip, true);
      window.removeEventListener('resize', hideDistrictTooltip);
    });

    // 1) Load owned toons from ToonHQ's authenticated page bootstrap. Only use
    // the API as a logged-in fallback when the server did not embed the list.
    if (isToonHqAuthenticated()) {
      try {
        let toonsData = getToonHqOwnedToons();
        if (!Array.isArray(toonsData)) {
          const toonsResp = await fetch('https://toonhq.org/api/toons/', { credentials: 'include' });
          if (!toonsResp.ok) throw new Error(`ToonHQ returned ${toonsResp.status}.`);
          toonsData = await toonsResp.json();
        }
        if (Array.isArray(toonsData)) {
        const newToons: ToonRecord[] = toonsData.map((toon: any) => {
          const id = String(toon.id);
          const normalized = { ...toon, id };
          activeToons[id] = normalized;
          toons[id] = normalized;
          return {
            id,
            name: toon.name || '',
            species: toon.species,
            color: toon.color,
            laff: toon.laff,
            level: toon.level,
            photo: toon.photo,
            photo_bg: toon.photo_bg,
            ring: toon.ring,
            toonup: toon.toonup,
            trap: toon.trap,
            lure: toon.lure,
            sound: toon.sound,
            throw: toon.throw,
            squirt: toon.squirt,
            drop: toon.drop,
            prestiges: toon.prestiges,
            organic_level: toon.organic_level,
            sellbot: toon.sellbot,
            cashbot: toon.cashbot,
            lawbot: toon.lawbot,
            bossbot: toon.bossbot,
            lastSeen: new Date().toISOString(),
          } as ToonRecord;
        });
        await putToons(newToons);
        await setSetting('active-toon-ids', newToons.map(t => t.id));
        }
      } catch (e) {
        console.error('[ToonHQ+] Failed to load active toons', e);
      }
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
          species: incoming.species,
          color: incoming.color,
          laff: incoming.laff,
          level: incoming.level,
          photo: incoming.photo,
          photo_bg: incoming.photo_bg,
          ring: incoming.ring,
          toonup: incoming.toonup,
          trap: incoming.trap,
          lure: incoming.lure,
          sound: incoming.sound,
          throw: incoming.throw,
          squirt: incoming.squirt,
          drop: incoming.drop,
          prestiges: incoming.prestiges,
          organic_level: incoming.organic_level,
          sellbot: incoming.sellbot,
          cashbot: incoming.cashbot,
          lawbot: incoming.lawbot,
          bossbot: incoming.bossbot,
          lastSeen: new Date().toISOString(),
          hashId,
        };
        toons[id] = rec as ToonData;
        newToons.push(rec);
      });
      if (newToons.length) putToons(newToons).catch(console.error);
    };

    const cleanupToonCacheTask = async () => {
      try {
        await cleanupToonCache();
      } catch (e) {
        console.error('[ToonHQ+] Cleanup failed:', e);
      }
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
        options: group.options,
      }).catch(console.error);

      // Persist all members
      const currentMemberIds = new Set(group.members.map((m: any) => m.toon?.id).filter(Boolean));
      const memberRecords: GroupMemberRecord[] = group.members
        .filter((m: any) => m.toon)
        .map((m: any) => ({
          groupId,
          toonId: String(m.toon.id || generateToonHash(m.toon.name || '', m.toon.photo || '')),
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
      }
    } catch (e) {
      console.error('[ToonHQ+] Failed to fetch initial groups list', e);
    }

    // 3) Then start websocket to listen for group changes
    // Run cleanup on startup and every 30 minutes. Use a restartable timeout so
    // content-script invalidation can cancel long-lived background work cleanly.
    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
    let groupTrackerDisposed = false;
    const scheduleCleanupToonCache = () => {
      if (groupTrackerDisposed) return;
      cleanupTimeout = setTimeout(async () => {
        cleanupTimeout = null;
        if (groupTrackerDisposed) return;
        await cleanupToonCacheTask();
        scheduleCleanupToonCache();
      }, 30 * 60 * 1000);
    };
    cleanupToonCacheTask().finally(scheduleCleanupToonCache);

    let isReconnecting = false;
    let plannedSocketRestart = false;
    let activeGroupSocket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let socketRestartTimeout: ReturnType<typeof setTimeout> | null = null;
    let nextSocketAckId = 0;
    let pendingSocketAuthToken = takeEmbeddedSocketAuthToken();
    let socketNamespaceReady = false;
    let lastKnownAuthentication = isToonHqAuthenticated();
    let lastKnownBoardingSubscriptionToonId = getToonHqActiveTtrToonId();
    setBoardingCreationSubscription(lastKnownBoardingSubscriptionToonId);

    const emitSocketEventWithAck = (ws: WebSocket, eventName: string, ...args: unknown[]) => {
      const ackId = nextSocketAckId++;
      ws.send(`42${ackId}${JSON.stringify([eventName, ...args])}`);
      return ackId;
    };

    const authenticateSocket = async (ws: WebSocket) => {
      if (!isToonHqAuthenticated()) return;
      const csrfToken = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
      try {
        let token = pendingSocketAuthToken;
        pendingSocketAuthToken = null;
        if (!token) {
          if (!csrfToken) return;
          const response = await pageFetch(new URL('/api/accounts/socket_auth/', window.location.origin).href, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRFToken': decodeURIComponent(csrfToken) },
          });
          if (!response.ok) throw new Error(`ToonHQ returned ${response.status}.`);
          token = await response.json();
        }
        if (activeGroupSocket === ws && ws.readyState === WebSocket.OPEN) {
          emitSocketEventWithAck(ws, 'auth', token);
        }
      } catch (error) {
        console.warn('[ToonHQ+] Could not authenticate the groups socket:', error);
      }
    };

    const scheduleSocketRestart = () => {
      if (groupTrackerDisposed) return;
      if (socketRestartTimeout) clearTimeout(socketRestartTimeout);
      socketRestartTimeout = setTimeout(() => {
        socketRestartTimeout = null;
        if (groupTrackerDisposed) return;
        if (!activeGroupSocket || activeGroupSocket.readyState === WebSocket.CLOSED) {
          connectWebSocket();
          return;
        }
        plannedSocketRestart = true;
        activeGroupSocket.close();
      }, 60 * 60 * 1000);
    };

    const connectWebSocket = () => {
      if (groupTrackerDisposed) return;
      if (activeGroupSocket && (
        activeGroupSocket.readyState === WebSocket.CONNECTING
        || activeGroupSocket.readyState === WebSocket.OPEN
      )) return;

      // Keep the extension-owned socket on the same ToonHQ origin as the page.
      // This matters when ToonHQ is reached through a canonical subdomain: the
      // Socket.IO session and its authenticated HTTP requests must share an
      // origin for boarding requests and Quick Teleport to work together.
      const socketUrl = new URL('/socket.io/', window.location.origin);
      socketUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socketUrl.searchParams.set('protocol', '3');
      socketUrl.searchParams.set('EIO', '4');
      socketUrl.searchParams.set('transport', 'websocket');

      let ws: WebSocket;
      try {
        // Firefox MV2 content scripts have an expanded isolated global. Create
        // the socket through the page window (the same route used by
        // pageFetch) so it receives the page principal, appears in the page's
        // Network monitor, and shares ToonHQ's authenticated socket context.
        const pageContent = (globalThis as any).content;
        const WebSocketConstructor = typeof pageContent?.WebSocket === 'function'
          ? pageContent.WebSocket
          : WebSocket;
        ws = new WebSocketConstructor(socketUrl.href) as WebSocket;
      } catch (error) {
        console.warn('[ToonHQ+] Could not open the groups WebSocket:', error);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          connectWebSocket();
        }, 5000);
        return;
      }
      activeGroupSocket = ws;

      ws.addEventListener('open', () => {
        if (isReconnecting) {
          if (plannedSocketRestart) {
            console.info('[ToonHQ+] Group tracker socket restarted.');
            plannedSocketRestart = false;
            isReconnecting = false;
          } else {
            console.info('[ToonHQ+] Reconnected! Reloading page...');
            window.location.reload();
            return;
          }
        }

        if (activeGroupSocket !== ws) {
          return;
        }

        console.info('[ToonHQ+] Direct WebSocket connection opened.');
      });

      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          const str = event.data;

          // Handle Socket.io Ping (2)
          if (str === '2') {
            ws.send('3'); // send Pong
            return;
          }

          // Wait for the Engine.IO open packet before opening the Socket.IO namespace.
          if (str.startsWith('0')) {
            ws.send('40');
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
                if (prefix === '40' && payload && !Array.isArray(payload) && typeof payload.sid === 'string') {
                  socketNamespaceReady = true;
                  setBoardingGroupsSocketSid(payload.sid);
                  console.info('[ToonHQ+] Groups Socket.IO session ready.');
                  emitSocketEventWithAck(ws, 'track', 'groups', 1);
                  void authenticateSocket(ws);
                } else if (Array.isArray(payload) && typeof payload[0] === 'string') {
                  const eventName = payload[0];
                  const data = payload[1];
                  if (eventName === 'boarding_response') {
                    handleBoardingResponse(data);
                  } else if (eventName === 'boarding_created') {
                    handleBoardingCreated(data);
                  } else if (eventName === 'group_created') {
                    data.members?.forEach((m: any) => { if (m.toon) applyToonHash(m.toon); });
                    groupsState[data.id] = data;
                    syncToonData(data.members);
                    syncGroupHistory(data);
                  } else if (eventName === 'group_disbanded') {
                    const gid = Number(data.id);
                    const disbandedGroup = groupsState[gid];
                    const activeMemberCount = Array.isArray(disbandedGroup?.members)
                      ? disbandedGroup.members.filter((member: any) => !member.left).length
                      : (groupMemberIds[gid]?.size ?? 0);
                    if (activeMemberCount <= 2) {
                      deleteGroup(gid).catch(error => console.error('[ToonHQ+] Failed to remove short-lived group from history:', error));
                    }
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
                }
              } catch (e) {
                // Ignore malformed or unsupported socket messages.
              }
            }
          }
        }
      });

      ws.addEventListener('close', () => {
        if (activeGroupSocket === ws) activeGroupSocket = null;
        socketNamespaceReady = false;
        rejectPendingBoardingRequests();
        if (groupTrackerDisposed) return;
        if (!isReconnecting) {
          console.info(plannedSocketRestart
            ? '[ToonHQ+] Restarting group tracker socket...'
            : '[ToonHQ+] WebSocket closed. Attempting to reconnect...');
          isReconnecting = true;
        }
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          connectWebSocket();
        }, plannedSocketRestart ? 250 : 5000);
      });

      ws.addEventListener('error', () => {
        console.warn('[ToonHQ+] WebSocket error.');
      });

      scheduleSocketRestart();
    };

    connectWebSocket();

    // ToonHQ login/logout happens inside the SPA without necessarily reloading
    // the page, so mirror its account watcher for the extension-owned socket.
    const authenticationInterval = window.setInterval(() => {
      const boardingSubscriptionToonId = getToonHqActiveTtrToonId();
      if (boardingSubscriptionToonId !== lastKnownBoardingSubscriptionToonId) {
        lastKnownBoardingSubscriptionToonId = boardingSubscriptionToonId;
        setBoardingCreationSubscription(boardingSubscriptionToonId);
      }

      const authenticated = isToonHqAuthenticated();
      if (authenticated === lastKnownAuthentication) return;
      lastKnownAuthentication = authenticated;
      const ws = activeGroupSocket;
      if (!ws || ws.readyState !== WebSocket.OPEN || !socketNamespaceReady) return;
      if (authenticated) void authenticateSocket(ws);
      else ws.send(`42${JSON.stringify(['clear_auth'])}`);
    }, 750);

    ctx.onInvalidated(() => {
      groupTrackerDisposed = true;
      window.clearInterval(authenticationInterval);
      if (cleanupTimeout) clearTimeout(cleanupTimeout);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socketRestartTimeout) clearTimeout(socketRestartTimeout);
      plannedSocketRestart = false;
      if (activeGroupSocket) {
        activeGroupSocket.close();
        activeGroupSocket = null;
      }
    });

    let lastUserActivityAt = Date.now();
    const markUserActivity = () => {
      lastUserActivityAt = Date.now();
    };
    const userActivityEvents = ['keydown', 'mousedown', 'pointerdown', 'touchstart', 'wheel'] as const;
    userActivityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markUserActivity, { passive: true, capture: true });
    });

    let reloadCheckInFlight = false;
    const idleReloadInterval = setInterval(() => {
      const idleFor = Date.now() - lastUserActivityAt;
      const hasOpenDialog = !!document.querySelector('.group-details-dialog, .modal.show, .vuedal');
      if (idleFor >= IDLE_RELOAD_AFTER_MS && document.visibilityState === 'hidden' && !hasOpenDialog) {
        if (reloadCheckInFlight) return;
        reloadCheckInFlight = true;
        toonHQIsReachable()
          .then((reachable) => {
            if (reachable) window.location.reload();
          })
          .finally(() => {
            reloadCheckInFlight = false;
          });
      }
    }, 60 * 1000);

    ctx.onInvalidated(() => {
      userActivityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markUserActivity, { capture: true });
      });
      clearInterval(idleReloadInterval);
    });

    const bossValuesExist = () => {
      const dialog = document.querySelector(".group-details-dialog .modal-body");
      if (!dialog) return true;
      let childrenText = "";
      for (const child of dialog.children) {
        if (child.textContent?.toLowerCase().includes("district")) {
          break;
        }
        childrenText += child.textContent;
      }
      if (childrenText.includes("CEO") && childrenText.trim() !== "CEO") {
        return true;
      }
      if (childrenText.includes("CJ") && childrenText.trim() !== "CJ") {
        return true;
      }
      return false;
    }

    const getFacilityRewards = (title: string) => {
      let rewardType = "";
      let rewardAmount = "";
      if (title.includes('factory')) {
        rewardType = "Merits";
        rewardAmount = "350 - 1630";
        if (title.includes('scrap')) {
          rewardAmount = "350 - 638";
          if (title.includes('short')) {
            rewardAmount = "350 - 356";
          }
          if (title.includes('long')) {
            rewardAmount = "596 - 638";
          }
        }
        if (title.includes('steel')) {
          rewardAmount = "867 - 1630";
          if (title.includes('short')) {
            rewardAmount = "867 - 950";
          }
          if (title.includes('long')) {
            rewardAmount = "1525 - 1630";
          }
        }
      }
      if (title.includes('mint')) {
        rewardType = "Cogbucks";
        rewardAmount = "702 - 1850";
        if (title.includes('coin')) {
          rewardAmount = "702 - 807";
        }
        if (title.includes('bullion')) {
          rewardAmount = "1626 - 1850";
        }
      }
      if (title.includes('da office')) {
        rewardType = "Jury Notices";
        rewardAmount = "781 - 2082";
        if (title.includes('junior')) {
          rewardAmount = "781 - 889";
        }
        if (title.includes('senior')) {
          rewardAmount = "1854 - 2082";
        }
      }
      if (title.includes('cog golf')) {
        rewardType = "Stock Options";
        rewardAmount = "882 - 2305";
        if (title.includes('fairway')) {
          rewardAmount = "882 - 975";
        }
        if (title.includes('fringe')) {
          rewardAmount = "2097 - 2305";
        }
      }
      return { rewardType, rewardAmount };
    }

    const insertFacilityRewards = (d: HTMLElement) => {
      const h4 = d.querySelector('h4');
      if (!h4) return;
      const title = h4.innerText.toLowerCase().trim();
      const { rewardType, rewardAmount } = getFacilityRewards(title);

      if (!rewardType || !rewardAmount) return;

      const parentDiv = document.querySelector(".row.text-center:has(.col-6)");
      if (parentDiv) {
        if (parentDiv.children.length === 5) {
          return;
        }
        const rewardDiv = document.createElement("div");
        rewardDiv.className = "col-6 col-sm-3";
        rewardDiv.innerHTML = `
          <h6>${rewardType}</h6>
          <p>${rewardAmount}</p>
        `;
        parentDiv.appendChild(rewardDiv);
      }

    }

    // also ensure any .group-details-dialog gets forced to 980px width inline
    const fixDialog = (d: HTMLElement) => {
      if (!bossInfoEnabled) {
        // If disabled, remove any existing injected info and unwrap titles
        const wrapper = d.querySelector('.boss-title-wrapper');
        if (wrapper) {
          const originalH4 = wrapper.querySelector('h4');
          if (originalH4 && wrapper.parentElement) {
            wrapper.parentElement.insertBefore(originalH4, wrapper);
            originalH4.classList.remove('text-center', 'mt-2', 'mb-3');
          }
          wrapper.remove();
        }
        d.querySelectorAll('.boss-info').forEach((el) => el.remove());
        return;
      }

      if (bossValuesExist()) return;
      insertFacilityRewards(d);

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
          updateBossInfo(d);
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
          updateBossInfo(d);
        }, 100);
      }
    };
    document.querySelectorAll('.group-details-dialog').forEach((el) => {
      fixDialog(el as HTMLElement);
    });
    const dialogObserver = new MutationObserver((mutations) => {
      let checkAll = false;
      const dialogs = new Set<HTMLElement>();

      for (const m of mutations) {
        if (isBossInfoMutationNode(m.target)) {
          continue;
        }

        m.addedNodes.forEach((node) => {
          if (isBossInfoMutationNode(node)) return;
          if (!(node instanceof HTMLElement)) return;

          if (node.matches?.('.group-details-dialog')) dialogs.add(node);
          const closest = node.closest?.('.group-details-dialog') as HTMLElement | null;
          if (closest) dialogs.add(closest);

          if (node.tagName === 'H4' || node.querySelector?.('h4')) checkAll = true;
        });

        m.removedNodes.forEach((node) => {
          if (isBossInfoMutationNode(node)) return;
          if (!(node instanceof HTMLElement)) return;

          if (m.target instanceof HTMLElement) {
            const closest = m.target.closest?.('.group-details-dialog') as HTMLElement | null;
            if (closest) dialogs.add(closest);
          }
          if (node.tagName === 'H4' || node.querySelector?.('h4')) checkAll = true;
        });
      }

      if (checkAll) {
        document.querySelectorAll('.group-details-dialog').forEach((el) => fixDialog(el as HTMLElement));
      } else {
        dialogs.forEach((d) => fixDialog(d));
      }
    });
    // Narrow observation to the .vuedals container where modals are rendered
    const vuedalsContainer = document.querySelector('.vuedals');
    if (vuedalsContainer) {
      dialogObserver.observe(vuedalsContainer, { childList: true, subtree: true });
    } else {
      dialogObserver.observe(document.body, { childList: true, subtree: true });
    }
    ctx.onInvalidated(() => dialogObserver.disconnect());

    updateBossInfo();
    applyRowHighlights();

    let dbHighlightTimeout: ReturnType<typeof setTimeout> | null = null;
    // Listen for DB changes (replaces browser.storage.onChanged)
    const handleDbChange = ((e: CustomEvent) => {
      const { store } = e.detail || {};
      if (store === 'toony_toons' || store === 'stinky_toons' || store === 'notes') {
        if (dbHighlightTimeout) clearTimeout(dbHighlightTimeout);
        dbHighlightTimeout = setTimeout(async () => {
          if (store === 'toony_toons' || store === 'stinky_toons') {
            try {
              const savedToonLists = await getSavedToonLists();
              await applyRowHighlights(savedToonLists);
              refreshSavedToonGroupHighlights(savedToonLists);
            } catch (error) {
              console.error(error);
            }
            return;
          }
          applyRowHighlights();
        }, 50);
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
        getSetting<boolean>('notes-enabled').then(enabled => {
          if (enabled !== undefined) {
            if (notesEnabled !== enabled) {
              window.location.reload();
            }
          }
        });
        getSetting<boolean>('highlight-groups').then(enabled => {
          if (enabled !== undefined) {
            highlightGroupsEnabled = enabled !== false;
            applyCurrentGroupHighlights();
          }
        });
      }
    }) as EventListener;

    window.addEventListener('toonhqplus-db-changed', handleDbChange);
    ctx.onInvalidated(() => window.removeEventListener('toonhqplus-db-changed', handleDbChange));

    let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (highlightTimeout) clearTimeout(highlightTimeout);
      highlightTimeout = setTimeout(async () => {
        highlightTimeout = null;
        try {
          const savedToonLists = await getSavedToonLists();
          await applyRowHighlights(savedToonLists);
          updateBossInfo();
          refreshSavedToonGroupHighlights(savedToonLists);
        } catch (error) {
          console.error(error);
        }

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

    try {
      const ui = await createShadowRootUi(ctx, {
        name: 'toonhq-plus-sidebar',
        position: 'overlay',
        anchor: 'body',
        append: 'last',
        onMount(container) {
          const wrapper = document.createElement('div');
          wrapper.style.setProperty('--book-opened-image', `url("${getExtensionResourceUrl('/images/book_opened.webp')}")`);
          wrapper.style.setProperty('--book-close-image', `url("${getExtensionResourceUrl('/images/book_close.webp')}")`);
          wrapper.style.setProperty('--book-closed-image', `url("${getExtensionResourceUrl('/images/book_closed.webp')}")`);
          wrapper.style.setProperty('--book-open-image', `url("${getExtensionResourceUrl('/images/book_open.webp')}")`);
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
