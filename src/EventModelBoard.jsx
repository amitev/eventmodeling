import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
} from 'reactflow';

// Event modeling: time flows left to right across swimlanes. The board holds one or
// more Chapters. Each Chapter owns its lanes, slices and elements as child nodes
// (positions relative to the Chapter), so moving a Chapter moves all of it. Chapters
// are linked with arrows from the right side of one to the left side of another.
const LANE_WIDTH = 3200;
const LABEL_ZONE = 48; // reserved strip at the left of each lane; slices stay out of it
const LANES = [
  { label: 'UI / Actors', y: 0 },
  { label: 'Commands / Read Models', y: 220 },
  { label: 'Events', y: 440 },
];

const SLICE_Y = -40;
const SLICE_HEADER = 40;
const LANE_HEIGHT = 220;
const GRID = 20;
const SLICE_PADDING = 20; // minimum gap between a slice border and its elements
const STICKY_W = 160; // width of an element before it is measured
const STICKY_WIDE_W = 240; // width of a Screen that shows an HTML mockup
const STICKY_H = 132; // height of an element before it is measured (26px header + 104px body)
const DEFAULT_SLICE_WIDTH = 220;
const SLICE_MIN_WIDTH = 120;

const KINDS = {
  screen: { label: 'Screen', lane: 0, color: '#e2e2e2' },
  command: { label: 'Command', lane: 1, color: '#7cc3f2' },
  readmodel: { label: 'Read Model', lane: 1, color: '#8fd694' },
  event: { label: 'Event', lane: 2, color: '#ffb366' },
  processor: { label: 'Processor', lane: 1, color: '#d9c2f0', icon: '⚙️' },
};

const snap = (v) => Math.round(v / GRID) * GRID;
const snapUp = (v) => Math.ceil(v / GRID) * GRID;

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

// 8 characters of a-z0-9 from the secure random source (R1.14).
function randomId() {
  let id = '';
  while (id.length < ID_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      if (b < 252 && id.length < ID_LENGTH) id += ID_CHARS[b % 36]; // 252 = 7 * 36: no modulo bias
    }
  }
  return id;
}

// A fresh id that is not in `used`; it is added to `used`.
function uniqueId(used) {
  let id = randomId();
  while (used.has(id)) id = randomId();
  used.add(id);
  return id;
}

const SLICE_MIN_X = LABEL_ZONE;
const slices = (nodes, chapterId) =>
  nodes
    .filter((n) => n.type === 'slice' && (chapterId === undefined || n.parentNode === chapterId))
    .sort((a, b) => a.position.x - b.position.x);
const lanesOf = (nodes, chapterId) =>
  nodes
    .filter((n) => n.type === 'lane' && n.parentNode === chapterId)
    .sort((a, b) => a.position.y - b.position.y);
const chaptersOf = (nodes) => nodes.filter((n) => n.type === 'chapter');

const setSliceWidth = (nodes, id, width) =>
  nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, width } } : n));

// The slice an element is in: the slice of its Chapter that holds its left edge (an element
// is kept at least SLICE_PADDING inside its slice, and may grow to the right), else the one
// it overlaps most, else the nearest. Undefined only when the Chapter has no slice.
function sliceOf(ss, n) {
  const mine = ss.filter((s) => s.parentNode === n.parentNode);
  const l = n.position.x;
  const r = l + (n.width ?? STICKY_W);
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
function membersOf(nodes) {
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
function layoutSlices(nodes, ref = nodes) {
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
    if (n.type === 'lane' && widths.has(n.parentNode) && n.data.width !== widths.get(n.parentNode)) {
      changed = true;
      return { ...n, data: { ...n.data, width: widths.get(n.parentNode) } };
    }
    if (shift.has(n.id)) {
      changed = true;
      return { ...n, position: { ...n.position, x: n.position.x + shift.get(n.id) } };
    }
    return n;
  });
  return changed ? next : nodes;
}

// An element never straddles a slice boundary: it is moved fully inside its slice (keeping
// SLICE_PADDING from its borders), and that slice grows if the element does not fit.
function settleStickies(nodes, only) {
  const ss = slices(nodes);
  if (!ss.length) return nodes;
  const widen = new Map();
  let changed = false;
  const placed = nodes.map((n) => {
    if (n.type !== 'sticky' || (only && !only.has(n.id))) return n;
    const w = n.width ?? STICKY_W;
    const l = n.position.x;
    const best = sliceOf(ss, n);
    if (!best) return n;
    const room = Math.max(best.data.width, snapUp(w + 2 * SLICE_PADDING));
    if (room > best.data.width) widen.set(best.id, Math.max(widen.get(best.id) ?? 0, room));
    const x = Math.min(
      Math.max(l, best.position.x + SLICE_PADDING),
      best.position.x + room - w - SLICE_PADDING
    );
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
function centerStickies(nodes, only) {
  const lanes = nodes.filter((n) => n.type === 'lane');
  if (!lanes.length) return nodes;
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== 'sticky' || (only && !only.has(n.id))) return n;
    const h = n.height ?? STICKY_H;
    const mid = n.position.y + h / 2;
    const lane = lanes.find(
      (l) =>
        l.parentNode === n.parentNode &&
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
// Cell it returns to where the drag started (`origin`: id -> { parentNode, position }).
// `only` limits it to those ids.
function adoptStickies(nodes, only, origin) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== 'sticky' || !only.has(n.id)) return n;
    const parent = byId.get(n.parentNode);
    if (!parent) return n;
    const w = n.width ?? STICKY_W;
    const ax = parent.position.x + n.position.x;
    const ay = parent.position.y + n.position.y;
    const cell = cellAt(nodes, { x: ax + w / 2, y: ay + (n.height ?? STICKY_H) / 2 });
    if (!cell) {
      const from = origin.get(n.id);
      if (!from) return n;
      changed = true;
      return { ...n, parentNode: from.parentNode, position: { ...from.position } };
    }
    const chapter = byId.get(cell.chapterId);
    const slice = byId.get(cell.sliceId);
    const x = Math.max(
      slice.position.x + SLICE_PADDING,
      Math.min(ax - chapter.position.x, slice.position.x + slice.data.width - w - SLICE_PADDING)
    );
    const y = ay - chapter.position.y;
    if (chapter.id === n.parentNode && x === n.position.x && y === n.position.y) return n;
    changed = true;
    return { ...n, parentNode: chapter.id, position: { x, y } };
  });
  return changed ? next : nodes;
}

const normalize = (nodes) => centerStickies(settleStickies(layoutSlices(nodes)));

// A Cell is the intersection of a lane and a slice of one Chapter: one box of the
// Chapter's grid (lanes are the rows, slices the columns). It is not stored anywhere;
// it follows from the lanes and slices. This finds the Cell under a canvas point
// (flow coordinates), or null when the point is not inside any Cell.
function cellAt(nodes, p) {
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

// Undo/redo works on whole-board snapshots. A continuous gesture (dragging a note,
// resizing a slice) brackets itself with begin/end so it records a single entry.
const HistoryContext = createContext({ begin: () => {}, end: () => {} });
const MAX_HISTORY = 100;

// What counts as the board's content: selection, measured sizes and drag flags
// are deliberately left out, so they never create history entries.
const keyOf = (nodes, edges) =>
  JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.parentNode, n.position.x, n.position.y, n.data]),
    edges.map((e) => [e.id, e.source, e.target]),
  ]);

// Starts a horizontal pointer drag; onMove receives the total delta in flow units.
function useHorizontalDrag() {
  const zoom = useStore((s) => s.transform[2]);
  const history = useContext(HistoryContext);
  return (e, onMove, onEnd) => {
    history.begin();
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const move = (ev) => onMove((ev.clientX - startX) / zoom);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onEnd?.();
      history.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}

// Lanes and slices are children of a Chapter, so React Flow cannot drag the Chapter
// from them. This returns a pointer-down handler that moves the Chapter that owns the
// node `nodeId`: snapped to the grid, one undo step, and the Chapter becomes the active
// one. A press that does not move (a click or double-click) is left alone, so renaming
// still works. `skip` lets the caller veto a press (e.g. while editing). With `select`,
// pressing also selects `nodeId`, so the node stays selectable by its header even while it
// is being renamed or its Chapter is being dragged.
function useChapterDrag(nodeId, skip, select = false) {
  const { setNodes, getNodes } = useReactFlow();
  const storeApi = useStoreApi();
  const zoom = useStore((s) => s.transform[2]);
  const history = useContext(HistoryContext);
  const { activate, clearCell } = useContext(BoardActions);
  return (e) => {
    if (e.button !== 0) return;
    clearCell(); // pressing a header selects something else
    if (select && !e.target.closest('button')) {
      const { addSelectedNodes, nodeInternals } = storeApi.getState();
      if (!nodeInternals.get(nodeId)?.selected) addSelectedNodes([nodeId]);
    }
    if (e.target.closest('button, input') || skip?.()) return;
    const chapterId = getNodes().find((n) => n.id === nodeId)?.parentNode;
    const chapter = getNodes().find((n) => n.id === chapterId);
    if (!chapter) return;
    const start = { ...chapter.position };
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        started = true;
        history.begin();
        activate(chapterId);
      }
      const x = snap(start.x + (ev.clientX - sx) / zoom);
      const y = snap(start.y + (ev.clientY - sy) / zoom);
      setNodes((ns) =>
        ns.map((n) => (n.id === chapterId ? { ...n, position: { x, y } } : n))
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (started) history.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}

const BoardActions = createContext({
  activate: () => {},
  clearCell: () => {},
  addSliceAfter: () => {},
  removeLane: () => {},
  removeChapter: () => {},
  activeId: null,
  chapterCount: 1,
});

function LaneNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeLane } = useContext(BoardActions);
  // The last lane of a Chapter cannot be removed.
  const canRemove = useStore((s) => {
    const parent = s.nodeInternals.get(id)?.parentNode;
    let count = 0;
    s.nodeInternals.forEach((n) => {
      if (n.type === 'lane' && n.parentNode === parent) count++;
    });
    return count > 1;
  });
  // Outline classes: only the top lane draws the Chapter's top edge, the bottom lane its bottom edge.
  const edges = useStore((s) => {
    const me = s.nodeInternals.get(id);
    if (!me) return '';
    let first = true;
    let last = true;
    s.nodeInternals.forEach((n) => {
      if (n.type !== 'lane' || n.parentNode !== me.parentNode || n.id === id) return;
      if (n.position.y < me.position.y) first = false;
      if (n.position.y > me.position.y) last = false;
    });
    return `${first ? ' first' : ''}${last ? ' last' : ''}`;
  });
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, [editing]);

  const rename = (text) => {
    setEditing(false);
    const label = text.replace(/\s+/g, ' ').trim();
    if (!label) return; // keep the old name rather than leaving the lane unnamed
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n))
    );
  };

  // Dragging a lane header moves the whole Chapter, like its handle does.
  const startChapterDrag = useChapterDrag(id, () => editing);

  return (
    <div
      className={`lane${data.alt ? ' alt' : ''}${edges}`}
      style={{ width: data.width ?? LANE_WIDTH, height: data.height }}
    >
      <div
        className="lane-header nodrag nopan"
        style={{ width: LABEL_ZONE }}
        onPointerDown={startChapterDrag}
      >
        {canRemove && (
          <button className="lane-remove" title="Remove lane" onClick={() => removeLane(id)}>
            ×
          </button>
        )}
        {/* Edited in place: the same rotated element becomes editable text. */}
        <span
          ref={ref}
          className={`lane-label${editing ? ' editing' : ''}`}
          title={editing ? undefined : `${data.label} (double-click to rename, drag to move the Chapter)`}
          contentEditable={editing ? 'plaintext-only' : undefined}
          suppressContentEditableWarning
          spellCheck={false}
          onDoubleClick={() => setEditing(true)}
          onBlur={editing ? (e) => rename(e.currentTarget.textContent) : undefined}
          onKeyDown={
            editing
              ? (e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }
              : undefined
          }
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}

function StickyNode({ id, data, selected }) {
  const { setNodes } = useReactFlow();
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (editingTitle) titleRef.current?.select();
  }, [editingTitle]);

  const [editingHtml, setEditingHtml] = useState(false);
  const isScreen = data.kind === 'screen';

  const update = (patch) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  const commitTitle = (title) => {
    setEditingTitle(false);
    update({ title: title.trim() });
  };

  return (
    <div
      className={`sticky ${data.kind} ${isScreen && data.html ? 'wide' : ''} ${selected ? 'selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className="sticky-header"
        title="Double-click to edit the title"
        onDoubleClick={() => setEditingTitle(true)}
      >
        {KINDS[data.kind].icon && <span className="kind-icon">{KINDS[data.kind].icon}</span>}
        {editingTitle ? (
          <input
            ref={titleRef}
            className="nodrag title-input"
            defaultValue={data.title ?? ''}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
            }}
          />
        ) : (
          <span className={`title ${data.title ? '' : 'empty'}`}>{data.title || 'Title'}</span>
        )}
        {isScreen && (
          <button
            className="html-btn nodrag"
            title="Edit HTML mockup"
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => setEditingHtml((v) => !v)}
          >
            {'</>'}
          </button>
        )}
      </div>
      <div className="sticky-body">
      {isScreen && editingHtml && (
        <textarea
          className="nodrag nowheel html-editor"
          autoFocus
          placeholder="<h1>Hello</h1>"
          defaultValue={data.html ?? ''}
          onDoubleClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            update({ html: e.target.value });
            setEditingHtml(false);
          }}
          onKeyDown={(e) => e.key === 'Escape' && e.target.blur()}
        />
      )}
      {isScreen && data.html && !editingHtml && (
        <iframe
          className="screen-frame"
          title={data.title || 'Screen mockup'}
          sandbox=""
          srcDoc={data.html}
        />
      )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// A slice is a vertical band across all lanes: one end-to-end piece of behavior.
function SliceNode({ id, data, selected }) {
  const { setNodes, getNodes } = useReactFlow();
  const startDrag = useHorizontalDrag();
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const lanesHeight = useStore((s) => {
    const parent = s.nodeInternals.get(id)?.parentNode;
    let sum = 0;
    s.nodeInternals.forEach((n) => {
      if (n.type === 'lane' && n.parentNode === parent) sum += n.data.height;
    });
    return sum;
  });

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const update = (patch) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  // Dragging a slice header moves the whole Chapter (slices themselves never move on
  // their own: their order and position come from the layout).
  const startChapterDrag = useChapterDrag(id, () => editing, true);
  const { addSliceAfter } = useContext(BoardActions);

  // Each drag is computed from a snapshot taken at pointer-down, so the following
  // slices, their elements and a grown Chapter follow the edge both ways.
  const resizeRight = (e) => {
    const base = getNodes();
    const me = base.find((n) => n.id === id);
    // Cannot be narrower than the elements it holds.
    const needed = (membersOf(base).get(id) ?? []).reduce(
      (m, n) => Math.max(m, n.position.x + (n.width ?? STICKY_W) + SLICE_PADDING - me.position.x),
      0
    );
    const startW = data.width;
    startDrag(
      e,
      (dx) => {
        const width = Math.max(SLICE_MIN_WIDTH, snapUp(needed), snap(startW + dx));
        setNodes(layoutSlices(setSliceWidth(base, id, width), base));
      },
      () => setNodes((ns) => centerStickies(settleStickies(ns)))
    );
  };

  return (
    <div
      className={`slice ${selected ? 'selected' : ''}`}
      style={{ width: data.width, height: SLICE_HEADER + lanesHeight }}
    >
      <div
        className="slice-header nodrag nopan"
        title="Drag to move the Chapter, double-click to rename"
        onPointerDown={startChapterDrag}
        onDoubleClick={() => setEditing(true)}
      >
        {editing ? (
          <input
            ref={ref}
            className="nodrag"
            defaultValue={data.name}
            onBlur={(e) => {
              setEditing(false);
              const name = e.target.value.trim();
              if (name) update({ name }); // an empty name keeps the old one
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
            }}
          />
        ) : (
          <span className="slice-name">{data.name}</span>
        )}
        <button
          className="slice-add nodrag"
          title="Add a slice right after this one"
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => addSliceAfter(id)}
        >
          +
        </button>
      </div>
      <div
        className="resize-handle slice-handle right nodrag nopan"
        title="Drag to resize"
        onPointerDown={resizeRight}
      />
    </div>
  );
}

// A Chapter node is a transparent box over its lanes, with a handle above the slices
// (drag it to move the Chapter, double-click to rename) and two connection ports:
// incoming on the left side, outgoing on the right side.
function ChapterNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeChapter, activeId, chapterCount } = useContext(BoardActions);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const width = useStore((s) => {
    let w = 0;
    s.nodeInternals.forEach((n) => {
      if (n.type === 'lane' && n.parentNode === id) w = Math.max(w, n.data.width ?? LANE_WIDTH);
    });
    return w || 1;
  });
  const height = useStore((s) => {
    let h = 0;
    s.nodeInternals.forEach((n) => {
      if (n.type === 'lane' && n.parentNode === id) h += n.data.height;
    });
    return h || 1;
  });

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const rename = (value) => {
    setEditing(false);
    const name = value.trim();
    if (!name) return; // an empty name keeps the old one
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
    );
  };

  return (
    <div style={{ width, height }}>
      <Handle type="target" position={Position.Left} className="chapter-port" />
      <Handle type="source" position={Position.Right} className="chapter-port" />
      <div
        className={`chapter-handle nopan ${activeId === id ? 'active' : ''}`}
        title="Drag to move the Chapter"
      >
        {editing ? (
          <input
            ref={ref}
            className="nodrag"
            defaultValue={data.name}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
            }}
          />
        ) : (
          <span onDoubleClick={() => setEditing(true)}>⠿ {data.name}</span>
        )}
        {chapterCount > 1 && (
          <button
            className="chapter-remove nodrag"
            title="Remove this Chapter"
            onClick={() => removeChapter(id)}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { lane: LaneNode, sticky: StickyNode, slice: SliceNode, chapter: ChapterNode };

const chapterDefaults = {
  dragHandle: '.chapter-handle',
  deletable: false, // removed with the × button, never with the keyboard
  connectable: true,
  // Only the handle and the ports take the mouse; lanes and elements below stay usable.
  style: { pointerEvents: 'none' },
};

const makeChapter = (id, x, y, name) => ({
  id,
  type: 'chapter',
  position: { x, y },
  data: { name },
  ...chapterDefaults,
});

const makeSlice = (id, x, width, name, chapterId) => ({
  id,
  type: 'slice',
  position: { x, y: SLICE_Y },
  data: { name, width },
  parentNode: chapterId,
  draggable: false,
  zIndex: -1,
  // Only the header takes pointer events, so notes under the band stay usable.
  style: { pointerEvents: 'none' },
});

const makeLane = (id, chapterId, label, y, alt, width) => ({
  id,
  type: 'lane',
  position: { x: 0, y },
  parentNode: chapterId,
  data: { label, height: LANE_HEIGHT, width, alt },
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
  focusable: false,
  zIndex: -1,
});

const edgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};

// Arrows between Chapters are heavier and darker than arrows between elements.
const chapterEdgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#5b5b6b' },
  style: { strokeWidth: 3, stroke: '#5b5b6b' },
};

// A connection has no id of its own (R1.16); React Flow needs one, so it is derived.
const makeEdge = (source, target, chapterLevel) => ({
  id: `${source}>${target}`,
  source,
  target,
  ...(chapterLevel ? chapterEdgeDefaults : edgeDefaults),
});

// The sample flow (R1.4) with fresh ids.
function makeSample() {
  const used = new Set();
  const id = () => uniqueId(used);
  const chapterId = id();
  const sticky = (kind, col, title) => ({
    id: id(),
    type: 'sticky',
    position: { x: LABEL_ZONE + 20 + col * 220, y: LANES[KINDS[kind].lane].y + 40 },
    parentNode: chapterId,
    data: { kind, title },
  });
  const [n1, n2, n3, n4, n5] = [
    sticky('screen', 0, 'Add Item form'),
    sticky('command', 0, 'Add Item'),
    sticky('event', 1, 'Item Added'),
    sticky('readmodel', 2, 'Cart Items'),
    sticky('screen', 2, 'Cart view'),
  ];
  const nodes = normalize([
    makeChapter(chapterId, 0, 0, 'Chapter 1'),
    ...LANES.map((l, i) => makeLane(id(), chapterId, l.label, l.y, i % 2 === 1, LANE_WIDTH)),
    makeSlice(id(), LABEL_ZONE, 440, 'Add Item', chapterId),
    makeSlice(id(), LABEL_ZONE + 440, 220, 'View Cart', chapterId),
    n1,
    n2,
    n3,
    n4,
    n5,
  ]);
  const edges = [
    [n1, n2],
    [n2, n3],
    [n3, n4],
    [n4, n5],
  ].map(([a, b]) => makeEdge(a.id, b.id, false));
  return { nodes, edges };
}

const STORAGE_KEY = 'event-model-board';

const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The export file (section 6): the one complete description of the board. Values that follow
// from the layout rules are left out. Field order is fixed so the same board always gives
// the same text.
function serialize(nodes, edges) {
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
        const cy = n.position.y + (n.height ?? STICKY_H) / 2;
        let found = lanes[0];
        for (const l of lanes) if (cy >= l.position.y) found = l;
        return found;
      };
      const chapterSlices = slices(nodes, ch.id);
      const bySlice = new Map(chapterSlices.map((s) => [s.id, []]));
      for (const n of nodes) {
        if (n.type !== 'sticky' || n.parentNode !== ch.id) continue;
        const sl = sliceOf(ss, n);
        if (sl) bySlice.get(sl.id).push({ n, lane: laneOf(n) });
      }
      const connectsTo = [];
      items.push([ch.id, connectsTo]);
      return {
        id: ch.id,
        name: ch.data.name,
        x: ch.position.x,
        y: ch.position.y,
        connectsTo,
        lanes: lanes.map((l) => ({ id: l.id, name: l.data.label })),
        slices: chapterSlices.map((sl) => ({
          id: sl.id,
          name: sl.data.name,
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
              return {
                id: n.id,
                type: n.data.kind,
                lane: lane.id,
                title: n.data.title ?? '',
                ...(n.data.kind === 'screen' && n.data.html ? { html: n.data.html } : {}),
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
  return { format: 'event-model', version: 1, chapters };
}

const boardText = (nodes, edges) => JSON.stringify(serialize(nodes, edges), null, 2);

const ID_PATTERN = /^[A-Za-z0-9_-]{8,}$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasKey = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const stickyWidth = (kind, html) => (kind === 'screen' && html ? STICKY_WIDE_W : STICKY_W);

// Reads the export file (section 7). The whole file is checked before anything is built; the
// first problem throws an Error that names where it is. Returns { nodes, edges }.
function parseBoard(text) {
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
  object(data, ['format', 'version', 'chapters'], '');
  if (data.format !== 'event-model') fail('format', 'must be "event-model"');
  if (data.version !== 1) fail('version', 'must be 1');
  list(data.chapters, 'chapters', true);

  const kindOf = new Map(); // id -> chapter | lane | slice | element
  const claim = (id, kind, path) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      fail(path, 'must be a text of at least 8 letters, digits, "-" or "_"');
    }
    if (kindOf.has(id)) fail(path, `duplicate id "${id}"`);
    kindOf.set(id, kind);
  };
  const links = []; // connectsTo lists to check once every id is known
  const nodes = [];

  data.chapters.forEach((c, ci) => {
    const cp = `chapters[${ci}]`;
    object(c, ['id', 'name', 'x', 'y', 'connectsTo', 'lanes', 'slices'], cp);
    claim(c.id, 'chapter', at(cp, 'id'));
    name(c.name, at(cp, 'name'));
    number(c.x, at(cp, 'x'));
    number(c.y, at(cp, 'y'));
    list(c.connectsTo, at(cp, 'connectsTo'));
    links.push({ owner: c.id, kind: 'chapter', path: at(cp, 'connectsTo'), ids: c.connectsTo });
    list(c.lanes, at(cp, 'lanes'), true);
    list(c.slices, at(cp, 'slices'), true);
    nodes.push(makeChapter(c.id, c.x, c.y, c.name));

    const laneY = new Map();
    c.lanes.forEach((l, li) => {
      const lp = `${cp}.lanes[${li}]`;
      object(l, ['id', 'name'], lp);
      claim(l.id, 'lane', at(lp, 'id'));
      name(l.name, at(lp, 'name'));
      laneY.set(l.id, li * LANE_HEIGHT);
      nodes.push(makeLane(l.id, c.id, l.name, li * LANE_HEIGHT, li % 2 === 1, LANE_WIDTH));
    });

    let cursor = SLICE_MIN_X;
    c.slices.forEach((sl, si) => {
      const sp = `${cp}.slices[${si}]`;
      object(sl, ['id', 'name', 'width', 'elements'], sp);
      claim(sl.id, 'slice', at(sp, 'id'));
      name(sl.name, at(sp, 'name'));
      number(sl.width, at(sp, 'width'));
      if (sl.width < SLICE_MIN_WIDTH) fail(at(sp, 'width'), `must be at least ${SLICE_MIN_WIDTH}`);
      list(sl.elements, at(sp, 'elements'));
      const width = sl.width;
      nodes.push(makeSlice(sl.id, cursor, width, sl.name, c.id));

      sl.elements.forEach((el, ei) => {
        const ep = `${sp}.elements[${ei}]`;
        object(el, ['id', 'type', 'lane', 'title', 'x', 'connectsTo'], ep, ['html']);
        claim(el.id, 'element', at(ep, 'id'));
        if (typeof el.type !== 'string' || !hasKey(KINDS, el.type)) {
          fail(at(ep, 'type'), `must be one of ${Object.keys(KINDS).join(', ')}`);
        }
        string(el.lane, at(ep, 'lane'));
        if (!laneY.has(el.lane)) {
          fail(at(ep, 'lane'), `no lane with id "${el.lane}" in this chapter`);
        }
        string(el.title, at(ep, 'title'));
        if (hasKey(el, 'html')) {
          string(el.html, at(ep, 'html'));
          if (el.html === '') fail(at(ep, 'html'), 'must be left out when empty');
          if (el.type !== 'screen') fail(at(ep, 'html'), 'only a screen can have html');
        }
        number(el.x, at(ep, 'x'));
        if (el.x < SLICE_PADDING) fail(at(ep, 'x'), `must be at least ${SLICE_PADDING}`);
        const w = stickyWidth(el.type, el.html);
        if (el.x + w + SLICE_PADDING > sl.width) {
          fail(
            at(ep, 'x'),
            `the element (x ${el.x}, width ${w}) does not fit in the slice with ${SLICE_PADDING}px margins (width ${sl.width})`
          );
        }
        list(el.connectsTo, at(ep, 'connectsTo'));
        links.push({ owner: el.id, kind: 'element', path: at(ep, 'connectsTo'), ids: el.connectsTo });
        nodes.push({
          id: el.id,
          type: 'sticky',
          parentNode: c.id,
          position: { x: cursor + el.x, y: laneY.get(el.lane) + 40 },
          data: {
            kind: el.type,
            title: el.title,
            ...(el.html ? { html: el.html } : {}),
          },
        });
      });
      cursor += width;
    });
  });

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
      if (seen.has(t)) fail(p, `id "${t}" is listed twice`);
      seen.add(t);
      edges.push(makeEdge(owner, t, kind === 'chapter'));
    });
  }
  return { nodes: normalize(nodes), edges };
}

function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseBoard(text);
  } catch {
    // missing, corrupt or unavailable storage: the sample board is shown
  }
  return null;
}

// Where a new element goes in a Cell (a lane crossed with a slice): the first spot from
// the left, inside the slice's margins, that does not overlap an element already in the
// Cell. When the Cell is full it goes after the last element and the slice has to grow:
// `sliceWidth` is the width the slice needs (the current width when nothing changes).
function spotInCell(nodes, lane, slice) {
  const inCell = (membersOf(nodes).get(slice.id) ?? []).filter((n) => {
    const mid = n.position.y + (n.height ?? STICKY_H) / 2;
    return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
  const left = slice.position.x + SLICE_PADDING;
  const lastFit = slice.position.x + slice.data.width - SLICE_PADDING - STICKY_W;
  const free = (x) =>
    !inCell.some(
      (m) => x < m.position.x + (m.width ?? STICKY_W) + GRID && m.position.x < x + STICKY_W + GRID
    );
  let x = left;
  while (x <= lastFit && !free(x)) x += GRID;
  if (x > lastFit) {
    // Full: continue after the right-most element, widening the slice.
    const after = inCell.reduce((m, n) => Math.max(m, n.position.x + (n.width ?? STICKY_W)), left - GRID);
    x = Math.max(left, snapUp(after + GRID));
  }
  const need = snapUp(x + STICKY_W + SLICE_PADDING - slice.position.x);
  return { x, y: lane.position.y + 40, sliceWidth: Math.max(slice.data.width, need) };
}

// Draws the border of the selected Cell above everything else. It is positioned from the
// canvas transform, so it follows panning, zooming and moving the Chapter.
function CellHighlight({ cell }) {
  const box = useStore((s) => {
    if (!cell) return null;
    const lane = s.nodeInternals.get(cell.laneId);
    const slice = s.nodeInternals.get(cell.sliceId);
    if (!lane || !slice) return null; // the lane or slice was removed
    const [tx, ty, zoom] = s.transform;
    return [
      slice.positionAbsolute.x * zoom + tx,
      lane.positionAbsolute.y * zoom + ty,
      slice.data.width * zoom,
      lane.data.height * zoom,
    ].join(',');
  });
  if (!box) return null;
  const [left, top, width, height] = box.split(',').map(Number);
  return <div className="cell-highlight" style={{ left, top, width, height }} />;
}

function Board() {
  const saved = useMemo(() => load() ?? makeSample(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(saved.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.edges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();
  const canvasRef = useRef(null);

  // `count` ids that are unused on the board and different from each other.
  const newIds = (count = 1) => {
    const used = new Set(getNodes().map((n) => n.id));
    return Array.from({ length: count }, () => uniqueId(used));
  };

  // Toolbar buttons that add things (elements, slices, lanes) act on the active Chapter:
  // the one last clicked or dragged, or the first one.
  const [activeId, setActiveId] = useState(null);
  const chapters = nodes.filter((n) => n.type === 'chapter');
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const activeChapterId = active?.id;

  // The selected Cell, if any: { chapterId, laneId, sliceId }. Selection only: it is not
  // saved, exported or recorded for undo.
  const [selectedCell, setSelectedCell] = useState(null);
  const focusChapter = (node) =>
    setActiveId(node.type === 'chapter' ? node.id : node.parentNode ?? null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, boardText(nodes, edges));
    } catch {
      // ignore unavailable storage
    }
  }, [nodes, edges]);

  // ---- Undo / redo (in memory only) ----
  const past = useRef([]);
  const future = useRef([]);
  const present = useRef(null);
  const gesture = useRef(0); // >0 while a drag/resize is in progress
  const silentAt = useRef(0); // when the board last re-settled itself after a measure
  const [tick, setTick] = useState(0);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: past.current.length, redo: future.current.length });

  useEffect(() => {
    if (gesture.current > 0) return;
    const key = keyOf(nodes, edges);
    if (!present.current) {
      present.current = { nodes, edges, key };
      return;
    }
    if (key === present.current.key) return;
    // Changes made by the board itself right after an element was measured (such as
    // re-centring it) are folded into the user's operation instead of being separate steps.
    const silent = performance.now() - silentAt.current < 300;
    silentAt.current = 0;
    if (!silent) {
      past.current.push(present.current);
      if (past.current.length > MAX_HISTORY) past.current.shift();
      future.current = [];
      syncHist();
    }
    present.current = { nodes, edges, key };
  }, [nodes, edges, tick]);

  const historyApi = useMemo(
    () => ({
      begin: () => {
        gesture.current++;
      },
      end: () => {
        gesture.current = Math.max(0, gesture.current - 1);
        setTick((t) => t + 1);
      },
    }),
    []
  );

  const restore = useCallback(
    (snap) => {
      setNodes(snap.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges(snap.edges.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setSelectedCell(null);
    },
    [setNodes, setEdges]
  );

  const undo = useCallback(() => {
    if (gesture.current > 0) return;
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(present.current);
    present.current = prev;
    restore(prev);
    syncHist();
  }, [restore]);

  const redo = useCallback(() => {
    if (gesture.current > 0) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(present.current);
    present.current = next;
    restore(next);
    syncHist();
  }, [restore]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Slices are laid out automatically, so they cannot be dragged. Deleting a slice also
  // deletes its elements (after confirmation) and closes the gap it leaves. The last slice of
  // a Chapter cannot be deleted. Only one slice is selected at a time.
  const handleNodesChange = useCallback(
    (changes) => {
      const current = getNodes();
      const isSliceId = (id) => current.find((n) => n.id === id)?.type === 'slice';
      const isSliceRemoval = (c) => c.type === 'remove' && isSliceId(c.id);
      let kept = changes.filter((c) => !(c.type === 'position' && isSliceId(c.id)));
      let sliceRemoved = false;
      const isSliceSelect = (c) => c.type === 'select' && c.selected && isSliceId(c.id);
      const picked = kept.filter(isSliceSelect).at(-1)?.id;
      if (picked) {
        kept = kept.filter((c) => !isSliceSelect(c) || c.id === picked);
        const others = current.filter((n) => n.type === 'slice' && n.selected && n.id !== picked);
        kept = [...kept, ...others.map((n) => ({ type: 'select', id: n.id, selected: false }))];
      }
      const refused = new Set();
      for (const ch of chaptersOf(current)) {
        const all = slices(current, ch.id);
        if (all.length === 1) refused.add(all[0].id);
      }
      kept = kept.filter((c) => !(isSliceRemoval(c) && refused.has(c.id)));
      const removed = kept.filter(isSliceRemoval);
      if (removed.length) {
        const members = membersOf(current);
        const doomed = removed.flatMap((c) => members.get(c.id) ?? []);
        if (
          doomed.length &&
          !window.confirm(`Delete the slice and its ${doomed.length} element(s)?`)
        ) {
          kept = kept.filter((c) => !isSliceRemoval(c));
        } else {
          sliceRemoved = true;
          const already = new Set(kept.filter((c) => c.type === 'remove').map((c) => c.id));
          kept = [
            ...kept,
            ...doomed.filter((n) => !already.has(n.id)).map((n) => ({ type: 'remove', id: n.id })),
          ];
          if (doomed.length) {
            const gone = new Set(doomed.map((n) => n.id));
            setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
          }
        }
      }
      onNodesChange(kept);
      if (sliceRemoved) setNodes((ns) => layoutSlices(ns));
      // Measured sizes arrive after render (e.g. a Screen widening for its mockup).
      const stickyIds = new Set(getNodes().filter((n) => n.type === 'sticky').map((n) => n.id));
      if (kept.some((c) => c.type === 'dimensions' && stickyIds.has(c.id))) {
        silentAt.current = performance.now();
        setNodes((ns) => centerStickies(settleStickies(ns)));
      }
    },
    [onNodesChange, getNodes, setNodes, setEdges]
  );

  const addSlice = () => {
    if (!activeChapterId) return;
    const [id] = newIds();
    setNodes((ns) => {
      // (end is the right edge of the last slice; layout then widens the Chapter if needed)
      const end = slices(ns, activeChapterId).reduce(
        (max, n) => Math.max(max, n.position.x + n.data.width),
        SLICE_MIN_X
      );
      return layoutSlices([
        ...ns,
        makeSlice(id, end, DEFAULT_SLICE_WIDTH, 'New Slice', activeChapterId),
      ]);
    });
  };

  // Inserts a slice immediately after `sliceId`. The later slices (and their elements)
  // move right to make room. The new slice starts 1px before the next slice so that the
  // layout, which orders slices by position, puts it between the two.
  const addSliceAfter = (sliceId) => {
    const [id] = newIds();
    setNodes((ns) => {
      const cur = ns.find((n) => n.id === sliceId);
      if (!cur) return ns;
      const added = makeSlice(
        id,
        cur.position.x + cur.data.width - 1,
        DEFAULT_SLICE_WIDTH,
        'New Slice',
        cur.parentNode
      );
      return layoutSlices([...ns, added], ns);
    });
    setActiveId(nodes.find((n) => n.id === sliceId)?.parentNode ?? null);
  };

  const addLane = () => {
    if (!activeChapterId) return;
    const [id] = newIds();
    setNodes((ns) => {
      const ls = lanesOf(ns, activeChapterId);
      const y = ls.reduce((sum, l) => sum + l.data.height, 0);
      const width = ls[0]?.data.width ?? LANE_WIDTH;
      return [...ns, makeLane(id, activeChapterId, 'New Lane', y, ls.length % 2 === 1, width)];
    });
  };

  const removeLane = useCallback(
    (laneId) => {
      const lane = nodes.find((n) => n.id === laneId);
      if (!lane) return;
      const chapterId = lane.parentNode;
      if (lanesOf(nodes, chapterId).length <= 1) return;
      const top = lane.position.y;
      const bottom = top + lane.data.height;
      const mine = (n) => n.parentNode === chapterId;
      const inLane = (n) =>
        n.type === 'sticky' && mine(n) && n.position.y >= top && n.position.y < bottom;
      const doomed = nodes.filter(inLane);
      if (
        doomed.length &&
        !window.confirm(`Remove this lane and its ${doomed.length} note(s)?`)
      )
        return;
      const gone = new Set([laneId, ...doomed.map((n) => n.id)]);
      let laneIndex = 0;
      setNodes(
        nodes
          .filter((n) => !gone.has(n.id))
          .map((n) =>
            mine(n) && (n.type === 'sticky' || n.type === 'lane') && n.position.y >= bottom
              ? { ...n, position: { ...n.position, y: n.position.y - lane.data.height } }
              : n
          )
          .map((n) =>
            n.type === 'lane' && mine(n)
              ? { ...n, data: { ...n.data, alt: laneIndex++ % 2 === 1 } }
              : n
          )
      );
      setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    },
    [nodes, setNodes, setEdges]
  );

  // A new Chapter starts empty (default lanes, no slices) to the right of the others,
  // and the view pans to it.
  const addChapter = () => {
    const [id, sliceId, ...laneIds] = newIds(2 + LANES.length);
    const width = SLICE_MIN_X + DEFAULT_SLICE_WIDTH;
    // Centre the new Chapter on the middle of what is currently visible.
    const box = canvasRef.current?.getBoundingClientRect();
    const mid = box
      ? screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
      : { x: width / 2, y: (LANES.length * LANE_HEIGHT) / 2 };
    const x = snap(mid.x - width / 2);
    const y = snap(mid.y - (LANES.length * LANE_HEIGHT) / 2);
    setNodes((ns) => [
      ...ns,
      makeChapter(id, x, y, `Chapter ${chapters.length + 1}`),
      ...LANES.map((l, i) => makeLane(laneIds[i], id, l.label, l.y, i % 2 === 1, width)),
      makeSlice(sliceId, SLICE_MIN_X, DEFAULT_SLICE_WIDTH, 'New Slice', id),
    ]);
    setActiveId(id);
  };

  const removeChapter = useCallback(
    (chapterId) => {
      if (chaptersOf(nodes).length <= 1) return;
      const kids = nodes.filter((n) => n.parentNode === chapterId);
      const sliceCount = kids.filter((n) => n.type === 'slice').length;
      const elementCount = kids.filter((n) => n.type === 'sticky').length;
      if (
        (sliceCount || elementCount) &&
        !window.confirm(
          `Remove this Chapter with its ${sliceCount} slice(s) and ${elementCount} element(s)?`
        )
      )
        return;
      const gone = new Set([chapterId, ...kids.map((n) => n.id)]);
      setNodes(nodes.filter((n) => !gone.has(n.id)));
      setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    },
    [nodes, setNodes, setEdges]
  );

  const boardActions = useMemo(
    () => ({
      activate: setActiveId,
      clearCell: () => setSelectedCell(null),
      addSliceAfter,
      removeLane,
      removeChapter,
      activeId: activeChapterId,
      chapterCount: chapters.length,
    }),
    [removeLane, removeChapter, addSliceAfter, activeChapterId, chapters.length]
  );

  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([boardText(nodes, edges)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'event-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileInput = useRef(null);

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      const board = parseBoard(await file.text());
      if (!window.confirm('Replace the current board with the imported one?')) return;
      setSelectedCell(null);
      setActiveId(null);
      setNodes(board.nodes);
      setEdges(board.edges);
    } catch (err) {
      window.alert(`Could not import "${file.name}": ${err.message}`);
    }
  };

  // Elements connect to elements and Chapters to Chapters, never across the two, never to
  // themselves, and at most once in each direction.
  const isValidConnection = useCallback(
    (c) => {
      if (c.source === c.target) return false;
      const ns = getNodes();
      const a = ns.find((n) => n.id === c.source)?.type;
      const b = ns.find((n) => n.id === c.target)?.type;
      if (a !== b || (a !== 'sticky' && a !== 'chapter')) return false;
      return !getEdges().some((e) => e.source === c.source && e.target === c.target);
    },
    [getNodes, getEdges]
  );

  const onConnect = useCallback(
    (c) => {
      if (!isValidConnection(c)) return;
      const fromChapter = getNodes().find((n) => n.id === c.source)?.type === 'chapter';
      setEdges((es) => [...es, makeEdge(c.source, c.target, fromChapter)]);
    },
    [setEdges, getNodes, isValidConnection]
  );

  // An element is only created in a Cell. A `drop` ({ cell, x }) puts it in that Cell at
  // x (relative to its Chapter); else the selected Cell is used (see spotInCell); with
  // neither, nothing is added.
  const addSticky = (kind, drop) => {
    const [id] = newIds();
    setNodes((ns) => {
      const find = (i) => ns.find((n) => n.id === i);
      const cellRef = drop?.cell ?? selectedCell;
      const lane = cellRef && find(cellRef.laneId);
      const slice = cellRef && find(cellRef.sliceId);
      if (!lane || !slice) return ns;
      const x = drop?.x;

      let base = ns;
      let pos;
      if (x === undefined) {
        const spot = spotInCell(ns, lane, slice);
        pos = { x: spot.x, y: spot.y };
        if (spot.sliceWidth > slice.data.width) {
          // Make room: widen the slice; the slices after it (and their elements) move right.
          base = layoutSlices(setSliceWidth(ns, slice.id, spot.sliceWidth), ns);
        }
      } else {
        pos = { x: Math.max(slice.position.x + SLICE_PADDING, x), y: lane.position.y + 40 };
      }
      const only = new Set([id]);
      return centerStickies(
        settleStickies(
          [
            ...base,
            {
              id,
              type: 'sticky',
              parentNode: slice.parentNode,
              position: pos,
              data: { kind, title: '' },
            },
          ],
          only
        ),
        only
      );
    });
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // A button released over a Cell adds the element there; anywhere else adds nothing.
  const onDrop = (e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/event-model');
    if (!KINDS[kind]) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ns = getNodes();
    const cell = cellAt(ns, p);
    if (!cell) return;
    const chapter = ns.find((n) => n.id === cell.chapterId);
    addSticky(kind, { cell, x: p.x - STICKY_W / 2 - chapter.position.x });
  };

  // Selects the Cell under the click, or clears the selection when it is outside every Cell.
  const selectCellAt = (e) => {
    const cell = cellAt(getNodes(), screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    setSelectedCell(cell);
    if (cell) setActiveId(cell.chapterId);
  };

  // Where the dragged elements were when the drag began, so a drop over no Cell can undo the move.
  const dragOrigin = useRef(new Map());
  const rememberDrag = (dragged) => {
    const current = new Map(getNodes().map((n) => [n.id, n]));
    dragOrigin.current = new Map(
      dragged
        .filter((n) => n.type === 'sticky')
        .map((n) => {
          const { parentNode, position } = current.get(n.id) ?? n;
          return [n.id, { parentNode, position: { ...position } }];
        })
    );
  };
  const dropDragged = (dragged) => {
    const ids = new Set(dragged.map((n) => n.id));
    setNodes((ns) =>
      centerStickies(settleStickies(adoptStickies(ns, ids, dragOrigin.current), ids), ids)
    );
  };

  const reset = () => {
    const sample = makeSample();
    setSelectedCell(null);
    setActiveId(null);
    setNodes(sample.nodes);
    setEdges(sample.edges);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Event Modeling Board</strong>
        <button onClick={undo} disabled={!hist.undo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!hist.redo} title="Redo (Ctrl+Y)">
          ↷ Redo
        </button>
        <span className="target" title="New slices and lanes are added to this Chapter">
          Add to: <strong>{active?.data.name}</strong>
        </span>
        {Object.entries(KINDS).map(([kind, k]) => (
          <button
            key={kind}
            className={`chip ${kind}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/event-model', kind)}
            onClick={() => addSticky(kind)}
            title="Select a Cell and click to add, or drag onto a Cell"
          >
            + {k.icon && `${k.icon} `}{k.label}
          </button>
        ))}
        <button className="chip slice-btn" onClick={addSlice} title="Add a slice to the Chapter">
          + Slice
        </button>
        <button className="chip" onClick={addLane} title="Add a lane at the bottom">
          + Lane
        </button>
        <button className="chip chapter-btn" onClick={addChapter} title="Add a new Chapter">
          + Chapter
        </button>
        <span className="spacer" />
        <span className="hint">
          Double-click to edit · Backspace deletes selection · Drag from a handle to connect (Chapters: right side → left side)
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={importJson}
        />
        <button onClick={() => fileInput.current?.click()} title="Load a board from an exported JSON file">
          Import JSON
        </button>
        <button onClick={exportJson} title="Download slices and their elements as JSON">
          Export JSON
        </button>
        <button onClick={reset}>Reset</button>
      </header>
      <div className="canvas" ref={canvasRef}>
        <HistoryContext.Provider value={historyApi}>
        <BoardActions.Provider value={boardActions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={(e, node) => {
            // Lanes cover the whole Cell area, so a click on the empty part of a Cell is
            // delivered to a lane node, not to the canvas: treat it as a click on the canvas.
            if (node.type === 'lane') selectCellAt(e);
            else {
              setSelectedCell(null);
              focusChapter(node);
            }
          }}
          onEdgeClick={() => setSelectedCell(null)}
          onPaneClick={selectCellAt}
          onNodeDragStart={(_, node, dragged) => {
            historyApi.begin();
            rememberDrag(dragged ?? [node]);
            setSelectedCell(null);
            focusChapter(node);
          }}
          onSelectionDragStart={(_, dragged) => {
            historyApi.begin();
            rememberDrag(dragged);
          }}
          onSelectionDragStop={(_, dragged) => {
            dropDragged(dragged);
            historyApi.end();
          }}
          onNodeDragStop={(_, __, dragged) => {
            dropDragged(dragged);
            historyApi.end();
          }}
          onEdgesChange={onEdgesChange}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          defaultViewport={{ x: 20, y: 40, zoom: 0.9 }}
          minZoom={0.2}
          snapToGrid
          autoPanOnNodeDrag={false}
          snapGrid={[20, 20]}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <CellHighlight cell={selectedCell} />
          <Background gap={20} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.type === 'chapter' ? 'rgba(0, 0, 0, 0.06)' : KINDS[n.data?.kind]?.color ?? '#eee')}
          />
        </ReactFlow>
        </BoardActions.Provider>
        </HistoryContext.Provider>
      </div>
    </div>
  );
}

export default function EventModelBoard() {
  return (
    <ReactFlowProvider>
      <Board />
    </ReactFlowProvider>
  );
}
