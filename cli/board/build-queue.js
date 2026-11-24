import { randomUUID } from 'node:crypto';
import { HttpError } from './http-error.js';

// In-memory FIFO of slice builds. A slice has at most one task; a builder runs one task at a time.
// Done tasks stay as the slice's last result until the slice is added again.
export function createBuildQueue() {
  const tasks = [];
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const copy = (task) => ({ ...task });

  function find(id) {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) throw new HttpError(404, 'Build task not found');
    return task;
  }

  return {
    list: () => tasks.map(copy),

    // A done or failed task is replaced: the slice is built again, at the end of the queue.
    add({ contextId, chapterId, sliceId, sliceName, builder }) {
      const existing = tasks.find((task) => task.sliceId === sliceId);
      if (existing && !['done', 'failed'].includes(existing.status)) {
        throw new HttpError(409, `Slice "${sliceName}" is already in the build queue`);
      }
      if (existing) tasks.splice(tasks.indexOf(existing), 1);
      const task = { id: randomUUID(), contextId, chapterId, sliceId, sliceName, builder, status: 'queued', error: null, response: null, startedAt: null, completedAt: null, cost: null, currency: null };
      tasks.push(task);
      return copy(task);
    },

    remove(id) {
      const task = find(id);
      if (!['queued', 'failed'].includes(task.status)) throw new HttpError(409, 'Only queued or failed build tasks can be removed');
      tasks.splice(tasks.indexOf(task), 1);
    },

    running: (builder) => tasks.find((task) => task.status === 'running' && same(task.builder, builder)),

    // Starts and returns the builder's next queued task, unless it already runs one.
    next(builder) {
      if (this.running(builder)) return null;
      const task = tasks.find((candidate) => candidate.status === 'queued' && same(candidate.builder, builder));
      if (!task) return null;
      task.status = 'running';
      task.startedAt = new Date().toISOString();
      return copy(task);
    },

    finish(id, builder, error, cost, currency, response) {
      const task = find(id);
      if (task.status !== 'running' || !same(task.builder, builder)) {
        throw new HttpError(409, 'Build task is not running on this agent');
      }
      const completedAt = new Date().toISOString();
      Object.assign(task, error === undefined ? { status: 'done', completedAt } : { status: 'failed', error, completedAt });
      task.response = response ?? null;
      if (cost !== undefined && cost !== null) {
        task.cost = cost;
      }
      if (currency !== undefined && currency !== null) {
        task.currency = currency;
      }
      
      // If task failed, block and remove all other queued tasks from the same context
      if (error !== undefined) {
        const contextId = task.contextId;
        const toRemove = tasks.filter(
          (t) => t.contextId === contextId && t.id !== id && t.status === 'queued'
        );
        toRemove.forEach((t) => {
          t.status = 'blocked';
          t.completedAt = completedAt;
          t.error = `Blocked: another slice in this context failed`;
        });
        // Remove blocked tasks from the queue
        toRemove.forEach((t) => {
          tasks.splice(tasks.indexOf(t), 1);
        });
      }
    },

    release(builder) {
      const task = this.running(builder);
      if (task) task.status = 'queued';
    },
  };
}
