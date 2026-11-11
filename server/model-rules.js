import { randomInt } from 'node:crypto';
import { HttpError } from './http-error.js';

// The board's rules (spec/MODELING_BOARD.md) that the editing API (spec/SERVER.md section 4) needs.
// Types are upper case, as in the stored files (R6.4, R6.5).

export const GRID = 20;
export const SLICE_PADDING = 40; // R5.16
export const SLICE_MIN_WIDTH = 120;
export const DEFAULT_SLICE_WIDTH = 220;
export const snapUp = (v) => Math.ceil(v / GRID) * GRID;

// Lane types in their fixed top-to-bottom order, with the element types each takes (R2.10).
export const LANE_TYPES = {
  ACTOR: { label: 'Actor', takes: ['SCREEN', 'PROCESSOR'] },
  INTERACTION: { label: 'Interaction', takes: ['COMMAND', 'READ_MODEL'] },
  EVENT: { label: 'Event', takes: ['EVENT'] },
  INTEGRATION: { label: 'Integration', takes: ['EVENT', 'READ_MODEL'] },
  SPEC: { label: 'Spec', takes: ['SCENARIOS', 'NOTES'] },
};
export const LANE_ORDER = Object.keys(LANE_TYPES);
export const REQUIRED_LANES = ['ACTOR', 'INTERACTION', 'EVENT'];
export const LANE_COLORS = ['none', 'red', 'orange', 'yellow', 'lime', 'green', 'turquoise', 'blue', 'purple', 'pink', 'brown', 'gray'];
export const NOTE_COLORS = ['red', 'green', 'yellow'];

// Width an element is laid out with and its minimum gap to the slice borders (R5.16, R3.20).
export const KINDS = {
  SCREEN: { w: 160, pad: SLICE_PADDING },
  COMMAND: { w: 160, pad: SLICE_PADDING },
  READ_MODEL: { w: 160, pad: SLICE_PADDING },
  EVENT: { w: 160, pad: SLICE_PADDING },
  PROCESSOR: { w: 160, pad: SLICE_PADDING },
  SCENARIOS: { w: 280, pad: SLICE_PADDING / 2 },
  NOTES: { w: 280, pad: SLICE_PADDING / 2 },
};
export const ELEMENT_TYPES = Object.keys(KINDS);
export const UNCONNECTABLE = ['SCENARIOS', 'NOTES'];
export const FIELD_HOLDERS = ['SCREEN', 'COMMAND', 'EVENT', 'READ_MODEL'];

// Element types an element of each type can point to (R4.7).
export const FLOWS_TO = {
  SCREEN: ['COMMAND'],
  PROCESSOR: ['COMMAND'],
  COMMAND: ['EVENT'],
  EVENT: ['READ_MODEL'],
  READ_MODEL: ['SCREEN', 'PROCESSOR'],
};

export const FIELD_TYPES = ['string', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'uuid', 'object'];
export const FIELD_FLAGS = ['id', 'optional', 'generated', 'pii', 'technical'];

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isText = (v) => typeof v === 'string' && v.trim() !== '';
export const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
export const isExampleValue = (v) =>
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (Array.isArray(v) && v.every(isExampleValue)) ||
  (isObject(v) && Object.values(v).every(isExampleValue));

export function isWebUrl(text) {
  if (typeof text !== 'string' || text !== text.trim() || !text) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// 6 characters of a-zA-Z0-9 from the secure random source (R1.14).
export const randomId = () => Array.from({ length: 6 }, () => ID_CHARS[randomInt(ID_CHARS.length)]).join('');

// The type of a slice from its elements `{ type, laneType }` (R5b.1); Scenarios and Notes do not count.
export function sliceType(elements) {
  const flow = elements.filter((e) => !UNCONNECTABLE.includes(e.type));
  const types = new Set(flow.map((e) => e.type));
  const only = (allowed) => [...types].every((t) => allowed.includes(t));
  if (types.has('PROCESSOR') && types.has('COMMAND') && types.has('EVENT')) {
    return flow.some((e) => e.laneType === 'INTEGRATION') ? 'TRANSLATION' : 'AUTOMATION';
  }
  if (types.size && !types.has('PROCESSOR') && only(['SCREEN', 'COMMAND', 'EVENT']) && types.has('COMMAND') && types.has('EVENT')) {
    return 'STATE_CHANGE';
  }
  if (types.has('READ_MODEL') && only(['READ_MODEL', 'SCREEN'])) return 'STATE_READ';
  return null;
}

const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const byPosition = (a, b) => {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return n(a.x) - n(b.x) || n(a.y) - n(b.y) || compareIds(a.id, b.id);
};

const KEYS = {
  chapter: ['id', 'name', 'info', 'context', 'x', 'y', 'connectsTo', 'lanes', 'slices'],
  lane: ['id', 'name', 'type', 'info', 'color'],
  slice: ['id', 'name', 'info', 'flowEnd', 'type', 'width', 'connectsTo', 'elements'],
  element: ['id', 'type', 'lane', 'name', 'info', 'html', 'url', 'markdown', 'color', 'fields', 'x', 'connectsTo', 'scenarios'],
  copy: ['id', 'type', 'lane', 'copyOf', 'x', 'connectsTo'],
  scenario: ['id', 'name', 'description', 'given', 'when', 'then', 'error'],
  field: ['name', 'type', 'list', ...FIELD_FLAGS, 'fields'],
};

// The keys in the order of `keys` (those not set left out), then any others.
export function ordered(object, keys) {
  const result = {};
  for (const k of keys) if (object[k] !== undefined) result[k] = object[k];
  for (const k of Object.keys(object)) if (!(k in result)) result[k] = object[k];
  return result;
}

export const orderedField = (f) => ({
  ...ordered(f, KEYS.field),
  ...(f.type === 'object' ? { fields: f.fields.map(orderedField) } : {}),
});
export const orderedScenario = (s) => ordered(s, KEYS.scenario);

// The model in the order of R6.8, every item with its keys in the order of R6.3 to R6.5 and the
// slice types worked out (R5b.1), so the same model always gives the same files (R6.9).
// `model` is { contexts, chapters }; it is changed in place.
export function canonical(model) {
  model.chapters.sort(byPosition);
  const order = new Map();
  model.chapters.forEach((c, i) => order.set(c.id, i));
  model.chapters = model.chapters.map((c) => {
    const laneIndex = new Map(c.lanes.map((l, i) => [l.id, i]));
    const laneType = new Map(c.lanes.map((l) => [l.id, l.type]));
    return ordered(
      {
        ...c,
        lanes: c.lanes.map((l) => ordered(l, KEYS.lane)),
        slices: c.slices.map((s) => {
          const elements = [...s.elements]
            .sort((a, b) => a.x - b.x || laneIndex.get(a.lane) - laneIndex.get(b.lane) || compareIds(a.id, b.id))
            .map((e) => ordered(e.scenarios ? { ...e, scenarios: e.scenarios.map(orderedScenario) } : e, e.copyOf ? KEYS.copy : KEYS.element));
          return ordered(
            { ...s, type: sliceType(elements.map((e) => ({ type: e.type, laneType: laneType.get(e.lane) }))), elements },
            KEYS.slice,
          );
        }),
      },
      KEYS.chapter,
    );
  });
  let n = 0;
  for (const c of model.chapters) {
    for (const s of c.slices) for (const e of s.elements) order.set(e.id, n++);
  }
  const byOrder = (a, b) => order.get(a) - order.get(b);
  for (const c of model.chapters) {
    c.connectsTo = [...c.connectsTo].sort(byOrder);
    for (const s of c.slices) {
      s.connectsTo = [...s.connectsTo].sort(byOrder);
      for (const e of s.elements) e.connectsTo = [...e.connectsTo].sort(byOrder);
    }
  }
  return model;
}

// Checks `model` ({ contexts, chapters }) as the board checks a file on pull (R7.4), so what the
// editing API writes can always be pulled. Throws 400 naming the first problem.
export function validateModel({ contexts, chapters }) {
  const fail = (path, message) => {
    throw new HttpError(400, `${path}: ${message}`);
  };
  const used = new Map();
  const claim = (id, kind, path) => {
    if (!isText(id)) fail(path, 'must be a non-empty text');
    if (used.has(id)) fail(path, `duplicate id "${id}"`);
    used.set(id, kind);
  };
  const elements = new Map(); // id -> { chapter, type, copy }
  const links = [];
  const references = [];
  const copies = [];

  const fieldList = (v, path) => {
    if (!Array.isArray(v)) fail(path, 'must be a list');
    const names = new Set();
    v.forEach((f, i) => {
      const fp = `${path}[${i}]`;
      if (!isObject(f) || !isText(f.name)) fail(`${fp}.name`, 'must not be empty');
      if (names.has(f.name)) fail(`${fp}.name`, `field name "${f.name}" is used twice`);
      names.add(f.name);
      if (!FIELD_TYPES.includes(f.type)) fail(`${fp}.type`, `must be one of ${FIELD_TYPES.join(', ')}`);
      for (const k of ['list', ...FIELD_FLAGS]) if (typeof f[k] !== 'boolean') fail(`${fp}.${k}`, 'must be true or false');
      if (f.type === 'object') fieldList(f.fields, `${fp}.fields`);
    });
  };
  const entry = (v, path, chapter, type) => {
    if (!isObject(v) || !isText(v.element)) fail(`${path}.element`, 'must be an element id');
    if (!isObject(v.example) || !isExampleValue(v.example)) fail(`${path}.example`, 'values must be text, true/false, lists or objects of these');
    references.push({ path: `${path}.element`, id: v.element, chapter, type });
  };

  contexts.forEach((c, i) => {
    claim(c.id, 'context', `contexts[${i}].id`);
    if (!isText(c.name)) fail(`contexts[${i}].name`, 'must not be empty');
    if (c.info !== undefined && !isText(c.info)) fail(`contexts[${i}].info`, 'must be left out when empty');
  });
  const contextIds = new Set(contexts.map((c) => c.id));

  chapters.forEach((c, ci) => {
    const cp = `chapters[${ci}]`;
    claim(c.id, 'chapter', `${cp}.id`);
    if (!isText(c.name)) fail(`${cp}.name`, 'must not be empty');
    if (!contextIds.has(c.context)) fail(`${cp}.context`, `no context with id "${c.context}"`);
    if (!isNumber(c.x) || !isNumber(c.y)) fail(`${cp}.x`, 'x and y must be numbers');
    if (!Array.isArray(c.connectsTo)) fail(`${cp}.connectsTo`, 'must be a list');
    links.push({ owner: c.id, kind: 'chapter', path: `${cp}.connectsTo`, ids: c.connectsTo });
    if (!Array.isArray(c.lanes) || !c.lanes.length) fail(`${cp}.lanes`, 'must not be empty');
    if (!Array.isArray(c.slices) || !c.slices.length) fail(`${cp}.slices`, 'must not be empty');

    const laneType = new Map();
    let previous = -1;
    c.lanes.forEach((l, li) => {
      const lp = `${cp}.lanes[${li}]`;
      claim(l.id, 'lane', `${lp}.id`);
      if (!isText(l.name)) fail(`${lp}.name`, 'must not be empty');
      const at = LANE_ORDER.indexOf(l.type);
      if (at < 0) fail(`${lp}.type`, `must be one of ${LANE_ORDER.join(', ')}`);
      if (at < previous) fail(`${lp}.type`, `lanes must be in the order ${LANE_ORDER.join(', ')}`);
      previous = at;
      if (!LANE_COLORS.includes(l.color)) fail(`${lp}.color`, `must be one of ${LANE_COLORS.join(', ')}`);
      if (l.info !== undefined && !isText(l.info)) fail(`${lp}.info`, 'must be left out when empty');
      laneType.set(l.id, l.type);
    });
    for (const type of REQUIRED_LANES) {
      if (![...laneType.values()].includes(type)) fail(`${cp}.lanes`, `needs a ${type} lane`);
    }

    c.slices.forEach((s, si) => {
      const sp = `${cp}.slices[${si}]`;
      claim(s.id, 'slice', `${sp}.id`);
      if (!isText(s.name)) fail(`${sp}.name`, 'must not be empty');
      if (s.info !== undefined && !isText(s.info)) fail(`${sp}.info`, 'must be left out when empty');
      if (s.flowEnd !== undefined && s.flowEnd !== true) fail(`${sp}.flowEnd`, 'must be true, or left out');
      if (!isNumber(s.width) || s.width < SLICE_MIN_WIDTH) fail(`${sp}.width`, `must be at least ${SLICE_MIN_WIDTH}`);
      if (!Array.isArray(s.connectsTo)) fail(`${sp}.connectsTo`, 'must be a list');
      links.push({ owner: s.id, chapter: c.id, kind: 'chapter', path: `${sp}.connectsTo`, ids: s.connectsTo });
      if (!Array.isArray(s.elements)) fail(`${sp}.elements`, 'must be a list');
      const specCells = new Set();
      s.elements.forEach((e, ei) => {
        const ep = `${sp}.elements[${ei}]`;
        claim(e.id, 'element', `${ep}.id`);
        if (!ELEMENT_TYPES.includes(e.type)) fail(`${ep}.type`, `must be one of ${ELEMENT_TYPES.join(', ')}`);
        if (!laneType.has(e.lane)) fail(`${ep}.lane`, `no lane with id "${e.lane}" in this chapter`);
        if (!LANE_TYPES[laneType.get(e.lane)].takes.includes(e.type)) {
          fail(`${ep}.lane`, `a ${laneType.get(e.lane)} lane does not take ${e.type} elements`);
        }
        if (laneType.get(e.lane) === 'SPEC') {
          if (specCells.has(e.lane)) fail(`${ep}.lane`, 'a spec lane holds one element per slice');
          specCells.add(e.lane);
        }
        const isCopy = e.copyOf !== undefined;
        if (isCopy) {
          if (UNCONNECTABLE.includes(e.type)) fail(`${ep}.copyOf`, `a ${e.type} element cannot be a copy`);
          copies.push({ path: `${ep}.copyOf`, id: e.copyOf, type: e.type });
          for (const k of ['name', 'info', 'html', 'url', 'markdown', 'color', 'fields']) {
            if (e[k] !== undefined) fail(`${ep}.${k}`, 'a linked copy has no content of its own');
          }
        } else if (typeof e.name !== 'string') {
          fail(`${ep}.name`, 'must be a text');
        }
        if (e.info !== undefined && (!isText(e.info) || UNCONNECTABLE.includes(e.type))) {
          fail(`${ep}.info`, 'must be a non-empty text, not for a scenarios or notes element');
        }
        if (e.html !== undefined && (!isText(e.html) || e.type !== 'SCREEN')) fail(`${ep}.html`, 'only a screen can have html, not empty');
        if (e.url !== undefined) {
          if (!isWebUrl(e.url) || e.type !== 'SCREEN') fail(`${ep}.url`, 'only a screen can have an http:// or https:// url');
          if (e.html !== undefined) fail(`${ep}.url`, 'a screen has either html or a url, not both');
        }
        if (e.markdown !== undefined && (!isText(e.markdown) || e.type !== 'NOTES')) {
          fail(`${ep}.markdown`, 'only a notes element can have markdown, not empty');
        }
        if (e.color !== undefined && (e.type !== 'NOTES' || !NOTE_COLORS.includes(e.color))) {
          fail(`${ep}.color`, `only a notes element has a color: ${NOTE_COLORS.join(', ')}`);
        }
        if (e.fields !== undefined) {
          if (!FIELD_HOLDERS.includes(e.type)) fail(`${ep}.fields`, `a ${e.type} element has no fields`);
          if (!Array.isArray(e.fields) || !e.fields.length) fail(`${ep}.fields`, 'must be left out when empty');
          fieldList(e.fields, `${ep}.fields`);
        }
        if (!isNumber(e.x)) fail(`${ep}.x`, 'must be a number');
        const { w, pad } = KINDS[e.type];
        if (e.x < pad) fail(`${ep}.x`, `must be at least ${pad}`);
        if (e.x + w + pad > s.width) {
          fail(`${ep}.x`, `the element (x ${e.x}, width ${w}) does not fit in the slice with ${pad}px margins (width ${s.width})`);
        }
        if (!Array.isArray(e.connectsTo)) fail(`${ep}.connectsTo`, 'must be a list');
        links.push({ owner: e.id, kind: 'element', path: `${ep}.connectsTo`, ids: e.connectsTo });
        elements.set(e.id, { chapter: c.id, type: e.type, copy: isCopy });
        if (e.type === 'SCENARIOS') {
          if (!Array.isArray(e.scenarios)) fail(`${ep}.scenarios`, 'must be a list');
          e.scenarios.forEach((sc, k) => {
            const scp = `${ep}.scenarios[${k}]`;
            claim(sc.id, 'scenario', `${scp}.id`);
            if (!isText(sc.name)) fail(`${scp}.name`, 'must not be empty');
            if (typeof sc.description !== 'string') fail(`${scp}.description`, 'must be a text');
            if (!Array.isArray(sc.given) || !Array.isArray(sc.then)) fail(scp, 'given and then must be lists');
            sc.given.forEach((x, i) => entry(x, `${scp}.given[${i}]`, c.id, 'EVENT'));
            if (sc.when !== null) entry(sc.when, `${scp}.when`, c.id, 'COMMAND');
            sc.then.forEach((x, i) => entry(x, `${scp}.then[${i}]`, c.id, 'EVENT'));
            if (sc.error !== null && typeof sc.error !== 'string') fail(`${scp}.error`, 'must be a text or null');
            if (sc.error !== null && sc.then.length) fail(`${scp}.error`, 'must be null when "then" is not empty');
          });
        } else if (e.scenarios !== undefined) {
          fail(`${ep}.scenarios`, 'only a scenarios element has scenarios');
        }
      });
    });
  });

  for (const { path, id, chapter, type } of references) {
    const target = elements.get(id);
    if (!target) fail(path, `no element with id "${id}"`);
    if (target.chapter !== chapter) fail(path, `"${id}" is not an element of the same chapter`);
    if (target.copy) fail(path, `"${id}" is a linked copy`);
    if (target.type !== type) fail(path, `"${id}" must be ${type === 'EVENT' ? 'an event' : 'a command'}`);
  }
  for (const { path, id, type } of copies) {
    const original = elements.get(id);
    if (!original) fail(path, `no element with id "${id}"`);
    if (original.copy) fail(path, `"${id}" is itself a copy`);
    if (original.type !== type) fail(path, `"${id}" must be a ${type} element`);
  }
  for (const { owner, chapter, kind, path, ids } of links) {
    const seen = new Set();
    ids.forEach((t, i) => {
      const p = `${path}[${i}]`;
      if (t === owner) fail(p, 'an item cannot connect to itself');
      if (t === chapter) fail(p, 'a slice cannot connect to its own chapter');
      if (used.get(t) !== kind) fail(p, `no ${kind} with id "${t}"`);
      if (kind === 'element' && (UNCONNECTABLE.includes(elements.get(owner).type) || UNCONNECTABLE.includes(elements.get(t).type))) {
        fail(p, 'a scenarios or notes element cannot be connected');
      }
      if (seen.has(t)) fail(p, `id "${t}" is listed twice`);
      seen.add(t);
    });
  }
}
