import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus, useOutsideClose } from './popup.js';

export function TasksDialog({ contexts, chapters, contextId, buttonRef, headerRef, onSave, onDelete, onClose }) {
  const popup = useModalFocus();
  useOutsideClose(popup, onClose, buttonRef);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const position = () => setTop(header.getBoundingClientRect().bottom + 8);
    position();
    const observer = new ResizeObserver(position);
    observer.observe(header);
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
    };
  }, [headerRef]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const context = contexts.find((c) => c.id === contextId);
  const tasks = contexts
    .filter((c) => !contextId || c.id === contextId)
    .flatMap((c) => (c.tasks ?? []).map((task) => ({ context: c, task })));
  const chapterNames = new Map(chapters.map((chapter) => [chapter.id, chapter.data.name]));
  const edit = (value) => {
    setError('');
    setDraft(value);
  };
  const save = (context, task) => {
    try {
      onSave(context, task);
      setError('');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };
  const submit = (e) => {
    e.preventDefault();
    const { context, ...task } = draft;
    if (save(context, task)) setDraft(null);
  };

  return createPortal(
      <div
        ref={popup}
        tabIndex={-1}
        className="tasks-dialog"
        style={{ top, maxHeight: `calc(100vh - ${top + 8}px)` }}
        role="dialog"
        aria-modal="false"
        aria-label="Tasks"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="info-title">Tasks - {context?.name ?? 'All contexts'}</div>
        {error && <div className="tasks-error" role="alert">{error}</div>}
        {draft ? (
          <form className="tasks-form" onSubmit={submit}>
            <div className="tasks-body tasks-editor">
              <h3>{draft.id ? 'Edit task' : 'New task'}</h3>
              <label>
                Context
                <select
                  required
                  value={draft.context}
                  onChange={(e) => setDraft({ ...draft, context: e.target.value, chapter: null })}
                >
                  <option value="" disabled>Choose a Context</option>
                  {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                Chapter
                <select
                  value={draft.chapter ?? ''}
                  disabled={!draft.context}
                  onChange={(e) => setDraft({ ...draft, chapter: e.target.value || null })}
                >
                  <option value="">Context itself</option>
                  {chapters.filter((ch) => ch.data.context === draft.context).map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.data.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label>
                Description
                <textarea rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </label>
              <label>
                Status
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option>Open</option>
                  <option>Done</option>
                </select>
              </label>
            </div>
            <div className="info-actions">
              <button type="submit" className="primary">Save</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="tasks-body">
              {tasks.length ? (
                <ul className="tasks-list">
                  {tasks.map(({ context, task }) => (
                    <li key={task.id}>
                      <div className="task-heading">
                        <strong>{task.title}</strong>
                        <select
                          aria-label={`Status of ${task.title}`}
                          value={task.status}
                          onChange={(e) => save(context.id, { ...task, status: e.target.value })}
                        >
                          <option>Open</option>
                          <option>Done</option>
                        </select>
                        <button type="button" onClick={() => edit({ ...task, context: context.id })}>Edit</button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete task "${task.title}"?`)) onDelete(task.id);
                          }}
                        >Delete</button>
                      </div>
                      <div className="task-location">
                        {context.name} / {task.chapter ? chapterNames.get(task.chapter) : 'Context itself'}
                      </div>
                      {task.description && <p className="task-description">{task.description}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p>No tasks.</p>}
            </div>
            <div className="info-actions">
              <button type="button" onClick={() => edit({ id: null, context: contextId, title: '', description: '', status: 'Open', chapter: null })}>Add task</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>,
    document.body
  );
}
