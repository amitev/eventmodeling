#!/usr/bin/env node
// Read-only audit of personal data (PII) in the model. Reads the model through the server API and prints findings.
// Usage: node audit.mjs [--base http://localhost:3300] [--context <id>] [--chapter <id or name>] [--patterns <file.json>]
import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.base ?? 'http://localhost:3300').replace(/\/$/, '') + '/api/model';
const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
};

// English personal-data words. A field is "personal-looking" when one of its camelCase/snake_case words, or two
// adjacent words joined, is in this set. `--patterns` replaces the check with regular expressions on the joined name.
const WORDS = new Set(['email', 'mail', 'phone', 'mobile', 'telephone', 'tel', 'fax', 'address', 'street', 'city', 'zip', 'postcode', 'postalcode', 'birth', 'birthday', 'birthdate', 'dob', 'gender', 'sex', 'ssn', 'passport', 'iban', 'creditcard', 'cardnumber', 'nationality', 'salary', 'firstname', 'lastname', 'fullname', 'surname', 'username', 'ip', 'ipaddress', 'religion', 'ethnicity']);
const PERSON = new Set(['first', 'last', 'full', 'sur', 'user', 'customer', 'person', 'contact', 'employee', 'patient', 'member', 'guest', 'owner']);
const custom = args.patterns ? JSON.parse(fs.readFileSync(args.patterns, 'utf8')).map((p) => new RegExp(p, 'i')) : null;
const tokens = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const personal = (name) => {
  const t = tokens(name);
  const joined = t.join('');
  if (custom) return custom.some((r) => r.test(joined));
  if (WORDS.has(joined) || t.some((w) => WORDS.has(w))) return true;
  if (t.some((w, i) => i < t.length - 1 && WORDS.has(w + t[i + 1]))) return true;
  return t.includes('name') && (t.length === 1 || t.some((w) => PERSON.has(w)));
};

const contexts = await get('/outline');
const chapters = [];
for (const c of contexts) for (const o of c.chapters) chapters.push(await get(`/chapters/${o.id}?screenContent=false`));
const byId = new Map();
for (const ch of chapters) for (const slice of ch.slices) for (const el of slice.elements) byId.set(el.id, { el, chapter: ch, slice });
const wanted = (ch) => (!args.chapter || ch.id === args.chapter || ch.name.toLowerCase() === args.chapter.toLowerCase()) &&
  (!args.context || contexts.find((c) => c.id === args.context)?.chapters.some((o) => o.id === ch.id));

// Every field of every element that has its own fields (linked copies show their original's), nested ones too.
const rows = [];
const walk = (fields, base, path) => {
  for (const f of fields ?? []) {
    rows.push({ ...base, leaf: f.name, path: path ? `${path}.${f.name}` : f.name, pii: !!f.pii });
    if (f.type === 'object') walk(f.fields, base, path ? `${path}.${f.name}` : f.name);
  }
};
for (const { el, chapter, slice } of byId.values()) {
  if (el.copyOf || !['SCREEN', 'COMMAND', 'EVENT', 'READ_MODEL'].includes(el.type)) continue;
  walk(el.fields, { el, chapter, slice }, '');
}
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const groups = new Map();
for (const r of rows) groups.set(key(r.leaf), [...(groups.get(key(r.leaf)) ?? []), r]);

const findings = [];
const add = (kind, r, msg) => findings.push({ kind, r, msg });
const piiMap = [];
for (const [k, list] of groups) {
  const flagged = list.filter((r) => r.pii);
  const loose = list.filter((r) => !r.pii);
  if (flagged.length) {
    piiMap.push({ name: list[0].leaf, list: flagged, inScope: flagged.some((r) => wanted(r.chapter)) });
    for (const r of loose.filter((x) => wanted(x.chapter))) add('GAP', r, `field "${r.path}" is flagged PII on ${flagged.length} other element(s) but not here`);
    for (const r of flagged.filter((x) => wanted(x.chapter) && x.el.type === 'EVENT')) add('CANDIDATE', r, `personal data "${r.path}" in an Event: Events are immutable facts, so it cannot be corrected or erased there; consider whether the Event needs it or only a reference`);
  } else {
    for (const r of list.filter((x) => wanted(x.chapter) && personal(x.leaf))) add('GAP', r, `field "${r.path}" looks personal but is not flagged PII`);
  }
}

const order = { GAP: 0, CANDIDATE: 1 };
findings.sort((a, b) => order[a.kind] - order[b.kind] || a.r.chapter.name.localeCompare(b.r.chapter.name));
const n = (k) => findings.filter((f) => f.kind === k).length;
console.log(`PII audit: ${piiMap.length} flagged field name(s), ${n('GAP')} gap, ${n('CANDIDATE')} candidate finding(s)`);
console.log('\nPII map (fields flagged pii, where each one is carried):');
if (!piiMap.length) console.log('none');
for (const p of piiMap.filter((x) => x.inScope)) {
  const where = p.list.map((r) => `${r.el.type} "${r.el.name}" (${r.chapter.name} > ${r.slice.name})`);
  console.log(`- ${p.name}: ${[...new Set(where)].join('; ')}`);
}
console.log('\nFindings:');
for (const f of findings) console.log(`[${f.kind}] ${f.r.chapter.name} > ${f.r.slice.name}: ${f.r.el.type} "${f.r.el.name}" (${f.r.el.id}) - ${f.msg}`);
if (!findings.length) console.log('none');
