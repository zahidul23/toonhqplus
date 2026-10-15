// Targeted local-dev rules based on the startup network capture. These are
// generated only by `wxt serve`, never included in production builds.
export const DEV_ADBLOCK_RULESET = 'dev_adblock';
export const DEV_ADBLOCK_PATH = 'dev-adblock.json';
export const DEV_ADBLOCK_RULES = [{
  id: 1,
  priority: 1,
  action: { type: 'block' },
  condition: {
    initiatorDomains: ['toonhq.org'],
    excludedResourceTypes: ['main_frame'],
    requestDomains: [
      'intergient.com',
      'playwire.com',
      'krushmedia.com',
      'drift-pixel.ai',
      'cootlogix.com',
      'nextmillmedia.com',
      'rubiconproject.com',
      'onetag-sys.com',
      'openwebmp.com',
      'googlesyndication.com',
      'doubleclick.net',
      'googleadservices.com',
      'googletagservices.com',
      'admatic.de',
      'presage.io',
      'doubleverify.com',
      'kueezrtb.com',
      'adsrvr.org',
      'seedtag.com',
      'adkernel.com',
      'omnitagjs.com',
      'a-mo.net',
      '3lift.com',
      'yellowblue.io',
      'everesttech.net',
      'unrulymedia.com',
      'pubmatic.com',
      'adngin.com',
    ],
  },
}];
