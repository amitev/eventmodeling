import { useMemo } from 'react';
import { renderMarkdown } from './InfoDialog.jsx';

// The card of a Notes element: its Markdown text, rendered. Editing opens the Markdown editor;
// the eye opens it in read mode.
export function NotesCard({ id, data, selected, onEdit, onRead }) {
  const html = useMemo(() => renderMarkdown(data.markdown ?? ''), [data.markdown]);
  return (
    <div
      className={`sticky notes ${selected ? 'selected' : ''}`}
      title="Double-click or Enter to edit the notes"
      onDoubleClick={() => onEdit(id)}
    >
      <div className="notes-head">
        <span>Notes</span>
        <button
          className="notes-eye nodrag"
          title="Read the notes"
          aria-label="Read the notes"
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => onRead(id)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 8C3 4.5 5.5 3 8 3s5 1.5 7 5c-2 3.5-4.5 5-7 5S3 11.5 1 8Z" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
      {data.markdown ? (
        <div className="notes-body nowheel" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="notes-body notes-empty">No notes yet</div>
      )}
    </div>
  );
}
