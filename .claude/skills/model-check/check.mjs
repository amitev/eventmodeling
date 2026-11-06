#!/usr/bin/env node
// Read-only model check. Reads the model through the server API and prints only the findings.
// Usage: node check.mjs [--base http://localhost:3300] [--context <id>] [--chapter <id or name>]
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.base ?? 'http://localhost:3300').replace(/\/$/, '') + '/api/model';

const get = async (path) => {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
};

const HOLDERS = ['SCREEN', 'COMMAND', 'EVENT', 'QUERY'];
const findings = [];
const add = (kind, ctx, msg) => findings.push({ kind, chapter: ctx.chapter.name, slice: ctx.slice?.name, el: ctx.el, msg });

const contexts = await get('/outline');
const chapters = [];
const screens = new Map();
for (const c of contexts) {
  for (const o of c.chapters) {
    const ch = await get(`/chapters/${o.id}?screenContent=false`);
    ch.contextName = c.name;
    chapters.push(ch);
  }
  for (const s of await get(`/contexts/${c.id}/screens`)) screens.set(s.id, s);
}

const byId = new Map();
for (const ch of chapters) {
  ch.slices.forEach((slice, si) => {
    for (const el of slice.elements) byId.set(el.id, { el, chapter: ch, slice, si, lane: ch.lanes.find((l) => l.id === el.lane) });
  });
}
const parents = new Map();
for (const { el } of byId.values()) for (const t of el.connectsTo ?? []) parents.set(t, [...(parents.get(t) ?? []), el.id]);

const original = (el) => (el.copyOf ? byId.get(el.copyOf)?.el ?? el : el);
const nameOf = (el) => original(el).name ?? '';
const fieldsOf = (el) => original(el).fields ?? [];
const parentsOf = (el) => (parents.get(el.id) ?? []).map((id) => byId.get(id)?.el).filter(Boolean);
const childrenOf = (el) => (el.connectsTo ?? []).map((id) => byId.get(id)?.el).filter(Boolean);
// The fields-holding elements that feed `el`, passing through Processors.
const sourcesOf = (el, seen = new Set()) =>
  parentsOf(el).flatMap((p) => {
    if (seen.has(p.id)) return [];
    if (p.type === 'PROCESSOR') {
      seen.add(p.id);
      return sourcesOf(p, seen);
    }
    return HOLDERS.includes(p.type) ? [original(p)] : [];
  });

const wanted = (ch) => (!args.chapter || ch.id === args.chapter || ch.name.toLowerCase() === args.chapter.toLowerCase()) &&
  (!args.context || contexts.find((c) => c.id === args.context)?.chapters.some((o) => o.id === ch.id));

for (const ch of chapters.filter(wanted)) {
  const here = (info, el) => ({ chapter: ch, slice: info?.slice, el });
  const sliceOfScenarios = [];

  for (const [si, slice] of ch.slices.entries()) {
    const real = slice.elements.filter((e) => e.type !== 'SCENARIOS' && e.type !== 'NOTES');
    if (slice.name === 'New Slice') add('GAP', { chapter: ch, slice }, 'slice still has the default name "New Slice"');
    if (!real.length) add('GAP', { chapter: ch, slice }, 'slice is empty');
    else if (slice.type === null) add('GAP', { chapter: ch, slice }, 'slice has no type: elements or arrows are missing for any of the four slice types');
    const ofType = (t) => real.filter((e) => e.type === t);
    const [cmds, qrys, procs] = [ofType('COMMAND'), ofType('QUERY'), ofType('PROCESSOR')];
    const list = (xs) => xs.map(nameOf).join(', ');
    if (cmds.length > 1) add('RULE', { chapter: ch, slice }, `slice has ${cmds.length} Commands (${list(cmds)}): a slice has one; propose a split`);
    if (procs.length > 1) add('RULE', { chapter: ch, slice }, `slice has ${procs.length} Processors (${list(procs)}): a slice has one; propose a split`);
    if (cmds.length && qrys.length && !procs.length) add('RULE', { chapter: ch, slice }, `slice mixes a Command (${list(cmds)}) and a Query (${list(qrys)}) without a Processor: a slice has one Command or one Query; propose a split`);
    if (!procs.length && !cmds.length && qrys.length > 1) add('RULE', { chapter: ch, slice }, `slice has ${qrys.length} Queries (${list(qrys)}): a slice has one; propose a split`);
    const main = procs.length === 1 ? [procs[0], ...cmds] : cmds.length === 1 && !qrys.length ? [cmds[0]] : qrys.length === 1 && !cmds.length ? [qrys[0]] : null;
    const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (main && slice.name !== 'New Slice' && !main.some((m) => key(nameOf(m)) === key(slice.name))) {
      add('CANDIDATE', { chapter: ch, slice }, `slice name "${slice.name}" differs from its ${main[0].type} "${nameOf(main[0])}": name a slice exactly like its element`);
    }
    for (const sc of slice.elements.filter((e) => e.type === 'SCENARIOS')) {
      sliceOfScenarios.push({ slice, count: sc.scenarios?.length ?? 0 });
      if (!sc.scenarios?.length) add('GAP', { chapter: ch, slice, el: sc }, 'Scenarios element has no scenarios');
    }
  }

  const seenNames = new Map();
  for (const slice of ch.slices) {
    for (const el of slice.elements) {
      if (el.type === 'SCENARIOS' || el.type === 'NOTES') continue;
      const ctx = { chapter: ch, slice, el };
      const info = byId.get(el.id);
      const isCopy = !!el.copyOf;
      const ps = parentsOf(el);
      const cs = childrenOf(el);

      if (!ps.length && !cs.length) add('GAP', ctx, 'not connected to anything');
      if (!isCopy) {
        if (!nameOf(el).trim()) add('GAP', ctx, 'has no name');
        const key = `${el.type}|${nameOf(el).trim().toLowerCase()}`;
        if (nameOf(el).trim() && seenNames.has(key)) add('CANDIDATE', ctx, `same ${el.type} name as another element of this Chapter: a repeated fact should be a linked copy, not a second element`);
        seenNames.set(key, el.id);
        if (HOLDERS.includes(el.type) && !fieldsOf(el).length) add('GAP', ctx, 'has no fields');
      }
      for (const t of el.connectsTo ?? []) {
        const target = byId.get(t);
        if (target && target.chapter === ch && target.si < info.si) add('RULE', ctx, `arrow goes backward to "${nameOf(target.el)}" in an earlier slice (${target.slice.name})`);
      }

      if (el.type === 'COMMAND') {
        const issuers = ps.filter((p) => p.type === 'SCREEN' || p.type === 'PROCESSOR');
        if (!issuers.length) add('GAP', ctx, 'no Screen or Processor issues this Command');
        if (issuers.length > 1) add('RULE', ctx, `${issuers.length} issuers (${issuers.map(nameOf).join(', ')}): a Command has exactly one`);
        const events = cs.filter((c) => c.type === 'EVENT');
        if (!events.length) add('GAP', ctx, 'produces no Event');
        if (events.length > 2) add('CANDIDATE', ctx, `produces ${events.length} Events: one job, or several? Do they always happen together?`);
        if (/^(load|fetch|get|open|show|view|list)\b/i.test(nameOf(el))) add('CANDIDATE', ctx, 'name reads like a query or a UI action, not business intent');
      }
      if (el.type === 'EVENT' && !isCopy) {
        if (!ps.some((p) => p.type === 'COMMAND') && info.lane?.type !== 'INTEGRATION') add('GAP', ctx, 'no Command produces this Event');
      }
      if (el.type === 'QUERY' && !isCopy) {
        const evs = ps.filter((p) => p.type === 'EVENT');
        if (!evs.length) add('GAP', ctx, 'no Event feeds this Query');
        if (evs.length > 3) add('CANDIDATE', ctx, `built from ${evs.length} Events: one picture, or several questions bundled?`);
        if (!cs.length) add('GAP', ctx, 'feeds nothing (no Screen or Processor)');
      }
      if (el.type === 'SCREEN' && !isCopy) {
        const cmds = cs.filter((c) => c.type === 'COMMAND');
        if (cmds.length > 1) add('RULE', ctx, `triggers ${cmds.length} Commands (${cmds.map(nameOf).join(', ')}): a Screen triggers exactly one`);
        const s = screens.get(el.id);
        if (s && !s.hasHtml && !s.hasUrl) add('GAP', ctx, 'no mockup (empty placeholder)');
      }
      if (el.type === 'PROCESSOR') {
        if (!ps.some((p) => p.type === 'QUERY')) add('GAP', ctx, 'no todo-list Query feeds this Processor');
        if (!cs.some((c) => c.type === 'COMMAND')) add('GAP', ctx, 'issues no Command');
      }

      if (['COMMAND', 'EVENT', 'QUERY'].includes(el.type) && !isCopy && ps.length) {
        const upstream = new Set(sourcesOf(el).flatMap((s) => (s.fields ?? []).map((f) => f.name)));
        const orphan = (el.fields ?? []).filter((f) => !f.generated && !upstream.has(f.name)).map((f) => f.name);
        if (orphan.length) add('GAP', ctx, `field(s) with no source upstream and not generated: ${orphan.join(', ')}`);
      }
    }
  }

  // Scenarios
  const used = new Set();
  const all = ch.slices.flatMap((s) => s.elements).filter((e) => e.type === 'SCENARIOS');
  for (const sc of all) {
    const slice = ch.slices.find((s) => s.elements.includes(sc));
    for (const s of sc.scenarios ?? []) {
      const ctx = { chapter: ch, slice, el: { ...sc, name: `scenario "${s.name}"` } };
      const unknown = [];
      for (const [tag, en] of [...s.given.map((g) => ['Given', g]), ...(s.when ? [['When', s.when]] : []), ...s.then.map((t) => ['Then', t])]) {
        const target = byId.get(en.element)?.el;
        if (!target) continue;
        const known = new Set(fieldsOf(target).map((f) => f.name));
        for (const k of Object.keys(en.example ?? {})) if (!known.has(k)) unknown.push(`${tag} ${nameOf(target)}.${k}`);
      }
      if (unknown.length) add('GAP', ctx, `example key(s) that are not fields of their element: ${unknown.join(', ')}`);
      if (s.when) used.add(s.when.element);
      if (!s.when) add('GAP', ctx, 'has no When (Command)');
      if (!s.then.length && s.error === null) add('GAP', ctx, 'has neither Then Events nor an expected error');
      const cmd = s.when && byId.get(s.when.element)?.el;
      if (cmd) for (const t of s.then) if (!cmd.connectsTo.includes(t.element)) add('CANDIDATE', ctx, `Then Event "${nameOf(byId.get(t.element)?.el ?? {})}" is not produced by the When Command`);
    }
  }
  for (const { el, slice } of [...byId.values()].filter((x) => x.chapter === ch && x.el.type === 'COMMAND' && !x.el.copyOf)) {
    if (!used.has(el.id)) add('GAP', { chapter: ch, slice, el }, 'no scenario uses this Command');
  }
  const counts = sliceOfScenarios.map((x) => x.count).filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length >= 3) {
    const median = counts[Math.floor(counts.length / 2)];
    for (const x of sliceOfScenarios) if (x.count >= 5 && x.count >= 2 * median) add('CANDIDATE', { chapter: ch, slice: x.slice }, `${x.count} scenarios, the typical slice has ${median}: more complex, or covering a separate step?`);
  }
}

const order = { RULE: 0, GAP: 1, CANDIDATE: 2 };
findings.sort((a, b) => order[a.kind] - order[b.kind] || a.chapter.localeCompare(b.chapter));
const counts = { RULE: 0, GAP: 0, CANDIDATE: 0 };
for (const f of findings) counts[f.kind]++;
console.log(`Checked ${chapters.filter(wanted).length} Chapter(s): ${counts.RULE} rule, ${counts.GAP} gap, ${counts.CANDIDATE} candidate finding(s)`);
for (const f of findings) {
  const where = [f.chapter, f.slice].filter(Boolean).join(' > ');
  const who = f.el ? ` ${f.el.type ?? ''} "${f.el.name ?? nameOf(f.el)}" (${f.el.id ?? ''})` : '';
  console.log(`[${f.kind}] ${where}:${who} - ${f.msg}`);
}

// Slices depend on each other only through Events: a Query reads Events of another slice (arrows), a Command
// is checked against Events that its scenarios give (Given).
if ('dependencies' in args) {
  const whenScenarios = new Map();
  for (const { el } of byId.values()) for (const s of el.scenarios ?? []) if (s.when) whenScenarios.set(s.when.element, [...(whenScenarios.get(s.when.element) ?? []), s]);
  const label = (info) => `${info.chapter.name} > ${info.slice.name}`;
  console.log('\nDependencies between slices (through Events only):');
  let any = false;
  for (const ch of chapters.filter(wanted)) {
    for (const slice of ch.slices) {
      const produced = new Set(), consumed = new Set();
      for (const el of slice.elements) {
        if (el.type === 'COMMAND') {
          for (const c of childrenOf(el)) if (c.type === 'EVENT' && !c.copyOf) produced.add(nameOf(c));
          for (const s of whenScenarios.get(original(el).id) ?? []) for (const g of s.given) {
            const home = byId.get(g.element);
            if (home && home.slice !== slice) consumed.add(`${nameOf(home.el)} (${label(home)})`);
          }
        }
        if (el.type === 'QUERY') {
          for (const p of parentsOf(el).filter((x) => x.type === 'EVENT')) {
            const home = byId.get(original(p).id);
            if (home && home.slice !== slice) consumed.add(`${nameOf(home.el)} (${label(home)})`);
          }
        }
      }
      if (!produced.size && !consumed.size) continue;
      any = true;
      console.log(`- ${ch.name} > ${slice.name}: produces ${[...produced].join(', ') || 'nothing'}; depends on ${[...consumed].join(', ') || 'no other slice'}`);
    }
  }
  if (!any) console.log('none');
}
