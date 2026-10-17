import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('../entrypoints/sidebar.content/components/RemoteInventory.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const sandbox = { exports: {}, require: createRequire(import.meta.url) };
vm.runInNewContext(compiled, sandbox);
const render = remotes => renderToStaticMarkup(React.createElement(sandbox.exports.RemoteInventory, {
  remotes, getImageUrl: path => `/${path}`,
}));

test('missing Remote Control tiers remain visible as zero inventory', () => {
  const html = render({});
  assert.equal((html.match(/class="remote-slot"/g) || []).length, 6);
  assert.equal((html.match(/data-empty="true"/g) || []).length, 6);
  for (const type of ['Damage', 'Healing']) {
    assert.ok(html.includes(`<h4 class="remote-category-heading reward-heading">${type} Remotes</h4>`));
    for (const level of [1, 2, 3]) {
      assert.ok(html.includes(`aria-label="${level}-star ${type} Remotes: 0 of 100 held"`));
    }
  }
  assert.doesNotMatch(html, /-title\.webp/);
  assert.ok(existsSync(new URL('../public/fonts/MinnieFont.woff', import.meta.url)));
});

test('remote counts map to their type and star tier independently of API ordering', () => {
  const html = render({ 'Healing Remote': { '3': 6, '1': 5 }, 'Damage Remote': { '2': 37, '1': 56 } });
  assert.match(html, /aria-label="1-star Damage Remotes: 56 of 100 held"/);
  assert.match(html, /aria-label="2-star Damage Remotes: 37 of 100 held"/);
  assert.match(html, /aria-label="3-star Healing Remotes: 6 of 100 held"/);
  assert.match(html, /aria-label="2-star Healing Remotes: 0 of 100 held"/);
  assert.equal((html.match(/data-empty="true"/g) || []).length, 2);
  for (const [, asset] of html.matchAll(/src="\/(images\/remotes\/[^"]+)"/g)) {
    assert.ok(existsSync(new URL(`../public/${asset}`, import.meta.url)), `Missing asset: ${asset}`);
  }
});
