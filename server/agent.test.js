import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runScenario(responses) {
  const script = `
    import timers from 'node:timers/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const waits = [];
    timers.setTimeout = async (ms) => { waits.push(ms); };
    syncBuiltinESMExports();
    const responses = ${JSON.stringify(responses)};
    const logs = [];
    const errors = [];
    console.log = (text) => logs.push(text);
    console.error = (text) => errors.push(text);
    let attempts = 0;
    globalThis.fetch = async () => {
      const next = responses[attempts++];
      if (!next) throw new Error('Connection refused');
      if (next === 'stop' || next === 'disconnect') {
        return new Response(next === 'stop' ? 'event: stop\\ndata: {}\\n\\n' : '', {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return new Response(JSON.stringify({ error: 'Rejected' }), {
        status: next,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const { runAgent } = await import(${JSON.stringify(new URL('./agent.js', import.meta.url).href)});
    await runAgent({ port: 3300, model: 'test', agentType: 'modeler' });
    process.stdout.write(JSON.stringify({ attempts, waits, logs, errors }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  return { status: result.status, ...JSON.parse(result.stdout) };
}

test('agent gives up after ten failed attempts, waiting ten seconds between attempts', () => {
  const result = runScenario([]);
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 10);
  assert.deepEqual(result.waits, Array(9).fill(10000));
  assert.equal(result.logs.length, 0);
  assert.match(result.errors.at(-1), /Giving up after 10 connection attempts/);
});

test('successful connection resets retry budget and intentional stop ends retries', () => {
  const result = runScenario([
    ...Array(9).fill(null), 'disconnect', ...Array(9).fill(null), 'stop',
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.attempts, 20);
  assert.deepEqual(result.waits, Array(19).fill(10000));
  assert.equal(result.logs.filter((line) => line.startsWith('Agent connected')).length, 2);
  assert.equal(result.logs.at(-1), 'Agent stopped from the board.');
});

test('agent retries server errors but does not retry rejected configuration', () => {
  const recovered = runScenario([503, 'stop']);
  assert.equal(recovered.status, 0);
  assert.equal(recovered.attempts, 2);
  assert.deepEqual(recovered.waits, [10000]);

  const rejected = runScenario([409]);
  assert.equal(rejected.status, 1);
  assert.equal(rejected.attempts, 1);
  assert.deepEqual(rejected.waits, []);
  assert.match(rejected.errors[0], /HTTP 409: Rejected/);
});
