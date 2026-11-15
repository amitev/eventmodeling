import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from './app.js';
import { ModelStore } from './model-store.js';
import { parseBoard, serialize } from '../event-modeling-board/src/state/io.js';

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-highlights-'));
  const server = createServer({ rootDir: root, publicDir: null });
  t.after(async () => {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = async (method, resource, body, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/model${resource}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'If-Match': '*' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${resource}: ${JSON.stringify(result)}`);
    return result;
  };
  const first = await request('POST', '/contexts', { name: 'Default' }, 201);
  const second = await request('POST', '/contexts', { name: 'Other' }, 201);
  const chapters = [];
  for (const context of [first, second]) {
    chapters.push(await request('POST', '/chapters', { context: context.id, name: context.name }, 201));
  }
  const position = (chapter) => ({ slice: chapter.slices[0].id, lane: chapter.lanes.find((lane) => lane.type === 'ACTOR').id });
  const original = await request('POST', '/elements', {
    ...position(chapters[0]), type: 'SCREEN', name: 'Form',
    html: '<main><input id="entry"><button>Next</button></main>',
    highlights: [{ path: 'body/main[1]/input[1]', color: 'red' }],
  }, 201);
  const copy = await request('POST', '/elements', { ...position(chapters[1]), copyOf: original.id }, 201);
  return { root, request, first, second, original, copy };
}

test('copies own highlights through API, board round trips and restart; invalid edits are atomic', async (t) => {
  const { root, request, second, original, copy } = await setup(t);
  assert.equal('highlights' in copy, false);
  const resource = `/contexts/${second.id}/screens/${copy.id}`;
  assert.equal('highlights' in await request('GET', resource), false);
  const highlights = [{ path: 'body/main[1]/button[1]', color: 'blue' }];
  await request('PATCH', `/elements/${copy.id}`, { highlights });
  const shown = await request('GET', resource);
  assert.deepEqual(shown.highlights, highlights);
  assert.equal(shown.html, original.html);
  assert.deepEqual(await request('GET', `/elements/${original.id}`), original);
  const exported = await request('GET', '');
  const invalid = structuredClone(exported);
  invalid.chapters.flatMap((chapter) => chapter.slices).flatMap((slice) => slice.elements)
    .find((element) => element.id === copy.id).highlights = [{ path: 'body/main[1]/missing[1]', color: 'blue' }];
  assert.throws(() => parseBoard(JSON.stringify(invalid)), /highlight target is missing/);
  const board = parseBoard(JSON.stringify(exported));
  const serialized = serialize(board.nodes, board.edges, board.contexts);
  assert.deepEqual(serialized, exported);
  for (const context of serialized.contexts) {
    await request('PUT', `/contexts/${context.id}`, {
      ...context, chapters: serialized.chapters.filter((chapter) => chapter.context === context.id),
    });
  }
  assert.deepEqual((await new ModelStore(root).getScreen(second.id, copy.id)).highlights, highlights);
  for (const invalid of ['body/main[1]/missing[1]', 'not-a-path']) {
    await request('PATCH', `/elements/${copy.id}`, { highlights: [{ path: invalid, color: 'blue' }] }, 400);
    assert.deepEqual((await request('GET', resource)).highlights, highlights);
  }
  await request('PATCH', `/elements/${copy.id}`, { highlights: [...highlights, ...highlights] }, 400);
  for (const color of ['none', 'invalid']) {
    await request('PATCH', `/elements/${copy.id}`, { highlights: [{ path: highlights[0].path, color }] }, 400);
    assert.deepEqual((await request('GET', resource)).highlights, highlights);
  }
  await request('PATCH', `/elements/${copy.id}`, { html: '<p>Forbidden</p>' }, 409);
  await request('PATCH', `/elements/${copy.id}`, { info: 'Forbidden' }, 409);
  assert.deepEqual(await request('GET', `/elements/${original.id}`), original);
  await request('PATCH', `/elements/${copy.id}`, { highlights: [] });
  assert.equal('highlights' in await request('GET', resource), false);
});

test('structural edits clear original and cross-Context copy highlights, preserving explicit new selections', async (t) => {
  const { request, first, original, copy } = await setup(t);
  const copyPath = `/elements/${copy.id}`;
  const sourcePath = `/elements/${original.id}`;
  await request('PATCH', copyPath, { highlights: [{ path: 'body/main[1]/button[1]', color: 'green' }] });
  await request('PATCH', sourcePath, { html: original.html.replace('Next', 'Continue') });
  assert.deepEqual((await request('GET', copyPath)).highlights, [{ path: 'body/main[1]/button[1]', color: 'green' }]);
  assert.deepEqual((await request('GET', sourcePath)).highlights, original.highlights);
  const highlights = [{ path: 'body/section[1]/input[1]', color: 'purple' }];
  const changed = await request('PATCH', sourcePath, { html: '<section><input></section>', highlights });
  assert.deepEqual(new Set(changed.clearedHighlights), new Set([original.id, copy.id]));
  assert.deepEqual(changed.highlights, highlights);
  assert.equal('highlights' in await request('GET', copyPath), false);
  await request('PATCH', copyPath, { highlights });
  const saved = await request('PUT', `/contexts/${first.id}/screens/${original.id}/html`, { html: '<article><input></article>' });
  assert.deepEqual(new Set(saved.clearedHighlights), new Set([original.id, copy.id]));
  for (const resource of [sourcePath, copyPath]) assert.equal('highlights' in await request('GET', resource), false);
  await request('PATCH', sourcePath, { highlights: [{ path: 'body/article[1]/input[1]', color: 'pink' }] });
  await request('PATCH', copyPath, { highlights: [{ path: 'body/article[1]/input[1]', color: 'yellow' }] });
  const url = await request('PATCH', sourcePath, { url: 'https://example.com' });
  assert.deepEqual(new Set(url.clearedHighlights), new Set([original.id, copy.id]));
  await request('PATCH', copyPath, { highlights: [{ path: 'body/article[1]/input[1]', color: 'blue' }] }, 400);
});
