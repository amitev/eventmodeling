#!/usr/bin/env node
// Read-only: prints a compact "look" fingerprint (fonts, colours, radii) of the Screens in scope and compares each with a base Screen.
// Usage: node fingerprint.mjs --context <id> [--chapter <id or name>] [--base-screen <id or name>] [--base http://localhost:3300]
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.context) {
  console.error('Usage: node fingerprint.mjs --context <id> [--chapter <id or name>] [--base-screen <id or name>] [--base URL]');
  process.exit(1);
}
const BASE = (args.base ?? 'http://localhost:3300').replace(/\/$/, '') + '/api/model';
const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
};

const contexts = await get('/outline');
const ctx = contexts.find((c) => c.id === args.context || c.name.toLowerCase() === args.context.toLowerCase());
if (!ctx) {
  console.error(`No Context "${args.context}". Known: ${contexts.map((c) => `${c.name} (${c.id})`).join(', ')}`);
  process.exit(1);
}
const screens = [];
for (const o of ctx.chapters) {
  const ch = await get(`/chapters/${o.id}`);
  for (const s of ch.slices) for (const e of s.elements) if (e.type === 'SCREEN' && !e.copyOf) screens.push({ ...e, chapter: ch.name, chapterId: ch.id, slice: s.name });
}

const top = (re, text, n = 6, map = (x) => x) => {
  const counts = new Map();
  for (const m of text.matchAll(re)) { const k = map(m[1] ?? m[0]); counts.set(k, (counts.get(k) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
};
const css = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' + [...html.matchAll(/style="([^"]*)"/gi)].map((m) => m[1]).join('\n');
const print = (s) => {
  const c = css(s.html ?? '');
  return {
    fonts: top(/font-family\s*:\s*([^;}\n]+)/gi, c, 3, (x) => x.trim().toLowerCase()),
    colours: top(/(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g, c, 8, (x) => x.toLowerCase().replace(/\s+/g, '')),
    radii: top(/border-radius\s*:\s*([^;}\n]+)/gi, c, 3, (x) => x.trim()),
  };
};

const inChapter = (s) => !args.chapter || s.chapterId === args.chapter || s.chapter.toLowerCase() === args.chapter.toLowerCase();
const base = args['base-screen'] ? screens.find((s) => s.id === args['base-screen'] || s.name.toLowerCase() === args['base-screen'].toLowerCase()) : null;
if (args['base-screen'] && !base) {
  console.error(`No Screen "${args['base-screen']}" in this Context.`);
  process.exit(1);
}
const bp = base ? print(base) : null;
if (base) console.log(`Base: "${base.name}" (${base.id}, ${base.chapter} > ${base.slice}): fonts ${bp.fonts.join(' | ') || '-'}; colours ${bp.colours.join(' ') || '-'}; radii ${bp.radii.join(' | ') || '-'}\n`);
let lines = 0;
for (const s of screens.filter(inChapter)) {
  if (s === base) continue;
  if (!s.html) { console.log(`- "${s.name}" (${s.id}, ${s.chapter} > ${s.slice}): ${s.url ? 'shows a web page (url), no html' : 'no mockup'}`); lines++; continue; }
  const p = print(s);
  const same = bp ? `; base colours present ${bp.colours.filter((c) => p.colours.includes(c)).length}/${bp.colours.length}, same fonts: ${bp.fonts.length && bp.fonts.every((f) => p.fonts.includes(f)) ? 'yes' : 'no'}` : '';
  console.log(`- "${s.name}" (${s.id}, ${s.chapter} > ${s.slice}): fonts ${p.fonts.join(' | ') || '-'}; colours ${p.colours.join(' ') || '-'}; radii ${p.radii.join(' | ') || '-'}${same}`);
  lines++;
}
if (!lines) console.log('No Screens in scope.');
