import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { claude } from './harnesses/claude.js';
import { copilot } from './harnesses/copilot.js';

class ConnectionError extends Error {}
const HARNESSES = new Map([['claude', claude], ['copilot', copilot]]);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let verbose = false;

export async function runAgent({ port, name, model, agentType, harness = 'claude', verbose: verboseLog = false }) {
  verbose = verboseLog;
  const dialect = HARNESSES.get(harness);
  if (!dialect) throw new Error('Harness must be claude or copilot');
  const url = new URL(`http://localhost:${port}/api/agent/events`);
  if (name !== undefined) url.searchParams.set('name', name);
  url.searchParams.set('model', model);
  url.searchParams.set('agentType', agentType);
  url.searchParams.set('harness', harness);
  let attempts = 0;
  const session = { id: null };
  while (true) {
    attempts++;
    try {
      await listenForAgentEvents(url, model, dialect, session, () => { attempts = 0; });
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

async function listenForAgentEvents(url, model, dialect, session, onConnected) {
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
  const connection = new AbortController();
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
          console.log('Running harness check.');
          runHarness(dialect, model, 'What model are you', children).catch((error) => console.error(error.message));
          continue;
        }
        const data = lines.find((line) => line.startsWith('data:'));
        if (!data) continue;
        const payload = JSON.parse(data.slice('data:'.length));
        if (event === 'welcome') {
          // Reconnect under the same name, so queued build tasks stay with this agent.
          session.id = payload.id;
          url.searchParams.set('name', payload.name);
        } else if (event === 'build') {
          buildSlice(url, session.id, payload, dialect, model, children, connection.signal);
        } else if (event === 'ping') {
          await acknowledgePing(url, payload);
        }
      }
    }
    throw new ConnectionError('Server closed the message stream');
  } finally {
    connection.abort();
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

// Dialects with `summarize` log a readable summary (plus the raw output when verbose); an unparsable output is logged raw.
function logOutput(dialect, stdout) {
  const raw = `stdout:\n${stdout.trimEnd()}`;
  if (!dialect.summarize) return raw;
  try {
    const summary = dialect.summarize(stdout);
    return verbose ? `${summary}\n${raw}` : summary;
  } catch {
    return raw;
  }
}

function runHarness(dialect, model, prompt, children) {
  console.log(`${dialect.label} prompt: ${prompt}`);
  return new Promise((resolve, reject) => {
    const child = spawn(dialect.command, dialect.args(model, prompt), {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.add(child);
    let stdout = '';
    let stderr = '';
    let processError;
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      processError = error;
    });
    child.once('close', (code, signal) => {
      children.delete(child);
      if (stdout) console.log(`${dialect.label} ${logOutput(dialect, stdout)}`);
      if (stderr) console.error(`${dialect.label} stderr:\n${stderr.trimEnd()}`);
      if (processError) reject(new Error(`Could not run ${dialect.label}: ${processError.message}`));
      else if (code !== 0) reject(new Error(`${dialect.label} ${signal ? `terminated by ${signal}` : `exited with code ${code}`}.`));
      else resolve(stdout);
    });
  });
}

export function parseBuildResponse(dialect, output) {
  const parsed = dialect.parseResponse(output);
  const xmlMatch = parsed.result.match(/<build>([\s\S]*?)<\/build>/);
  if (!xmlMatch) {
    throw new Error('Invalid build response: expected <build>...</build> XML');
  }
  const xmlContent = xmlMatch[1];
  
  const successMatch = xmlContent.match(/<success>(.*?)<\/success>/);
  const responseMatch = xmlContent.match(/<response>([\s\S]*?)<\/response>/);
  
  if (!successMatch || !responseMatch) {
    throw new Error('Invalid build response: missing <success> or <response> tags');
  }
  
  const successStr = successMatch[1].trim().toLowerCase();
  if (successStr !== 'true' && successStr !== 'false') {
    throw new Error('Invalid build response: <success> must be "true" or "false"');
  }
  
  const response = responseMatch[1].trim();
  if (!response) {
    throw new Error('Invalid build response: <response> must be non-empty text');
  }
  
  const success = successStr === 'true';
  const status = success ? 'done' : 'failed';
  const error = success ? undefined : response;
  return { status, error, cost: parsed.cost, currency: parsed.currency, durationMs: parsed.durationMs };
}

async function saveSliceDefinition(url, { contextId, chapterId, sliceId }, signal) {
  if (typeof sliceId !== 'string' || !/^[a-z0-9_-]+$/i.test(sliceId) ||
      /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(sliceId)) {
    throw new Error('Slice id is not safe as a file name');
  }
  if (typeof chapterId !== 'string' || !chapterId || chapterId === '.' || chapterId === '..') {
    throw new Error('Invalid Chapter id');
  }
  const definitionUrl = new URL(`/api/model/chapters/${encodeURIComponent(chapterId)}`, url);
  definitionUrl.searchParams.set('slice', sliceId);
  const response = await fetch(definitionUrl, {
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Could not fetch slice definition: HTTP ${response.status}`);
  }
  const definition = await response.json();
  if (definition?.chapter?.id !== chapterId || definition.chapter.context !== contextId ||
      definition.context?.id !== contextId || !Array.isArray(definition.chapter.lanes) ||
      !Array.isArray(definition.slices) || definition.slices.length !== 1 || definition.slices[0]?.id !== sliceId) {
    throw new Error('Slice definition does not match the build task');
  }

  const definitionPath = path.join('.em', '.slices', `${sliceId}.json`);
  const directory = path.dirname(definitionPath);
  await mkdir(directory, { recursive: true });
  const temp = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify(definition, null, 2)}\n`, { flag: 'wx', mode: 0o600, signal });
    signal.throwIfAborted();
    await rename(temp, definitionPath);
  } finally {
    await rm(temp, { force: true });
  }
  return definitionPath;
}

async function buildSlice(url, agentId, task, dialect, model, children, signal) {
  const { id, contextId, chapterId, sliceId, sliceName } = task;
  let result = 'done';
  let error;
  let cost;
  let currency;
  let durationMs;
  try {
    console.log(`Building slice "${sliceName}". Task: ${id}`);
    const definitionPath = await saveSliceDefinition(url, task, signal);
    signal.throwIfAborted();
    console.log(`Saved slice definition to "${definitionPath}". Task: ${id}`);
    
    const promptTemplate = await readFile(path.join(__dirname, 'build-slice-prompt.md'), 'utf8');
    const prompt = promptTemplate
      .replace('{sliceId}', sliceId)
      .replace('{chapterId}', chapterId)
      .replace('{contextId}', contextId)
      .replace('{definitionPath}', definitionPath);
    
    const output = await runHarness(dialect, model, prompt, children);
    const buildResponse = parseBuildResponse(dialect, output);
    result = buildResponse.status;
    error = buildResponse.error;
    cost = buildResponse.cost;
    currency = buildResponse.currency;
    durationMs = buildResponse.durationMs;
    if (error) {
      console.error(error);
    }
  } catch (e) {
    if (signal.aborted) return;
    result = 'failed';
    error = e.message;
    console.error(error);
  }
  if (signal.aborted) return;
  try {
    const body = error === undefined ? {} : { error };
    if (cost !== undefined && cost !== null) body.cost = cost;
    if (currency !== undefined) body.currency = currency;
    if (durationMs !== undefined && durationMs !== null) body.durationMs = durationMs;
    const response = await fetch(new URL(`/api/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(id)}/${result}`, url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (e) {
    console.error(`Could not report build of slice "${sliceName}": ${e.message}`);
  }
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
