import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
} from 'reactflow';

// Event modeling: time flows left to right across swimlanes. Everything on the board
// (lanes, slices, elements) lives inside one Chapter node, so moving the Chapter
// moves it all. Child positions are relative to the Chapter.
const LANE_WIDTH = 3200;
const LABEL_ZONE = 180; // reserved strip at the left of each lane; slices stay out of it
const LANES = [
  { id: 'lane-ui', label: 'UI / Actors', y: 0, height: 220 },
  { id: 'lane-cmd', label: 'Commands / Read Models', y: 220, height: 220 },
  { id: 'lane-evt', label: 'Events', y: 440, height: 220 },
];

const CHAPTER_ID = 'chapter';
const SLICE_Y = -40;
const SLICE_HEADER = 40;
const LANE_HEIGHT = 220;
const GRID = 20;
const SLICE_PADDING = 20; // minimum gap between a slice border and its elements
const STICKY_W = 160; // width of an element before it is measured
const STICKY_H = 80; // height of an element before it is measured
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

const SLICE_MIN_X = LABEL_ZONE;
const slices = (nodes) =>
  nodes.filter((n) => n.type === 'slice').sort((a, b) => a.position.x - b.position.x);

const setSliceWidth = (nodes, id, width) =>
  nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, width } } : n));

const centreX = (n) => n.position.x + (n.width ?? STICKY_W) / 2;

// Elements belong to the slice that contains their centre: slice id -> elements.
function membersOf(nodes) {
  const ss = slices(nodes);
  const map = new Map(ss.map((sl) => [sl.id, []]));
  for (const n of nodes) {
    if (n.type !== 'sticky') continue;
    const sl = ss.find(
      (x) => centreX(n) >= x.position.x && centreX(n) < x.position.x + x.data.width
    );
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
  const ordered = slices(nodes);
  const refX = new Map(slices(ref).map((n) => [n.id, n.position.x]));
  const newX = new Map();
  let cursor = SLICE_MIN_X;
  for (const n of ordered) {
    newX.set(n.id, cursor);
    cursor += n.data.width;
  }
  const chapterWidth = ordered.length ? cursor : SLICE_MIN_X + DEFAULT_SLICE_WIDTH;
  const shift = new Map();
  for (const [sid, els] of membersOf(ref)) {
    const d = (newX.get(sid) ?? refX.get(sid)) - refX.get(sid);
    if (d) els.forEach((el) => shift.set(el.id, d));
  }
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type === 'slice' && newX.get(n.id) !== n.position.x) {
      changed = true;
      return { ...n, position: { ...n.position, x: newX.get(n.id) } };
    }
    if (n.type === 'lane' && n.data.width !== chapterWidth) {
      changed = true;
      return { ...n, data: { ...n.data, width: chapterWidth } };
    }
    if (shift.has(n.id)) {
      changed = true;
      return { ...n, position: { ...n.position, x: n.position.x + shift.get(n.id) } };
    }
    return n;
  });
  return changed ? next : nodes;
}

// An element never straddles a slice boundary: one that overlaps a slice is moved
// fully inside the slice it overlaps most (keeping SLICE_PADDING from its borders),
// and that slice grows if the element does not fit. Elements clear of every slice are left alone.
function settleStickies(nodes, only) {
  const ss = slices(nodes);
  if (!ss.length) return nodes;
  const widen = new Map();
  let changed = false;
  const placed = nodes.map((n) => {
    if (n.type !== 'sticky' || (only && !only.has(n.id))) return n;
    const w = n.width ?? STICKY_W;
    const l = n.position.x;
    let best = null;
    let bestOverlap = 0;
    for (const sl of ss) {
      const overlap =
        Math.min(l + w, sl.position.x + sl.data.width) - Math.max(l, sl.position.x);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = sl;
      }
    }
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
      (l) => mid >= l.position.y && mid < l.position.y + l.data.height
    );
    if (!lane) return n;
    const y = lane.position.y + Math.max(0, (lane.data.height - h) / 2);
    if (y === n.position.y) return n;
    changed = true;
    return { ...n, position: { ...n.position, y } };
  });
  return changed ? next : nodes;
}

const normalize = (nodes) => centerStickies(settleStickies(layoutSlices(nodes)));

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

const LaneActions = createContext({ removeLane: () => {}, canRemove: false });

function LaneNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeLane, canRemove } = useContext(LaneActions);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const rename = (label) => {
    setEditing(false);
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n))
    );
  };

  return (
    <div
      className={`lane ${data.alt ? 'alt' : ''}`}
      style={{ width: data.width ?? LANE_WIDTH, height: data.height }}
    >
      <div className="lane-header nodrag nopan">
        {editing ? (
          <input
            ref={ref}
            defaultValue={data.label}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
            }}
          />
        ) : (
          <span
            className="lane-label"
            title="Double-click to rename"
            onDoubleClick={() => setEditing(true)}
          >
            {data.label}
          </span>
        )}
        {canRemove && (
          <button className="lane-remove" title="Remove lane" onClick={() => removeLane(id)}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function StickyNode({ id, data, selected }) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const [editingHtml, setEditingHtml] = useState(false);
  const isScreen = data.kind === 'screen';

  const update = (patch) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  const commit = (text) => {
    setEditing(false);
    update({ text });
  };

  return (
    <div
      className={`sticky ${data.kind} ${isScreen && data.html ? 'wide' : ''} ${selected ? 'selected' : ''}`}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="target" position={Position.Top} />
      <div className="kind sticky-header">
        <span>
          {KINDS[data.kind].icon && `${KINDS[data.kind].icon} `}
          {KINDS[data.kind].label}
        </span>
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
          title={data.text}
          sandbox=""
          srcDoc={data.html}
        />
      )}
      {editing ? (
        <textarea
          ref={ref}
          className="nodrag nowheel"
          defaultValue={data.text}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.target.blur();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.target.blur();
            }
          }}
        />
      ) : (
        <div className="text">{data.text}</div>
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
    let sum = 0;
    s.nodeInternals.forEach((n) => {
      if (n.type === 'lane') sum += n.data.height;
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
      <div className="slice-header" onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <input
            ref={ref}
            className="nodrag"
            defaultValue={data.name}
            onBlur={(e) => {
              setEditing(false);
              update({ name: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
            }}
          />
        ) : (
          <span className="slice-name">{data.name}</span>
        )}
      </div>
      <div
        className="resize-handle slice-handle right nodrag nopan"
        title="Drag to resize"
        onPointerDown={resizeRight}
      />
    </div>
  );
}

// The Chapter itself is invisible except for a handle above the slices; dragging
// the handle moves the whole Chapter. (The 1px box keeps React Flow from treating
// the node as unmeasured and hiding it.)
function ChapterNode() {
  return (
    <div style={{ width: 1, height: 1 }}>
      <div className="chapter-handle" title="Drag to move the Chapter">
        ⠿ Chapter
      </div>
    </div>
  );
}

const nodeTypes = { lane: LaneNode, sticky: StickyNode, slice: SliceNode, chapter: ChapterNode };

const makeChapter = (x = 0, y = 0) => ({
  id: CHAPTER_ID,
  type: 'chapter',
  position: { x, y },
  data: {},
  dragHandle: '.chapter-handle',
  deletable: false,
  connectable: false,
});

const makeSlice = (id, x, width, name) => ({
  id,
  type: 'slice',
  position: { x, y: SLICE_Y },
  data: { name, width },
  parentNode: CHAPTER_ID,
  draggable: false,
  zIndex: -1,
  // Only the header takes pointer events, so notes under the band stay usable.
  style: { pointerEvents: 'none' },
});

const laneNodes = LANES.map((l, i) => ({
  id: l.id,
  type: 'lane',
  position: { x: 0, y: l.y },
  parentNode: CHAPTER_ID,
  data: { label: l.label, height: l.height, alt: i % 2 === 1 },
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
  focusable: false,
  zIndex: -1,
}));

const sticky = (id, kind, col, text) => ({
  id,
  type: 'sticky',
  position: { x: 200 + col * 220, y: LANES[KINDS[kind].lane].y + 40 },
  parentNode: CHAPTER_ID,
  data: { kind, text },
});

const initialNodes = normalize([
  makeChapter(),
  ...laneNodes,
  makeSlice('slice-1', 180, 440, 'Add Item'),
  makeSlice('slice-2', 620, 220, 'View Cart'),
  sticky('n1', 'screen', 0, 'Add Item form'),
  sticky('n2', 'command', 0, 'Add Item'),
  sticky('n3', 'event', 1, 'Item Added'),
  sticky('n4', 'readmodel', 2, 'Cart Items'),
  sticky('n5', 'screen', 2, 'Cart view'),
]);

const edgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};

const initialEdges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' },
  { id: 'e4', source: 'n4', target: 'n5' },
].map((e) => ({ ...e, ...edgeDefaults }));

const STORAGE_KEY = 'event-model-board';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.nodes && saved?.edges) {
      // Boards saved before lanes were editable don't include lane nodes.
      if (!saved.nodes.some((n) => n.type === 'lane')) {
        saved.nodes = [...laneNodes, ...saved.nodes];
      }
      // Boards saved before the Chapter existed: wrap everything in one at the origin.
      if (!saved.nodes.some((n) => n.type === 'chapter')) {
        saved.nodes = [
          makeChapter(),
          ...saved.nodes.map((n) => ({ ...n, parentNode: CHAPTER_ID })),
        ];
      }
      saved.nodes = normalize(saved.nodes);
      return saved;
    }
  } catch {
    // ignore corrupt or unavailable storage
  }
  return null;
}

function Board() {
  const saved = useMemo(load, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    saved ? saved.nodes : initialNodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    saved ? saved.edges : initialEdges
  );
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const counter = useRef(Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
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

  // Slices are laid out automatically, so they cannot be dragged. Deleting a slice
  // also deletes its elements (after confirmation) and closes the gap it leaves.
  const handleNodesChange = useCallback(
    (changes) => {
      const isSliceId = (id) => String(id).startsWith('slice-');
      const isSliceRemoval = (c) => c.type === 'remove' && isSliceId(c.id);
      let kept = changes.filter((c) => !(c.type === 'position' && isSliceId(c.id)));
      let sliceRemoved = false;
      const removed = kept.filter(isSliceRemoval);
      if (removed.length) {
        const members = membersOf(getNodes());
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
      if (kept.some((c) => c.type === 'dimensions')) {
        silentAt.current = performance.now();
        setNodes((ns) => centerStickies(settleStickies(ns)));
      }
    },
    [onNodesChange, getNodes, setNodes, setEdges]
  );

  const addSlice = () => {
    const id = `slice-${counter.current++}`;
    const end = nodes
      .filter((n) => n.type === 'slice')
      .reduce((max, n) => Math.max(max, n.position.x + n.data.width), SLICE_MIN_X);
    // (end is the right edge of the last slice; layout then widens the Chapter if needed)
    setNodes((ns) => layoutSlices([...ns, makeSlice(id, end, DEFAULT_SLICE_WIDTH, 'New Slice')]));
  };

  const lanes = nodes
    .filter((n) => n.type === 'lane')
    .sort((a, b) => a.position.y - b.position.y);

  const addLane = () => {
    const y = lanes.reduce((sum, l) => sum + l.data.height, 0);
    const id = `lane-${counter.current++}`;
    setNodes((ns) => [
      ...ns,
      {
        ...laneNodes[0],
        id,
        position: { x: 0, y },
        data: {
          label: 'New Lane',
          height: LANE_HEIGHT,
          width: lanes[0]?.data.width ?? LANE_WIDTH,
          alt: lanes.length % 2 === 1,
        },
      },
    ]);
  };

  const removeLane = useCallback(
    (laneId) => {
      const ordered = nodes
        .filter((n) => n.type === 'lane')
        .sort((a, b) => a.position.y - b.position.y);
      const lane = ordered.find((l) => l.id === laneId);
      if (!lane || ordered.length <= 1) return;
      const top = lane.position.y;
      const bottom = top + lane.data.height;
      const inLane = (n) =>
        n.type === 'sticky' && n.position.y >= top && n.position.y < bottom;
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
          .map((n) => {
            const shifted =
              (n.type === 'sticky' || n.type === 'lane') && n.position.y >= bottom
                ? { ...n, position: { ...n.position, y: n.position.y - lane.data.height } }
                : n;
            return shifted;
          })
          .map((n) => {
            if (n.type !== 'lane') return n;
            return { ...n, data: { ...n.data, alt: laneIndex++ % 2 === 1 } };
          })
      );
      setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    },
    [nodes, setNodes, setEdges]
  );

  const laneActions = useMemo(
    () => ({ removeLane, canRemove: lanes.length > 1 }),
    [removeLane, lanes.length]
  );

  // A note belongs to the slice whose horizontal span contains its centre.
  const exportJson = () => {
    const laneOf = (n) => {
      const cy = n.position.y + (n.height ?? 80) / 2;
      let found = lanes[0];
      for (const l of lanes) if (cy >= l.position.y) found = l;
      return found;
    };
    const toElement = (n) => ({
      id: n.id,
      type: n.data.kind,
      text: n.data.text,
      ...(n.data.html ? { html: n.data.html } : {}),
      lane: laneOf(n)?.data.label ?? null,
      position: { x: n.position.x, y: n.position.y },
    });
    const stickies = nodes
      .filter((n) => n.type === 'sticky')
      .sort((a, b) => a.position.x - b.position.x);
    const centreX = (n) => n.position.x + (n.width ?? 160) / 2;
    const slices = nodes
      .filter((n) => n.type === 'slice')
      .sort((a, b) => a.position.x - b.position.x);

    const assigned = new Set();
    const out = slices.map((sl) => {
      const members = stickies.filter(
        (n) => centreX(n) >= sl.position.x && centreX(n) < sl.position.x + sl.data.width
      );
      members.forEach((n) => assigned.add(n.id));
      return {
        id: sl.id,
        name: sl.data.name,
        x: sl.position.x,
        width: sl.data.width,
        elements: members.map(toElement),
      };
    });

    const data = {
      exportedAt: new Date().toISOString(),
      chapter: { ...(nodes.find((n) => n.id === CHAPTER_ID)?.position ?? { x: 0, y: 0 }) },
      lanes: lanes.map((l) => l.data.label),
      slices: out,
      unassignedElements: stickies.filter((n) => !assigned.has(n.id)).map(toElement),
      connections: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'event-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileInput = useRef(null);

  // Rebuild the whole board from an exported file; the inverse of exportJson.
  const buildBoard = (data) => {
    if (!data || !Array.isArray(data.slices)) {
      throw new Error('Missing "slices" array.');
    }
    const laneNames =
      Array.isArray(data.lanes) && data.lanes.length
        ? data.lanes.map(String)
        : laneNodes.map((l) => l.data.label);

    const newLanes = laneNames.map((label, i) => ({
      ...laneNodes[0],
      id: `lane-${counter.current++}`,
      position: { x: 0, y: i * LANE_HEIGHT },
      data: { label, height: LANE_HEIGHT, width: LANE_WIDTH, alt: i % 2 === 1 },
    }));

    const newSlices = data.slices.map((sl, i) => ({
      ...makeSlice(
        String(sl.id ?? `slice-${counter.current++}`),
        Number(sl.x) || 0,
        Math.max(SLICE_MIN_WIDTH, Number(sl.width) || 220),
        String(sl.name ?? `Slice ${i + 1}`)
      ),
    }));

    const elements = [
      ...data.slices.flatMap((sl) => sl.elements ?? []),
      ...(data.unassignedElements ?? []),
    ];
    const seen = new Set();
    const origin = data.chapter ?? {};
    const newStickies = elements.map((el, i) => {
      if (!KINDS[el.type]) throw new Error(`Unknown element type "${el.type}".`);
      const id = String(el.id ?? `n${counter.current++}`);
      if (seen.has(id)) throw new Error(`Duplicate element id "${id}".`);
      seen.add(id);
      return {
        id,
        type: 'sticky',
        parentNode: CHAPTER_ID,
        position: {
          x: Number.isFinite(el.position?.x) ? el.position.x : 200 + i * 20,
          y: Number.isFinite(el.position?.y) ? el.position.y : 40,
        },
        data: {
          kind: el.type,
          text: String(el.text ?? ''),
          ...(el.html ? { html: String(el.html) } : {}),
        },
      };
    });

    const newEdges = (data.connections ?? [])
      .filter((c) => seen.has(String(c.source)) && seen.has(String(c.target)))
      .map((c, i) => ({
        id: String(c.id ?? `e-import-${i}`),
        source: String(c.source),
        target: String(c.target),
        ...edgeDefaults,
      }));

    return {
      nodes: normalize([
        makeChapter(
          Number.isFinite(origin.x) ? origin.x : 0,
          Number.isFinite(origin.y) ? origin.y : 0
        ),
        ...newLanes,
        ...newSlices,
        ...newStickies,
      ]),
      edges: newEdges,
    };
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      const board = buildBoard(JSON.parse(await file.text()));
      if (!window.confirm('Replace the current board with the imported one?')) return;
      setNodes(board.nodes);
      setEdges(board.edges);
    } catch (err) {
      window.alert(`Could not import "${file.name}": ${err.message}`);
    }
  };

  const onConnect = useCallback(
    (c) => setEdges((es) => addEdge({ ...c, ...edgeDefaults }, es)),
    [setEdges]
  );

  const addSticky = (kind, position) => {
    const lane = lanes[Math.min(KINDS[kind].lane, lanes.length - 1)];
    const laneY = lane ? lane.position.y : 0;
    const id = `n${counter.current++}`;
    setNodes((ns) =>
      centerStickies(
        settleStickies(
        [
          ...ns,
          {
            id,
            type: 'sticky',
            parentNode: CHAPTER_ID,
            position: position ?? { x: 200, y: laneY + 40 },
            data: { kind, text: `New ${KINDS[kind].label}` },
          },
        ],
        new Set([id])
        ),
        new Set([id])
      )
    );
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/event-model');
    if (!KINDS[kind]) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const origin = getNodes().find((n) => n.id === CHAPTER_ID)?.position ?? { x: 0, y: 0 };
    addSticky(kind, { x: p.x - 80 - origin.x, y: p.y - 40 - origin.y });
  };

  const reset = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
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
        {Object.entries(KINDS).map(([kind, k]) => (
          <button
            key={kind}
            className={`chip ${kind}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/event-model', kind)}
            onClick={() => addSticky(kind)}
            title="Click to add, or drag onto the board"
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
        <span className="spacer" />
        <span className="hint">
          Double-click to edit · Backspace deletes selection · Drag handles to connect
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
      <div className="canvas">
        <HistoryContext.Provider value={historyApi}>
        <LaneActions.Provider value={laneActions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeDragStart={historyApi.begin}
          onSelectionDragStart={historyApi.begin}
          onSelectionDragStop={historyApi.end}
          onNodeDragStop={(_, __, dragged) => {
            setNodes((ns) => {
              const ids = new Set(dragged.map((n) => n.id));
              return centerStickies(settleStickies(ns, ids), ids);
            });
            historyApi.end();
          }}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          defaultViewport={{ x: 20, y: 40, zoom: 0.9 }}
          minZoom={0.2}
          snapToGrid
          snapGrid={[20, 20]}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background gap={20} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => KINDS[n.data?.kind]?.color ?? '#eee'}
          />
        </ReactFlow>
        </LaneActions.Provider>
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
