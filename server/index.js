#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createServer, PUBLIC_DIR } from './app.js';
import { DATA_DIR } from './model-store.js';
import { DEFAULT_TARGET, installSkills } from './init.js';

const HELP = `Usage: em-cli <command> [options]

Commands:
  board              Start the Event Modeling Board
  init               Install (or update) the skills in the current directory
  agent              Connect to the board server

Options:
  -h, --help         Show this help

Run "em-cli <command> --help" for command options.
`;

const BOARD_HELP = `Usage: em-cli board [options]

Options:
  -p, --port <port>  Port to listen on (default: PORT environment variable, else 3300)
      --host <host>  Host to bind to (default localhost)
      --dev          Serve only /api; the board comes from the Vite dev server
  -h, --help         Show this help
`;

const INIT_HELP = `Usage: em-cli init [options]

Options:
      --target <dir> Skills folder (default ${DEFAULT_TARGET})
  -h, --help         Show this help
`;

const AGENT_HELP = `Usage: em-cli agent [options]

Options:
      --name <name>  Display name on the board (required)
      --model <model> Model identifier sent to the server (required)
  -p, --port <port>  Board server port on localhost (default: PORT environment variable, else 3300)
  -h, --help         Show this help
`;

const [command, ...args] = process.argv.slice(2);
const commandHelp = new Map([['board', BOARD_HELP], ['init', INIT_HELP], ['agent', AGENT_HELP]]);
const help = commandHelp.get(command) ?? HELP;

function fail(message) {
  console.error(`${message}\n\n${help}`);
  process.exit(1);
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  // S2.15: a missing browser or launcher must not affect the server.
  child.on('error', () => {});
  child.unref();
}

if (command !== undefined && !commandHelp.has(command) && command !== '-h' && command !== '--help') {
  fail(`Unknown command: ${command}`);
}

let values;
try {
  ({ values } = parseArgs({
    args: command === '-h' || command === '--help' ? process.argv.slice(2) : args,
    options: {
      ...(command === 'board' || command === 'agent' ? {
        port: { type: 'string', short: 'p', default: process.env.PORT || '3300' },
      } : {}),
      ...(command === 'board' ? {
        host: { type: 'string', default: 'localhost' },
        dev: { type: 'boolean', default: false },
      } : {}),
      ...(command === 'init' ? { target: { type: 'string' } } : {}),
      ...(command === 'agent' ? {
        name: { type: 'string' },
        model: { type: 'string' },
      } : {}),
      help: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (e) {
  fail(e.message);
}

if (command === undefined || values.help) {
  console.log(help);
  process.exit(0);
}

if (command === 'init') {
  if (values.target === '') fail('--target needs a folder');
  try {
    const { dir, version, installed, removed } = installSkills({ target: values.target });
    console.log(`Installed ${installed.length} skill entries (version ${version}) in ${dir}`);
    if (removed.length) console.log(`Removed: ${removed.join(', ')}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  process.exit(0);
}

const port = Number(values.port);
const minPort = command === 'agent' ? 1 : 0;
if (!Number.isInteger(port) || port < minPort || port > 65535) fail(`Invalid port: ${values.port}`);

if (command === 'agent') {
  const name = values.name?.trim();
  if (!name) fail('--name needs a display name');
  const model = values.model?.trim();
  if (!model) fail('--model needs a model identifier');
  const url = new URL(`http://localhost:${port}/api/agent/events`);
  url.searchParams.set('name', name);
  url.searchParams.set('model', model);
  try {
    await listenForAgentEvents(url);
  } catch (e) {
    console.error(`Agent stream at ${url}: ${e.cause?.message || e.message}`);
    process.exitCode = 1;
  }
} else {
  startBoard();
}

function startBoard() {
  if (!values.dev && !fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    fail('Board build not found. Run "npm run build" first.');
  }

  const server = createServer({ publicDir: values.dev ? null : PUBLIC_DIR });
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : e.message);
    process.exit(1);
  });
  server.listen(port, values.host, () => {
    const { port: actual } = server.address();
    const host = values.host.includes(':') ? `[${values.host}]` : values.host;
    console.log(`Event Modeling Board: http://${host}:${actual}${values.dev ? ' (API only)' : ''}`);
    console.log(`Model folder: ${path.join(process.cwd(), DATA_DIR, 'model')}`);
    if (!values.dev) {
      const browserHost = ['0.0.0.0', '::'].includes(values.host) ? 'localhost' : host;
      openBrowser(`http://${browserHost}:${actual}`);
    }
  });
}

async function listenForAgentEvents(url) {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'text/event-stream') {
    await response.body?.cancel();
    throw new Error('Expected an event stream from the board server');
  }

  let pending = '';
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    const frames = (pending + chunk).split('\n\n');
    pending = frames.pop();
    for (const frame of frames) {
      const lines = frame.split('\n');
      const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
      if (event === 'stop') {
        console.log('Agent stopped from the board.');
        return;
      }
      if (event !== 'ping') continue;
      const data = lines.find((line) => line.startsWith('data:'));
      if (!data) continue;
      await acknowledgePing(url, JSON.parse(data.slice('data:'.length)));
    }
  }
  throw new Error('Server closed the message stream');
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
