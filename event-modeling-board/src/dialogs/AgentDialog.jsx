import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose, useModalFocus } from './popup.js';

export function AgentDialog({ agents, listError, onDisconnect, onClose }) {
  const modal = useModalFocus();
  const backdrop = useBackdropClose(onClose);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const recipient = agents?.find((agent) => agent.id === selectedId);
  const canSend = recipient && !listError && message.trim() && !sending;
  const nameCounts = new Map();
  for (const { name } of agents ?? []) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  let listStatus = '';
  if (!agents) listStatus = 'Loading connected CLIs...';
  else if (selectedId && !recipient) listStatus = 'CLI disconnected. Select a recipient again.';
  else if (!agents.length) listStatus = 'No CLIs connected.';

  async function send(event) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(recipient.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (response.status === 404) {
        setSelectedId('');
        onDisconnect(recipient.id);
        throw new Error('CLI disconnected. Select a recipient again.');
      }
      if (!response.ok) {
        const detail = response.headers.get('content-type')?.startsWith('application/json')
          ? await response.json() : null;
        throw new Error(detail?.error || `HTTP ${response.status}`);
      }
      setMessage('');
      setResult({ text: `Accepted for forwarding to ${recipient.name}.` });
    } catch (error) {
      setResult({ error: true, text: `Could not send: ${error.message}` });
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <form
        ref={modal}
        tabIndex={-1}
        className="agent-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Send to CLI"
        onSubmit={send}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !event.defaultPrevented) onClose();
        }}
      >
        <div className="info-title">Send to CLI</div>
        <div className="agent-dialog-fields">
          <label>
            Recipient
            <select
              value={recipient?.id ?? ''}
              onChange={(event) => { setSelectedId(event.target.value); setResult(null); }}
              disabled={sending || !!listError || !agents?.length}
            >
              <option value="">Select a CLI</option>
              {agents?.map(({ id, name }) => (
                <option key={id} value={id}>
                  {nameCounts.get(name) > 1 ? `${name} (${id.slice(0, 8)})` : name}
                </option>
              ))}
            </select>
          </label>
          {listError ? <div role="alert">{listError}</div> : <div role="status">{listStatus}</div>}
          <label>
            Message
            <textarea rows={5} value={message} readOnly={sending}
              onChange={(event) => { setMessage(event.target.value); setResult(null); }} />
          </label>
          {result && <div role={result.error ? 'alert' : 'status'}>{result.text}</div>}
        </div>
        <div className="info-actions">
          <button type="submit" className="primary" disabled={!canSend}>{sending ? 'Sending...' : 'Send'}</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
