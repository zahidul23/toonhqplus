import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function iconRenderer({ failConversion = false } = {}) {
  const source = readFileSync(new URL('../entrypoints/lib/rewardNotificationIcon.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const registeredFonts = [];
  let fetches = 0;
  let canvases = 0;
  const fontSet = {
    add(font) { registeredFonts.push(font); },
    // Reproduce a worker whose aggregate font readiness never settles.
    ready: new Promise(() => {}),
  };
  const context = new Proxy({ measureText: () => ({ width: 60 }) }, {
    get: (target, key) => key in target ? target[key] : () => {},
  });
  const sandbox = {
    exports: {},
    require: () => ({ cogs: [], gags: [] }),
    browser: { runtime: { getURL: path => `chrome-extension://test/${path}` } },
    self: { fonts: fontSet },
    FontFace: class {
      constructor(name) { this.name = name; }
      async load() { return this; }
    },
    fetch: async () => { fetches++; return { ok: true, blob: async () => new Blob(['image']), arrayBuffer: async () => new ArrayBuffer(0) }; },
    createImageBitmap: async () => ({ width: 128, height: 128 }),
    OffscreenCanvas: class {
      constructor() { canvases++; }
      getContext() { return context; }
      async convertToBlob() {
        if (failConversion) throw new Error('PNG conversion failed');
        return new Blob(['png'], { type: 'image/png' });
      }
    },
    console: { warn() {} },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
  };
  vm.runInNewContext(compiled, sandbox);
  return { render: sandbox.exports.createRewardNotificationIcon, registeredFonts, activity: () => ({ fetches, canvases }) };
}

for (const [category, amounts, suffix, slug] of [
  ['Toon-Up', [20, 35, 50, 65, 80], 'Toon-Up', 'toon-up'],
  ['Jellybeans', [100, 200, 350, 600], 'jellybeans', 'jellybeans'],
]) {
  test(`${category} standard amounts use packaged images without fetching fonts or creating canvases`, async () => {
    const { render, registeredFonts, activity } = iconRenderer({ failConversion: true });
    for (const amount of amounts) {
      const filename = `images/unites/${slug}-${amount}.webp`;
      const url = await render({ type: 'unites', subtype: `${amount} ${suffix}`, count: 2, metadata: { uniteCategory: category } });
      assert.equal(url, `chrome-extension://test/${filename}`);
      assert.ok(existsSync(new URL(`../public/${filename}`, import.meta.url)), `Missing ${filename}`);
    }
    assert.equal(registeredFonts.length, 0);
    assert.deepEqual(activity(), { fetches: 0, canvases: 0 });
  });
}

for (const [category, subtype] of [['Toon-Up', '99 Toon-Up'], ['Jellybeans', '999 jellybeans']]) {
  test(`${category} icon completes even when worker fonts.ready never resolves`, { timeout: 1000 }, async () => {
    const { render, registeredFonts } = iconRenderer();
    const url = await render({ type: 'unites', subtype, count: 1, metadata: { uniteCategory: category } });
    assert.match(url, /^data:image\/png;base64,/);
    assert.deepEqual(registeredFonts.map(font => font.name), ['MickeyNumbers', 'MickeyNumbersFill']);
  });
}

test('failed PNG rendering falls back to the packaged reward image', async () => {
  const { render } = iconRenderer({ failConversion: true });
  const url = await render({ type: 'unites', subtype: '99 Toon-Up', count: 1, metadata: { uniteCategory: 'Toon-Up' } });
  assert.equal(url, 'chrome-extension://test/images/unites/pixie-dust.webp');
});

test('category notification fallbacks use the converted assets', async () => {
  const { render } = iconRenderer({ failConversion: true });
  for (const type of ['sos', 'summons', 'pinkslips', 'remotes']) {
    const subtype = type === 'sos' ? 'Flippy' : type === 'remotes' ? 'Damage Remote' : 'Unknown';
    const filename = type === 'sos' ? 'sos-cards/flippy' : type;
    const url = await render({ type, subtype, count: 1 });
    assert.equal(url, `chrome-extension://test/images/${filename}.webp`);
    assert.ok(existsSync(new URL(`../public/images/${filename}.webp`, import.meta.url)));
  }
});
