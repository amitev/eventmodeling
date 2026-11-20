import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { load as loadYaml } from 'js-yaml';
import { createServer } from './app.js';
import { ModelStore } from './model-store.js';
import { parseBoard, serialize } from '../../event-modeling-board/src/state/io.js';

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-tasks-'));
  const server = createServer({ rootDir: root, publicDir: null });
  t.after(async () => {
    if (server.listening) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/model`;
  const request = async (method, resource, body, status = 200, revision) => {
    const response = await fetch(url + resource, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(revision === undefined ? {} : { 'If-Match': revision }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${resource}: ${JSON.stringify(data)}`);
    return data;
  };
  const context = (name) => request('POST', '/contexts', { name }, 201);
  const chapter = (context, name) => request('POST', '/chapters', { context, name }, 201);
  return { root, request, context, chapter };
}

test('Chapter discovery omits board structure and supports Context filtering', async (t) => {
  const { request, context, chapter } = await setup(t);
  const first = await context('First');
  const second = await context('Second');
  const ch = await chapter(first.id, 'Signup');
  const shallow = await request('GET', '/outline?detail=chapters');
  assert.deepEqual(shallow, [
    { id: first.id, name: first.name, chapters: [{ id: ch.id, name: ch.name, x: ch.x, y: ch.y }] },
    { id: second.id, name: second.name, chapters: [] },
  ]);
  assert.deepEqual(await request('GET', `/outline?detail=chapters&context=${second.id}`), shallow.slice(1));
  assert.ok((await request('GET', '/outline'))[0].chapters[0].slices.length);
  await request('GET', '/outline?detail=chapters&context=absent', undefined, 404);
  await request('GET', '/outline?detail=unknown', undefined, 400);
});

test('one compact batch builds and verifies a new Chapter without echoing HTML or examples', async (t) => {
  const { request } = await setup(t);
  const post = (path, body, as) => ({ method: 'POST', path, body, as });
  const batch = await request('POST', '/ops', {
    compact: true,
    verify: ['$ch.slice', '$ch.slice'],
    ops: [
      post('/contexts', { name: 'Streaming' }, 'context'),
      post('/chapters', { context: '$context', name: 'Signup' }, 'ch'),
      { method: 'PATCH', path: '/slices/$ch.slice', body: { name: 'Start Subscription' } },
      post('/chapters/$ch/lanes', { type: 'SPEC', after: '$ch.event' }, 'spec'),
      post('/elements', { slice: '$ch.slice', lane: '$ch.actor', type: 'SCREEN', name: 'Checkout',
        html: '<h1>Review your plan</h1>', fields: [{ name: 'plan' }] }, 'screen'),
      post('/elements', { slice: '$ch.slice', lane: '$ch.interaction', type: 'COMMAND',
        name: 'Start Subscription' }, 'cmd'),
      post('/elements', { slice: '$ch.slice', lane: '$ch.event', type: 'EVENT',
        name: 'Subscription Started' }, 'event'),
      post('/elements', { slice: '$ch.slice', lane: '$spec', type: 'SCENARIOS' }, 'specElement'),
      post('/elements/$specElement/scenarios', {
        name: 'Accept signup',
        when: { element: '$cmd', example: { plan: 'Example plan' } },
        then: [{ element: '$event', example: { plan: 'Example plan' } }],
      }),
    ],
  });
  const [, ch, slice, , screen, command, event, spec, scenario] = batch.results.map(({ body }) => body.id);
  assert.equal(batch.slices.length, 1);
  const summary = batch.slices[0];
  assert.deepEqual([summary.chapter, summary.id, summary.type], [ch, slice, 'STATE_CHANGE']);
  const elements = new Map(summary.elements.map((e) => [e.id, e]));
  assert.deepEqual(elements.get(screen).connectsTo, [command]);
  assert.equal(elements.get(screen).hasHtml, true);
  assert.deepEqual(elements.get(command).fields, ['plan']);
  assert.deepEqual(elements.get(command).connectsTo, [event]);
  assert.deepEqual(elements.get(spec).scenarios, [
    { id: scenario, name: 'Accept signup', given: [], when: command, then: [event], error: null },
  ]);
  assert.doesNotMatch(JSON.stringify(batch), /Review your plan|Example plan/);
  const stored = await request('GET', `/chapters/${ch}`);
  assert.equal(stored.slices[0].id, slice);
  assert.match(stored.slices[0].elements.find((e) => e.id === screen).html, /Review your plan/);
});

test('failed batch verification or Chapter alias collision leaves no writes', async (t) => {
  const { request, context } = await setup(t);
  const existing = await context('Existing');
  const before = await request('GET', '/revision');
  const create = { method: 'POST', path: '/chapters', as: 'ch', body: { context: existing.id, name: 'Signup' } };
  const unknown = await request('POST', '/ops', { verify: ['$missing'], ops: [create] }, 400);
  assert.match(unknown.error, /Unknown slice/);
  const invalid = await request('POST', '/ops', { verify: 'ch', ops: [create] }, 400);
  assert.match(invalid.error, /verify must be a list/);
  const collision = await request('POST', '/ops', { ops: [
    { method: 'POST', path: '/contexts', as: 'ch.actor', body: { name: 'Transient' } }, create,
  ] }, 400);
  assert.match(collision.error, /^ops\[1\]: .*aliases/);
  assert.deepEqual(await request('GET', '/revision'), before);
});

test('Tasks persist through CRUD, filtering, board round trips, pushes and Context rename', async (t) => {
  const { root, request, context, chapter } = await setup(t);
  const first = await context('Default');
  const second = await context('Other');
  const ch = await chapter(first.id, 'Ordering');
  const task = await request('POST', '/tasks', { context: first.id, title: '  Model checkout  ', chapter: ch.id }, 201);
  assert.match(task.id, /^[A-Za-z0-9]{6}$/);
  assert.deepEqual(task, { id: task.id, title: 'Model checkout', description: '', status: 'Open', chapter: ch.id });
  const general = await request('POST', '/tasks', { context: first.id, title: 'Review language', description: 'First line\nSecond line' }, 201);
  const other = await request('POST', '/tasks', { context: second.id, title: 'Review other Context' }, 201);
  assert.deepEqual((await request('GET', `/tasks?context=${first.id}`)).map((task) => task.id), [task.id, general.id]);
  assert.deepEqual((await request('GET', '/tasks')).map((task) => [task.context, task.id]), [
    [first.id, task.id], [first.id, general.id], [second.id, other.id],
  ]);
  const done = await request('PATCH', `/tasks/${task.id}`, { title: 'Checkout ready', description: 'Reviewed', status: 'Done' });
  assert.equal(done.status, 'Done');
  assert.deepEqual(await request('GET', `/tasks/${task.id}`), done);
  const exported = await request('GET', '');
  const board = parseBoard(JSON.stringify(exported));
  const serialized = serialize(board.nodes, board.edges, board.contexts);
  assert.deepEqual(serialized, exported);
  await request('PUT', '/contexts', {
    contexts: serialized.contexts.map(({ tasks, ...context }) => context),
  }, 200, '*');
  for (const context of serialized.contexts) {
    await request('PUT', `/contexts/${context.id}`, {
      ...context, chapters: serialized.chapters.filter((ch) => ch.context === context.id),
    }, 200, '*');
  }
  await request('PATCH', `/contexts/${first.id}`, { name: 'Renamed' });
  const restarted = (await new ModelStore(root).pull()).data;
  assert.deepEqual(restarted.contexts[0].tasks, [done, general]);
  const directory = path.join(root, '.event-modeling', 'model');
  const metadata = loadYaml(await fs.readFile(path.join(directory, 'contexts.yaml'), 'utf8'));
  assert.ok(metadata.every((context) => !('tasks' in context)));
  const doc = loadYaml(await fs.readFile(path.join(directory, 'renamed.yaml'), 'utf8'));
  assert.deepEqual(doc.tasks, [done, general]);
  await request('DELETE', `/tasks/${task.id}`);
  assert.deepEqual((await request('GET', `/tasks?context=${first.id}`)).map((task) => task.id), [general.id]);
  await request('DELETE', `/tasks/${general.id}`);
  assert.equal('tasks' in (await request('GET', '')).contexts[0], false);
});

test('Tasks follow Chapter moves, detach on Chapter deletion and survive Context deletion', async (t) => {
  const { request, context, chapter } = await setup(t);
  const fallback = await context('Default');
  const source = await context('Source');
  const destination = await context('Destination');
  const moving = await chapter(source.id, 'Moving');
  const staying = await chapter(source.id, 'Staying');
  const general = await request('POST', '/tasks', { context: source.id, title: 'Context work' }, 201);
  const linked = await request('POST', '/tasks', { context: source.id, title: 'Moving work', chapter: moving.id }, 201);
  const retained = await request('POST', '/tasks', { context: source.id, title: 'Staying work', chapter: staying.id }, 201);
  await request('PATCH', `/chapters/${moving.id}`, { context: destination.id });
  assert.deepEqual((await request('GET', `/tasks?context=${source.id}`)).map((task) => task.id), [general.id, retained.id]);
  assert.deepEqual(await request('GET', `/tasks?context=${destination.id}`), [{ context: destination.id, ...linked }]);
  await request('DELETE', `/chapters/${moving.id}`);
  assert.equal((await request('GET', `/tasks/${linked.id}`)).chapter, null);
  await request('DELETE', `/contexts/${destination.id}`);
  assert.equal((await request('GET', `/tasks?context=${fallback.id}`))[0].id, linked.id);
  await request('DELETE', `/contexts/${source.id}`);
  assert.deepEqual((await request('GET', `/tasks?context=${fallback.id}`)).map((task) => task.id), [linked.id, general.id, retained.id]);
  assert.equal((await request('GET', `/tasks/${retained.id}`)).chapter, staying.id);
  assert.equal((await request('GET', `/chapters/${staying.id}`)).context, fallback.id);
  await request('PATCH', `/tasks/${general.id}`, { context: fallback.id, chapter: staying.id });
  assert.equal((await request('GET', `/tasks/${general.id}`)).chapter, staying.id);
});

test('Invalid Task writes and stale revisions leave persisted Tasks unchanged', async (t) => {
  const { request, context, chapter } = await setup(t);
  const first = await context('Default');
  const second = await context('Other');
  const foreign = await chapter(second.id, 'Foreign');
  const task = await request('POST', '/tasks', { context: first.id, title: 'Original' }, 201);
  const revision = (await request('GET', '/revision')).revision;
  for (const body of [
    { title: ' ' }, { status: 'Pending' }, { description: null },
    { chapter: foreign.id }, { chapter: 'missing' }, { chapter: 42 }, { unknown: true },
  ]) {
    await request('PATCH', `/tasks/${task.id}`, body, 400);
    assert.deepEqual(await request('GET', `/tasks/${task.id}`), task);
  }
  assert.equal((await request('GET', '/revision')).revision, revision);
  await request('GET', '/tasks/missing', undefined, 404);
  await request('GET', '/tasks?context=missing', undefined, 404);
  await request('POST', '/tasks', { context: 'missing', title: 'No' }, 400);
  await request('PATCH', `/tasks/${task.id}`, { status: 'Done' }, 412, '"stale"');
  await request('POST', '/ops', { ops: [
    { method: 'PATCH', path: `/tasks/${task.id}`, body: { status: 'Done' } },
    { method: 'POST', path: '/tasks', body: { context: first.id, title: 'No', chapter: foreign.id } },
  ] }, 400);
  assert.deepEqual(await request('GET', `/tasks/${task.id}`), task);
  const exported = await request('GET', '');
  for (const invalid of [
    { ...task, id: first.id }, { ...task, chapter: foreign.id }, { ...task, status: 'Closed' },
  ]) {
    const malformed = structuredClone(exported);
    malformed.contexts[0].tasks = [invalid];
    assert.throws(() => parseBoard(JSON.stringify(malformed)), /duplicate id|Chapter id|Open or Done/);
    await request('PUT', `/contexts/${first.id}`, {
      id: first.id, name: first.name, tasks: [invalid], chapters: [],
    }, 400, '*');
  }
  assert.deepEqual(await request('GET', `/tasks/${task.id}`), task);
});

test('compact batches preserve aliases, effects and atomic errors without returning item content', async (t) => {
  const { request, context } = await setup(t);
  const first = await context('Default');
  const compact = await request('POST', '/ops', { compact: true, ops: [
    { method: 'POST', path: '/tasks', body: { context: first.id, title: 'Review' }, as: 'task' },
    { method: 'PATCH', path: '/tasks/$task', body: { status: 'Done' } },
  ] });
  const id = compact.results[0].body.id;
  assert.deepEqual(compact, { results: [
    { status: 201, body: { id } },
    { status: 200, body: { id } },
  ] });
  assert.equal((await request('GET', `/tasks/${id}`)).status, 'Done');
  for (const options of [{}, { compact: false }]) {
    const full = await request('POST', '/ops', { ...options, ops: [
      { method: 'PATCH', path: `/tasks/${id}`, body: { title: 'Keep full response' } },
    ] });
    assert.deepEqual(full.results[0].body, await request('GET', `/tasks/${id}`));
  }
  const revision = (await request('GET', '/revision')).revision;
  for (const compact of ['true', 1, null]) {
    const error = await request('POST', '/ops', { compact, ops: [
      { method: 'DELETE', path: `/tasks/${id}` },
    ] }, 400);
    assert.match(error.error, /compact must be true or false/);
  }
  const failed = await request('POST', '/ops', { compact: true, ops: [
    { method: 'DELETE', path: `/tasks/${id}` },
    { method: 'PATCH', path: '/tasks/missing', body: { title: 'No' } },
  ] }, 404);
  assert.match(failed.error, /^ops\[1\]: /);
  await request('POST', '/ops', { compact: true, ops: [
    { method: 'DELETE', path: `/tasks/${id}` },
  ] }, 412, '"stale"');
  assert.equal((await request('GET', '/revision')).revision, revision);
  assert.equal((await request('GET', `/tasks/${id}`)).title, 'Keep full response');
  assert.deepEqual(await request('POST', '/ops', { compact: true, ops: [
    { method: 'DELETE', path: `/tasks/${id}` },
  ] }), { results: [{ status: 200, body: { removed: id } }] });
});
