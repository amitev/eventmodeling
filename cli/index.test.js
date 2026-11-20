import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('./index.js', import.meta.url));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options });
  assert.ifError(result.error);
  return result;
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('no command and help show usage without starting the board', () => {
  for (const args of [[], ['--help'], ['-h'], ['board', '--help'], ['init', '-h'], ['agent', '-h']]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: em-cli/);
    assert.doesNotMatch(result.stdout, /Event Modeling Board: http/);
    if (args[0] === 'board') {
      assert.match(result.stdout, /--port/);
      assert.doesNotMatch(result.stdout, /--target/);
    } else if (args[0] === 'init') {
      assert.match(result.stdout, /--target/);
      assert.doesNotMatch(result.stdout, /--port/);
    } else if (args[0] === 'agent') {
      assert.match(result.stdout, /--port/);
      assert.match(result.stdout, /--name/);
      assert.match(result.stdout, /--model/);
      assert.match(result.stdout, /--agent-type/);
      assert.match(result.stdout, /--harness/);
      assert.doesNotMatch(result.stdout, /--dev|--target/);
    } else {
      assert.match(result.stdout, /\bagent\b/);
    }
  }
});

test('rejects legacy syntax, unknown commands and options outside their command', () => {
  for (const args of [
    ['--init'], ['--port', '8080'], ['unknown'],
    ['board', '--target', 'skills'], ['init', '--port', '8080'],
    ['init', '--host', 'localhost'], ['init', '--dev'], ['board', '--init'],
    ['board', 'init'], ['board', '--unknown'], ['board', '--port', '65536'],
    ['board', '--port', 'abc'], ['init', '--target'], ['init', '--target='],
    ['agent', '--name', 'frontend', '--port', '0'], ['agent', '--dev'], ['agent', '--target', 'skills'],
    ['agent'], ['agent', '--name=  ', '--model', 'test-model'],
    ['agent', '--name', 'frontend'], ['agent', '--name', 'frontend', '--model=  '],
    ['board', '--name', 'frontend'], ['init', '--model', 'test-model'],
    ['agent', '--model', 'test-model'],
    ['agent', '--model', 'test-model', '--agent-type', 'unknown'],
    ['agent', '--model', 'test-model', '--agent-type='],
    ['board', '--agent-type', 'modeler'],
    ['agent', '--model', 'test-model', '--agent-type', 'modeler', '--harness', 'other'],
    ['agent', '--model', 'test-model', '--agent-type', 'modeler', '--harness='],
    ['board', '--harness', 'copilot'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Usage: em-cli/);
  }
});

test('live CLI sessions acknowledge pings and stop independently', { timeout: 15000 }, async (t) => {
  const { createServer } = await import('./board/app.js');
  const server = createServer({ publicDir: null, rootDir: tempDir(t) });
  server.listen(0, 'localhost');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });

  const base = `http://localhost:${server.address().port}/api`;
  async function waitForAgents(count) {
    while (!t.signal.aborted) {
      const response = await fetch(`${base}/agents`, { signal: t.signal });
      assert.equal(response.status, 200);
      const agents = await response.json();
      if (agents.length === count && agents.every(({ lastPing }) => Number.isFinite(lastPing))) return agents;
      await delay(20, undefined, { signal: t.signal });
    }
    t.signal.throwIfAborted();
  }
  const preload = `data:text/javascript,${encodeURIComponent(`
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const spawn = childProcess.spawn;
    childProcess.spawn = (command, args, options) => {
      if (!['claude', 'copilot'].includes(command)) throw new Error('Unexpected child command: ' + command);
      if (args[3] === 'model-b') {
        return spawn(process.execPath, ['-e', 'console.error("Harness test failure"); process.exit(7)'], options);
      }
      const script = 'setTimeout(() => console.log(' +
        JSON.stringify(JSON.stringify({ command, args, shell: options.shell ?? false })) + '), 100)';
      return spawn(process.execPath, ['-e', script], options);
    };
    syncBuiltinESMExports();
  `)}`;
  function startAgent(model, name = 'Shared name', agentType = 'modeler', harness) {
    const child = spawn(process.execPath, [
      '--import', preload, cli, 'agent', ...(name === null ? [] : ['--name', name]), '--model', model, '--agent-type', agentType,
      ...(harness === undefined ? [] : ['--harness', harness]),
    ], {
      env: { ...process.env, PORT: String(server.address().port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const closed = once(child, 'close');
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      return closed;
    });
    const output = { text: '', errors: '' };
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output.text += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { output.errors += chunk; });
    return { child, closed, output };
  }
  const missingModel = await fetch(`${base}/agent/events?name=frontend`, { signal: t.signal });
  assert.equal(missingModel.status, 400);
  assert.deepEqual(await missingModel.json(), { error: 'Agent model is required' });

  const startedAt = Date.now();
  const first = startAgent(' vendor/model+A ');
  const [firstSession] = await waitForAgents(1);
  const { id: firstId, lastPing: firstPing } = firstSession;
  assert.ok(firstPing >= startedAt && firstPing <= Date.now());
  assert.deepEqual(firstSession, {
    id: firstId, name: 'Shared name', model: 'vendor/model+A', agentType: 'modeler', harness: 'claude', lastPing: firstPing,
  });
  const duplicate = startAgent('model-b', ' shared NAME ');
  assert.deepEqual(await duplicate.closed, [1, null]);
  assert.equal(duplicate.output.text, '');
  assert.match(duplicate.output.errors, /HTTP 409: Agent name "shared NAME" is already in use/);
  const second = startAgent('model-b', 'Second name', 'builder', 'copilot');
  const sessions = await waitForAgents(2);
  const { id: secondId, lastPing: secondPing } = sessions[1];
  const secondSession = {
    id: secondId, name: 'Second name', model: 'model-b', agentType: 'builder', harness: 'copilot', lastPing: secondPing,
  };
  assert.deepEqual(sessions, [firstSession, secondSession]);
  assert.notEqual(firstId, secondId);

  const removedRoute = await fetch(`${base}/agents/${firstId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Old send route' }),
    signal: t.signal,
  });
  assert.equal(removedRoute.status, 404);
  assert.deepEqual(await removedRoute.json(), { error: 'Not found' });

  const run = await fetch(`${base}/agents/${firstId}/run`, { method: 'POST', signal: t.signal });
  assert.equal(run.status, 202);
  while (!first.output.text.includes('"command":"claude"')) {
    assert.equal(first.child.exitCode, null, first.output.errors);
    await delay(20, undefined, { signal: t.signal });
  }
  const invocation = JSON.parse(first.output.text.trim().split(/\r?\n/)[1]);
  assert.deepEqual(invocation, {
    command: 'claude',
    args: ['-p', 'What model are you', '--model', 'vendor/model+A', '--output-format', 'json'],
    shell: false,
  });
  assert.equal(second.output.text.trim(), `Agent connected to http://localhost:${server.address().port}.`);

  const failedRun = await fetch(`${base}/agents/${secondId}/run`, { method: 'POST', signal: t.signal });
  assert.equal(failedRun.status, 202);
  while (!second.output.errors.includes('Copilot exited with code 7.')) {
    assert.equal(second.child.exitCode, null, second.output.errors);
    await delay(20, undefined, { signal: t.signal });
  }
  assert.match(second.output.errors, /Harness test failure/);

  const stop = await fetch(`${base}/agents/${firstId}`, { method: 'DELETE', signal: t.signal });
  assert.equal(stop.status, 204);
  assert.deepEqual(await first.closed, [0, null], first.output.errors);
  const connectedMessage = `Agent connected to http://localhost:${server.address().port}.`;
  assert.deepEqual(first.output.text.trim().split(/\r?\n/), [
    connectedMessage, JSON.stringify(invocation), 'Agent stopped from the board.',
  ]);
  assert.equal(first.output.errors, '');
  assert.deepEqual(await waitForAgents(1), [secondSession]);
  const disconnectedRun = await fetch(`${base}/agents/${firstId}/run`, { method: 'POST', signal: t.signal });
  assert.equal(disconnectedRun.status, 404);
  await disconnectedRun.body.cancel();

  const automatic = startAgent('model-c', null, 'modeler', 'copilot');
  const [, automaticSession] = await waitForAgents(2);
  assert.ok([
    'Mozart', 'Haydn', 'Schubert', 'Strauss', 'Bruckner', 'Mahler',
  ].includes(automaticSession.name), `Unexpected composer: ${automaticSession.name}`);
  assert.equal(automaticSession.model, 'model-c');
  assert.equal(automaticSession.harness, 'copilot');
  const copilotRun = await fetch(`${base}/agents/${automaticSession.id}/run`, { method: 'POST', signal: t.signal });
  assert.equal(copilotRun.status, 202);
  while (!automatic.output.text.includes('"command":"copilot"')) {
    assert.equal(automatic.child.exitCode, null, automatic.output.errors);
    await delay(20, undefined, { signal: t.signal });
  }
  assert.deepEqual(JSON.parse(automatic.output.text.trim().split(/\r?\n/)[1]), {
    command: 'copilot',
    args: ['-p', 'What model are you', '--model', 'model-c', '--output-format', 'json'],
    shell: false,
  });
  const stopAutomatic = await fetch(`${base}/agents/${automaticSession.id}`, { method: 'DELETE', signal: t.signal });
  assert.equal(stopAutomatic.status, 204);
  assert.deepEqual(await automatic.closed, [0, null], automatic.output.errors);

  const stopSecond = await fetch(`${base}/agents/${secondId}`, { method: 'DELETE', signal: t.signal });
  assert.equal(stopSecond.status, 204);
  const [code] = await second.closed;
  assert.equal(code, 0, second.output.errors);
  assert.deepEqual(second.output.text.trim().split(/\r?\n/), [
    connectedMessage, 'Agent stopped from the board.',
  ]);
});

test('automatic agent names are unique, exhaust the pool and become reusable after stop', { timeout: 10000 }, async (t) => {
  const { createServer } = await import('./board/app.js');
  const server = createServer({ publicDir: null, rootDir: tempDir(t) });
  server.listen(0, 'localhost');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const base = `http://localhost:${server.address().port}/api`;
  for (const query of ['harness=other', 'harness=', 'harness=claude&harness=copilot']) {
    const invalid = await fetch(`${base}/agent/events?model=test&agentType=modeler&${query}`, { signal: t.signal });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Harness must be claude or copilot' });
  }
  for (const query of ['', '&agentType=unknown', '&agentType=modeler&agentType=builder']) {
    const invalid = await fetch(`${base}/agent/events?model=test${query}`, { signal: t.signal });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Agent type must be modeler or builder' });
  }
  const streams = await Promise.all(Array.from({ length: 6 }, () =>
    fetch(`${base}/agent/events?model=test&agentType=modeler`, { signal: t.signal })));
  for (const stream of streams) {
    assert.equal(stream.status, 200);
    t.after(() => stream.body.cancel());
  }
  const list = await fetch(`${base}/agents`, { signal: t.signal });
  const agents = await list.json();
  assert.deepEqual(agents.map(({ name }) => name).sort(),
    ['Bruckner', 'Haydn', 'Mahler', 'Mozart', 'Schubert', 'Strauss']);

  const exhausted = await fetch(`${base}/agent/events?model=test&agentType=builder`, { signal: t.signal });
  assert.equal(exhausted.status, 409);
  assert.match((await exhausted.json()).error, /All composer names are in use/);
  const stopped = await fetch(`${base}/agents/${agents[0].id}`, { method: 'DELETE', signal: t.signal });
  assert.equal(stopped.status, 204);
  const replacement = await fetch(`${base}/agent/events?model=test&agentType=builder`, { signal: t.signal });
  t.after(() => replacement.body.cancel());
  assert.equal(replacement.status, 200);
  const updated = await fetch(`${base}/agents`, { signal: t.signal });
  const replacementSession = (await updated.json()).at(-1);
  assert.equal(replacementSession.name, agents[0].name);
  assert.notEqual(replacementSession.id, agents[0].id);
});

test('init installs skills in its default or custom target without starting a server', (t) => {
  const cwd = tempDir(t);
  for (const args of [[], ['--target', 'custom-skills']]) {
    const result = run(['init', ...args], { cwd, env: { ...process.env, PORT: 'invalid' } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Installed \d+ skill entries/);
    assert.doesNotMatch(result.stdout, /Event Modeling Board: http/);
    const target = args.length ? 'custom-skills' : path.join('.claude', 'skills');
    assert.ok(fs.existsSync(path.join(cwd, target, 'em-board-api.md')));
    assert.ok(fs.existsSync(path.join(cwd, target, '.em-cli.json')));
    assert.ok(fs.existsSync(path.join(cwd, '.event-modeling')));
  }
});

for (const [dev, host] of [[false, '127.0.0.1'], [true, '127.0.0.1'], [false, '0.0.0.0']]) {
  test(`board serves ${dev ? 'API only' : 'the built board'} on ${host} despite a missing browser`, { timeout: 15000 }, async (t) => {
    const cwd = tempDir(t);
    const browserLog = path.join(cwd, 'browser.json');
    const preload = `data:text/javascript,${encodeURIComponent(`
      import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import { EventEmitter } from 'node:events';
      import { writeFileSync } from 'node:fs';
      childProcess.spawn = (command, args, options) => {
        writeFileSync(${JSON.stringify(browserLog)}, JSON.stringify({ command, args, options }));
        const child = new EventEmitter();
        child.unref = () => {};
        queueMicrotask(() => child.emit('error', new Error('No browser available')));
        return child;
      };
      syncBuiltinESMExports();
    `)}`;
    const child = spawn(process.execPath, [
      '--import', preload, cli, 'board', '--host', host,
      ...(dev ? ['--dev'] : ['-p', '0']),
    ], { cwd, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    });
    let errors = '';
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`CLI startup timed out: ${errors}`)), 10000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`CLI exited ${code}: ${errors}`));
      });
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/Event Modeling Board: http:\/\/[^:\s]+:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
    });
    const revision = await fetch(`${url}/api/model/revision`);
    assert.equal(revision.status, 200);
    assert.equal(typeof (await revision.json()).revision, 'string');
    const board = await fetch(url);
    assert.equal(board.status, dev ? 404 : 200);
    if (!dev) assert.match(await board.text(), /<html/);
    assert.equal(errors, '');
    if (dev) {
      assert.equal(fs.existsSync(browserLog), false);
    } else {
      const browser = JSON.parse(fs.readFileSync(browserLog, 'utf8'));
      const browserUrl = host === '0.0.0.0' ? url.replace('127.0.0.1', 'localhost') : url;
      assert.equal(browser.command, process.platform === 'win32' ? 'rundll32.exe'
        : process.platform === 'darwin' ? 'open' : 'xdg-open');
      assert.deepEqual(browser.args, process.platform === 'win32'
        ? ['url.dll,FileProtocolHandler', browserUrl] : [browserUrl]);
      assert.equal(browser.options.stdio, 'ignore');
      assert.equal(browser.options.detached, true);
    }
  });
}
