#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createServer, PUBLIC_DIR } from './app.js';
import { DATA_DIR } from './model-store.js';
import { DEFAULT_TARGET, installSkills } from './init.js';

const HELP = `Usage: event-modeling-cli [options]

Options:
      --init           Install (or update) the skills in the current directory, then exit
      --target <dir>   With --init: skills folder (default ${DEFAULT_TARGET})
  -p, --port <port>  Port to listen on (default: PORT environment variable, else 3300)
      --host <host>  Host to bind to (default localhost)
      --dev          Serve only /api; the board comes from the Vite dev server
  -h, --help         Show this help
`;

function fail(message) {
  console.error(`${message}\n\n${HELP}`);
  process.exit(1);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      port: { type: 'string', short: 'p', default: process.env.PORT || '3300' },
      host: { type: 'string', default: 'localhost' },
      dev: { type: 'boolean', default: false },
      init: { type: 'boolean', default: false },
      target: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (e) {
  fail(e.message);
}

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.target !== undefined && !values.init) fail('--target requires --init');

if (values.init) {
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
