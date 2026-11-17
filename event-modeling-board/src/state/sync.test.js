import assert from 'node:assert/strict';
import test from 'node:test';
import { createRevisionSync } from './sync.js';

test('a change during a pull triggers a follow-up pull without a new notification', async () => {
  let known;
  let pulls = 0;
  const first = Promise.withResolvers();
  const second = Promise.withResolvers();
  const sync = createRevisionSync((revision) => revision === known, async () => {
    pulls += 1;
    if (pulls === 1) known = await first.promise;
    else {
      known = 'updated';
      second.resolve();
    }
  });

  const opening = sync.notify('initial');
  sync.notify('updated');
  assert.equal(pulls, 1);
  first.resolve('initial');
  await opening;
  await second.promise;
  assert.equal(known, 'updated');
});

test('a push ignores its own queued revision but pulls for a newer external one', async () => {
  const owned = new Set();
  let pulls = 0;
  const sync = createRevisionSync((revision) => owned.has(revision), () => { pulls += 1; });

  await sync.run(async () => {
    sync.notify('own-first');
    owned.add('own-first');
  });
  assert.equal(pulls, 0);

  await sync.run(async () => {
    sync.notify('own-second');
    sync.notify('external');
    owned.add('own-second');
  });
  assert.equal(pulls, 1);
});
