import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandSketchSelection, groupSketchShapes, moveSketchShapes, readSketch, selectSketchShapes, sketchGroupId, sketchHtml, ungroupSketchShapes } from './sketch.js';

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
