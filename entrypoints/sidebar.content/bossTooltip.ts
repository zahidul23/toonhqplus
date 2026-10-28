// Boss tooltip for CEO and CJ groups, shared by group cards and the group
// details dialog. Pure functions and CSS only, so tests can load it directly.
import { CEO_DIFFICULTY_TIERS, CJ_DIFFICULTY_TIERS, getCEODifficultyTier, getCJDifficultyTier, getCogNameForLevel } from './bossTiers.ts';

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

export const getTooltipNoteForThreshold = (
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

export interface BossTooltipInput {
  boss: 'CEO' | 'CJ';
  average: number;
  averageName: string;
  sum: number;
  toonCount: number;
}

const COG_ASSET_URL = 'https://toonhq.org/static/assets/cogs/';

/**
 * Boss tooltip shared by group cards and the group details dialog. The reward
 * (pink slips or lawyers) leads; the tier is secondary.
 */
export const renderBossTooltip = ({ boss, average, averageName, sum, toonCount }: BossTooltipInput) => {
  const bossKey = boss === 'CJ' ? 'lawbot' : 'bossbot';
  const stat = (value: string | number, label: string, extraClass = '') =>
    `<div class="toonhq-plus-boss-tip__stat ${extraClass}"><div class="toonhq-plus-boss-tip__label">${label}</div><div class="toonhq-plus-boss-tip__stat-value">${value}</div></div>`;
  const row = (minSuitValue: number, reward: string, isActive: boolean) => {
    const note = getTooltipNoteForThreshold(minSuitValue, sum, toonCount, average, isActive, bossKey);
    return `
      <div class="toonhq-plus-boss-tip__row ${isActive ? 'is-active' : ''}">
        <span class="toonhq-plus-boss-tip__reward">${reward}</span>
        <span class="toonhq-plus-boss-tip__who">${getCogNameForLevel(minSuitValue, bossKey)}+</span>
        ${note ? `<span class="toonhq-plus-boss-tip__hint">${note}</span>` : ''}
      </div>`;
  };

  let count: number, rewardName: string, tier: number, maxTier: number, roundName: string, thresholdsName: string, stats: string, rows: string;
  if (boss === 'CJ') {
    const data = getCJDifficultyTier(average);
    count = data.lawyers; rewardName = 'Lawyers'; tier = data.tier; maxTier = CJ_DIFFICULTY_TIERS.length; roundName = 'Evidence Round';
    thresholdsName = 'Lawyer Thresholds';
    stats = stat(data.gavels, 'Gavels') + stat(data.evidence, 'Evidence Count') +
      stat(`${data.laffHeal} Laff`, 'Evidence Heal') +
      stat(data.hasBonusWeight ? 'Yes' : 'No', 'Bonus Weight', data.hasBonusWeight ? 'is-yes' : 'is-no');
    rows = LAWYER_THRESHOLDS.map(t => row(t.minSuitValue, `${t.lawyerCount} Lawyers`, data.lawyers === t.lawyerCount)).join('');
  } else {
    const data = getCEODifficultyTier(average);
    count = data.slips; rewardName = 'Pink Slips'; tier = data.tier; maxTier = CEO_DIFFICULTY_TIERS.length; roundName = 'Feeding Round';
    thresholdsName = 'Pink Slip Thresholds';
    const cogs = data.cogTypes.map(img => `<img src="${COG_ASSET_URL}${img}" alt="" />`).join('');
    stats = stat(data.timer, 'Timer') + stat(data.tables, 'Tables') + stat(data.totalCogs, 'Total Cogs') +
      stat(`<span class="toonhq-plus-boss-tip__cogs">${cogs}</span>`, 'Cog Types');
    rows = PINK_SLIP_THRESHOLDS.map(t => row(t.minSuitValue, `${t.slipCount} Slips`, data.slips === t.slipCount)).join('');
  }

  return `
    <div class="toonhq-plus-boss-tip__hero">
      <div class="toonhq-plus-boss-tip__count">${count}</div>
      <div class="toonhq-plus-boss-tip__reward-name">${rewardName}</div>
      <div class="toonhq-plus-boss-tip__tier">Tier ${tier}/${maxTier}</div>
    </div>
    <div class="toonhq-plus-boss-tip__average">
      <span class="toonhq-plus-boss-tip__label">Group Average</span>
      <span class="toonhq-plus-boss-tip__average-value">${averageName}</span>
    </div>
    <div class="toonhq-plus-boss-tip__body">
      <div class="toonhq-plus-boss-tip__label toonhq-plus-boss-tip__section">${thresholdsName}</div>
      ${rows}
    </div>
    <div class="toonhq-plus-boss-tip__round">
      <div class="toonhq-plus-boss-tip__label">${roundName}</div>
      <div class="toonhq-plus-boss-tip__stats">${stats}</div>
    </div>`;
};

export const bossTooltipClass = (boss: 'CEO' | 'CJ') =>
  `toonhq-plus-boss-tip toonhq-plus-boss-tip--${boss === 'CJ' ? 'lawbot' : 'bossbot'}`;

/** Distance from the tooltip's top to its arrow: the middle of the colored header. */
export const BOSS_TOOLTIP_ARROW_TOP = 28;

export const BOSS_TOOLTIP_CSS = `
    /* Boss tooltip (group details dialog and group cards). */
    .boss-info {
      position: relative;
      cursor: help;
    }
    .toonhq-plus-boss-tip {
      --boss-hero: #8a5a2e;
      --boss-band: #6b4423;
      --boss-accent: #e8b27c;
      --boss-accent-bg: rgba(232, 178, 124, 0.16);
      --boss-accent-border: rgba(232, 178, 124, 0.5);
      --boss-body: #1b2421;
      width: 252px;
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--boss-body);
      color: #fff;
      box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.6);
      font-family: Roboto, sans-serif;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.3;
      letter-spacing: normal;
      text-align: left;
      text-transform: none;
      pointer-events: none;
      z-index: 2147483000;
    }
    .toonhq-plus-boss-tip--lawbot {
      --boss-hero: #31528c;
      --boss-band: #243f6e;
      --boss-accent: #93b4f0;
      --boss-accent-bg: rgba(147, 180, 240, 0.16);
      --boss-accent-border: rgba(147, 180, 240, 0.5);
    }
    /* Dialog copy: anchored beside the "(5 Pink Slips)" heading, shown on hover. */
    .boss-info-tooltip {
      position: absolute;
      /* Top-anchored: the arrow beside the header points at the heading. */
      top: 50%;
      left: calc(100% + 12px);
      transform: translateY(-${BOSS_TOOLTIP_ARROW_TOP}px);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
    }
    .boss-info:hover .boss-info-tooltip {
      opacity: 1;
      visibility: visible;
    }
    /* Card copy: positioned on the page by showBossTierTooltip(). */
    .toonhq-plus-boss-tip--floating {
      position: fixed;
      overflow: visible;
    }
    .toonhq-plus-boss-tip--floating > :first-child { border-radius: 13px 13px 0 0; }
    .toonhq-plus-boss-tip--floating > :last-child { border-radius: 0 0 13px 13px; }
    .boss-info-tooltip::before,
    .toonhq-plus-boss-tip--floating::before {
      content: '';
      position: absolute;
      top: var(--toonhq-plus-arrow-top, ${BOSS_TOOLTIP_ARROW_TOP}px);
      right: 100%;
      transform: translateY(-50%);
      border-width: 7px;
      border-style: solid;
      border-color: transparent var(--boss-hero) transparent transparent;
    }
    .boss-info-tooltip { overflow: visible; }
    .boss-info-tooltip > :first-child { border-radius: 13px 13px 0 0; }
    .boss-info-tooltip > :last-child { border-radius: 0 0 13px 13px; }
    .toonhq-plus-boss-tip--floating[data-placement="left"]::before {
      right: auto;
      left: 100%;
      border-color: transparent transparent transparent var(--boss-hero);
    }
    .toonhq-plus-boss-tip__hero {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 11px 14px 9px;
      background: var(--boss-hero);
    }
    .toonhq-plus-boss-tip__count {
      font-family: 'Luckiest Guy', cursive;
      font-size: 32px;
      line-height: 1;
      padding-top: 4px;
      margin-right: -3px;
      text-shadow: 0 2px 0 rgba(0, 0, 0, 0.25);
    }
    .toonhq-plus-boss-tip__reward-name {
      font-family: 'Luckiest Guy', cursive;
      font-size: 20px;
      letter-spacing: 0.03em;
      line-height: 1.1;
      padding-top: 3px;
    }
    .toonhq-plus-boss-tip__tier {
      margin-left: auto;
      font-size: 11px;
      font-weight: 700;
      opacity: 0.8;
      white-space: nowrap;
    }
    .toonhq-plus-boss-tip__average {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 14px;
      background: var(--boss-band);
    }
    .toonhq-plus-boss-tip__average .toonhq-plus-boss-tip__label { color: rgba(255, 255, 255, 0.7); }
    .toonhq-plus-boss-tip__average-value {
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .toonhq-plus-boss-tip__body { padding: 10px 12px 12px; }
    /* Round info sits in a darker footer tray, like the group average band. */
    .toonhq-plus-boss-tip__round {
      padding: 10px 12px 12px;
      background: rgba(0, 0, 0, 0.28);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .toonhq-plus-boss-tip__label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #93a39b;
    }
    .toonhq-plus-boss-tip__stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 6px;
    }
    .toonhq-plus-boss-tip__stat {
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
    }
    .toonhq-plus-boss-tip__stat-value {
      display: flex;
      align-items: center;
      height: 20px;
      margin-top: 2px;
      font-size: 14px;
      font-weight: 700;
    }
    .toonhq-plus-boss-tip__stat.is-yes .toonhq-plus-boss-tip__stat-value { color: #4ade80; }
    .toonhq-plus-boss-tip__stat.is-no .toonhq-plus-boss-tip__stat-value { color: #f87171; }
    .toonhq-plus-boss-tip__cogs { display: inline-flex; }
    .toonhq-plus-boss-tip__cogs img { width: 20px; height: 20px; }
    .toonhq-plus-boss-tip__cogs img + img { margin-left: -6px; }
    .toonhq-plus-boss-tip__section { margin-bottom: 4px; }
    .toonhq-plus-boss-tip__row {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      column-gap: 8px;
      margin: 0 -4px;
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 12px;
      color: #c9d4cf;
    }
    .toonhq-plus-boss-tip__row + .toonhq-plus-boss-tip__row { margin-top: 2px; }
    .toonhq-plus-boss-tip__reward { font-weight: 700; color: #fff; }
    .toonhq-plus-boss-tip__who { text-align: right; }
    /* The group's current threshold is a highlighted block. */
    .toonhq-plus-boss-tip__row.is-active {
      background: var(--boss-accent-bg);
      box-shadow: inset 0 0 0 1px var(--boss-accent-border);
      color: var(--boss-accent);
      font-weight: 700;
    }
    .toonhq-plus-boss-tip__row.is-active .toonhq-plus-boss-tip__reward { color: var(--boss-accent); }
    .toonhq-plus-boss-tip__hint {
      grid-column: 1 / -1;
      margin-top: 1px;
      /* Sits under the suit requirement it describes. */
      text-align: right;
      font-size: 10px;
      font-weight: 400;
      font-style: italic;
      color: #8d9a94;
    }
    .toonhq-plus-boss-tip__row.is-active .toonhq-plus-boss-tip__hint { color: var(--boss-accent); opacity: 0.85; }
`;
