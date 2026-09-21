import test from 'node:test';
import assert from 'node:assert/strict';
import { moveToon, normalizeToonOrderSetting, orderTrackerToons, reconcileToonOrder } from '../entrypoints/sidebar.content/toonOrder.ts';

const toons = [
  { id: 'low', name: 'Zippy', laff: 50 },
  { id: 'alpha', name: 'Alice', laff: 100 },
  { id: 'beta', name: 'Bob', laff: 100 },
];

test('default toon order is descending laff, then ascending name', () => {
  assert.deepEqual(orderTrackerToons(toons, [], null).map(toon => toon.id), ['alpha', 'beta', 'low']);
});

test('active toons stay above offline toons while retaining default order', () => {
  assert.deepEqual(orderTrackerToons(toons, ['low'], null).map(toon => toon.id), ['low', 'alpha', 'beta']);
});

test('custom order is persisted within the active and offline partitions', () => {
  const custom = ['beta', 'low', 'alpha'];
  assert.deepEqual(orderTrackerToons(toons, ['low'], custom).map(toon => toon.id), ['low', 'beta', 'alpha']);
});

test('drag reorder moves the dragged toon before its target', () => {
  assert.deepEqual(moveToon(['alpha', 'beta', 'low'], 'low', 'alpha'), ['low', 'alpha', 'beta']);
  assert.deepEqual(moveToon(['alpha', 'beta', 'low'], 'alpha', 'low', true), ['beta', 'low', 'alpha']);
});

test('legacy arrays migrate to a normalized versioned setting', () => {
  assert.deepEqual(normalizeToonOrderSetting([1, '2', 1]), { version: 1, toonIds: ['1', '2'] });
});

test('reconciliation removes deleted IDs and appends newly synced IDs', () => {
  assert.deepEqual(
    reconcileToonOrder({ version: 1, toonIds: ['gone', 'beta', 'alpha'] }, ['alpha', 'beta', 'new']),
    { version: 1, toonIds: ['beta', 'alpha', 'new'] },
  );
});
