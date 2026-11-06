// Pieces shared by the node components.
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { snap } from '../model/model.js';
import { HistoryContext } from '../state/history.js';
import { HTML_SANDBOX, URL_SANDBOX, MOCKUP_W, MOCKUP_H } from '../model/mockup.js';
import { BoardActions } from '../state/BoardActions.js';

// Starts a horizontal pointer drag; onMove receives the total delta in flow units.
export function useHorizontalDrag() {
  const zoom = useStore((s) => s.transform[2]);
  const history = useContext(HistoryContext);
  return (e, onMove, onEnd) => {
    history.begin();
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const move = (ev) => onMove((ev.clientX - startX) / zoom);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onEnd?.();
      history.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}

// Lanes and slices are children of a Chapter, so React Flow cannot drag the Chapter
// from them. This returns a pointer-down handler that moves the Chapter that owns the
// node `nodeId`: snapped to the grid, one undo step, and the Chapter becomes the active
// one. A press that does not move (a click or double-click) is left alone, so renaming
// still works. `skip` lets the caller veto a press (e.g. while editing).
export function useChapterDrag(nodeId, skip) {
  const { setNodes, getNodes } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const history = useContext(HistoryContext);
  const { activate, clearCell, overview } = useContext(BoardActions);
  return (e) => {
    if (e.button !== 0 || overview) return; // the overview is read-only
    clearCell(); // pressing a header selects something else
    if (e.target.closest('button, input') || skip?.()) return;
    const chapterId = getNodes().find((n) => n.id === nodeId)?.parentId;
    const chapter = getNodes().find((n) => n.id === chapterId);
    if (!chapter) return;
    const start = { ...chapter.position };
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        started = true;
        history.begin();
        activate(chapterId);
      }
      const x = snap(start.x + (ev.clientX - sx) / zoom);
      const y = snap(start.y + (ev.clientY - sy) / zoom);
      setNodes((ns) =>
        ns.map((n) => (n.id === chapterId ? { ...n, position: { x, y } } : n))
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (started) history.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}

// The "i" button of a Chapter, lane or slice; filled when the item has info.
export function InfoButton({ id, info, hotkey }) {
  const { openInfo } = useContext(BoardActions);
  return (
    <button
      className={`info-btn nodrag${info ? ' has-info' : ''}`}
      title={`${info ? 'Edit info' : 'Add info'}${hotkey ? ` (${hotkey})` : ''}`}
      aria-label="Info"
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={() => openInfo(id)}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 4.2V9" />
        <circle cx="5" cy="1.6" r="0.3" />
      </svg>
    </button>
  );
}

// The "Fields" button of the element toolbar; filled when the element has fields (R9.2).
export function FieldsButton({ id, has }) {
  const { openFields } = useContext(BoardActions);
  return (
    <button
      className={`info-btn nodrag${has ? ' has-info' : ''}`}
      title="Edit fields (F)"
      aria-label="Fields"
      onClick={(e) => {
        e.stopPropagation();
        openFields(id);
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M1 2H9M1 5H9M1 8H6" />
      </svg>
    </button>
  );
}

// The field names of an element as a compact list (R9.5); objects show their own fields indented.
export function FieldList({ fields }) {
  return (
    <ul className="field-list">
      {fields.map((f) => (
        <li key={f.name}>
          {f.name}
          {f.fields?.length > 0 && <FieldList fields={f.fields} />}
        </li>
      ))}
    </ul>
  );
}

export function CopyButton({ id }) {
  const { rememberCopy } = useContext(BoardActions);
  return (
    <button
      className="info-btn copy-btn nodrag"
      title="Copy (Ctrl+C)"
      aria-label="Copy"
      onClick={(e) => {
        e.stopPropagation();
        rememberCopy(id);
      }}
    >
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="5" y="1" width="8" height="8" rx="1.5" />
        <rect x="1" y="5" width="8" height="8" rx="1.5" />
      </svg>
    </button>
  );
}

// "Copy Context": puts the ids of the Context, Chapter, Slice (and the element, when `elementId` is
// given) in the clipboard. `className` is the button style of its place (element toolbar or slice header).
export function CopyContextButton({ elementId, sliceId, className = 'info-btn' }) {
  const { copyContext } = useContext(BoardActions);
  return (
    <button
      className={`${className} nodrag`}
      title="Copy Context (Shift+A)"
      aria-label="Copy Context"
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        copyContext({ elementId, sliceId });
      }}
    >
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="2" y="2.5" width="10" height="10" rx="1.5" />
        <rect x="4.5" y="0.8" width="5" height="3" rx="1" fill="currentColor" />
        <path d="M4.5 7.5H9.5M4.5 10H8" />
      </svg>
    </button>
  );
}

// The Screen mockup in the element body (R3.8): rendered at MOCKUP_W x MOCKUP_H in a sandboxed
// iframe and scaled down to the body's width, so there is nothing to scroll.
export function ScreenPreview({ html, url, title }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.14);
  useLayoutEffect(() => {
    const el = box.current;
    const update = () => el.clientWidth && setScale(el.clientWidth / MOCKUP_W);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="screen-frame-box">
      <iframe
        key={url ?? 'code'}
        className="screen-frame"
        title={title}
        sandbox={url ? URL_SANDBOX : HTML_SANDBOX}
        scrolling="no"
        {...(url ? { src: url } : { srcDoc: html })}
        style={{ width: MOCKUP_W, height: MOCKUP_H, transform: `scale(${scale})` }}
      />
    </div>
  );
}
