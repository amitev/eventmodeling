import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { installSkills } from './init.js';

const entry = fileURLToPath(new URL('./index.js', import.meta.url));

test('init ignores temporary folders without overwriting or duplicating existing entries', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em-init-ignore-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'skill.txt'), 'test');
  const cases = [
    [null, '.em/.slices\n.em/.tmp\n.em/.tasks\n'],
    ['# keep\n.em/.slices', '# keep\n.em/.slices\n.em/.tmp\n.em/.tasks\n'],
    ['/.em/.tmp/\n', '/.em/.tmp/\n.em/.slices\n.em/.tasks\n'],
    ['/.em/.tasks/\n', '/.em/.tasks/\n.em/.slices\n.em/.tmp\n'],
    ['/.em/\n', '/.em/\n'],
    ['.em/*\n', '.em/*\n'],
    ['.em/*\n!.em/.tmp/\n', '.em/*\n!.em/.tmp/\n.em/.tmp\n'],
    ['.em/*\n!.em/.tasks/\n', '.em/*\n!.em/.tasks/\n.em/.tasks\n'],
  ];
  for (const [index, [initial, expected]] of cases.entries()) {
    const cwd = path.join(root, String(index));
    fs.mkdirSync(cwd);
    const file = path.join(cwd, '.gitignore');
    if (initial !== null) fs.writeFileSync(file, initial);
    installSkills({ cwd, sourceDir });
    assert.equal(fs.readFileSync(file, 'utf8'), expected);
    const rerun = installSkills({ cwd, sourceDir });
    assert.equal(fs.readFileSync(file, 'utf8'), expected);
    assert.ok(!rerun.actions.some((action) => action.includes('.gitignore')));
  }
});

test('init installs scoped cleanup approval and preserves existing settings', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'em-init-permissions-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const sourceDir = path.join(cwd, 'source');
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'skill.txt'), 'test');
  fs.mkdirSync(path.join(cwd, '.claude'));
  const file = path.join(cwd, '.claude', 'settings.json');
  const original = {
    env: { EXAMPLE: 'kept' },
    permissions: { allow: ['Read'], deny: ['Bash(rm *)'] },
  };
  fs.writeFileSync(file, JSON.stringify(original));

  installSkills({ cwd, sourceDir });
  const text = fs.readFileSync(file, 'utf8');
  const settings = JSON.parse(text);
  assert.ok(settings.permissions.allow.includes('Bash(curl *http://localhost*)'));
  assert.ok(settings.permissions.allow.includes('Bash(curl *http://127.0.0.1*)'));
  assert.ok(!settings.permissions.allow.includes('Bash(curl *)'));
  for (const host of ['localhost', '127.0.0.1']) {
    assert.equal(
      settings.permissions.allow.includes(`Bash(curl.exe *http://${host}*)`),
      process.platform === 'win32',
    );
  }
  assert.ok(!settings.permissions.allow.includes('Bash(curl.exe *)'));
  assert.ok(settings.permissions.allow.includes('Bash(rm .em/.tmp/*)'));
  assert.ok(settings.permissions.allow.includes('Bash(rm -f .em/.tmp/*)'));
  assert.ok(settings.permissions.allow.includes('Bash(rm -rf .em/.tmp/*)'));
  assert.ok(!settings.permissions.allow.includes('Bash(rm -rf *)'));
  assert.ok(settings.permissions.allow.includes('Read'));
  assert.ok(!settings.permissions.allow.includes('Bash(rm *)'));
  assert.equal(
    settings.permissions.allow.includes('PowerShell(Remove-Item -LiteralPath .em\\.tmp\\*)'),
    process.platform === 'win32',
  );
  assert.ok(!settings.permissions.allow.includes('PowerShell(Remove-Item *)'));
  assert.deepEqual(settings.permissions.deny, original.permissions.deny);
  assert.deepEqual(settings.env, original.env);

  const rerun = installSkills({ cwd, sourceDir });
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.ok(!rerun.actions.some((action) => action.includes('settings.json')));
});

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

test('agent --harness rejects unsupported harnesses', () => {
  for (const harness of ['copilot', 'invalid']) {
    const result = spawnSync(process.execPath, [
      entry, 'agent', '--model', 'test-model', '--type', 'modeler', '--harness', harness,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /--harness must be claude/);
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
  assert.ok(received.every((url) => url.searchParams.get('harness') === 'claude'));
  assert.ok(received.every((url) => url.pathname === '/api/agent/events' && url.searchParams.get('model') === 'test-model'));
});
