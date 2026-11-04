import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { renderMarkdown } from '../dialogs/InfoDialog.jsx';
import { NOTE_COLORS } from '../model/model.js';

// The card of a Notes element: its Markdown text, rendered. Editing opens the Markdown editor;
// the View button (eye, hotkey V) opens it in read mode. Hovering the header shows the colour dots (R3.24).
export function NotesCard({ id, data, selected, width, onEdit, onRead }) {
  const { setNodes } = useReactFlow();
  const html = useMemo(() => renderMarkdown(data.markdown ?? ''), [data.markdown]);
  const setColor = (color) =>
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const { color: _old, ...rest } = n.data;
        return { ...n, data: color ? { ...rest, color } : rest };
      })
    );
  return (
    <div
      className={`sticky notes ${data.color ? `note-${data.color}` : ''} ${selected ? 'selected' : ''}`}
      style={{ width }}
      onDoubleClick={() => onEdit(id)}
    >
      <div className="notes-head">
        <span>Notes</span>
        <button
          className="notes-eye nodrag"
          title="View (V)"
          aria-label="View"
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => onRead(id)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 8C3 4.5 5.5 3 8 3s5 1.5 7 5c-2 3.5-4.5 5-7 5S3 11.5 1 8Z" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
        </button>
        <div className="notes-colors nodrag" onDoubleClick={(e) => e.stopPropagation()}>
          {[null, ...NOTE_COLORS].map((c) => (
            <button
              key={c ?? 'white'}
              className={`notes-dot dot-${c ?? 'white'}${(data.color ?? null) === c ? ' current' : ''}`}
              title={c ? `Colour: ${c}` : 'Colour: white'}
              aria-label={c ? `Colour ${c}` : 'Colour white'}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      {data.markdown ? (
        <div className="notes-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="notes-body notes-empty">No notes yet</div>
      )}
    </div>
  );
}
