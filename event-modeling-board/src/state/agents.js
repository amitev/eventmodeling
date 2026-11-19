import { useEffect, useState } from 'react';

export function useConnectedAgents() {
  const [agents, setAgents] = useState(null);
  const [listError, setListError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const response = await fetch('/api/agents', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const list = await response.json();
        if (controller.signal.aborted) return;
        setAgents((current) => current?.length === list.length && current.every((agent, index) => {
          const next = list[index];
          return agent.id === next.id && agent.name === next.name && agent.model === next.model;
        }) ? current : list);
        setListError('');
      } catch (error) {
        if (controller.signal.aborted) return;
        setListError(`Could not load connected CLIs: ${error.message}`);
      }
      timer = setTimeout(refresh, 3000);
    }
    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  function removeAgent(id) {
    setAgents((list) => list?.filter((agent) => agent.id !== id));
  }

  return { agents, listError, removeAgent };
}
