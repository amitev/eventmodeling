import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

async function request(path, options) {
  const response = await fetch(path, options);
  if (response.ok) return;
  const detail = response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : null;
  throw new Error(detail?.error || `HTTP ${response.status}`);
}

// { tasks, builders, add(task), remove(id) } for the Agent cockpit (R14).
export function useBuildQueue(agents) {
  const [tasks, setTasks] = useState([]);
  const refreshNow = useRef(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function refresh() {
      clearTimeout(timer);
      try {
        const response = await fetch('/api/build-queue', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const list = await response.json();
        if (controller.signal.aborted) return;
        setTasks((current) => (JSON.stringify(current) === JSON.stringify(list) ? current : list));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Could not load the build queue:', error);
        setTasks([]);
      }
      timer = setTimeout(refresh, 3000);
    }
    refreshNow.current = refresh;
    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const change = useCallback(async (path, options) => {
    try {
      await request(path, options);
    } finally {
      refreshNow.current();
    }
  }, []);
  const add = useCallback((task) => change('/api/build-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  }), [change]);
  const remove = useCallback((id) => change(`/api/build-queue/${encodeURIComponent(id)}`, { method: 'DELETE' }), [change]);

  const builderKey = JSON.stringify((agents ?? []).filter((agent) => agent.agentType === 'builder').map((agent) => agent.name));
  return useMemo(() => ({
    tasks,
    builders: JSON.parse(builderKey),
    add,
    remove,
  }), [tasks, builderKey, add, remove]);
}
