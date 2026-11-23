import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RobotIcon } from '../AgentIcons.jsx';
import { useBelowHeader, useModalFocus, useOutsideClose } from './popup.js';

const STATUS = { queued: 'Queued', running: 'In progress', done: 'Done', failed: 'Failed', blocked: 'Blocked' };
const buildable = (task) => !task || task.status === 'done' || task.status === 'failed';
const removable = (task) => task?.status === 'queued' || task?.status === 'failed';

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return 'N/A';
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function formatCost(cost, currency) {
  if (!cost && cost !== 0) return 'N/A';
  const prefix = currency === 'USD' ? '$' : '';
  return `${prefix}${cost.toFixed(2)}`;
}

// Menu of builders with their robot heads. Fixed position escapes the dialog's overflow clipping;
// .tasks-dialog must not have a transform, or it becomes the menu's containing block.
function BuilderMenu({ builders, label, text, disabled, onBuild }) {
  const [at, setAt] = useState(null);
  const root = useRef(null);
  useEffect(() => {
    if (!at) return undefined;
    const close = (e) => {
      if (!root.current?.contains(e.target)) setAt(null);
    };
    document.addEventListener('pointerdown', close, true);
    const onScroll = () => setAt(null);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [at]);
  return (
    <span
      ref={root}
      className="cockpit-menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && at) {
          e.stopPropagation();
          setAt(null);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!at}
        disabled={disabled}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setAt((open) => (open ? null : { left: box.left, top: box.bottom + 2 }));
        }}
      >
        {`${text} with...`}
      </button>
      {at && (
        <ul className="cockpit-menu-list" role="menu" style={at}>
          {builders.map((name) => (
            <li key={name}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAt(null);
                  onBuild(name);
                }}
              >
                <span className="cockpit-agent"><RobotIcon name={name} /></span>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

// Build for the only builder, or pick one of several; disabled without builders.
function BuildControl({ builders, label, count, onBuild }) {
  const text = `Build (${count})`;
  if (builders.length > 1) {
    return <BuilderMenu builders={builders} label={label} text={text} disabled={count === 0} onBuild={onBuild} />;
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!builders.length || count === 0}
      title={builders.length ? `Build with ${builders[0]}` : 'No builder agent connected'}
      onClick={() => onBuild(builders[0])}
    >
      {text}
    </button>
  );
}

function SliceTile({ slice, task, selected, onSelect, onRemove }) {
  const status = task?.status ?? 'none';
  return (
    <li
      className={`cockpit-slice ${status}${selected ? ' selected' : ''}`}
      aria-selected={selected}
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault(); // no text selection on Shift+click
      }}
      onClick={(e) => {
        if (!e.target.closest('button, select')) onSelect(e);
      }}
    >
      <div className="cockpit-slice-name">
        {task && <span className="cockpit-agent" title={task.builder}><RobotIcon name={task.builder} /></span>}
        <strong>{slice.name}</strong>
      </div>
      <div className="cockpit-slice-status">{task ? STATUS[status] : 'Not queued'}</div>
      <div className="cockpit-slice-actions">
        {removable(task) && <button type="button" onClick={() => onRemove([slice])}>Remove</button>}
      </div>
    </li>
  );
}

// chapters: [{ id, contextId, title, slices: [{ id, name }] }] in board order.
export function AgentCockpit({ chapters, queue, buttonRef, headerRef, onClose }) {
  const popup = useModalFocus();
  useOutsideClose(popup, onClose, buttonRef);
  const top = useBelowHeader(headerRef);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const anchor = useRef(null); // { chapterId, sliceId } of the last click without Shift
  const tasks = new Map(queue.tasks.map((task) => [task.sliceId, task]));
  const allSlices = chapters.flatMap(({ id: chapterId, contextId, slices }) =>
    slices.map((slice) => ({ ...slice, chapterId, contextId }))); // cockpit order = build order (R14.9)
  const selection = allSlices.filter((slice) => picked.has(slice.id));
  const toBuild = selection.filter((slice) => buildable(tasks.get(slice.id)));
  const toRemove = selection.filter((slice) => removable(tasks.get(slice.id)));

  // Build log: show when exactly one slice with a completed build is selected
  const selectedCompletedSlice = selection.length === 1 && selection[0] && ['done', 'failed', 'blocked'].includes(tasks.get(selection[0].id)?.status) ? selection[0] : null;
  const selectedCompletedTask = selectedCompletedSlice ? tasks.get(selectedCompletedSlice.id) : null;

  const select = (chapter, slice, e) => {
    const ids = chapter.slices.map((s) => s.id);
    if (e.shiftKey && anchor.current?.chapterId === chapter.id && ids.includes(anchor.current.sliceId)) {
      const [from, to] = [ids.indexOf(anchor.current.sliceId), ids.indexOf(slice.id)].sort((a, b) => a - b);
      setPicked((current) => new Set([...current, ...ids.slice(from, to + 1)]));
      return;
    }
    anchor.current = { chapterId: chapter.id, sliceId: slice.id };
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(slice.id)) next.add(slice.id);
      return next;
    });
  };

  // Runs one request per slice; reports the failed ones together.
  const each = async (verb, list, action) => {
    setError('');
    const failures = [];
    for (const slice of list) {
      try {
        await action(slice);
      } catch (err) {
        failures.push(`"${slice.name}": ${err.message}`);
      }
    }
    if (failures.length) setError(`Could not ${verb} ${failures.join('; ')}`);
  };
  const build = async (list, builder) => {
    await each('build', list, ({ contextId, chapterId, id, name }) =>
      queue.add({ contextId, chapterId, sliceId: id, sliceName: name, builder }));
    setPicked(new Set());
  };
  const remove = (list) => each('remove', list, (slice) => queue.remove(tasks.get(slice.id).id));

  return createPortal(
    <div
      ref={popup}
      tabIndex={-1}
      className="tasks-dialog agent-cockpit"
      style={{ top, height: `calc(100vh - ${top + 20}px)` }}
      role="dialog"
      aria-modal="false"
      aria-label="Agent cockpit"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="cockpit-wrapper">
        <div className="cockpit-main">
          <div className="info-title tasks-title"><span>Agent cockpit</span></div>
          <div className="cockpit-bulk">
            <BuildControl builders={queue.builders} label="Build selected slices" count={toBuild.length} onBuild={(builder) => build(toBuild, builder)} />
            <button type="button" disabled={!toRemove.length} onClick={() => remove(toRemove)}>{`Remove (${toRemove.length})`}</button>
            <button type="button" disabled={!selection.length} onClick={() => setPicked(new Set())}>Clear</button>
            <span className="cockpit-count">{selection.length} selected</span>
          </div>
          {error && <div className="tasks-error" role="alert">{error}</div>}
          <div className="tasks-body">
            {chapters.length ? chapters.map((chapter) => (
              <section key={chapter.id} className="cockpit-chapter">
                <h3>{chapter.title}</h3>
                <ul className="cockpit-slices" aria-multiselectable="true">
                  {chapter.slices.map((slice) => (
                    <SliceTile
                      key={slice.id}
                      slice={slice}
                      task={tasks.get(slice.id)}
                      selected={picked.has(slice.id)}
                      onSelect={(e) => select(chapter, slice, e)}
                      onRemove={remove}
                    />
                  ))}
                </ul>
              </section>
            )) : <p>No Chapters.</p>}
          </div>
        </div>
        {selectedCompletedTask && (
          <div className="cockpit-build-log">
            <h3>Build log</h3>
            <div className="build-log-info">
              <div>Duration: {formatDuration(selectedCompletedTask.startedAt, selectedCompletedTask.completedAt)}</div>
              <div>Cost: {formatCost(selectedCompletedTask.cost, selectedCompletedTask.currency)}</div>
            </div>
            {(selectedCompletedTask.status === 'failed' || selectedCompletedTask.status === 'blocked') && (
              <div className="build-log-content">{selectedCompletedTask.error}</div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
