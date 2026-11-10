import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, NodeToolbar, Position, useReactFlow, useStore } from '@xyflow/react';
import { KINDS, kindW } from '../model/model.js';
import { hasFields } from '../model/fields.js';
import { ScenariosCard } from '../scenarios/Scenarios.jsx';
import { NotesCard } from './Notes.jsx';
import { BoardActions } from '../state/BoardActions.js';
import { chapterStretchWidths, CopyButton, CopyContextButton, FieldList, FieldsButton, InfoButton, ScreenPreview } from './parts.jsx';

// A cogwheel with 8 teeth and a centre hole, as one path in a 100x100 box.
const COG_PATH = (() => {
  const teeth = 8, step = (2 * Math.PI) / teeth, outer = 48, root = 38, hole = 15;
  const pt = (r, a) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push(pt(root, a - 0.3 * step), pt(outer, a - 0.17 * step), pt(outer, a + 0.17 * step), pt(root, a + 0.3 * step));
  }
  return `M${pts.join('L')}ZM${50 + hole} 50A${hole} ${hole} 0 1 0 ${50 - hole} 50A${hole} ${hole} 0 1 0 ${50 + hole} 50Z`;
})();

const ZOOM_DELAY_MS = 300;

export function StickyNode({ id, data, selected }) {
  const { setNodes } = useReactFlow();
  const [editingTitle, setEditingTitle] = useState(false);
  // A Screen with a mockup grows only after the mouse stayed over it for ZOOM_DELAY_MS (R3.10a).
  const [grown, setGrown] = useState(false);
  const growTimer = useRef(null);
  const stopGrowing = () => {
    clearTimeout(growTimer.current);
    setGrown(false);
  };
  const startGrowing = () => {
    clearTimeout(growTimer.current);
    growTimer.current = setTimeout(() => setGrown(true), ZOOM_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(growTimer.current), []);
  const titleRef = useRef(null);

  useEffect(() => {
    if (editingTitle) titleRef.current?.select();
  }, [editingTitle]);

  const isScreen = data.kind === 'screen';
  // The shown width: Scenarios and Notes stretch to fill the slice when alone in their Cell.
  const width = useStore((s) => {
    const me = s.nodeLookup.get(id);
    return me && KINDS[data.kind]?.stretch ? chapterStretchWidths(s, me.parentId).get(id) ?? kindW(data.kind) : kindW(data.kind);
  });
  const { titleEditId, clearTitleEdit, editScenario, viewScenarios, newScenarioId, openInfo, openHtml, viewHtml, readInfo, goToOriginal, overview } = useContext(BoardActions);

  // A linked copy shows its original's content, live, and cannot be edited (R3.22).
  const isCopy = !!data.copyOf;
  const original = useStore((s) => (data.copyOf ? s.nodeLookup.get(data.copyOf) : undefined));
  const shown = isCopy ? { ...(original?.data ?? {}), kind: data.kind, copyOf: data.copyOf } : data;

  // The fields scroll in the fixed-height body (R3.6c). `nowheel` makes the wheel scroll them, not zoom the board,
  // only while the element is selected.
  const bodyRef = useRef(null);
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    setScrolls(!!el && el.scrollHeight > el.clientHeight);
  }, [shown.fields]);

  useEffect(() => {
    if (titleEditId !== id) return;
    setEditingTitle(true);
    clearTitleEdit();
  }, [titleEditId, id, clearTitleEdit]);

  const update = (patch) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  const commitTitle = (name) => {
    setEditingTitle(false);
    update({ name: name.trim() });
  };

  // The toolbar above a selected element: Copy and Info, the Fields and HTML mockup buttons where they
  // apply, and Copy Context. It grows with zoom-in, from 24px buttons up to 28px (R1c.1a). A linked copy
  // (R3.22) has the eye of a Screen, and Notes and Scenarios only Copy Context.
  const toolbarScale = useStore((s) => Math.min(28 / 24, Math.max(1, s.transform[2])));
  const eyeButton = (
    <button
      className="info-btn"
      title="View (V)"
      aria-label="View"
      disabled={!shown.html && !shown.url}
      onClick={() => viewHtml(id)}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M1 8C3 4.5 5.5 3 8 3s5 1.5 7 5c-2 3.5-4.5 5-7 5S3 11.5 1 8Z" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    </button>
  );
  const copyContextButton = <CopyContextButton elementId={id} />;
  // Notes and Scenarios have only the Copy Context button; a linked copy the eye (Screen) and that button.
  const toolbar = (
    <NodeToolbar
      position={Position.Top}
      offset={8 * toolbarScale}
      className="element-toolbar nodrag nopan"
      style={{ '--tb-scale': toolbarScale, zIndex: 5 }}
    >
      {data.kind === 'notes' || data.kind === 'scenarios' ? (
        copyContextButton
      ) : isCopy ? (
        <>
          {isScreen && eyeButton}
          {copyContextButton}
        </>
      ) : (
        <>
          <CopyButton id={id} />
          <InfoButton id={id} info={data.info} hotkey="I" />
          {hasFields(data.kind) && <FieldsButton id={id} has={!!data.fields?.length} />}
          {isScreen && (
            <>
              <button
                className="info-btn html-tool"
                title="Edit HTML mockup (E)"
                aria-label="Edit HTML mockup"
                onClick={() => openHtml(id)}
              >
                {'</>'}
              </button>
              {eyeButton}
            </>
          )}
          {copyContextButton}
        </>
      )}
    </NodeToolbar>
  );

  if (data.kind === 'scenarios') {
    return (
      <>
        <ScenariosCard id={id} data={data} selected={selected} width={width} onEdit={editScenario} onView={viewScenarios} newId={newScenarioId} />
        {toolbar}
      </>
    );
  }
  if (data.kind === 'notes') {
    return (
      <>
        <NotesCard id={id} data={data} selected={selected} width={width} onEdit={openInfo} onRead={readInfo} />
        {toolbar}
      </>
    );
  }

  const zoomable = isScreen && !!(shown.html || shown.url);
  // The handles are siblings of the scaled `.sticky`: React Flow measures them from their screen position, so
  // inside the hover zoom (R3.10a) they were measured scaled and the arrows ended at wrong points.
  return (
    <>
      <Handle id="top-in" type="target" position={Position.Top} />
      <Handle id="top-out" type="source" position={Position.Top} />
      <Handle id="bottom-out" type="source" position={Position.Bottom} />
      <Handle id="bottom-in" type="target" position={Position.Bottom} />
    <div
      className={`sticky ${data.kind} ${isCopy ? 'copy' : ''} ${selected ? 'selected' : ''}${zoomable ? ' zoomable' : ''}${zoomable && grown ? ' grown' : ''}`}
      onPointerEnter={zoomable ? startGrowing : undefined}
      onPointerLeave={zoomable ? stopGrowing : undefined}
      onPointerDown={zoomable ? stopGrowing : undefined}
      onPointerUp={zoomable ? startGrowing : undefined}
    >
      {toolbar}
      <div
        className="sticky-header"
        title={shown.name || undefined}
        onDoubleClick={isCopy || overview ? undefined : () => setEditingTitle(true)}
      >
        {isCopy && (
          <button
            type="button"
            className="copy-mark nodrag nopan"
            title="Go to original element (G)"
            aria-label="Go to original element"
            disabled={!original}
            onClick={(e) => {
              e.stopPropagation();
              goToOriginal(id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M6 8L8 6M5.6 5.2L4.4 6.4A2.2 2.2 0 0 0 7.6 9.6L8.4 8.8M8.4 8.8L9.6 7.6A2.2 2.2 0 0 0 6.4 4.4L5.6 5.2" />
            </svg>
          </button>
        )}
        {editingTitle && !isCopy ? (
          <input
            ref={titleRef}
            className="nodrag title-input"
            defaultValue={data.name ?? ''}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
            }}
          />
        ) : (
          <span className={`title ${shown.name ? '' : 'empty'}`}>{shown.name || 'Name'}</span>
        )}
      </div>
      {data.kind === 'processor' ? (
        <div className="cogwheel">
          <svg width="88" height="88" viewBox="0 0 100 100" aria-hidden="true">
            <path d={COG_PATH} fillRule="evenodd" />
          </svg>
        </div>
      ) : (
        <div ref={bodyRef} className={`sticky-body${isScreen && (shown.html || shown.url) ? ' has-mockup' : ''}${scrolls && selected ? ' nowheel' : ''}`}>
        {!isScreen && shown.fields?.length > 0 && <FieldList fields={shown.fields} />}
        {isScreen && (shown.html || shown.url) && <ScreenPreview html={shown.html} url={shown.url} title={shown.name || 'Screen mockup'} />}
        </div>
      )}
    </div>
    </>
  );
}
