import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './board/model-store.js';

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

export const SETTINGS_FILE = path.join('.claude', 'settings.json');
// Keep the port colon literal; a trailing ":*" means a command-word prefix.
export const CLAUDE_PERMISSIONS = [
  'Read', 'Write', 'Edit', 'Grep', 'Glob',
  'Bash(curl http://localhost:**)', 'Bash(curl http://127.0.0.1:**)',
  'Bash(gradle:*)', 'Bash(./gradlew:*)', 'Bash(gradlew:*)', 'Bash(gradlew.bat:*)',
];

// Adds the missing CLAUDE_PERMISSIONS to `permissions.allow` of `<cwd>/.claude/settings.json`, keeping everything else.
function allowClaudePermissions(cwd) {
  const file = path.resolve(cwd, SETTINGS_FILE);
  let settings = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`${SETTINGS_FILE} is not valid JSON.`);
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`${SETTINGS_FILE} must be a JSON object.`);
  }
  const permissions = settings.permissions ?? {};
  const allow = permissions.allow ?? [];
  if (typeof permissions !== 'object' || Array.isArray(permissions) || !Array.isArray(allow)) {
    throw new Error(`${SETTINGS_FILE}: "permissions.allow" must be a list.`);
  }
  const missing = CLAUDE_PERMISSIONS.filter((p) => !allow.includes(p));
  if (!missing.length) return null;
  const created = !fs.existsSync(file);
  settings.permissions = { ...permissions, allow: [...allow, ...missing] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return `${created ? 'Created' : 'Patched'} ${SETTINGS_FILE}`;
}

const IGNORED_SLICES = '.em/.slices';

// Appends the slice definitions folder to `<cwd>/.gitignore` unless an entry already covers it.
function ignoreSlices(cwd) {
  const file = path.join(cwd, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const covered = text.split(/\r?\n/).some((l) => /^\/?\.em\/(\.slices|\*)?\/?$/.test(l.trim()));
  if (covered) return null;
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${IGNORED_SLICES}\n`);
  return `Added ${IGNORED_SLICES} to .gitignore`;
}

// Copies the packaged skills (and em-board-api.md) into `target`, replacing what an earlier run installed.
export function installSkills({ target = DEFAULT_TARGET, cwd = process.cwd(), sourceDir = SKILLS_DIR } = {}) {
  if (!fs.existsSync(sourceDir)) throw new Error('Packaged skills not found.');
  const dir = path.resolve(cwd, target);
  if (dir === path.resolve(sourceDir)) throw new Error('Target is the packaged skills folder. Use --target.');
  const manifestFile = path.join(dir, MANIFEST);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.resolve(cwd, DATA_DIR), { recursive: true });
  const actions = [ignoreSlices(cwd), allowClaudePermissions(cwd)].filter(Boolean);
  const entries = fs.readdirSync(sourceDir).filter(isEntryName).sort();
  const removed = readManifest(manifestFile).filter((n) => !entries.includes(n));
  for (const name of readManifest(manifestFile)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  for (const name of entries) fs.cpSync(path.join(sourceDir, name), path.join(dir, name), { recursive: true });
  fs.writeFileSync(manifestFile, `${JSON.stringify({ version: VERSION, entries }, null, 2)}\n`);

  return { dir, version: VERSION, installed: entries, removed, actions };
}
