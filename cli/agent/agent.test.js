import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBuildResponse } from './agent.js';
import { claude } from './harnesses/claude.js';
import { copilot } from './harnesses/copilot.js';

test('build response maps success and failure to queue outcomes', () => {
  const success = JSON.stringify({ success: true, response: 'Slice implemented.' });
  const failure = JSON.stringify({ success: false, response: 'Missing a required decision.' });

  assert.deepEqual(parseBuildResponse(claude, JSON.stringify({ result: success })), { status: 'done' });
  assert.deepEqual(parseBuildResponse(claude, JSON.stringify({ result: failure })), {
    status: 'failed',
    error: 'Missing a required decision.',
  });
});

test('Copilot JSONL assistant deltas are parsed as the build response', () => {
  const response = JSON.stringify({ success: false, response: 'Could not finish the slice.' });
  const output = [
    { type: 'assistant.message_delta', data: { deltaContent: response.slice(0, 20) } },
    { type: 'assistant.message_delta', data: { deltaContent: response.slice(20) } },
  ].map((record) => JSON.stringify(record)).join('\n');

  assert.deepEqual(parseBuildResponse(copilot, output), {
    status: 'failed',
    error: 'Could not finish the slice.',
  });
});

test('invalid build response is rejected instead of reported done', () => {
  assert.throws(
    () => parseBuildResponse(claude, JSON.stringify({ result: '{"success":true,"response":"Done","extra":1}' })),
    /expected only "success" and "response" fields/,
  );
  assert.throws(
    () => parseBuildResponse(claude, JSON.stringify({ result: '{"success":"true","response":"Done"}' })),
    /"success" must be a boolean/,
  );
});
