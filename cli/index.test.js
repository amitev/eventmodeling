import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('./index.js', import.meta.url));

test('agent --type remains required and rejects invalid values and old flag', () => {
  for (const [args, message] of [
    [[], /--type must be modeler or builder/],
    [['--type', 'invalid'], /--type must be modeler or builder/],
    [['--agent-type', 'modeler'], /Unknown option '--agent-type'/],
  ]) {
    const result = spawnSync(process.execPath, [entry, 'agent', '--model', 'test-model', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.match(result.stderr, /--type <type>/);
  }
});

test('agent --type forwards modeler and builder as agentType', { timeout: 10000 }, async (t) => {
  const received = [];
  const server = http.createServer((req, res) => {
    received.push(new URL(req.url, 'http://localhost'));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('event: welcome\ndata: {"id":"test-session","name":"Test"}\n\nevent: stop\ndata: {}\n\n');
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, 'localhost');
  await once(server, 'listening');
  for (const type of ['modeler', 'builder']) {
    const child = spawn(process.execPath, [entry, 'agent', '--model', 'test-model', '--type', type, '--port', String(server.address().port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let stderr = '';
    child.stdout.resume();
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, stderr);
  }
  assert.deepEqual(received.map((url) => url.searchParams.get('agentType')), ['modeler', 'builder']);
  assert.ok(received.every((url) => url.pathname === '/api/agent/events' && url.searchParams.get('model') === 'test-model'));
});
