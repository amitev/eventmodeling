import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactHtml } from '../../../server/html-compact.js';
import { extractHighlights, highlightHtml, highlightProblem, htmlStructure, inspectHtml, toggleHighlight } from '../../../server/html-highlights.js';

test('independent highlights survive compaction without changing shared HTML', () => {
  const source = '<!doctype html><html><head></head><body><label>Title<input class="field" placeholder="Course"></label><button>Next</button></body></html>';
  let highlights = [];
  for (const tag of ['input', 'button']) {
    const element = inspectHtml(source).elements.find((item) => item.tag === tag);
    highlights = toggleHighlight(source, element.start, highlights, tag === 'input' ? 'red' : 'blue');
  }
  const html = compactHtml(source);
  let model = inspectHtml(html, highlights);
  assert.deepEqual(model.selected.map((element) => element.tag), ['input', 'button']);
  assert.ok(model.selected[0].classes.includes('field'));
  assert.doesNotMatch(html, /em-screen-highlight/);
  const rendered = highlightHtml(html, highlights);
  assert.ok(rendered.includes('outline: 2px solid rgb(239, 83, 80)'));
  assert.ok(rendered.includes('outline: 2px solid rgb(66, 165, 245)'));
  assert.deepEqual(extractHighlights(rendered).highlights, highlights);
  assert.doesNotMatch(rendered, /\b(?:filter|opacity)\s*:/);
  assert.equal(highlightHtml(html, []), html);
  for (const tag of ['input', 'button']) {
    model = inspectHtml(html, highlights);
    const element = model.elements.find((element) => element.tag === tag);
    highlights = toggleHighlight(html, element.start, highlights, element.color, model);
  }
  assert.deepEqual(highlights, []);
  assert.equal(highlightHtml(html, highlights), html);
});

test('source mapping ignores tag-like raw text and marks only the preview', () => {
  const html = '<script>const text = "<input>";</script><style>.x::after{content:"<input>"}</style><main><input><input></main>';
  let model = inspectHtml(html);
  assert.equal(model.elements.filter((element) => element.tag === 'input').length, 2);
  let highlights = toggleHighlight(html, html.lastIndexOf('<input>'));
  model = inspectHtml(html, highlights);
  assert.match(html.slice(model.selected[0].start, model.selected[0].end), /^<input[^>]*>$/);
  const preview = highlightHtml(html, highlights, true, model);
  assert.ok(preview.includes('const text = "<input>";'));
  assert.ok(preview.includes('.x::after{content:"<input>"}'));
  assert.ok(preview.includes(`data-em-screen-source="${model.selected[0].start}"`));
  assert.ok(!html.includes('data-em-screen-source'));
  highlights = toggleHighlight(html, model.elements.find((element) => element.tag === 'main').start, highlights, 'green', model);
  model = inspectHtml(html, highlights);
  assert.equal(model.selected.length, 2);
  assert.deepEqual(model.selected.map((element) => element.color), ['green', 'red']);
});

test('render-only markers preserve user classes and legacy selections stay separate', () => {
  const source = '<input class="field &quot;wide&quot;"><p>Help</p>';
  const highlights = toggleHighlight(source, inspectHtml(source).elements.find((element) => element.tag === 'input').start);
  const rendered = highlightHtml(source, highlights, true);
  const selected = inspectHtml(rendered).elements.find((element) => element.tag === 'input');
  assert.deepEqual(selected.classes, ['field', '"wide"', 'em-screen-highlight-red']);
  const legacy = extractHighlights(highlightHtml(source, highlights));
  assert.deepEqual(legacy.highlights, highlights);
  assert.doesNotMatch(legacy.html, /em-screen-highlight/);
  assert.deepEqual(inspectHtml(legacy.html).elements.find((element) => element.tag === 'input').classes, ['field', '"wide"']);
  assert.doesNotMatch(highlightHtml(highlightHtml(source, highlights), []), /em-screen-highlight/);
  assert.throws(() => toggleHighlight(source, -1), /preview no longer matches/);
});

test('recoloring preserves other selections; same color and none remove highlights', () => {
  const source = '<input><button>Next</button>';
  const [input, button] = inspectHtml(source).elements.filter((element) => element.path);
  const red = toggleHighlight(source, input.start);
  const both = toggleHighlight(source, button.start, red, 'green');
  const recolored = toggleHighlight(source, input.start, both, 'blue');
  assert.deepEqual(recolored, [{ path: input.path, color: 'blue' }, { path: button.path, color: 'green' }]);
  assert.deepEqual(toggleHighlight(source, input.start, recolored, 'blue'), [both[1]]);
  assert.deepEqual(toggleHighlight(source, input.start, recolored, 'none'), [both[1]]);
  assert.deepEqual(toggleHighlight(source, input.start, [], 'none'), []);
  assert.equal(highlightProblem(recolored), null);
  assert.match(highlightProblem([...red, recolored[0]]), /duplicate/);
  for (const color of ['none', 'invalid', 'red; color: transparent']) {
    assert.ok(highlightProblem([{ path: input.path, color }]));
  }
  assert.throws(() => toggleHighlight(source, input.start, red, 'invalid'), /Choose a lane color/);
});

test('structure ignores formatting and text edits but detects changed element identities', () => {
  const source = '<main><table><tr><td id="item">One</td></tr></table><input></main>';
  const compact = compactHtml(source);
  assert.equal(htmlStructure(source), htmlStructure(compact));
  assert.equal(htmlStructure(source), htmlStructure(source.replace('One', 'Two')));
  assert.notEqual(htmlStructure(source), htmlStructure(source.replace('id="item"', 'id="other"')));
  assert.notEqual(htmlStructure(source), htmlStructure(source.replace('<input>', '<button>Next</button>')));
  const target = inspectHtml(source).elements.find((element) => element.tag === 'td');
  assert.equal(inspectHtml(compact).elements.find((element) => element.tag === 'td').path, target.path);
});
