# Archived role badge preview

This document preserves the temporary preview used to review ToonHQ role badges in dark mode. The preview is no longer an active extension entrypoint and runs in neither development nor production builds.

The preview assigns the seven native badges to the first seven member rows in each group dialog. Each row receives the same badge in its desktop and mobile layouts. It only changes the displayed DOM; account and toon data are untouched. Morgan retains its native 2px font size.

The actual dark-mode badge colors remain in `entrypoints/lib/displayMode.css` and continue to apply to real ToonHQ badges.

## Restore temporarily for a visual review

1. Copy the TypeScript below into `entrypoints/tag-preview.content.ts`.
2. Add `VITE_TOONHQPLUS_TAG_PREVIEW=true` to the ignored `.env.local` file.
3. Start or restart `npm run dev` or `npm run dev:network`, refresh ToonHQ, and open a group dialog. A group needs at least seven toon rows to display every badge.
4. When finished, delete the temporary entrypoint and remove the environment flag. The runtime guard also prevents fake badges in production, but removing the entrypoint avoids emitting its inactive wrapper.

## Preserved source

Native label definitions were copied from the saved September 16, 2026 ToonHQ JavaScript bundle.

```ts
// Temporary dev-only preview, enabled by VITE_TOONHQPLUS_TAG_PREVIEW=true.
// Match the labels in native-toonhq/toonhq-groups-app-2026-09-16.a5a51d0c.js.
const labels = [
  { id: 'admin', name: 'ToonHQ Admin', description: 'Creator of ToonHQ.org', color: '#d84444' },
  { id: 'mod', name: 'ToonHQ Mod', description: 'Moderators help keep ToonHQ.org safe, be sure to thank them!', color: '#4c7dc5' },
  { id: 'ttrd_mod', name: 'TTRD Mod', description: 'Moderator of the TTR Community Discord (our partner Discord)', color: '#889ee0' },
  { id: 'ttr_staff', name: 'TTR Team', description: 'Member of the Toontown Rewritten Team', color: '#1a5493' },
  { id: 'ttr_partner', name: 'TTR Partner', description: "Member of Toontown Rewritten's Partner Program", color: '#29783e' },
  { id: 'cc_staff', name: 'CC Staff', description: 'Member of the Corporate Clash Crew', color: '#4992db' },
  { id: 'morgan', name: 'Morgan', description: "She's Morgan™!", color: '#4c7dc5' },
];

const previewAttribute = 'data-toonhq-plus-preview-label';
const previewSelector = `[${previewAttribute}]`;

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  runAt: 'document_end',

  main(ctx) {
    if (!import.meta.env.DEV || import.meta.env.VITE_TOONHQPLUS_TAG_PREVIEW !== 'true') return;

    // Hide existing badges only where a preview replaces them. Keep account and
    // toon data untouched, and restore the original badges when the script stops.
    const style = document.createElement('style');
    style.textContent = `
      .group-details-dialog .toon__name:has(> ${previewSelector}) > .toon__label:not(${previewSelector}) {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const refresh = () => {
      document.querySelectorAll('.group-details-dialog').forEach((dialog) => {
        // Each row contains desktop and mobile versions of the same toon.
        // Assign by member row so hidden responsive copies don't consume labels.
        dialog.querySelectorAll('.group-member-row').forEach((row, index) => {
          const label = labels[index];
          row.querySelectorAll('.toon__name').forEach((name) => {
            let badge = name.querySelector<HTMLElement>(`:scope > ${previewSelector}`);
            if (!label) {
              badge?.remove();
              return;
            }
            if (badge?.getAttribute(previewAttribute) === label.id) return;

            badge?.remove();
            badge = document.createElement('span');
            badge.className = 'badge badge-secondary toon__label';
            badge.setAttribute(previewAttribute, label.id);
            badge.textContent = label.name;
            badge.title = label.description;
            badge.style.background = label.color;
            badge.style.color = 'white';
            // This unusually small font is part of ToonHQ's native Morgan badge.
            if (label.id === 'morgan') badge.style.fontSize = '2px';
            name.appendChild(badge);
          });
        });
      });
    };

    let frame: number | undefined;
    const observer = new MutationObserver(() => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        observer.disconnect();
        refresh();
        observer.observe(document.body, { childList: true, subtree: true });
      });
    });
    refresh();
    observer.observe(document.body, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      document.querySelectorAll(previewSelector).forEach((badge) => badge.remove());
      style.remove();
    });
  },
});
```
