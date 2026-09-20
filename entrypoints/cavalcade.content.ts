import { startCavalcadeBanner } from './sidebar.content/cavalcadeBanner';

export default defineContentScript({
  matches: ['*://*.toonhq.org/*', '*://toonhq.org/*'],
  runAt: 'document_idle',
  main(ctx) {
    const stopCavalcadeBanner = startCavalcadeBanner();
    ctx.onInvalidated(stopCavalcadeBanner);
  },
});
