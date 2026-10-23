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

// Event modeling: time flows left to right across swimlanes.
const LANE_WIDTH = 3200;
const LANES = [
  { id: 'lane-ui', label: 'UI / Actors', y: 0, height: 220 },
  { id: 'lane-cmd', label: 'Commands / Read Models', y: 220, height: 220 },
  { id: 'lane-evt', label: 'Events', y: 440, height: 220 },
];

const SLICE_Y = -40;
const SLICE_HEADER = 40;
const LANE_HEIGHT = 220;
const GRID = 20;
const MIN_TIMELINE_WIDTH = 800;
const SLICE_MIN_WIDTH = 120;

const KINDS = {
  screen: { label: 'Screen', lane: 0, color: '#f5f5f5' },
  command: { label: 'Command', lane: 1, color: '#7cc3f2' },
  readmodel: { label: 'Read Model', lane: 1, color: '#8fd694' },
  event: { label: 'Event', lane: 2, color: '#ffb366' },
  processor: { label: 'Processor', lane: 1, color: '#d9c2f0', icon: '⚙️' },
};

const snap = (v) => Math.round(v / GRID) * GRID;

const SLICE_MIN_X = 0;
const slices = (nodes) =>
  nodes.filter((n) => n.type === 'slice').sort((a, b) => a.position.x - b.position.x);

const patchSlice = (nodes, id, { x, width }) =>
  nodes.map((n) =>
    n.id !== id
      ? n
      : {
          ...n,
          position: x === undefined ? n.position : { ...n.position, x },
          data: width === undefined ? n.data : { ...n.data, width },
        }
  );

// Keeps slices from overlapping and the timeline wide enough to contain them.
// The pinned slice stays where it is: later slices are pushed right, earlier
// ones left. With no pin, everything is only pushed right. Returns the same
// array when nothing needs to change.
function layoutSlices(nodes, pinId) {
  const ordered = slices(nodes);
  if (!ordered.length) return nodes;
  const xs = ordered.map((n) => n.position.x);
  const w = ordered.map((n) => n.data.width);
  const pin = ordered.findIndex((n) => n.id === pinId);

  if (pin < 0) xs[0] = Math.max(xs[0], SLICE_MIN_X);
  for (let i = Math.max(pin, 0) + 1; i < xs.length; i++) {
    xs[i] = Math.max(xs[i], xs[i - 1] + w[i - 1]);
  }
  for (let i = pin - 1; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - w[i]);

  const end = Math.max(...xs.map((x, i) => x + w[i]));
  const newX = new Map(ordered.map((n, i) => [n.id, xs[i]]));
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type === 'slice' && newX.get(n.id) !== n.position.x) {
      changed = true;
      return { ...n, position: { ...n.position, x: newX.get(n.id) } };
    }
    if (n.type === 'lane' && (n.data.width ?? LANE_WIDTH) < end) {
      changed = true;
      return { ...n, data: { ...n.data, width: end } };
    }
    return n;
  });
  return changed ? next : nodes;
}

// Starts a horizontal pointer drag; onMove receives the total delta in flow units.
function useHorizontalDrag() {
  const zoom = useStore((s) => s.transform[2]);
  return (e, onMove) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const move = (ev) => onMove((ev.clientX - startX) / zoom);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
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
  const startDrag = useHorizontalDrag();
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

  // All lanes share one width: resizing any lane's end resizes the whole timeline.
  const resizeTimeline = (e) => {
    const startW = data.width ?? LANE_WIDTH;
    startDrag(e, (dx) => {
      setNodes((ns) => {
        const sliceEnd = Math.max(0, ...slices(ns).map((n) => n.position.x + n.data.width));
        const width = Math.max(MIN_TIMELINE_WIDTH, sliceEnd, snap(startW + dx));
        return ns.map((n) => (n.type === 'lane' ? { ...n, data: { ...n.data, width } } : n));
      });
    });
  };

  return (
    <div
      className={`lane ${data.alt ? 'alt' : ''}`}
      style={{ width: data.width ?? LANE_WIDTH, height: data.height }}
    >
      <div
        className="resize-handle timeline-handle nodrag nopan"
        title="Drag to resize the timeline"
        onPointerDown={resizeTimeline}
      />
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
      <div className="kind">
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

  // Each drag is computed from a snapshot taken at pointer-down, so pushed
  // neighbours (and a grown timeline) spring back if the drag is reversed.
  const resizeRight = (e) => {
    const base = getNodes();
    const startW = data.width;
    startDrag(e, (dx) => {
      const width = Math.max(SLICE_MIN_WIDTH, snap(startW + dx));
      setNodes(layoutSlices(patchSlice(base, id, { width }), id));
    });
  };

  const resizeLeft = (e) => {
    const base = getNodes();
    const me = base.find((n) => n.id === id);
    const startX = me.position.x;
    const right = startX + data.width;
    const room = slices(base)
      .filter((n) => n.id !== id && n.position.x < startX)
      .reduce((sum, n) => sum + n.data.width, 0);
    startDrag(e, (dx) => {
      const x = Math.max(SLICE_MIN_X + room, Math.min(snap(startX + dx), right - SLICE_MIN_WIDTH));
      setNodes(layoutSlices(patchSlice(base, id, { x, width: right - x }), id));
    });
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
        className="resize-handle slice-handle left nodrag nopan"
        title="Drag to resize"
        onPointerDown={resizeLeft}
      />
      <div
        className="resize-handle slice-handle right nodrag nopan"
        title="Drag to resize"
        onPointerDown={resizeRight}
      />
    </div>
  );
}

const nodeTypes = { lane: LaneNode, sticky: StickyNode, slice: SliceNode };

const makeSlice = (id, x, width, name) => ({
  id,
  type: 'slice',
  position: { x, y: SLICE_Y },
  data: { name, width },
  zIndex: -1,
  // Only the header takes pointer events, so notes under the band stay usable.
  style: { pointerEvents: 'none' },
});

const laneNodes = LANES.map((l, i) => ({
  id: l.id,
  type: 'lane',
  position: { x: 0, y: l.y },
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
  data: { kind, text },
});

const initialNodes = [
  ...laneNodes,
  makeSlice('slice-1', 180, 440, 'Add Item'),
  makeSlice('slice-2', 640, 220, 'View Cart'),
  sticky('n1', 'screen', 0, 'Add Item form'),
  sticky('n2', 'command', 0, 'Add Item'),
  sticky('n3', 'event', 1, 'Item Added'),
  sticky('n4', 'readmodel', 2, 'Cart Items'),
  sticky('n5', 'screen', 2, 'Cart view'),
];

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
      saved.nodes = layoutSlices(saved.nodes, null);
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

  // Slices slide along the timeline only. They stop at their neighbours
  // instead of overlapping them, and the timeline grows if one is moved past its end.
  const handleNodesChange = useCallback(
    (changes) => {
      const current = getNodes();
      let movedSlice = false;
      onNodesChange(
        changes.map((c) => {
          if (c.type !== 'position' || !c.position || !c.id.startsWith('slice-')) return c;
          movedSlice = true;
          const me = current.find((n) => n.id === c.id);
          const others = slices(current).filter((n) => n.id !== c.id);
          const before = others.filter((n) => n.position.x < me.position.x);
          const after = others.filter((n) => n.position.x >= me.position.x);
          const lo = Math.max(SLICE_MIN_X, ...before.map((n) => n.position.x + n.data.width));
          const hi = Math.min(Infinity, ...after.map((n) => n.position.x)) - me.data.width;
          return { ...c, position: { x: Math.min(Math.max(c.position.x, lo), hi), y: SLICE_Y } };
        })
      );
      if (movedSlice) setNodes((ns) => layoutSlices(ns, null));
    },
    [onNodesChange, getNodes, setNodes]
  );

  const addSlice = () => {
    const id = `slice-${counter.current++}`;
    const end = nodes
      .filter((n) => n.type === 'slice')
      .reduce((max, n) => Math.max(max, n.position.x + n.data.width), 160);
    // (end is the right edge of the last slice; layout then widens the timeline if needed)
    setNodes((ns) => layoutSlices([...ns, makeSlice(id, end, 220, 'New Slice')], null));
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
              n.type !== 'slice' && n.position.y >= bottom
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
      lanes: lanes.map((l) => l.data.label),
      timelineWidth: lanes[0]?.data.width ?? LANE_WIDTH,
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

    const timelineWidth = Math.max(
      MIN_TIMELINE_WIDTH,
      Number.isFinite(data.timelineWidth) ? data.timelineWidth : LANE_WIDTH
    );

    const newLanes = laneNames.map((label, i) => ({
      ...laneNodes[0],
      id: `lane-${counter.current++}`,
      position: { x: 0, y: i * LANE_HEIGHT },
      data: { label, height: LANE_HEIGHT, width: timelineWidth, alt: i % 2 === 1 },
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
    const newStickies = elements.map((el, i) => {
      if (!KINDS[el.type]) throw new Error(`Unknown element type "${el.type}".`);
      const id = String(el.id ?? `n${counter.current++}`);
      if (seen.has(id)) throw new Error(`Duplicate element id "${id}".`);
      seen.add(id);
      return {
        id,
        type: 'sticky',
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
      nodes: layoutSlices([...newLanes, ...newSlices, ...newStickies], null),
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
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'sticky',
        position: position ?? { x: 200, y: laneY + 40 },
        data: { kind, text: `New ${KINDS[kind].label}` },
      },
    ]);
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
    addSticky(kind, { x: p.x - 80, y: p.y - 40 });
  };

  const reset = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Event Modeling Board</strong>
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
        <button className="chip slice-btn" onClick={addSlice} title="Add a slice to the timeline">
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
        <LaneActions.Provider value={laneActions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
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
