/**
 * ToonHQ+ Boss Info Standalone Demo
 * 
 * This script demonstrates an enhanced boss info display for ToonHQ.org.
 * It uses a self-contained DOM-driven approach (MutationObserver, manual parsing, 
 * and template strings) which can be substituted with native Vue reactivity, 
 * computed properties, and templating for idiomatic integration.
 * 
 * Logic Flow:
 * 1. Observer: Detects the presence of a group detail modal.
 * 2. Injection: Adds a dedicated header for group-wide boss metrics.
 * 3. Extraction: Parses member suit data from image titles.
 * 4. Processing: Calculates the group average and maps to boss-specific tiers.
 * 5. Rendering: Updates the header text and serves a rich, interactive tooltip.
 * 
 * Instructions:
 * 1. Open ToonHQ.org
 * 2. Paste this entire script into the browser console.
 * 3. Open a group detail dialog for a CEO or CJ group.
 */

(() => {
  console.log("%c[ToonHQ+ Demo] Initializing Boss Info Demo...", "color: #10b981; font-weight: bold;");

  // --- 1. CSS Styling ---
  const style = document.createElement('style');
  style.textContent = `
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
      min-width: 250px;
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
    .tooltip-value.bossbot-info {
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
      justify-content: flex-end;
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
  `;
  document.head.appendChild(style);

  // --- 2. Calculation Logic ---
  const getSuitLevel = (suitString) => {
    if (!suitString) return 0;
    const cogPart = parseInt(suitString.substring(0, 1), 16);
    const isPrestiged = suitString.substring(1, 2) === '2';
    const levelPart = parseInt(suitString.substring(2), 16);
    return isPrestiged ? 78 : ((4 * cogPart) + levelPart - 4);
  };

  const getCogNameForLevel = (level, suit) => {
    if (level <= 5) return (suit === "lawbot" ? "Bottom Feeder" : "Flunky") + " " + level;
    if (level <= 10) return (suit === "lawbot" ? "Bloodsucker" : "Pencil Pusher") + " " + (level - 4);
    if (level <= 15) return (suit === "lawbot" ? "Double Talker" : "Yesman") + " " + (level - 8);
    if (level <= 20) return (suit === "lawbot" ? "Ambulance Chaser" : "Micromanager") + " " + (level - 12);
    if (level <= 25) return (suit === "lawbot" ? "Back Stabber" : "Downsizer") + " " + (level - 16);
    if (level <= 30) return (suit === "lawbot" ? "Spin Doctor" : "Head Hunter") + " " + (level - 20);
    if (level <= 35) return (suit === "lawbot" ? "Legal Eagle" : "Corporate Raider") + " " + (level - 24);
    return (suit === "lawbot" ? "Big Wig" : "The Big Cheese") + " " + (level - 28);
  };

  const CJ_DIFFICULTY_TIERS = [
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

  const getCJDifficultyTier = (value) => {
    return CJ_DIFFICULTY_TIERS.find(tier => value >= tier.minlevel) || CJ_DIFFICULTY_TIERS[8];
  }

  const getPinkSlips = (value) => {
    if (value >= 63) return 6;
    if (value >= 48) return 5;
    if (value >= 33) return 4;
    if (value >= 17) return 3;
    if (value >= 1) return 2;
    return 0;
  };

  // --- 3. Configuration & Rendering Helpers ---
  const BOSS_CONFIG = {
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

  const renderTierRow = (label, value, isActive, extraClass = '') => `
    <div class="tooltip-tier-row ${isActive ? 'active' : ''} ${extraClass}">
      <div class="tooltip-label">${label}</div>
      <div class="tooltip-value">${value}</div>
    </div>
  `;

  const renderLawbotTooltip = (tierData, suitString, bossKey) => {
    const lawyerRowsHtml = LAWYER_THRESHOLDS.map(threshold =>
      renderTierRow(`${getCogNameForLevel(threshold.minSuitValue, bossKey)}+`, `${threshold.lawyerCount} Lawyers`, tierData.lawyers === threshold.lawyerCount)
    ).join('');

    const statsList = [
      { label: 'Lawyers', value: tierData.lawyers },
      { label: 'Gavels', value: tierData.gavels },
      { label: 'Bonus Weight', value: tierData.hasBonusWeight ? 'Yes' : 'No' },
      { label: 'Evidence Count', value: tierData.evidence },
      { label: 'Evidence Heal', value: tierData.laffHeal }
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

  const renderBossbotTooltip = (suitString, currentPinkSlips, bossKey) => {
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

  // --- 4. UI Update Logic ---
  const updateBossInfo = () => {
    const dialog = document.querySelector('.group-details-dialog');
    const thisBossInfo = dialog?.querySelector(".boss-info");
    if (!dialog || !thisBossInfo) return;

    const thisBossName = dialog.querySelector('h4')?.textContent?.trim();
    const thisBossKey = thisBossName ? BOSS_CONFIG[thisBossName] : null;
    if (!thisBossKey) return;

    const suitValues = Array.from(dialog.querySelectorAll('.group-member-row'))
      .map(row => row.__vue__.toon[thisBossKey])
      .filter(Boolean)
      .map(getSuitLevel);

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
    let tooltipEl = thisBossInfo.querySelector('.boss-info-tooltip');
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
  };

  // --- 4. Insert Boss Info in Dialog ---
  const fixDialog = (dialog) => {
    const h4 = dialog.querySelector('h4');
    if (h4 && (h4.innerText.includes('CEO') || h4.innerText.includes('CJ'))) {
      if (dialog.querySelector('.boss-info')) return; // Already injected

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 1em;';

      const parent = h4.parentElement;
      parent.insertBefore(wrapper, h4);
      wrapper.appendChild(h4);

      const bossInfoH4 = document.createElement('h4');
      bossInfoH4.className = 'boss-info text-center mt-2 mb-3';
      wrapper.appendChild(bossInfoH4);

      // Force update
      setTimeout(updateBossInfo, 100);
    }
  };

  // --- 5. Automation ---
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;

    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          if (node.matches('.group-details-dialog')) fixDialog(node);
          node.querySelectorAll('.group-details-dialog').forEach(fixDialog);

          if (node.matches('.group-member-row') || node.querySelector('.group-member-row')) {
            shouldUpdate = true;
          }
        }
      });

      mutation.removedNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          if (node.matches('.group-member-row') || node.querySelector('.group-member-row')) {
            shouldUpdate = true;
          }
        }
      });
    });

    if (shouldUpdate) updateBossInfo();
  });

  const vuedals = document.querySelector('.vuedals');
  if (vuedals) {
    observer.observe(vuedals, { childList: true, subtree: true });
    console.log("[ToonHQ+ Demo] MutationObserver active on .vuedals");
  } else {
    console.log("[ToonHQ+ Demo] .vuedals not found");
  }

  // Initial check
  document.querySelectorAll('.group-details-dialog').forEach(fixDialog);

})();
