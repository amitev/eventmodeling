import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, useStore } from '@xyflow/react';
import { LANE_WIDTH, LABEL_ZONE, LANE_TYPES, LANE_COLORS, REQUIRED_LANE_TYPES, nextLaneTypes } from '../model/model.js';
import { BoardActions } from '../state/BoardActions.js';
import { InfoButton, useChapterDrag } from './parts.jsx';

export function LaneNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeLane, addLaneAfter, overview } = useContext(BoardActions);
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
  const [editAt, setEditAt] = useState(null); // where the horizontal name editor goes, in window pixels
  const [picking, setPicking] = useState(false);
  const ref = useRef(null);
  const colorRef = useRef(null);
  const inputRef = useRef(null);

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
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setEditAt({ left: r.left, top: r.top + r.height / 2 });
    setEditing(true);
  };

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
        className={`lane-header nodrag nopan${picking ? ' picking' : ''}`}
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
        {/* Edited in a horizontal input floating over the header: the label column is too narrow for it. */}
        <span
          ref={ref}
          className="lane-label"
          title={editing ? undefined : `${data.label === LANE_TYPES[data.type].label ? '' : `${data.label}, `}${LANE_TYPES[data.type].label} lane`}
          onDoubleClick={overview ? undefined : startEditing}
        >
          {data.label}
        </span>
        {editing &&
          createPortal(
            <input
              ref={inputRef}
              className="lane-name-input"
              style={{ left: editAt.left, top: editAt.top }}
              defaultValue={data.label}
              spellCheck={false}
              onBlur={(e) => rename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />,
            document.body
          )}
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
