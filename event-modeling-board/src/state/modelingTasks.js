import { useCallback, useEffect, useRef, useState } from 'react';

export function useModelingTasks() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const refreshNow = useRef(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const refresh = async () => {
      clearTimeout(timer);
      try {
        const response = await fetch('/api/modeling-tasks', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const list = await response.json();
        if (controller.signal.aborted) return;
        setTasks((current) => JSON.stringify(current) === JSON.stringify(list) ? current : list);
        setError('');
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Could not load modeling tasks:', err);
        setError(`Could not load modeling tasks: ${err.message}`);
      }
      timer = setTimeout(refresh, 3000);
    };
    refreshNow.current = refresh;
    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  const add = useCallback(async (task) => {
    const response = await fetch('/api/modeling-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task),
    });
    const detail = await response.json();
    if (!response.ok) throw new Error(detail.error || `HTTP ${response.status}`);
    refreshNow.current();
    return detail;
  }, []);
  return { tasks, error, add };
}
