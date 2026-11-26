import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_FILE = path.join('.claude', 'settings.json');
const CLAUDE_PERMISSIONS = [
  'Read', 'Write', 'Edit', 'Grep', 'Glob',
  'Bash(curl http://localhost*)',
  'Bash(curl http://127.0.0.1*)',
  'Bash(curl * http://localhost*)',
  'Bash(curl * http://127.0.0.1*)',
  'Bash(rm .em/.tmp/*)',
  ...(process.platform === 'win32' ? [
    'PowerShell(curl *http://localhost*)',
    'PowerShell(curl *http://127.0.0.1*)',
    'PowerShell(curl.exe *http://localhost*)',
    'PowerShell(curl.exe *http://127.0.0.1*)',
    'PowerShell(Remove-Item -LiteralPath .em\\.tmp\\*)',
  ] : []),
  'Bash(gradle:*)', 'Bash(./gradlew:*)', 'Bash(gradlew:*)', 'Bash(gradlew.bat:*)',
];

export function allowClaudePermissions(cwd) {
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

function parseResponse(stdout) {
  let output;
  try {
    output = JSON.parse(stdout);
  } catch {
    throw new Error('Claude output is not valid JSON');
  }
  if (typeof output?.result !== 'string') throw new Error('Claude output did not include result text');
  return {
    result: output.result,
    cost: output.total_cost_usd ?? null,
    currency: 'USD',
    durationMs: output.duration_ms ?? null,
  };
}

export const claude = {
  label: 'Claude',
  command: 'claude',
  parseResponse,
  args: (model, prompt) => ['-p', prompt, '--model', model, '--output-format', 'json'],
};
