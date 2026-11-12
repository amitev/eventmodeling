import { compactHtml } from './html-compact.js';
import { HttpError } from './http-error.js';
import {
  DEFAULT_SLICE_WIDTH,
  DEFAULT_PROCESSOR_ICON,
  ELEMENT_TYPES,
  FIELD_FLAGS,
  FIELD_HOLDERS,
  FIELD_TYPES,
  FLOWS_TO,
  GRID,
  KINDS,
  LANE_COLORS,
  LANE_ORDER,
  LANE_TYPES,
  NOTE_COLORS,
  PROCESSOR_ICONS,
  REQUIRED_LANES,
  SLICE_MIN_WIDTH,
  UNCONNECTABLE,
  canonical,
  isExampleValue,
  isNumber,
  isObject,
  isText,
  isWebUrl,
  orderedField,
  randomId,
  snapUp,
} from './model-rules.js';

// The editing API (spec/SERVER.md section 4). Every operation changes `model` ({ contexts, chapters },
// the stored files in one object) and returns its result, or a function that gives it from the model
// once it is in canonical order. The caller validates the model and writes it.

const bad = (message) => new HttpError(400, message);
const unknown = (what, id) => new HttpError(404, `Unknown ${what} "${id}"`);

function index(model) {
  const ix = {
    contexts: new Map(),
    chapters: new Map(),
    lanes: new Map(),
    slices: new Map(),
    elements: new Map(),
    scenarios: new Map(),
    ids: new Set(),
  };
  for (const c of model.contexts) {
    ix.contexts.set(c.id, c);
    ix.ids.add(c.id);
  }
  for (const chapter of model.chapters) {
    ix.chapters.set(chapter.id, chapter);
    ix.ids.add(chapter.id);
    for (const lane of chapter.lanes) {
      ix.lanes.set(lane.id, { chapter, lane });
      ix.ids.add(lane.id);
    }
    for (const slice of chapter.slices) {
      ix.slices.set(slice.id, { chapter, slice });
      ix.ids.add(slice.id);
      for (const element of slice.elements) {
        ix.elements.set(element.id, { chapter, slice, element });
        ix.ids.add(element.id);
        for (const scenario of element.scenarios ?? []) {
          ix.scenarios.set(scenario.id, { chapter, slice, element, scenario });
          ix.ids.add(scenario.id);
        }
      }
    }
  }
  return ix;
}

function newId(ix) {
  let id;
  do id = randomId();
  while (ix.ids.has(id));
  ix.ids.add(id);
  return id;
}

// The item of `kind` ('chapters', 'lanes', ...) with `id`, taken from the final model.
const lookup = (kind, id) => (model) => {
  const hit = index(model)[kind].get(id);
  const own = { lanes: 'lane', slices: 'slice', elements: 'element', scenarios: 'scenario' }[kind];
  return own ? hit[own] : hit;
};

function body(value, allowed) {
  const b = value ?? {};
  if (!isObject(b)) throw bad('Body must be an object');
  for (const k of Object.keys(b)) {
    if (!allowed.includes(k)) throw bad(`Unknown field "${k}"; allowed: ${allowed.join(', ')}`);
  }
  return b;
}

const text = (v, what) => {
  if (!isText(v)) throw bad(`${what} must be a text, not empty`);
  return v.trim();
};
const grid = (v, what) => {
  if (!Number.isInteger(v) || v % GRID !== 0) throw bad(`${what} must be a whole multiple of ${GRID}`);
  return v;
};
const found = (map, id, what) => {
  const hit = map.get(id);
  if (!hit) throw unknown(what, id);
  return hit;
};
// A reference in a body: unknown means an invalid value (400), not a missing resource.
const referenced = (map, id, what) => {
  const hit = map.get(id);
  if (!hit) throw bad(`Unknown ${what} "${id}"`);
  return hit;
};

// `null` or empty text removes an optional text field.
function setOptional(item, key, v) {
  if (v === null || v === '') delete item[key];
  else if (typeof v === 'string') item[key] = v;
  else throw bad(`${key} must be a text or null`);
}

// Fields (R9.6) with the defaults the board gives a new field.
function fieldList(v, path = 'fields') {
  if (!Array.isArray(v)) throw bad(`${path} must be a list`);
  const names = new Set();
  return v.map((f, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(f)) throw bad(`${p} must be an object`);
    for (const k of Object.keys(f)) {
      if (!['name', 'type', 'list', ...FIELD_FLAGS, 'fields'].includes(k)) throw bad(`${p}: unknown field "${k}"`);
    }
    const name = text(f.name, `${p}.name`);
    if (names.has(name)) throw bad(`${p}.name: field name "${name}" is used twice`);
    names.add(name);
    const type = f.type ?? 'string';
    if (!FIELD_TYPES.includes(type)) throw bad(`${p}.type must be one of ${FIELD_TYPES.join(', ')}`);
    const flags = {};
    for (const k of ['list', ...FIELD_FLAGS]) {
      const value = f[k] ?? false;
      if (typeof value !== 'boolean') throw bad(`${p}.${k} must be true or false`);
      flags[k] = value;
    }
    if (type !== 'object' && f.fields !== undefined) throw bad(`${p}.fields: only an object field has fields`);
    return orderedField({ name, type, ...flags, ...(type === 'object' ? { fields: fieldList(f.fields ?? [], `${p}.fields`) } : {}) });
  });
}

// ---------- Fields along arrows (R9.4) ----------

const fieldsOf = (byId, n) => (n.copyOf ? byId.get(n.copyOf)?.fields : n.fields) ?? [];
const isHolder = (n) => !!n && FIELD_HOLDERS.includes(n.type);

function mergeFields(own, incoming) {
  const result = structuredClone(own ?? []);
  for (const f of structuredClone(incoming)) {
    const i = result.findIndex((r) => r.name === f.name);
    if (i === -1) result.push(f);
    else result[i] = f;
  }
  return result;
}

function sources(byId, edges, id, seen = new Set()) {
  const n = byId.get(id);
  if (!n || seen.has(id)) return [];
  if (n.type === 'PROCESSOR') {
    seen.add(id);
    return edges.filter((e) => e[1] === id).flatMap((e) => sources(byId, edges, e[0], seen));
  }
  return isHolder(n) ? [n] : [];
}

function targets(byId, edges, id, seen = new Set()) {
  const n = byId.get(id);
  if (!n || seen.has(id)) return [];
  if (n.type === 'PROCESSOR') {
    seen.add(id);
    return edges.filter((e) => e[0] === id).flatMap((e) => targets(byId, edges, e[1], seen));
  }
  return isHolder(n) && !n.copyOf ? [n] : [];
}

// The arrow from -> to was added: the fields of the source are copied to the target (R9.4).
function inheritFields(model, from, to) {
  const byId = new Map();
  const edges = [];
  for (const c of model.chapters) {
    for (const s of c.slices) {
      for (const e of s.elements) {
        byId.set(e.id, e);
        for (const t of e.connectsTo) edges.push([e.id, t]);
      }
    }
  }
  for (const src of sources(byId, edges, from.id)) {
    const fields = fieldsOf(byId, src);
    if (!fields.length) continue;
    for (const dst of targets(byId, edges, to.id)) {
      if (dst.id !== src.id) dst.fields = mergeFields(dst.fields, fields);
    }
  }
}

function addArrow(model, from, to) {
  if (from.connectsTo.includes(to.id)) return false;
  from.connectsTo.push(to.id);
  inheritFields(model, from, to);
  return true;
}

// The arrows a new element gets (R4.8), as [source, target] element pairs.
function autoPairs(chapter, slice, el) {
  const laneAt = (id) => chapter.lanes.findIndex((l) => l.id === id);
  const me = laneAt(el.lane);
  const others = slice.elements.filter((e) => e !== el);
  const gap = (e) => Math.abs(laneAt(e.lane) - me);
  const nearest = (list) => list.reduce((best, e) => (!best || gap(e) < gap(best) ? e : best), null);
  const above = (t) => nearest(others.filter((e) => e.type === t && laneAt(e.lane) < me));
  const below = (t) => nearest(others.filter((e) => e.type === t && laneAt(e.lane) > me));
  const pairs = [];
  if (el.type === 'COMMAND') {
    const screen = above('SCREEN');
    if (screen) pairs.push([screen, el]);
    const processor = nearest(others.filter((e) => e.type === 'PROCESSOR'));
    if (processor) pairs.push([processor, el]);
  }
  if (el.type === 'EVENT') {
    const command = above('COMMAND');
    if (command) pairs.push([command, el]);
  }
  if (el.type === 'SCREEN') {
    const readModel = below('READ_MODEL');
    if (readModel) pairs.push([readModel, el]);
  }
  if (el.type === 'PROCESSOR') {
    const readModel = nearest(others.filter((e) => e.type === 'READ_MODEL'));
    if (readModel) pairs.push([readModel, el]);
  }
  if (el.type === 'READ_MODEL') {
    const screen = above('SCREEN');
    if (screen) pairs.push([el, screen]);
    const previous = chapter.slices[chapter.slices.indexOf(slice) - 1];
    const right = (e) => e.x + KINDS[e.type].w;
    const event = (previous?.elements ?? [])
      .filter((e) => e.type === 'EVENT')
      .reduce((best, e) => (!best || right(e) > right(best) || (right(e) === right(best) && gap(e) < gap(best)) ? e : best), null);
    if (event) pairs.push([event, el]);
  }
  return pairs;
}

// ---------- Placing and removing elements ----------

// The `x` of an element in `lane` of `slice` (R5a.10, R5.14, R5.17): `x` as given, else the first free
// spot. The slice grows to fit it. `except` is an element of the slice that is being moved.
function place(slice, lane, type, x, except) {
  const { w, pad } = KINDS[type];
  const cell = slice.elements.filter((e) => e.lane === lane.id && e !== except);
  if (lane.type === 'SPEC' && cell.length) throw bad('A Spec lane holds one element per Cell (R3.21)');
  if (x !== undefined) {
    if (!isNumber(x) || x < pad) throw bad(`x must be a number, at least ${pad}`);
  } else if (!cell.length) {
    const width = Math.max(slice.width, snapUp(w + 2 * pad));
    slice.width = width;
    x = lane.type === 'SPEC' ? pad : Math.floor((width - w) / 2);
  } else {
    const left = pad;
    const lastFit = slice.width - pad - w;
    const free = (at) => !cell.some((m) => at < m.x + KINDS[m.type].w + GRID && m.x < at + w + GRID);
    x = left;
    while (x <= lastFit && !free(x)) x += GRID;
    if (x > lastFit) {
      const after = cell.reduce((m, e) => Math.max(m, e.x + KINDS[e.type].w), left - GRID);
      x = Math.max(left, snapUp(after + GRID));
    }
  }
  slice.width = Math.max(slice.width, snapUp(x + w + pad));
  return x;
}

// Removes the elements `ids`, their linked copies (R3.22), every arrow to them and the scenarios
// that use them (R3.17). Returns what went.
function removeElements(model, ids) {
  const gone = new Set(ids);
  for (const c of model.chapters) {
    for (const s of c.slices) for (const e of s.elements) if (e.copyOf && gone.has(e.copyOf)) gone.add(e.id);
  }
  const scenarios = [];
  const usesGone = (sc) => [...sc.given, ...(sc.when ? [sc.when] : []), ...sc.then].some((x) => gone.has(x.element));
  for (const c of model.chapters) {
    for (const s of c.slices) {
      s.elements = s.elements.filter((e) => !gone.has(e.id));
      for (const e of s.elements) {
        e.connectsTo = e.connectsTo.filter((t) => !gone.has(t));
        if (e.scenarios) {
          scenarios.push(...e.scenarios.filter(usesGone).map((sc) => sc.id));
          e.scenarios = e.scenarios.filter((sc) => !usesGone(sc));
        }
      }
    }
  }
  return { elements: [...gone], scenarios };
}

// ---------- Reads ----------

const nameOf = (ix, e) => (e.copyOf ? ix.elements.get(e.copyOf)?.element.name : e.name) ?? '';

function rules() {
  return {
    elementTypes: ELEMENT_TYPES,
    laneTypes: LANE_ORDER.map((type) => ({ type, label: LANE_TYPES[type].label, takes: LANE_TYPES[type].takes })),
    connections: Object.entries(FLOWS_TO).flatMap(([from, list]) => list.map((to) => ({ from, to }))),
    laneColors: LANE_COLORS,
    noteColors: NOTE_COLORS,
    processorIcons: PROCESSOR_ICONS,
    fieldTypes: FIELD_TYPES,
    fieldFlags: FIELD_FLAGS,
  };
}

function outline(model, { query }) {
  const ix = index(model);
  if (query.context !== undefined && !ix.contexts.has(query.context)) throw unknown('context', query.context);
  return model.contexts
    .filter((c) => query.context === undefined || c.id === query.context)
    .map((c) => ({
      id: c.id,
      name: c.name,
      chapters: model.chapters
        .filter((ch) => ch.context === c.id)
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          x: ch.x,
          y: ch.y,
          connectsTo: ch.connectsTo,
          lanes: ch.lanes.map((l) => ({ id: l.id, name: l.name, type: l.type })),
          slices: ch.slices.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            ...(s.flowEnd ? { flowEnd: true } : {}),
            width: s.width,
            connectsTo: s.connectsTo,
            elements: s.elements.map((e) => ({
              id: e.id,
              type: e.type,
              name: nameOf(ix, e),
              lane: e.lane,
              x: e.x,
              ...(e.copyOf ? { copyOf: e.copyOf } : {}),
              connectsTo: e.connectsTo,
            })),
          })),
        })),
    }));
}

function search(model, { query }) {
  const ix = index(model);
  const { q, type, context } = query;
  if ([q, type, context].some((v) => v !== undefined && typeof v !== 'string')) throw bad('q, type and context must be text');
  if (type !== undefined && !ELEMENT_TYPES.includes(type)) throw bad(`type must be one of ${ELEMENT_TYPES.join(', ')}`);
  if (context !== undefined && !ix.contexts.has(context)) throw unknown('context', context);
  const part = (q ?? '').trim().toLowerCase();
  const found = [];
  for (const c of model.chapters) {
    if (context !== undefined && c.context !== context) continue;
    for (const s of c.slices) {
      for (const e of s.elements) {
        const name = nameOf(ix, e);
        if ((type === undefined || e.type === type) && name.toLowerCase().includes(part)) {
          found.push({ id: e.id, type: e.type, name, chapterId: c.id, sliceId: s.id, lane: e.lane });
        }
      }
    }
  }
  return found;
}

function getChapter(model, { params, query }) {
  const { screenContent = 'true', slice } = query;
  if (screenContent !== 'true' && screenContent !== 'false') throw bad('screenContent must be true or false');
  if (slice !== undefined && typeof slice !== 'string') throw bad('slice must be text');
  const chapter = structuredClone(found(index(model).chapters, params.id, 'chapter'));
  if (slice !== undefined) {
    chapter.slices = chapter.slices.filter((s) => s.id === slice);
    if (!chapter.slices.length) throw unknown('slice', slice);
  }
  if (screenContent === 'false') {
    for (const s of chapter.slices) for (const e of s.elements) if (e.type === 'SCREEN') delete e.html;
  }
  return chapter;
}

// ---------- Contexts ----------

function createContext(model, { body: b }) {
  const { name, info } = body(b, ['name', 'info']);
  const ix = index(model);
  const context = { id: newId(ix), name: text(name, 'name') };
  if (info !== undefined) setOptional(context, 'info', info);
  model.contexts.push(context);
  return { ...context };
}

function patchContext(model, { params, body: b }) {
  const p = body(b, ['name', 'info']);
  const context = found(index(model).contexts, params.id, 'context');
  if ('name' in p) context.name = text(p.name, 'name');
  if ('info' in p) setOptional(context, 'info', p.info);
  return { ...context };
}

function deleteContext(model, { params }) {
  const context = found(index(model).contexts, params.id, 'context');
  if (model.contexts[0] === context) throw new HttpError(409, 'The Default context cannot be deleted (R1b.3)');
  const moved = [];
  for (const c of model.chapters) {
    if (c.context === context.id) {
      c.context = model.contexts[0].id;
      moved.push(c.id);
    }
  }
  model.contexts = model.contexts.filter((c) => c !== context);
  return { moved };
}

// ---------- Chapters ----------

function createChapter(model, { body: b }) {
  const { context, name, x = 0, y = 0 } = body(b, ['context', 'name', 'x', 'y']);
  const ix = index(model);
  referenced(ix.contexts, context, 'context');
  const chapter = {
    id: newId(ix),
    name: text(name, 'name'),
    context,
    x: grid(x, 'x'),
    y: grid(y, 'y'),
    connectsTo: [],
    lanes: ['ACTOR', 'INTERACTION', 'EVENT'].map((type) => ({ id: newId(ix), name: LANE_TYPES[type].label, type, color: 'none' })),
    slices: [{ id: newId(ix), name: 'New Slice', width: DEFAULT_SLICE_WIDTH, connectsTo: [], elements: [] }],
  };
  model.chapters.push(chapter);
  return lookup('chapters', chapter.id);
}

function patchChapter(model, { params, body: b }) {
  const p = body(b, ['name', 'info', 'context', 'x', 'y']);
  const ix = index(model);
  const chapter = found(ix.chapters, params.id, 'chapter');
  if ('name' in p) chapter.name = text(p.name, 'name');
  if ('info' in p) setOptional(chapter, 'info', p.info);
  if ('context' in p) {
    referenced(ix.contexts, p.context, 'context');
    chapter.context = p.context;
  }
  if ('x' in p) chapter.x = grid(p.x, 'x');
  if ('y' in p) chapter.y = grid(p.y, 'y');
  return lookup('chapters', chapter.id);
}

function deleteChapter(model, { params }) {
  const chapter = found(index(model).chapters, params.id, 'chapter');
  const removed = removeElements(model, chapter.slices.flatMap((s) => s.elements.map((e) => e.id)));
  model.chapters = model.chapters.filter((c) => c !== chapter);
  for (const c of model.chapters) {
    c.connectsTo = c.connectsTo.filter((t) => t !== chapter.id);
    for (const s of c.slices) s.connectsTo = s.connectsTo.filter((t) => t !== chapter.id);
  }
  return { removed };
}

function connectChapters(model, { params }) {
  const ix = index(model);
  const from = found(ix.chapters, params.id, 'chapter');
  const to = found(ix.chapters, params.targetId, 'chapter');
  if (from === to) throw bad('A Chapter cannot connect to itself (R1a.10)');
  if (from.connectsTo.includes(to.id)) throw bad('The Chapters are already connected (R4.5)');
  from.connectsTo.push(to.id);
  return { from: from.id, to: to.id };
}

function disconnectChapters(model, { params }) {
  const ix = index(model);
  const from = found(ix.chapters, params.id, 'chapter');
  found(ix.chapters, params.targetId, 'chapter');
  if (!from.connectsTo.includes(params.targetId)) throw new HttpError(404, 'The Chapters are not connected');
  from.connectsTo = from.connectsTo.filter((t) => t !== params.targetId);
  return { from: from.id, to: params.targetId };
}

// ---------- Lanes ----------

function createLane(model, { params, body: b }) {
  const { type, after, name, color = 'none', info } = body(b, ['type', 'after', 'name', 'color', 'info']);
  const ix = index(model);
  const chapter = found(ix.chapters, params.id, 'chapter');
  if (!LANE_ORDER.includes(type)) throw bad(`type must be one of ${LANE_ORDER.join(', ')}`);
  const at = chapter.lanes.findIndex((l) => l.id === after);
  if (at < 0) throw bad(`after must be the id of a lane of this Chapter`);
  const rank = LANE_ORDER.indexOf(type);
  const next = chapter.lanes[at + 1];
  if (rank < LANE_ORDER.indexOf(chapter.lanes[at].type) || (next && rank > LANE_ORDER.indexOf(next.type))) {
    throw bad(`A ${type} lane cannot go there: lanes keep the order ${LANE_ORDER.join(', ')} (R2.10)`);
  }
  if (!LANE_COLORS.includes(color)) throw bad(`color must be one of ${LANE_COLORS.join(', ')}`);
  const lane = { id: newId(ix), name: name === undefined ? LANE_TYPES[type].label : text(name, 'name'), type, color };
  if (info !== undefined) setOptional(lane, 'info', info);
  chapter.lanes.splice(at + 1, 0, lane);
  return lookup('lanes', lane.id);
}

function patchLane(model, { params, body: b }) {
  const p = body(b, ['name', 'info', 'color']);
  const { lane } = found(index(model).lanes, params.id, 'lane');
  if ('name' in p) lane.name = text(p.name, 'name');
  if ('info' in p) setOptional(lane, 'info', p.info);
  if ('color' in p) {
    if (!LANE_COLORS.includes(p.color)) throw bad(`color must be one of ${LANE_COLORS.join(', ')}`);
    lane.color = p.color;
  }
  return lookup('lanes', lane.id);
}

function deleteLane(model, { params }) {
  const { chapter, lane } = found(index(model).lanes, params.id, 'lane');
  if (REQUIRED_LANES.includes(lane.type) && chapter.lanes.filter((l) => l.type === lane.type).length === 1) {
    throw new HttpError(409, `The last ${lane.type} lane of a Chapter cannot be deleted (R2.5)`);
  }
  const removed = removeElements(
    model,
    chapter.slices.flatMap((s) => s.elements.filter((e) => e.lane === lane.id).map((e) => e.id)),
  );
  chapter.lanes = chapter.lanes.filter((l) => l !== lane);
  return { removed };
}

// ---------- Slices ----------

const sliceWidth = (v) => {
  grid(v, 'width');
  if (v < SLICE_MIN_WIDTH) throw bad(`width must be at least ${SLICE_MIN_WIDTH}`);
  return v;
};

const minWidth = (slice) =>
  Math.max(SLICE_MIN_WIDTH, snapUp(slice.elements.reduce((m, e) => Math.max(m, e.x + KINDS[e.type].w + KINDS[e.type].pad), 0)));

function createSlice(model, { params, body: b }) {
  const { name = 'New Slice', after, width = DEFAULT_SLICE_WIDTH } = body(b, ['name', 'after', 'width']);
  const ix = index(model);
  const chapter = found(ix.chapters, params.id, 'chapter');
  let at = chapter.slices.length - 1;
  if (after !== undefined) {
    at = chapter.slices.findIndex((s) => s.id === after);
    if (at < 0) throw bad('after must be the id of a slice of this Chapter');
  }
  const slice = { id: newId(ix), name: text(name, 'name'), width: sliceWidth(width), connectsTo: [], elements: [] };
  chapter.slices.splice(at + 1, 0, slice);
  return lookup('slices', slice.id);
}

function patchSlice(model, { params, body: b }) {
  const p = body(b, ['name', 'info', 'flowEnd', 'width', 'index']);
  const { chapter, slice } = found(index(model).slices, params.id, 'slice');
  if ('name' in p) slice.name = text(p.name, 'name');
  if ('info' in p) setOptional(slice, 'info', p.info);
  if ('flowEnd' in p) {
    if (p.flowEnd === true) slice.flowEnd = true;
    else if (p.flowEnd === false || p.flowEnd === null) delete slice.flowEnd;
    else throw bad('flowEnd must be true, false or null');
  }
  if ('width' in p) {
    const width = sliceWidth(p.width);
    if (width < minWidth(slice)) throw bad(`width must be at least ${minWidth(slice)} for the elements in the slice (R5.16)`);
    slice.width = width;
  }
  if ('index' in p) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= chapter.slices.length) {
      throw bad(`index must be a whole number from 0 to ${chapter.slices.length - 1}`);
    }
    chapter.slices.splice(chapter.slices.indexOf(slice), 1);
    chapter.slices.splice(p.index, 0, slice);
  }
  return lookup('slices', slice.id);
}

function deleteSlice(model, { params }) {
  const { chapter, slice } = found(index(model).slices, params.id, 'slice');
  if (chapter.slices.length === 1) throw new HttpError(409, "A Chapter's last slice cannot be deleted (R5.19)");
  const removed = removeElements(model, slice.elements.map((e) => e.id));
  chapter.slices = chapter.slices.filter((s) => s !== slice);
  return { removed };
}

function connectSliceToChapter(model, { params }) {
  const ix = index(model);
  const { chapter, slice } = found(ix.slices, params.id, 'slice');
  const to = found(ix.chapters, params.targetId, 'chapter');
  if (chapter === to) throw bad('A slice cannot connect to its own Chapter');
  if (chapter.context !== to.context) throw bad('Chapters must be in the same Context');
  if (slice.connectsTo.includes(to.id)) throw bad('The slice is already connected to this Chapter');
  slice.connectsTo.push(to.id);
  return { from: slice.id, to: to.id };
}

function disconnectSliceFromChapter(model, { params }) {
  const ix = index(model);
  const { slice } = found(ix.slices, params.id, 'slice');
  found(ix.chapters, params.targetId, 'chapter');
  if (!slice.connectsTo.includes(params.targetId)) throw new HttpError(404, 'The slice is not connected to this Chapter');
  slice.connectsTo = slice.connectsTo.filter((t) => t !== params.targetId);
  return { from: slice.id, to: params.targetId };
}

// ---------- Elements ----------

// Sets the content fields of `el` (R6.5) from `p`.
function applyContent(el, p) {
  const type = el.type;
  const only = (key, types) => {
    if (!types.includes(type)) throw bad(`A ${type} element has no ${key}`);
  };
  if ('name' in p) {
    if (p.name !== null && typeof p.name !== 'string') throw bad('name must be a text');
    if (UNCONNECTABLE.includes(type) && p.name) throw bad(`A ${type} element has no name`);
    el.name = p.name ?? '';
  }
  if ('info' in p) {
    if (UNCONNECTABLE.includes(type)) throw bad(`A ${type} element has no info`);
    setOptional(el, 'info', p.info);
  }
  if ('icon' in p) {
    only('icon', ['PROCESSOR']);
    if (p.icon === null) delete el.icon;
    else if (PROCESSOR_ICONS.includes(p.icon)) el.icon = p.icon;
    else throw bad(`icon must be one of ${PROCESSOR_ICONS.join(', ')}, or null for the default`);
  }
  if ('isList' in p) {
    only('isList', ['READ_MODEL']);
    if (p.isList === true) el.isList = true;
    else if (p.isList === false || p.isList === null) delete el.isList;
    else throw bad('isList must be true, false or null');
  }
  if (p.html && p.url) throw bad('A Screen has html or a url, not both (R3.7)');
  if ('html' in p) {
    only('html', ['SCREEN']);
    setOptional(el, 'html', p.html);
    if (el.html !== undefined) {
      el.html = compactHtml(el.html);
      delete el.url;
    }
  }
  if ('url' in p) {
    only('url', ['SCREEN']);
    if (p.url !== null && p.url !== '' && !isWebUrl(p.url)) throw bad('url must be an http:// or https:// address');
    setOptional(el, 'url', p.url);
    if (el.url !== undefined) delete el.html;
  }
  if ('markdown' in p) {
    only('markdown', ['NOTES']);
    setOptional(el, 'markdown', p.markdown);
  }
  if ('color' in p) {
    only('color', ['NOTES']);
    if (p.color !== null && !NOTE_COLORS.includes(p.color)) throw bad(`color must be one of ${NOTE_COLORS.join(', ')}, or null for white`);
    setOptional(el, 'color', p.color);
  }
  if ('fields' in p) {
    only('fields', FIELD_HOLDERS);
    const fields = p.fields === null ? [] : fieldList(p.fields);
    if (fields.length) el.fields = fields;
    else delete el.fields;
  }
}

const CONTENT = ['name', 'info', 'icon', 'isList', 'html', 'url', 'markdown', 'color', 'fields'];

function laneOf(chapter, id, type) {
  const lane = chapter.lanes.find((l) => l.id === id);
  if (!lane) throw bad('lane must be the id of a lane of the slice\'s Chapter');
  if (!LANE_TYPES[lane.type].takes.includes(type)) {
    throw bad(`A ${lane.type} lane does not take ${type} elements; it takes ${LANE_TYPES[lane.type].takes.join(', ')} (R2.10)`);
  }
  return lane;
}

function createElement(model, { body: b }) {
  const p = body(b, ['slice', 'lane', 'type', 'copyOf', 'x', 'autoConnect', ...CONTENT]);
  const ix = index(model);
  const { chapter, slice } = referenced(ix.slices, p.slice, 'slice');
  if (p.autoConnect !== undefined && typeof p.autoConnect !== 'boolean') throw bad('autoConnect must be true or false');
  let el;
  if (p.copyOf !== undefined) {
    if (p.type !== undefined || CONTENT.some((k) => k in p)) throw bad('A linked copy takes only slice, lane, copyOf, x and autoConnect (R3.22)');
    const original = referenced(ix.elements, p.copyOf, 'element').element;
    if (original.copyOf) throw bad(`"${p.copyOf}" is itself a copy: copy its original "${original.copyOf}"`);
    if (UNCONNECTABLE.includes(original.type)) throw bad(`A ${original.type} element cannot be copied (R3.22)`);
    el = { id: newId(ix), type: original.type, lane: p.lane, copyOf: original.id, x: 0, connectsTo: [] };
  } else {
    if (!ELEMENT_TYPES.includes(p.type)) throw bad(`type must be one of ${ELEMENT_TYPES.join(', ')}`);
    el = {
      id: newId(ix),
      type: p.type,
      lane: p.lane,
      name: '',
      x: 0,
      connectsTo: [],
      ...(p.type === 'PROCESSOR' ? { icon: DEFAULT_PROCESSOR_ICON } : {}),
      ...(p.type === 'SCENARIOS' ? { scenarios: [] } : {}),
    };
    applyContent(el, p);
  }
  const lane = laneOf(chapter, p.lane, el.type);
  el.x = place(slice, lane, el.type, p.x);
  slice.elements.push(el);
  if (p.autoConnect !== false) {
    for (const [from, to] of autoPairs(chapter, slice, el)) addArrow(model, from, to);
  }
  return lookup('elements', el.id);
}

function patchElement(model, { params, body: b }) {
  const p = body(b, ['slice', 'lane', 'x', ...CONTENT]);
  const ix = index(model);
  const { chapter, slice, element: el } = found(ix.elements, params.id, 'element');
  if (el.copyOf) {
    const content = CONTENT.find((k) => k in p);
    if (content) throw new HttpError(409, `"${el.id}" is a linked copy: change its original "${el.copyOf}"`);
  }
  applyContent(el, p);
  if ('slice' in p || 'lane' in p) {
    if (!('slice' in p && 'lane' in p)) throw bad('slice and lane come together');
    const target = referenced(ix.slices, p.slice, 'slice');
    const lane = laneOf(target.chapter, p.lane, el.type);
    if (target.chapter !== chapter) {
      if (el.type === 'SCENARIOS') throw new HttpError(409, 'A Scenarios element cannot move to another Chapter');
      removeScenariosUsing(model, el.id);
    }
    const moved = target.slice !== slice || p.lane !== el.lane;
    el.x = place(target.slice, lane, el.type, 'x' in p ? p.x : moved ? undefined : el.x, el);
    slice.elements = slice.elements.filter((e) => e !== el);
    el.lane = lane.id;
    target.slice.elements.push(el);
  } else if ('x' in p) {
    el.x = place(slice, chapter.lanes.find((l) => l.id === el.lane), el.type, p.x, el);
  }
  return lookup('elements', el.id);
}

// The element left its Chapter: the scenarios that use it go (R3.17).
function removeScenariosUsing(model, id) {
  const usesIt = (sc) => [...sc.given, ...(sc.when ? [sc.when] : []), ...sc.then].some((x) => x.element === id);
  for (const c of model.chapters) {
    for (const s of c.slices) for (const e of s.elements) if (e.scenarios) e.scenarios = e.scenarios.filter((sc) => !usesIt(sc));
  }
}

function deleteElement(model, { params }) {
  found(index(model).elements, params.id, 'element');
  return { removed: removeElements(model, [params.id]) };
}

// ---------- Connections ----------

function connection(model, b) {
  const { from, to } = body(b, ['from', 'to']);
  const ix = index(model);
  let source = referenced(ix.elements, from, 'element').element;
  let target = referenced(ix.elements, to, 'element').element;
  if (source === target) throw bad('An element cannot connect to itself (R4.6)');
  if (UNCONNECTABLE.includes(source.type) || UNCONNECTABLE.includes(target.type)) {
    throw bad('A Scenarios or Notes element cannot be connected (R4.7)');
  }
  if (!FLOWS_TO[source.type]?.includes(target.type)) {
    if (!FLOWS_TO[target.type]?.includes(source.type)) throw bad(`A ${source.type} and a ${target.type} cannot be connected (R4.7)`);
    [source, target] = [target, source];
  }
  return { source, target };
}

function createConnection(model, { body: b }) {
  const { source, target } = connection(model, b);
  if (!addArrow(model, source, target)) throw bad('The elements are already connected (R4.5)');
  return { from: source.id, to: target.id };
}

function deleteConnection(model, { body: b }) {
  const { source, target } = connection(model, b);
  if (!source.connectsTo.includes(target.id)) throw new HttpError(404, 'The elements are not connected');
  source.connectsTo = source.connectsTo.filter((t) => t !== target.id);
  return { from: source.id, to: target.id };
}

// ---------- Scenarios ----------

function entry(ix, chapter, v, type, what) {
  const e = body(v, ['element', 'example']);
  const target = referenced(ix.elements, e.element, 'element');
  if (target.chapter !== chapter) throw bad(`${what}: "${e.element}" is not an element of the same Chapter`);
  if (target.element.copyOf) throw bad(`${what}: "${e.element}" is a linked copy`);
  if (target.element.type !== type) throw bad(`${what}: "${e.element}" must be ${type === 'EVENT' ? 'an Event' : 'a Command'}`);
  const example = e.example ?? {};
  if (!isObject(example) || !isExampleValue(example)) throw bad(`${what}.example: values must be text, true/false, lists or objects of these`);
  return { element: e.element, example };
}

function applyScenario(ix, chapter, scenario, p) {
  if ('name' in p) scenario.name = text(p.name, 'name');
  if ('description' in p) {
    if (typeof p.description !== 'string') throw bad('description must be a text');
    scenario.description = p.description;
  }
  const list = (k, type) => {
    if (!Array.isArray(p[k])) throw bad(`${k} must be a list`);
    return p[k].map((v, i) => entry(ix, chapter, v, type, `${k}[${i}]`));
  };
  if ('given' in p) scenario.given = list('given', 'EVENT');
  if ('when' in p) scenario.when = p.when === null ? null : entry(ix, chapter, p.when, 'COMMAND', 'when');
  if ('then' in p) scenario.then = list('then', 'EVENT');
  if ('error' in p) {
    if (p.error !== null && typeof p.error !== 'string') throw bad('error must be a text or null');
    scenario.error = p.error;
  }
  if (scenario.error !== null && scenario.then.length) throw bad('error must be null when then is not empty (R3.15)');
}

const SCENARIO_KEYS = ['name', 'description', 'given', 'when', 'then', 'error'];

function insertAt(list, item, at) {
  if (at !== undefined && (!Number.isInteger(at) || at < 0 || at > list.length)) {
    throw bad(`index must be a whole number from 0 to ${list.length}`);
  }
  list.splice(at ?? list.length, 0, item);
}

function createScenario(model, { params, body: b }) {
  const p = body(b, [...SCENARIO_KEYS, 'index']);
  const ix = index(model);
  const { chapter, element } = found(ix.elements, params.id, 'element');
  if (element.type !== 'SCENARIOS') throw bad(`A ${element.type} element has no scenarios`);
  const scenario = { id: newId(ix), name: '', description: '', given: [], when: null, then: [], error: null };
  text(p.name, 'name');
  applyScenario(ix, chapter, scenario, p);
  insertAt(element.scenarios, scenario, p.index);
  return lookup('scenarios', scenario.id);
}

function patchScenario(model, { params, body: b }) {
  const p = body(b, [...SCENARIO_KEYS, 'index']);
  const ix = index(model);
  const { chapter, element, scenario } = found(ix.scenarios, params.id, 'scenario');
  applyScenario(ix, chapter, scenario, p);
  if ('index' in p) {
    element.scenarios = element.scenarios.filter((s) => s !== scenario);
    insertAt(element.scenarios, scenario, p.index);
  }
  return lookup('scenarios', scenario.id);
}

function deleteScenario(model, { params }) {
  const { element, scenario } = found(index(model).scenarios, params.id, 'scenario');
  element.scenarios = element.scenarios.filter((s) => s !== scenario);
  return { removed: scenario.id };
}

function copyScenario(model, { params }) {
  const ix = index(model);
  const { element, scenario } = found(ix.scenarios, params.id, 'scenario');
  const copy = { ...structuredClone(scenario), id: newId(ix) };
  element.scenarios.splice(element.scenarios.indexOf(scenario) + 1, 0, copy);
  return lookup('scenarios', copy.id);
}

// ---------- Batch ----------

function substitute(value, names) {
  if (typeof value === 'string') return value.startsWith('$') && names.has(value.slice(1)) ? names.get(value.slice(1)) : value;
  if (Array.isArray(value)) return value.map((v) => substitute(v, names));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, names)]));
  return value;
}

function ops(model, { body: b }) {
  const { ops: list } = body(b, ['ops']);
  if (!Array.isArray(list) || !list.length) throw bad('ops must be a list of requests, not empty');
  const names = new Map();
  const results = [];
  list.forEach((op, i) => {
    try {
      const { method, path, body: opBody, as, ...rest } = isObject(op) ? op : {};
      if (typeof method !== 'string' || typeof path !== 'string' || Object.keys(rest).length) {
        throw bad('Every op is { method, path, body?, as? }');
      }
      const segments = path.split('/').map((s) => substitute(decodeURIComponent(s), names));
      const hit = findRoute(method.toUpperCase(), segments.map(encodeURIComponent).join('/'));
      if (!hit || !hit.route.write || hit.route.pattern === '/ops') throw bad(`${method} ${path} is not an editing request`);
      const out = execute(model, hit, {}, substitute(opBody, names));
      if (as !== undefined) {
        if (!isText(as) || names.has(as)) throw bad('as must be a name not used before');
        if (!out.body?.id) throw bad(`${method} ${path} creates no item to name`);
        names.set(as, out.body.id);
      }
      results.push(out);
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(e.status, `ops[${i}]: ${e.message}`);
      throw e;
    }
  });
  return { results };
}

// ---------- Routes ----------

const R = (method, pattern, run, { write = true, status = 200 } = {}) => ({ method, pattern, run, write, status });
const read = { write: false };
const created = { status: 201 };

export const ROUTES = [
  R('GET', '/rules', rules, read),
  R('GET', '/outline', outline, read),
  R('GET', '/search', search, read),
  R('GET', '/chapters/:id', getChapter, read),
  R('GET', '/elements/:id', (model, { params }) => structuredClone(found(index(model).elements, params.id, 'element').element), read),
  R('POST', '/contexts', createContext, created),
  R('PATCH', '/contexts/:id', patchContext),
  R('DELETE', '/contexts/:id', deleteContext),
  R('POST', '/chapters', createChapter, created),
  R('PATCH', '/chapters/:id', patchChapter),
  R('DELETE', '/chapters/:id', deleteChapter),
  R('PUT', '/chapters/:id/connections/:targetId', connectChapters),
  R('DELETE', '/chapters/:id/connections/:targetId', disconnectChapters),
  R('POST', '/chapters/:id/lanes', createLane, created),
  R('PATCH', '/lanes/:id', patchLane),
  R('DELETE', '/lanes/:id', deleteLane),
  R('POST', '/chapters/:id/slices', createSlice, created),
  R('PATCH', '/slices/:id', patchSlice),
  R('DELETE', '/slices/:id', deleteSlice),
  R('PUT', '/slices/:id/connections/:targetId', connectSliceToChapter),
  R('DELETE', '/slices/:id/connections/:targetId', disconnectSliceFromChapter),
  R('POST', '/elements', createElement, created),
  R('PATCH', '/elements/:id', patchElement),
  R('DELETE', '/elements/:id', deleteElement),
  R('POST', '/connections', createConnection, created),
  R('DELETE', '/connections', deleteConnection),
  R('POST', '/elements/:id/scenarios', createScenario, created),
  R('PATCH', '/scenarios/:id', patchScenario),
  R('DELETE', '/scenarios/:id', deleteScenario),
  R('POST', '/scenarios/:id/copy', copyScenario, created),
  R('POST', '/ops', ops),
];

// The route for a request path (without /api/model), with its parameters, or null.
export function findRoute(method, path) {
  const parts = path.split('/').filter(Boolean);
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const pattern = route.pattern.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params = {};
    let ok = true;
    pattern.forEach((seg, i) => {
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) ok = false;
    });
    if (ok) return { route, params };
  }
  return null;
}

// Runs a route on `model` and returns { status, body }. The model is put in canonical order first,
// so the result shows items as they are stored.
export function execute(model, { route, params }, query, requestBody) {
  const out = route.run(model, { params, query, body: requestBody });
  canonical(model);
  return { status: route.status, body: structuredClone(typeof out === 'function' ? out(model) : out) };
}
