#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createServer, PUBLIC_DIR } from './board/app.js';
import { DATA_DIR } from './board/model-store.js';
import { DEFAULT_TARGET, installSkills } from './init.js';
import { runAgent } from './agent/agent.js';

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
      --name <name>  Display name on the board (default: random Austrian composer)
      --model <model> Model identifier sent to the server (required)
      --type <type>  Agent type: modeler or builder (required)
      --harness <name> Harness: claude (default)
  -p, --port <port>  Board server port on localhost (default: PORT environment variable, else 3300)
  -v, --verbose      Also log the prompt and the response; repeat (-vv) for the raw harness output
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
        type: { type: 'string' },
        harness: { type: 'string', default: 'claude' },
        verbose: { type: 'boolean', short: 'v', multiple: true, default: [] },
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
    const { dir, version, installed, removed, actions } = installSkills({ target: values.target });
    for (const action of actions) console.log(action);
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
  if (name === '') fail('--name needs a display name');
  const model = values.model?.trim();
  if (!model) fail('--model needs a model identifier');
  const agentType = values.type;
  if (!['modeler', 'builder'].includes(agentType)) fail('--type must be modeler or builder');
  const harness = values.harness;
  if (harness !== 'claude') fail('--harness must be claude');
  await runAgent({ port, name, model, agentType, harness, verbosity: Math.min(values.verbose.length, 2) });
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
