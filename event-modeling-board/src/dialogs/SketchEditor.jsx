import { useEffect, useMemo, useRef, useState } from 'react';
import { MOCKUP_W, MOCKUP_H } from '../model/mockup.js';
import { addTableColumn, lineBetween, lineEndpoints, moveSketchShapes, readSketch, recordSketchHistory, rectangleBetween, resizeSketchLine, resizeSketchShape, resizeTableColumn, selectSketchShapes, sketchBounds, sketchHtml, sketchId, sketchLayers, sketchPoint, tableDividers, tableParts, travelSketchHistory, validSketchSize } from '../model/sketch.js';

const CORNERS = ['nw', 'ne', 'sw', 'se'];

export function SketchEditor({ html, usingUrl, active, onChange, onStart }) {
  const model = useMemo(() => readSketch(html), [html]);
  const [tool, setTool] = useState('select');
  const [selectedIds, setSelectedIds] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fill, setFill] = useState('#ffffff');
  const [stroke, setStroke] = useState('#1f2937');
  const [textColor, setTextColor] = useState('#1f2937');
  const [lineColor, setLineColor] = useState('#1f2937');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const canvas = useRef(null);
  const gesture = useRef(null);
  const textInput = useRef(null);
  const shapes = draft ?? model.shapes ?? [];
  const selectedShapes = shapes.filter(({ id }) => selectedIds.includes(id));
  const selected = selectedShapes.length === 1 ? selectedShapes[0] : null;
  const editing = shapes.find((shape) => shape.id === editingId && shape.type === 'text');
  const selectionBounds = selectedShapes.length > 1 ? sketchBounds(selectedShapes) : null;
  const ready = !usingUrl && model.shapes !== null;
  const canonical = ready ? sketchHtml(model.shapes) : null;
  const [history, setHistory] = useState(() => ({ past: [], present: canonical, future: [], group: null }));
  const historyRef = useRef(history);
  const updateHistory = (next) => {
    historyRef.current = next;
    setHistory(next);
  };
  useEffect(() => {
    if (canonical !== historyRef.current.present) {
      updateHistory({ past: [], present: canonical, future: [], group: null });
    }
  }, [canonical]);

  const commit = (next, group = null) => {
    const value = sketchHtml(next);
    if (value === historyRef.current.present) return;
    updateHistory(recordSketchHistory(historyRef.current, value, group));
    setError('');
    onChange(value);
  };
  const changeSelected = (values, group = null) => {
    commit(shapes.map((shape) => shape.id === selected.id ? { ...shape, ...values } : shape), group);
  };
  const endTyping = () => {
    updateHistory({ ...historyRef.current, group: null });
  };
  const finishTyping = () => {
    setEditingId(null);
    endTyping();
  };
  useEffect(() => {
    if (!editingId) return;
    textInput.current?.focus();
    textInput.current?.select();
  }, [editingId]);
  const travel = (redo = false) => {
    if (!ready || gesture.current) return;
    const next = travelSketchHistory(historyRef.current, redo);
    if (next === historyRef.current) return;
    updateHistory(next);
    const restoredIds = new Set(readSketch(next.present).shapes.map(({ id }) => id));
    setSelectedIds((ids) => ids.filter((id) => restoredIds.has(id)));
    setError('');
    onChange(next.present);
  };
  const travelRef = useRef(travel);
  travelRef.current = travel;
  useEffect(() => {
    if (!active) return;
    const onHistoryKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      const undo = key === 'z' && !event.shiftKey;
      const redo = key === 'z' && event.shiftKey || key === 'y' && !event.shiftKey;
      if (!undo && !redo) return;
      event.preventDefault();
      event.stopPropagation();
      travelRef.current(redo);
    };
    window.addEventListener('keydown', onHistoryKey);
    return () => window.removeEventListener('keydown', onHistoryKey);
  }, [active]);
  useEffect(() => {
    if (!active) finishTyping();
  }, [active]);
  const point = (event, insideOnly = false) => {
    const matrix = canvas.current.getScreenCTM();
    if (!matrix) {
      setError('The sketch canvas is not ready. Try again after it is visible.');
      return null;
    }
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (insideOnly && (position.x < 0 || position.y < 0 || position.x > MOCKUP_W || position.y > MOCKUP_H)) return null;
    return sketchPoint(position.x, position.y);
  };
  const textShape = (text, position, id, fontSize = 24) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    element.setAttribute('font-size', fontSize);
    element.setAttribute('font-family', 'sans-serif');
    element.setAttribute('visibility', 'hidden');
    element.textContent = text;
    canvas.current.append(element);
    const width = Math.max(4, element.getComputedTextLength());
    element.remove();
    const scale = Math.min(1, MOCKUP_W / width);
    const height = fontSize * scale * 1.2;
    return {
      id, type: 'text', text, width: width * scale, height, fontSize: fontSize * scale,
      fill: textColor, x: Math.min(position.x, MOCKUP_W - width * scale),
      y: Math.min(position.y, MOCKUP_H - height),
    };
  };
  const down = (event) => {
    if (!ready || gesture.current || event.button !== 0) return;
    const start = point(event, true);
    if (!start) return;
    event.preventDefault();
    canvas.current.focus();
    setError('');
    const shapeId = event.target.closest('[data-shape-id]')?.getAttribute('data-shape-id');
    const corner = event.target.getAttribute('data-corner');
    const endpoint = event.target.getAttribute('data-endpoint');
    const column = event.target.getAttribute('data-column');
    const shape = shapes.find(({ id }) => id === shapeId);
    if (tool === 'table') {
      const added = {
        id: sketchId(shapes), type: 'table', x: Math.min(start.x, MOCKUP_W - 360),
        y: Math.min(start.y, MOCKUP_H - 180), width: 360, height: 180, columns: [1 / 3, 1 / 3, 1 / 3],
      };
      commit([...shapes, added]);
      setSelectedIds([added.id]);
      setTool('select');
      return;
    }
    if (tool === 'text') {
      const added = textShape('Text', start, sketchId(shapes));
      commit([...shapes, added]);
      setSelectedIds([added.id]);
      setTool('select');
      setEditingId(added.id);
      return;
    }
    if (tool === 'rect' || tool === 'line') {
      const added = tool === 'line'
        ? { id: sketchId(shapes), type: 'line', ...lineBetween(start, start), stroke: lineColor }
        : { id: sketchId(shapes), type: 'rect', ...rectangleBetween(start, start), fill, stroke };
      const next = [...shapes, added];
      setSelectedIds([added.id]);
      setDraft(next);
      gesture.current = { type: 'draw', shape: added, start, shapes: next, pointerId: event.pointerId, selectionBefore: selectedIds };
    } else if (shape) {
      const nextIds = selectedIds.includes(shape.id) ? selectedShapes.map(({ id }) => id) : [shape.id];
      setSelectedIds(nextIds);
      gesture.current = {
        type: column !== null ? 'column' : corner || endpoint ? 'resize' : 'move',
        corner, endpoint, column: Number(column), shape, start, shapes, pointerId: event.pointerId,
        selectedIds: nextIds, selectionBefore: selectedIds,
      };
    } else {
      setSelectedIds([]);
      setMarquee(rectangleBetween(start, start));
      gesture.current = { type: 'select', start, shapes, pointerId: event.pointerId, selectionBefore: selectedIds };
    }
    canvas.current.setPointerCapture(event.pointerId);
  };
  const update = (event) => {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return null;
    const current = point(event);
    if (!current) return null;
    if (drag.type === 'select') {
      const box = rectangleBetween(drag.start, current);
      setMarquee(box);
      setSelectedIds(box.width > 0 && box.height > 0 ? selectSketchShapes(drag.shapes, box) : []);
      return drag.shapes;
    }
    if (drag.type === 'move') {
      const next = moveSketchShapes(drag.shapes, drag.selectedIds, current.x - drag.start.x, current.y - drag.start.y);
      setDraft(next);
      return next;
    }
    const nextShape = drag.type === 'column'
      ? resizeTableColumn(drag.shape, drag.column, current)
      : drag.type === 'draw'
        ? { ...drag.shape, ...(drag.shape.type === 'line' ? lineBetween(drag.start, current) : rectangleBetween(drag.start, current)) }
        : drag.shape.type === 'line'
          ? resizeSketchLine(drag.shape, current, drag.endpoint)
          : resizeSketchShape(drag.shape, current, drag.corner);
    const next = drag.shapes.map((shape) => shape.id === nextShape.id ? nextShape : shape);
    setDraft(next);
    return next;
  };
  const finish = (event, cancel = false) => {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = cancel ? null : update(event);
    if (cancel || !next) {
      setSelectedIds(drag.selectionBefore);
    } else if (drag.type !== 'select') {
      if (next.every(validSketchSize)) {
        commit(next);
        if (drag.type === 'draw') setTool('select');
      } else {
        setSelectedIds(drag.selectionBefore);
      }
    }
    gesture.current = null;
    setDraft(null);
    setMarquee(null);
    if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
  };
  const remove = () => {
    commit(shapes.filter(({ id }) => !selectedIds.includes(id)));
    setSelectedIds([]);
  };
  const onKey = (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      if (selectedShapes.length && !gesture.current) remove();
    }
  };

  if (!ready) {
    return (
      <div className="sketch-start">
        <p>{usingUrl ? 'Sketches replace the URL and HTML content.' : model.error}</p>
        <button type="button" onClick={() => {
          if (!onStart()) return;
          setSelectedIds([]);
          setTool('select');
          setError('');
        }}>Start sketch</button>
        <p>Rectangles, lines, tables and text. Existing content is replaced after confirmation.</p>
      </div>
    );
  }

  return (
    <>
      <div className="sketch-toolbar" role="toolbar" aria-label="Sketch tools">
        <div className="sketch-tools">
          {[['select', 'Select / move'], ['rect', 'Rectangle'], ['line', 'Line'], ['table', 'Table'], ['text', 'Text']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="sketch-tool-icon"
              aria-label={label}
              title={label}
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
            >
              {value === 'rect' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                  <rect x="1" y="1" width="14" height="14" rx="1" />
                </svg>
              ) : value === 'line' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M2 14 14 2" />
                </svg>
              ) : value === 'table' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                  <rect x="1" y="1" width="14" height="14" rx="1" />
                  <path d="M1 5.5h14M1 10h14M5.5 1v14M10 1v14" />
                </svg>
              ) : value === 'text' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                  <path d="M2 14h4M10 14h4M4 14 8 2l4 12M5.3 10h5.4" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 1.5v12l3-3 2.5 4.5 2-1-2.5-4.5H13Z" />
                </svg>
              )}
            </button>
          ))}
          <button type="button" className="sketch-tool-icon" aria-label="Delete selected shapes" disabled={!selectedShapes.length || !!gesture.current} onClick={remove} title="Delete selected shapes (Delete / Backspace)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
              <path d="M2 4h12M6 4V2h4v2M4 4l.7 10h6.6L12 4M6.5 6v6M9.5 6v6" />
            </svg>
          </button>
          <button type="button" className="sketch-tool-icon" aria-label="Undo sketch operation" title="Undo sketch operation (Ctrl+Z / Cmd+Z)" disabled={!history.past.length || !!gesture.current} onMouseDown={(event) => event.preventDefault()} onClick={() => travel()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M6 2 2 6l4 4M2 6h7a5 5 0 0 1 0 10" transform="translate(0 -1)" />
            </svg>
          </button>
          <button type="button" className="sketch-tool-icon" aria-label="Redo sketch operation" title="Redo sketch operation (Ctrl+Y / Ctrl+Shift+Z / Cmd+Y / Cmd+Shift+Z)" disabled={!history.future.length || !!gesture.current} onMouseDown={(event) => event.preventDefault()} onClick={() => travel(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="m10 2 4 4-4 4M14 6H7a5 5 0 0 0 0 10" transform="translate(0 -1)" />
            </svg>
          </button>
        </div>
        <div className="sketch-properties">
          {selected?.type === 'table' && (
            <button type="button" className="sketch-add-column" onClick={() => {
              const next = addTableColumn(selected);
              if (!next) {
                setError('Not enough space for another column. Widen the table or its narrowest column first.');
                return;
              }
              commit(shapes.map((shape) => shape.id === selected.id ? next : shape));
            }}>Add column</button>
          )}
          {(selected?.type === 'line' || !selected && tool === 'line') && (
            <SketchColor label="Line color" allowNone={false} value={selected?.stroke ?? lineColor} onChange={(value) => {
              setLineColor(value);
              if (selected) changeSelected({ stroke: value });
            }} />
          )}
          {(selected?.type === 'rect' || !selected && tool === 'rect') && (
            <>
              <SketchColor label="Fill" value={selected?.fill ?? fill} onChange={(value) => {
                setFill(value);
                if (selected) changeSelected({ fill: value });
              }} />
              <SketchColor label="Border" allowNone={false} value={selected?.stroke ?? stroke} onChange={(value) => {
                setStroke(value);
                if (selected) changeSelected({ stroke: value });
              }} />
            </>
          )}
          {(selected?.type === 'text' || !selected && tool === 'text') && (
            <SketchColor label="Text color" value={selected?.fill ?? textColor} onChange={(value) => {
              setTextColor(value);
              if (selected) changeSelected({ fill: value });
            }} />
          )}
        </div>
      </div>
      <div className="html-blocked-hint">1024 × 768. Click to insert a table; drag its dividers to resize columns. Elements over cells stay independent. Drag rectangles/lines; double-click text to edit.</div>
      {error && <div className="html-highlight-error" role="alert">{error}</div>}
      <div className="sketch-canvas-box">
        <svg
          ref={canvas}
          className={`sketch-canvas tool-${tool}`}
          viewBox={`0 0 ${MOCKUP_W} ${MOCKUP_H}`}
          preserveAspectRatio="xMidYMin meet"
          tabIndex={0}
          role="group"
          aria-label="Sketch canvas"
          onKeyDown={onKey}
          onPointerDown={down}
          onDoubleClick={(event) => {
            if (tool !== 'select' || gesture.current) return;
            const position = point(event, true);
            if (!position) return;
            const shape = shapes.findLast((item) => item.type === 'text' &&
              position.x >= item.x && position.x <= item.x + item.width &&
              position.y >= item.y && position.y <= item.y + item.height);
            if (!shape) return;
            event.preventDefault();
            setSelectedIds([shape.id]);
            setEditingId(shape.id);
          }}
          onPointerMove={update}
          onPointerUp={finish}
          onPointerCancel={(event) => finish(event, true)}
          onLostPointerCapture={(event) => finish(event, true)}
        >
          <rect width={MOCKUP_W} height={MOCKUP_H} fill="#ffffff" />
          {sketchLayers(shapes).map((shape) => shape.type === 'table' ? (
            <g key={shape.id} data-shape-id={shape.id}>
              {tableParts(shape).map(({ tag, attrs }, index) => {
                const { 'stroke-width': strokeWidth, ...rest } = attrs;
                return tag === 'rect'
                  ? <rect key={index} {...rest} strokeWidth={strokeWidth} />
                  : <line key={index} {...rest} strokeWidth={strokeWidth} />;
              })}
            </g>
          ) : shape.type === 'rect' ? (
            <rect key={shape.id} data-shape-id={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill={shape.fill} stroke={shape.stroke} strokeWidth={2} pointerEvents="all" />
          ) : shape.type === 'line' ? (
            <g key={shape.id} data-shape-id={shape.id}>
              <line {...lineEndpoints(shape)} stroke={shape.stroke} strokeWidth={2} pointerEvents="none" />
              <line {...lineEndpoints(shape)} stroke="transparent" strokeWidth={12} pointerEvents="stroke" />
            </g>
          ) : (
            <text key={shape.id} data-shape-id={shape.id} x={shape.x} y={shape.y + shape.fontSize} fontSize={shape.fontSize} fontFamily="sans-serif" fill={shape.fill} textLength={shape.width} lengthAdjust="spacingAndGlyphs" pointerEvents="all" visibility={shape.id === editingId ? 'hidden' : undefined}>{shape.text}</text>
          ))}
          {tool === 'select' && selectedShapes.map((shape) => (
            <g key={shape.id} className="sketch-selection" data-shape-id={shape.id}>
              {shape.type === 'line' ? (
                <line {...lineEndpoints(shape)} pointerEvents="none" vectorEffect="non-scaling-stroke" />
              ) : (
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke" />
              )}
              {selected && shape.type === 'line' && ['start', 'end'].map((endpoint) => {
                const ends = lineEndpoints(shape);
                return (
                  <circle
                    key={endpoint}
                    className="sketch-handle endpoint"
                    data-endpoint={endpoint}
                    cx={endpoint === 'start' ? ends.x1 : ends.x2}
                    cy={endpoint === 'start' ? ends.y1 : ends.y2}
                    r={8}
                    pointerEvents="all"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {selected && shape.type !== 'line' && !editing && CORNERS.map((corner) => (
                <rect
                  key={corner}
                  className={`sketch-handle ${corner}`}
                  data-corner={corner}
                  x={shape.x + (corner.includes('w') ? 0 : shape.width) - 8}
                  y={shape.y + (corner.includes('n') ? 0 : shape.height) - 8}
                  width={16}
                  height={16}
                  pointerEvents="all"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {selected && shape.type === 'table' && tableDividers(shape).map((x, index) => (
                <line
                  key={`column-${index}`}
                  className="sketch-column-handle"
                  data-column={index}
                  x1={x} y1={shape.y} x2={x} y2={shape.y + shape.height}
                  stroke="transparent" strokeWidth={12} pointerEvents="stroke"
                />
              ))}
            </g>
          ))}
          {selectionBounds && tool === 'select' && (
            <rect className="sketch-selection" {...selectionBounds} fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke" />
          )}
          {marquee && (
            <rect className="sketch-marquee" {...marquee} pointerEvents="none" vectorEffect="non-scaling-stroke" />
          )}
          {editing && (
            <foreignObject
              x={editing.x}
              y={editing.y}
              width={Math.min(MOCKUP_W - editing.x, Math.max(80, editing.width + 32))}
              height={editing.height}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <input
                ref={textInput}
                className="sketch-inline-text"
                aria-label="Sketch text"
                style={{ fontSize: editing.fontSize, color: editing.fill === 'none' ? '#1f2937' : editing.fill }}
                value={editing.text}
                onBlur={finishTyping}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.blur();
                    canvas.current.focus();
                  } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.stopPropagation();
                  }
                }}
                onChange={(event) => {
                  const text = event.target.value.replace(/\s+/g, ' ');
                  const next = textShape(text, editing, editing.id, editing.fontSize);
                  if (next.fontSize < 8) {
                    setError('This text is too long to fit at the minimum font size of 8. Shorten it.');
                    return;
                  }
                  commit(shapes.map((shape) => shape.id === editing.id ? { ...next, fill: editing.fill } : shape), `text-${editing.id}`);
                }}
              />
            </foreignObject>
          )}
        </svg>
      </div>
    </>
  );
}

function SketchColor({ label, value, onChange, allowNone = true }) {
  return (
    <div className="sketch-color">
      <label>{label}
        <input type="color" aria-label={`Sketch ${label.toLowerCase()}`} value={value === 'none' ? '#ffffff' : value} onChange={(event) => onChange(event.target.value)} />
      </label>
      {allowNone && <label><input type="checkbox" checked={value === 'none'} onChange={(event) => onChange(event.target.checked ? 'none' : '#1f2937')} />None</label>}
    </div>
  );
}
