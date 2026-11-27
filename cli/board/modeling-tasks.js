import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http-error.js';

const completed = (task) => task.status === 'done' || task.status === 'failed';
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function readTasks(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  let tasks;
  try {
    tasks = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid modeling task history: ${file}`, { cause: error });
  }
  if (!Array.isArray(tasks) || tasks.some((task) =>
    !task || ['id', 'contextId', 'label', 'prompt', 'modeler'].some((key) => typeof task[key] !== 'string' || !task[key].trim()) ||
    !task.scope || !['context', 'chapter', 'slice', 'cell', 'element'].includes(task.scope.type) ||
    !['queued', 'running', 'done', 'failed'].includes(task.status) || !timestamp(task.createdAt) ||
    (task.startedAt !== null && !timestamp(task.startedAt)) ||
    (completed(task) ? !timestamp(task.completedAt) || typeof task.response !== 'string' : task.completedAt !== null) ||
    (task.error !== null && typeof task.error !== 'string') ||
    (task.cost !== null && (typeof task.cost !== 'number' || !Number.isFinite(task.cost) || task.cost < 0)) ||
    (task.currency !== null && typeof task.currency !== 'string')
  ) || new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error(`Invalid modeling task history: ${file}`);
  }
  return tasks.map((task) => completed(task) ? task : { ...task, status: 'queued', startedAt: null });
}

export function resolveModelingScope(model, scope) {
  if (!scope || !['context', 'chapter', 'slice', 'cell', 'element'].includes(scope.type)) {
    throw new HttpError(400, 'Scope type must be context, chapter, slice, cell or element');
  }
  const keys = {
    context: ['type', 'contextId'],
    chapter: ['type', 'chapterId'],
    slice: ['type', 'chapterId', 'sliceId'],
    cell: ['type', 'chapterId', 'sliceId', 'laneId'],
    element: ['type', 'chapterId', 'sliceId', 'laneId', 'elementId'],
  }[scope.type];
  if (Object.keys(scope).some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof scope[key] !== 'string' || !scope[key].trim())) {
    throw new HttpError(400, 'Invalid modeling task scope');
  }
  const normalized = Object.fromEntries(keys.map((key) => [key, scope[key]]));
  if (scope.type === 'context') {
    const context = model.contexts.find((item) => item.id === scope.contextId);
    if (!context) throw new HttpError(404, 'Scope Context not found');
    return { scope: normalized, contextId: context.id, label: context.name };
  }
  const chapter = model.chapters.find((item) => item.id === scope.chapterId);
  if (!chapter) throw new HttpError(404, 'Scope Chapter not found');
  const context = model.contexts.find((item) => item.id === chapter.context);
  let label = `${context.name} / ${chapter.name}`;
  if (scope.type !== 'chapter') {
    const slice = chapter.slices.find((item) => item.id === scope.sliceId);
    if (!slice) throw new HttpError(404, 'Scope slice not found');
    label += ` / ${slice.name}`;
    if (scope.type === 'slice') return { scope: normalized, contextId: context.id, label };
    const lane = chapter.lanes.find((item) => item.id === scope.laneId);
    if (!lane) throw new HttpError(404, 'Scope Cell not found');
    if (scope.type === 'cell' && slice.elements.some((item) => item.lane === lane.id)) {
      throw new HttpError(409, 'Cell must be empty for a modeling task; select an element instead');
    }
    label += ` / ${lane.name || lane.type}`;
    if (scope.type === 'element') {
      const element = slice.elements.find((item) => item.id === scope.elementId && item.lane === lane.id);
      if (!element) throw new HttpError(404, 'Scope element not found in Cell');
      label += ` / ${element.name || element.type}`;
    }
  }
  return { scope: normalized, contextId: context.id, label };
}

export function createModelingTasks(rootDir) {
  const directory = path.join(rootDir, '.em', '.tasks');
  const file = path.join(directory, 'modeling.json');
  let tasks = readTasks(file);
  const commit = (next) => {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.modeling-${randomUUID()}.tmp`);
    try {
      // Unfinished work restarts queued; dispatch and disconnect need no disk writes.
      const stored = next.map((task) => completed(task) ? task : { ...task, status: 'queued', startedAt: null });
      fs.writeFileSync(temporary, `${JSON.stringify(stored, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    tasks = next;
  };
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const copy = (task) => ({ ...task, scope: { ...task.scope } });
  const find = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new HttpError(404, 'Modeling task not found');
    return task;
  };
  const running = (name) => tasks.find((task) => task.status === 'running' && same(task.modeler, name));
  const assigned = (id, name) => {
    const task = find(id);
    if (task.status !== 'running' || !same(task.modeler, name)) {
      throw new HttpError(409, 'Modeling task is not running on this agent');
    }
    return task;
  };
  return {
    list: () => tasks.map(copy),
    add({ scope, contextId, label, prompt, modeler }) {
      const task = {
        id: randomUUID(), scope: { ...scope }, contextId, label, prompt, modeler,
        createdAt: new Date().toISOString(),
        status: 'queued', response: null, error: null, startedAt: null, completedAt: null, cost: null, currency: null,
      };
      commit([task, ...tasks]);
      return copy(task);
    },
    next(name) {
      if (running(name)) return null;
      const task = tasks.findLast((item) => item.status === 'queued' && same(item.modeler, name));
      if (!task) return null;
      task.status = 'running';
      task.startedAt = new Date().toISOString();
      return copy(task);
    },
    assigned: (id, name) => copy(assigned(id, name)),
    finish(id, name, response, error, cost = null, currency = null) {
      const finished = {
        ...assigned(id, name),
        status: error === undefined ? 'done' : 'failed',
        response, error: error ?? null, cost, currency, completedAt: new Date().toISOString(),
      };
      const retained = new Set([finished, ...tasks.filter(completed)]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, 10).map((task) => task.id));
      commit(tasks.map((task) => task.id === id ? finished : task)
        .filter((task) => !completed(task) || retained.has(task.id)));
    },
    release(name) {
      const task = running(name);
      if (task) Object.assign(task, { status: 'queued', startedAt: null });
    },
  };
}
