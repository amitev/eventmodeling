import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseBuildResponse, runAgent } from './agent.js';
import { claude } from './harnesses/claude.js';
import { copilot } from './harnesses/copilot.js';

test('Claude task sessions use task UUIDs and resume existing transcripts', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-claude-session-'));
  const originalConfig = process.env.CLAUDE_CONFIG_DIR;
  t.after(async () => {
    if (originalConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfig;
    await fs.rm(root, { recursive: true, force: true });
  });
  process.env.CLAUDE_CONFIG_DIR = root;
  const taskId = 'c0f8f807-96c6-4f0a-bcc5-ad8513983769';
  const baseArgs = ['-p', 'Review', '--model', 'test-model', '--output-format', 'json'];
  assert.deepEqual(await claude.args('test-model', 'Review', taskId), [...baseArgs, '--session-id', taskId]);
  const directory = path.join(root, 'projects', 'stored-project');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${taskId}.jsonl`), '');
  assert.deepEqual(await claude.args('test-model', 'Review', taskId), [...baseArgs, '--resume', taskId]);
  assert.deepEqual(await claude.args('test-model', 'Review'), baseArgs);
  const otherId = '9952a499-20c7-4619-966e-b33b5489d1de';
  assert.deepEqual(await claude.args('test-model', 'Review', otherId), [...baseArgs, '--session-id', otherId]);
  await assert.rejects(claude.args('test-model', 'Review', '../invalid'), /must be a UUID/);
});

test('Claude session lookup errors are surfaced instead of starting a new conversation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-claude-session-error-'));
  const originalConfig = process.env.CLAUDE_CONFIG_DIR;
  t.after(async () => {
    if (originalConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfig;
    await fs.rm(root, { recursive: true, force: true });
  });
  process.env.CLAUDE_CONFIG_DIR = root;
  await fs.writeFile(path.join(root, 'projects'), 'not a directory');
  await assert.rejects(
    claude.args('test-model', 'Review', 'c0f8f807-96c6-4f0a-bcc5-ad8513983769'),
    { code: 'ENOTDIR' },
  );
});

test('modeling task temp directories are prepared and cleaned before reporting success or failure', { timeout: 15000 }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-agent-temp-'));
  const originalCwd = process.cwd();
  const originalCommand = claude.command;
  t.after(async () => {
    claude.command = originalCommand;
    process.chdir(originalCwd);
    await fs.rm(root, { recursive: true, force: true });
  });
  process.chdir(root);
  claude.command = process.execPath;
  const tempRoot = path.join('.em', '.tmp');
  await fs.mkdir(tempRoot, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'keep.txt'), 'unrelated');
  const directories = new Set();
  for (const [name, result, expectedStatus] of [
    ['success', '<build><success>true</success><response>Reviewed.</response></build>', 'done'],
    ['failure', '<build><success>false</success><response>Needs a decision.</response></build>', 'failed'],
    ['invalid response', 'invalid', 'failed'],
  ]) {
    await t.test(name, async (t) => {
      let stream;
      let report;
      let remainingAtReport;
      const encoder = new TextEncoder();
      t.mock.method(globalThis, 'fetch', async (url, options) => {
        const resource = new URL(url).pathname;
        if (resource === '/api/agent/events') {
          return new Response(new ReadableStream({
            start(controller) {
              stream = controller;
              controller.enqueue(encoder.encode(
                'event: welcome\ndata: {"id":"session","name":"Mozart"}\n\n' +
                'event: modeling-task\ndata: {"id":"task","label":"Sales","prompt":"Review"}\n\n'
              ));
            },
          }), { headers: { 'Content-Type': 'text/event-stream' } });
        }
        if (resource.endsWith('/scope')) return Response.json({ scope: { type: 'context', contextId: 'ctx' } });
        if (resource.endsWith('/done') || resource.endsWith('/failed')) {
          report = { status: resource.split('/').pop(), ...JSON.parse(options.body) };
          remainingAtReport = await fs.readdir(tempRoot);
          stream.enqueue(encoder.encode('event: stop\ndata: {}\n\n'));
          stream.close();
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected request: ${resource}`);
      });
      t.mock.method(claude, 'args', (_model, prompt, taskId) => {
        assert.equal(taskId, 'task');
        const tempDir = prompt.match(/Temp files only in `([^`]+)`/)?.[1];
        assert.ok(tempDir);
        assert.equal(path.dirname(tempDir), tempRoot);
        assert.ok(!directories.has(tempDir));
        directories.add(tempDir);
        return ['-e', `
          const fs = require('node:fs');
          const path = require('node:path');
          const directory = process.argv[1];
          if (!fs.statSync(directory).isDirectory()) throw new Error('Missing task directory');
          fs.mkdirSync(path.join(directory, 'nested'));
          fs.writeFileSync(path.join(directory, 'nested', 'response.json'), '{}');
          console.log(process.argv[2]);
        `, tempDir, JSON.stringify({ result })];
      });
      await runAgent({ port: 3300, name: 'Mozart', model: 'test', agentType: 'modeler' });
      assert.equal(report.status, expectedStatus);
      if (name === 'invalid response') {
        assert.equal(report.response, null);
        assert.match(report.error, /Invalid build response/);
      } else {
        assert.equal(report.response, name === 'success' ? 'Reviewed.' : 'Needs a decision.');
        assert.equal(report.error, undefined);
      }
      assert.deepEqual(remainingAtReport, ['keep.txt']);
      assert.equal(await fs.readFile(path.join(tempRoot, 'keep.txt'), 'utf8'), 'unrelated');
    });
  }
  assert.equal(directories.size, 3);
});

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
