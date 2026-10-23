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

// Event modeling: time flows left to right across swimlanes. The board holds one or
// more Chapters. Each Chapter owns its lanes, slices and elements as child nodes
// (positions relative to the Chapter), so moving a Chapter moves all of it. Chapters
// are linked with arrows from the right side of one to the left side of another.
const LANE_WIDTH = 3200;
const LABEL_ZONE = 48; // reserved strip at the left of each lane; slices stay out of it
const LANES = [
  { id: 'lane-ui', label: 'UI / Actors', y: 0, height: 220 },
  { id: 'lane-cmd', label: 'Commands / Read Models', y: 220, height: 220 },
  { id: 'lane-evt', label: 'Events', y: 440, height: 220 },
];

const CHAPTER_ID = 'chapter'; // id of the first Chapter
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

const centreX = (n) => n.position.x + (n.width ?? STICKY_W) / 2;

// Elements belong to the slice that contains their centre: slice id -> elements.
function membersOf(nodes) {
  const ss = slices(nodes);
  const map = new Map(ss.map((sl) => [sl.id, []]));
  for (const n of nodes) {
    if (n.type !== 'sticky') continue;
    const sl = ss.find(
      (x) =>
        x.parentNode === n.parentNode &&
        centreX(n) >= x.position.x &&
        centreX(n) < x.position.x + x.data.width
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
      if (sl.parentNode !== n.parentNode) continue; // only slices of the element's own Chapter
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

// The lane area of a Chapter in canvas coordinates (its slices sit just above it).
function chapterBox(nodes, c) {
  let width = 0;
  let height = 0;
  for (const l of nodes) {
    if (l.type === 'lane' && l.parentNode === c.id) {
      width = Math.max(width, l.data.width ?? LANE_WIDTH);
      height += l.data.height;
    }
  }
  return { x: c.position.x, y: c.position.y, width, height };
}

const boxContains = (b, x, y) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;

// An element dragged so that its centre is over another Chapter becomes part of that
// Chapter (its position is converted to the new Chapter's coordinates). `only` limits
// it to those ids. Elements dropped outside every Chapter stay where they were.
function adoptStickies(nodes, only) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxes = chaptersOf(nodes).map((c) => ({ c, box: chapterBox(nodes, c) }));
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== 'sticky' || !only.has(n.id)) return n;
    const parent = byId.get(n.parentNode);
    if (!parent) return n;
    const ax = parent.position.x + n.position.x;
    const ay = parent.position.y + n.position.y;
    const cx = ax + (n.width ?? STICKY_W) / 2;
    const cy = ay + (n.height ?? STICKY_H) / 2;
    const target = boxes.find(({ box }) => boxContains(box, cx, cy));
    if (!target || target.c.id === n.parentNode) return n;
    changed = true;
    return {
      ...n,
      parentNode: target.c.id,
      position: { x: ax - target.c.position.x, y: ay - target.c.position.y },
    };
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

// Lanes and slices are children of a Chapter, so React Flow cannot drag the Chapter
// from them. This returns a pointer-down handler that moves the Chapter that owns the
// node `nodeId`: snapped to the grid, one undo step, and the Chapter becomes the active
// one. A press that does not move (a click or double-click) is left alone, so renaming
// still works. `skip` lets the caller veto a press (e.g. while editing).
function useChapterDrag(nodeId, skip) {
  const { setNodes, getNodes } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const history = useContext(HistoryContext);
  const { activate } = useContext(BoardActions);
  return (e) => {
    if (e.button !== 0 || e.target.closest('button, input') || skip?.()) return;
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
  const [editing, setEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const ref = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.select();
  }, [editingTitle]);

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
        onDoubleClick={(e) => {
          e.stopPropagation(); // the body's double-click edits the text instead
          setEditingTitle(true);
        }}
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
      <div className="sticky-body" onDoubleClick={() => setEditing(true)}>
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
          title={data.title || data.text}
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
  const startChapterDrag = useChapterDrag(id, () => editing);

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

  const rename = (name) => {
    setEditing(false);
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

const makeChapter = (id = CHAPTER_ID, x = 0, y = 0, name = 'Chapter 1') => ({
  id,
  type: 'chapter',
  position: { x, y },
  data: { name },
  ...chapterDefaults,
});

const makeSlice = (id, x, width, name, chapterId = CHAPTER_ID) => ({
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

const laneNodes = LANES.map((l, i) =>
  makeLane(l.id, CHAPTER_ID, l.label, l.y, i % 2 === 1, LANE_WIDTH)
);

const sticky = (id, kind, col, text) => ({
  id,
  type: 'sticky',
  position: { x: LABEL_ZONE + 20 + col * 220, y: LANES[KINDS[kind].lane].y + 40 },
  parentNode: CHAPTER_ID,
  data: { kind, text },
});

const initialNodes = normalize([
  makeChapter(),
  ...laneNodes,
  makeSlice('slice-1', LABEL_ZONE, 440, 'Add Item'),
  makeSlice('slice-2', LABEL_ZONE + 440, 220, 'View Cart'),
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

// Arrows between Chapters are heavier and darker than arrows between elements.
const chapterEdgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#5b5b6b' },
  style: { strokeWidth: 3, stroke: '#5b5b6b' },
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
      // Every Chapter gets a name, and picks up the current defaults of the node.
      let chapterNo = 0;
      saved.nodes = saved.nodes.map((nd) => {
        if (nd.type !== 'chapter') return nd;
        chapterNo += 1;
        return {
          ...nd,
          ...chapterDefaults,
          data: { ...nd.data, name: nd.data?.name ?? `Chapter ${chapterNo}` },
        };
      });
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
  const canvasRef = useRef(null);
  const counter = useRef(Date.now());

  // Toolbar buttons that add things (elements, slices, lanes) act on the active Chapter:
  // the one last clicked or dragged, or the first one.
  const [activeId, setActiveId] = useState(null);
  const chapters = nodes.filter((n) => n.type === 'chapter');
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const activeChapterId = active?.id;
  const focusChapter = (node) =>
    setActiveId(node.type === 'chapter' ? node.id : node.parentNode ?? null);

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
    const id = `slice-${counter.current++}`;
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

  const addLane = () => {
    if (!activeChapterId) return;
    const id = `lane-${counter.current++}`;
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
    const id = `chapter-${counter.current++}`;
    const laneIds = LANES.map(() => `lane-${counter.current++}`);
    const sliceId = `slice-${counter.current++}`;
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
      removeLane,
      removeChapter,
      activeId: activeChapterId,
      chapterCount: chapters.length,
    }),
    [removeLane, removeChapter, activeChapterId, chapters.length]
  );

  // An element belongs to the slice (of its own Chapter) whose span contains its centre.
  const exportJson = () => {
    const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
    const outChapters = chaptersOf(nodes)
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
      .map((ch) => {
        const kids = nodes.filter((n) => n.parentNode === ch.id);
        const chLanes = lanesOf(nodes, ch.id);
        const laneOf = (n) => {
          const cy = n.position.y + (n.height ?? STICKY_H) / 2;
          let found = chLanes[0];
          for (const l of chLanes) if (cy >= l.position.y) found = l;
          return found;
        };
        const toElement = (n) => ({
          id: n.id,
          type: n.data.kind,
          ...(n.data.title ? { title: n.data.title } : {}),
          text: n.data.text,
          ...(n.data.html ? { html: n.data.html } : {}),
          lane: laneOf(n)?.data.label ?? null,
          position: { x: n.position.x, y: n.position.y },
        });
        const stickies = kids
          .filter((n) => n.type === 'sticky')
          .sort((a, b) => a.position.x - b.position.x);
        const assigned = new Set();
        const outSlices = slices(nodes, ch.id).map((sl) => {
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
        return {
          id: ch.id,
          name: ch.data.name,
          x: ch.position.x,
          y: ch.position.y,
          lanes: chLanes.map((l) => l.data.label),
          slices: outSlices,
          unassignedElements: stickies.filter((n) => !assigned.has(n.id)).map(toElement),
        };
      });

    const link = (e) => ({ id: e.id, source: e.source, target: e.target });
    const data = {
      exportedAt: new Date().toISOString(),
      chapters: outChapters,
      connections: edges.filter((e) => typeOf.get(e.source) !== 'chapter').map(link),
      chapterConnections: edges.filter((e) => typeOf.get(e.source) === 'chapter').map(link),
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
  // Files written before the board had several Chapters (top-level lanes and slices)
  // are read as a single Chapter.
  const buildBoard = (data) => {
    const chapterData = Array.isArray(data?.chapters)
      ? data.chapters
      : Array.isArray(data?.slices)
        ? [
            {
              id: CHAPTER_ID,
              name: 'Chapter 1',
              x: data.chapter?.x,
              y: data.chapter?.y,
              lanes: data.lanes,
              slices: data.slices,
              unassignedElements: data.unassignedElements,
            },
          ]
        : null;
    if (!chapterData) throw new Error('Missing "chapters" array.');
    if (!chapterData.length) throw new Error('The file contains no chapters.');

    const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
    const used = new Set(); // chapter, slice and element ids share one namespace
    const claim = (id) => {
      if (used.has(id)) throw new Error(`Duplicate id "${id}".`);
      used.add(id);
      return id;
    };
    const out = [];

    chapterData.forEach((c, ci) => {
      if (!Array.isArray(c.slices)) throw new Error('Missing "slices" array.');
      const chapterId = claim(String(c.id ?? `chapter-${counter.current++}`));
      out.push(
        makeChapter(chapterId, num(c.x, 0), num(c.y, 0), String(c.name ?? `Chapter ${ci + 1}`))
      );

      const laneNames =
        Array.isArray(c.lanes) && c.lanes.length ? c.lanes.map(String) : LANES.map((l) => l.label);
      laneNames.forEach((label, i) =>
        out.push(
          makeLane(`lane-${counter.current++}`, chapterId, label, i * LANE_HEIGHT, i % 2 === 1, LANE_WIDTH)
        )
      );

      c.slices.forEach((sl, i) => {
        const id = claim(String(sl.id ?? `slice-${counter.current++}`));
        out.push(
          makeSlice(
            id,
            Number(sl.x) || 0,
            Math.max(SLICE_MIN_WIDTH, Number(sl.width) || DEFAULT_SLICE_WIDTH),
            String(sl.name ?? `Slice ${i + 1}`),
            chapterId
          )
        );
      });

      const elements = [
        ...c.slices.flatMap((sl) => sl.elements ?? []),
        ...(c.unassignedElements ?? []),
      ];
      elements.forEach((el, i) => {
        if (!KINDS[el.type]) throw new Error(`Unknown element type "${el.type}".`);
        const id = claim(String(el.id ?? `n${counter.current++}`));
        out.push({
          id,
          type: 'sticky',
          parentNode: chapterId,
          position: { x: num(el.position?.x, 200 + i * 20), y: num(el.position?.y, 40) },
          data: {
            kind: el.type,
            ...(el.title ? { title: String(el.title) } : {}),
            text: String(el.text ?? ''),
            ...(el.html ? { html: String(el.html) } : {}),
          },
        });
      });
    });

    const typeOf = new Map(out.map((n) => [n.id, n.type]));
    const links = (list, type, prefix, style) =>
      (list ?? [])
        .filter(
          (c) => typeOf.get(String(c.source)) === type && typeOf.get(String(c.target)) === type
        )
        .map((c, i) => ({
          id: String(c.id ?? `${prefix}-${i}`),
          source: String(c.source),
          target: String(c.target),
          ...style,
        }));

    return {
      nodes: normalize(out),
      edges: [
        ...links(data.connections, 'sticky', 'e-import', edgeDefaults),
        ...links(data.chapterConnections, 'chapter', 'ce-import', chapterEdgeDefaults),
      ],
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

  // Elements connect to elements and Chapters to Chapters, never across the two.
  const isValidConnection = useCallback(
    (c) => {
      if (c.source === c.target) return false;
      const ns = getNodes();
      const a = ns.find((n) => n.id === c.source)?.type;
      const b = ns.find((n) => n.id === c.target)?.type;
      return a === b && (a === 'sticky' || a === 'chapter');
    },
    [getNodes]
  );

  const onConnect = useCallback(
    (c) => {
      const fromChapter = getNodes().find((n) => n.id === c.source)?.type === 'chapter';
      setEdges((es) =>
        addEdge({ ...c, ...(fromChapter ? chapterEdgeDefaults : edgeDefaults) }, es)
      );
    },
    [setEdges, getNodes]
  );

  const addSticky = (kind, position, chapterId = activeChapterId) => {
    if (!chapterId) return;
    const id = `n${counter.current++}`;
    setNodes((ns) => {
      const ls = lanesOf(ns, chapterId);
      const lane = ls[Math.min(KINDS[kind].lane, ls.length - 1)];
      const laneY = lane ? lane.position.y : 0;
      const only = new Set([id]);
      return centerStickies(
        settleStickies(
          [
            ...ns,
            {
              id,
              type: 'sticky',
              parentNode: chapterId,
              position: position ?? { x: 200, y: laneY + 40 },
              data: { kind, title: '', text: `New ${KINDS[kind].label}` },
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

  // A dropped element joins the Chapter it lands on, else the active Chapter.
  const onDrop = (e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/event-model');
    if (!KINDS[kind]) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ns = getNodes();
    const target =
      chaptersOf(ns).find((c) => boxContains(chapterBox(ns, c), p.x, p.y)) ??
      ns.find((n) => n.id === activeChapterId);
    if (!target) return;
    addSticky(
      kind,
      { x: p.x - 80 - target.position.x, y: p.y - 40 - target.position.y },
      target.id
    );
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
        <span className="target" title="New elements, slices and lanes are added to this Chapter">
          Add to: <strong>{active?.data.name}</strong>
        </span>
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
          onNodeClick={(_, node) => focusChapter(node)}
          onNodeDragStart={(_, node) => {
            historyApi.begin();
            focusChapter(node);
          }}
          onSelectionDragStart={historyApi.begin}
          onSelectionDragStop={historyApi.end}
          onNodeDragStop={(_, __, dragged) => {
            setNodes((ns) => {
              const ids = new Set(dragged.map((n) => n.id));
              return centerStickies(settleStickies(adoptStickies(ns, ids), ids), ids);
            });
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
