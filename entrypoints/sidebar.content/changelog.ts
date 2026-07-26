export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '1.2.17',
    date: 'July 26, 2026',
    changes: [
      'Fix damage calculations for bonuses in cogs, facilities and boilers.'
    ]
  },
  {
    version: '1.2.16',
    date: 'July 20, 2026',
    changes: [
      'Update Gag Calculator UI',
      'Fix auto refresh of ToonHQ tabs',
    ]
  },
  {
    version: '1.2.15',
    date: 'July 19, 2026',
    changes: [
      'Add Gag Calculator to Shticker Book',
    ]
  },
  {
    version: '1.2.14',
    date: 'July 18, 2026',
    changes: [
      'Fix non-synced toons not saving to group history.',
      'Setting to swap sidebar and shticker book positions.',
      'Add auto reload of inactive ToonHQ tabs',
      'Add laff update broadcasting and improve toon display in sidebar',
      'Update Boiler Calculator meltdown styling',
      'Fix Tracker Tab for new installs',
      'Add the Gag Calculator to the Shticker Book'
    ]
  },
  {
    version: '1.2.13',
    date: 'July 4, 2026',
    changes: [
      'Bug fixes for synced toon lists and notes',
      'Update padding for headers in History and Toon tabs in sidebar'
    ]
  },
  {
    version: '1.2.12',
    date: 'July 4, 2026',
    changes: [
      'Fix display sizes of Toon sections in Sidebar',
    ]
  },
  {
    version: '1.2.11',
    date: 'July 4, 2026',
    changes: [
      'Fix Cog Calculator for Mint bonus damages and update gag titles',
      'Allow data imports to merge with existing data',
      'Sync lists and notes between browser profiles'
    ]
  },
  {
    version: '1.2.10',
    date: 'June 29, 2026',
    changes: [
      'Add ability to import and export saved extension data',
      'Consolidate delete data buttons to a single modal'
    ]
  },
  {
    version: '1.2.9',
    date: 'June 28, 2026',
    changes: [
      'Update CEO and CJ Tiers tooltips',
      'Fix bug in Cog Calculator for DA Offices'
    ]
  },
  {
    version: '1.2.8',
    date: 'June 28, 2026',
    changes: [
      'Improved CEO Tier tooltips',
      'Update DA Office and Cog Colf Course Calculators to reflect changes for ttr-live-v4.4.0'
    ]
  },
  {
    version: '1.2.7',
    date: 'June 27, 2026',
    changes: [
      'Update CEO Pink Slip counts to match the updated rewards for ttr-live-v4.4.0'
    ]
  },
  {
    version: '1.2.6',
    date: 'June 9, 2026',
    changes: [
      'View all synced toon details in Toon Tracker - Toons subtab'
    ]
  },
  {
    version: '1.2.5',
    date: 'June 1, 2026',
    changes: [
      'Firefox compatibility fixes'
    ]
  },
  {
    version: '1.2.4',
    date: 'May 31, 2026',
    changes: [
      'Display Toony and Stinky toon counts on group cards with optional highlighting'
    ]
  },
  {
    version: '1.2.3',
    date: 'May 22, 2026',
    changes: [
      'Allow setting Toon Tracker settings from the extension popup',
      'Allow Toon Tracker to connect as long as browser is open',
      'Update colors on Toon Tracker rewards',
      'Show recent rewards stats for past day, 7 days and 30 days'
    ]
  },
  {
    version: '1.2.2',
    date: 'Apr 24, 2026',
    changes: [
      '[New Feature] Recent Rewards Analytics in Toon Tracker',
      '[Bug Fix] Fix Remote logic in Cog Calculator',
    ]
  },
  {
    version: '1.2.1',
    date: 'Apr 17, 2026',
    changes: [
      '[UI] Add Sort Option to SOS grid in Toon Tracker tab',
      '[Bug Fix] Properly reset Cog Calculator cogs when clearing facility presets'
    ]
  },
  {
    version: '1.2.0',
    date: 'Apr 15, 2026',
    changes: [
      '[Major Update] Toon Tracker Implementation!',
      '[New Feature] Sync ToonHQ+ with your game and track your toons tasks, suits and rewards in real time',
      '[New Feature] Cog Battle Calculator',
      '[UI] Boss tier info in Shticker Book',
      '[UI] About section in Shticker Book'
    ]
  },
  {
    version: '1.1.8',
    date: 'Apr 4, 2026',
    changes: [
      '[UI] Feedback section in extension info'
    ]
  },
  {
    version: '1.1.7',
    date: 'Apr 3, 2026',
    changes: [
      '[UI] Detailed group names in the sidebar history tab'
    ]
  },
  {
    version: '1.1.6',
    date: 'Apr 3, 2026',
    changes: [
      '[New Feature] Show levels required to reach the next tier in current CEO/CJ group',
      '[Bug Fix] Fixed rounding error in Boss Tier calculations'
    ]
  },
  {
    version: '1.1.5',
    date: 'Mar 30, 2026',
    changes: [
      '[Performance] Paginated search results for toons',
      '[Performance] Reduced memory usage across the extension'
    ]
  },
  {
    version: '1.1.4',
    date: 'Mar 30, 2026',
    changes: [
      '[UI] Display merits counts for Field Offices'
    ]
  },
  {
    version: '1.1.3',
    date: 'Mar 29, 2026',
    changes: [
      '[New Feature] Allow notes for "Neutral Toons" (Toons not marked as Toony or Stinky)',
      '[UI] Collapsible Toon List sections to reduce clutter'
    ]
  },
  {
    version: '1.1.2',
    date: 'Mar 26, 2026',
    changes: [
      '[Performance] Performance improvements'
    ]
  },
  {
    version: '1.1.1',
    date: 'Mar 26, 2026',
    changes: [
      '[New Feature] Search bar to find recent toons'
    ]
  },
  {
    version: '1.1.0',
    date: 'Mar 26, 2026',
    changes: [
      '[Major Update] Initial Shticker Book implementation!',
      '[New Feature] Facilities Info in Shticker Book',
      '[New Feature] Field Offices Info in Shticker Book',
      '[New Feature] Boiler Calculator in Shticker Book'
    ]
  },
  {
    version: '1.0.9',
    date: 'Mar 23, 2026',
    changes: [
      '[UI] Facilities rewards in group details'
    ]
  },
  {
    version: '1.0.8',
    date: 'Mar 21, 2026',
    changes: [
      '[Performance] Minor performance improvements'
    ]
  },
  {
    version: '1.0.7',
    date: 'Mar 21, 2026',
    changes: [
      '[New Feature] Toon details tooltips when hovering over toons in the sidebar',
    ]
  },
  {
    version: '1.0.6',
    date: 'Mar 20, 2026',
    changes: [
      '[UI] Minor UI improvements'
    ]
  },
  {
    version: '1.0.5',
    date: 'Mar 12, 2026',
    changes: [
      '[UI] Minor bug fixes and UI improvements'
    ]
  },
  {
    version: '1.0.4',
    date: 'Mar 11, 2026',
    changes: [
      '[Privacy] Reduce permission scope for better privacy',
      '[UI] Minor bug fixes and UI improvements'
    ]
  },
  {
    version: '1.0.3',
    date: 'Mar 10, 2026',
    changes: [
      '[New Feature] Navigation bar customization'
    ]
  },
  {
    version: '1.0.2',
    date: 'Mar 10, 2026',
    changes: [
      '[UI] Minor bug fixes and UI improvements'
    ]
  },
  {
    version: '1.0.1',
    date: 'Mar 10, 2026',
    changes: [
      '[Performance] Minor performance improvements',
      '[UI] Minor UI improvements'
    ]
  },
  {
    version: '1.0.0',
    date: 'Mar 7, 2026',
    changes: [
      '[Major Update] Initial release of ToonHQ+ extension!',
      '[New Feature] CEO and CJ Tier Calculator',
      '[New Feature] Toony and Stinky lists for toons',
      '[New Feature] Notes for toons'
    ]
  }
];
