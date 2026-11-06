#!/usr/bin/env node
// Read-only language check across Chapters and Contexts. Reads the model through the server API and prints findings.
// Usage: node language.mjs [--base http://localhost:3300] [--context <id>] [--chapter <id or name>] [--terms]
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.base ?? 'http://localhost:3300').replace(/\/$/, '') + '/api/model';
const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
};

const contexts = await get('/outline');
const chapters = [];
for (const c of contexts) for (const o of c.chapters) chapters.push({ ...(await get(`/chapters/${o.id}?screenContent=false`)), contextName: c.name });
const byId = new Map();
for (const ch of chapters) for (const slice of ch.slices) for (const el of slice.elements) byId.set(el.id, { el, chapter: ch, slice });
const wanted = (ch) => (!args.chapter || ch.id === args.chapter || ch.name.toLowerCase() === args.chapter.toLowerCase()) &&
  (!args.context || contexts.find((c) => c.id === args.context)?.chapters.some((o) => o.id === ch.id));

const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const key = (s) => words(s).join('');
const IRREGULAR = new Set(['paid', 'sent', 'built', 'made', 'bought', 'sold', 'held', 'kept', 'left', 'lost', 'met', 'read', 'set', 'put', 'cut', 'hit', 'shut', 'run', 'begun', 'chosen', 'given', 'taken', 'written', 'seen', 'known', 'shown', 'done', 'gone', 'won', 'found', 'said', 'told', 'brought', 'thought', 'rejected']);
const pastTense = (w) => w.endsWith('ed') || IRREGULAR.has(w) || w.endsWith('en') || w.endsWith('own');
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

const findings = [];
const add = (kind, info, msg) => findings.push({ kind, info, msg });
const originals = [...byId.values()].filter(({ el }) => !el.copyOf && ['SCREEN', 'COMMAND', 'EVENT', 'QUERY', 'PROCESSOR'].includes(el.type));
const inScope = (info) => wanted(info.chapter);

// 1. The same name twice, and near-duplicate names, within one element type (all Chapters and Contexts).
for (const type of ['SCREEN', 'COMMAND', 'EVENT', 'QUERY', 'PROCESSOR']) {
  const list = originals.filter(({ el }) => el.type === type && (el.name ?? '').trim());
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      const [ka, kb] = [key(a.el.name), key(b.el.name)];
      if (ka === kb) {
        if (inScope(a) || inScope(b)) add('CANDIDATE', a, `${type} "${a.el.name}" also exists in ${b.chapter.name} > ${b.slice.name}: one fact (a linked copy) or two?`);
      } else if (Math.min(ka.length, kb.length) >= 6 && distance(ka, kb) <= 2 && (inScope(a) || inScope(b))) {
        add('CANDIDATE', a, `${type} "${a.el.name}" is nearly the same as "${b.el.name}" (${b.chapter.name} > ${b.slice.name}): the same concept under two spellings?`);
      }
    }
  }
}

// 2. Commands and the Events they produce: a shared subject, and tense.
for (const info of originals.filter(({ el }) => el.type === 'COMMAND')) {
  const cw = words(info.el.name);
  if (cw.length && pastTense(cw[0]) && cw.length > 1) add('CANDIDATE', info, `Command "${info.el.name}" starts with "${cw[0]}": reads like past tense; a Command is imperative`);
  for (const t of info.el.connectsTo ?? []) {
    const ev = byId.get(t);
    if (!ev || ev.el.type !== 'EVENT') continue;
    const evo = ev.el.copyOf ? byId.get(ev.el.copyOf) ?? ev : ev;
    const ew = words(evo.el.name);
    if (cw.length > 1 && ew.length > 1) {
      const stem = (w) => w.replace(/(ing|ed|es|s|d|e)$/, '');
      const shared = cw.slice(1).filter((w) => ew.slice(0, -1).some((x) => stem(x) === stem(w)));
      if (!shared.length && inScope(info)) add('CANDIDATE', info, `Command "${info.el.name}" produces Event "${evo.el.name}": they share no subject word`);
    }
  }
}
for (const info of originals.filter(({ el }) => el.type === 'EVENT')) {
  const ew = words(info.el.name);
  if (ew.length > 1 && !ew.some(pastTense) && inScope(info)) add('CANDIDATE', info, `Event "${info.el.name}" has no past-tense word: a business fact that already happened?`);
}

// 3. The same field name defined differently on different elements.
const defs = new Map();
for (const info of originals.filter(({ el }) => ['SCREEN', 'COMMAND', 'EVENT', 'QUERY'].includes(el.type))) {
  for (const f of info.el.fields ?? []) {
    const k = key(f.name);
    defs.set(k, [...(defs.get(k) ?? []), { f, info }]);
  }
}
for (const list of defs.values()) {
  const shape = (x) => `${x.f.type}${x.f.list ? '[]' : ''}`;
  const shapes = new Set(list.map(shape));
  if (shapes.size > 1) {
    for (const x of list.filter((y) => inScope(y.info))) add('CANDIDATE', x.info, `field "${x.f.name}" is ${shape(x)} here but ${[...shapes].filter((s) => s !== shape(x)).join(' or ')} on other elements`);
  }
}

const order = { CANDIDATE: 0 };
findings.sort((a, b) => a.info.chapter.name.localeCompare(b.info.chapter.name));
console.log(`Language check: ${findings.length} candidate finding(s) in ${chapters.filter(wanted).length} Chapter(s) (all Chapters and Contexts were compared)`);
for (const f of findings) console.log(`[${f.kind}] ${f.info.chapter.name} > ${f.info.slice.name}: ${f.info.el.type} "${f.info.el.name}" (${f.info.el.id}) - ${f.msg}`);

// 4. Terms: the words the model uses, with counts, as raw material for a glossary.
if ('terms' in args) {
  const counts = new Map();
  const count = (name, kind, info) => {
    for (const w of words(name)) {
      if (w.length < 3) continue;
      const c = counts.get(w) ?? { n: 0, kinds: new Set(), places: new Set() };
      c.n++; c.kinds.add(kind); c.places.add(info.chapter.name);
      counts.set(w, c);
    }
  };
  for (const info of originals) {
    if (!inScope(info)) continue;
    count(info.el.name, info.el.type.toLowerCase(), info);
    for (const f of info.el.fields ?? []) count(f.name, 'field', info);
  }
  console.log('\nTerms (words in element and field names; count, kinds, Chapters):');
  for (const [w, c] of [...counts].sort((a, b) => b[1].n - a[1].n).slice(0, 60)) console.log(`- ${w}: ${c.n} (${[...c.kinds].join(', ')}; ${[...c.places].join(', ')})`);
}
