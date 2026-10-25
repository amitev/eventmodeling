import { MarkerType } from '@xyflow/react';

// Event modeling: time flows left to right across swimlanes. The board holds one or
// more Chapters. Each Chapter owns its lanes, slices and elements as child nodes
// (positions relative to the Chapter), so moving a Chapter moves all of it. Chapters
// are linked with arrows from the right side of one to the left side of another.
// This file holds the board's constants, layout rules and node factories (no UI).
export const LANE_WIDTH = 3200;
export const LABEL_ZONE = 48; // reserved strip at the left of each lane; slices stay out of it

// Lane types, in the fixed top-to-bottom order lanes keep, with the element types each accepts
// and the letter on the header button that adds a lane of that type.
export const LANE_TYPES = {
  actor: { label: 'Actor', letter: 'A', kinds: ['screen', 'processor'] },
  interaction: { label: 'Interaction', letter: 'I', kinds: ['command', 'query'] },
  event: { label: 'Event', letter: 'E', kinds: ['event'] },
  integration: { label: 'Integration', letter: '🔗', kinds: ['event', 'query'] }, // external integrations
  spec: { label: 'Spec', letter: 'S', kinds: ['scenarios', 'notes'] },
};
export const LANE_TYPE_ORDER = Object.keys(LANE_TYPES);
// Every Chapter keeps at least one lane of each of these.
export const REQUIRED_LANE_TYPES = ['actor', 'interaction', 'event'];
// The lane types of a new Chapter, top to bottom.
export const LANES = ['actor', 'interaction', 'event'].map((type, i) => ({
  type,
  label: LANE_TYPES[type].label,
  y: i * 220,
}));
// The lane types a lane of `type` offers to add below it. Integration is optional, so an
// Event lane also offers Spec.
export const nextLaneTypes = (type) =>
  type === 'event' ? ['integration', 'spec'] : LANE_TYPE_ORDER.slice(LANE_TYPE_ORDER.indexOf(type) + 1, LANE_TYPE_ORDER.indexOf(type) + 2);
export const laneAllows = (lane, kind) => !!lane && (LANE_TYPES[lane.data.type]?.kinds.includes(kind) ?? false);

export const SLICE_Y = -40;
export const SLICE_HEADER = 40;
export const LANE_HEIGHT = 220;
export const GRID = 20;
export const SLICE_PADDING = 40; // minimum gap between a slice border and its elements
export const STICKY_W = 160; // width of an element before it is measured
export const STICKY_H = 132; // height of an element before it is measured (26px header + 104px body)
export const DEFAULT_SLICE_WIDTH = 220;
export const SLICE_MIN_WIDTH = 120;

export const KINDS = {
  screen: { label: 'Screen', lane: 0, color: '#e2e2e2' },
  command: { label: 'Command', lane: 1, color: '#7cc3f2' },
  query: { label: 'Query', lane: 1, color: '#8fd694' },
  event: { label: 'Event', lane: 2, color: '#ffb366' },
  processor: { label: 'Processor', lane: 1, color: '#d9c2f0', icon: '⚙️' },
  // Not part of the flow: it connects to nothing (R4.7).
  scenarios: { label: 'Scenarios', color: '#2f6fdb', w: 280, maxW: 560, h: 200, pad: SLICE_PADDING / 2, stretch: true },
  // Free Markdown text shown in the element; same size as Scenarios. Connects to nothing.
  notes: { label: 'Notes', color: '#f5d76e', w: 280, maxW: 560, h: 200, pad: SLICE_PADDING / 2, stretch: true },
};

// Size of an element before it is measured, and its minimum gap to the slice borders.
export const kindW = (kind) => KINDS[kind]?.w ?? STICKY_W;
export const kindH = (kind) => KINDS[kind]?.h ?? STICKY_H;
export const padOf = (kind) => KINDS[kind]?.pad ?? SLICE_PADDING;

// Element types an element of each type can point to (R4.7).
export const FLOWS_TO = {
  screen: ['command'],
  processor: ['command'],
  command: ['event'],
  event: ['query'],
  query: ['screen', 'processor'],
};

export const snap = (v) => Math.round(v / GRID) * GRID;

// Linked copies (`data.copyOf` = id of the original) whose original is gone are removed with
// it (R3.22). Null when there is none; else the remaining nodes and the removed ids.
export function pruneCopies(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const gone = new Set(nodes.filter((n) => n.data?.copyOf && !ids.has(n.data.copyOf)).map((n) => n.id));
  return gone.size ? { nodes: nodes.filter((n) => !gone.has(n.id)), gone } : null;
}


export const LANE_COLORS = ['none', 'orange', 'red', 'green', 'blue', 'pink', 'purple', 'yellow', 'brown', 'gray'];

export const snapUp = (v) => Math.ceil(v / GRID) * GRID;

export const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const ID_LENGTH = 6;

// 6 characters of a-zA-Z0-9 from the secure random source (R1.14).
export function randomId() {
  let id = '';
  while (id.length < ID_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      if (b < 248 && id.length < ID_LENGTH) id += ID_CHARS[b % 62]; // 248 = 4 * 62: no modulo bias
    }
  }
  return id;
}

// A fresh id that is not in `used`; it is added to `used`.
export function uniqueId(used) {
  let id = randomId();
  while (used.has(id)) id = randomId();
  used.add(id);
  return id;
}

export const SLICE_MIN_X = LABEL_ZONE;
// Measured size of an element (React Flow keeps it in `measured`); the default until measured.
// Width used by the layout. An element that can stretch (`stretch` in KINDS) counts with its
// minimum width: stretching only fills the slice (see stretchWidth).
export const stickyW = (n) => (KINDS[n.data?.kind]?.stretch ? kindW(n.data.kind) : n.measured?.width ?? kindW(n.data?.kind));
export const stickyH = (n) => n.measured?.height ?? kindH(n.data?.kind);
export const slices = (nodes, chapterId) =>
  nodes
    .filter((n) => n.type === 'slice' && (chapterId === undefined || n.parentId === chapterId))
    .sort((a, b) => a.position.x - b.position.x);
export const lanesOf = (nodes, chapterId) =>
  nodes
    .filter((n) => n.type === 'lane' && n.parentId === chapterId)
    .sort((a, b) => a.position.y - b.position.y);
export const chaptersOf = (nodes) => nodes.filter((n) => n.type === 'chapter');

export const setSliceWidth = (nodes, id, width) =>
  nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, width } } : n));

// A slice cannot be narrower than the elements it holds (plus their margins) or the minimum.
export const minSliceWidth = (nodes, slice) =>
  Math.max(
    SLICE_MIN_WIDTH,
    snapUp(
      (membersOf(nodes).get(slice.id) ?? []).reduce(
        (m, n) => Math.max(m, n.position.x + stickyW(n) + padOf(n.data.kind) - slice.position.x),
        0
      )
    )
  );

// The slice an element is in: the slice of its Chapter that holds its left edge (an element
// is kept at least SLICE_PADDING inside its slice, and may grow to the right), else the one
// it overlaps most, else the nearest. Undefined only when the Chapter has no slice.
export function sliceOf(ss, n) {
  const mine = ss.filter((s) => s.parentId === n.parentId);
  const l = n.position.x;
  const r = l + stickyW(n);
  const holding = mine.find((s) => l >= s.position.x && l < s.position.x + s.data.width);
  if (holding) return holding;
  let best;
  let bestScore = -Infinity;
  for (const s of mine) {
    const score = Math.min(r, s.position.x + s.data.width) - Math.max(l, s.position.x); // negative: the gap
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

// Slice id -> the elements in it.
export function membersOf(nodes) {
  const ss = slices(nodes);
  const map = new Map(ss.map((sl) => [sl.id, []]));
  for (const n of nodes) {
    if (n.type !== 'sticky') continue;
    const sl = sliceOf(ss, n);
    if (sl) map.get(sl.id).push(n);
  }
  return map;
}

// Slices form one contiguous run: the first starts at the beginning of the slice
// area and each next one starts where the previous ends. Elements move with the
// slice they belong to. The Chapter is exactly as wide as the slices: it ends
// where the last slice ends (and has room for one default slice when empty).
// `ref` is the board before any width change, so membership is not skewed by a
// slice that is mid-resize. Returns the same array when nothing changes.
export function layoutSlices(nodes, ref = nodes) {
  const newX = new Map();
  const widths = new Map(); // chapter id -> width
  for (const c of chaptersOf(nodes)) {
    let cursor = SLICE_MIN_X;
    const ordered = slices(nodes, c.id);
    for (const n of ordered) {
      newX.set(n.id, cursor);
      cursor += n.data.width;
    }
    widths.set(c.id, ordered.length ? cursor : SLICE_MIN_X + DEFAULT_SLICE_WIDTH);
  }
  const refX = new Map(slices(ref).map((n) => [n.id, n.position.x]));
  const shift = new Map();
  for (const [sid, els] of membersOf(ref)) {
    const d = (newX.get(sid) ?? refX.get(sid)) - refX.get(sid);
    if (d) els.forEach((el) => shift.set(el.id, d));
  }
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type === 'slice' && newX.has(n.id) && newX.get(n.id) !== n.position.x) {
      changed = true;
      return { ...n, position: { ...n.position, x: newX.get(n.id) } };
    }
    if (n.type === 'lane' && widths.has(n.parentId) && n.data.width !== widths.get(n.parentId)) {
      changed = true;
      return { ...n, data: { ...n.data, width: widths.get(n.parentId) } };
    }
    if (shift.has(n.id)) {
      changed = true;
      return { ...n, position: { ...n.position, x: n.position.x + shift.get(n.id) } };
    }
    return n;
  });
  return changed ? next : nodes;
}

// The width an element is shown with. A Scenarios or Notes element fills its slice between the
// margins, within its minimum and maximum width, when it is alone in its Cell; otherwise it keeps
// its minimum width.
export function stretchWidth(nodes, node) {
  const kind = node.data.kind;
  const min = kindW(kind);
  if (!KINDS[kind]?.stretch) return min;
  const slice = sliceOf(slices(nodes), node);
  if (!slice) return min;
  const lanes = lanesOf(nodes, node.parentId);
  const laneIdOf = (n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return lanes.find((l) => mid >= l.position.y && mid < l.position.y + l.data.height)?.id;
  };
  const mine = laneIdOf(node);
  const sameCell = (membersOf(nodes).get(slice.id) ?? []).filter((n) => laneIdOf(n) === mine);
  return sameCell.length === 1
    ? Math.min(KINDS[kind].maxW ?? Infinity, Math.max(min, slice.data.width - 2 * padOf(kind)))
    : min;
}

// A Spec lane's Cell holds one element at most. True when `lane` is a Spec lane and its Cell in
// `slice` already holds an element other than those in `ignore`.
export function cellIsFull(nodes, lane, slice, ignore) {
  if (lane?.data.type !== 'spec') return false;
  return (membersOf(nodes).get(slice.id) ?? []).some((n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return !ignore?.has(n.id) && mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
}

// Elements in a Spec lane are left aligned (R3.21)
export const leftAligned = (lane) => lane?.data.type === 'spec';

// An element never straddles a slice boundary: it is moved fully inside its slice (keeping
// SLICE_PADDING from its borders), and that slice grows if the element does not fit.
export function settleStickies(nodes, only) {
  const ss = slices(nodes);
  if (!ss.length) return nodes;
  const widen = new Map();
  let changed = false;
  const placed = nodes.map((n) => {
    if (n.type !== 'sticky' || (only && !only.has(n.id))) return n;
    const w = stickyW(n);
    const l = n.position.x;
    const best = sliceOf(ss, n);
    if (!best) return n;
    const pad = padOf(n.data.kind);
    const room = Math.max(best.data.width, snapUp(w + 2 * pad));
    if (room > best.data.width) widen.set(best.id, Math.max(widen.get(best.id) ?? 0, room));
    // Elements of a Spec lane are left aligned (R3.21); the others stay where they are, inside the slice.
    const lane = lanesOf(nodes, n.parentId).find((l) => {
      const mid = n.position.y + stickyH(n) / 2;
      return mid >= l.position.y && mid < l.position.y + l.data.height;
    });
    const x = leftAligned(lane)
      ? best.position.x + pad
      : Math.min(Math.max(l, best.position.x + pad), best.position.x + room - w - pad);
    if (x === l) return n;
    changed = true;
    return { ...n, position: { ...n.position, x } };
  });
  if (!widen.size) return changed ? placed : nodes;
  return layoutSlices(
    placed.map((n) =>
      widen.has(n.id) ? { ...n, data: { ...n.data, width: widen.get(n.id) } } : n
    ),
    placed
  );
}

// Elements are vertically centred in the lane that holds their centre. An element
// taller than its lane is aligned to the lane top. `only` limits it to those ids.
export function centerStickies(nodes, only) {
  const lanes = nodes.filter((n) => n.type === 'lane');
  if (!lanes.length) return nodes;
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== 'sticky' || (only && !only.has(n.id))) return n;
    const h = stickyH(n);
    const mid = n.position.y + h / 2;
    const lane = lanes.find(
      (l) =>
        l.parentId === n.parentId &&
        mid >= l.position.y &&
        mid < l.position.y + l.data.height
    );
    if (!lane) return n;
    const y = lane.position.y + Math.max(0, (lane.data.height - h) / 2);
    if (y === n.position.y) return n;
    changed = true;
    return { ...n, position: { ...n.position, y } };
  });
  return changed ? next : nodes;
}

// Where a dragged element ends up is decided by the Cell under its centre: it joins that
// Cell's Chapter and slice (its position is converted to the Chapter's coordinates and
// kept inside the slice's margins; the lane centring is done by centerStickies). Over no
// Cell it returns to where the drag started (`origin`: id -> { parentId, position }).
// `only` limits it to those ids.
export function adoptStickies(nodes, only, origin) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== 'sticky' || !only.has(n.id)) return n;
    const parent = byId.get(n.parentId);
    if (!parent) return n;
    const w = stickyW(n);
    const ax = parent.position.x + n.position.x;
    const ay = parent.position.y + n.position.y;
    const cell = cellAt(nodes, { x: ax + w / 2, y: ay + stickyH(n) / 2 });
    // A Cell whose lane does not take this element type, or a Spec Cell that already holds
    // another element, counts as no Cell.
    if (
      !cell ||
      !laneAllows(byId.get(cell.laneId), n.data.kind) ||
      cellIsFull(nodes, byId.get(cell.laneId), byId.get(cell.sliceId), only)
    ) {
      const from = origin.get(n.id);
      if (!from) return n;
      changed = true;
      return { ...n, parentId: from.parentId, position: { ...from.position } };
    }
    const chapter = byId.get(cell.chapterId);
    const slice = byId.get(cell.sliceId);
    const pad = padOf(n.data.kind);
    const x = Math.max(
      slice.position.x + pad,
      Math.min(ax - chapter.position.x, slice.position.x + slice.data.width - w - pad)
    );
    const y = ay - chapter.position.y;
    if (chapter.id === n.parentId && x === n.position.x && y === n.position.y) return n;
    changed = true;
    return { ...n, parentId: chapter.id, position: { x, y } };
  });
  return changed ? next : nodes;
}

export const normalize = (nodes) => centerStickies(settleStickies(layoutSlices(nodes)));

// Items are drawn in list order (a child's z-index never goes below its parent's), so lanes
// must come before slices and elements to stay under their tint.
export const LAYER = { chapter: 0, lane: 1, slice: 2, sticky: 3 };
export const layered = (nodes) => [...nodes].sort((a, b) => LAYER[a.type] - LAYER[b.type]);

// A Cell is the intersection of a lane and a slice of one Chapter: one box of the
// Chapter's grid (lanes are the rows, slices the columns). It is not stored anywhere;
// it follows from the lanes and slices. This finds the Cell under a canvas point
// (flow coordinates), or null when the point is not inside any Cell.
export function cellAt(nodes, p) {
  for (const c of chaptersOf(nodes)) {
    const lane = lanesOf(nodes, c.id).find(
      (l) =>
        p.y >= c.position.y + l.position.y && p.y < c.position.y + l.position.y + l.data.height
    );
    const slice = slices(nodes, c.id).find(
      (sl) =>
        p.x >= c.position.x + sl.position.x && p.x < c.position.x + sl.position.x + sl.data.width
    );
    if (lane && slice) return { chapterId: c.id, laneId: lane.id, sliceId: slice.id };
  }
  return null;
}


export const chapterDefaults = {
  dragHandle: '.chapter-handle',
  deletable: false, // removed with the × button, never with the keyboard
  connectable: true,
  // Only the handle and the ports take the mouse; lanes and elements below stay usable.
  style: { pointerEvents: 'none' },
};

export const makeChapter = (id, x, y, name, context, info) => ({
  id,
  type: 'chapter',
  position: { x, y },
  data: { name, context, ...(info ? { info } : {}) },
  ...chapterDefaults,
});

export const makeSlice = (id, x, width, name, chapterId, info, flowEnd) => ({
  id,
  type: 'slice',
  position: { x, y: SLICE_Y },
  data: { name, width, ...(info ? { info } : {}), ...(flowEnd ? { flowEnd: true } : {}) },
  parentId: chapterId,
  draggable: false,
  selectable: false,
  zIndex: -1,
  // Only the header takes pointer events, so notes under the band stay usable.
  style: { pointerEvents: 'none' },
});

export const makeLane = (id, chapterId, type, label, y, color, width, info) => ({
  id,
  type: 'lane',
  position: { x: 0, y },
  parentId: chapterId,
  data: { type, label, height: LANE_HEIGHT, width, color, ...(info ? { info } : {}) },
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
  focusable: false,
  zIndex: -1,
  // Clicks pass through to the canvas (selects the Cell) and to the arrows above the lane.
  style: { pointerEvents: 'none' },
});

export const edgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};

// Arrows between Chapters are heavier and darker than arrows between elements.
export const chapterEdgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#5b5b6b' },
  style: { strokeWidth: 3, stroke: '#5b5b6b' },
};

// A connection has no id of its own (R1.16); React Flow needs one, so it is derived.
export const makeEdge = (source, target, chapterLevel) => ({
  id: `${source}>${target}`,
  source,
  target,
  ...(chapterLevel ? chapterEdgeDefaults : edgeDefaults),
});

// The starting board (R1.4): one empty Chapter in the Default Context, with fresh ids.
export function makeEmptyBoard() {
  const used = new Set();
  const id = () => uniqueId(used);
  const chapterId = id();
  const contexts = [{ id: id(), name: 'Default' }];
  const nodes = normalize([
    makeChapter(chapterId, 0, 0, 'Chapter 1', contexts[0].id),
    ...LANES.map((l) => makeLane(id(), chapterId, l.type, l.label, l.y, 'none', LANE_WIDTH)),
    makeSlice(id(), LABEL_ZONE, DEFAULT_SLICE_WIDTH, 'New Slice', chapterId),
  ]);
  return { nodes, edges: [], contexts };
}
