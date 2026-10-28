import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Undo/redo works on whole-board snapshots. A continuous gesture (dragging a note,
// resizing a slice) brackets itself with begin/end so it records a single entry.
export const HistoryContext = createContext({ begin: () => {}, end: () => {} });
export const MAX_HISTORY = 10;

// What counts as the board's content: selection, measured sizes and drag flags
// are deliberately left out, so they never create history entries.
export const keyOf = (nodes, edges, contexts) =>
  JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.parentId, n.position.x, n.position.y, n.data]),
    edges.map((e) => [e.id, e.source, e.target]),
    contexts,
  ]);

// Undo/redo of the board (in memory only). `restore(snapshot)` puts a snapshot back on the
// board; `blocked.current` turns the Ctrl+Z / Ctrl+Y hotkeys off (e.g. while a popup is open).
// Returns the button state `hist`, `undo`, `redo`, the gesture `api` for HistoryContext, and
// `markSilent()`: a change made right after it is folded into the user's operation.
export function useHistory({ nodes, edges, contexts, restore, blocked }) {
  const past = useRef([]);
  const future = useRef([]);
  const present = useRef(null);
  const gesture = useRef(0); // >0 while a drag/resize is in progress
  const silentAt = useRef(0); // when the board last re-settled itself after a measure
  const [tick, setTick] = useState(0);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: past.current.length, redo: future.current.length });

  useEffect(() => {
    if (gesture.current > 0) return;
    const key = keyOf(nodes, edges, contexts);
    if (!present.current) {
      present.current = { nodes, edges, contexts, key };
      return;
    }
    if (key === present.current.key) return;
    // Changes made by the board itself right after an element was measured (such as
    // re-centring it) are folded into the user's operation instead of being separate steps.
    const silent = performance.now() - silentAt.current < 300;
    silentAt.current = 0;
    if (!silent) {
      past.current.push(present.current);
      if (past.current.length > MAX_HISTORY) past.current.shift();
      future.current = [];
      syncHist();
    }
    present.current = { nodes, edges, contexts, key };
  }, [nodes, edges, contexts, tick]);

  const api = useMemo(
    () => ({
      begin: () => {
        gesture.current++;
      },
      end: () => {
        gesture.current = Math.max(0, gesture.current - 1);
        setTick((t) => t + 1);
      },
    }),
    []
  );

  const markSilent = useCallback(() => {
    silentAt.current = performance.now();
  }, []);

  const undo = useCallback(() => {
    if (gesture.current > 0) return;
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(present.current);
    present.current = prev;
    restore(prev);
    syncHist();
  }, [restore]);

  const redo = useCallback(() => {
    if (gesture.current > 0) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(present.current);
    present.current = next;
    restore(next);
    syncHist();
  }, [restore]);

  useEffect(() => {
    const onKey = (e) => {
      if (blocked.current || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, blocked]);

  return { hist, undo, redo, api, markSilent };
}
