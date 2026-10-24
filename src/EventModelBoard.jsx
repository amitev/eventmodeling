import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
} from '@xyflow/react';

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
const SLICE_PADDING = 40; // minimum gap between a slice border and its elements
const STICKY_W = 160; // width of an element before it is measured
const STICKY_H = 132; // height of an element before it is measured (26px header + 104px body)
const DEFAULT_SLICE_WIDTH = 220;
const SLICE_MIN_WIDTH = 120;

const KINDS = {
  screen: { label: 'Screen', lane: 0, color: '#e2e2e2' },
  command: { label: 'Command', lane: 1, color: '#7cc3f2' },
  readmodel: { label: 'Read Model', lane: 1, color: '#8fd694' },
  event: { label: 'Event', lane: 2, color: '#ffb366' },
  processor: { label: 'Processor', lane: 1, color: '#d9c2f0', icon: '⚙️' },
  // Not part of the flow: it connects to nothing (R4.7).
  scenarios: { label: 'Scenarios', color: '#2f6fdb', w: 280, h: 200 },
};

// Size of an element before it is measured.
const kindW = (kind) => KINDS[kind]?.w ?? STICKY_W;
const kindH = (kind) => KINDS[kind]?.h ?? STICKY_H;

// Element types an element of each type can point to (R4.7).
const FLOWS_TO = {
  screen: ['command'],
  processor: ['command'],
  command: ['event'],
  event: ['readmodel'],
  readmodel: ['screen', 'processor'],
};

const snap = (v) => Math.round(v / GRID) * GRID;

// Keys that add an element of that type to the selected Cell (R5a.11).
const CELL_ADD_KEYS = { s: 'screen', c: 'command', r: 'readmodel', e: 'event', p: 'processor', x: 'scenarios' };

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
      ['S', 'Add a Screen in the Cell'],
      ['C', 'Add a Command in the Cell'],
      ['R', 'Add a Read Model in the Cell'],
      ['E', 'Add an Event in the Cell'],
      ['P', 'Add a Processor in the Cell'],
      ['X', 'Add a Scenarios element in the Cell'],
      ['+', 'Add a slice right after the Cell’s slice'],
      ['Enter', 'Edit the title of the first element in the Cell'],
      ['Delete / Backspace', 'Delete the elements in the Cell, or the slice if the Cell is empty (asks first)'],
      ['Esc', 'Clear the Cell selection'],
    ],
  },
  {
    group: 'Editing a name or title',
    keys: [
      ['Enter / Esc', 'Save'],
      ['Ctrl+Z', "The field's own undo"],
    ],
  },
  {
    group: 'Info panel',
    keys: [['Esc', 'Cancel']],
  },
];

function HotkeysDialog({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="info-backdrop" onClick={onClose}>
      <div
        className="hotkeys-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Hotkeys"
        onClick={(e) => e.stopPropagation()}
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
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
const NEW_CONTEXT = '__new-context__'; // value of the "+ New context..." dropdown entry
const LANE_COLORS = ['none', 'orange', 'red', 'green', 'blue', 'pink', 'purple', 'yellow', 'brown', 'gray'];

const snapUp = (v) => Math.ceil(v / GRID) * GRID;

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ID_LENGTH = 6;

// 6 characters of a-zA-Z0-9 from the secure random source (R1.14).
function randomId() {
  let id = '';
  while (id.length < ID_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      if (b < 248 && id.length < ID_LENGTH) id += ID_CHARS[b % 62]; // 248 = 4 * 62: no modulo bias
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
// Measured size of an element (React Flow keeps it in `measured`); the default until measured.
const stickyW = (n) => n.measured?.width ?? kindW(n.data?.kind);
const stickyH = (n) => n.measured?.height ?? kindH(n.data?.kind);
const slices = (nodes, chapterId) =>
  nodes
    .filter((n) => n.type === 'slice' && (chapterId === undefined || n.parentId === chapterId))
    .sort((a, b) => a.position.x - b.position.x);
const lanesOf = (nodes, chapterId) =>
  nodes
    .filter((n) => n.type === 'lane' && n.parentId === chapterId)
    .sort((a, b) => a.position.y - b.position.y);
const chaptersOf = (nodes) => nodes.filter((n) => n.type === 'chapter');

const setSliceWidth = (nodes, id, width) =>
  nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, width } } : n));

// The slice an element is in: the slice of its Chapter that holds its left edge (an element
// is kept at least SLICE_PADDING inside its slice, and may grow to the right), else the one
// it overlaps most, else the nearest. Undefined only when the Chapter has no slice.
function sliceOf(ss, n) {
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

// An element never straddles a slice boundary: it is moved fully inside its slice (keeping
// SLICE_PADDING from its borders), and that slice grows if the element does not fit.
function settleStickies(nodes, only) {
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
function adoptStickies(nodes, only, origin) {
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
    if (!cell) {
      const from = origin.get(n.id);
      if (!from) return n;
      changed = true;
      return { ...n, parentId: from.parentId, position: { ...from.position } };
    }
    const chapter = byId.get(cell.chapterId);
    const slice = byId.get(cell.sliceId);
    const x = Math.max(
      slice.position.x + SLICE_PADDING,
      Math.min(ax - chapter.position.x, slice.position.x + slice.data.width - w - SLICE_PADDING)
    );
    const y = ay - chapter.position.y;
    if (chapter.id === n.parentId && x === n.position.x && y === n.position.y) return n;
    changed = true;
    return { ...n, parentId: chapter.id, position: { x, y } };
  });
  return changed ? next : nodes;
}

const normalize = (nodes) => centerStickies(settleStickies(layoutSlices(nodes)));

// Items are drawn in list order (a child's z-index never goes below its parent's), so lanes
// must come before slices and elements to stay under their tint.
const LAYER = { chapter: 0, lane: 1, slice: 2, sticky: 3 };
const layered = (nodes) => [...nodes].sort((a, b) => LAYER[a.type] - LAYER[b.type]);

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
const keyOf = (nodes, edges, contexts) =>
  JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.parentId, n.position.x, n.position.y, n.data]),
    edges.map((e) => [e.id, e.source, e.target]),
    contexts,
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

// Links in the info preview open in a new tab, without access to the board.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Edits behind the helper buttons: ({ value, start, end }) -> the new text and selection.
const wrapSelection = (before, after, placeholder) => ({ value, start, end }) => {
  const sel = value.slice(start, end) || placeholder;
  const from = start + before.length;
  return {
    value: value.slice(0, start) + before + sel + after + value.slice(end),
    start: from,
    end: from + sel.length,
  };
};

const toggleTasks = ({ value, start, end }) => {
  if (start === end) {
    const atLineStart = start === 0 || value[start - 1] === '\n';
    const ins = `${atLineStart ? '' : '\n'}- [ ] Task\n- [x] Resolved task\n`;
    const at = start + ins.length;
    return { value: value.slice(0, start) + ins + value.slice(end), start: at, end: at };
  }
  const from = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split('\n');
  const on = lines.every((l) => l.startsWith('- [ ] '));
  const next = lines.map((l) => (on ? l.slice(6) : `- [ ] ${l}`)).join('\n');
  return { value: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
};

const insertTable = ({ value, start, end }) => {
  const atLineStart = start === 0 || value[start - 1] === '\n';
  const ins = `${atLineStart ? '' : '\n'}| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n`;
  const at = start + ins.length;
  return { value: value.slice(0, start) + ins + value.slice(end), start: at, end: at };
};

const toCode = (state) => {
  const { value, start, end } = state;
  const sel = value.slice(start, end);
  if (!sel.includes('\n')) return wrapSelection('`', '`', 'code')(state);
  const ins = `\`\`\`\n${sel}\n\`\`\``;
  return { value: value.slice(0, start) + ins + value.slice(end), start, end: start + ins.length };
};

const toLink = ({ value, start, end }) => {
  const text = value.slice(start, end) || 'text';
  const from = start + text.length + 3;
  return {
    value: `${value.slice(0, start)}[${text}](url)${value.slice(end)}`,
    start: from,
    end: from + 3,
  };
};

const svgProps = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };

const MARKDOWN_TOOLS = [
  { title: 'Bold', label: <b>B</b>, edit: wrapSelection('**', '**', 'bold') },
  { title: 'Italic', label: <i className="info-italic">I</i>, edit: wrapSelection('*', '*', 'italic') },
  { title: 'Strikethrough', label: <s>S</s>, edit: wrapSelection('~~', '~~', 'text') },
  null,
  {
    title: 'Task list',
    label: (
      <svg {...svgProps}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="currentColor" />
        <path d="M4 7.2L6.2 9.4L10 4.8" stroke="#fff" />
      </svg>
    ),
    edit: toggleTasks,
  },
  {
    title: 'Table',
    label: (
      <svg {...svgProps}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
        <path d="M1.5 5.2H12.5M1.5 8.8H12.5M7 1.5V12.5" />
      </svg>
    ),
    edit: insertTable,
  },
  { title: 'Code', label: <span className="info-code">&lt;/&gt;</span>, edit: toCode },
  {
    title: 'Link',
    label: (
      <svg {...svgProps}>
        <path d="M6 8L8 6M5.6 5.2L4.4 6.4A2.2 2.2 0 0 0 7.6 9.6L8.4 8.8M8.4 8.8L9.6 7.6A2.2 2.2 0 0 0 6.4 4.4L5.6 5.2" />
      </svg>
    ),
    edit: toLink,
  },
];

// Modal to edit the Markdown info of a Chapter, lane or slice: editor on the left, preview on
// the right. The changes only apply on Save.
function InfoDialog({ title, initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const area = useRef(null);
  const pending = useRef(null); // selection to restore after a helper button changed the text
  // marked does not sanitise, so its HTML always goes through DOMPurify.
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text]);

  const apply = (edit) => {
    const el = area.current;
    const next = edit({ value: text, start: el.selectionStart, end: el.selectionEnd });
    pending.current = next;
    setText(next.value);
  };

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || !area.current) return;
    pending.current = null;
    area.current.focus();
    area.current.setSelectionRange(p.start, p.end);
  }, [text]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="info-backdrop">
      <div className="info-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="info-title">{title}</div>
        <div className="info-panes">
          <div className="info-left">
            <div className="info-toolbar">
              {MARKDOWN_TOOLS.map((tool, i) =>
                tool ? (
                  <button
                    key={tool.title}
                    title={tool.title}
                    aria-label={tool.title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(tool.edit)}
                  >
                    {tool.label}
                  </button>
                ) : (
                  <span key={i} className="info-sep" />
                )
              )}
            </div>
            <textarea
              ref={area}
              className="info-editor"
              autoFocus
              spellCheck={false}
              placeholder="Markdown"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="info-preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="info-actions">
          <button onClick={() => onSave(text)}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// The "i" button of a Chapter, lane or slice; filled when the item has info.
function InfoButton({ id, info }) {
  const { openInfo } = useContext(BoardActions);
  return (
    <button
      className={`info-btn nodrag${info ? ' has-info' : ''}`}
      title={info ? 'Edit info' : 'Add info'}
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
  openInfo: () => {},
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
  chapterCount: 1,
});

function LaneNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeLane, addLaneAfter } = useContext(BoardActions);
  // The last lane of a Chapter cannot be removed.
  const canRemove = useStore((s) => {
    const parent = s.nodeLookup.get(id)?.parentId;
    let count = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'lane' && n.parentId === parent) count++;
    });
    return count > 1;
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
        <button
          className="lane-add"
          title="Add a lane below"
          aria-label="Add a lane below"
          onClick={() => addLaneAfter(id)}
        />
      </div>
    </div>
  );
}

// Static mock for now: the buttons do nothing and nothing is saved (R3.11).
const SCENARIO_ITEMS = [
  { text: 'Adding a table', failed: false },
  { text: 'table name is unique', failed: true },
];

const Icon = ({ children }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    {children}
  </svg>
);

function ScenariosCard({ selected }) {
  return (
    <div className={`sticky scenarios ${selected ? 'selected' : ''}`}>
      <div className="scenarios-head">
        <span>Scenarios</span>
        <Icon>
          <path d="M1 8C3 4.5 5.5 3 8 3s5 1.5 7 5c-2 3.5-4.5 5-7 5S3 11.5 1 8Z" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </Icon>
      </div>
      <div className="scenarios-list">
        {SCENARIO_ITEMS.map((item, i) => (
          <div key={item.text} className={`scenario-item${item.failed ? ' failed' : ''}`}>
            <span className="scenario-no">{i + 1}.</span>
            <span className="scenario-text">{item.text}</span>
            {i === 0 && (
              <button className="scenario-icon nodrag" title="Move down" aria-label="Move down">
                <Icon>
                  <path d="M8 2V14M3 9l5 5 5-5" />
                </Icon>
              </button>
            )}
            <button className="scenario-icon nodrag" title="Copy" aria-label="Copy">
              <Icon>
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1H3.5A1.5 1.5 0 0 0 2 2.5v6A1.5 1.5 0 0 0 3.5 10H5" />
              </Icon>
            </button>
            <button className="scenario-icon nodrag" title="Remove" aria-label="Remove">
              <Icon>
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </Icon>
            </button>
          </div>
        ))}
      </div>
      <div className="scenarios-foot">
        <button className="scenario-btn nodrag">+ Add</button>
        <button className="scenario-btn nodrag">
          <Icon>
            <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1H13v11H4.5A1.5 1.5 0 0 0 3 13.5v-11ZM3 13.5A1.5 1.5 0 0 0 4.5 15H13v-3" />
          </Icon>
          + Storyline
        </button>
        <span className="scenario-count">{SCENARIO_ITEMS.length}</span>
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
  const { titleEditId, clearTitleEdit } = useContext(BoardActions);

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

  if (data.kind === 'scenarios') return <ScenariosCard selected={selected} />;

  return (
    <div
      className={`sticky ${data.kind} ${selected ? 'selected' : ''}`}
    >
      <Handle id="top-in" type="target" position={Position.Top} />
      <Handle id="top-out" type="source" position={Position.Top} />
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
    // Cannot be narrower than the elements it holds.
    const needed = (membersOf(base).get(id) ?? []).reduce(
      (m, n) => Math.max(m, n.position.x + stickyW(n) + SLICE_PADDING - me.position.x),
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
      className="slice"
      style={{ width: data.width, height: SLICE_HEADER + lanesHeight }}
    >
      <div
        className="slice-header nodrag nopan"
        title="Click to select its top Cell, drag to move the Chapter, double-click to rename"
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY };
          startChapterDrag(e);
        }}
        onClick={selectTopCell}
        onDoubleClick={() => setEditing(true)}
      >
        <div className="slice-title">
          <InfoButton id={id} info={data.info} />
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
              title="Delete this slice"
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
        title="Drag to resize"
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
  const { removeChapter, compactChapter, activeId, chapterCount } = useContext(BoardActions);
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
          <span className="nodrag" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>
            {data.name}
          </span>
        )}
      </div>
      <div
        className={`chapter-handle nopan ${activeId === id ? 'active' : ''}`}
        title="Drag to move the Chapter"
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
        {chapterCount > 1 && (
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

const makeChapter = (id, x, y, name, context, info) => ({
  id,
  type: 'chapter',
  position: { x, y },
  data: { name, context, ...(info ? { info } : {}) },
  ...chapterDefaults,
});

const makeSlice = (id, x, width, name, chapterId, info) => ({
  id,
  type: 'slice',
  position: { x, y: SLICE_Y },
  data: { name, width, ...(info ? { info } : {}) },
  parentId: chapterId,
  draggable: false,
  selectable: false,
  zIndex: -1,
  // Only the header takes pointer events, so notes under the band stay usable.
  style: { pointerEvents: 'none' },
});

const makeLane = (id, chapterId, label, y, color, width, info) => ({
  id,
  type: 'lane',
  position: { x: 0, y },
  parentId: chapterId,
  data: { label, height: LANE_HEIGHT, width, color, ...(info ? { info } : {}) },
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
  focusable: false,
  zIndex: -1,
  // Clicks pass through to the canvas (selects the Cell) and to the arrows above the lane.
  style: { pointerEvents: 'none' },
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

// The starting board (R1.4): one empty Chapter in the Default Context, with fresh ids.
function makeEmptyBoard() {
  const used = new Set();
  const id = () => uniqueId(used);
  const chapterId = id();
  const contexts = [{ id: id(), name: 'Default' }];
  const nodes = normalize([
    makeChapter(chapterId, 0, 0, 'Chapter 1', contexts[0].id),
    ...LANES.map((l) => makeLane(id(), chapterId, l.label, l.y, 'none', LANE_WIDTH)),
    makeSlice(id(), LABEL_ZONE, DEFAULT_SLICE_WIDTH, 'New Slice', chapterId),
  ]);
  return { nodes, edges: [], contexts };
}

const STORAGE_KEY = 'event-model-board';

const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The export file (section 6): the one complete description of the board. Values that follow
// from the layout rules are left out. Field order is fixed so the same board always gives
// the same text.
function serialize(nodes, edges, contexts) {
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
          ...(l.data.info ? { info: l.data.info } : {}),
          color: l.data.color,
        })),
        slices: chapterSlices.map((sl) => ({
          id: sl.id,
          name: sl.data.name,
          ...(sl.data.info ? { info: sl.data.info } : {}),
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
  return {
    format: 'event-model',
    version: 1,
    contexts: contexts.map((c) => ({ id: c.id, name: c.name })),
    chapters,
  };
}

const boardText = (nodes, edges, contexts) =>
  JSON.stringify(serialize(nodes, edges, contexts), null, 2);

const ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasKey = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

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
  object(data, ['format', 'version', 'contexts', 'chapters'], '');
  if (data.format !== 'event-model') fail('format', 'must be "event-model"');
  if (data.version !== 1) fail('version', 'must be 1');
  list(data.contexts, 'contexts', true);
  list(data.chapters, 'chapters', true);

  const kindOf = new Map(); // id -> context | chapter | lane | slice | element
  const claim = (id, kind, path) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      fail(path, 'must be a text of at least 6 letters, digits, "-" or "_"');
    }
    if (kindOf.has(id)) fail(path, `duplicate id "${id}"`);
    kindOf.set(id, kind);
  };
  const links = []; // connectsTo lists to check once every id is known
  const unconnectable = new Set(); // ids of Scenarios elements
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
    c.lanes.forEach((l, li) => {
      const lp = `${cp}.lanes[${li}]`;
      object(l, ['id', 'name', 'color'], lp, ['info']);
      claim(l.id, 'lane', at(lp, 'id'));
      name(l.name, at(lp, 'name'));
      optionalInfo(l, lp);
      if (!LANE_COLORS.includes(l.color)) {
        fail(at(lp, 'color'), `must be one of ${LANE_COLORS.join(', ')}`);
      }
      laneY.set(l.id, li * LANE_HEIGHT);
      nodes.push(makeLane(l.id, c.id, l.name, li * LANE_HEIGHT, l.color, LANE_WIDTH, l.info));
    });

    let cursor = SLICE_MIN_X;
    c.slices.forEach((sl, si) => {
      const sp = `${cp}.slices[${si}]`;
      object(sl, ['id', 'name', 'width', 'elements'], sp, ['info']);
      claim(sl.id, 'slice', at(sp, 'id'));
      name(sl.name, at(sp, 'name'));
      optionalInfo(sl, sp);
      number(sl.width, at(sp, 'width'));
      if (sl.width < SLICE_MIN_WIDTH) fail(at(sp, 'width'), `must be at least ${SLICE_MIN_WIDTH}`);
      list(sl.elements, at(sp, 'elements'));
      const width = sl.width;
      nodes.push(makeSlice(sl.id, cursor, width, sl.name, c.id, sl.info));

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
        const w = kindW(el.type);
        if (el.x + w + SLICE_PADDING > sl.width) {
          fail(
            at(ep, 'x'),
            `the element (x ${el.x}, width ${w}) does not fit in the slice with ${SLICE_PADDING}px margins (width ${sl.width})`
          );
        }
        list(el.connectsTo, at(ep, 'connectsTo'));
        if (el.type === 'scenarios') unconnectable.add(el.id);
        links.push({ owner: el.id, kind: 'element', path: at(ep, 'connectsTo'), ids: el.connectsTo });
        nodes.push({
          id: el.id,
          type: 'sticky',
          parentId: c.id,
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
      if (unconnectable.has(owner) || unconnectable.has(t)) fail(p, 'a scenarios element cannot be connected');
      if (seen.has(t)) fail(p, `id "${t}" is listed twice`);
      seen.add(t);
      edges.push(makeEdge(owner, t, kind === 'chapter'));
    });
  }
  return { nodes: normalize(nodes), edges, contexts };
}

function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseBoard(text);
  } catch {
    // missing, corrupt or unavailable storage: the starting board is shown
  }
  return null;
}

// Where a new element goes in a Cell (a lane crossed with a slice): the first spot from
// the left, inside the slice's margins, that does not overlap an element already in the
// Cell. When the Cell is full it goes after the last element and the slice has to grow:
// `sliceWidth` is the width the slice needs (the current width when nothing changes).
function spotInCell(nodes, lane, slice, kind) {
  const w = kindW(kind);
  const inCell = (membersOf(nodes).get(slice.id) ?? []).filter((n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
  if (!inCell.length) {
    // Empty Cell: centred in the slice, which grows first if it is too narrow.
    const width = Math.max(slice.data.width, snapUp(w + 2 * SLICE_PADDING));
    const x = slice.position.x + Math.floor((width - w) / 2);
    return { x, y: lane.position.y + 40, sliceWidth: width, empty: true };
  }
  const left = slice.position.x + SLICE_PADDING;
  const lastFit = slice.position.x + slice.data.width - SLICE_PADDING - w;
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
  const need = snapUp(x + w + SLICE_PADDING - slice.position.x);
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
    const readModel = below('readmodel');
    if (readModel) pairs.push([readModel.id, node.id]);
  }
  if (kind === 'readmodel') {
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
    const used = new Set([...getNodes().map((n) => n.id), ...contexts.map((c) => c.id)]);
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
  const [helpOpen, setHelpOpen] = useState(false);
  // The element whose title is to be edited (asked for by the Enter hotkey).
  const [titleEditId, setTitleEditId] = useState(null);
  const infoNode = nodes.find((n) => n.id === infoId);
  const saveInfo = (text) => {
    const info = text.trim() ? text : '';
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== infoId) return n;
        const { info: _old, ...rest } = n.data;
        return { ...n, data: info ? { ...rest, info } : rest };
      })
    );
    setInfoId(null);
  };
  const focusChapter = (node) =>
    setActiveId(node.type === 'chapter' ? node.id : node.parentId ?? null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, boardText(nodes, edges, contexts));
    } catch {
      // ignore unavailable storage
    }
  }, [nodes, edges, contexts]);

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
    const key = keyOf(nodes, edges, contexts);
    if (!present.current) {
      present.current = { nodes, edges, contexts, key };
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
    present.current = { nodes, edges, contexts, key };
  }, [nodes, edges, contexts, tick]);

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
      setContexts(snap.contexts);
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
        silentAt.current = performance.now();
        setNodes((ns) => centerStickies(settleStickies(ns)));
      }
    },
    [onNodesChange, getNodes, setNodes]
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
    if (top) setSelectedCell({ chapterId, laneId: top.id, sliceId });
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

  const addLane = () => {
    if (!activeChapterId) return;
    const [id] = newIds();
    setNodes((ns) => {
      const ls = lanesOf(ns, activeChapterId);
      const y = ls.reduce((sum, l) => sum + l.data.height, 0);
      const width = ls[0]?.data.width ?? LANE_WIDTH;
      return layered([...ns, makeLane(id, activeChapterId, 'New Lane', y, 'none', width)]);
    });
  };

  // Inserts a lane right below `laneId`; the lanes below it and their elements move down.
  const addLaneAfter = (laneId) => {
    const [id] = newIds();
    setNodes((ns) => {
      const lane = ns.find((n) => n.id === laneId);
      if (!lane) return ns;
      const below = lane.position.y + lane.data.height;
      const shifted = ns.map((n) =>
        n.parentId === lane.parentId &&
        (n.type === 'lane' || n.type === 'sticky') &&
        n.position.y >= below
          ? { ...n, position: { ...n.position, y: n.position.y + LANE_HEIGHT } }
          : n
      );
      return layered([
        ...shifted,
        makeLane(id, lane.parentId, 'New Lane', below, 'none', lane.data.width),
      ]);
    });
    setActiveId(nodes.find((n) => n.id === laneId)?.parentId ?? null);
  };

  const removeLane = useCallback(
    (laneId) => {
      const lane = nodes.find((n) => n.id === laneId);
      if (!lane) return;
      const chapterId = lane.parentId;
      if (lanesOf(nodes, chapterId).length <= 1) return;
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
        ...LANES.map((l, i) => makeLane(laneIds[i], id, l.label, l.y, 'none', width)),
        makeSlice(sliceId, SLICE_MIN_X, DEFAULT_SLICE_WIDTH, 'New Slice', id),
      ])
    );
    setActiveId(id);
  };

  const removeChapter = useCallback(
    (chapterId) => {
      if (chaptersOf(nodes).length <= 1) return;
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
  // the default width. If no Cell of a slice holds more than one element, every element is
  // centred horizontally first; otherwise the group keeps its layout and is centred as a unit.
  // Later slices move left.
  const compactChapter = useCallback(
    (chapterId) => {
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
          const els = members.get(sl.id) ?? [];
          if (!els.length) {
            widths.set(sl.id, DEFAULT_SLICE_WIDTH);
            continue;
          }
          const w = stickyW;
          const perCell = new Map();
          for (const n of els) perCell.set(laneIdOf(n), (perCell.get(laneIdOf(n)) ?? 0) + 1);
          if ([...perCell.values()].every((c) => c === 1)) {
            const width = Math.max(SLICE_MIN_WIDTH, snapUp(Math.max(...els.map(w)) + 2 * SLICE_PADDING));
            widths.set(sl.id, width);
            for (const n of els) {
              shifts.set(n.id, Math.floor((width - w(n)) / 2) - (n.position.x - sl.position.x));
            }
            continue;
          }
          const left = Math.min(...els.map((n) => n.position.x));
          const right = Math.max(...els.map((n) => n.position.x + w(n)));
          const width = Math.max(SLICE_MIN_WIDTH, snapUp(right - left + 2 * SLICE_PADDING));
          const dx = Math.floor((width - (right - left)) / 2) - (left - sl.position.x);
          widths.set(sl.id, width);
          els.forEach((n) => shifts.set(n.id, dx));
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
      contexts,
      setChapterContext,
      addContext,
      renameContext,
      removeContext,
      activate: setActiveId,
      openInfo: setInfoId,
      titleEditId,
      clearTitleEdit: () => setTitleEditId(null),
      clearCell: () => setSelectedCell(null),
      addSliceAfter,
      removeSlice,
      selectCell: (cell) => {
        setSelectedCell(cell);
        setActiveId(cell.chapterId);
      },
      addLaneAfter,
      removeLane,
      removeChapter,
      compactChapter,
      activeId: activeChapterId,
      chapterCount: chapters.length,
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
    if (!lane || !slice) return;
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
      pos = { x: Math.max(slice.position.x + SLICE_PADDING, x), y: lane.position.y + 40 };
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
            data: { kind, title: '' },
          },
        ],
        only
      ),
      only
    );
    setNodes(next);
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
    if (!inCell.length) {
      removeSlice(slice.id, true);
      return;
    }
    if (!window.confirm(`Delete the ${inCell.length} element(s) in this Cell?`)) return;
    const gone = new Set(inCell.map((n) => n.id));
    setNodes(ns.filter((n) => !gone.has(n.id)));
    setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
  };

  cellKeys.current = (e) => {
    if (!selectedCell || infoId || helpOpen) return;
    // '+' needs Shift on most layouts, so Shift is allowed for it.
    if (e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && e.key !== '+')) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === '+') {
      e.preventDefault();
      addSliceAfter(selectedCell.sliceId);
      return;
    }
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (step) {
      e.preventDefault();
      const ns = getNodes();
      const lanes = lanesOf(ns, selectedCell.chapterId);
      const cols = slices(ns, selectedCell.chapterId);
      const row = lanes.findIndex((l) => l.id === selectedCell.laneId) + step[0];
      const col = cols.findIndex((s) => s.id === selectedCell.sliceId) + step[1];
      if (lanes[row] && cols[col]) {
        setSelectedCell({ ...selectedCell, laneId: lanes[row].id, sliceId: cols[col].id });
      }
      return;
    }
    const kind = CELL_ADD_KEYS[e.key.toLowerCase()];
    if (kind) {
      e.preventDefault();
      addSticky(kind);
    } else if (e.key === 'Enter' && t.tagName !== 'BUTTON') {
      const ns = getNodes();
      const lane = ns.find((n) => n.id === selectedCell.laneId);
      const first = (membersOf(ns).get(selectedCell.sliceId) ?? [])
        .filter((n) => {
          const mid = n.position.y + stickyH(n) / 2;
          return n.data.kind !== 'scenarios' && lane && mid >= lane.position.y && mid < lane.position.y + lane.data.height;
        })
        .sort((a, b) => a.position.x - b.position.x)[0];
      if (first) {
        e.preventDefault();
        setTitleEditId(first.id);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeCellElements(selectedCell);
    } else if (e.key === 'Escape') {
      setSelectedCell(null);
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
      {helpOpen && <HotkeysDialog onClose={() => setHelpOpen(false)} />}
      {infoNode && (
        <InfoDialog
          key={infoNode.id}
          title={`${infoNode.type[0].toUpperCase()}${infoNode.type.slice(1)} — ${infoNode.data.name ?? infoNode.data.label}`}
          initial={infoNode.data.info ?? ''}
          onSave={saveInfo}
          onCancel={() => setInfoId(null)}
        />
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
