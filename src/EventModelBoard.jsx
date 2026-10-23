import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'reactflow';

// Event modeling: time flows left to right across swimlanes.
const LANE_WIDTH = 3200;
const LANES = [
  { id: 'lane-ui', label: 'UI / Actors', y: 0, height: 180 },
  { id: 'lane-cmd', label: 'Commands / Read Models', y: 180, height: 180 },
  { id: 'lane-evt', label: 'Events', y: 360, height: 180 },
];

const KINDS = {
  screen: { label: 'Screen', lane: 0, color: '#f5f5f5' },
  command: { label: 'Command', lane: 1, color: '#7cc3f2' },
  readmodel: { label: 'Read Model', lane: 1, color: '#8fd694' },
  event: { label: 'Event', lane: 2, color: '#ffb366' },
};

function LaneNode({ data }) {
  return (
    <div
      className={`lane ${data.alt ? 'alt' : ''}`}
      style={{ width: LANE_WIDTH, height: data.height }}
    >
      <span className="lane-label">{data.label}</span>
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

  const commit = (text) => {
    setEditing(false);
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n))
    );
  };

  return (
    <div
      className={`sticky ${data.kind} ${selected ? 'selected' : ''}`}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="target" position={Position.Left} />
      <div className="kind">{KINDS[data.kind].label}</div>
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { lane: LaneNode, sticky: StickyNode };

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
    if (saved?.nodes && saved?.edges) return saved;
  } catch {
    // ignore corrupt or unavailable storage
  }
  return null;
}

function Board() {
  const saved = useMemo(load, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    saved ? [...laneNodes, ...saved.nodes] : initialNodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    saved ? saved.edges : initialEdges
  );
  const { screenToFlowPosition } = useReactFlow();
  const counter = useRef(Date.now());

  useEffect(() => {
    const stickies = nodes.filter((n) => n.type === 'sticky');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: stickies, edges }));
    } catch {
      // ignore unavailable storage
    }
  }, [nodes, edges]);

  const onConnect = useCallback(
    (c) => setEdges((es) => addEdge({ ...c, ...edgeDefaults }, es)),
    [setEdges]
  );

  const addSticky = (kind, position) => {
    const lane = LANES[KINDS[kind].lane];
    const id = `n${counter.current++}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'sticky',
        position: position ?? { x: 200, y: lane.y + 40 },
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
            + {k.label}
          </button>
        ))}
        <span className="spacer" />
        <span className="hint">
          Double-click to edit · Backspace deletes selection · Drag handles to connect
        </span>
        <button onClick={reset}>Reset</button>
      </header>
      <div className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
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
