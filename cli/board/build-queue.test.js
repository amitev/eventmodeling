import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuildQueue } from './build-queue.js';

const slice = { contextId: 'context', chapterId: 'chapter', sliceId: 'slice', sliceName: 'Place Order', builder: 'Builder' };

for (const status of ['done', 'failed']) {
  test(`changed ${status} builds retain their timestamp, outcome and log`, () => {
    const queue = createBuildQueue();
    const task = queue.add(slice);
    queue.next(slice.builder);
    const error = status === 'failed' ? 'Missing contract' : undefined;
    queue.finish(task.id, slice.builder, error, 0.01234, 'USD', 'Build explanation', 100);
    const [finished] = queue.list(new Map([[slice.sliceId, 100]]));
    assert.equal(finished.status, status);
    const [changed] = queue.list(new Map([[slice.sliceId, 101]]));
    assert.deepEqual(changed, { ...finished, status: 'changed', buildStatus: status });
    assert.equal(changed.sliceUpdatedAt, 100);
    assert.equal(changed.response, 'Build explanation');
    assert.deepEqual(queue.list(), [finished]);
    if (status === 'failed') {
      queue.remove(task.id);
      assert.deepEqual(queue.list(), []);
    } else {
      const rebuilt = queue.add(slice);
      assert.equal(rebuilt.status, 'queued');
      assert.equal(rebuilt.sliceUpdatedAt, null);
      assert.notEqual(rebuilt.id, task.id);
    }
  });
}

test('only completed builds with a known input timestamp are marked changed', () => {
  const queue = createBuildQueue();
  const task = queue.add(slice);
  const timestamps = new Map([[slice.sliceId, 101]]);
  assert.equal(queue.list(timestamps)[0].status, 'queued');
  queue.next(slice.builder);
  assert.equal(queue.list(timestamps)[0].status, 'running');
  queue.finish(task.id, slice.builder, 'Could not fetch definition');
  assert.equal(queue.list(timestamps)[0].status, 'failed');
  assert.equal(queue.list(timestamps)[0].sliceUpdatedAt, null);
});
