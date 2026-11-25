import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownEditor, renderMarkdown } from './InfoDialog.jsx';
import { useBackdropClose, useBelowHeader, useModalFocus, useOutsideClose } from './popup.js';

const STATUS = { queued: 'Queued', running: 'In progress', done: 'Done', failed: 'Failed' };

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
          }
        }}
      >
        <div className="info-title">Agent Task <small>Enter sends - Shift+Enter new line</small></div>
        <div className="modeling-task-target">{target.label}</div>
        <label className="modeling-task-agent">
          Modeling agent
          <select aria-label="Modeling agent" value={selected?.id ?? ''} disabled={sending} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">{modelers.length ? 'Choose a modeling agent' : agents === null ? 'Agents unavailable' : 'No modeling agent connected'}</option>
            {modelers.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} ({agent.model})</option>)}
          </select>
        </label>
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
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={sending || !prompt.trim() || !selected} onClick={send}>
            {sending ? 'Sending...' : 'Send'}
          </button>
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
      ref={popup} className="tasks-dialog modeling-tasks" style={{ top, maxHeight: `calc(100vh - ${top + 8}px)` }}
      tabIndex={-1} role="dialog" aria-modal="false" aria-label="Agent Tasks"
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}
    >
      <div className="info-title">Agent Tasks</div>
      {queue.error && <div className="tasks-error" role="alert">{queue.error}</div>}
      <div className="tasks-body">
        {queue.tasks.length ? (
          <ul className="tasks-list">
            {queue.tasks.map((task) => (
              <li key={task.id}>
                <div className="task-heading"><strong>{task.label}</strong><span>{STATUS[task.status]}</span></div>
                <div className="task-location">{task.scope.type} - {task.modeler}</div>
                <details><summary>Task prompt</summary><div className="info-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(task.prompt) }} /></details>
                {task.response && (
                  <div className="modeling-task-response">
                    <strong>Agent response</strong>
                    <div className="info-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(task.response) }} />
                  </div>
                )}
                {task.error && task.error !== task.response && <div className="tasks-error" role="alert">{task.error}</div>}
              </li>
            ))}
          </ul>
        ) : <p>No agent tasks.</p>}
      </div>
      <div className="info-actions"><button type="button" onClick={onClose}>Close</button></div>
    </div>, document.body,
  );
}
