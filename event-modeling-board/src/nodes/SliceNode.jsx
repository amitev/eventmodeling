import { useContext, useEffect, useRef, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import {
  SLICE_HEADER,
  SLICE_MIN_X,
  snap,
  slices,
  lanesOf,
  setSliceWidth,
  minSliceWidth,
  layoutSlices,
  settleStickies,
  centerStickies,
  membersOf,
  sliceType,
  stickyH,
} from '../model/model.js';
import { cleanName, filterNameInput } from '../model/names.js';
import { HistoryContext } from '../state/history.js';
import { BoardActions } from '../state/BoardActions.js';
import { chapterMetadataOf, CopyContextButton, InfoButton, useChapterDrag, useHorizontalDrag } from './parts.jsx';

// A slice is a vertical band across all lanes: one end-to-end piece of behavior. It is not
// selectable; clicking its header selects the top Cell of the slice.
export function SliceNode({ id, data }) {
  const { setNodes, getNodes } = useReactFlow();
  const startDrag = useHorizontalDrag();
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const press = useRef(null);
  // The last slice of a Chapter cannot be deleted.
  const canRemove = useStore((s) => chapterMetadataOf(s, s.nodeLookup.get(id)?.parentId).sliceCount > 1);
  // The last slice of a Chapter has no right border: the Chapter outline is there.
  const isLast = useStore((s) => {
    const me = s.nodeLookup.get(id);
    return !me || me.position.x >= chapterMetadataOf(s, me.parentId).lastSliceX;
  });
  const lanesHeight = useStore((s) => chapterMetadataOf(s, s.nodeLookup.get(id)?.parentId).lanesHeight);

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

  const nameFromElements = () => {
    const ns = getNodes();
    const me = ns.find((n) => n.id === id);
    if (!me) return;
    const laneList = lanesOf(ns, me.parentId);
    const elements = membersOf(ns).get(id) ?? [];
    const type = sliceType(
      elements.map((n) => {
        const mid = n.position.y + stickyH(n) / 2;
        const lane = laneList.find(
          (l) => mid >= l.position.y && mid < l.position.y + l.data.height
        );
        return { kind: n.data.kind, lane: lane?.data.type };
      })
    );
    const sourceKind = {
      STATE_CHANGE: 'command',
      STATE_READ: 'read_model',
      AUTOMATION: 'processor',
      TRANSLATION: 'processor',
    }[type];
    if (!sourceKind) return;
    const sources = elements.filter((n) => n.data.kind === sourceKind);
    if (sources.length !== 1) return;
    const source = sources[0];
    const sourceName = source.data.copyOf
      ? ns.find((n) => n.id === source.data.copyOf)?.data.name
      : source.data.name;
    if (!sourceName || sourceName === data.name) return;
    update({ name: sourceName });
  };

  // Dragging a slice header moves the whole Chapter (R1.10); a slice is reordered with the grip
  // at the right end of its header, live (R5.8): the others shift as it passes them, with their
  // elements; the slice and its elements settle in the new place on release.
  const startChapterDrag = useChapterDrag(id, () => editing);
  const history = useContext(HistoryContext);
  const zoom = useStore((s) => s.transform[2]);
  const [lift, setLift] = useState(null); // while dragging: how far the header is from its place, in px
  const { addSliceAfter, removeSlice, selectCell, activate } = useContext(BoardActions);

  const startReorder = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const base = getNodes();
    const me = base.find((n) => n.id === id);
    if (!me) return;
    const ss = slices(base, me.parentId);
    if (ss.length < 2) return;
    const others = ss.filter((s) => s.id !== id);
    const centre = (s) => s.position.x + s.data.width / 2;
    const startX = e.clientX;
    let started = false;
    const move = (ev) => {
      if (!started) {
        if (Math.abs(ev.clientX - startX) < 4) return;
        started = true;
        history.begin();
        activate(me.parentId);
      }
      const dx = (ev.clientX - startX) / zoom;
      // Where it goes: after the other slices whose (original) centre is left of its centre.
      const index = others.filter((s) => centre(s) < centre(me) + dx).length;
      const order = [...others];
      order.splice(index, 0, me);
      const rank = new Map(order.map((s, i) => [s.id, i]));
      const placed = order.slice(0, index).reduce((sum, s) => sum + s.data.width, SLICE_MIN_X);
      setLift(dx - (placed - me.position.x));
      // The layout orders slices by position: give them their new ranks, it packs them.
      setNodes(
        layoutSlices(
          base.map((n) => (rank.has(n.id) ? { ...n, position: { ...n.position, x: rank.get(n.id) } } : n)),
          base
        )
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (started) {
        setLift(null);
        history.end();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

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
      className={`slice${isLast ? ' last' : ''}${data.flowEnd ? ' flow-end' : ''}${lift !== null ? ' dragging' : ''}`}
      style={{ width: data.width, height: SLICE_HEADER + lanesHeight, ...(lift !== null ? { transform: `translateX(${lift}px)` } : {}) }}
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
              onChange={(e) => filterNameInput(e.target)}
              onBlur={(e) => {
                setEditing(false);
                const name = cleanName(e.target.value);
                if (name) update({ name }); // an empty or unusable name keeps the old one
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
            className="slice-add slice-auto-name nodrag"
            title="Name from slice elements"
            aria-label="Name from slice elements"
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={nameFromElements}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1.5 8.5L7.2 2.8M6.3 1.7L7.4 2.8M7.7 1.1L8.9 2.3M7.8 3.2L8.9 4.3" />
            </svg>
          </button>
          <CopyContextButton sliceId={id} className="slice-add" />
          <button
            className={`slice-add nodrag${data.flowEnd ? ' active' : ''}`}
            title={data.flowEnd ? 'Flow end: remove the mark (Shift+E)' : 'Flow end: mark this slice as the end of a flow, e.g. to separate use cases in one Chapter without a new Chapter (Shift+E)'}
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
          <button
            className="slice-add slice-grip nodrag"
            title="Move the slice"
            aria-label="Move the slice"
            onPointerDown={startReorder}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="2" r="1" />
              <circle cx="7" cy="2" r="1" />
              <circle cx="3" cy="5" r="1" />
              <circle cx="7" cy="5" r="1" />
              <circle cx="3" cy="8" r="1" />
              <circle cx="7" cy="8" r="1" />
            </svg>
          </button>
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
