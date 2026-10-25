import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { pruneScenarios, ScenarioDialog, ScenariosCard } from './Scenarios.jsx';
import { NotesCard } from './Notes.jsx';
import {
  LANE_WIDTH,
  LABEL_ZONE,
  LANES,
  SLICE_HEADER,
  LANE_HEIGHT,
  GRID,
  DEFAULT_SLICE_WIDTH,
  SLICE_MIN_WIDTH,
  KINDS,
  kindW,
  padOf,
  FLOWS_TO,
  snap,
  LANE_COLORS,
  LANE_TYPES,
  LANE_TYPE_ORDER,
  REQUIRED_LANE_TYPES,
  nextLaneTypes,
  laneAllows,
  snapUp,
  uniqueId,
  SLICE_MIN_X,
  stickyW,
  stickyH,
  slices,
  lanesOf,
  setSliceWidth,
  minSliceWidth,
  sliceOf,
  membersOf,
  layoutSlices,
  settleStickies,
  centerStickies,
  adoptStickies,
  layered,
  cellAt,
  makeChapter,
  makeSlice,
  makeLane,
  makeEdge,
  makeEmptyBoard,
} from './model.js';
import { STORAGE_KEY, boardText, parseBoard, load } from './io.js';
import { InfoDialog } from './InfoDialog.jsx';
import { HistoryContext, useHistory } from './history.js';
import { useBackdropClose } from './popup.js';

// Keys that add an element of that type to the selected Cell (R5a.11).
const CELL_ADD_KEYS = { s: 'screen', c: 'command', r: 'query', q: 'query', e: 'event', p: 'processor', x: 'scenarios', n: 'notes' };
const hotkeyOf = (kind) =>
  Object.keys(CELL_ADD_KEYS)
    .filter((k) => CELL_ADD_KEYS[k] === kind)
    .map((k) => k.toUpperCase())
    .join(' / ');
// The lane types that take an element type, e.g. "Interaction / Integration".
const acceptingLanes = (kind) =>
  Object.values(LANE_TYPES)
    .filter((t) => t.kinds.includes(kind))
    .map((t) => t.label)
    .join(' / ');

// The hotkey help, grouped by context (R1d.1).
const HOTKEYS = [
  {
    group: 'Board',
    keys: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
      ['Backspace / Delete', 'Delete the selected elements or arrows'],
    ],
  },
  {
    group: 'Selected Cell',
    keys: [
      ['← ↑ → ↓', 'Select the neighbouring Cell'],
      ['Shift+← / Shift+→', 'Make the slice narrower / wider'],
      ['Ctrl+← / Ctrl+→', 'Move the slice left / right'],
      ['Shift+C', 'Compact the slice'],
      ['Shift+I', 'Open the slice info'],
      ['S', 'Add a Screen in the Cell'],
      ['C', 'Add a Command in the Cell'],
      ['R / Q', 'Add a Query in the Cell'],
      ['E', 'Add an Event in the Cell'],
      ['P', 'Add a Processor in the Cell'],
      ['X', 'Add a Scenarios element in the Cell'],
      ['N', 'Add a Notes element in the Cell'],
      ['+', 'Add a slice right after the Cell’s slice'],
      ['Enter', 'Edit the title of the first element in the Cell, or open the editor of a selected Notes element'],
      ['Delete / Backspace', 'Delete the selected elements, or the elements in the Cell (asks first)'],
      ['Shift+Delete / Shift+Backspace', 'Delete the slice (asks first)'],
      ['Esc', 'Clear the Cell selection'],
    ],
  },
  {
    group: 'Selected element',
    keys: [['I', 'Open the info of the element (not for Notes)']],
  },
  {
    group: 'Selected Scenarios element',
    keys: [['A', 'Add a scenario']],
  },
  {
    group: 'Editing a name or title',
    keys: [
      ['Enter / Esc', 'Save'],
      ['Ctrl+Z', "The field's own undo"],
    ],
  },
  {
    group: 'Scenario editor',
    keys: [
      ['G', 'Choose a Given event'],
      ['W', 'Choose the When command'],
      ['T', 'Choose a Then event'],
      ['E', 'Add or edit the expected error (Then Error)'],
      ['Esc', 'Close the list, or close without saving'],
    ],
  },
  {
    group: 'Info panel',
    keys: [['Esc', 'Cancel']],
  },
];

function HotkeysDialog({ onClose }) {
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div
        className="hotkeys-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Hotkeys"
      >
        <div className="info-title">Hotkeys</div>
        <div className="hotkeys-body">
          {HOTKEYS.map(({ group, keys }) => (
            <section key={group}>
              <h3>{group}</h3>
              <dl>
                {keys.map(([key, what]) => (
                  <div key={key + what}>
                    <dt>
                      <kbd>{key}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="info-actions">
          <button onClick={onClose} title="Close (Esc)">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
const NEW_CONTEXT = '__new-context__'; // value of the "+ New context..." dropdown entry
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
  const { activate, clearCell } = useContext(BoardActions);
  return (e) => {
    if (e.button !== 0) return;
    clearCell(); // pressing a header selects something else
    if (e.target.closest('button, input') || skip?.()) return;
    const chapterId = getNodes().find((n) => n.id === nodeId)?.parentId;
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

// The "i" button of a Chapter, lane or slice; filled when the item has info.
function InfoButton({ id, info, hotkey }) {
  const { openInfo } = useContext(BoardActions);
  return (
    <button
      className={`info-btn nodrag${info ? ' has-info' : ''}`}
      title={`${info ? 'Edit info' : 'Add info'}${hotkey ? ` (${hotkey})` : ''}`}
      aria-label="Info"
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={() => openInfo(id)}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 4.2V9" />
        <circle cx="5" cy="1.6" r="0.3" />
      </svg>
    </button>
  );
}

const BoardActions = createContext({
  editScenario: () => {},
  newScenarioId: () => '',
  openInfo: () => {},
  readInfo: () => {},
  titleEditId: null,
  clearTitleEdit: () => {},
  contexts: [],
  setChapterContext: () => {},
  addContext: () => {},
  renameContext: () => {},
  removeContext: () => {},
  activate: () => {},
  clearCell: () => {},
  addSliceAfter: () => {},
  removeSlice: () => {},
  selectCell: () => {},
  removeLane: () => {},
  addLaneAfter: () => {},
  removeChapter: () => {},
  compactChapter: () => {},
  activeId: null,
});

function LaneNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeLane, addLaneAfter } = useContext(BoardActions);
  // The last lane of a required type (Actor, Interaction, Event) of a Chapter cannot be removed.
  const canRemove = useStore((s) => {
    const parent = s.nodeLookup.get(id)?.parentId;
    let count = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'lane' && n.parentId === parent && n.data.type === data.type) count++;
    });
    return !REQUIRED_LANE_TYPES.includes(data.type) || count > 1;
  });
  // Width of the Chapter's first slice, which the lane type is centred in.
  const firstSliceWidth = useStore((s) => {
    const parent = s.nodeLookup.get(id)?.parentId;
    let first;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'slice' && n.parentId === parent && (!first || n.position.x < first.position.x)) first = n;
    });
    return first?.data.width ?? 0;
  });
  // Outline classes: only the top lane draws the Chapter's top edge, the bottom lane its bottom edge.
  const edges = useStore((s) => {
    const me = s.nodeLookup.get(id);
    if (!me) return '';
    let first = true;
    let last = true;
    s.nodeLookup.forEach((n) => {
      if (n.type !== 'lane' || n.parentId !== me.parentId || n.id === id) return;
      if (n.position.y < me.position.y) first = false;
      if (n.position.y > me.position.y) last = false;
    });
    return `${first ? ' first' : ''}${last ? ' last' : ''}`;
  });
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const ref = useRef(null);
  const colorRef = useRef(null);

  useEffect(() => {
    if (!picking) return;
    const close = (e) => {
      if (!colorRef.current?.contains(e.target)) setPicking(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [picking]);

  const setColor = (color) => {
    setPicking(false);
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, color } } : n)));
  };

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
      className={`lane color-${data.color}${edges}`}
      style={{ width: data.width ?? LANE_WIDTH, height: data.height }}
    >
      <div className="lane-type" style={{ left: LABEL_ZONE, width: firstSliceWidth }}>
        {LANE_TYPES[data.type].label}
      </div>
      <div
        className="lane-header nodrag nopan"
        style={{ width: LABEL_ZONE }}
        onPointerDown={startChapterDrag}
      >
        {canRemove && (
          <button
            className="lane-remove"
            title="Remove lane"
            aria-label="Remove lane"
            onClick={() => removeLane(id)}
          />
        )}
        <div className="lane-color" ref={colorRef}>
          <button
            className={`lane-color-btn swatch color-${data.color}`}
            title="Lane colour"
            onClick={() => setPicking((v) => !v)}
          />
          {picking && (
            <div className="lane-palette">
              {LANE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch color-${c}${c === data.color ? ' current' : ''}`}
                  title={c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          )}
        </div>
        <InfoButton id={id} info={data.info} />
        {/* Edited in place: the same rotated element becomes editable text. */}
        <span
          ref={ref}
          className={`lane-label${editing ? ' editing' : ''}`}
          title={editing ? undefined : `${data.label === LANE_TYPES[data.type].label ? '' : `${data.label}, `}${LANE_TYPES[data.type].label} lane`}
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
        <button
          className="lane-add"
          title={`Add lane below: ${LANE_TYPES[data.type].label}`}
          aria-label={`Add lane below: ${LANE_TYPES[data.type].label}`}
          onClick={() => addLaneAfter(id, data.type)}
        />
        {nextLaneTypes(data.type).map((t) => (
          <button
            key={t}
            className="lane-letter"
            title={`Add lane below: ${LANE_TYPES[t].label}`}
            aria-label={`Add lane below: ${LANE_TYPES[t].label}`}
            onClick={() => addLaneAfter(id, t)}
          >
            {LANE_TYPES[t].letter}
          </button>
        ))}
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
  const { titleEditId, clearTitleEdit, editScenario, newScenarioId, openInfo, readInfo } = useContext(BoardActions);

  useEffect(() => {
    if (titleEditId !== id) return;
    setEditingTitle(true);
    clearTitleEdit();
  }, [titleEditId, id, clearTitleEdit]);

  const update = (patch) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  const commitTitle = (title) => {
    setEditingTitle(false);
    update({ title: title.trim() });
  };

  // The toolbar above a selected element (not Notes): the Info button, and for a Screen the
  // HTML mockup button too.
  const toolbar =
    data.kind === 'notes' ? null : (
      <NodeToolbar position={Position.Top} offset={8} className="element-toolbar nodrag nopan">
        <InfoButton id={id} info={data.info} hotkey="I" />
        {isScreen && (
          <button
            className="info-btn html-tool"
            title="Edit HTML mockup"
            aria-label="Edit HTML mockup"
            onClick={() => setEditingHtml((v) => !v)}
          >
            {'</>'}
          </button>
        )}
      </NodeToolbar>
    );

  if (data.kind === 'scenarios') {
    return (
      <>
        {toolbar}
        <ScenariosCard id={id} data={data} selected={selected} onEdit={editScenario} newId={newScenarioId} />
      </>
    );
  }
  if (data.kind === 'notes') return <NotesCard id={id} data={data} selected={selected} onEdit={openInfo} onRead={readInfo} />;

  return (
    <div
      className={`sticky ${data.kind} ${selected ? 'selected' : ''}`}
    >
      {toolbar}
      <Handle id="top-in" type="target" position={Position.Top} />
      <Handle id="top-out" type="source" position={Position.Top} />
      <div
        className="sticky-header"
        title={data.title || undefined}
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
      <Handle id="bottom-out" type="source" position={Position.Bottom} />
      <Handle id="bottom-in" type="target" position={Position.Bottom} />
    </div>
  );
}

// A slice is a vertical band across all lanes: one end-to-end piece of behavior. It is not
// selectable; clicking its header selects the top Cell of the slice.
function SliceNode({ id, data }) {
  const { setNodes, getNodes } = useReactFlow();
  const startDrag = useHorizontalDrag();
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const press = useRef(null);
  // The last slice of a Chapter cannot be deleted.
  const canRemove = useStore((s) => {
    const parent = s.nodeLookup.get(id)?.parentId;
    let count = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'slice' && n.parentId === parent) count++;
    });
    return count > 1;
  });
  // The last slice of a Chapter has no right border: the Chapter outline is there.
  const isLast = useStore((s) => {
    const me = s.nodeLookup.get(id);
    let last = true;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'slice' && n.parentId === me?.parentId && n.position.x > me.position.x) last = false;
    });
    return last;
  });
  const lanesHeight = useStore((s) => {
    const parent = s.nodeLookup.get(id)?.parentId;
    let sum = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'lane' && n.parentId === parent) sum += n.data.height;
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

  // A Flow end slice carries `flowEnd: true`; the field is removed when the mark is removed.
  const toggleFlowEnd = () =>
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const { flowEnd, ...rest } = n.data;
        return { ...n, data: flowEnd ? rest : { ...rest, flowEnd: true } };
      })
    );

  // Dragging a slice header moves the whole Chapter (slices themselves never move on
  // their own: their order and position come from the layout).
  const startChapterDrag = useChapterDrag(id, () => editing);
  const { addSliceAfter, removeSlice, selectCell } = useContext(BoardActions);

  // A plain click (no drag) on the header selects the top Cell of this slice.
  const selectTopCell = (e) => {
    if (e.target.closest('button, input')) return;
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 4) return;
    const ns = getNodes();
    const chapterId = ns.find((n) => n.id === id)?.parentId;
    const top = lanesOf(ns, chapterId)[0];
    if (top) selectCell({ chapterId, laneId: top.id, sliceId: id });
  };

  // Each drag is computed from a snapshot taken at pointer-down, so the following
  // slices, their elements and a grown Chapter follow the edge both ways.
  const resizeRight = (e) => {
    const base = getNodes();
    const me = base.find((n) => n.id === id);
    const minWidth = minSliceWidth(base, me);
    const startW = data.width;
    startDrag(
      e,
      (dx) => {
        const width = Math.max(minWidth, snap(startW + dx));
        setNodes(layoutSlices(setSliceWidth(base, id, width), base));
      },
      () => setNodes((ns) => centerStickies(settleStickies(ns)))
    );
  };

  return (
    <div
      className={`slice${isLast ? ' last' : ''}${data.flowEnd ? ' flow-end' : ''}`}
      style={{ width: data.width, height: SLICE_HEADER + lanesHeight }}
    >
      <div
        className="slice-header nodrag nopan"
        title={data.name}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY };
          startChapterDrag(e);
        }}
        onClick={selectTopCell}
        onDoubleClick={() => setEditing(true)}
      >
        <div className="slice-title">
          <InfoButton id={id} info={data.info} hotkey="Shift+I with a Cell of this slice selected" />
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
        </div>
        <div className="slice-actions">
          <button
            className={`slice-add nodrag${data.flowEnd ? ' active' : ''}`}
            title={data.flowEnd ? 'Flow end: remove the mark' : 'Flow end: mark this slice as the end of a flow'}
            aria-label="Flow end"
            aria-pressed={!!data.flowEnd}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => toggleFlowEnd()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="2.4">
              <path d="M5 1.2V8.8" />
            </svg>
          </button>
          <button
            className="slice-add nodrag"
            title="Add a slice right after this one (+)"
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => addSliceAfter(id)}
            aria-label="Add a slice right after this one"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6">
              <path d="M0 5H10M5 0V10" />
            </svg>
          </button>
          {canRemove && (
            <button
              className="slice-add slice-remove nodrag"
              title="Delete this slice (Shift+Delete with a Cell of it selected)"
              aria-label="Delete this slice"
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => removeSlice(id)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6">
                <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div
        className="resize-handle slice-handle right nodrag nopan"
        title="Resize (Shift+← / Shift+→ with a Cell of this slice selected)"
        onPointerDown={resizeRight}
      />
    </div>
  );
}

// A Chapter node is a transparent box over its lanes, with a large title centred above the
// slices (double-click to rename), a small handle above it (drag it to move the Chapter) and
// two connection ports: incoming on the left side, outgoing on the right side.
function ChapterNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeChapter, compactChapter, activeId } = useContext(BoardActions);
  const { contexts, setChapterContext, addContext, renameContext, removeContext } =
    useContext(BoardActions);
  // A Chapter whose Context is missing shows the Default (first) one.
  const contextId = contexts.some((c) => c.id === data.context) ? data.context : contexts[0]?.id;
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const width = useStore((s) => {
    let w = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'lane' && n.parentId === id) w = Math.max(w, n.data.width ?? LANE_WIDTH);
    });
    return w || 1;
  });
  const height = useStore((s) => {
    let h = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'lane' && n.parentId === id) h += n.data.height;
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
      <div className="chapter-title">
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
          <span className="nodrag" onDoubleClick={() => setEditing(true)}>
            {data.name}
          </span>
        )}
      </div>
      <div
        className={`chapter-handle nopan ${activeId === id ? 'active' : ''}`}
      >
        <span>⠿</span>
        <InfoButton id={id} info={data.info} />
        <select
          className="chapter-context nodrag"
          title="Context of this Chapter"
          value={contextId}
          onChange={(e) =>
            e.target.value === NEW_CONTEXT ? addContext(id) : setChapterContext(id, e.target.value)
          }
        >
          {contexts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CONTEXT}>+ New context...</option>
        </select>
        <button
          className="chapter-compact nodrag"
          title="Rename this context (for every Chapter that uses it)"
          aria-label="Rename this context"
          onClick={() => renameContext(contextId)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M1 9L1.6 6.6L7 1.2L8.8 3L3.4 8.4Z" />
          </svg>
        </button>
        {contextId !== contexts[0]?.id && (
          <button
            className="chapter-compact nodrag"
            title="Delete this context"
            aria-label="Delete this context"
            onClick={() => removeContext(contextId)}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1.5 2.5H8.5M4 2.5V1H6V2.5M2.5 2.5L3 9H7L7.5 2.5" />
            </svg>
          </button>
        )}
        <button
          className="chapter-compact nodrag"
          title="Compact the slices"
          aria-label="Compact the slices"
          onClick={() => compactChapter(id)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M0.5 5H9.5M2.5 3L0.5 5L2.5 7M7.5 3L9.5 5L7.5 7" />
          </svg>
        </button>
        <button
          className="chapter-remove nodrag"
          title="Remove this Chapter"
          aria-label="Remove this Chapter"
          onClick={() => removeChapter(id)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const nodeTypes = { lane: LaneNode, sticky: StickyNode, slice: SliceNode, chapter: ChapterNode };

// Where a new element goes in a Cell (a lane crossed with a slice): the first spot from
// the left, inside the slice's margins, that does not overlap an element already in the
// Cell. When the Cell is full it goes after the last element and the slice has to grow:
// `sliceWidth` is the width the slice needs (the current width when nothing changes).
function spotInCell(nodes, lane, slice, kind) {
  const w = kindW(kind);
  const pad = padOf(kind);
  const inCell = (membersOf(nodes).get(slice.id) ?? []).filter((n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
  if (!inCell.length) {
    // Empty Cell: centred in the slice, which grows first if it is too narrow.
    const width = Math.max(slice.data.width, snapUp(w + 2 * pad));
    const x = slice.position.x + Math.floor((width - w) / 2);
    return { x, y: lane.position.y + 40, sliceWidth: width, empty: true };
  }
  const left = slice.position.x + pad;
  const lastFit = slice.position.x + slice.data.width - pad - w;
  const free = (x) =>
    !inCell.some(
      (m) => x < m.position.x + stickyW(m) + GRID && m.position.x < x + w + GRID
    );
  let x = left;
  while (x <= lastFit && !free(x)) x += GRID;
  if (x > lastFit) {
    // Full: continue after the right-most element, widening the slice.
    const after = inCell.reduce((m, n) => Math.max(m, n.position.x + stickyW(n)), left - GRID);
    x = Math.max(left, snapUp(after + GRID));
  }
  const need = snapUp(x + w + pad - slice.position.x);
  return { x, y: lane.position.y + 40, sliceWidth: Math.max(slice.data.width, need), empty: false };
}

// The arrows a new element gets by the flow rules (R4.8), as [source id, target id] pairs.
// "Above" and "under" mean another lane of the same slice; the nearest one is taken.
function autoConnections(nodes, node) {
  const slice = sliceOf(slices(nodes), node);
  if (!slice) return [];
  const members = membersOf(nodes);
  const others = (members.get(slice.id) ?? []).filter((n) => n.id !== node.id);
  const centre = (n) => n.position.y + stickyH(n) / 2;
  const me = centre(node);
  const gap = (n) => Math.abs(centre(n) - me);
  const nearest = (list) => list.reduce((best, n) => (!best || gap(n) < gap(best) ? n : best), null);
  const above = (kind) => nearest(others.filter((n) => n.data.kind === kind && centre(n) < me));
  const below = (kind) => nearest(others.filter((n) => n.data.kind === kind && centre(n) > me));

  const pairs = [];
  const kind = node.data.kind;
  if (kind === 'command') {
    const screen = above('screen');
    if (screen) pairs.push([screen.id, node.id]);
  }
  if (kind === 'event') {
    const command = above('command');
    if (command) pairs.push([command.id, node.id]);
  }
  if (kind === 'screen') {
    const query = below('query');
    if (query) pairs.push([query.id, node.id]);
  }
  if (kind === 'query') {
    const screen = above('screen');
    if (screen) pairs.push([node.id, screen.id]);
    const chapterSlices = slices(nodes, node.parentId);
    const previous = chapterSlices[chapterSlices.findIndex((s) => s.id === slice.id) - 1];
    const events = (previous ? members.get(previous.id) ?? [] : []).filter(
      (n) => n.data.kind === 'event'
    );
    // The right-most event; the nearest by height when several end at the same place.
    const event = events.reduce((best, n) => {
      const right = n.position.x + stickyW(n);
      const bestRight = best ? best.position.x + stickyW(best) : -Infinity;
      return right > bestRight || (right === bestRight && gap(n) < gap(best)) ? n : best;
    }, null);
    if (event) pairs.push([event.id, node.id]);
  }
  return pairs;
}

// Draws the border of the selected Cell above everything else. It is positioned from the
// canvas transform, so it follows panning, zooming and moving the Chapter.
// The elements whose centre is in the Cell.
const cellElements = (nodes, cell) => {
  const lane = nodes.find((n) => n.id === cell.laneId);
  if (!lane) return [];
  return (membersOf(nodes).get(cell.sliceId) ?? []).filter((n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
};

// The Cell an element sits in (null for anything that is not an element).
const cellOfElement = (nodes, n) => {
  if (n.type !== 'sticky') return null;
  const slice = sliceOf(slices(nodes), n);
  const mid = n.position.y + stickyH(n) / 2;
  const lane = lanesOf(nodes, n.parentId).find(
    (l) => mid >= l.position.y && mid < l.position.y + l.data.height
  );
  return slice && lane ? { chapterId: n.parentId, laneId: lane.id, sliceId: slice.id } : null;
};

// Only the node `id` is selected (none for null). Returns the same array when nothing changes.
const selectOnly = (nodes, id) => {
  if (nodes.every((n) => !!n.selected === (n.id === id))) return nodes;
  return nodes.map((n) => (!!n.selected === (n.id === id) ? n : { ...n, selected: n.id === id }));
};

function CellHighlight({ cell }) {
  const box = useStore((s) => {
    if (!cell) return null;
    const lane = s.nodeLookup.get(cell.laneId);
    const slice = s.nodeLookup.get(cell.sliceId);
    if (!lane || !slice) return null; // the lane or slice was removed
    const [tx, ty, zoom] = s.transform;
    return [
      slice.internals.positionAbsolute.x * zoom + tx,
      lane.internals.positionAbsolute.y * zoom + ty,
      slice.data.width * zoom,
      lane.data.height * zoom,
    ].join(',');
  });
  if (!box) return null;
  const [left, top, width, height] = box.split(',').map(Number);
  return <div className="cell-highlight" style={{ left, top, width, height }} />;
}

function Board() {
  const saved = useMemo(() => load() ?? makeEmptyBoard(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(saved.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.edges);
  // Contexts are a list of their own; the first one is the Default (it cannot be deleted).
  const [contexts, setContexts] = useState(saved.contexts);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();
  const canvasRef = useRef(null);

  // `count` ids that are unused on the board and different from each other.
  const newIds = (count = 1) => {
    const used = new Set([
      ...getNodes().flatMap((n) => [n.id, ...(n.data.scenarios ?? []).map((s) => s.id)]),
      ...contexts.map((c) => c.id),
    ]);
    return Array.from({ length: count }, () => uniqueId(used));
  };

  // Toolbar buttons that add things (elements, slices, lanes) act on the active Chapter:
  // the one last clicked or dragged, or the first one.
  const [activeId, setActiveId] = useState(null);
  const chapters = nodes.filter((n) => n.type === 'chapter');

  // An element arrow leaves the lower point of its source and enters the upper point of its
  // target when the target is below (same height counts as below), and the other way round
  // when the target is above. Chosen on every render, so it follows moving elements.
  const displayEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const centreY = (n) => (byId.get(n.parentId)?.position.y ?? 0) + n.position.y + stickyH(n) / 2;
    return edges.map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (s?.type !== 'sticky' || t?.type !== 'sticky') return e;
      const down = centreY(t) >= centreY(s);
      return {
        ...e,
        sourceHandle: down ? 'bottom-out' : 'top-out',
        targetHandle: down ? 'top-in' : 'bottom-in',
      };
    });
  }, [nodes, edges]);
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const activeChapterId = active?.id;

  // The selected Cell, if any: { chapterId, laneId, sliceId }. Selection only: it is not
  // saved, exported or recorded for undo.
  const [selectedCell, setSelectedCell] = useState(null);
  // The Chapter, lane or slice whose info is being edited.
  const [infoId, setInfoId] = useState(null);
  const [infoReading, setInfoReading] = useState(false); // the info panel opens in read mode
  const [helpOpen, setHelpOpen] = useState(false);
  // The element whose title is to be edited (asked for by the Enter hotkey).
  const [titleEditId, setTitleEditId] = useState(null);
  // The scenario being edited: { nodeId, scenarioId } (scenarioId null for a new one).
  const [scenarioEdit, setScenarioEdit] = useState(null);
  const scenarioOpen = useRef(false);
  scenarioOpen.current = !!scenarioEdit;
  const [notice, setNotice] = useState(null);
  const infoNode = nodes.find((n) => n.id === infoId);
  // A Notes element keeps its Markdown in `markdown`; Chapters, lanes and slices in `info`.
  const infoField = infoNode?.data.kind === 'notes' ? 'markdown' : 'info';
  const saveInfo = (text) => {
    const value = text.trim() ? text : '';
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== infoId) return n;
        const { [infoField]: _old, ...rest } = n.data;
        return { ...n, data: value ? { ...rest, [infoField]: value } : rest };
      })
    );
    setInfoId(null);
  };
  const focusChapter = (node) =>
    setActiveId(node.type === 'chapter' ? node.id : node.parentId ?? null);

  // Selects the Cell of an element, leaving the selected elements as they are (R5a.12).
  const selectCellOf = (id) => {
    const ns = getNodes();
    const n = ns.find((m) => m.id === id);
    setSelectedCell((n && cellOfElement(ns, n)) ?? null);
  };

  // Selects a Cell and, when it holds exactly one element, that element too (R5a.12). The
  // element is selected after the event: the canvas clears the selection when a click on it ends.
  const chooseCell = (cell) => {
    setSelectedCell(cell);
    setTimeout(() => {
      setNodes((ns) => {
        const inCell = cellElements(ns, cell);
        return selectOnly(ns, inCell.length === 1 ? inCell[0].id : null);
      });
    }, 0);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, boardText(nodes, edges, contexts));
    } catch {
      // ignore unavailable storage
    }
  }, [nodes, edges, contexts]);

  // ---- Undo / redo (in memory only) ----
  const restore = useCallback(
    (snap) => {
      setNodes(snap.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges(snap.edges.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setContexts(snap.contexts);
      setSelectedCell(null);
    },
    [setNodes, setEdges]
  );
  const { hist, undo, redo, api: historyApi, markSilent } = useHistory({
    nodes,
    edges,
    contexts,
    restore,
    blocked: scenarioOpen,
  });

  // Scenarios whose Events/Commands were deleted (or left the Chapter) are deleted too. The
  // change is folded into the user's operation (see markSilent).
  useEffect(() => {
    const pruned = pruneScenarios(nodes);
    if (!pruned) return;
    markSilent();
    setNodes(pruned.nodes);
    setNotice(
      `Deleted ${pruned.removed.length === 1 ? 'the scenario' : 'the scenarios'} ${pruned.removed
        .map((t) => `"${t}"`)
        .join(', ')}: an element used in ${pruned.removed.length === 1 ? 'it' : 'them'} was deleted or left the Chapter.`
    );
  }, [nodes, setNodes, markSilent]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Hotkeys of a selected Cell (R5a.11). The handler is assigned further down, where the
  // actions it needs are defined; this listener stays registered.
  const cellKeys = useRef(null);
  useEffect(() => {
    const onKey = (e) => cellKeys.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Slices are laid out automatically, so they cannot be dragged.
  const handleNodesChange = useCallback(
    (changes) => {
      const current = getNodes();
      const isSliceId = (id) => current.find((n) => n.id === id)?.type === 'slice';
      const kept = changes.filter((c) => !(c.type === 'position' && isSliceId(c.id)));
      onNodesChange(kept);
      // Measured sizes arrive after render (e.g. a Screen widening for its mockup).
      const stickyIds = new Set(getNodes().filter((n) => n.type === 'sticky').map((n) => n.id));
      if (kept.some((c) => c.type === 'dimensions' && stickyIds.has(c.id))) {
        markSilent();
        setNodes((ns) => centerStickies(settleStickies(ns)));
      }
    },
    [onNodesChange, getNodes, setNodes, markSilent]
  );

  // Deleting a slice also deletes its elements (after confirmation) and closes the gap. The
  // last slice of a Chapter cannot be deleted.
  const removeSlice = (sliceId, alwaysAsk = false) => {
    const slice = nodes.find((n) => n.id === sliceId);
    if (!slice || slices(nodes, slice.parentId).length <= 1) return;
    const doomed = membersOf(nodes).get(sliceId) ?? [];
    if (doomed.length || alwaysAsk) {
      const text = doomed.length ? `Delete the slice and its ${doomed.length} element(s)?` : 'Delete this slice?';
      if (!window.confirm(text)) return;
    }
    const gone = new Set([sliceId, ...doomed.map((n) => n.id)]);
    setNodes(layoutSlices(nodes.filter((n) => !gone.has(n.id)), nodes));
    setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    setSelectedCell((c) => (c?.sliceId === sliceId ? null : c));
    setActiveId(slice.parentId);
  };

  // Selects the top Cell of a slice that was just created.
  const selectTopCellOf = (chapterId, sliceId) => {
    const top = lanesOf(getNodes(), chapterId)[0];
    if (top) chooseCell({ chapterId, laneId: top.id, sliceId });
  };

  const addSlice = () => {
    if (!activeChapterId) return;
    const [id] = newIds();
    setNodes((ns) => {
      // (end is the right edge of the last slice; layout then widens the Chapter if needed)
      const end = slices(ns, activeChapterId).reduce(
        (max, n) => Math.max(max, n.position.x + n.data.width),
        SLICE_MIN_X
      );
      return layoutSlices(
        layered([...ns, makeSlice(id, end, DEFAULT_SLICE_WIDTH, 'New Slice', activeChapterId)])
      );
    });
    selectTopCellOf(activeChapterId, id);
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
        cur.parentId
      );
      return layoutSlices(layered([...ns, added]), ns);
    });
    setActiveId(nodes.find((n) => n.id === sliceId)?.parentId ?? null);
    const chapterId = nodes.find((n) => n.id === sliceId)?.parentId;
    if (chapterId) selectTopCellOf(chapterId, id);
  };

  // Inserts a lane of `type` (the lane's own type or one of its next types, R2.10). Of the same
  // type it goes right below `laneId`; of another type, below the last lane that comes before
  // that type, so the lane order is kept. The lanes below and their elements move down.
  const addLaneAfter = (laneId, type) => {
    const [id] = newIds();
    setNodes((ns) => {
      const lane = ns.find((n) => n.id === laneId);
      if (!lane) return ns;
      const rank = (l) => LANE_TYPE_ORDER.indexOf(l.data.type);
      const anchor =
        type === lane.data.type
          ? lane
          : lanesOf(ns, lane.parentId).filter((l) => rank(l) < LANE_TYPE_ORDER.indexOf(type)).pop();
      if (!anchor) return ns;
      const below = anchor.position.y + anchor.data.height;
      const shifted = ns.map((n) =>
        n.parentId === lane.parentId &&
        (n.type === 'lane' || n.type === 'sticky') &&
        n.position.y >= below
          ? { ...n, position: { ...n.position, y: n.position.y + LANE_HEIGHT } }
          : n
      );
      return layered([
        ...shifted,
        makeLane(id, lane.parentId, type, LANE_TYPES[type].label, below, 'none', lane.data.width),
      ]);
    });
    setActiveId(nodes.find((n) => n.id === laneId)?.parentId ?? null);
  };

  const removeLane = useCallback(
    (laneId) => {
      const lane = nodes.find((n) => n.id === laneId);
      if (!lane) return;
      const chapterId = lane.parentId;
      const sameType = lanesOf(nodes, chapterId).filter((l) => l.data.type === lane.data.type);
      if (REQUIRED_LANE_TYPES.includes(lane.data.type) && sameType.length <= 1) return;
      const top = lane.position.y;
      const bottom = top + lane.data.height;
      const mine = (n) => n.parentId === chapterId;
      const inLane = (n) =>
        n.type === 'sticky' && mine(n) && n.position.y >= top && n.position.y < bottom;
      const doomed = nodes.filter(inLane);
      if (
        doomed.length &&
        !window.confirm(`Remove this lane and its ${doomed.length} note(s)?`)
      )
        return;
      const gone = new Set([laneId, ...doomed.map((n) => n.id)]);
      setNodes(
        nodes
          .filter((n) => !gone.has(n.id))
          .map((n) =>
            mine(n) && (n.type === 'sticky' || n.type === 'lane') && n.position.y >= bottom
              ? { ...n, position: { ...n.position, y: n.position.y - lane.data.height } }
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
    setNodes((ns) =>
      layered([
        ...ns,
        makeChapter(id, x, y, `Chapter ${chapters.length + 1}`, contexts[0].id),
        ...LANES.map((l, i) => makeLane(laneIds[i], id, l.type, l.label, l.y, 'none', width)),
        makeSlice(sliceId, SLICE_MIN_X, DEFAULT_SLICE_WIDTH, 'New Slice', id),
      ])
    );
    setActiveId(id);
  };

  const removeChapter = useCallback(
    (chapterId) => {
      const kids = nodes.filter((n) => n.parentId === chapterId);
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

  // Each slice shrinks (or grows) to its elements plus the minimal margins; empty slices get
  // the default width. An element alone in its Cell is centred horizontally, unless a Cell above
  // it in the slice holds several elements; those and the elements below them keep their layout
  // and are centred together as a group.
  // Later slices move left. With `onlySliceId` only that slice is compacted.
  const compactChapter = useCallback(
    (chapterId, onlySliceId) => {
      setNodes((ns) => {
        const members = membersOf(ns);
        const lanes = lanesOf(ns, chapterId);
        const laneIdOf = (n) => {
          const mid = n.position.y + stickyH(n) / 2;
          return lanes.find((l) => mid >= l.position.y && mid < l.position.y + l.data.height)?.id;
        };
        const widths = new Map();
        const shifts = new Map();
        for (const sl of slices(ns, chapterId)) {
          if (onlySliceId && sl.id !== onlySliceId) continue;
          const els = members.get(sl.id) ?? [];
          if (!els.length) {
            widths.set(sl.id, DEFAULT_SLICE_WIDTH);
            continue;
          }
          const w = stickyW;
          const cells = new Map();
          for (const n of els) cells.set(laneIdOf(n), [...(cells.get(laneIdOf(n)) ?? []), n]);
          // An element alone in its Cell is centred only if no Cell above it in the slice holds
          // several elements; those elements, and the ones below them, keep their layout and are
          // centred together as a group.
          const single = [];
          const group = [];
          let crowded = false;
          for (const lane of lanes) {
            const here = cells.get(lane.id) ?? [];
            if (here.length > 1) {
              crowded = true;
              group.push(...here);
            } else if (crowded) group.push(...here);
            else single.push(...here);
          }
          const left = Math.min(...group.map((n) => n.position.x - padOf(n.data.kind)));
          const right = Math.max(...group.map((n) => n.position.x + w(n) + padOf(n.data.kind)));
          const width = Math.max(
            SLICE_MIN_WIDTH,
            snapUp(Math.max(0, right - left, ...single.map((n) => w(n) + 2 * padOf(n.data.kind))))
          );
          widths.set(sl.id, width);
          for (const n of single) {
            shifts.set(n.id, Math.floor((width - w(n)) / 2) - (n.position.x - sl.position.x));
          }
          if (group.length) {
            const dx = Math.floor((width - (right - left)) / 2) - (left - sl.position.x);
            group.forEach((n) => shifts.set(n.id, dx));
          }
        }
        const moved = ns.map((n) => {
          if (widths.has(n.id)) return { ...n, data: { ...n.data, width: widths.get(n.id) } };
          if (shifts.has(n.id)) return { ...n, position: { ...n.position, x: n.position.x + shifts.get(n.id) } };
          return n;
        });
        return layoutSlices(moved, ns);
      });
      setActiveId(chapterId);
    },
    [setNodes]
  );

  const setChapterContext = (chapterId, contextId) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === chapterId ? { ...n, data: { ...n.data, context: contextId } } : n))
    );

  // Creates a Context and assigns it to the Chapter.
  const addContext = (chapterId) => {
    const name = window.prompt('Name of the new context')?.trim();
    if (!name) return;
    const [id] = newIds();
    setContexts((cs) => [...cs, { id, name }]);
    setChapterContext(chapterId, id);
  };

  // Renames the Context for every Chapter that shares it.
  const renameContext = (contextId) => {
    const current = contexts.find((c) => c.id === contextId);
    const name = window.prompt('Rename the context', current?.name)?.trim();
    if (!name) return;
    setContexts((cs) => cs.map((c) => (c.id === contextId ? { ...c, name } : c)));
  };

  // The Default (first) Context cannot be deleted; its Chapters' Contexts move to it.
  const removeContext = (contextId) => {
    const fallback = contexts[0];
    if (contextId === fallback.id) return;
    const used = chapters.filter((c) => c.data.context === contextId).length;
    if (!window.confirm(`Delete this context? ${used} chapter(s) move to "${fallback.name}".`)) return;
    setContexts((cs) => cs.filter((c) => c.id !== contextId));
    setNodes((ns) =>
      ns.map((n) =>
        n.type === 'chapter' && n.data.context === contextId
          ? { ...n, data: { ...n.data, context: fallback.id } }
          : n
      )
    );
  };

  const boardActions = useMemo(
    () => ({
      editScenario: (nodeId, scenarioId) => setScenarioEdit({ nodeId, scenarioId }),
      newScenarioId: () => newIds()[0],
      contexts,
      setChapterContext,
      addContext,
      renameContext,
      removeContext,
      activate: setActiveId,
      openInfo: (id) => {
        setInfoReading(false);
        setInfoId(id);
      },
      readInfo: (id) => {
        setInfoReading(true);
        setInfoId(id);
      },
      titleEditId,
      clearTitleEdit: () => setTitleEditId(null),
      clearCell: () => setSelectedCell(null),
      addSliceAfter,
      removeSlice,
      selectCell: (cell) => {
        chooseCell(cell);
        setActiveId(cell.chapterId);
      },
      addLaneAfter,
      removeLane,
      removeChapter,
      compactChapter,
      activeId: activeChapterId,
    }),
    [
      removeLane,
      removeChapter,
      compactChapter,
      addSliceAfter,
      removeSlice,
      addLaneAfter,
      activeChapterId,
      chapters.length,
      contexts,
      nodes,
      titleEditId,
    ]
  );

  // The scenario popup: the Events and Commands of the Scenarios element's Chapter are offered.
  const scenarioNode = scenarioEdit && nodes.find((n) => n.id === scenarioEdit.nodeId);
  const editedScenario = scenarioNode?.data.scenarios?.find((s) => s.id === scenarioEdit.scenarioId) ?? null;
  const scenarioCandidates = useMemo(() => {
    if (!scenarioNode) return [];
    const ss = slices(nodes, scenarioNode.parentId);
    return nodes
      .filter(
        (n) =>
          n.type === 'sticky' &&
          n.parentId === scenarioNode.parentId &&
          (n.data.kind === 'event' || n.data.kind === 'command')
      )
      .map((n) => ({
        id: n.id,
        kind: n.data.kind,
        title: n.data.title,
        where: sliceOf(ss, n)?.data.name ?? '',
        order: [sliceOf(ss, n)?.position.x ?? 0, n.position.x, n.position.y],
      }))
      .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]);
  }, [nodes, scenarioNode]);

  const saveScenario = (scenario) => {
    const { nodeId } = scenarioEdit;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const list = n.data.scenarios;
        const next = scenario.id
          ? list.map((s) => (s.id === scenario.id ? scenario : s))
          : [...list, { ...scenario, id: newIds()[0] }];
        return { ...n, data: { ...n.data, scenarios: next } };
      })
    );
    setScenarioEdit(null);
  };

  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([boardText(nodes, edges, contexts)], { type: 'application/json' })
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
      setContexts(board.contexts);
    } catch (err) {
      window.alert(`Could not import "${file.name}": ${err.message}`);
    }
  };

  // Chapters connect to Chapters (as dragged); elements only along FLOWS_TO, and a connection
  // dragged the wrong way is turned around. Never to itself, at most once. Null when refused.
  const orient = (c) => {
    const ns = getNodes();
    const a = ns.find((n) => n.id === c.source);
    const b = ns.find((n) => n.id === c.target);
    if (!a || !b || a.id === b.id) return null;
    if (a.type === 'chapter' && b.type === 'chapter') return [a.id, b.id];
    if (a.type !== 'sticky' || b.type !== 'sticky') return null;
    if (FLOWS_TO[a.data.kind]?.includes(b.data.kind)) return [a.id, b.id];
    if (FLOWS_TO[b.data.kind]?.includes(a.data.kind)) return [b.id, a.id];
    return null;
  };

  const isValidConnection = useCallback(
    (c) => {
      const o = orient(c);
      return !!o && !getEdges().some((e) => e.source === o[0] && e.target === o[1]);
    },
    [getNodes, getEdges]
  );

  const onConnect = useCallback(
    (c) => {
      const o = orient(c);
      if (!o || !isValidConnection(c)) return;
      const fromChapter = getNodes().find((n) => n.id === o[0])?.type === 'chapter';
      setEdges((es) => [...es, makeEdge(o[0], o[1], fromChapter)]);
    },
    [setEdges, getNodes, isValidConnection]
  );

  // An element is only created in a Cell. A `drop` ({ cell, x }) puts it in that Cell at
  // x (relative to its Chapter); else the selected Cell is used (see spotInCell); with
  // neither, nothing is added. The arrows of R4.8 are added in the same step.
  const addSticky = (kind, drop) => {
    const [id] = newIds();
    const ns = getNodes();
    const find = (i) => ns.find((n) => n.id === i);
    const cellRef = drop?.cell ?? selectedCell;
    const lane = cellRef && find(cellRef.laneId);
    const slice = cellRef && find(cellRef.sliceId);
    if (!lane || !slice || !laneAllows(lane, kind)) return;
    const x = drop?.x;

    let base = ns;
    let pos;
    const spot = spotInCell(ns, lane, slice, kind);
    if (x === undefined || spot.empty) {
      pos = { x: spot.x, y: spot.y };
      if (spot.sliceWidth > slice.data.width) {
        // Make room: widen the slice; the slices after it (and their elements) move right.
        base = layoutSlices(setSliceWidth(ns, slice.id, spot.sliceWidth), ns);
      }
    } else {
      pos = { x: Math.max(slice.position.x + padOf(kind), x), y: lane.position.y + 40 };
    }
    const only = new Set([id]);
    const next = centerStickies(
      settleStickies(
        [
          ...base,
          {
            id,
            type: 'sticky',
            parentId: slice.parentId,
            position: pos,
            data: { kind, title: '', ...(kind === 'scenarios' ? { scenarios: [] } : {}) },
          },
        ],
        only
      ),
      only
    );
    const inSelectedCell =
      selectedCell && selectedCell.laneId === lane.id && selectedCell.sliceId === slice.id;
    setNodes(inSelectedCell ? selectOnly(next, id) : next);
    const have = new Set(getEdges().map((e) => `${e.source}>${e.target}`));
    const added = autoConnections(next, next.find((n) => n.id === id))
      .filter(([s, t]) => !have.has(`${s}>${t}`))
      .map(([s, t]) => makeEdge(s, t, false));
    if (added.length) setEdges((es) => [...es, ...added]);
  };

  // Deletes the elements of a Cell, with their arrows, after confirmation.
  const removeCellElements = (cell) => {
    const ns = getNodes();
    const lane = ns.find((n) => n.id === cell.laneId);
    const slice = ns.find((n) => n.id === cell.sliceId);
    if (!lane || !slice) return;
    const inCell = (membersOf(ns).get(slice.id) ?? []).filter((n) => {
      const mid = n.position.y + stickyH(n) / 2;
      return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
    });
    if (!inCell.length) return;
    if (!window.confirm(`Delete the ${inCell.length} element(s) in this Cell?`)) return;
    const gone = new Set(inCell.map((n) => n.id));
    setNodes(ns.filter((n) => !gone.has(n.id)));
    setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
  };

  // Makes a slice wider or narrower by `delta` px, within its limits (one undo step). The
  // slices after it, their elements and a grown Chapter follow.
  const resizeSlice = (sliceId, delta) => {
    const base = getNodes();
    const slice = base.find((n) => n.id === sliceId);
    if (!slice) return;
    const width = Math.max(minSliceWidth(base, slice), snap(slice.data.width + delta));
    if (width === slice.data.width) return;
    setNodes(centerStickies(settleStickies(layoutSlices(setSliceWidth(base, sliceId, width), base))));
  };

  // Moves a slice one place left (-1) or right (1), with its elements, by swapping it with its
  // neighbour (one undo step).
  const moveSlice = (sliceId, dir) => {
    const base = getNodes();
    const slice = base.find((n) => n.id === sliceId);
    if (!slice) return;
    const ss = slices(base, slice.parentId);
    const other = ss[ss.findIndex((s) => s.id === sliceId) + dir];
    if (!other) return;
    // The layout orders slices by position: put this one just inside the neighbour's far edge.
    const x = dir > 0 ? other.position.x + other.data.width - 1 : other.position.x - 1;
    setNodes(
      layoutSlices(
        base.map((n) => (n.id === sliceId ? { ...n, position: { ...n.position, x } } : n)),
        base
      )
    );
  };

  cellKeys.current = (e) => {
    if (infoId || helpOpen || scenarioEdit) return;
    // '+' needs Shift on most layouts; with Shift, ←/→ resize, C compacts and Delete/Backspace
    // delete the slice (slice operations use Shift, Cell operations do not).
    const withShift =
      e.key === '+' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'Delete' ||
      e.key === 'Backspace' ||
      e.key.toLowerCase() === 'i' ||
      e.key.toLowerCase() === 'c';
    // Ctrl+←/→ moves the slice.
    const moveKey =
      e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    if (!moveKey && (e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && !withShift))) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key.toLowerCase() === 'i' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].type === 'sticky' && selected[0].data.kind !== 'notes') {
        e.preventDefault();
        setInfoReading(false);
        setInfoId(selected[0].id);
      }
      return;
    }
    if (e.key.toLowerCase() === 'a') {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].data.kind === 'scenarios') {
        e.preventDefault();
        setScenarioEdit({ nodeId: selected[0].id, scenarioId: null });
      }
      return;
    }
    if (!selectedCell) return;
    if (e.key === '+') {
      e.preventDefault();
      addSliceAfter(selectedCell.sliceId);
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      compactChapter(selectedCell.chapterId, selectedCell.sliceId);
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      setInfoReading(false);
      setInfoId(selectedCell.sliceId);
      return;
    }
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (step) {
      e.preventDefault();
      if (moveKey) {
        moveSlice(selectedCell.sliceId, step[1]);
        return;
      }
      if (e.shiftKey) {
        resizeSlice(selectedCell.sliceId, step[1] * GRID);
        return;
      }
      const ns = getNodes();
      const lanes = lanesOf(ns, selectedCell.chapterId);
      const cols = slices(ns, selectedCell.chapterId);
      const row = lanes.findIndex((l) => l.id === selectedCell.laneId) + step[0];
      const col = cols.findIndex((s) => s.id === selectedCell.sliceId) + step[1];
      if (lanes[row] && cols[col]) {
        chooseCell({ ...selectedCell, laneId: lanes[row].id, sliceId: cols[col].id });
      }
      return;
    }
    const kind = CELL_ADD_KEYS[e.key.toLowerCase()];
    if (kind) {
      e.preventDefault();
      addSticky(kind);
    } else if (e.key === 'Enter' && t.tagName !== 'BUTTON') {
      const ns = getNodes();
      const selectedNodes = ns.filter((n) => n.selected);
      if (selectedNodes.length === 1 && selectedNodes[0].data.kind === 'notes') {
        e.preventDefault();
        setInfoReading(false);
        setInfoId(selectedNodes[0].id);
        return;
      }
      const lane = ns.find((n) => n.id === selectedCell.laneId);
      const first = (membersOf(ns).get(selectedCell.sliceId) ?? [])
        .filter((n) => {
          const mid = n.position.y + stickyH(n) / 2;
          return !['scenarios', 'notes'].includes(n.data.kind) && lane && mid >= lane.position.y && mid < lane.position.y + lane.data.height;
        })
        .sort((a, b) => a.position.x - b.position.x)[0];
      if (first) {
        e.preventDefault();
        setTitleEditId(first.id);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      // One press does one thing, so deleting the last element never goes on to ask about the slice.
      if (e.repeat) return;
      if (e.shiftKey) {
        removeSlice(selectedCell.sliceId, true);
        return;
      }
      const gone = new Set(getNodes().filter((n) => n.selected && n.type === 'sticky').map((n) => n.id));
      if (gone.size) {
        setNodes((ns) => ns.filter((n) => !gone.has(n.id)));
        setEdges((es) => es.filter((x) => !gone.has(x.source) && !gone.has(x.target)));
        return;
      }
      removeCellElements(selectedCell);
    } else if (e.key === 'Escape') {
      setSelectedCell(null);
      setNodes((ns) => selectOnly(ns, null));
    }
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
    addSticky(kind, { cell, x: p.x - kindW(kind) / 2 - chapter.position.x });
  };

  // Selects the Cell under the click, or clears the selection when it is outside every Cell.
  const selectCellAt = (e) => {
    const cell = cellAt(getNodes(), screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    if (cell) {
      chooseCell(cell);
      setActiveId(cell.chapterId);
    } else {
      setSelectedCell(null);
    }
  };

  // Where the dragged elements were when the drag began, so a drop over no Cell can undo the move.
  const dragOrigin = useRef(new Map());
  const rememberDrag = (dragged) => {
    const current = new Map(getNodes().map((n) => [n.id, n]));
    dragOrigin.current = new Map(
      dragged
        .filter((n) => n.type === 'sticky')
        .map((n) => {
          const { parentId, position } = current.get(n.id) ?? n;
          return [n.id, { parentId, position: { ...position } }];
        })
    );
  };
  const dropDragged = (dragged) => {
    const ids = new Set(dragged.map((n) => n.id));
    setNodes((ns) =>
      centerStickies(settleStickies(adoptStickies(ns, ids, dragOrigin.current), ids), ids)
    );
  };

  const selectedLane = selectedCell && nodes.find((n) => n.id === selectedCell.laneId);

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
        <span className="target" title="New slices are added to this Chapter">
          Add to: <strong>{active?.data.name}</strong>
        </span>
        {Object.entries(KINDS).map(([kind, k]) => (
          <button
            key={kind}
            className={`chip ${kind}`}
            aria-disabled={selectedLane && !laneAllows(selectedLane, kind) ? true : undefined}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/event-model', kind)}
            onClick={() => addSticky(kind)}
            title={`Add to the selected Cell (${hotkeyOf(kind)}). Only ${acceptingLanes(kind)} lanes take it.`}
          >
            + {k.icon && `${k.icon} `}{k.label}
          </button>
        ))}
        <button className="chip slice-btn" onClick={addSlice} title="Add a slice to the Chapter">
          + Slice
        </button>
        <button className="chip chapter-btn" onClick={addChapter} title="Add a new Chapter">
          + Chapter
        </button>
        <span className="spacer" />
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
        <button className="hotkeys-btn" onClick={() => setHelpOpen(true)} title="Hotkeys" aria-label="Hotkeys">
          ⌨️
        </button>
      </header>
      <div className="canvas" ref={canvasRef}>
        <HistoryContext.Provider value={historyApi}>
        <BoardActions.Provider value={boardActions}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={(e, node) => {
            // Lanes cover the whole Cell area, so a click on the empty part of a Cell is
            // delivered to a lane node, not to the canvas: treat it as a click on the canvas.
            if (node.type === 'lane') selectCellAt(e);
            else if (node.type === 'slice') focusChapter(node); // its header selects a Cell itself
            else {
              if (node.type === 'sticky') selectCellOf(node.id);
              else setSelectedCell(null);
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
          onNodeDragStop={(_, node, dragged) => {
            dropDragged(dragged);
            historyApi.end();
            // After the drop has settled, the element's new Cell is selected.
            setTimeout(() => selectCellOf(node.id), 0);
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
          deleteKeyCode={scenarioEdit || selectedCell ? null : ['Backspace', 'Delete']}
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
      {helpOpen && <HotkeysDialog onClose={() => setHelpOpen(false)} />}
      {infoNode && (
        <InfoDialog
          key={infoNode.id}
          initialReading={infoReading}
          title={
            infoNode.type === 'sticky' && infoNode.data.kind !== 'notes'
              ? `${KINDS[infoNode.data.kind].label}${infoNode.data.title ? ` — ${infoNode.data.title}` : ''}`
              : infoNode.data.kind === 'notes' ? 'Notes' : `${infoNode.type[0].toUpperCase()}${infoNode.type.slice(1)} — ${infoNode.data.name ?? infoNode.data.label}`
          }
          initial={infoNode.data[infoField] ?? ''}
          onSave={saveInfo}
          onCancel={() => setInfoId(null)}
        />
      )}
      {scenarioNode && (scenarioEdit.scenarioId === null || editedScenario) && (
        <ScenarioDialog
          key={`${scenarioEdit.nodeId}:${scenarioEdit.scenarioId}`}
          scenario={editedScenario}
          candidates={scenarioCandidates}
          onSave={saveScenario}
          onClose={() => setScenarioEdit(null)}
        />
      )}
      {notice && (
        <div className="toast" role="status" title="Click to dismiss" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
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
