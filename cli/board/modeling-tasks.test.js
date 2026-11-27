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

test('modeling tasks serialize per modeler, retain feedback and resume after disconnect', () => {
  const tasks = createModelingTasks();
  const input = { scope: { type: 'chapter', chapterId: 'c' }, contextId: 'ctx', label: 'Chapter', prompt: 'Review' };
  const first = tasks.add({ ...input, modeler: 'Mozart' });
  const second = tasks.add({ ...input, modeler: 'Mozart' });
  const other = tasks.add({ ...input, modeler: 'Haydn' });
  assert.equal(tasks.next('mozart').id, first.id);
  assert.equal(tasks.next('Mozart'), null);
  assert.equal(tasks.next('Haydn').id, other.id);
  assert.throws(() => tasks.finish(first.id, 'Haydn', 'Wrong agent'), /not running on this agent/);
  tasks.release('Mozart');
  assert.equal(tasks.next('Mozart').id, first.id);
  tasks.finish(first.id, 'Mozart', 'Needs a decision', 'Needs a decision');
  assert.equal(tasks.next('Mozart').id, second.id);
  assert.deepEqual(tasks.list().map(({ status }) => status), ['failed', 'running', 'running']);
  assert.equal(tasks.list()[0].response, 'Needs a decision');
  const snapshot = tasks.list();
  snapshot[0].scope.chapterId = 'mutated';
  assert.equal(tasks.list()[0].scope.chapterId, 'c');
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
    const response = await fetch(base + resource, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const detail = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(detail));
    return detail;
  };
  const connect = async (name, agentType) => {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${base}/agent/events?name=${name}&agentType=${agentType}&model=test`, { signal: controller.signal });
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
  assert.deepEqual((await request('GET', `${endpoint}/scope`, undefined, 200)).scope, scope);
  await request('POST', `/agents/${other.id}/modeling-tasks/${first.id}/done`, { response: 'Wrong agent' }, 409);
  await request('POST', `${endpoint}/done`, { response: ' ' }, 400);
  await request('POST', `${endpoint}/done`, { response: 'Checked all slices.' }, 204);
  assert.equal((await modeler.event('modeling-task')).id, second.id);
  const history = await request('GET', '/modeling-tasks', undefined, 200);
  assert.equal(history[0].response, 'Checked all slices.');
  assert.equal(history[0].status, 'done');
  await request('POST', `/agents/${modeler.id}/modeling-tasks/${second.id}/failed`, { response: 'Needs a decision.' }, 204);
  assert.equal((await request('GET', '/modeling-tasks', undefined, 200))[1].error, 'Needs a decision.');
  await request('POST', `/agents/${other.id}/modeling-tasks/${separate.id}/done`, { response: 'Reviewed the Chapter.' }, 204);
  const contextScope = { type: 'context', contextId: context.id };
  const contextTask = await request('POST', '/modeling-tasks', {
    agentId: other.id, prompt: 'Review this Context', scope: contextScope,
  }, 201);
  assert.equal((await other.event('modeling-task')).id, contextTask.id);
  const contextTarget = await request('GET', `/agents/${other.id}/modeling-tasks/${contextTask.id}/scope`, undefined, 200);
  assert.deepEqual(contextTarget.scope, contextScope);
  assert.equal(contextTarget.label, 'Sales');
});
