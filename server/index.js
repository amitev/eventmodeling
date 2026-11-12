#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createServer, PUBLIC_DIR } from './app.js';
import { DATA_DIR } from './model-store.js';
import { DEFAULT_TARGET, installSkills } from './init.js';

const HELP = `Usage: em-cli <command> [options]

Commands:
  board              Start the Event Modeling Board
  init               Install (or update) the skills in the current directory

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

const [command, ...args] = process.argv.slice(2);
const help = command === 'board' ? BOARD_HELP : command === 'init' ? INIT_HELP : HELP;

function fail(message) {
  console.error(`${message}\n\n${help}`);
  process.exit(1);
}

if (command !== undefined && !['board', 'init', '-h', '--help'].includes(command)) {
  fail(`Unknown command: ${command}`);
}

let values;
try {
  ({ values } = parseArgs({
    args: command === '-h' || command === '--help' ? process.argv.slice(2) : args,
    options: {
      ...(command === 'board' ? {
        port: { type: 'string', short: 'p', default: process.env.PORT || '3300' },
        host: { type: 'string', default: 'localhost' },
        dev: { type: 'boolean', default: false },
      } : {}),
      ...(command === 'init' ? { target: { type: 'string' } } : {}),
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
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`Invalid port: ${values.port}`);

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
  console.log(`Event Modeling Board: http://${values.host}:${actual}${values.dev ? ' (API only)' : ''}`);
  console.log(`Model folder: ${path.join(process.cwd(), DATA_DIR, 'model')}`);
});
