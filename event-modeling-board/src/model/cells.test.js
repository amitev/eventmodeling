import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeDisplay } from './cells.js';

const node = (id, kind, x, y, parentId = 'chapter') => ({
  id, type: 'sticky', parentId, position: { x, y }, data: { kind },
});
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
const display = (nodes, edges) => createEdgeDisplay()(nodes, edges, new Set(), false);

test('off-axis Processor connections use icon sides and keep other endpoints vertical', () => {
  const nodes = [
    node('processor', 'processor', 200, 0),
    node('read', 'read_model', 0, 220),
    node('command', 'command', 400, 220),
  ];
  const shown = display(nodes, [edge('read', 'processor'), edge('processor', 'command')]);
  assert.deepEqual(shown.map(({ sourceHandle, targetHandle }) => [sourceHandle, targetHandle]), [
    ['top-out', 'left-in'], ['right-out', 'top-in'],
  ]);
});

test('aligned Processor connections keep top and bottom points in both directions', () => {
  const nodes = [
    node('processor', 'processor', 200, 220),
    node('read', 'read_model', 200, 0),
    node('command', 'command', 200, 440),
  ];
  const shown = display(nodes, [
    edge('read', 'processor'), edge('processor', 'command'),
    edge('command', 'processor'), edge('processor', 'read'),
  ]);
  assert.deepEqual(shown.map(({ sourceHandle, targetHandle }) => [sourceHandle, targetHandle]), [
    ['bottom-out', 'top-in'], ['bottom-out', 'top-in'],
    ['top-out', 'bottom-in'], ['top-out', 'bottom-in'],
  ]);
});

test('Processor routing uses measured centres and Chapter offsets, even for small differences', () => {
  const nodes = [
    { id: 'a', type: 'chapter', position: { x: 100, y: 0 }, data: {} },
    { id: 'b', type: 'chapter', position: { x: 300, y: 400 }, data: {} },
    node('processor', 'processor', 200, 0, 'a'),
    { ...node('command', 'command', 100, 0, 'b'), measured: { width: 200, height: 146 } },
  ];
  const connection = edge('processor', 'command');
  assert.equal(display(nodes, [connection])[0].sourceHandle, 'right-out');
  const aligned = nodes.map((n) => n.id === 'command' ? { ...n, position: { x: -20, y: 0 } } : n);
  assert.equal(display(aligned, [connection])[0].sourceHandle, 'bottom-out');
  const offset = aligned.map((n) => n.id === 'command' ? { ...n, position: { x: -20.01, y: 0 } } : n);
  assert.equal(display(offset, [connection])[0].sourceHandle, 'left-out');
});

test('display cache updates on horizontal routing changes and reuses unchanged routes', () => {
  const render = createEdgeDisplay();
  const nodes = [node('processor', 'processor', 200, 0), node('command', 'command', 400, 220)];
  const edges = [edge('processor', 'command')];
  const first = render(nodes, edges, new Set(), false);
  const moved = nodes.map((n) => n.id === 'command' ? { ...n, position: { x: 500, y: 220 } } : n);
  assert.equal(render(moved, edges, new Set(), false), first);
  const left = nodes.map((n) => n.id === 'command' ? { ...n, position: { x: 0, y: 220 } } : n);
  const changed = render(left, edges, new Set(), false);
  assert.notEqual(changed, first);
  assert.equal(changed[0].sourceHandle, 'left-out');
  const aligned = nodes.map((n) => n.id === 'command' ? { ...n, position: { x: 200, y: 220 } } : n);
  assert.equal(render(aligned, edges, new Set(), false)[0].sourceHandle, 'bottom-out');
});
