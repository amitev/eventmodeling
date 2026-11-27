import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http-error.js';

const completed = (task) => task.status === 'done' || task.status === 'failed';
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const current = (task) => task.turns.at(-1);
const validTurn = (turn) => turn && typeof turn.id === 'string' &&
  Number.isSafeInteger(turn.sequence) && turn.sequence > 0 &&
  typeof turn.prompt === 'string' && turn.prompt.trim() &&
  ['queued', 'running', 'done', 'failed'].includes(turn.status) && timestamp(turn.createdAt) &&
  (turn.startedAt === null || timestamp(turn.startedAt)) &&
  (turn.response === null || typeof turn.response === 'string') &&
  (turn.error === null || typeof turn.error === 'string') &&
  (completed(turn)
    ? timestamp(turn.completedAt) && (turn.status === 'done' ? turn.response : turn.response || turn.error)
    : turn.completedAt === null) &&
  (turn.cost === null || typeof turn.cost === 'number' && Number.isFinite(turn.cost) && turn.cost >= 0) &&
  (turn.currency === null || typeof turn.currency === 'string');

function copy(task) {
  const clone = structuredClone(task);
  const { id: turnId, sequence, createdAt, ...state } = current(clone);
  return { ...clone, ...state, turnId };
}

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
  if (Array.isArray(tasks)) {
    tasks = tasks.map((task, index) => {
      if (!task || typeof task !== 'object' || 'turns' in task) return task;
      const { id, scope, contextId, label, modeler, createdAt, harness = null, ...state } = task;
      return {
        id, scope, contextId, label, modeler, createdAt, harness,
        turns: [{ id, sequence: tasks.length - index, createdAt, ...state }],
      };
    });
  }
  if (!Array.isArray(tasks) || tasks.some((task) =>
    !task || ['id', 'contextId', 'label', 'modeler'].some((key) => typeof task[key] !== 'string' || !task[key].trim()) ||
    !task.scope || !['context', 'chapter', 'slice', 'cell', 'element'].includes(task.scope.type) ||
    !timestamp(task.createdAt) || ![null, 'claude'].includes(task.harness) ||
    !Array.isArray(task.turns) || !task.turns.length || task.turns.some((turn, index) =>
      !validTurn(turn) || index < task.turns.length - 1 && !completed(turn)) ||
    new Set(task.turns.map((turn) => turn.id)).size !== task.turns.length
  ) || new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error(`Invalid modeling task history: ${file}`);
  }
  return tasks.map((task) => ({
    ...task,
    turns: task.turns.map((turn) => completed(turn) ? turn : { ...turn, status: 'queued', startedAt: null }),
  }));
}

export function resolveModelingScope(model, scope, { followUp = false } = {}) {
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
    if (scope.type === 'cell' && !followUp && slice.elements.some((item) => item.lane === lane.id)) {
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
  let sequence = tasks.reduce((maximum, task) =>
    task.turns.reduce((value, turn) => Math.max(value, turn.sequence), maximum), 0);
  const newTurn = (id, prompt) => ({
    id, prompt, sequence: ++sequence, createdAt: new Date().toISOString(),
    status: 'queued', response: null, error: null, startedAt: null, completedAt: null, cost: null, currency: null,
  });
  const commit = (next) => {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.modeling-${randomUUID()}.tmp`);
    try {
      // Unfinished work restarts queued; dispatch and disconnect need no disk writes.
      const stored = next.map((task) => ({
        ...task,
        turns: task.turns.map((turn) => completed(turn) ? turn : { ...turn, status: 'queued', startedAt: null }),
      }));
      fs.writeFileSync(temporary, `${JSON.stringify(stored, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    tasks = next;
  };
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const find = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new HttpError(404, 'Modeling task not found');
    return task;
  };
  const running = (name) => tasks.find((task) => current(task).status === 'running' && same(task.modeler, name));
  const assigned = (id, name, turnId = id) => {
    const task = find(id);
    if (current(task).status !== 'running' || current(task).id !== turnId || !same(task.modeler, name)) {
      throw new HttpError(409, 'Modeling task is not running on this agent');
    }
    return task;
  };
  return {
    list: () => tasks.map(copy),
    get: (id) => copy(find(id)),
    add({ scope, contextId, label, prompt, modeler, harness = 'claude' }) {
      const id = randomUUID();
      const turn = newTurn(id, prompt);
      const task = {
        id, scope: { ...scope }, contextId, label, modeler, harness,
        createdAt: turn.createdAt, turns: [turn],
      };
      commit([task, ...tasks]);
      return copy(task);
    },
    reply(id, prompt) {
      const task = find(id);
      if (!completed(current(task))) throw new HttpError(409, 'Wait for the current reply to finish');
      const updated = { ...task, harness: 'claude', turns: [...task.turns, newTurn(randomUUID(), prompt)] };
      commit(tasks.map((item) => item.id === id ? updated : item));
      return copy(updated);
    },
    next(name) {
      if (running(name)) return null;
      const task = tasks.filter((item) => current(item).status === 'queued' && same(item.modeler, name))
        .sort((a, b) => current(a).sequence - current(b).sequence)[0];
      if (!task) return null;
      current(task).status = 'running';
      current(task).startedAt = new Date().toISOString();
      return copy(task);
    },
    assigned: (id, name, turnId) => copy(assigned(id, name, turnId)),
    finish(id, name, status, response, error = null, cost = null, currency = null, turnId = id) {
      const task = assigned(id, name, turnId);
      const finished = {
        ...current(task),
        status, response, error: error === response ? null : error,
        cost, currency, completedAt: new Date().toISOString(),
      };
      const updated = { ...task, turns: [...task.turns.slice(0, -1), finished] };
      const retained = new Set([updated, ...tasks.filter((item) => item.id !== id && completed(current(item)))]
        .sort((a, b) => current(b).completedAt.localeCompare(current(a).completedAt))
        .slice(0, 10).map((item) => item.id));
      commit(tasks.map((item) => item.id === id ? updated : item)
        .filter((item) => !completed(current(item)) || retained.has(item.id)));
    },
    release(name) {
      const task = running(name);
      if (task) Object.assign(current(task), { status: 'queued', startedAt: null });
    },
  };
}
