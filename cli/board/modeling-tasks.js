import { randomUUID } from 'node:crypto';
import { HttpError } from './http-error.js';

export function resolveModelingScope(model, scope) {
  if (!scope || !['chapter', 'slice', 'cell', 'element'].includes(scope.type)) {
    throw new HttpError(400, 'Scope type must be chapter, slice, cell or element');
  }
  const keys = {
    chapter: ['type', 'chapterId'],
    slice: ['type', 'chapterId', 'sliceId'],
    cell: ['type', 'chapterId', 'sliceId', 'laneId'],
    element: ['type', 'chapterId', 'sliceId', 'laneId', 'elementId'],
  }[scope.type];
  if (Object.keys(scope).some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof scope[key] !== 'string' || !scope[key].trim())) {
    throw new HttpError(400, 'Invalid modeling task scope');
  }
  const chapter = model.chapters.find((item) => item.id === scope.chapterId);
  if (!chapter) throw new HttpError(404, 'Scope Chapter not found');
  const context = model.contexts.find((item) => item.id === chapter.context);
  const normalized = Object.fromEntries(keys.map((key) => [key, scope[key]]));
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

export function createModelingTasks() {
  const tasks = [];
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
        status: 'queued', response: null, error: null, startedAt: null, completedAt: null, cost: null, currency: null,
      };
      tasks.push(task);
      return copy(task);
    },
    next(name) {
      if (running(name)) return null;
      const task = tasks.find((item) => item.status === 'queued' && same(item.modeler, name));
      if (!task) return null;
      task.status = 'running';
      task.startedAt = new Date().toISOString();
      return copy(task);
    },
    assigned: (id, name) => copy(assigned(id, name)),
    finish(id, name, response, error, cost = null, currency = null) {
      Object.assign(assigned(id, name), {
        status: error === undefined ? 'done' : 'failed',
        response, error: error ?? null, cost, currency, completedAt: new Date().toISOString(),
      });
    },
    release(name) {
      const task = running(name);
      if (task) Object.assign(task, { status: 'queued', startedAt: null });
    },
  };
}
