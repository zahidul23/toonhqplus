import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../entrypoints/sidebar.content/index.tsx', import.meta.url), 'utf8');
const navbarSource = source.slice(
  source.indexOf('const CONFIGURABLE_NAV_ITEMS:'),
  source.indexOf('const groupsState:'),
);
const compiled = ts.transpileModule(navbarSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

class Element {
  tagName = 'LI';
  children = [];
  attributes = new Map();
  classes = new Set();
  classList = {
    add: (...names) => names.forEach(name => this.classes.add(name)),
    remove: (...names) => names.forEach(name => this.classes.delete(name)),
  };
  style = { removeProperty() {} };
  constructor(href) { this.href = href; }
  querySelector(selector) { return selector === ':scope > a' ? this : null; }
  getAttribute(name) { return name === 'href' ? this.href : this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

test('customization releases the startup hiding rule immediately and reapplies after navbar replacement', () => {
  const hidingSource = readFileSync(new URL('../entrypoints/navfouc.content.ts', import.meta.url), 'utf8');
  const readyAttribute = hidingSource.match(/ul\.navbar-nav\.ml-auto:not\(\[([^\]]+)\]\)/)?.[1];
  assert.ok(readyAttribute, 'the startup hiding rule must have a readiness attribute');

  let navbar = null;
  const context = vm.createContext({
    HTMLElement: Element,
    document: { querySelector: () => navbar },
  });
  vm.runInContext(compiled, context);
  const config = { pinned: ['invasions'], dropdown: [] };
  assert.doesNotThrow(() => context.applyNavbarCustomization(config));

  for (let refresh = 0; refresh < 2; refresh++) {
    navbar = new Element();
    navbar.children = [new Element('/invasions/'), new Element('/fishing/')];
    assert.equal(navbar.attributes.has(readyAttribute), false);
    context.applyNavbarCustomization(config);
    assert.equal(navbar.children[0].classes.has('toonhq-plus-nav-pinned'), true);
    assert.equal(navbar.children[1].classes.has('toonhq-plus-nav-hidden'), true);
    assert.equal(navbar.attributes.has(readyAttribute), true,
      'navigation must be visible when customization returns, without waiting for a timer');

    context.applyNavbarCustomization({ pinned: ['fishing'], dropdown: [] });
    assert.equal(navbar.children[1].classes.has('toonhq-plus-nav-pinned'), true);
    assert.equal(navbar.attributes.has(readyAttribute), true);
  }
});
