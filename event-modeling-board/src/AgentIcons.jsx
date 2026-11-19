import { useEffect, useRef, useState } from 'react';

function agentColor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return `hsl(${(hash >>> 0) % 360} 65% 45%)`;
}

function RobotIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M12 3v4M3 11v4m18-4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="7" width="14" height="13" rx="3" fill={agentColor(name)} />
      <circle cx="9" cy="12" r="1" fill="#fff" />
      <circle cx="15" cy="12" r="1" fill="#fff" />
      <path d="M10 16h4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AgentCard({ agent, onStop, cardRef, offset }) {
  const { id, name, model, lastPing } = agent;
  const [now, setNow] = useState(Date.now);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const age = lastPing === null ? null : Math.max(0, Math.floor((now - lastPing) / 1000));
  const alive = age !== null && age < 65;
  const ping = age === null ? 'Not yet' : (
    `${age < 5 ? 'just now' : `${age}s ago`} (${new Date(lastPing).toLocaleTimeString()})`
  );

  async function stop() {
    setStopping(true);
    setError('');
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
      onStop(id);
    } catch (error) {
      setError(`Could not stop agent: ${error.message}`);
      setStopping(false);
    }
  }

  return (
    <div className="agent-card-anchor" style={{ left: offset }}>
      <section ref={cardRef} className="agent-card" role="dialog" aria-label={`${name} (${model})`}>
        <div className="agent-card-title"><RobotIcon name={name} /><strong>{name} ({model})</strong></div>
        <dl>
          <dt>Type</dt><dd>MODELING</dd>
          <dt>Connectivity</dt>
          <dd><span className={`agent-dot${alive ? ' alive' : ''}`} />{alive ? 'alive' : age === null ? 'pending' : 'unresponsive'}</dd>
          <dt>Status</dt><dd><span className="agent-dot idle" />Idle</dd>
          <dt>Last ping</dt><dd>{ping}</dd>
        </dl>
        {error && <div role="alert">{error}</div>}
        <div className="agent-card-actions">
          <button type="button" disabled>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="5" /><path d="m4.5 4.5 7 7" />
            </svg>
            Cancel run
          </button>
          <button type="button" className="agent-stop" onClick={stop} disabled={stopping}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <rect x="4" y="4" width="8" height="8" rx="1" />
            </svg>
            {stopping ? 'Stopping...' : 'Stop agent'}
          </button>
        </div>
      </section>
    </div>
  );
}

function AgentIcon({ agent, onStop }) {
  const trigger = useRef(null);
  const card = useRef(null);
  const [offset, setOffset] = useState(null);
  const open = offset !== null;

  function show() {
    const { left } = trigger.current.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const width = Math.min(320, viewport - 16);
    setOffset(Math.min(Math.max(left, 8), viewport - width - 8) - left);
  }

  return (
    <div
      className="agent-icon"
      onMouseEnter={show}
      onMouseLeave={() => {
        if (!card.current?.contains(document.activeElement)) setOffset(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) setOffset(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.stopPropagation();
        trigger.current.focus();
        setOffset(null);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="agent-icon-trigger"
        aria-label={agent.name}
        aria-haspopup="dialog"
        aria-expanded={open}
        onFocus={show}
        onClick={show}
      >
        <RobotIcon name={agent.name} />
      </button>
      {open && <AgentCard agent={agent} onStop={onStop} cardRef={card} offset={offset} />}
    </div>
  );
}

export function AgentIcons({ agents, listError, onStop }) {
  if (listError) {
    return <span className="agent-icons-error keep" title={listError}>CLI list unavailable</span>;
  }
  if (!agents?.length) return null;

  return (
    <div className="agent-icons keep" role="group" aria-label="Connected CLIs">
      {agents.map((agent) => <AgentIcon key={agent.id} agent={agent} onStop={onStop} />)}
    </div>
  );
}
