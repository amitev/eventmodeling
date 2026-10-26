import { LANE_WIDTH, LANE_HEIGHT, SLICE_MIN_WIDTH, KINDS, kindW, padOf, LANE_COLORS, LANE_TYPES, LANE_TYPE_ORDER, REQUIRED_LANE_TYPES, SLICE_MIN_X, stickyH, slices, lanesOf, chaptersOf, sliceOf, normalize, makeChapter, makeSlice, makeLane, makeEdge } from './model.js';

import { FIELD_FLAGS, FIELD_TYPES, OBJECT, hasFields, serializeFields } from './fields.js';
import { isExampleValue } from './examples.js';

export const STORAGE_KEY = 'event-model-board';

export const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const serializeScenario = (s) => {
  const entry = (e) => ({ element: e.element, example: structuredClone(e.example) });
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    given: s.given.map(entry),
    when: s.when ? entry(s.when) : null,
    then: s.then.map(entry),
    error: s.error,
  };
};

// The export file (section 6): the one complete description of the board. Values that follow
// from the layout rules are left out. Field order is fixed so the same board always gives
// the same text.
export function serialize(nodes, edges, contexts) {
  const kindOf = new Map(nodes.map((n) => [n.id, n.type]));
  const targetsOf = new Map();
  for (const e of edges) {
    const kind = kindOf.get(e.source);
    if (e.source === e.target || kind !== kindOf.get(e.target)) continue;
    if (kind !== 'chapter' && kind !== 'sticky') continue;
    if (!targetsOf.has(e.source)) targetsOf.set(e.source, new Set());
    targetsOf.get(e.source).add(e.target);
  }

  const ss = slices(nodes);
  const order = new Map(); // id -> position in the file, which orders every connectsTo
  const items = []; // [owner id, its connectsTo array] to fill once `order` is complete
  const chapters = chaptersOf(nodes)
    .sort(
      (a, b) => a.position.x - b.position.x || a.position.y - b.position.y || compareIds(a.id, b.id)
    )
    .map((ch) => {
      order.set(ch.id, order.size);
      const lanes = lanesOf(nodes, ch.id);
      const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));
      const laneOf = (n) => {
        const cy = n.position.y + stickyH(n) / 2;
        let found = lanes[0];
        for (const l of lanes) if (cy >= l.position.y) found = l;
        return found;
      };
      const chapterSlices = slices(nodes, ch.id);
      const bySlice = new Map(chapterSlices.map((s) => [s.id, []]));
      for (const n of nodes) {
        if (n.type !== 'sticky' || n.parentId !== ch.id) continue;
        const sl = sliceOf(ss, n);
        if (sl) bySlice.get(sl.id).push({ n, lane: laneOf(n) });
      }
      const connectsTo = [];
      items.push([ch.id, connectsTo]);
      return {
        id: ch.id,
        name: ch.data.name,
        ...(ch.data.info ? { info: ch.data.info } : {}),
        context: contexts.some((c) => c.id === ch.data.context) ? ch.data.context : contexts[0].id,
        x: ch.position.x,
        y: ch.position.y,
        connectsTo,
        lanes: lanes.map((l) => ({
          id: l.id,
          name: l.data.label,
          type: l.data.type,
          ...(l.data.info ? { info: l.data.info } : {}),
          color: l.data.color,
        })),
        slices: chapterSlices.map((sl) => ({
          id: sl.id,
          name: sl.data.name,
          ...(sl.data.info ? { info: sl.data.info } : {}),
          ...(sl.data.flowEnd ? { flowEnd: true } : {}),
          width: sl.data.width,
          elements: bySlice
            .get(sl.id)
            .sort(
              (a, b) =>
                a.n.position.x - b.n.position.x ||
                laneIndex.get(a.lane.id) - laneIndex.get(b.lane.id) ||
                compareIds(a.n.id, b.n.id)
            )
            .map(({ n, lane }) => {
              order.set(n.id, order.size);
              const links = [];
              items.push([n.id, links]);
              // A linked copy has no content of its own: it names its original (R3.22).
              if (n.data.copyOf) {
                return {
                  id: n.id,
                  type: n.data.kind,
                  lane: lane.id,
                  copyOf: n.data.copyOf,
                  x: n.position.x - sl.position.x,
                  connectsTo: links,
                };
              }
              return {
                id: n.id,
                type: n.data.kind,
                lane: lane.id,
                title: n.data.title ?? '',
                ...(n.data.info && n.data.kind !== 'scenarios' ? { info: n.data.info } : {}),
                ...(n.data.kind === 'scenarios' ? { scenarios: n.data.scenarios.map(serializeScenario) } : {}),
                ...(n.data.kind === 'notes' && n.data.markdown ? { markdown: n.data.markdown } : {}),
                ...(n.data.kind === 'screen' && n.data.html ? { html: n.data.html } : {}),
                ...(n.data.fields?.length ? { fields: serializeFields(n.data.fields) } : {}),
                x: n.position.x - sl.position.x,
                connectsTo: links,
              };
            }),
        })),
      };
    });

  for (const [id, list] of items) {
    const targets = [...(targetsOf.get(id) ?? [])].filter((t) => order.has(t));
    list.push(...targets.sort((a, b) => order.get(a) - order.get(b)));
  }
  return {
    format: 'event-model',
    version: 1,
    contexts: contexts.map((c) => ({ id: c.id, name: c.name })),
    chapters,
  };
}

export const boardText = (nodes, edges, contexts) =>
  JSON.stringify(serialize(nodes, edges, contexts));

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const hasKey = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Reads the export file (section 7). The whole file is checked before anything is built; the
// first problem throws an Error that names where it is. Returns { nodes, edges }.
export function parseBoard(text) {
  const fail = (path, message) => {
    throw new Error(`${path || 'file'}: ${message}`);
  };
  const at = (path, key) => (path ? `${path}.${key}` : key);
  const object = (v, keys, path, optional = []) => {
    if (!isObject(v)) fail(path, 'must be an object');
    for (const k of keys) if (!hasKey(v, k)) fail(at(path, k), 'is missing');
    for (const k of Object.keys(v)) {
      if (!keys.includes(k) && !optional.includes(k)) fail(at(path, k), 'is not allowed');
    }
  };
  const list = (v, path, nonEmpty) => {
    if (!Array.isArray(v)) fail(path, 'must be a list');
    if (nonEmpty && !v.length) fail(path, 'must not be empty');
  };
  const string = (v, path) => {
    if (typeof v !== 'string') fail(path, 'must be a text');
  };
  const name = (v, path) => {
    string(v, path);
    if (!v.trim()) fail(path, 'must not be empty');
  };
  const number = (v, path) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number');
  };

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`file: not valid JSON (${err.message})`);
  }
  if (isObject(data) && !hasKey(data, 'format')) {
    fail('format', 'is missing (files in an earlier format are not supported)');
  }
  object(data, ['format', 'version', 'contexts', 'chapters'], '');
  if (data.format !== 'event-model') fail('format', 'must be "event-model"');
  if (data.version !== 1) fail('version', 'must be 1');
  list(data.contexts, 'contexts', true);
  list(data.chapters, 'chapters');

  const kindOf = new Map(); // id -> context | chapter | lane | slice | element
  const claim = (id, kind, path) => {
    if (typeof id !== 'string' || !id) fail(path, 'must be a non-empty text');
    if (kindOf.has(id)) fail(path, `duplicate id "${id}"`);
    kindOf.set(id, kind);
  };
  const links = []; // connectsTo lists to check once every id is known
  const unconnectable = new Set(); // ids of Scenarios and Notes elements
  const elements = new Map(); // element id -> { chapter, type, copy }
  const copies = []; // linked copies' copyOf ids, checked once every element is known
  const references = []; // scenario entries' element ids, checked once every element is known
  const exampleData = (v, path) => {
    if (!isObject(v)) fail(path, 'must be an object');
    if (!isExampleValue(v)) fail(path, 'values must be text, true/false, lists or objects of these');
    return structuredClone(v);
  };
  const scenarioEntry = (v, path, chapter, type) => {
    object(v, ['element', 'example'], path);
    string(v.element, at(path, 'element'));
    references.push({ path: at(path, 'element'), id: v.element, chapter, type });
    return { element: v.element, example: exampleData(v.example, at(path, 'example')) };
  };
  const scenarioList = (v, path, chapter) => {
    list(v, path);
    return v.map((s, si) => {
      const sp = `${path}[${si}]`;
      object(s, ['id', 'title', 'description', 'given', 'when', 'then', 'error'], sp);
      claim(s.id, 'scenario', at(sp, 'id'));
      string(s.title, at(sp, 'title'));
      string(s.description, at(sp, 'description'));
      list(s.given, at(sp, 'given'));
      const given = s.given.map((e, i) => scenarioEntry(e, `${at(sp, 'given')}[${i}]`, chapter, 'event'));
      const when = s.when === null ? null : scenarioEntry(s.when, at(sp, 'when'), chapter, 'command');
      list(s.then, at(sp, 'then'));
      const then = s.then.map((e, i) => scenarioEntry(e, `${at(sp, 'then')}[${i}]`, chapter, 'event'));
      if (s.error !== null) {
        string(s.error, at(sp, 'error'));
        if (then.length) fail(at(sp, 'error'), 'must be null when "then" is not empty');
      }
      return { id: s.id, title: s.title, description: s.description, given, when, then, error: s.error };
    });
  };
  // A list of fields (R9.6); `object` fields hold their own list. Names are unique per list.
  const fieldList = (v, path) => {
    list(v, path);
    const names = new Set();
    return v.map((f, i) => {
      const fp = `${path}[${i}]`;
      const isObj = isObject(f) && f.type === OBJECT;
      object(f, ['name', 'type', 'list', ...FIELD_FLAGS.map((x) => x.key), ...(isObj ? ['fields'] : [])], fp);
      name(f.name, at(fp, 'name'));
      if (names.has(f.name)) fail(at(fp, 'name'), `field name "${f.name}" is used twice`);
      names.add(f.name);
      if (!FIELD_TYPES.includes(f.type)) fail(at(fp, 'type'), `must be one of ${FIELD_TYPES.join(', ')}`);
      for (const k of ['list', ...FIELD_FLAGS.map((x) => x.key)]) {
        if (typeof f[k] !== 'boolean') fail(at(fp, k), 'must be true or false');
      }
      const { name: n, type, list: isList } = f;
      return {
        name: n,
        type,
        list: isList,
        ...Object.fromEntries(FIELD_FLAGS.map(({ key }) => [key, f[key]])),
        ...(isObj ? { fields: fieldList(f.fields, at(fp, 'fields')) } : {}),
      };
    });
  };
  const optionalInfo = (item, path) => {
    if (!hasKey(item, 'info')) return;
    string(item.info, at(path, 'info'));
    if (item.info === '') fail(at(path, 'info'), 'must be left out when empty');
  };
  const nodes = [];
  const contexts = [];

  data.contexts.forEach((x, xi) => {
    const xp = `contexts[${xi}]`;
    object(x, ['id', 'name'], xp);
    claim(x.id, 'context', at(xp, 'id'));
    name(x.name, at(xp, 'name'));
    contexts.push({ id: x.id, name: x.name });
  });

  data.chapters.forEach((c, ci) => {
    const cp = `chapters[${ci}]`;
    object(c, ['id', 'name', 'context', 'x', 'y', 'connectsTo', 'lanes', 'slices'], cp, ['info']);
    claim(c.id, 'chapter', at(cp, 'id'));
    name(c.name, at(cp, 'name'));
    optionalInfo(c, cp);
    string(c.context, at(cp, 'context'));
    if (!contexts.some((x) => x.id === c.context)) {
      fail(at(cp, 'context'), `no context with id "${c.context}"`);
    }
    number(c.x, at(cp, 'x'));
    number(c.y, at(cp, 'y'));
    list(c.connectsTo, at(cp, 'connectsTo'));
    links.push({ owner: c.id, kind: 'chapter', path: at(cp, 'connectsTo'), ids: c.connectsTo });
    list(c.lanes, at(cp, 'lanes'), true);
    list(c.slices, at(cp, 'slices'), true);
    nodes.push(makeChapter(c.id, c.x, c.y, c.name, c.context, c.info));

    const laneY = new Map();
    const laneType = new Map();
    c.lanes.forEach((l, li) => {
      const lp = `${cp}.lanes[${li}]`;
      object(l, ['id', 'name', 'type', 'color'], lp, ['info']);
      claim(l.id, 'lane', at(lp, 'id'));
      name(l.name, at(lp, 'name'));
      if (typeof l.type !== 'string' || !hasKey(LANE_TYPES, l.type)) {
        fail(at(lp, 'type'), `must be one of ${LANE_TYPE_ORDER.join(', ')}`);
      }
      if (li > 0 && LANE_TYPE_ORDER.indexOf(l.type) < LANE_TYPE_ORDER.indexOf(c.lanes[li - 1].type)) {
        fail(at(lp, 'type'), `lanes must be in the order ${LANE_TYPE_ORDER.join(', ')}`);
      }
      optionalInfo(l, lp);
      if (!LANE_COLORS.includes(l.color)) {
        fail(at(lp, 'color'), `must be one of ${LANE_COLORS.join(', ')}`);
      }
      laneY.set(l.id, li * LANE_HEIGHT);
      laneType.set(l.id, l.type);
      nodes.push(makeLane(l.id, c.id, l.type, l.name, li * LANE_HEIGHT, l.color, LANE_WIDTH, l.info));
    });
    for (const t of REQUIRED_LANE_TYPES) {
      if (!c.lanes.some((l) => l.type === t)) {
        fail(at(cp, 'lanes'), `needs at least one lane of type ${t}`);
      }
    }

    let cursor = SLICE_MIN_X;
    c.slices.forEach((sl, si) => {
      const sp = `${cp}.slices[${si}]`;
      object(sl, ['id', 'name', 'width', 'elements'], sp, ['info', 'flowEnd']);
      claim(sl.id, 'slice', at(sp, 'id'));
      name(sl.name, at(sp, 'name'));
      optionalInfo(sl, sp);
      if (hasKey(sl, 'flowEnd') && sl.flowEnd !== true) {
        fail(at(sp, 'flowEnd'), 'must be true, or left out when the slice is not a flow end');
      }
      number(sl.width, at(sp, 'width'));
      if (sl.width < SLICE_MIN_WIDTH) fail(at(sp, 'width'), `must be at least ${SLICE_MIN_WIDTH}`);
      list(sl.elements, at(sp, 'elements'));
      const width = sl.width;
      nodes.push(makeSlice(sl.id, cursor, width, sl.name, c.id, sl.info, sl.flowEnd));

      const specCells = new Set(); // Spec lanes already holding an element in this slice
      sl.elements.forEach((el, ei) => {
        const ep = `${sp}.elements[${ei}]`;
        const isScenarios = isObject(el) && el.type === 'scenarios';
        const isCopy = isObject(el) && hasKey(el, 'copyOf');
        object(
          el,
          ['id', 'type', 'lane', isCopy ? 'copyOf' : 'title', 'x', 'connectsTo', ...(isScenarios ? ['scenarios'] : [])],
          ep,
          isCopy ? [] : ['html', 'markdown', 'info', 'fields']
        );
        claim(el.id, 'element', at(ep, 'id'));
        if (typeof el.type !== 'string' || !hasKey(KINDS, el.type)) {
          fail(at(ep, 'type'), `must be one of ${Object.keys(KINDS).join(', ')}`);
        }
        string(el.lane, at(ep, 'lane'));
        if (!laneY.has(el.lane)) {
          fail(at(ep, 'lane'), `no lane with id "${el.lane}" in this chapter`);
        }
        if (!LANE_TYPES[laneType.get(el.lane)].kinds.includes(el.type)) {
          fail(at(ep, 'lane'), `a ${laneType.get(el.lane)} lane does not take ${el.type} elements`);
        }
        if (laneType.get(el.lane) === 'spec') {
          if (specCells.has(el.lane)) fail(at(ep, 'lane'), 'a spec lane holds one element per slice');
          specCells.add(el.lane);
        }
        if (isCopy) {
          string(el.copyOf, at(ep, 'copyOf'));
          if (el.type === 'scenarios' || el.type === 'notes') fail(at(ep, 'copyOf'), `a ${el.type} element cannot be a copy`);
          copies.push({ path: at(ep, 'copyOf'), id: el.copyOf, type: el.type });
        } else {
          string(el.title, at(ep, 'title'));
        }
        optionalInfo(el, ep);
        if (hasKey(el, 'info') && (el.type === 'notes' || el.type === 'scenarios')) fail(at(ep, 'info'), `a ${el.type} element has no info`);
        if (hasKey(el, 'html')) {
          string(el.html, at(ep, 'html'));
          if (el.html === '') fail(at(ep, 'html'), 'must be left out when empty');
          if (el.type !== 'screen') fail(at(ep, 'html'), 'only a screen can have html');
        }
        if (hasKey(el, 'markdown')) {
          string(el.markdown, at(ep, 'markdown'));
          if (el.markdown === '') fail(at(ep, 'markdown'), 'must be left out when empty');
          if (el.type !== 'notes') fail(at(ep, 'markdown'), 'only a notes element can have markdown');
        }
        let fields = null;
        if (hasKey(el, 'fields')) {
          if (!hasFields(el.type)) fail(at(ep, 'fields'), `a ${el.type} element has no fields`);
          fields = fieldList(el.fields, at(ep, 'fields'));
          if (!fields.length) fail(at(ep, 'fields'), 'must be left out when empty');
        }
        number(el.x, at(ep, 'x'));
        const pad = padOf(el.type);
        if (el.x < pad) fail(at(ep, 'x'), `must be at least ${pad}`);
        const w = kindW(el.type);
        if (el.x + w + pad > sl.width) {
          fail(
            at(ep, 'x'),
            `the element (x ${el.x}, width ${w}) does not fit in the slice with ${pad}px margins (width ${sl.width})`
          );
        }
        list(el.connectsTo, at(ep, 'connectsTo'));
        if (isScenarios || el.type === 'notes') unconnectable.add(el.id);
        elements.set(el.id, { chapter: c.id, type: el.type, copy: isCopy });
        const scenarios = isScenarios ? scenarioList(el.scenarios, at(ep, 'scenarios'), c.id) : null;
        links.push({ owner: el.id, kind: 'element', path: at(ep, 'connectsTo'), ids: el.connectsTo });
        nodes.push({
          id: el.id,
          type: 'sticky',
          parentId: c.id,
          position: { x: cursor + el.x, y: laneY.get(el.lane) + 40 },
          data: {
            kind: el.type,
            title: isCopy ? '' : el.title,
            ...(isCopy ? { copyOf: el.copyOf } : {}),
            ...(el.html ? { html: el.html } : {}),
            ...(el.markdown ? { markdown: el.markdown } : {}),
            ...(el.info ? { info: el.info } : {}),
            ...(fields ? { fields } : {}),
            ...(scenarios ? { scenarios } : {}),
          },
        });
      });
      cursor += width;
    });
  });

  for (const { path, id, chapter, type } of references) {
    const target = elements.get(id);
    if (!target) fail(path, `no element with id "${id}"`);
    if (target.chapter !== chapter) fail(path, `"${id}" is not an element of the same chapter`);
    if (target.copy) fail(path, `"${id}" is a linked copy`);
    if (target.type !== type) fail(path, `"${id}" must be ${type === 'event' ? 'an event' : 'a command'}`);
  }

  for (const { path, id, type } of copies) {
    const original = elements.get(id);
    if (!original) fail(path, `no element with id "${id}"`);
    if (original.copy) fail(path, `"${id}" is itself a copy`);
    if (original.type !== type) fail(path, `"${id}" must be a ${type} element`);
  }

  const edges = [];
  for (const { owner, kind, path, ids } of links) {
    const seen = new Set();
    ids.forEach((t, i) => {
      const p = `${path}[${i}]`;
      string(t, p);
      if (t === owner) fail(p, 'an item cannot connect to itself');
      if (!kindOf.has(t)) fail(p, `no item with id "${t}"`);
      if (kindOf.get(t) !== kind) {
        fail(p, `"${t}" must be the id of ${kind === 'chapter' ? 'a chapter' : 'an element'}`);
      }
      if (unconnectable.has(owner) || unconnectable.has(t)) fail(p, 'a scenarios or notes element cannot be connected');
      if (seen.has(t)) fail(p, `id "${t}" is listed twice`);
      seen.add(t);
      edges.push(makeEdge(owner, t, kind === 'chapter'));
    });
  }
  return { nodes: normalize(nodes), edges, contexts };
}

export function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseBoard(text);
  } catch {
    // missing, corrupt or unavailable storage: the starting board is shown
  }
  return null;
}
