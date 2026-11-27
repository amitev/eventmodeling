import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from './app.js';
import { createModelingTasks, resolveModelingScope } from './modeling-tasks.js';
import { modelingPrompt, parseModelingResponse } from '../agent/agent.js';
import { claude } from '../agent/harnesses/claude.js';
import { copilot } from '../agent/harnesses/copilot.js';

const requeued = (task) => task.status === 'running' ? {
  ...task, status: 'queued', startedAt: null,
  turns: task.turns.map((turn) => turn.status === 'running' ? { ...turn, status: 'queued', startedAt: null } : turn),
} : task;

test('modeling conversations retain turns, queue follow-ups FIFO and reject stale completions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-chat-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tasks = createModelingTasks(root);
  const input = {
    scope: { type: 'chapter', chapterId: 'c' }, contextId: 'ctx',
    label: 'Orders', prompt: 'Review', modeler: 'Mozart',
  };
  const first = tasks.add(input);
  tasks.next('Mozart');
  tasks.finish(first.id, 'Mozart', 'failed', 'Which cases should I cover?');
  const previous = tasks.get(first.id).turns[0];
  const other = tasks.add(input);
  const next = tasks.reply(first.id, 'Cover all cases');
  assert.equal(next.id, first.id);
  assert.notEqual(next.turnId, first.turnId);
  assert.deepEqual(next.scope, first.scope);
  assert.deepEqual(next.turns[0], previous);
  assert.equal(next.turns.length, 2);
  assert.throws(() => tasks.reply(first.id, 'Too soon'), /Wait for the current reply/);
  assert.equal(tasks.next('Mozart').id, other.id);
  tasks.finish(other.id, 'Mozart', 'done', 'Reviewed.');
  assert.equal(tasks.next('Mozart').id, first.id);
  assert.throws(() => tasks.finish(first.id, 'Mozart', 'done', 'Stale'), /not running on this agent/);
  tasks.finish(first.id, 'Mozart', 'done', 'All scenarios added.', null, null, null, next.turnId);
  assert.deepEqual(createModelingTasks(root).get(first.id), tasks.get(first.id));
  const snapshot = tasks.get(first.id);
  snapshot.turns[0].prompt = 'mutated';
  assert.equal(tasks.get(first.id).turns[0].prompt, 'Review');
  const copilot = tasks.add({ ...input, harness: 'copilot' });
  tasks.next('Mozart', 'copilot');
  tasks.finish(copilot.id, 'Mozart', 'done', 'Reviewed.');
  assert.throws(() => tasks.reply(copilot.id, 'Continue'), /Copilot follow-ups/);
});

test('modeling tasks serialize per modeler, retain feedback and resume after disconnect', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-tasks-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tasks = createModelingTasks(root);
  const input = { scope: { type: 'chapter', chapterId: 'c' }, contextId: 'ctx', label: 'Chapter', prompt: 'Review' };
  const first = tasks.add({ ...input, modeler: 'Mozart' });
  const second = tasks.add({ ...input, modeler: 'Mozart' });
  const other = tasks.add({ ...input, modeler: 'Haydn' });
  assert.equal(tasks.next('mozart').id, first.id);
  assert.equal(tasks.next('Mozart'), null);
  assert.equal(tasks.next('Haydn').id, other.id);
  assert.throws(() => tasks.finish(first.id, 'Haydn', 'done', 'Wrong agent'), /not running on this agent/);
  tasks.release('Mozart');
  assert.equal(tasks.next('Mozart').id, first.id);
  tasks.finish(first.id, 'Mozart', 'failed', 'Needs a decision', 'Needs a decision');
  assert.equal(tasks.next('Mozart').id, second.id);
  assert.deepEqual(tasks.list().map(({ id }) => id), [other.id, second.id, first.id]);
  assert.deepEqual(tasks.list().map(({ status }) => status), ['running', 'running', 'failed']);
  assert.equal(tasks.list()[2].response, 'Needs a decision');
  assert.equal(tasks.list()[2].error, null);
  const snapshot = tasks.list();
  snapshot[0].scope.chapterId = 'mutated';
  assert.equal(tasks.list()[0].scope.chapterId, 'c');
});

test('saved single-task history becomes a conversation without losing its exchange', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-existing-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tasks = createModelingTasks(root);
  const task = tasks.add({
    scope: { type: 'context', contextId: 'ctx' }, contextId: 'ctx',
    label: 'Sales', prompt: 'Review', modeler: 'Mozart',
  });
  tasks.next('Mozart');
  tasks.finish(task.id, 'Mozart', 'done', 'Reviewed.');
  const { turns, turnId, harness, ...previous } = tasks.get(task.id);
  await fs.writeFile(path.join(root, '.em', '.tasks', 'modeling.json'), JSON.stringify([previous]));
  const restored = createModelingTasks(root).get(task.id);
  assert.equal(restored.harness, null);
  assert.equal(restored.turns.length, 1);
  assert.equal(restored.turns[0].prompt, 'Review');
  assert.equal(restored.turns[0].response, 'Reviewed.');
});

test('modeling history retains the last 10 completions and all unfinished tasks across restart', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tasks = createModelingTasks(root);
  const input = {
    scope: { type: 'chapter', chapterId: 'c' }, contextId: 'ctx',
    label: 'Orders', prompt: 'Review the Chapter', modeler: 'Mozart',
  };
  const interrupted = tasks.add({ ...input, modeler: 'Haydn' });
  tasks.next('Haydn');
  const finished = [];
  for (let index = 0; index < 12; index++) {
    const task = tasks.add(input);
    finished.push(task);
    assert.equal(tasks.next('Mozart').id, task.id);
    tasks.finish(task.id, 'Mozart', index % 2 ? 'failed' : 'done', `Response ${index}`, null, 0.125, 'USD');
  }
  // An old task finishing last must survive retention without moving above newer-created tasks.
  tasks.finish(interrupted.id, 'Haydn', 'done', 'Finished late');
  const running = tasks.add(input);
  tasks.next('Mozart');
  const queued = tasks.add(input);
  const before = tasks.list();
  assert.deepEqual(before.map(({ id }) => id), [
    queued.id, running.id, ...finished.slice(3).reverse().map(({ id }) => id), interrupted.id,
  ]);
  assert.equal(before.filter(({ status }) => status === 'done' || status === 'failed').length, 10);
  const stored = JSON.parse(await fs.readFile(path.join(root, '.em', '.tasks', 'modeling.json'), 'utf8'));
  assert.deepEqual(stored.map(({ id }) => id), before.map(({ id }) => id));
  assert.equal(stored[1].turns.at(-1).status, 'queued');
  const restored = createModelingTasks(root);
  assert.deepEqual(restored.list(), before.map(requeued));
  assert.equal(restored.next('Mozart').id, running.id);
  assert.equal(restored.next('Mozart'), null);
});

test('modeling history write failures leave task state unchanged and allow retry', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-write-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tasks = createModelingTasks(root);
  const input = {
    scope: { type: 'context', contextId: 'ctx' }, contextId: 'ctx',
    label: 'Sales', prompt: 'Review', modeler: 'Mozart',
  };
  const task = tasks.add(input);
  tasks.next('Mozart');
  const before = tasks.list();
  const file = path.join(root, '.em', '.tasks', 'modeling.json');
  await fs.unlink(file);
  await fs.mkdir(file);
  assert.throws(() => tasks.finish(task.id, 'Mozart', 'done', 'Reviewed'));
  assert.throws(() => tasks.add(input));
  assert.deepEqual(tasks.list(), before);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['modeling.json']);
  await fs.rmdir(file);
  tasks.finish(task.id, 'Mozart', 'done', 'Reviewed');
  assert.equal(createModelingTasks(root).list()[0].response, 'Reviewed');
});

test('invalid saved modeling history fails explicitly', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-invalid-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, '.em', '.tasks');
  await fs.mkdir(directory, { recursive: true });
  for (const content of ['[{"status":"done"}]', '{invalid']) {
    await fs.writeFile(path.join(directory, 'modeling.json'), content);
    assert.throws(() => createModelingTasks(root), /Invalid modeling task history/);
  }
});

test('scope validation rejects stale Cells, moved elements and extra target IDs', () => {
  const model = {
    contexts: [{ id: 'ctx', name: 'Sales' }, { id: 'other', name: 'Support' }],
    chapters: [{ id: 'c', context: 'ctx', name: 'Orders', lanes: [{ id: 'l', name: 'Buyer' }],
      slices: [{ id: 's', name: 'Order', elements: [{ id: 'e', lane: 'l', name: 'Place Order' }] }] }],
  };
  const contextScope = { type: 'context', contextId: 'other' };
  assert.deepEqual(resolveModelingScope(model, contextScope), {
    scope: contextScope, contextId: 'other', label: 'Support',
  });
  assert.throws(() => resolveModelingScope(model, { type: 'context', contextId: 'missing' }), /Scope Context not found/);
  assert.throws(() => resolveModelingScope(model, { ...contextScope, chapterId: 'c' }), /Invalid/);
  const scope = { type: 'element', chapterId: 'c', sliceId: 's', laneId: 'l', elementId: 'e' };
  assert.equal(resolveModelingScope(model, scope).label, 'Sales / Orders / Order / Buyer / Place Order');
  const sliceScope = { type: 'slice', chapterId: 'c', sliceId: 's' };
  assert.equal(resolveModelingScope(model, sliceScope).label, 'Sales / Orders / Order');
  assert.deepEqual(resolveModelingScope(model, sliceScope).scope, sliceScope);
  assert.throws(() => resolveModelingScope(model, { ...sliceScope, laneId: 'l' }), /Invalid/);
  assert.throws(() => resolveModelingScope(model, { ...sliceScope, sliceId: 'missing' }), /Scope slice not found/);
  assert.throws(() => resolveModelingScope(model, { ...scope, laneId: 'missing' }), /Cell not found/);
  assert.throws(() => resolveModelingScope(model, { ...scope, elementId: 'missing' }), /element not found/);
  assert.throws(() => resolveModelingScope(model, { type: 'chapter', chapterId: 'c', elementId: 'e' }), /Invalid/);
  const cell = { type: 'cell', chapterId: 'c', sliceId: 's', laneId: 'l' };
  assert.throws(() => resolveModelingScope(model, cell), (error) => error.status === 409 && /Cell must be empty/.test(error.message));
  assert.deepEqual(resolveModelingScope(model, cell, { followUp: true }).scope, cell);
  model.chapters[0].slices[0].elements[0].lane = 'other';
  assert.throws(() => resolveModelingScope(model, scope), /element not found in Cell/);
  assert.deepEqual(resolveModelingScope(model, cell).scope, cell);
});

test('modeling response preserves agent feedback and rejects success-shaped invalid responses', () => {
  const response = '<build><success>false</success><response>Outside-scope work is needed.</response></build>';
  assert.deepEqual(parseModelingResponse(claude, JSON.stringify({ result: response })), {
    status: 'failed', response: 'Outside-scope work is needed.',
  });
  assert.deepEqual(parseModelingResponse(copilot, JSON.stringify({
    type: 'assistant.message', data: { content: '<build><success>true</success><response>Reviewed.</response></build>' },
  })), { status: 'done', response: 'Reviewed.' });
  for (const value of [
    '{"success":true,"response":"Done"}',
    '<build><success>true</success></build>',
    '<build><success>true</success><response> </response></build>',
    '<build><success>yes</success><response>Done</response></build>',
  ]) {
    assert.throws(() => parseModelingResponse(claude, JSON.stringify({ result: value })), /Invalid build response/);
  }
  assert.equal(
    modelingPrompt('{apiUrl}\n{scope}\n{instruction}', 'http://localhost:4400/api/model', { label: '{instruction}' }, 'Keep {scope} literal'),
    'http://localhost:4400/api/model\n{"label":"{instruction}"}\nKeep {scope} literal',
  );
});

test('modeling API routes only to selected modelers and expose queued history and completion feedback', { timeout: 10000 }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-modeling-tasks-'));
  const server = createServer({ rootDir: root, publicDir: null });
  const controllers = [];
  t.after(async () => {
    for (const controller of controllers) controller.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (method, resource, body, status) => {
    const completion = resource.match(/\/modeling-tasks\/([^/]+)\/(?:done|failed)$/);
    if (method === 'POST' && completion) body = { turnId: completion[1], ...body };
    const response = await fetch(base + resource, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const detail = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(detail));
    return detail;
  };
  const connect = async (name, agentType, harness = 'claude') => {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${base}/agent/events?name=${name}&agentType=${agentType}&harness=${harness}&model=test`, { signal: controller.signal });
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    const event = async (type) => {
      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (frame.startsWith(`event: ${type}\n`)) return JSON.parse(frame.split('\ndata: ')[1]);
        } else {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('Agent stream ended before expected event');
          buffer += chunk.value;
        }
      }
    };
    return { id: (await event('welcome')).id, event };
  };
  const modeler = await connect('Mozart', 'modeler');
  const other = await connect('Haydn', 'modeler');
  const builder = await connect('Builder', 'builder');
  const context = await request('POST', '/model/contexts', { name: 'Sales' }, 201);
  const chapter = await request('POST', '/model/chapters', { name: 'Orders', context: context.id }, 201);
  const scope = { type: 'chapter', chapterId: chapter.id };
  const body = { agentId: modeler.id, prompt: 'Review this Chapter', scope };
  await request('POST', '/modeling-tasks', { ...body, agentId: builder.id }, 400);
  await request('POST', '/modeling-tasks', { ...body, scope: { type: 'chapter', chapterId: 'missing' } }, 404);
  await request('POST', '/modeling-tasks', { ...body, prompt: ' ' }, 400);
  const first = await request('POST', '/modeling-tasks', body, 201);
  assert.equal((await modeler.event('modeling-task')).id, first.id);
  const second = await request('POST', '/modeling-tasks', body, 201);
  const separate = await request('POST', '/modeling-tasks', { ...body, agentId: other.id }, 201);
  assert.equal((await other.event('modeling-task')).id, separate.id);
  assert.deepEqual((await request('GET', '/modeling-tasks', undefined, 200)).map(({ status }) => status), ['running', 'queued', 'running']);
  const endpoint = `/agents/${modeler.id}/modeling-tasks/${first.id}`;
  await request('GET', `${endpoint}/scope`, undefined, 400);
  assert.deepEqual((await request('GET', `${endpoint}/scope?turnId=${first.turnId}`, undefined, 200)).scope, scope);
  await request('POST', `/agents/${other.id}/modeling-tasks/${first.id}/done`, { response: 'Wrong agent' }, 409);
  await request('POST', `${endpoint}/done`, { response: ' ' }, 400);
  await request('POST', `${endpoint}/done`, { turnId: null, response: 'Missing turn.' }, 400);
  await request('POST', `${endpoint}/failed`, {}, 400);
  await request('POST', `${endpoint}/done`, { response: 'Checked all slices.' }, 204);
  assert.equal((await modeler.event('modeling-task')).id, second.id);
  const history = await request('GET', '/modeling-tasks', undefined, 200);
  assert.deepEqual(history.map(({ id }) => id), [separate.id, second.id, first.id]);
  assert.equal(history[2].response, 'Checked all slices.');
  assert.equal(history[2].status, 'done');
  await request('POST', `/agents/${modeler.id}/modeling-tasks/${second.id}/failed`, { response: 'Needs a decision.' }, 204);
  const failed = (await request('GET', '/modeling-tasks', undefined, 200))[1];
  assert.equal(failed.status, 'failed');
  assert.equal(failed.response, 'Needs a decision.');
  assert.equal(failed.error, null);
  await request('POST', `/agents/${other.id}/modeling-tasks/${separate.id}/failed`, { error: 'Could not reach model API.' }, 204);
  const technical = (await request('GET', '/modeling-tasks', undefined, 200))[0];
  assert.equal(technical.status, 'failed');
  assert.equal(technical.response, null);
  assert.equal(technical.error, 'Could not reach model API.');
  const messages = `/modeling-tasks/${second.id}/messages`;
  await request('POST', '/modeling-tasks/missing/messages', { prompt: 'Continue.' }, 404);
  await request('POST', messages, { prompt: ' ' }, 400);
  const followUp = await request('POST', messages, { prompt: 'Cover all cases.' }, 201);
  assert.equal(followUp.id, second.id);
  assert.equal(followUp.turns.length, 2);
  assert.equal(followUp.turns[0].response, 'Needs a decision.');
  assert.equal((await modeler.event('modeling-task')).turnId, followUp.turnId);
  await request('POST', messages, { prompt: 'Too early.' }, 409);
  const followUpEndpoint = `/agents/${modeler.id}/modeling-tasks/${second.id}`;
  await request('GET', `${followUpEndpoint}/scope?turnId=${second.turnId}`, undefined, 409);
  const followUpScope = await request('GET', `${followUpEndpoint}/scope?turnId=${followUp.turnId}`, undefined, 200);
  assert.equal(followUpScope.followUp, true);
  await request('POST', `${followUpEndpoint}/done`, { response: 'Stale reply.' }, 409);
  await request('POST', `${followUpEndpoint}/done`, { turnId: followUp.turnId, response: 'All scenarios added.' }, 204);
  await request('DELETE', `/agents/${modeler.id}`, undefined, 204);
  await request('POST', messages, { prompt: 'Continue.' }, 409);
  const wrongHarness = await connect('Mozart', 'modeler', 'copilot');
  await request('POST', messages, { prompt: 'Continue.' }, 409);
  const copilotTask = await request('POST', '/modeling-tasks', { ...body, agentId: wrongHarness.id }, 201);
  assert.equal((await wrongHarness.event('modeling-task')).id, copilotTask.id);
  await request('POST', `/agents/${wrongHarness.id}/modeling-tasks/${copilotTask.id}/done`, { response: 'Reviewed.' }, 204);
  await request('POST', `/modeling-tasks/${copilotTask.id}/messages`, { prompt: 'Continue.' }, 409);
  await request('DELETE', `/agents/${wrongHarness.id}`, undefined, 204);
  const reconnected = await connect('Mozart', 'modeler');
  const resumed = await request('POST', messages, { prompt: 'Check the corner cases too.' }, 201);
  assert.equal((await reconnected.event('modeling-task')).turnId, resumed.turnId);
  assert.equal(resumed.turns.length, 3);
  assert.deepEqual(resumed.scope, scope);
  const contextScope = { type: 'context', contextId: context.id };
  const contextTask = await request('POST', '/modeling-tasks', {
    agentId: other.id, prompt: 'Review this Context', scope: contextScope,
  }, 201);
  assert.equal((await other.event('modeling-task')).id, contextTask.id);
  const contextTarget = await request('GET', `/agents/${other.id}/modeling-tasks/${contextTask.id}/scope?turnId=${contextTask.turnId}`, undefined, 200);
  assert.deepEqual(contextTarget.scope, contextScope);
  assert.equal(contextTarget.label, 'Sales');
  const restarted = createServer({ rootDir: root, publicDir: null });
  try {
    restarted.listen(0, '127.0.0.1');
    await once(restarted, 'listening');
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/modeling-tasks`);
    assert.equal(response.status, 200);
    const expected = (await request('GET', '/modeling-tasks', undefined, 200)).map(requeued);
    assert.deepEqual(await response.json(), expected);
    assert.equal(expected[0].id, contextTask.id);
  } finally {
    restarted.closeAllConnections();
    await new Promise((resolve) => restarted.close(resolve));
  }
});
