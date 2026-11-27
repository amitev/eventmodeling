import { randomInt, randomUUID } from 'node:crypto';
import express from 'express';
import { HttpError } from './http-error.js';
import { createBuildQueue } from './build-queue.js';
import { createModelingTasks, resolveModelingScope } from './modeling-tasks.js';

const COMPOSER_NAMES = ['Mozart', 'Haydn', 'Schubert', 'Strauss', 'Bruckner', 'Mahler'];

export function agentApi(store, rootDir) {
  const router = express.Router();
  const sessions = new Map();
  const queue = createBuildQueue();
  const modelingTasks = createModelingTasks(rootDir);

  function liveSession(id) {
    const session = sessions.get(id);
    if (!session || session.res.destroyed || session.res.writableEnded) {
      throw new HttpError(404, 'CLI disconnected');
    }
    return session;
  }

  function liveBuilder(name) {
    return [...sessions.values()].find((session) => session.agentType === 'builder' &&
      session.name.toLowerCase() === name.toLowerCase() && !session.res.destroyed && !session.res.writableEnded);
  }

  function dispatch(name) {
    const session = liveBuilder(name);
    const task = session && queue.next(session.name);
    if (!task) return;
    const { id, contextId, chapterId, sliceId, sliceName } = task;
    session.res.write(`event: build\ndata: ${JSON.stringify({ id, contextId, chapterId, sliceId, sliceName })}\n\n`);
  }

  function dispatchModeling(name) {
    const session = [...sessions.values()].find((item) => item.agentType === 'modeler' &&
      item.name.toLowerCase() === name.toLowerCase() && !item.res.destroyed && !item.res.writableEnded);
    if (!session || session.res.writableNeedDrain) return;
    const task = modelingTasks.next(session.name);
    if (task) session.res.write(`event: modeling-task\ndata: ${JSON.stringify(task)}\n\n`);
  }

  function liveModeler(id) {
    const session = liveSession(id);
    if (session.agentType !== 'modeler') throw new HttpError(400, 'Only modeling agents can receive modeling tasks');
    return session;
  }

  function text(value, message) {
    if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, message);
    return value.trim();
  }

  router.head('/agent/events', (req, res) => res.set('Allow', 'GET').sendStatus(405));
  router.get('/agent/events', (req, res) => {
    let name;
    if (req.query.name !== undefined) {
      if (typeof req.query.name !== 'string' || !req.query.name.trim()) {
        throw new HttpError(400, 'Agent name must be non-blank text');
      }
      name = req.query.name.trim();
    }
    const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
    if (!model) throw new HttpError(400, 'Agent model is required');
    const agentType = req.query.agentType;
    if (!['modeler', 'builder'].includes(agentType)) {
      throw new HttpError(400, 'Agent type must be modeler or builder');
    }
    const harness = req.query.harness ?? 'claude';
    if (!['claude', 'copilot'].includes(harness)) throw new HttpError(400, 'Harness must be claude or copilot');

    const usedNames = new Set([...sessions.values()].map((session) => session.name.toLowerCase()));
    if (name === undefined) {
      const available = COMPOSER_NAMES.filter((candidate) => !usedNames.has(candidate.toLowerCase()));
      if (!available.length) throw new HttpError(409, 'All composer names are in use. Provide --name with a unique name.');
      name = available[randomInt(available.length)];
    } else if (usedNames.has(name.toLowerCase())) {
      throw new HttpError(409, `Agent name "${name}" is already in use`);
    }

    const id = randomUUID();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const session = { name, model, agentType, harness, res, lastPing: null, nonce: null };
    const ping = () => {
      if (res.writableNeedDrain) return;
      session.nonce = randomUUID();
      res.write(`event: ping\ndata: ${JSON.stringify({ id, nonce: session.nonce })}\n\n`);
    };
    const beat = setInterval(ping, 30000);
    res.once('close', () => {
      clearInterval(beat);
      if (sessions.get(id) === session) {
        sessions.delete(id);
        queue.release(name);
        modelingTasks.release(name);
      }
    });
    sessions.set(id, session);
    res.flushHeaders();
    res.write(`event: welcome\ndata: ${JSON.stringify({ id, name })}\n\n`);
    ping();
    if (agentType === 'builder') dispatch(name);
    else dispatchModeling(name);
  });

  router.get('/agents', (req, res) => {
    const agents = [...sessions].map(([id, { name, model, agentType, harness, lastPing }]) =>
      ({ id, name, model, agentType, harness, lastPing, building: queue.running(name)?.sliceName ?? null }));
    res.set('Cache-Control', 'no-store').json(agents);
  });

  router.post('/agents/:id/ping', (req, res) => {
    const session = liveSession(req.params.id);
    if (!session.nonce || req.body?.nonce !== session.nonce) {
      throw new HttpError(400, 'Invalid or expired heartbeat');
    }
    session.nonce = null;
    session.lastPing = Date.now();
    res.status(204).end();
    if (session.agentType === 'modeler') dispatchModeling(session.name);
  });

  router.post('/agents/:id/run', (req, res) => {
    const { res: stream } = liveSession(req.params.id);
    if (stream.writableNeedDrain) throw new HttpError(503, 'Agent stream is busy. Try again.');
    stream.write('event: run\ndata: {}\n\n');
    res.status(202).end();
  });

  router.delete('/agents/:id', (req, res) => {
    const session = liveSession(req.params.id);
    sessions.delete(req.params.id);
    queue.release(session.name);
    modelingTasks.release(session.name);
    session.res.end('event: stop\ndata: {}\n\n');
    res.status(204).end();
  });

  function finishTask(result) {
    return (req, res) => {
      const session = liveSession(req.params.id);
      const error = result === 'failed'
        ? (typeof req.body?.error === 'string' && req.body.error.trim()) || 'Build failed' : undefined;
      const cost = typeof req.body?.cost === 'number' ? req.body.cost : undefined;
      const currency = typeof req.body?.currency === 'string' ? req.body.currency : undefined;
      const response = typeof req.body?.response === 'string' && req.body.response.trim() ? req.body.response.trim() : undefined;
      const sliceUpdatedAt = req.body?.sliceUpdatedAt;
      if (sliceUpdatedAt !== undefined && (!Number.isSafeInteger(sliceUpdatedAt) || sliceUpdatedAt < 0)) {
        throw new HttpError(400, 'sliceUpdatedAt must be a non-negative safe integer');
      }
      queue.finish(req.params.taskId, session.name, error, cost, currency, response, sliceUpdatedAt);
      res.status(204).end();
      dispatch(session.name);
    };
  }
  router.post('/agents/:id/tasks/:taskId/done', finishTask('done'));
  router.post('/agents/:id/tasks/:taskId/failed', finishTask('failed'));

  router.get('/build-queue', async (req, res) => {
    const tasks = queue.list();
    const sliceTimestamps = tasks.some((task) => ['done', 'failed'].includes(task.status) && task.sliceUpdatedAt !== null)
      ? await store.read((model) => new Map(model.chapters.flatMap((chapter) =>
        chapter.slices.map((slice) => [slice.id, slice.updatedAt]))))
      : new Map();
    res.set('Cache-Control', 'no-store').json(queue.list(sliceTimestamps));
  });

  router.post('/build-queue', (req, res) => {
    const contextId = text(req.body?.contextId, 'Context id is required');
    const chapterId = text(req.body?.chapterId, 'Chapter id is required');
    const sliceId = text(req.body?.sliceId, 'Slice id is required');
    const sliceName = text(req.body?.sliceName, 'Slice name is required');
    const builder = liveBuilder(text(req.body?.builder, 'Builder name is required'));
    if (!builder) throw new HttpError(404, 'Builder not connected');
    const task = queue.add({ contextId, chapterId, sliceId, sliceName, builder: builder.name });
    res.status(201).json(task);
    dispatch(builder.name);
  });

  router.delete('/build-queue/:id', (req, res) => {
    queue.remove(req.params.id);
    res.status(204).end();
  });

  router.get('/modeling-tasks', (req, res) => {
    res.set('Cache-Control', 'no-store').json(modelingTasks.list());
  });

  router.post('/modeling-tasks', async (req, res) => {
    const agentId = text(req.body?.agentId, 'Modeling agent id is required');
    const prompt = text(req.body?.prompt, 'Task prompt is required');
    const target = await store.read((model) => resolveModelingScope(model, req.body?.scope));
    const session = liveModeler(agentId);
    const task = modelingTasks.add({ ...target, prompt, modeler: session.name });
    res.status(201).json(task);
    dispatchModeling(session.name);
  });

  router.get('/agents/:id/modeling-tasks/:taskId/scope', async (req, res) => {
    const session = liveModeler(req.params.id);
    const task = modelingTasks.assigned(req.params.taskId, session.name);
    const target = await store.read((model) => resolveModelingScope(model, task.scope));
    liveModeler(req.params.id);
    modelingTasks.assigned(req.params.taskId, session.name);
    res.set('Cache-Control', 'no-store').json(target);
  });

  for (const result of ['done', 'failed']) {
    router.post(`/agents/:id/modeling-tasks/:taskId/${result}`, (req, res) => {
      const session = liveModeler(req.params.id);
      const response = text(req.body?.response, 'Agent response is required');
      const error = result === 'failed' ? text(req.body?.error ?? response, 'Task error is required') : undefined;
      const cost = typeof req.body?.cost === 'number' && Number.isFinite(req.body.cost) && req.body.cost >= 0
        ? req.body.cost : null;
      const currency = typeof req.body?.currency === 'string' ? req.body.currency : null;
      modelingTasks.finish(req.params.taskId, session.name, response, error, cost, currency);
      res.status(204).end();
      dispatchModeling(session.name);
    });
  }

  return router;
}
