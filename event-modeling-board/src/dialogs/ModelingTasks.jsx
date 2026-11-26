import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RobotIcon } from '../AgentIcons.jsx';
import { MarkdownEditor, renderMarkdown } from './InfoDialog.jsx';
import { useBackdropClose, useBelowHeader, useModalFocus, useOutsideClose } from './popup.js';

const STATUS = { queued: 'Queued', running: 'In progress', done: 'Done', failed: 'Failed' };
const STATUS_ICON = {
  queued: <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  running: <path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  done: <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  failed: <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
};

function TaskStatusIcon({ status }) {
  const label = STATUS[status] ?? status;
  return (
    <span className={`task-status-icon ${status}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">{STATUS_ICON[status]}</svg>
    </span>
  );
}

function ModelingAgentSelect({ agents, selected, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const options = menu.current?.querySelectorAll('[role="menuitemradio"]');
    const index = agents.findIndex((agent) => agent.id === selected?.id);
    options?.[Math.max(0, index)]?.focus();
  }, [open, agents, selected?.id]);
  const focusOption = (index) => {
    const options = menu.current?.querySelectorAll('[role="menuitemradio"]');
    options?.[(index + agents.length) % agents.length]?.focus();
  };
  return (
    <div
      ref={root}
      className="modeling-task-selector"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        const options = menu.current?.querySelectorAll('[role="menuitemradio"]');
        const current = Array.from(options ?? []).indexOf(document.activeElement);
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!open) setOpen(true);
          else focusOption((current < 0 ? Math.max(0, agents.findIndex((agent) => agent.id === selected?.id)) : current) + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (open && event.key === 'Home') {
          event.preventDefault();
          focusOption(0);
        } else if (open && event.key === 'End') {
          event.preventDefault();
          focusOption(agents.length - 1);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="modeling-task-select"
        aria-label="Modeling agent"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {selected ? (
          <>
            <RobotIcon name={selected.name} />
            <span>{selected.name} ({selected.model})</span>
          </>
        ) : <span>Choose a modeling agent</span>}
        <svg className="modeling-task-chevron" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m3 6 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div ref={menu} id={id} className="modeling-task-agent-menu" role="menu" aria-label="Modeling agents">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              role="menuitemradio"
              aria-checked={selected?.id === agent.id}
              onClick={() => {
                onSelect(agent.id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <RobotIcon name={agent.name} />
              <span>{agent.name} ({agent.model})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModelingTaskComposer({ target, agents, onSend, onClose }) {
  const popup = useModalFocus();
  const backdrop = useBackdropClose(onClose);
  const [prompt, setPrompt] = useState('');
  const [agentId, setAgentId] = useState('');
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const modelers = (agents ?? []).filter((agent) => agent.agentType === 'modeler');
  const soleModelerId = modelers.length === 1 ? modelers[0].id : null;
  useEffect(() => {
    if (soleModelerId) setAgentId(soleModelerId);
  }, [soleModelerId]);
  const selected = modelers.find((agent) => agent.id === agentId);
  const send = async () => {
    if (inFlight.current || !prompt.trim() || !selected) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      await onSend({ scope: target.scope, prompt, agentId });
      onClose();
    } catch (err) {
      setError(`Could not send task: ${err.message}`);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div
        ref={popup} className="info-dialog modeling-task-composer" role="dialog" aria-modal="true"
        aria-label="Agent Task" tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) send();
          }
        }}
      >
        <div className="info-title">Agent Task <small>Enter or Ctrl+S submits - Shift+Enter new line</small></div>
        <div className="modeling-task-target">{target.label}</div>
        <div className="modeling-task-agent">
          {modelers.length ? (
            <ModelingAgentSelect agents={modelers} selected={selected} onSelect={setAgentId} disabled={sending} />
          ) : (
            <div className="modeling-task-empty">{agents === null ? 'Agents unavailable' : 'No modeling agent connected'}</div>
          )}
        </div>
        {selected?.harness === 'copilot' && (
          <div className="modeling-task-target">Copilot currently has file tools only; tasks requiring model API access will report failure.</div>
        )}
        <div className="modeling-task-editor">
          <MarkdownEditor
            text={prompt} onChange={setPrompt} active={!sending}
            label="Agent task Markdown" disabled={sending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey &&
                  !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!e.repeat) send();
              }
            }}
          />
        </div>
        {error && <div className="tasks-error" role="alert">{error}</div>}
        <div className="info-actions">
          <button type="button" className="primary" disabled={sending || !prompt.trim() || !selected} onClick={send}>
            {sending ? 'Submitting...' : 'Submit'}
          </button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>, document.body,
  );
}

export function ModelingTasksDialog({ queue, buttonRef, headerRef, onClose }) {
  const popup = useModalFocus();
  useOutsideClose(popup, onClose, buttonRef);
  const top = useBelowHeader(headerRef);
  return createPortal(
    <div
      ref={popup} className="tasks-dialog modeling-tasks" style={{ top, height: `calc(100vh - ${top + 20}px)` }}
      tabIndex={-1} role="dialog" aria-modal="false" aria-label="Agent Tasks"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (!e.repeat && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 't')) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="info-title">Agent Tasks</div>
      {queue.error && <div className="tasks-error" role="alert">{queue.error}</div>}
      <div className="tasks-body">
        {queue.tasks.length ? (
          <ul className="tasks-list">
            {queue.tasks.map((task) => (
              <li key={task.id}>
                <details className="modeling-task-item" open={task.status !== 'done' && task.status !== 'failed'}>
                  <summary className="task-heading">
                    <TaskStatusIcon status={task.status} />
                    <strong>{task.label}</strong>
                  </summary>
                  <div className="task-location">{task.scope.type} - {task.modeler}</div>
                  <div className="modeling-task-prompt">
                    <strong>Task prompt</strong>
                    <div className="info-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(task.prompt) }} />
                  </div>
                  {task.response && (
                    <div className="modeling-task-response">
                      <strong>Agent response</strong>
                      <div className="info-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(task.response) }} />
                    </div>
                  )}
                  {task.error && task.error !== task.response && <div className="tasks-error" role="alert">{task.error}</div>}
                </details>
              </li>
            ))}
          </ul>
        ) : <p>No agent tasks.</p>}
      </div>
      <div className="info-actions"><button type="button" onClick={onClose}>Close</button></div>
    </div>, document.body,
  );
}
