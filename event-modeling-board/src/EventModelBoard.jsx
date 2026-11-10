import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  useNodesInitialized,
} from '@xyflow/react';
import { pruneScenarios, ScenarioDialog, ScenariosView } from './scenarios/Scenarios.jsx';
import {
  LANES,
  LANE_HEIGHT,
  GRID,
  DEFAULT_SLICE_WIDTH,
  SLICE_MIN_WIDTH,
  KINDS,
  kindW,
  padOf,
  snap,
  pruneCopies,
  LANE_TYPES,
  LANE_TYPE_ORDER,
  REQUIRED_LANE_TYPES,
  laneAllows,
  cellIsFull,
  snapUp,
  uniqueId,
  SLICE_MIN_X,
  stickyW,
  stickyH,
  slices,
  lanesOf,
  setSliceWidth,
  minSliceWidth,
  sliceOf,
  membersOf,
  layoutSlices,
  settleStickies,
  centerStickies,
  adoptStickies,
  layered,
  cellAt,
  makeChapter,
  makeSlice,
  makeLane,
  makeEdge,
  OVERVIEW_EDGE_COLORS,
  makeEmptyBoard,
} from './model/model.js';
import { STORAGE_KEY, boardText, load, compareIds } from './state/io.js';
import { pushBoard, pullBoard, watchRevision, StaleError } from './state/sync.js';
import { cleanName } from './model/names.js';
import { InfoDialog } from './dialogs/InfoDialog.jsx';
import { FieldsDialog } from './dialogs/FieldsDialog.jsx';
import { HtmlDialog } from './dialogs/HtmlDialog.jsx';
import { MovieStrip } from './dialogs/MovieStrip.jsx';
import { SearchBox } from './Search.jsx';
import { hasFields, inheritOnConnect, parentFields, propagateFields } from './model/fields.js';
import { HistoryContext, useHistory } from './state/history.js';
import { kindOfKey, hotkeyOf, HotkeysDialog } from './dialogs/Hotkeys.jsx';
import { BoardActions } from './state/BoardActions.js';
import {
  acceptingLanes,
  spotInCell,
  autoConnections,
  cellElements,
  cellOfElement,
  selectOnly,
  confirmCopies,
  orient,
  automationLayout,
} from './model/cells.js';
import { nodeTypes } from './nodes/index.js';

// Draws the border of the selected Cell above everything else. It is positioned from the
// canvas transform, so it follows panning, zooming and moving the Chapter.
function CellHighlight({ cell }) {
  const host = useStore((s) => s.domNode?.querySelector('.react-flow__renderer'));
  const box = useStore((s) => {
    if (!cell) return null;
    const lane = s.nodeLookup.get(cell.laneId);
    const slice = s.nodeLookup.get(cell.sliceId);
    if (!lane || !slice) return null; // the lane or slice was removed
    const [tx, ty, zoom] = s.transform;
    return [
      slice.internals.positionAbsolute.x * zoom + tx,
      lane.internals.positionAbsolute.y * zoom + ty,
      slice.data.width * zoom,
      lane.data.height * zoom,
    ].join(',');
  });
  if (!box || !host) return null;
  const [left, top, width, height] = box.split(',').map(Number);
  // Drawn inside the renderer, so the element toolbar (also there) can sit above it.
  return createPortal(<div className="cell-highlight" style={{ left, top, width, height }} />, host);
}

const FILTER_KEY = 'event-model-board-context-filter';
// How far above a Chapter's box Fit view reaches, in px. The title (top -126px, 44px high) and the
// handle (top -74px) stand above the box; 100 shows the handle and the lower part of the title.
const CHAPTER_TITLE_RISE = 100;
// How long after the last change the board is pushed to the server (R10.1), in ms.
const PUSH_DELAY_MS = 1000;

function Board() {
  const saved = useMemo(() => load() ?? makeEmptyBoard(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(saved.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.edges);
  // Contexts are a list of their own; the first one is the Default (it cannot be deleted).
  const [contexts, setContexts] = useState(saved.contexts);
  // The overview (R1f): a read-only, high-level view without slice borders, titles and buttons.
  const [overview, setOverview] = useState(false);
  // The Context filter (R1b.7): the id of the only Context whose Chapters show, '' for all.
  // Kept in the browser, not in the board.
  const [contextFilter, setContextFilter] = useState(() => {
    try {
      return localStorage.getItem(FILTER_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const filterId = contexts.some((c) => c.id === contextFilter) ? contextFilter : '';
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, filterId);
    } catch {
      // ignore unavailable storage
    }
  }, [filterId]);
  const { screenToFlowPosition, getNodes, getEdges, setCenter, getZoom, fitBounds, getNodesBounds } = useReactFlow();
  // Fit view: the shown Chapters with their title and handle, which stand above a Chapter's own
  // box (R1.20), so they are not cut off.
  const fitBoard = useCallback(
    (duration = 0) => {
      const shown = getNodes().filter((n) => n.type === 'chapter' && !n.hidden);
      if (!shown.length) return;
      const b = getNodesBounds(shown);
      fitBounds({ x: b.x, y: b.y - CHAPTER_TITLE_RISE, width: b.width, height: b.height + CHAPTER_TITLE_RISE }, { padding: 0.04, duration });
    },
    [getNodes, getNodesBounds, fitBounds]
  );
  // The board opens fitted, once its Chapters are measured (R1.2).
  const nodesInitialized = useNodesInitialized();
  const openedFitted = useRef(false);
  useEffect(() => {
    if (!nodesInitialized || openedFitted.current) return;
    openedFitted.current = true;
    fitBoard();
  }, [nodesInitialized, fitBoard]);
  const canvasRef = useRef(null);

  // `count` ids that are unused on the board and different from each other.
  const newIds = (count = 1) => {
    const used = new Set([
      ...getNodes().flatMap((n) => [n.id, ...(n.data.scenarios ?? []).map((s) => s.id)]),
      ...contexts.map((c) => c.id),
    ]);
    return Array.from({ length: count }, () => uniqueId(used));
  };

  // Toolbar buttons that add things (elements, slices, lanes) act on the active Chapter:
  // the one last clicked or dragged, or the first one.
  const [activeId, setActiveId] = useState(null);
  const chapters = nodes.filter((n) => n.type === 'chapter');
  // Chapters of other Contexts than the filter's are hidden with all they hold (R1b.7). A Chapter
  // with an unknown Context counts as the Default's, as its handle shows.
  const hiddenKey = filterId
    ? chapters
        .filter((c) => (contexts.some((x) => x.id === c.data.context) ? c.data.context : contexts[0].id) !== filterId)
        .map((c) => c.id)
        .join('|')
    : '';
  const hiddenChapters = useMemo(() => new Set(hiddenKey ? hiddenKey.split('|') : []), [hiddenKey]);
  const isHidden = (n) => hiddenChapters.has(n.id) || hiddenChapters.has(n.parentId);
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const hidden = isHidden(n);
        return !!n.hidden === hidden && !(hidden && n.selected) ? n : { ...n, hidden, selected: hidden ? false : n.selected };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, hiddenChapters]
  );

  // An element arrow leaves the lower point of its source and enters the upper point of its
  // target when the target is below (same height counts as below), and the other way round
  // when the target is above. Chosen on every render, so it follows moving elements. An arrow
  // to a hidden Chapter or element is hidden too.
  const displayEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const hiddenNode = (n) => !!n && (hiddenChapters.has(n.id) || hiddenChapters.has(n.parentId));
    const centreY = (n) => (byId.get(n.parentId)?.position.y ?? 0) + n.position.y + stickyH(n) / 2;
    return edges.map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      const hidden = hiddenNode(s) || hiddenNode(t);
      const selected = hidden ? false : e.selected;
      if (s?.type !== 'sticky' || t?.type !== 'sticky') return hidden === !!e.hidden && !(hidden && e.selected) ? e : { ...e, hidden, selected };
      const down = centreY(t) >= centreY(s);
      const color = overview ? OVERVIEW_EDGE_COLORS[s.data?.kind] : undefined;
      return {
        ...e,
        hidden,
        selected,
        sourceHandle: down ? 'bottom-out' : 'top-out',
        targetHandle: down ? 'top-in' : 'bottom-in',
        ...(color
          ? {
              style: { ...e.style, stroke: color, strokeDasharray: '2 5', strokeLinecap: 'round' },
              markerEnd: { ...e.markerEnd, color },
            }
          : {}),
      };
    });
  }, [nodes, edges, hiddenChapters, overview]);
  const visibleChapters = chapters.filter((c) => !hiddenChapters.has(c.id));
  const active = visibleChapters.find((c) => c.id === activeId) ?? visibleChapters[0];
  const activeChapterId = active?.id;

  // The selected Cell, if any: { chapterId, laneId, sliceId }. Selection only: it is not
  // saved, exported or recorded for undo.
  const [selectedCell, setSelectedCell] = useState(null);
  // Nothing hidden stays selected: its Cell, or it, could still be acted on by a hotkey.
  useEffect(() => {
    if (!hiddenChapters.size) return;
    const hidden = (n) => hiddenChapters.has(n.id) || hiddenChapters.has(n.parentId);
    setSelectedCell((c) => (c && hiddenChapters.has(c.chapterId) ? null : c));
    setNodes((ns) => (ns.some((n) => n.selected && hidden(n)) ? ns.map((n) => (n.selected && hidden(n) ? { ...n, selected: false } : n)) : ns));
    const byId = new Map(getNodes().map((n) => [n.id, n]));
    const hiddenEdge = (e) => hidden(byId.get(e.source) ?? {}) || hidden(byId.get(e.target) ?? {});
    setEdges((es) => (es.some((e) => e.selected && hiddenEdge(e)) ? es.map((e) => (e.selected && hiddenEdge(e) ? { ...e, selected: false } : e)) : es));
  }, [hiddenChapters, setNodes, setEdges, getNodes]);
  // Changing the filter fits the view to the Chapters that show (R1b.7), not on the first render.
  const filterShown = useRef(filterId);
  useEffect(() => {
    if (filterShown.current === filterId) return;
    filterShown.current = filterId;
    setTimeout(() => fitBoard(300), 50);
  }, [filterId, fitBoard]);
  // The Chapter, lane or slice whose info is being edited.
  const [infoId, setInfoId] = useState(null);
  const [infoReading, setInfoReading] = useState(false); // the info panel opens in read mode
  // The Context whose info is being edited (toolbar button).
  const [contextInfoId, setContextInfoId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // The element whose title is to be edited (asked for by the Enter hotkey).
  const [titleEditId, setTitleEditId] = useState(null);
  // The scenario being edited: { nodeId, scenarioId } (scenarioId null for a new one).
  const [scenarioEdit, setScenarioEdit] = useState(null);
  // The element whose fields popup is open.
  const [fieldsId, setFieldsId] = useState(null);
  // The Screen whose HTML mockup is being edited.
  const [htmlId, setHtmlId] = useState(null);
  const [htmlReading, setHtmlReading] = useState(false); // the popup opens in preview mode
  // The Scenarios element whose scenarios are shown in the read-only view.
  const [scenariosViewId, setScenariosViewId] = useState(null);
  // The Chapter whose movie strip is open.
  const [movieId, setMovieId] = useState(null);
  const scenarioOpen = useRef(false);
  scenarioOpen.current = !!scenarioEdit || !!infoId || !!contextInfoId || !!fieldsId || !!htmlId || !!scenariosViewId || !!movieId;
  // The search box (R1e): whether it is open, and a counter that refocuses it on Ctrl+F.
  const [search, setSearch] = useState({ open: false, tick: 0 });
  const modalOpen = useRef(false);
  modalOpen.current = scenarioOpen.current || helpOpen;
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
      if (modalOpen.current) return;
      e.preventDefault(); // not the browser's find
      setSearch((s) => ({ open: true, tick: s.tick + 1 }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Ctrl+H switches the high level view on and off; Esc switches it off.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || modalOpen.current) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        setOverview(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'h') return;
      e.preventDefault(); // not the browser's history
      setOverview((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (overview) setSelectedCell(null);
  }, [overview]);
  const searchItems = useMemo(() => {
    if (!search.open) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const abs = (n) => [(byId.get(n.parentId)?.position.x ?? 0) + n.position.x, (byId.get(n.parentId)?.position.y ?? 0) + n.position.y];
    return nodes
      .filter((n) => n.type === 'sticky' && !hiddenChapters.has(n.parentId))
      .map((n) => ({
        id: n.id,
        kind: n.data.kind,
        name: (n.data.copyOf ? byId.get(n.data.copyOf)?.data.name : n.data.name)?.trim() ?? '',
        copy: !!n.data.copyOf,
        at: abs(n),
      }))
      .filter((i) => i.name)
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  }, [nodes, search.open, hiddenChapters]);
  const [notice, setNotice] = useState(null);
  const infoNode = nodes.find((n) => n.id === infoId);
  // A Notes element keeps its Markdown in `markdown`; Chapters, lanes and slices in `info`.
  const infoField = infoNode?.data.kind === 'notes' ? 'markdown' : 'info';
  const saveInfo = (text) => {
    const value = text.trim() ? text : '';
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== infoId) return n;
        const { [infoField]: _old, ...rest } = n.data;
        return { ...n, data: value ? { ...rest, [infoField]: value } : rest };
      })
    );
    setInfoId(null);
  };
  // Saves the fields of the open element and copies the new ones it was asked to propagate
  // down the chain, as one undo step.
  const fieldsNode = nodes.find((n) => n.id === fieldsId);
  // The Screen's mockup is saved on its own: HTML code, or a URL which replaces it (the code is
  // cleared); blank ones are removed. A linked copy opens its original's mockup, read-only (R3.22).
  const htmlTarget = htmlId && nodes.find((n) => n.id === htmlId && n.data.kind === 'screen');
  const htmlCopy = !!htmlTarget?.data.copyOf;
  const htmlNode = htmlCopy ? nodes.find((n) => n.id === htmlTarget.data.copyOf) : htmlTarget;
  const saveHtml = (text, url) => {
    const id = htmlId;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const { html: _html, url: _url, ...rest } = n.data;
        if (url) return { ...n, data: { ...rest, url } };
        return { ...n, data: text.trim() ? { ...rest, html: text } : rest };
      })
    );
    setHtmlId(null);
  };
  const saveFields = (fields, propagate) => {
    const id = fieldsId;
    const es = getEdges();
    setNodes((ns) =>
      propagateFields(
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, fields } } : n)),
        es,
        id,
        propagate
      )
    );
    setFieldsId(null);
  };
  const focusChapter = (node) =>
    setActiveId(node.type === 'chapter' ? node.id : node.parentId ?? null);

  // Selects the Cell of an element, leaving the selected elements as they are (R5a.12).
  const selectCellOf = (id) => {
    const ns = getNodes();
    const n = ns.find((m) => m.id === id);
    setSelectedCell((n && cellOfElement(ns, n)) ?? null);
  };

  // Selects a Cell and, when it holds exactly one element, that element too (R5a.12). The
  // element is selected after the event: the canvas clears the selection when a click on it ends.
  const chooseCell = (cell) => {
    setSelectedCell(cell);
    setTimeout(() => {
      setNodes((ns) => {
        const inCell = cellElements(ns, cell);
        return selectOnly(ns, inCell.length === 1 ? inCell[0].id : null);
      });
    }, 0);
  };

  // Focuses an element found by the search: selects it and its Cell, makes its Chapter active
  // and moves the view to it, zoomed in to at least 100% (R1e).
  const goToElement = (id) => {
    const ns = getNodes();
    const n = ns.find((m) => m.id === id);
    if (!n) return;
    const parent = ns.find((m) => m.id === n.parentId);
    setSearch((s) => ({ ...s, open: false }));
    setNodes((cur) => selectOnly(cur, id));
    selectCellOf(id);
    focusChapter(n);
    setCenter((parent?.position.x ?? 0) + n.position.x + stickyW(n) / 2, (parent?.position.y ?? 0) + n.position.y + stickyH(n) / 2, {
      zoom: Math.max(getZoom(), 1),
      duration: 400,
    });
  };

  // Moves the view to the original of a linked copy and selects it (R3.22).
  const goToOriginal = (copyId) => {
    const ns = getNodes();
    const original = ns.find((m) => m.id === ns.find((c) => c.id === copyId)?.data.copyOf);
    if (!original) return;
    const parent = ns.find((m) => m.id === original.parentId);
    setNodes((cur) => selectOnly(cur, original.id));
    selectCellOf(original.id);
    focusChapter(original);
    setCenter(
      (parent?.position.x ?? 0) + original.position.x + stickyW(original) / 2,
      (parent?.position.y ?? 0) + original.position.y + stickyH(original) / 2,
      { duration: 400 }
    );
  };

  // ---- Undo / redo (in memory only) ----
  const restore = useCallback(
    (snap) => {
      setNodes(snap.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges(snap.edges.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setContexts(snap.contexts);
      setSelectedCell(null);
    },
    [setNodes, setEdges]
  );
  const historyBlocked = useRef(false); // no undo or redo behind a popup or in the overview
  historyBlocked.current = scenarioOpen.current || overview;
  const { hist, undo, redo, api: historyApi, markSilent, gesture, settled } = useHistory({
    nodes,
    edges,
    contexts,
    restore,
    blocked: historyBlocked,
  });

  // The board is saved and checked (below) when a drag or resize ends, not on every frame of it.
  const savedText = useRef(null);
  useEffect(() => {
    if (gesture.current > 0) return;
    try {
      const text = boardText(nodes, edges, contexts);
      if (text === savedText.current) return;
      localStorage.setItem(STORAGE_KEY, text);
      savedText.current = text;
    } catch {
      // ignore unavailable storage
    }
  }, [nodes, edges, contexts, gesture, settled]);

  // Scenarios whose Events/Commands were deleted (or left the Chapter) are deleted too. The
  // change is folded into the user's operation (see markSilent).
  useEffect(() => {
    if (gesture.current > 0) return;
    const pruned = pruneScenarios(nodes);
    if (!pruned) return;
    markSilent();
    setNodes(pruned.nodes);
    setNotice(
      `Deleted ${pruned.removed.length === 1 ? 'the scenario' : 'the scenarios'} ${pruned.removed
        .map((t) => `"${t}"`)
        .join(', ')}: an element used in ${pruned.removed.length === 1 ? 'it' : 'them'} was deleted or left the Chapter.`
    );
  }, [nodes, setNodes, markSilent, gesture, settled]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Linked copies are deleted with their original, in the same undo step (R3.22).
  useEffect(() => {
    if (gesture.current > 0) return;
    const pruned = pruneCopies(nodes);
    if (!pruned) return;
    markSilent();
    setNodes(pruned.nodes);
    setEdges((es) => es.filter((e) => !pruned.gone.has(e.source) && !pruned.gone.has(e.target)));
  }, [nodes, setNodes, setEdges, markSilent, gesture, settled]);

  // Chapter arrows only join Chapters of one Context (R1b.8): those that no longer do (a Context
  // changed or deleted, a loaded or pulled board) are removed, as part of the user's operation.
  useEffect(() => {
    if (gesture.current > 0) return;
    const context = new Map(nodes.filter((n) => n.type === 'chapter').map((n) => [n.id, n.data.context]));
    const crossing = (e) => context.has(e.source) && context.has(e.target) && context.get(e.source) !== context.get(e.target);
    if (!edges.some(crossing)) return;
    markSilent();
    setEdges((es) => es.filter((e) => !crossing(e)));
  }, [nodes, edges, setEdges, markSilent, gesture, settled]);

  // The original of the linked copies made with Ctrl+C / Ctrl+V; memory only.
  const clipboard = useRef(null);
  const rememberCopy = useCallback((id) => {
    const element = getNodes().find((n) => n.id === id);
    if (element?.type === 'sticky' && !['scenarios', 'notes'].includes(element.data.kind)) {
      clipboard.current = element.data.copyOf ?? element.id;
    }
  }, [getNodes]);
  // Puts "Context <id> Chapter <id> [Slice <id> [Element <id>]]" in the system clipboard; `{ elementId }`
  // (its slice is worked out), `{ sliceId }` (no element) or `{ chapterId }` (no slice).
  const copyContext = useCallback(
    ({ elementId, sliceId, chapterId }) => {
      const ns = getNodes();
      const element = elementId ? ns.find((n) => n.id === elementId) : null;
      const slice = chapterId ? null : element ? sliceOf(slices(ns), element) : ns.find((n) => n.id === sliceId);
      const chapter = chapterId ? ns.find((n) => n.id === chapterId) : slice && ns.find((n) => n.id === slice.parentId);
      if (!chapter) return;
      const context = contexts.some((c) => c.id === chapter.data.context) ? chapter.data.context : contexts[0].id;
      const text = `Context ${context} Chapter ${chapter.id}${slice ? ` Slice ${slice.id}` : ''}${element ? ` Element ${element.id}` : ''}`;
      navigator.clipboard.writeText(text).then(
        () => setNotice(`Copied: ${text}`),
        () => setNotice('Could not copy to the clipboard.')
      );
    },
    [getNodes, contexts]
  );
  // Hotkeys of a selected Cell (R5a.11). The handler is assigned further down, where the
  // actions it needs are defined; this listener stays registered.
  const cellKeys = useRef(null);
  useEffect(() => {
    const onKey = (e) => cellKeys.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Slices are laid out automatically, so they cannot be dragged.
  const handleNodesChange = useCallback(
    (changes) => {
      const current = getNodes();
      let byId; // built only when a change needs the lookup
      const find = (id) => (byId ??= new Map(current.map((n) => [n.id, n]))).get(id);
      const isSliceId = (id) => find(id)?.type === 'slice';
      const isHiddenId = (id) => !!find(id)?.hidden;
      const kept = changes.filter(
        (c) => !(c.type === 'position' && isSliceId(c.id)) && !(c.type === 'select' && c.selected && isHiddenId(c.id))
      );
      onNodesChange(kept);
      // Measured sizes arrive after render (e.g. a Screen widening for its mockup).
      if (kept.some((c) => c.type === 'dimensions')) {
        const stickyIds = new Set(getNodes().filter((n) => n.type === 'sticky').map((n) => n.id));
        if (kept.some((c) => c.type === 'dimensions' && stickyIds.has(c.id))) {
          markSilent();
          setNodes((ns) => centerStickies(settleStickies(ns)));
        }
      }
    },
    [onNodesChange, getNodes, setNodes, markSilent]
  );

  // Deleting a slice also deletes its elements (after confirmation) and closes the gap. The
  // last slice of a Chapter cannot be deleted.
  const removeSlice = (sliceId, alwaysAsk = false) => {
    const slice = nodes.find((n) => n.id === sliceId);
    if (!slice || slices(nodes, slice.parentId).length <= 1) return;
    const doomed = membersOf(nodes).get(sliceId) ?? [];
    if (doomed.length || alwaysAsk) {
      const text = doomed.length ? `Delete the slice and its ${doomed.length} element(s)?` : 'Delete this slice?';
      if (!window.confirm(text)) return;
    }
    const gone = new Set([sliceId, ...doomed.map((n) => n.id)]);
    if (!confirmCopies(nodes, gone)) return;
    const ss = slices(nodes, slice.parentId);
    const i = ss.findIndex((s) => s.id === sliceId);
    const neighbour = ss[i - 1] ?? ss[i + 1]; // the previous slice, else the one that becomes first
    setNodes(layoutSlices(nodes.filter((n) => !gone.has(n.id)), nodes));
    setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    setActiveId(slice.parentId);
    const top = lanesOf(nodes, slice.parentId)[0];
    if (neighbour && top) chooseCell({ chapterId: slice.parentId, laneId: top.id, sliceId: neighbour.id });
    else setSelectedCell((c) => (c?.sliceId === sliceId ? null : c));
  };

  // Selects the top Cell of a slice that was just created.
  const selectTopCellOf = (chapterId, sliceId) => {
    const top = lanesOf(getNodes(), chapterId)[0];
    if (top) chooseCell({ chapterId, laneId: top.id, sliceId });
  };

  const addSlice = () => {
    if (!activeChapterId) return;
    const [id] = newIds();
    setNodes((ns) => {
      // (end is the right edge of the last slice; layout then widens the Chapter if needed)
      const end = slices(ns, activeChapterId).reduce(
        (max, n) => Math.max(max, n.position.x + n.data.width),
        SLICE_MIN_X
      );
      return layoutSlices(
        layered([...ns, makeSlice(id, end, DEFAULT_SLICE_WIDTH, 'New Slice', activeChapterId)]),
        ns,
        activeChapterId
      );
    });
    selectTopCellOf(activeChapterId, id);
  };

  // Inserts a slice immediately after `sliceId`. The later slices (and their elements)
  // move right to make room. The new slice starts 1px before the next slice so that the
  // layout, which orders slices by position, puts it between the two.
  const addSliceAfter = (sliceId) => {
    const [id] = newIds();
    setNodes((ns) => {
      const cur = ns.find((n) => n.id === sliceId);
      if (!cur) return ns;
      const added = makeSlice(
        id,
        cur.position.x + cur.data.width - 1,
        DEFAULT_SLICE_WIDTH,
        'New Slice',
        cur.parentId
      );
      return layoutSlices(layered([...ns, added]), ns, cur.parentId);
    });
    setActiveId(nodes.find((n) => n.id === sliceId)?.parentId ?? null);
    const chapterId = nodes.find((n) => n.id === sliceId)?.parentId;
    if (chapterId) selectTopCellOf(chapterId, id);
  };

  // Inserts a lane of `type` (the lane's own type or one of its next types, R2.10). Of the same
  // type it goes right below `laneId`; of another type, below the last lane that comes before
  // that type, so the lane order is kept. The lanes below and their elements move down.
  const addLaneAfter = (laneId, type) => {
    const [id] = newIds();
    setNodes((ns) => {
      const lane = ns.find((n) => n.id === laneId);
      if (!lane) return ns;
      const rank = (l) => LANE_TYPE_ORDER.indexOf(l.data.type);
      const anchor =
        type === lane.data.type
          ? lane
          : lanesOf(ns, lane.parentId).filter((l) => rank(l) < LANE_TYPE_ORDER.indexOf(type)).pop();
      if (!anchor) return ns;
      const below = anchor.position.y + anchor.data.height;
      const shifted = ns.map((n) =>
        n.parentId === lane.parentId &&
        (n.type === 'lane' || n.type === 'sticky') &&
        n.position.y >= below
          ? { ...n, position: { ...n.position, y: n.position.y + LANE_HEIGHT } }
          : n
      );
      return layered([
        ...shifted,
        makeLane(id, lane.parentId, type, LANE_TYPES[type].label, below, 'none', lane.data.width),
      ]);
    });
    setActiveId(nodes.find((n) => n.id === laneId)?.parentId ?? null);
  };

  const removeLane = useCallback(
    (laneId) => {
      const lane = nodes.find((n) => n.id === laneId);
      if (!lane) return;
      const chapterId = lane.parentId;
      const sameType = lanesOf(nodes, chapterId).filter((l) => l.data.type === lane.data.type);
      if (REQUIRED_LANE_TYPES.includes(lane.data.type) && sameType.length <= 1) return;
      const top = lane.position.y;
      const bottom = top + lane.data.height;
      const mine = (n) => n.parentId === chapterId;
      const inLane = (n) =>
        n.type === 'sticky' && mine(n) && n.position.y >= top && n.position.y < bottom;
      const doomed = nodes.filter(inLane);
      if (
        doomed.length &&
        !window.confirm(`Remove this lane and its ${doomed.length} note(s)?`)
      )
        return;
      const gone = new Set([laneId, ...doomed.map((n) => n.id)]);
      if (!confirmCopies(nodes, gone)) return;
      setNodes(
        nodes
          .filter((n) => !gone.has(n.id))
          .map((n) =>
            mine(n) && (n.type === 'sticky' || n.type === 'lane') && n.position.y >= bottom
              ? { ...n, position: { ...n.position, y: n.position.y - lane.data.height } }
              : n
          )
      );
      setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    },
    [nodes, setNodes, setEdges]
  );

  // A new Chapter starts empty (default lanes, no slices) to the right of the others,
  // and the view pans to it.
  const addChapter = () => {
    const [id, sliceId, ...laneIds] = newIds(2 + LANES.length);
    const width = SLICE_MIN_X + DEFAULT_SLICE_WIDTH;
    // Centre the new Chapter on the middle of what is currently visible.
    const box = canvasRef.current?.getBoundingClientRect();
    const mid = box
      ? screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
      : { x: width / 2, y: (LANES.length * LANE_HEIGHT) / 2 };
    const x = snap(mid.x - width / 2);
    const y = snap(mid.y - (LANES.length * LANE_HEIGHT) / 2);
    setNodes((ns) =>
      layered([
        ...ns,
        makeChapter(id, x, y, `Chapter ${chapters.length + 1}`, filterId || contexts[0].id),
        ...LANES.map((l, i) => makeLane(laneIds[i], id, l.type, l.label, l.y, 'none', width)),
        makeSlice(sliceId, SLICE_MIN_X, DEFAULT_SLICE_WIDTH, 'New Slice', id),
      ])
    );
    setActiveId(id);
  };

  const removeChapter = useCallback(
    (chapterId) => {
      const kids = nodes.filter((n) => n.parentId === chapterId);
      const sliceCount = kids.filter((n) => n.type === 'slice').length;
      const elementCount = kids.filter((n) => n.type === 'sticky').length;
      if (
        (sliceCount || elementCount) &&
        !window.confirm(
          `Remove this Chapter with its ${sliceCount} slice(s) and ${elementCount} element(s)?`
        )
      )
        return;
      const gone = new Set([chapterId, ...kids.map((n) => n.id)]);
      if (!confirmCopies(nodes, gone)) return;
      setNodes(nodes.filter((n) => !gone.has(n.id)));
      setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    },
    [nodes, setNodes, setEdges]
  );

  // Each slice shrinks (or grows) to its elements plus the minimal margins; empty slices get
  // the default width. Elements are left aligned, not centred. An automation or translation slice
  // (one Read Model, Command and Processor, an Event) gets its own layout (R5.20a). Otherwise, if every Cell of the slice holds
  // at most one element, each starts at the left margin; otherwise all elements keep their layout
  // and move together so that the left-most starts at the left margin.
  // Later slices move left. With `onlySliceId` only that slice is compacted.
  const compactChapter = useCallback(
    (chapterId, onlySliceId) => {
      setNodes((ns) => {
        const members = membersOf(ns);
        const lanes = lanesOf(ns, chapterId);
        const laneIdOf = (n) => {
          const mid = n.position.y + stickyH(n) / 2;
          return lanes.find((l) => mid >= l.position.y && mid < l.position.y + l.data.height)?.id;
        };
        const widths = new Map();
        const shifts = new Map();
        for (const sl of slices(ns, chapterId)) {
          if (onlySliceId && sl.id !== onlySliceId) continue;
          const els = members.get(sl.id) ?? [];
          if (!els.length) {
            widths.set(sl.id, DEFAULT_SLICE_WIDTH);
            continue;
          }
          const w = stickyW;
          const isIntegration = (n) => lanes.find((l) => l.id === laneIdOf(n))?.data.type === 'integration';
          const auto = automationLayout(els, laneIdOf, isIntegration, sl.position.x);
          if (auto) {
            widths.set(sl.id, Math.max(SLICE_MIN_WIDTH, snapUp(auto.width)));
            for (const n of els) shifts.set(n.id, auto.xs.get(n.id) - n.position.x);
            continue;
          }
          const cells = new Map();
          for (const n of els) cells.set(laneIdOf(n), [...(cells.get(laneIdOf(n)) ?? []), n]);
          const crowded = [...cells.values()].some((c) => c.length > 1);
          if (!crowded) {
            // One element per Cell: each starts at the left margin.
            const width = Math.max(
              SLICE_MIN_WIDTH,
              snapUp(Math.max(...els.map((n) => w(n) + 2 * padOf(n.data.kind))))
            );
            widths.set(sl.id, width);
            for (const n of els) {
              shifts.set(n.id, padOf(n.data.kind) - (n.position.x - sl.position.x));
            }
          } else {
            // Some Cell holds several: all elements keep their layout, moved together so that the
            // left-most starts at the left margin.
            const left = Math.min(...els.map((n) => n.position.x - padOf(n.data.kind)));
            const right = Math.max(...els.map((n) => n.position.x + w(n) + padOf(n.data.kind)));
            widths.set(sl.id, Math.max(SLICE_MIN_WIDTH, snapUp(right - left)));
            els.forEach((n) => shifts.set(n.id, sl.position.x - left));
          }
        }
        const moved = ns.map((n) => {
          if (widths.has(n.id)) return { ...n, data: { ...n.data, width: widths.get(n.id) } };
          if (shifts.has(n.id)) return { ...n, position: { ...n.position, x: n.position.x + shifts.get(n.id) } };
          return n;
        });
        return layoutSlices(moved, ns);
      });
      setActiveId(chapterId);
    },
    [setNodes]
  );

  const setChapterContext = (chapterId, contextId) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === chapterId ? { ...n, data: { ...n.data, context: contextId } } : n))
    );

  // Creates a Context and assigns it to the Chapter.
  const addContext = (chapterId) => {
    const name = cleanName(window.prompt('Name of the new context') ?? '');
    if (!name) return;
    const [id] = newIds();
    setContexts((cs) => [...cs, { id, name }]);
    setChapterContext(chapterId, id);
  };

  // Renames the Context for every Chapter that shares it.
  const renameContext = (contextId) => {
    const current = contexts.find((c) => c.id === contextId);
    const name = cleanName(window.prompt('Rename the context', current?.name) ?? '');
    if (!name) return;
    setContexts((cs) => cs.map((c) => (c.id === contextId ? { ...c, name } : c)));
  };

  // Saves the info of the Context whose info popup is open, as one undo step.
  const saveContextInfo = (text) => {
    setContexts((cs) =>
      cs.map((c) => {
        if (c.id !== contextInfoId) return c;
        const next = { ...c };
        delete next.info;
        if (text.trim()) next.info = text;
        return next;
      })
    );
    setContextInfoId(null);
  };
  const contextInfo = contexts.find((c) => c.id === contextInfoId);

  // The Default (first) Context cannot be deleted; its Chapters' Contexts move to it.
  // Deleting the filtered Context clears the filter.
  const removeContext = (contextId) => {
    const fallback = contexts[0];
    if (!contextId || contextId === fallback.id) return;
    const used = chapters.filter((c) => c.data.context === contextId).length;
    if (!window.confirm(`Delete this context? ${used} chapter(s) move to "${fallback.name}".`)) return;
    setContexts((cs) => cs.filter((c) => c.id !== contextId));
    if (filterId === contextId) setContextFilter('');
    setNodes((ns) =>
      ns.map((n) =>
        n.type === 'chapter' && n.data.context === contextId
          ? { ...n, data: { ...n.data, context: fallback.id } }
          : n
      )
    );
  };

  // The context hands out these actions through `latest`, so its value does not change with every
  // change of the nodes (which would re-render every node); each call still runs the newest version.
  const latest = useRef({});
  latest.current = {
    goToOriginal,
    newIds,
    setChapterContext,
    addContext,
    addSliceAfter,
    removeSlice,
    chooseCell,
    addLaneAfter,
    removeLane,
    removeChapter,
  };
  const boardActions = useMemo(
    () => ({
      overview,
      // The overview is read-only: the actions that edit do nothing there; the views still open.
      editScenario: (nodeId, scenarioId) => !overview && setScenarioEdit({ nodeId, scenarioId }),
      viewScenarios: setScenariosViewId,
      goToOriginal: (...args) => latest.current.goToOriginal(...args),
      newScenarioId: () => latest.current.newIds()[0],
      rememberCopy,
      copyContext,
      contexts,
      setChapterContext: (...args) => latest.current.setChapterContext(...args),
      addContext: (...args) => latest.current.addContext(...args),
      activate: setActiveId,
      openInfo: (id) => {
        if (overview) return;
        setInfoReading(false);
        setInfoId(id);
      },
      readInfo: (id) => {
        setInfoReading(true);
        setInfoId(id);
      },
      openFields: (id) => !overview && setFieldsId(id),
      openHtml: (id) => {
        if (overview) return;
        setHtmlReading(false);
        setHtmlId(id);
      },
      viewHtml: (id) => {
        setHtmlReading(true);
        setHtmlId(id);
      },
      openMovie: setMovieId,
      titleEditId,
      clearTitleEdit: () => setTitleEditId(null),
      clearCell: () => setSelectedCell(null),
      addSliceAfter: (...args) => latest.current.addSliceAfter(...args),
      removeSlice: (...args) => latest.current.removeSlice(...args),
      selectCell: (cell) => {
        latest.current.chooseCell(cell);
        setActiveId(cell.chapterId);
      },
      addLaneAfter: (...args) => latest.current.addLaneAfter(...args),
      removeLane: (...args) => latest.current.removeLane(...args),
      removeChapter: (...args) => latest.current.removeChapter(...args),
      compactChapter,
      activeId: activeChapterId,
    }),
    [compactChapter, activeChapterId, contexts, rememberCopy, copyContext, titleEditId, overview]
  );

  const scenariosViewNode = scenariosViewId && nodes.find((n) => n.id === scenariosViewId);
  // The Screens of the movie strip's Chapter in reading order (R11.2); a linked copy shows its original.
  const movieScreens = useMemo(() => {
    if (!movieId) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const all = slices(nodes);
    const order = new Map(slices(nodes, movieId).map((s, i) => [s.id, i]));
    return nodes
      .filter((n) => n.type === 'sticky' && n.parentId === movieId && n.data.kind === 'screen')
      .map((n) => ({ n, slice: order.get(sliceOf(all, n)?.id) ?? 0 }))
      .sort((a, b) => a.slice - b.slice || a.n.position.x - b.n.position.x || a.n.position.y - b.n.position.y || compareIds(a.n.id, b.n.id))
      .map(({ n }) => {
        const shown = n.data.copyOf ? byId.get(n.data.copyOf)?.data ?? {} : n.data;
        return { id: n.id, name: (shown.name ?? '').trim(), html: shown.html, url: shown.url };
      });
  }, [nodes, movieId]);
  // The scenario popup: the Events and Commands of the Scenarios element's Chapter are offered.
  const scenarioNode = scenarioEdit && nodes.find((n) => n.id === scenarioEdit.nodeId);
  const editedScenario = scenarioNode?.data.scenarios?.find((s) => s.id === scenarioEdit.scenarioId) ?? null;
  const scenarioCandidates = useMemo(() => {
    if (!scenarioNode) return [];
    const ss = slices(nodes, scenarioNode.parentId);
    return nodes
      .filter(
        (n) =>
          n.type === 'sticky' &&
          n.parentId === scenarioNode.parentId &&
          !n.data.copyOf &&
          (n.data.kind === 'event' || n.data.kind === 'command')
      )
      .map((n) => ({
        id: n.id,
        kind: n.data.kind,
        name: n.data.name,
        fields: n.data.fields ?? [],
        where: sliceOf(ss, n)?.data.name ?? '',
        order: [sliceOf(ss, n)?.position.x ?? 0, n.position.x, n.position.y],
      }))
      .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]);
  }, [nodes, scenarioNode]);

  const saveScenario = (scenario) => {
    const { nodeId } = scenarioEdit;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const list = n.data.scenarios;
        const next = scenario.id
          ? list.map((s) => (s.id === scenario.id ? scenario : s))
          : [...list, { ...scenario, id: newIds()[0] }];
        return { ...n, data: { ...n.data, scenarios: next } };
      })
    );
    setScenarioEdit(null);
  };

  // Sync with the server (R10.1 to R10.7). `serverText` is the board's file (R6.2) as of the last
  // pull or push, so a board that differs has changes not yet pushed.
  const serverRevision = useRef(null);
  const serverText = useRef(null);
  const syncing = useRef(false);
  const ownRevisions = useRef(new Set());
  const latestBoard = useRef(null);
  latestBoard.current = { nodes, edges, contexts };
  const [syncTick, setSyncTick] = useState(0);

  const rememberPushes = (revision, pushed) => {
    serverRevision.current = revision;
    pushed.forEach((r) => ownRevisions.current.add(r));
  };

  const pullFromServer = async () => {
    syncing.current = true;
    try {
      const opening = serverRevision.current === null;
      const board = latestBoard.current;
      const dropsChanges = !opening && boardText(board.nodes, board.edges, board.contexts) !== serverText.current;
      const pulled = await pullBoard();
      // Opening is not an undo step: undo must not bring back the saved board (R10.2).
      if (opening) markSilent();
      setSelectedCell(null);
      setActiveId(null);
      setNodes(pulled.board.nodes);
      setEdges(pulled.board.edges);
      setContexts(pulled.board.contexts);
      serverRevision.current = pulled.revision;
      serverText.current = boardText(pulled.board.nodes, pulled.board.edges, pulled.board.contexts);
      if (!opening) {
        setNotice(
          dropsChanges
            ? "The server model changed: the board's own changes were replaced by it."
            : 'The board was updated with the changes made on the server.'
        );
      }
    } catch (err) {
      setNotice(`Could not pull from the server: ${err.message}`);
    } finally {
      syncing.current = false;
    }
  };

  const pushToServer = async (board) => {
    if (syncing.current || serverRevision.current === null) return;
    syncing.current = true;
    let outcome = 'failed';
    try {
      const pushed = await pushBoard(board.nodes, board.edges, board.contexts, serverRevision.current);
      rememberPushes(pushed.revision, pushed.pushed);
      serverText.current = boardText(board.nodes, board.edges, board.contexts);
      outcome = 'pushed';
    } catch (err) {
      if (err.pushed) rememberPushes(err.revision, err.pushed);
      if (err instanceof StaleError) outcome = 'stale';
      else setNotice(`Could not push to the server: ${err.message}`);
    } finally {
      syncing.current = false;
    }
    if (outcome === 'stale') pullFromServer();
    else if (outcome === 'pushed') setSyncTick((t) => t + 1);
  };

  // Auto-push (R10.1): 1 s after the last change, the board is pushed. A failure is retried with the
  // next change.
  useEffect(() => {
    if (serverRevision.current === null) return;
    if (boardText(nodes, edges, contexts) === serverText.current) return;
    const timer = setTimeout(() => pushToServer({ nodes, edges, contexts }), PUSH_DELAY_MS);
    return () => clearTimeout(timer);
    // pushToServer only uses refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, contexts, syncTick]);

  // Open and auto-pull (R10.2, R10.6): the server model replaces the board when it has no known
  // revision (opening, or after a lost connection that never answered) or a revision of someone else.
  useEffect(
    () =>
      watchRevision((revision) => {
        if (syncing.current) return;
        const known = serverRevision.current;
        if (known !== null && (revision === known || ownRevisions.current.has(revision))) return;
        pullFromServer();
      }),
    // pullFromServer only uses refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isValidConnection = useCallback(
    (c) => {
      const o = orient(getNodes(), c);
      return !!o && !getEdges().some((e) => e.source === o[0] && e.target === o[1]);
    },
    [getNodes, getEdges]
  );

  const onConnect = useCallback(
    (c) => {
      const o = orient(getNodes(), c);
      if (!o || !isValidConnection(c)) return;
      const fromChapter = getNodes().find((n) => n.id === o[0])?.type === 'chapter';
      const edge = makeEdge(o[0], o[1], fromChapter);
      setEdges((es) => [...es, edge]);
      if (!fromChapter) setNodes((ns) => inheritOnConnect(ns, [...getEdges(), edge], [o]));
    },
    [setEdges, setNodes, getNodes, getEdges, isValidConnection]
  );

  // An element is only created in a Cell. A `drop` ({ cell, x }) puts it in that Cell at
  // x (relative to its Chapter); else the selected Cell is used (see spotInCell); with
  // neither, nothing is added. The arrows of R4.8 are added in the same step. With `copyOf`
  // (the id of an original) the element is a linked copy of it (R3.22).
  const addSticky = (kind, drop, copyOf) => {
    const [id] = newIds();
    const ns = getNodes();
    const find = (i) => ns.find((n) => n.id === i);
    if (copyOf && !find(copyOf)) return;
    const cellRef = drop?.cell ?? selectedCell;
    const lane = cellRef && find(cellRef.laneId);
    const slice = cellRef && find(cellRef.sliceId);
    if (!lane || !slice || !laneAllows(lane, kind) || cellIsFull(ns, lane, slice)) return;
    const x = drop?.x;

    let base = ns;
    let pos;
    const spot = spotInCell(ns, lane, slice, kind);
    if (x === undefined || spot.empty) {
      pos = { x: spot.x, y: spot.y };
      if (spot.sliceWidth > slice.data.width) {
        // Make room: widen the slice; the slices after it (and their elements) move right.
        base = layoutSlices(setSliceWidth(ns, slice.id, spot.sliceWidth), ns);
      }
    } else {
      pos = { x: Math.max(slice.position.x + padOf(kind), x), y: lane.position.y + 40 };
    }
    const only = new Set([id]);
    const next = centerStickies(
      settleStickies(
        [
          ...base,
          {
            id,
            type: 'sticky',
            parentId: slice.parentId,
            position: pos,
            data: { kind, name: '', ...(copyOf ? { copyOf } : {}), ...(kind === 'scenarios' ? { scenarios: [] } : {}) },
          },
        ],
        only
      ),
      only
    );
    const inSelectedCell =
      selectedCell && selectedCell.laneId === lane.id && selectedCell.sliceId === slice.id;
    const have = new Set(getEdges().map((e) => `${e.source}>${e.target}`));
    const added = autoConnections(next, next.find((n) => n.id === id))
      .filter(([s, t]) => !have.has(`${s}>${t}`))
      .map(([s, t]) => makeEdge(s, t, false));
    // The new arrows bring the fields of their sources along (R9.4).
    const result = added.length
      ? inheritOnConnect(next, [...getEdges(), ...added], added.map((e) => [e.source, e.target]))
      : next;
    setNodes(inSelectedCell ? selectOnly(result, id) : result);
    if (added.length) setEdges((es) => [...es, ...added]);
  };

  // Deletes the elements of a Cell, with their arrows, after confirmation.
  const removeCellElements = (cell) => {
    const ns = getNodes();
    const lane = ns.find((n) => n.id === cell.laneId);
    const slice = ns.find((n) => n.id === cell.sliceId);
    if (!lane || !slice) return;
    const inCell = (membersOf(ns).get(slice.id) ?? []).filter((n) => {
      const mid = n.position.y + stickyH(n) / 2;
      return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
    });
    if (!inCell.length) return;
    if (!window.confirm(`Delete the ${inCell.length} element(s) in this Cell?`)) return;
    const gone = new Set(inCell.map((n) => n.id));
    if (!confirmCopies(ns, gone)) return;
    setNodes(ns.filter((n) => !gone.has(n.id)));
    setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
  };

  // Makes a slice wider or narrower by `delta` px, within its limits (one undo step). The
  // slices after it, their elements and a grown Chapter follow.
  const resizeSlice = (sliceId, delta) => {
    const base = getNodes();
    const slice = base.find((n) => n.id === sliceId);
    if (!slice) return;
    const width = Math.max(minSliceWidth(base, slice), snap(slice.data.width + delta));
    if (width === slice.data.width) return;
    setNodes(centerStickies(settleStickies(layoutSlices(setSliceWidth(base, sliceId, width), base))));
  };

  // Moves a slice one place left (-1) or right (1), with its elements, by swapping it with its
  // neighbour (one undo step).
  const moveSlice = (sliceId, dir) => {
    const base = getNodes();
    const slice = base.find((n) => n.id === sliceId);
    if (!slice) return;
    const ss = slices(base, slice.parentId);
    const other = ss[ss.findIndex((s) => s.id === sliceId) + dir];
    if (!other) return;
    // The layout orders slices by position: put this one just inside the neighbour's far edge.
    const x = dir > 0 ? other.position.x + other.data.width - 1 : other.position.x - 1;
    setNodes(
      layoutSlices(
        base.map((n) => (n.id === sliceId ? { ...n, position: { ...n.position, x } } : n)),
        base
      )
    );
  };

  cellKeys.current = (e) => {
    if (infoId || helpOpen || scenarioEdit || fieldsId || htmlId || scenariosViewId || movieId) return;
    // The overview is read-only: only V (view) and Shift+F (fit) work.
    if (overview && !(e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') && !(!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'v')) return;
    // '+' needs Shift on most layouts; with Shift, ←/→ resize, C compacts and Delete/Backspace
    // delete the slice (slice operations use Shift, Cell operations do not).
    const withShift =
      e.key === '+' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'Delete' ||
      e.key === 'Backspace' ||
      e.key.toLowerCase() === 'i' ||
      e.key.toLowerCase() === 'e' ||
      e.key.toLowerCase() === 'a' ||
      e.key.toLowerCase() === 'c';
    // Ctrl+←/→ moves the slice.
    const moveKey =
      e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    // 1 ... 9 open the scenario of that place in the selected Scenarios element.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const selected = getNodes().filter((n) => n.selected);
      const scenario = selected.length === 1 && selected[0].data.kind === 'scenarios' ? selected[0].data.scenarios[Number(e.key) - 1] : null;
      if (scenario) {
        e.preventDefault();
        setScenarioEdit({ nodeId: selected[0].id, scenarioId: scenario.id });
      }
      return;
    }
    // Ctrl+C remembers the selected element; Ctrl+V pastes a linked copy of it into the selected Cell.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v')) {
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key.toLowerCase() === 'c') {
        const selected = getNodes().filter((n) => n.selected);
        const only = selected.length === 1 && selected[0].type === 'sticky' ? selected[0] : null;
        if (only) rememberCopy(only.id);
      } else {
        const original = clipboard.current && getNodes().find((n) => n.id === clipboard.current);
        if (original) {
          e.preventDefault();
          addSticky(original.data.kind, undefined, original.id);
        } else clipboard.current = null;
      }
      return;
    }
    // Shift+F fits the whole board in the window, as the Fit view control does (R1.20).
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') {
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      fitBoard();
      return;
    }
    if (!moveKey && (e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && !withShift))) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key.toLowerCase() === 'i' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].type === 'sticky' && selected[0].data.kind !== 'notes' && selected[0].data.kind !== 'scenarios' && !selected[0].data.copyOf) {
        e.preventDefault();
        setInfoReading(false);
        setInfoId(selected[0].id);
      }
      return;
    }
    if (e.key.toLowerCase() === 'f' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].type === 'sticky' && hasFields(selected[0].data.kind) && !selected[0].data.copyOf) {
        e.preventDefault();
        setFieldsId(selected[0].id);
      }
      return;
    }
    const hk = e.key.toLowerCase();
    if (hk === 'v' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].data.kind === 'scenarios') {
        e.preventDefault();
        setScenariosViewId(selected[0].id);
        return;
      }
      if (selected.length === 1 && selected[0].data.kind === 'screen') {
        const original = selected[0].data.copyOf ? getNodes().find((n) => n.id === selected[0].data.copyOf) : selected[0];
        if (original?.data.html || original?.data.url) {
          e.preventDefault();
          setHtmlReading(true);
          setHtmlId(selected[0].id);
          return;
        }
      }
    }
    if (hk === 'e' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].data.kind === 'screen' && !selected[0].data.copyOf) {
        e.preventDefault();
        setHtmlReading(false);
        setHtmlId(selected[0].id);
        return;
      }
    }
    if ((hk === 'v' || hk === 'r' || hk === 'e') && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].data.kind === 'notes') {
        e.preventDefault();
        setInfoReading(hk !== 'e');
        setInfoId(selected[0].id);
        return;
      }
      if (hk === 'v') return;
    }
    if (e.key.toLowerCase() === 'g' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].data.copyOf) {
        e.preventDefault();
        goToOriginal(selected[0].id);
      }
      return;
    }
    if (e.key.toLowerCase() === 'a' && !e.shiftKey) {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].data.kind === 'scenarios') {
        e.preventDefault();
        setScenarioEdit({ nodeId: selected[0].id, scenarioId: null });
      }
      return;
    }
    // Shift+A copies the Context, Chapter, Slice and (when one is selected) Element ids.
    if (e.shiftKey && e.key.toLowerCase() === 'a') {
      const selected = getNodes().filter((n) => n.selected);
      if (selected.length === 1 && selected[0].type === 'sticky') {
        e.preventDefault();
        copyContext({ elementId: selected[0].id });
      } else if (selectedCell) {
        e.preventDefault();
        copyContext({ sliceId: selectedCell.sliceId });
      }
      return;
    }
    if (!selectedCell) return;
    if (e.key === '+') {
      e.preventDefault();
      addSliceAfter(selectedCell.sliceId);
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== selectedCell.sliceId) return n;
          const { flowEnd, ...rest } = n.data;
          return { ...n, data: flowEnd ? rest : { ...rest, flowEnd: true } };
        })
      );
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      compactChapter(selectedCell.chapterId, selectedCell.sliceId);
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      setInfoReading(false);
      setInfoId(selectedCell.sliceId);
      return;
    }
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (step) {
      e.preventDefault();
      if (moveKey) {
        moveSlice(selectedCell.sliceId, step[1]);
        return;
      }
      if (e.shiftKey) {
        resizeSlice(selectedCell.sliceId, step[1] * GRID);
        return;
      }
      const ns = getNodes();
      const lanes = lanesOf(ns, selectedCell.chapterId);
      const cols = slices(ns, selectedCell.chapterId);
      const row = lanes.findIndex((l) => l.id === selectedCell.laneId) + step[0];
      const col = cols.findIndex((s) => s.id === selectedCell.sliceId) + step[1];
      if (lanes[row] && cols[col]) {
        chooseCell({ ...selectedCell, laneId: lanes[row].id, sliceId: cols[col].id });
      }
      return;
    }
    const kind = kindOfKey(e.key.toLowerCase(), getNodes().find((n) => n.id === selectedCell.laneId)?.data.type);
    if (kind) {
      e.preventDefault();
      addSticky(kind);
    } else if (e.key === 'Enter' && t.tagName !== 'BUTTON') {
      const ns = getNodes();
      const selectedNodes = ns.filter((n) => n.selected);
      if (selectedNodes.length === 1 && selectedNodes[0].data.kind === 'notes') {
        e.preventDefault();
        setInfoReading(false);
        setInfoId(selectedNodes[0].id);
        return;
      }
      const lane = ns.find((n) => n.id === selectedCell.laneId);
      const first = (membersOf(ns).get(selectedCell.sliceId) ?? [])
        .filter((n) => {
          const mid = n.position.y + stickyH(n) / 2;
          return !n.data.copyOf && !['scenarios', 'notes'].includes(n.data.kind) && lane && mid >= lane.position.y && mid < lane.position.y + lane.data.height;
        })
        .sort((a, b) => a.position.x - b.position.x)[0];
      if (first) {
        e.preventDefault();
        setTitleEditId(first.id);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      // One press does one thing, so deleting the last element never goes on to ask about the slice.
      if (e.repeat) return;
      if (e.shiftKey) {
        removeSlice(selectedCell.sliceId, true);
        return;
      }
      const gone = new Set(getNodes().filter((n) => n.selected && n.type === 'sticky').map((n) => n.id));
      if (gone.size) {
        if (!confirmCopies(getNodes(), gone)) return;
        setNodes((ns) => ns.filter((n) => !gone.has(n.id)));
        setEdges((es) => es.filter((x) => !gone.has(x.source) && !gone.has(x.target)));
        return;
      }
      removeCellElements(selectedCell);
    } else if (e.key === 'Escape') {
      setSelectedCell(null);
      setNodes((ns) => selectOnly(ns, null));
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // A button released over a Cell adds the element there; anywhere else adds nothing.
  const onDrop = (e) => {
    e.preventDefault();
    if (overview) return;
    const kind = e.dataTransfer.getData('application/event-model');
    if (!KINDS[kind]) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ns = getNodes();
    const cell = cellAt(ns, p, hiddenChapters);
    if (!cell) return;
    const chapter = ns.find((n) => n.id === cell.chapterId);
    addSticky(kind, { cell, x: p.x - kindW(kind) / 2 - chapter.position.x });
  };

  // Selects the Cell under the click, or clears the selection when it is outside every Cell.
  const selectCellAt = (e) => {
    const cell = cellAt(getNodes(), screenToFlowPosition({ x: e.clientX, y: e.clientY }), hiddenChapters);
    if (cell) {
      chooseCell(cell);
      setActiveId(cell.chapterId);
    } else {
      setSelectedCell(null);
    }
  };

  // Where the dragged elements were when the drag began, so a drop over no Cell can undo the move.
  const dragOrigin = useRef(new Map());
  const rememberDrag = (dragged) => {
    const current = new Map(getNodes().map((n) => [n.id, n]));
    dragOrigin.current = new Map(
      dragged
        .filter((n) => n.type === 'sticky')
        .map((n) => {
          const { parentId, position } = current.get(n.id) ?? n;
          return [n.id, { parentId, position: { ...position } }];
        })
    );
  };
  const dropDragged = (dragged) => {
    const ids = new Set(dragged.map((n) => n.id));
    setNodes((ns) =>
      centerStickies(settleStickies(adoptStickies(ns, ids, dragOrigin.current, hiddenChapters), ids), ids)
    );
  };

  const selectedLane = selectedCell && nodes.find((n) => n.id === selectedCell.laneId);

  return (
    <div className={`app${overview ? ' overview' : ''}`}>
      <header className="toolbar">
        <strong className="keep">Event Modeling Board</strong>
        <button onClick={undo} disabled={!hist.undo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!hist.redo} title="Redo (Ctrl+Y)">
          ↷ Redo
        </button>
        <select
          className="context-filter keep"
          value={filterId}
          onChange={(e) => setContextFilter(e.target.value)}
          title="Show only the Chapters of one Context"
          aria-label="Context filter"
        >
          <option value="">All contexts</option>
          {contexts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="hotkeys-btn search-btn"
          onClick={() => renameContext(filterId)}
          disabled={!filterId}
          title={filterId ? 'Rename the selected context' : 'Rename the selected context (choose a context first)'}
          aria-label="Rename context"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M2 14l.8-3.2L11 2.6l2.4 2.4-8.2 8.2L2 14zM9.6 4l2.4 2.4" />
          </svg>
        </button>
        <button
          className={`hotkeys-btn search-btn context-info${contexts.some((c) => c.id === filterId && c.info) ? ' has-info' : ''}`}
          onClick={() => setContextInfoId(filterId)}
          disabled={!filterId}
          title={filterId ? 'Info of the selected context' : 'Info of the selected context (choose a context first)'}
          aria-label="Context info"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7.2V11.5" />
            <circle cx="8" cy="4.8" r="0.4" />
          </svg>
        </button>
        <button
          className="hotkeys-btn search-btn"
          onClick={() => removeContext(filterId)}
          disabled={!filterId || filterId === contexts[0]?.id}
          title={
            filterId && filterId !== contexts[0]?.id
              ? 'Delete the selected context (its Chapters move to the Default)'
              : 'Delete the selected context (choose a context other than the Default first)'
          }
          aria-label="Delete context"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
          </svg>
        </button>
        <span className="target" title="New slices are added to this Chapter">
          Add to: <strong>{active?.data.name}</strong>
        </span>
        {Object.entries(KINDS).map(([kind, k]) => (
          <button
            key={kind}
            className={`chip ${kind}`}
            aria-disabled={
              selectedLane &&
              (!laneAllows(selectedLane, kind) ||
                cellIsFull(nodes, selectedLane, nodes.find((n) => n.id === selectedCell.sliceId)))
                ? true
                : undefined
            }
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/event-model', kind)}
            onClick={() => addSticky(kind)}
            title={`Add to the selected Cell (${hotkeyOf(kind)}). Only ${acceptingLanes(kind)} lanes take it.`}
          >
            + {k.icon && `${k.icon} `}{k.label}
          </button>
        ))}
        <button className="chip slice-btn" onClick={addSlice} title="Add a slice to the Chapter">
          + Slice
        </button>
        <button className="chip chapter-btn" onClick={addChapter} title="Add a new Chapter">
          + Chapter
        </button>
        <span className="spacer keep" />
        <button
          className={`hotkeys-btn keep${overview ? ' pressed' : ''}`}
          onClick={() => setOverview((v) => !v)}
          aria-pressed={overview}
          title={overview ? 'Leave the high level view (Ctrl+H)' : 'High level view: read-only, without slice borders and buttons (Ctrl+H)'}
          aria-label="High level view"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
            <path d="M1.5 6.5H14.5M1.5 10H14.5" />
          </svg>
        </button>
        <button
          className="hotkeys-btn search-btn keep"
          onClick={() => setSearch((s) => ({ open: true, tick: s.tick + 1 }))}
          title="Search elements by name (Ctrl+F)"
          aria-label="Search"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10L14.5 14.5" />
          </svg>
        </button>
        <button className="hotkeys-btn keep" onClick={() => setHelpOpen(true)} title="Hotkeys" aria-label="Hotkeys">
          ⌨️
        </button>
      </header>
      <div className="canvas" ref={canvasRef}>
        <HistoryContext.Provider value={historyApi}>
        <BoardActions.Provider value={boardActions}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={(e, node) => {
            // Lanes cover the whole Cell area, so a click on the empty part of a Cell is
            // delivered to a lane node, not to the canvas: treat it as a click on the canvas.
            if (node.type === 'lane') selectCellAt(e);
            else if (node.type === 'slice') focusChapter(node); // its header selects a Cell itself
            else {
              if (node.type === 'sticky') selectCellOf(node.id);
              else setSelectedCell(null);
              focusChapter(node);
            }
          }}
          onEdgeClick={() => setSelectedCell(null)}
          onPaneClick={selectCellAt}
          onNodeDragStart={(_, node, dragged) => {
            historyApi.begin();
            rememberDrag(dragged ?? [node]);
            setSelectedCell(null);
            focusChapter(node);
          }}
          onSelectionDragStart={(_, dragged) => {
            historyApi.begin();
            rememberDrag(dragged);
          }}
          onSelectionDragStop={(_, dragged) => {
            dropDragged(dragged);
            historyApi.end();
          }}
          onNodeDragStop={(_, node, dragged) => {
            dropDragged(dragged);
            historyApi.end();
            // After the drop has settled, the element's new Cell is selected.
            setTimeout(() => selectCellOf(node.id), 0);
          }}
          onEdgesChange={onEdgesChange}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodesDraggable={!overview}
          nodesConnectable={!overview}
          edgesReconnectable={!overview}
          defaultViewport={{ x: 20, y: 40, zoom: 0.6 }}
          minZoom={0.2}
          ariaLabelConfig={{ 'controls.fitView.ariaLabel': 'Fit view (Shift+F)' }}
          snapToGrid
          autoPanOnNodeDrag={false}
          disableKeyboardA11y
          snapGrid={[20, 20]}
          deleteKeyCode={overview || scenarioEdit || fieldsId || htmlId || scenariosViewId || movieId || selectedCell ? null : ['Backspace', 'Delete']}
          onBeforeDelete={async ({ nodes: doomed }) => confirmCopies(getNodes(), new Set(doomed.map((n) => n.id)))}
        >
          <CellHighlight cell={overview ? null : selectedCell} />
          <Background gap={20} />
          <Controls onFitView={fitBoard} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.type === 'chapter' ? '#ccc' : 'transparent')}
            nodeStrokeColor={(n) => (n.type === 'chapter' ? '#ccc' : 'transparent')}
            nodeBorderRadius={0}
          />
        </ReactFlow>
        </BoardActions.Provider>
        </HistoryContext.Provider>
      </div>
      {helpOpen && <HotkeysDialog onClose={() => setHelpOpen(false)} />}
      {search.open && (
        <SearchBox
          items={searchItems}
          focusTick={search.tick}
          onPick={goToElement}
          onClose={() => setSearch((s) => ({ ...s, open: false }))}
        />
      )}
      {infoNode && (
        <InfoDialog
          key={infoNode.id}
          initialReading={infoReading}
          readOnly={overview}
          title={
            infoNode.type === 'sticky' && infoNode.data.kind !== 'notes'
              ? `${KINDS[infoNode.data.kind].label}${infoNode.data.name ? ` — ${infoNode.data.name}` : ''}`
              : infoNode.data.kind === 'notes' ? 'Notes' : `${infoNode.type[0].toUpperCase()}${infoNode.type.slice(1)} — ${infoNode.data.name ?? infoNode.data.label}`
          }
          initial={infoNode.data[infoField] ?? ''}
          onSave={saveInfo}
          onCancel={() => setInfoId(null)}
        />
      )}
      {contextInfo && (
        <InfoDialog
          key={contextInfo.id}
          readOnly={overview}
          title={`Context — ${contextInfo.name}`}
          initial={contextInfo.info ?? ''}
          onSave={saveContextInfo}
          onCancel={() => setContextInfoId(null)}
        />
      )}
      {htmlNode && (
        <HtmlDialog
          key={htmlTarget.id}
          initialReading={htmlReading || htmlCopy || overview}
          readOnly={htmlCopy || overview}
          title={`Screen mockup${htmlNode.data.name ? ` — ${htmlNode.data.name}` : ''}`}
          initial={htmlNode.data.html ?? ''}
          initialUrl={htmlNode.data.url ?? ''}
          onSave={saveHtml}
          onCancel={() => setHtmlId(null)}
        />
      )}
      {fieldsNode && (
        <FieldsDialog
          key={fieldsNode.id}
          title={`Fields — ${KINDS[fieldsNode.data.kind].label}${fieldsNode.data.name ? ` — ${fieldsNode.data.name}` : ''}`}
          initial={fieldsNode.data.fields ?? []}
          parent={parentFields(nodes, edges, fieldsNode.id)}
          onSave={saveFields}
          onClose={() => setFieldsId(null)}
        />
      )}
      {scenariosViewNode && (
        <ScenariosView
          scenarios={scenariosViewNode.data.scenarios}
          elements={new Map(nodes.filter((n) => n.type === 'sticky').map((n) => [n.id, { name: n.data.name, kind: n.data.kind }]))}
          onClose={() => setScenariosViewId(null)}
        />
      )}
      {scenarioNode && (scenarioEdit.scenarioId === null || editedScenario) && (
        <ScenarioDialog
          key={`${scenarioEdit.nodeId}:${scenarioEdit.scenarioId}`}
          scenario={editedScenario}
          candidates={scenarioCandidates}
          onSave={saveScenario}
          onClose={() => setScenarioEdit(null)}
        />
      )}
      {movieId && movieScreens.length > 0 && (
        <MovieStrip key={movieId} screens={movieScreens} onClose={() => setMovieId(null)} />
      )}
      {notice && (
        <div className="toast" role="status" title="Click to dismiss" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
    </div>
  );
}

export default function EventModelBoard() {
  return (
    <ReactFlowProvider>
      <Board />
    </ReactFlowProvider>
  );
}
