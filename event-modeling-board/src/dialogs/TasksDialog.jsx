import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBelowHeader, useModalFocus, useOutsideClose } from './popup.js';

function TaskText({ value, multiline = false, onSave, onCancel }) {
  const [editing, setEditing] = useState(false);
  const input = useRef(null);
  const finished = useRef(false);
  useLayoutEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const commit = (value) => {
    if (!finished.current && onSave(value)) {
      finished.current = true;
      setEditing(false);
    }
  };
  const Editor = multiline ? 'textarea' : 'input';
  const Display = multiline ? 'p' : 'strong';

  return editing ? (
    <Editor
      ref={input}
      className={`task-inline-input ${multiline ? 'task-description-input' : 'task-title-input'}`}
      aria-label={multiline ? 'Task description' : 'Task title'}
      defaultValue={value}
      rows={multiline ? 6 : undefined}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finished.current = true;
          setEditing(false);
          onCancel();
        }
      }}
    />
  ) : (
    <Display className={multiline ? `task-description${value ? '' : ' empty'}` : undefined} onDoubleClick={() => {
      finished.current = false;
      setEditing(true);
    }}>{value || 'Description'}</Display>
  );
}

export function TasksDialog({ contexts, chapters, contextId, buttonRef, headerRef, onSave, onDelete, onGoToChapter, onClose }) {
  const popup = useModalFocus();
  useOutsideClose(popup, onClose, buttonRef);
  const top = useBelowHeader(headerRef);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const context = contexts.find((c) => c.id === contextId);
  const chapterChoices = chapters.filter((chapter) => !contextId || chapter.data.context === contextId);
  const chapterGroups = contexts
    .map((context) => ({
      context,
      chapters: chapterChoices
        .filter((chapter) => chapter.data.context === context.id)
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
    }))
    .filter((group) => group.chapters.length)
    .sort((a, b) => a.context.name.localeCompare(b.context.name));
  const activeChapterFilter = chapterChoices.some((chapter) => `chapter:${chapter.id}` === chapterFilter)
    ? chapterFilter : '';
  const tasks = contexts
    .filter((c) => !contextId || c.id === contextId)
    .flatMap((c) => (c.tasks ?? []).map((task) => ({ context: c, task })))
    .filter(({ task }) => !activeChapterFilter || `chapter:${task.chapter}` === activeChapterFilter);
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
        <div className="info-title tasks-title">
          <span>Tasks - {context?.name ?? 'All contexts'}</span>
          <select
            aria-label="Filter tasks by Chapter"
            title="Filter tasks by Chapter"
            value={activeChapterFilter}
            onChange={(e) => setChapterFilter(e.target.value)}
          >
            <option value=""></option>
            {chapterGroups.map(({ context, chapters }) => (
              <optgroup key={context.id} label={context.name}>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={`chapter:${chapter.id}`}>{chapter.data.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
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
                  <option value=""></option>
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
                        <TaskText
                          value={task.title}
                          onSave={(title) => save(context.id, { ...task, title })}
                          onCancel={() => setError('')}
                        />
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
                        {context.name}{task.chapter && (
                          <>{' / '}
                          <button
                            type="button"
                            className="task-chapter-link"
                            title="Go to Chapter"
                            onClick={() => onGoToChapter(task.chapter)}
                          >
                            {chapterNames.get(task.chapter)}
                          </button>
                          </>
                        )}
                      </div>
                      <TaskText
                        value={task.description}
                        multiline
                        onSave={(description) => save(context.id, { ...task, description })}
                        onCancel={() => setError('')}
                      />
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
