import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { claude } from './harnesses/claude.js';
import { copilot } from './harnesses/copilot.js';

class ConnectionError extends Error {}
const HARNESSES = new Map([['claude', claude], ['copilot', copilot]]);

export async function runAgent({ port, name, model, agentType, harness = 'claude' }) {
  const dialect = HARNESSES.get(harness);
  if (!dialect) throw new Error('Harness must be claude or copilot');
  const url = new URL(`http://localhost:${port}/api/agent/events`);
  if (name !== undefined) url.searchParams.set('name', name);
  url.searchParams.set('model', model);
  url.searchParams.set('agentType', agentType);
  url.searchParams.set('harness', harness);
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      await listenForAgentEvents(url, model, dialect, () => { attempts = 0; });
      return;
    } catch (e) {
      console.error(`Agent stream at ${url}: ${e.cause?.message || e.message}`);
      if (!(e instanceof ConnectionError) || attempts >= 10) {
        if (attempts >= 10) console.error('Giving up after 10 connection attempts.');
        process.exitCode = 1;
        return;
      }
      console.error(`Reconnecting in 10 seconds (attempt ${attempts + 1}/10).`);
      await delay(10000);
    }
  }
}

async function listenForAgentEvents(url, model, dialect, onConnected) {
  let response;
  try {
    response = await fetch(url, { redirect: 'error' });
  } catch (error) {
    throw new ConnectionError(error.message, { cause: error });
  }
  if (!response.ok) {
    const detail = response.headers.get('content-type')?.startsWith('application/json')
      ? await response.json() : null;
    if (!detail) await response.body?.cancel();
    const ErrorType = response.status >= 500 || [408, 429].includes(response.status) ? ConnectionError : Error;
    throw new ErrorType(`HTTP ${response.status}${detail?.error ? `: ${detail.error}` : ''}`);
  }
  if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'text/event-stream') {
    await response.body?.cancel();
    throw new Error('Expected an event stream from the board server');
  }

  onConnected();
  console.log(`Agent connected to ${url.origin}.`);

  const children = new Set();
  try {
    let pending = '';
    for await (const chunk of connectionChunks(response.body)) {
      const frames = (pending + chunk).split('\n\n');
      pending = frames.pop();
      for (const frame of frames) {
        const lines = frame.split('\n');
        const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
        if (event === 'stop') {
          console.log('Agent stopped from the board.');
          return;
        }
        if (event === 'run') {
          runHarness(dialect, model, children);
          continue;
        }
        if (event !== 'ping') continue;
        const data = lines.find((line) => line.startsWith('data:'));
        if (!data) continue;
        await acknowledgePing(url, JSON.parse(data.slice('data:'.length)));
      }
    }
    throw new ConnectionError('Server closed the message stream');
  } finally {
    for (const child of children) child.kill();
  }
}

async function* connectionChunks(body) {
  try {
    yield* body.pipeThrough(new TextDecoderStream());
  } catch (error) {
    throw new ConnectionError(error.message, { cause: error });
  }
}

function runHarness(dialect, model, children) {
  const child = spawn(dialect.command, dialect.args(model), {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(child);
  let stdout = '';
  let stderr = '';
  let failedToStart = false;
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  child.once('error', (error) => {
    failedToStart = true;
    console.error(`Could not run ${dialect.label}: ${error.message}`);
  });
  child.once('close', (code, signal) => {
    children.delete(child);
    if (stdout) console.log(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());
    if (!failedToStart && code !== 0) {
      console.error(`${dialect.label} ${signal ? `terminated by ${signal}` : `exited with code ${code}`}.`);
    }
  });
}

async function acknowledgePing(url, { id, nonce }) {
  if (typeof id !== 'string' || typeof nonce !== 'string') throw new Error('Invalid agent heartbeat');
  try {
    const response = await fetch(new URL(`/api/agents/${encodeURIComponent(id)}/ping`, url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Could not acknowledge agent heartbeat: ${error.message}`);
  }
}
