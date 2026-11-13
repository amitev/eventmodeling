import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./check.mjs', import.meta.url));

function backwardFindings(chapter) {
  const responses = {
    '/api/model/outline': [{ id: 'CTX001', name: 'Orders', chapters: [{ id: chapter.id }] }],
    [`/api/model/chapters/${chapter.id}`]: chapter,
    '/api/model/contexts/CTX001/screens': [],
  };
  const preload = `data:text/javascript,${encodeURIComponent(`
    const responses = ${JSON.stringify(responses)};
    globalThis.fetch = async (url) => {
      const path = new URL(url).pathname;
      if (!Object.hasOwn(responses, path)) throw new Error('Unexpected request: ' + path);
      return Response.json(responses[path]);
    };
  `)}`;
  const result = spawnSync(process.execPath, ['--import', preload, checker], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\n').filter((line) => line.startsWith('[RULE]') && line.includes('arrow goes backward'));
}

for (const { name, prefix, screen, expected } of [
  { name: 'allows a later Event to update the first-slice opening view', prefix: false, screen: true, expected: 0 },
  { name: 'rejects feedback to the first state-read slice when it is not slice zero', prefix: true, screen: true, expected: 1 },
  { name: 'rejects opening-view feedback when the first slice has no Screen', prefix: false, screen: false, expected: 1 },
]) {
  test(name, () => {
    const chapter = {
      id: 'CH0001',
      name: 'Orders',
      lanes: [
        { id: 'ACT001', type: 'ACTOR' },
        { id: 'INT001', type: 'INTERACTION' },
        { id: 'EVT001', type: 'EVENT' },
      ],
      slices: [
        ...(prefix ? [{ id: 'PRE001', name: 'Earlier slice', type: null, elements: [] }] : []),
        {
          id: 'VIEW01',
          name: 'Orders',
          type: 'STATE_READ',
          elements: [
            { id: 'RM0001', type: 'READ_MODEL', name: 'Orders', lane: 'INT001', connectsTo: screen ? ['SCR001'] : [] },
            ...(screen ? [{ id: 'SCR001', type: 'SCREEN', name: 'Orders', lane: 'ACT001', connectsTo: [] }] : []),
          ],
        },
        {
          id: 'WRITE1',
          name: 'Place Order',
          type: 'STATE_CHANGE',
          elements: [
            { id: 'CMD001', type: 'COMMAND', name: 'Place Order', lane: 'INT001', connectsTo: ['EV0001'] },
            { id: 'EV0001', type: 'EVENT', name: 'Order Placed', lane: 'EVT001', connectsTo: ['RM0001'] },
          ],
        },
      ],
    };
    const findings = backwardFindings(chapter);
    assert.equal(findings.length, expected, findings.join('\n'));
    if (expected) assert.match(findings[0], /arrow goes backward to "Orders" in an earlier slice \(Orders\)/);
  });
}
