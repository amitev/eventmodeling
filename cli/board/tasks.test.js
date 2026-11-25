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

test('board format has no version field', () => {
  const board = serialize([], [], [{ id: 'context', name: 'Default' }]);

  assert.equal('version' in board, false);
  assert.throws(() => parseBoard(JSON.stringify({ ...board, version: 1 })), /version: is not allowed/);
});

test('tracked field provenance must resolve to a source element', async (t) => {
  const { request, context, chapter } = await setup(t);
  const ctx = await context('Sales');
  const ch = await chapter(ctx.id, 'Orders');
  await request('POST', '/elements', {
    slice: ch.slices[0].id,
    lane: ch.lanes.find((lane) => lane.type === 'INTERACTION').id,
    type: 'READ_MODEL',
    name: 'Order Summary',
    fields: [{
      name: 'orderId',
      id: 'field-1',
      inheritedFrom: { elementId: 'missing-source', id: 'field-1', fieldPath: ['orderId'] },
    }],
    autoConnect: false,
  }, 400);

  const source = await request('POST', '/elements', {
    slice: ch.slices[0].id,
    lane: ch.lanes.find((lane) => lane.type === 'EVENT').id,
    type: 'EVENT',
    name: 'Order Placed',
    fields: [{ name: 'orderId' }],
    autoConnect: false,
  }, 201);
  const sourceFieldId = (await request('GET', `/elements/${source.id}`)).fields[0].id;
  await request('POST', '/elements', {
    slice: ch.slices[0].id,
    lane: ch.lanes.find((lane) => lane.type === 'INTERACTION').id,
    type: 'READ_MODEL',
    name: 'Order Summary',
    fields: [{
      name: 'orderId',
      id: sourceFieldId,
      inheritedFrom: { elementId: source.id, id: sourceFieldId, fieldPath: ['missingField'] },
    }],
    autoConnect: false,
  }, 400);
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

test('tracked fields follow source deletion, rename and type changes', async (t) => {
  const { request, context, chapter } = await setup(t);
  const ctx = await context('Sales');
  const ch = await chapter(ctx.id, 'Orders');
  const lane = (type) => ch.lanes.find((entry) => entry.type === (type === 'EVENT' ? 'EVENT' : 'INTERACTION')).id;
  const element = (content) =>
    request('POST', '/elements', {
      slice: ch.slices[0].id,
      lane: lane(content.type),
      autoConnect: false,
      ...content,
    }, 201);
  const source = await element({
    type: 'EVENT',
    name: 'Profile Updated',
    fields: [{ name: 'profile', type: 'object', fields: [{ name: 'email' }, { name: 'name' }] }],
  });
  const target = await element({
    type: 'READ_MODEL',
    name: 'Profile',
    fields: [{ name: 'legacy' }],
  });
  await request('POST', '/connections', { from: source.id, to: target.id }, 201);

  const inherited = (await request('GET', `/elements/${target.id}`)).fields;
  assert.deepEqual(inherited[1].inheritedFrom, {
    elementId: source.id,
    id: inherited[1].id,
    fieldPath: ['profile'],
  });
  const sourceFields = (await request('GET', `/elements/${source.id}`)).fields;
  sourceFields[0].fields = sourceFields[0].fields.filter((field) => field.name !== 'email');
  await request('PATCH', `/elements/${source.id}`, { fields: sourceFields });

  const updated = (await request('GET', `/elements/${target.id}`)).fields;
  assert.deepEqual(updated.map((field) => field.name), ['legacy', 'profile']);
  assert.deepEqual(updated[1].fields.map((field) => field.name), ['name']);

  sourceFields[0].name = 'person';
  await request('PATCH', `/elements/${source.id}`, { fields: sourceFields });
  const renamed = (await request('GET', `/elements/${target.id}`)).fields;
  assert.deepEqual(renamed.map((field) => field.name), ['legacy', 'person']);
  assert.deepEqual(renamed[1].inheritedFrom.fieldPath, ['person']);
  assert.deepEqual(renamed[1].fields[0].inheritedFrom.fieldPath, ['person', 'name']);

  const sourceString = (await request('GET', `/elements/${source.id}`)).fields;
  sourceString[0].type = 'string';
  delete sourceString[0].fields;
  await request('PATCH', `/elements/${source.id}`, { fields: sourceString });
  const asString = (await request('GET', `/elements/${target.id}`)).fields[1];
  assert.equal(asString.type, 'string');
  assert.equal('fields' in asString, false);

  let sourceObject = (await request('GET', `/elements/${source.id}`)).fields;
  sourceObject[0].type = 'object';
  sourceObject[0].fields = [{ name: 'address' }];
  await request('PATCH', `/elements/${source.id}`, { fields: sourceObject });
  const asObject = (await request('GET', `/elements/${target.id}`)).fields[1];
  assert.equal(asObject.type, 'object');
  assert.deepEqual(asObject.fields.map((field) => field.name), ['address']);
  assert.deepEqual(asObject.fields[0].inheritedFrom, {
    elementId: source.id,
    id: asObject.fields[0].id,
    fieldPath: ['person', 'address'],
  });

  sourceObject = (await request('GET', `/elements/${source.id}`)).fields;
  sourceObject[0].list = true;
  sourceObject[0].identifier = true;
  sourceObject[0].optional = true;
  sourceObject[0].generated = true;
  sourceObject[0].pii = true;
  sourceObject[0].technical = true;
  sourceObject[0].fields[0].type = 'uuid';
  sourceObject[0].fields.push({ name: 'city' });
  await request('PATCH', `/elements/${source.id}`, { fields: sourceObject });

  const allProperties = (await request('GET', `/elements/${target.id}`)).fields[1];
  assert.equal(allProperties.list, true);
  assert.equal(allProperties.identifier, true);
  assert.equal(allProperties.optional, true);
  assert.equal(allProperties.generated, true);
  assert.equal(allProperties.pii, true);
  assert.equal(allProperties.technical, true);
  assert.equal(allProperties.fields[0].type, 'uuid');
  assert.deepEqual(allProperties.fields.map((field) => field.name), ['address', 'city']);
  assert.deepEqual(allProperties.fields[1].inheritedFrom, {
    elementId: source.id,
    id: allProperties.fields[1].id,
    fieldPath: ['person', 'city'],
  });

  await request('DELETE', `/elements/${source.id}`);
  assert.deepEqual((await request('GET', `/elements/${target.id}`)).fields.map((field) => field.name), ['legacy']);
});

test('whole-Context pushes remove fields inherited from deleted elements', async (t) => {
  const { request, context, chapter } = await setup(t);
  const sourceContext = await context('Source');
  const targetContext = await context('Target');
  const targetChapter = await chapter(targetContext.id, 'Summary');
  const makeElements = async () => {
    const sourceChapter = await chapter(sourceContext.id, 'Orders');
    const source = await request('POST', '/elements', {
      slice: sourceChapter.slices[0].id,
      lane: sourceChapter.lanes.find((lane) => lane.type === 'EVENT').id,
      type: 'EVENT',
      name: 'Order Placed',
      fields: [{ name: 'orderId' }],
      autoConnect: false,
    }, 201);
    const target = await request('GET', `/elements/${targetElement.id}`);
    await request('POST', '/connections', { from: source.id, to: target.id }, 201);
  };
  const targetElement = await request('POST', '/elements', {
    slice: targetChapter.slices[0].id,
    lane: targetChapter.lanes.find((lane) => lane.type === 'INTERACTION').id,
    type: 'READ_MODEL',
    name: 'Order Summary',
    autoConnect: false,
  }, 201);

  await makeElements();
  assert.deepEqual((await request('GET', `/elements/${targetElement.id}`)).fields.map((field) => field.name), ['orderId']);
  const board = await request('GET', '');
  const sourceChapters = board.chapters.filter((chapter) => chapter.context === sourceContext.id);
  sourceChapters[0].slices[0].elements[0].fields[0].identifier = true;
  await request('PUT', `/contexts/${sourceContext.id}`, {
    id: sourceContext.id,
    name: sourceContext.name,
    chapters: sourceChapters,
  }, 200, '*');
  assert.equal((await request('GET', `/elements/${targetElement.id}`)).fields[0].identifier, true);

  await request('PUT', `/contexts/${sourceContext.id}`, {
    id: sourceContext.id,
    name: sourceContext.name,
    chapters: [],
  }, 200, '*');
  assert.deepEqual((await request('GET', `/elements/${targetElement.id}`)).fields ?? [], []);

  await makeElements();
  const contexts = (await request('GET', '')).contexts;
  await request('PUT', '/contexts', {
    contexts: contexts
      .filter((item) => item.id !== sourceContext.id)
      .map(({ id, name, info }) => ({ id, name, ...(info ? { info } : {}) })),
  }, 200, '*');
  assert.deepEqual((await request('GET', `/elements/${targetElement.id}`)).fields ?? [], []);
});

test('slice build info resolves and deduplicates external Event dependencies of Read Models', async (t) => {
  const { request, context, chapter } = await setup(t);
  const ctx = await context('Sales');
  const source = await chapter(ctx.id, 'Orders');
  const target = await chapter(ctx.id, 'Reports');
  const lane = (ch, type) => ch.lanes.find((entry) => entry.type === type).id;
  const element = (slice, lane, content) =>
    request('POST', '/elements', { slice, lane, autoConnect: false, ...content }, 201);
  const event = await element(source.slices[0].id, lane(source, 'EVENT'), {
    type: 'EVENT', name: 'Order Placed', info: 'Order accepted',
    fields: [{ name: 'order', type: 'object', fields: [{ name: 'id' }] }],
  });
  const readModel = await element(target.slices[0].id, lane(target, 'INTERACTION'), {
    type: 'READ_MODEL', name: 'Order Summary',
  });
  const unused = await element(target.slices[0].id, lane(target, 'INTERACTION'), {
    type: 'READ_MODEL', name: 'Other Summary',
  });
  const eventCopy = await element(target.slices[0].id, lane(target, 'EVENT'), { copyOf: event.id });
  const localEvent = await element(target.slices[0].id, lane(target, 'EVENT'), {
    type: 'EVENT', name: 'Report Viewed',
  });
  const otherSlice = await request('POST', `/chapters/${target.id}/slices`, { name: 'View Summary' }, 201);
  const readModelCopy = await element(otherSlice.id, lane(target, 'INTERACTION'), { copyOf: readModel.id });
  for (const [from, to] of [
    [event.id, readModel.id], [eventCopy.id, readModelCopy.id], [localEvent.id, readModel.id],
  ]) {
    await request('POST', '/connections', { from, to }, 201);
  }
  const storedEvent = await request('GET', `/elements/${event.id}`);
  const dependency = {
    context: { id: ctx.id, name: ctx.name },
    chapter: { id: source.id, name: source.name },
    slice: { id: source.slices[0].id, name: source.slices[0].name },
    event: { id: event.id, name: event.name, type: 'EVENT', fields: storedEvent.fields, info: event.info },
  };
  const result = await request('GET', `/chapters/${target.id}?slice=${target.slices[0].id}`);
  assert.deepEqual(result.readModelDependencies, [
    { readModelId: readModel.id, events: [dependency] },
    { readModelId: unused.id, events: [] },
  ]);
  const copyResult = await request('GET', `/chapters/${target.id}?slice=${otherSlice.id}`);
  assert.deepEqual(copyResult.readModelDependencies[0], {
    readModelId: readModelCopy.id,
    events: [dependency, {
      context: { id: ctx.id, name: ctx.name },
      chapter: { id: target.id, name: target.name },
      slice: { id: target.slices[0].id, name: target.slices[0].name },
      event: { id: localEvent.id, name: localEvent.name, type: 'EVENT', fields: [] },
    }],
  });
  const sourceResult = await request('GET', `/chapters/${source.id}?slice=${source.slices[0].id}`);
  assert.deepEqual(sourceResult.readModelDependencies, []);
  const fullChapter = await request('GET', `/chapters/${target.id}`);
  assert.equal(Object.hasOwn(fullChapter, 'readModelDependencies'), false);

  const unrelated = await chapter(ctx.id, 'Unrelated');
  const before = [sourceResult.slices[0].updatedAt, result.slices[0].updatedAt, copyResult.slices[0].updatedAt];
  assert.ok(before.every((value) => Number.isSafeInteger(value) && value > 0));
  t.mock.method(Date, 'now', () => 1);
  await request('PATCH', `/elements/${event.id}`, { info: 'Updated contract' });
  const changedSource = await request('GET', `/chapters/${source.id}`);
  const changedTarget = await request('GET', `/chapters/${target.id}`);
  assert.ok(changedSource.slices[0].updatedAt > before[0]);
  assert.ok(changedTarget.slices[0].updatedAt > before[1]);
  assert.ok(changedTarget.slices[1].updatedAt > before[2]);
  assert.equal(changedSource.slices[0].updatedAt, before[0] + 1);
  assert.equal((await request('GET', `/chapters/${unrelated.id}`)).slices[0].updatedAt, unrelated.slices[0].updatedAt);
  await request('PATCH', `/elements/${event.id}`, { info: 'Updated contract' });
  assert.deepEqual(await request('GET', `/chapters/${target.id}`), changedTarget);
  assert.deepEqual(await request('GET', `/chapters/${source.id}`), changedSource);
});

test('slice timestamps are server owned, survive round trips and update dependencies across Context pushes', async (t) => {
  const { root, request, context, chapter } = await setup(t);
  const first = await context('Sales');
  const second = await context('Reports');
  const source = await chapter(first.id, 'Orders');
  const target = await chapter(second.id, 'Summary');
  const event = await request('POST', '/elements', {
    slice: source.slices[0].id, lane: source.lanes.find((l) => l.type === 'EVENT').id,
    type: 'EVENT', name: 'Order Placed', autoConnect: false,
  }, 201);
  const readModel = await request('POST', '/elements', {
    slice: target.slices[0].id, lane: target.lanes.find((l) => l.type === 'INTERACTION').id,
    type: 'READ_MODEL', name: 'Order Summary', autoConnect: false,
  }, 201);
  await request('POST', '/connections', { from: event.id, to: readModel.id }, 201);
  const before = await request('GET', '');
  const board = parseBoard(JSON.stringify(before));
  assert.deepEqual(serialize(board.nodes, board.edges, board.contexts), before);
  const sourceChapter = before.chapters.find((ch) => ch.id === source.id);
  const targetChapter = before.chapters.find((ch) => ch.id === target.id);
  const oldSourceTime = sourceChapter.slices[0].updatedAt;
  const oldTargetTime = targetChapter.slices[0].updatedAt;
  sourceChapter.slices[0].updatedAt = Number.MAX_SAFE_INTEGER;
  await request('PUT', `/contexts/${first.id}`, { ...first, chapters: [sourceChapter] }, 200, '*');
  assert.equal((await request('GET', `/chapters/${source.id}`)).slices[0].updatedAt, oldSourceTime);
  sourceChapter.slices[0].elements[0].info = 'Revised payload';
  await request('PUT', `/contexts/${first.id}`, { ...first, chapters: [sourceChapter] }, 200, '*');
  const updatedSource = await request('GET', `/chapters/${source.id}`);
  const updatedTarget = await request('GET', `/chapters/${target.id}`);
  assert.ok(updatedSource.slices[0].updatedAt > oldSourceTime);
  assert.ok(updatedTarget.slices[0].updatedAt > oldTargetTime);
  const reloaded = await new ModelStore(root).read((model) => model);
  assert.equal(reloaded.chapters.find((ch) => ch.id === target.id).slices[0].updatedAt, updatedTarget.slices[0].updatedAt);
  await request('PATCH', `/slices/${target.slices[0].id}`, { updatedAt: 1 }, 400);
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
  const directory = path.join(root, '.em', 'model');
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
