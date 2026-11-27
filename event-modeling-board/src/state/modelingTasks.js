import { useCallback, useEffect, useRef, useState } from 'react';

export function useModelingTasks() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const refreshNow = useRef(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let revision = 0;
    const refresh = async () => {
      clearTimeout(timer);
      const snapshot = ++revision;
      try {
        const response = await fetch('/api/modeling-tasks', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const list = await response.json();
        if (controller.signal.aborted || snapshot !== revision) return;
        setTasks((current) => JSON.stringify(current) === JSON.stringify(list) ? current : list);
        setError('');
      } catch (err) {
        if (controller.signal.aborted || snapshot !== revision) return;
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
  const send = useCallback(async (url, body) => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const detail = await response.json();
    if (!response.ok) throw new Error(detail.error || `HTTP ${response.status}`);
    setTasks((current) => current.some((task) => task.id === detail.id)
      ? current.map((task) => task.id === detail.id ? detail : task)
      : [detail, ...current]);
    refreshNow.current();
    return detail;
  }, []);
  const add = useCallback((task) => send('/api/modeling-tasks', task), [send]);
  const reply = useCallback((id, prompt) =>
    send(`/api/modeling-tasks/${encodeURIComponent(id)}/messages`, { prompt }), [send]);
  return { tasks, error, add, reply };
}
