/**
 * ToonHQ+ Boss Info Standalone Demo
 * 
 * Instructions:
 * 1. Open ToonHQ.org
 * 2. Paste this entire script into the browser console.
 * 3. Open a group detail dialog for a CEO or CJ group.
 * 
 * This script demonstrates the enhanced boss info and rich emerald-themed tooltips.
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
      margin: 0 !important;
      font-size: 1.25rem !important;
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

  const getPinkSlips = (value) => {
    if (value >= 63) return 6;
    if (value >= 48) return 5;
    if (value >= 33) return 4;
    if (value >= 17) return 3;
    if (value >= 1) return 2;
    return 0;
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

  const getCogValueFromName = (name) => {
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

  const getCJDifficultyTier = (value) => CJ_DIFFICULTY_TIERS.find(t => value >= t.minlevel) || CJ_DIFFICULTY_TIERS[8];

  // --- 3. UI Update Logic ---
  const updateBossInfo = () => {
    const dialog = document.querySelector('.group-details-dialog');
    if (!dialog) return;

    const rows = dialog.querySelectorAll('.group-member-row');
    const bossTypes = { 'CEO': 'bossbot', 'CJ': 'lawbot', 'CFO': 'bossbot' };
    const thisBoss = dialog.querySelector('h4')?.textContent?.trim();
    const thisBossKey = thisBoss ? bossTypes[thisBoss] : null;
    const thisBossInfo = dialog.querySelector(".boss-info");

    if (!thisBossKey || !thisBossInfo) return;

    let suitValues = [];
    rows.forEach(row => {
      const suitImg = row.querySelector('.toon__track--suit img');
      if (suitImg && suitImg.title) {
        suitValues.push(getCogValueFromName(suitImg.title));
      }
    });

    if (suitValues.length === 0) return;
    const averageSuitValue = Math.round(suitValues.reduce((sum, val) => sum + val, 0) / suitValues.length);

    if (thisBossKey === 'lawbot') {
      const tier = getCJDifficultyTier(averageSuitValue);
      const suitString = getCogNameForLevel(averageSuitValue, thisBossKey);
      const text = `(${tier.lawyers} lawyers)`;

      if (!thisBossInfo.querySelector('.boss-info-tooltip')) {
        const tip = document.createElement('div');
        tip.className = 'boss-info-tooltip lawbot-tip';
        thisBossInfo.appendChild(tip);
      }
      const tooltipEl = thisBossInfo.querySelector('.boss-info-tooltip');

      const lawyerThresholds = [
        { v: 70, l: 10 },
        { v: 53, l: 9 },
        { v: 1, l: 8 }
      ];

      const lawyerRowsHtml = lawyerThresholds.map(t => `
        <div class="tooltip-tier-row ${tier.lawyers === t.l ? 'active' : ''}">
          <div class="tooltip-label">${getCogNameForLevel(t.v, thisBossKey)}+</div>
          <div class="tooltip-value">${t.l} Lawyers</div>
        </div>
      `).join('');

      const stats = [
        { label: 'Lawyers', value: tier.lawyers },
        { label: 'Gavels', value: tier.gavels },
        { label: 'Bonus Weight', value: tier.hasBonusWeight ? 'Yes' : 'No' },
        { label: 'Evidence Count', value: tier.evidence },
        { label: 'Evidence Heal', value: tier.laffHeal }
      ];

      const statsHtml = stats.map(s => `
        <div class="tooltip-tier-row">
          <div class="tooltip-label">${s.label}</div>
          <div class="tooltip-value">${s.value}</div>
        </div>
      `).join('');

      const html = `
        <div class="tooltip-boss-info">
          <div class="tooltip-header">Group Average</div>
          <div class="tooltip-sub-header">${suitString}</div>
          <div class="tooltip-divider"></div>
          <div class="tooltip-header emerald">Tier ${tier.tier}</div>
          ${statsHtml}
          <div class="tooltip-divider"></div>
          <div class="tooltip-header gray">Lawyer Thresholds</div>
          ${lawyerRowsHtml}
        </div>
      `;

      if (thisBossInfo.firstChild?.textContent !== text || tooltipEl.innerHTML !== html) {
        if (thisBossInfo.firstChild?.nodeType === Node.TEXT_NODE) {
          thisBossInfo.firstChild.textContent = text;
        } else {
          thisBossInfo.prepend(document.createTextNode(text));
        }
        tooltipEl.innerHTML = html;
      }
    } else {
      const currentPinkSlips = getPinkSlips(averageSuitValue);
      const suitString = getCogNameForLevel(averageSuitValue, thisBossKey);
      const text = `(${currentPinkSlips} Pink Slips)`;

      if (!thisBossInfo.querySelector('.boss-info-tooltip')) {
        const tip = document.createElement('div');
        tip.className = 'boss-info-tooltip';
        thisBossInfo.appendChild(tip);
      }
      const tooltipEl = thisBossInfo.querySelector('.boss-info-tooltip');

      const thresholds = [
        { v: 63, s: 6 },
        { v: 48, s: 5 },
        { v: 33, s: 4 },
        { v: 17, s: 3 },
        { v: 1, s: 2 }
      ];

      const rowsHtml = thresholds.map(t => `
        <div class="tooltip-tier-row ${currentPinkSlips === t.s ? 'active' : ''}">
          <div class="tooltip-label">${getCogNameForLevel(t.v, thisBossKey)}+</div>
          <div class="tooltip-value bossbot-info">${t.s} Slips</div>
        </div>
      `).join('');

      const html = `
        <div class="tooltip-boss-info">
          <div class="tooltip-header">Group Average</div>
          <div class="tooltip-sub-header">${suitString}</div>
          <div class="tooltip-divider"></div>
          <div class="tooltip-header gray">Pink Slip Thresholds</div>
          ${rowsHtml}
        </div>
      `;

      if (thisBossInfo.firstChild?.textContent !== text || tooltipEl.innerHTML !== html) {
        if (thisBossInfo.firstChild?.nodeType === Node.TEXT_NODE) {
          thisBossInfo.firstChild.textContent = text;
        } else {
          thisBossInfo.prepend(document.createTextNode(text));
        }
        tooltipEl.innerHTML = html;
      }
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
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          console.log(node);
          if (node.matches('.group-details-dialog')) fixDialog(node);
          node.querySelectorAll('.group-details-dialog').forEach(fixDialog);
        }
      });
    });
  });

  const vuedals = document.querySelector('.vuedals');
  if (vuedals) {
    observer.observe(vuedals, { childList: true, subtree: true });
    console.log("[ToonHQ+ Demo] MutationObserver active on .vuedals");
  } else {
    // Fallback to body if vuedals isn't present yet
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[ToonHQ+ Demo] .vuedals not found, watching document.body instead.");
  }

  // Initial check
  document.querySelectorAll('.group-details-dialog').forEach(fixDialog);

})();
