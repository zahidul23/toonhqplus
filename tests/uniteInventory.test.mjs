import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('../entrypoints/sidebar.content/components/UniteInventory.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const sandbox = { exports: {}, require: createRequire(import.meta.url) };
vm.runInNewContext(compiled, sandbox);
const { UniteInventory } = sandbox.exports;
const render = unites => renderToStaticMarkup(React.createElement(UniteInventory, {
  unites, getImageUrl: path => `/${path}`,
}));

test('Promotions shows and totals only the five supported Cogbucks Unites', () => {
  const html = render({
    Promotions: {
      '900 Cogbucks': 5,
      '100\u0003 Cogbucks': 1,
      '200 Cogbucks': 0,
      '350 Cogbucks': 3,
      '600 Cogbucks': 4,
      '50 Merits': 99,
      '200 Jury Notices': 99,
      '400 Stock Options': 99,
      '999 Cogbucks': 99,
    },
  });
  assert.match(html, /aria-label="13 Promotions Unites total"/);
  assert.match(html, /src="\/images\/suits\/Cashbot.png"/);
  assert.doesNotMatch(html, /Merits|Jury Notices|Stock Options|999 Cogbucks/);
  const labels = [...html.matchAll(/title="(\d+) Cogbucks:/g)].map(match => Number(match[1]));
  assert.deepEqual(labels, [100, 200, 350, 600, 900]);
  assert.match(html, /title="200 Cogbucks: 0 \/ 100 held"/);
});

test('core sections stay visible while empty optional and unsupported categories stay hidden', () => {
  const html = render({
    'Toon-Up': { '20 Toon-Up': 0 },
    Jellybeans: {},
    Promotions: { '100 Cogbucks': 0, '50 Merits': 5 },
    Racing: { '50 tickets': 3 },
  });
  for (const category of ['Toon-Up', 'Gag-Up', 'Jellybeans']) {
    assert.ok(html.includes(`aria-label="${category} Unites"`));
  }
  assert.equal((html.match(/<section/g) || []).length, 3);
  assert.doesNotMatch(html, /aria-label="(?:Promotions|Cartoonival|Racing) Unites"/);
  assert.match(html, /title="100 Jellybeans: 0 \/ 100 held"/);
  assert.match(render({}), /title="20 Toon-Up: 0 \/ 100 held"/);
});

test('held rewards reveal their section while retaining nearby zero counts for comparison', () => {
  const html = render({
    'Gag-Up': { 'Gag-Up Sound': 2, 'Gag-Up Throw': 0 },
    Cartoonival: { '25 tokens': 0 },
  });
  assert.match(html, /aria-label="Gag-Up Unites"/);
  assert.match(html, /title="Gag-Up Throw: 0 \/ 100 held"/);
  assert.equal((html.match(/<section/g) || []).length, 3);
  assert.match(render({ 'Gag-Up': { 'Gag-Up Sound': 0 } }), /aria-label="Gag-Up Unites"/);
});

test('Jellybeans sits below Toon-Up and fifth-place Promotions spans the layout', () => {
  const promotions = { '100 Cogbucks': 1 };
  const fourSections = render({ Promotions: promotions });
  assert.equal((fourSections.match(/<section/g) || []).length, 4);
  assert.ok(fourSections.indexOf('aria-label="Toon-Up Unites"') < fourSections.indexOf('aria-label="Jellybeans Unites"'));
  assert.match(fourSections, /<div class="unite-column">[\s\S]*aria-label="Gag-Up Unites"[\s\S]*aria-label="Promotions Unites"/);
  assert.doesNotMatch(fourSections, /unite-section-full-width/);

  const fiveSections = render({ Promotions: promotions, Cartoonival: { '25 tokens': 1 } });
  assert.equal((fiveSections.match(/<section/g) || []).length, 5);
  assert.match(fiveSections, /class="unite-section unite-section-full-width" aria-label="Promotions Unites"/);
  assert.ok(fiveSections.indexOf('aria-label="Promotions Unites"') > fiveSections.indexOf('aria-label="Cartoonival Unites"'));
});
