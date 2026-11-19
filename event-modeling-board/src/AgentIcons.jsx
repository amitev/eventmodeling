function agentColor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return `hsl(${(hash >>> 0) % 360} 65% 45%)`;
}

export function AgentIcons({ agents, listError }) {
  if (listError) {
    return <span className="agent-icons-error keep" title={listError}>CLI list unavailable</span>;
  }
  if (!agents?.length) return null;

  return (
    <div className="agent-icons keep" role="group" aria-label="Connected CLIs">
      {agents.map(({ id, name }) => (
        <svg key={id} viewBox="0 0 24 24" role="img" aria-label={name} fill="none">
          <title>{name}</title>
          <path d="M12 3v4M3 11v4m18-4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="5" y="7" width="14" height="13" rx="3" fill={agentColor(name)} />
          <circle cx="9" cy="12" r="1" fill="#fff" />
          <circle cx="15" cy="12" r="1" fill="#fff" />
          <path d="M10 16h4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  );
}
