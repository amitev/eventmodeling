import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneSketchShapes, expandSketchSelection, groupSketchShapes, moveSketchShapes, readSketch, recordSketchHistory, selectSketchShapes, sketchGroupId, sketchHtml, travelSketchHistory, ungroupSketchShapes } from './sketch.js';

const shapes = [
  { id: 'em-sketch-1', type: 'rect', x: 20, y: 30, width: 100, height: 60, fill: '#ffffff', stroke: '#1f2937' },
  { id: 'em-sketch-2', type: 'line', x: 140, y: 30, width: 80, height: 60, reverse: false, stroke: '#1f2937' },
];

test('sketch groups persist in SVG and restore as one movable selection', () => {
  const groupId = sketchGroupId(shapes);
  const grouped = groupSketchShapes(shapes, ['em-sketch-1', 'em-sketch-2'], groupId);
  const html = sketchHtml(grouped);
  assert.match(html, /<g id="em-sketch-group-1" class="em-sketch-group">/);

  const restored = readSketch(html);
  assert.equal(restored.error, '');
  assert.deepEqual(restored.shapes.map(({ groupId: id }) => id), [groupId, groupId]);
  assert.deepEqual(expandSketchSelection(restored.shapes, ['em-sketch-1']), ['em-sketch-1', 'em-sketch-2']);

  const moved = moveSketchShapes(restored.shapes, ['em-sketch-1'], 10, 15);
  assert.deepEqual(moved.map(({ x, y }) => [x, y]), [[30, 45], [150, 45]]);
  assert.equal(sketchHtml(readSketch(sketchHtml(moved)).shapes), sketchHtml(moved));
});

test('ungrouping selected members removes the persisted group wrapper', () => {
  const grouped = groupSketchShapes(shapes, ['em-sketch-1', 'em-sketch-2'], 'em-sketch-group-1');
  const ungrouped = ungroupSketchShapes(grouped, ['em-sketch-1']);
  assert.ok(ungrouped.every(({ groupId }) => !groupId));
  assert.doesNotMatch(sketchHtml(ungrouped), /em-sketch-group/);
});

test('marquee selection requires the full shape bounds inside the box', () => {
  assert.deepEqual(selectSketchShapes(shapes, { x: 20, y: 30, width: 100, height: 60 }), ['em-sketch-1']);
  assert.deepEqual(selectSketchShapes(shapes, { x: 140, y: 30, width: 80, height: 60 }), ['em-sketch-2']);
  assert.deepEqual(selectSketchShapes(shapes, { x: 25, y: 35, width: 90, height: 50 }), []);
});

test('sketch detection uses the SVG root id, including unsupported marked sketches', () => {
  const html = sketchHtml([]);
  assert.equal(readSketch(html).isSketch, true);
  assert.equal(readSketch(html.replace('viewBox="0 0 1024 768"', 'viewBox="0 0 100 100"')).isSketch, true);
  assert.equal(readSketch(html.replace('<svg id=', '<p>Content</p><svg id=')).isSketch, true);
  assert.equal(readSketch('<!doctype html><html><body><svg></svg></body></html>').isSketch, false);
});

test('cloned selections move within canvas bounds without changing originals and undo in one step', () => {
  const cloned = cloneSketchShapes(shapes, shapes.map(({ id }) => id));
  assert.equal(new Set(cloned.shapes.map(({ id }) => id)).size, 4);
  assert.deepEqual(cloned.selectedIds, cloned.shapes.slice(2).map(({ id }) => id));
  const moved = moveSketchShapes(cloned.shapes, cloned.selectedIds, 1000, -1000);
  assert.deepEqual(moved.slice(0, 2), shapes);
  assert.deepEqual(moved.slice(2).map(({ x, y }) => [x, y]), [[824, 0], [944, 0]]);
  const original = sketchHtml(shapes);
  const copied = sketchHtml(moved);
  const history = recordSketchHistory({ past: [], present: original, future: [], group: null }, copied);
  assert.equal(travelSketchHistory(history).present, original);
  assert.equal(travelSketchHistory(travelSketchHistory(history), true).present, copied);
  assert.equal(sketchHtml(readSketch(copied).shapes), copied);
});

test('cloning group members copies whole groups with distinct group ids', () => {
  const first = groupSketchShapes(shapes, shapes.map(({ id }) => id), 'em-sketch-group-1');
  const second = shapes.map((shape, index) => ({ ...shape, id: `em-sketch-${index + 5}`, groupId: 'em-sketch-group-3' }));
  const original = [...first, ...second];
  const cloned = cloneSketchShapes(original, [first[0].id, second[1].id]);
  const copies = cloned.shapes.slice(original.length);
  assert.equal(copies.length, 4);
  assert.equal(new Set(cloned.shapes.map(({ id }) => id)).size, 8);
  assert.deepEqual(copies.map(({ groupId }) => groupId), [
    'em-sketch-group-4', 'em-sketch-group-4', 'em-sketch-group-5', 'em-sketch-group-5',
  ]);
  assert.deepEqual(expandSketchSelection(cloned.shapes, [copies[0].id]), copies.slice(0, 2).map(({ id }) => id));
  const restored = readSketch(sketchHtml(cloned.shapes));
  assert.equal(restored.error, '');
  assert.deepEqual(restored.shapes.map(({ groupId }) => groupId), cloned.shapes.map(({ groupId }) => groupId));
});

test('clones preserve table and text properties without sharing table column arrays', () => {
  const original = [
    { id: 'em-sketch-2', type: 'table', x: 10, y: 20, width: 360, height: 180, columns: [0.25, 0.25, 0.5] },
    { id: 'em-sketch-7', type: 'text', x: 40, y: 50, width: 80, height: 28.8, fontSize: 24, fill: '#42a5f5', text: 'Name' },
  ];
  const cloned = cloneSketchShapes(original, original.map(({ id }) => id));
  const copies = cloned.shapes.slice(2);
  assert.deepEqual(copies, original.map((shape, index) => ({ ...shape, id: cloned.selectedIds[index] })));
  assert.notEqual(copies[0].columns, original[0].columns);
  assert.equal(sketchHtml(readSketch(sketchHtml(cloned.shapes)).shapes), sketchHtml(cloned.shapes));
});
