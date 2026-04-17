export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
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
