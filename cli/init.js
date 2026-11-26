import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './board/model-store.js';
import { allowClaudePermissions } from './agent/harnesses/claude.js';

export const SKILLS_DIR = fileURLToPath(new URL('../.claude/skills', import.meta.url));
export const DEFAULT_TARGET = path.join('.claude', 'skills');
export const MANIFEST = '.em-cli.json';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const isEntryName = (n) => typeof n === 'string' && n !== '' && n !== '.' && n !== '..' && !/[\\/]/.test(n);

function readManifest(file) {
  try {
    const { entries } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(entries) ? entries.filter(isEntryName) : [];
  } catch {
    return [];
  }
}

const IGNORED_FOLDERS = ['.em/.slices', '.em/.tmp'];

function ignoreFolders(cwd) {
  const file = path.join(cwd, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const patterns = text.split(/\r?\n/).map((line) => line.trim().replace(/^\//, '').replace(/\/$/, ''));
  const missing = IGNORED_FOLDERS.filter((folder) => {
    let ignored = false;
    for (const pattern of patterns) {
      const name = pattern.replace(/^!/, '').replace(/^\//, '');
      if (name === folder || name === '.em' || name === '.em/*') ignored = !pattern.startsWith('!');
    }
    return !ignored;
  });
  if (!missing.length) return null;
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
  return `Added ${missing.join(', ')} to .gitignore`;
}

// Copies the packaged skills (and em-board-api.md) into `target`, replacing what an earlier run installed.
export function installSkills({ target = DEFAULT_TARGET, cwd = process.cwd(), sourceDir = SKILLS_DIR } = {}) {
  if (!fs.existsSync(sourceDir)) throw new Error('Packaged skills not found.');
  const dir = path.resolve(cwd, target);
  if (dir === path.resolve(sourceDir)) throw new Error('Target is the packaged skills folder. Use --target.');
  const manifestFile = path.join(dir, MANIFEST);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.resolve(cwd, DATA_DIR), { recursive: true });
  const actions = [ignoreFolders(cwd), allowClaudePermissions(cwd)].filter(Boolean);
  const entries = fs.readdirSync(sourceDir).filter(isEntryName).sort();
  const removed = readManifest(manifestFile).filter((n) => !entries.includes(n));
  for (const name of readManifest(manifestFile)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  for (const name of entries) fs.cpSync(path.join(sourceDir, name), path.join(dir, name), { recursive: true });
  fs.writeFileSync(manifestFile, `${JSON.stringify({ version: VERSION, entries }, null, 2)}\n`);

  return { dir, version: VERSION, installed: entries, removed, actions };
}
