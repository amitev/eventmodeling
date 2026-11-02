import { useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, useStore } from '@xyflow/react';
import { LANE_WIDTH } from '../model/model.js';
import { cleanName, filterNameInput } from '../model/names.js';
import { BoardActions } from '../state/BoardActions.js';
import { InfoButton } from './parts.jsx';

const NEW_CONTEXT = '__new-context__'; // value of the "+ New context..." dropdown entry

// A Chapter node is a transparent box over its lanes, with a large title centred above the
// slices (double-click to rename), a small handle above it (drag it to move the Chapter) and
// two connection ports: incoming on the left side, outgoing on the right side.
export function ChapterNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { removeChapter, compactChapter, openMovie, activeId } = useContext(BoardActions);
  const { contexts, setChapterContext, addContext, renameContext, removeContext } =
    useContext(BoardActions);
  const screenCount = useStore((s) => {
    let count = 0;
    s.nodeLookup.forEach((n) => {
      if (n.type === 'sticky' && n.parentId === id && n.data.kind === 'screen') count++;
    });
    return count;
  });
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
    const name = cleanName(value);
    if (!name) return; // an empty or unusable name keeps the old one
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
            onChange={(e) => filterNameInput(e.target)}
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
          title={screenCount ? 'Movie strip' : 'Movie strip (this Chapter has no Screen)'}
          aria-label="Movie strip"
          disabled={!screenCount}
          onClick={() => openMovie(id)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="0.8" y="1.5" width="8.4" height="7" rx="1" />
            <path d="M3.2 1.5V8.5M6.8 1.5V8.5M0.8 4H3.2M6.8 4H9.2M0.8 6H3.2M6.8 6H9.2" />
          </svg>
        </button>
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
