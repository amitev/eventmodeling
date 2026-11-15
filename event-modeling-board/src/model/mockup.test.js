import assert from 'node:assert/strict';
import test from 'node:test';
import { fitMockup } from './mockup.js';

test('a centered form fills the preview height without clipping or stretching', () => {
  const bounds = { x: 332, y: 134, width: 360, height: 500 };
  const fit = fitMockup(bounds, 768, 576);
  const left = fit.x + bounds.x * fit.scale;
  const top = fit.y + bounds.y * fit.scale;
  const right = left + bounds.width * fit.scale;
  const bottom = top + bounds.height * fit.scale;
  assert.ok(fit.scale > 768 / 1024);
  assert.ok(left >= 0 && top >= 0 && right <= 768 && bottom <= 576);
  assert.ok(Math.abs((bottom - top) / (right - left) - 500 / 360) < 1e-10);
  assert.ok(Math.abs(top - 8 * fit.scale) < 1e-10);
  assert.ok(Math.abs(left - (768 - right)) < 1e-10);
});

test('wide content fits width and remains centered vertically', () => {
  const bounds = { x: 40, y: 200, width: 900, height: 100 };
  const fit = fitMockup(bounds, 158, 118);
  const left = fit.x + bounds.x * fit.scale;
  const top = fit.y + bounds.y * fit.scale;
  assert.ok(Math.abs(left - 8 * fit.scale) < 1e-10);
  assert.ok(Math.abs(top - (118 - top - bounds.height * fit.scale)) < 1e-10);
});

test('empty HTML and URL previews retain full-page positioning', () => {
  assert.deepEqual(fitMockup(null, 158, 118), { x: 0, y: 0, scale: 158 / 1024 });
});
