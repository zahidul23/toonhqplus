# Dark mode review

Reviewed commit `169f05f` against the live ToonHQ site in the Codex in-app browser.

## Theme maintenance

Edit `entrypoints/lib/displayMode.css`. The first section contains shared colors
and per-page surface/accent overrides. `displayModeStyles.ts` imports that file
as text using Vite's `?inline` import; the existing content script injects it once.
Every selector is gated by `data-toonhq-plus-display-mode="dark"`. No DOM rewriting,
new permissions, or changes to site interactions are needed for these adjustments.

Navigation link colors are defined by destination so they follow links moved into
the More menu. Active links retain their section color and gain an underline.

## Findings addressed in CSS

- Group and Field Office titles used dark green/purple text on dark cards.
- Group filters use `.vue-dropdown__content`, not the Bootstrap dropdown class.
- Vue Multiselect controls stayed white in group creation, filtering and toon selection.
- Muted settings/help text, notification empty states and inline links were too dark.
- Page surfaces were uniformly green even in blue, purple and orange sections.
- Background patterns and secondary navigation remained excessively bright.
- Radio options had weak text contrast and an understated selected state.
- Toon editor silhouettes, informational alerts and color-picker panels needed coverage.
- Doodle score badges and blue/green trait text needed better dark-theme contrast.
- Added keyboard focus indicators and retained favorite/blocked row distinctions.

## Live review coverage

| Area | Pages and states inspected |
| --- | --- |
| Home | Hero, introduction, page navigation |
| TTR Groups | Live cards, filter panel, expanded group-type selector, create group, group details, chat, report form (not submitted) |
| TTR Invasions | Active, past, statistics, blocked-notifications state, invasion-request help dialog |
| Field Offices | Active office cards and status text |
| Fishing | Species tables, rod tables, rarity legend |
| Gardening | Flowers by beans and by species, tutorial, statues, organic gag tables |
| Doodles | Cards, trait/score colors, expanded appearance filters |
| CCG | Schedule, run cards, explanatory content |
| Account | Settings, ToonSync introduction, rearrange/hide page, email/password/code dialogs (no submissions) |
| Toon editor | Corporate Clash create-toon prerequisite, advanced species/suit/gag controls |
| Informational | FAQ, Apps, Changelog, Contact, Privacy |
| Corporate Clash | Active invasions, groups empty state and filters, fishing/CCG/doodle placeholder pages |

No groups were created or joined, no reports or messages were sent, and account
data was not changed. The gardening view switch was used without marking flowers.

## Coverage limits

“All possible modals” cannot be exhaustively exercised against a live account:
group-owner actions require owning a group, notification settings are blocked by
browser permission state, and no Corporate Clash groups were available. Sign-in,
registration, deletion confirmations, external OAuth flows and server-error states
were not exercised. The linked cozy-community destination is external to ToonHQ's
tools and was not included. Corporate Clash past invasions were observed loading;
their populated results and statistics remain unverified.

## Separate code-review finding

The commit stores the popup's display-mode preference in the extension origin's
IndexedDB, while the website content script reads the ToonHQ origin's IndexedDB.
The background forwards `DISPLAY_MODE_CHANGED` without persisting it in the page
database. A popup change can therefore apply immediately and revert on navigation.
The sidebar's change handler only dispatches a page-local database event, so other
open tabs do not immediately follow a sidebar selection either. A follow-up should
make extension storage the shared preference source and subscribe to its changes.
This behavioral issue is separate from this CSS-focused visual adjustment.

## Validation

- `npm run compile` passes.
- `npm run build` passes (existing WXT runner deprecation and site-logo URL warnings).
- `git diff --check` passes.
- The first rebuilt theme was visually verified live on Groups and Settings,
  including improved titles, custom selects and the password dialog.
- Final colored navigation and the subsequent filter/editor refinements require
  reloading the installed extension before their live visual verification.
