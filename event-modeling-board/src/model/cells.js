// Pure rules about Cells (a lane crossed with a slice) and connections. No UI.
import {
  GRID,
  LANE_TYPES,
  FLOWS_TO,
  kindW,
  padOf,
  snapUp,
  snap,
  leftAligned,
  stickyW,
  stickyH,
  slices,
  lanesOf,
  sliceOf,
  membersOf,
} from './model.js';

// The lane types that take an element type, e.g. "Interaction / Integration".
export const acceptingLanes = (kind) =>
  Object.values(LANE_TYPES)
    .filter((t) => t.kinds.includes(kind))
    .map((t) => t.label)
    .join(' / ');

// Where a new element goes in a Cell (a lane crossed with a slice): the first spot from
// the left, inside the slice's margins, that does not overlap an element already in the
// Cell. When the Cell is full it goes after the last element and the slice has to grow:
// `sliceWidth` is the width the slice needs (the current width when nothing changes).
export function spotInCell(nodes, lane, slice, kind) {
  const w = kindW(kind);
  const pad = padOf(kind);
  const inCell = (membersOf(nodes).get(slice.id) ?? []).filter((n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
  if (!inCell.length) {
    // Empty Cell: centred in the slice (left aligned in a Spec lane), which grows first if it is
    // too narrow.
    const width = Math.max(slice.data.width, snapUp(w + 2 * pad));
    const x = leftAligned(lane) ? slice.position.x + pad : slice.position.x + Math.floor((width - w) / 2);
    return { x, y: lane.position.y + 40, sliceWidth: width, empty: true };
  }
  const left = slice.position.x + pad;
  const lastFit = slice.position.x + slice.data.width - pad - w;
  const free = (x) =>
    !inCell.some(
      (m) => x < m.position.x + stickyW(m) + GRID && m.position.x < x + w + GRID
    );
  let x = left;
  while (x <= lastFit && !free(x)) x += GRID;
  if (x > lastFit) {
    // Full: continue after the right-most element, widening the slice.
    const after = inCell.reduce((m, n) => Math.max(m, n.position.x + stickyW(n)), left - GRID);
    x = Math.max(left, snapUp(after + GRID));
  }
  const need = snapUp(x + w + pad - slice.position.x);
  return { x, y: lane.position.y + 40, sliceWidth: Math.max(slice.data.width, need), empty: false };
}

// The arrows a new element gets by the flow rules (R4.8), as [source id, target id] pairs.
// "Above" and "under" mean another lane of the same slice; the nearest one is taken.
export function autoConnections(nodes, node) {
  const slice = sliceOf(slices(nodes), node);
  if (!slice) return [];
  const members = membersOf(nodes);
  const others = (members.get(slice.id) ?? []).filter((n) => n.id !== node.id);
  const centre = (n) => n.position.y + stickyH(n) / 2;
  const me = centre(node);
  const gap = (n) => Math.abs(centre(n) - me);
  const nearest = (list) => list.reduce((best, n) => (!best || gap(n) < gap(best) ? n : best), null);
  const above = (kind) => nearest(others.filter((n) => n.data.kind === kind && centre(n) < me));
  const below = (kind) => nearest(others.filter((n) => n.data.kind === kind && centre(n) > me));

  const pairs = [];
  const kind = node.data.kind;
  if (kind === 'command') {
    const screen = above('screen');
    if (screen) pairs.push([screen.id, node.id]);
    const processor = nearest(others.filter((n) => n.data.kind === 'processor'));
    if (processor) pairs.push([processor.id, node.id]);
  }
  if (kind === 'event') {
    const command = above('command');
    if (command) pairs.push([command.id, node.id]);
  }
  if (kind === 'screen') {
    const readModel = below('read_model');
    if (readModel) pairs.push([readModel.id, node.id]);
  }
  if (kind === 'processor') {
    const readModel = nearest(others.filter((n) => n.data.kind === 'read_model'));
    if (readModel) pairs.push([readModel.id, node.id]);
  }
  if (kind === 'read_model') {
    const screen = above('screen');
    if (screen) pairs.push([node.id, screen.id]);
    const chapterSlices = slices(nodes, node.parentId);
    const previous = chapterSlices[chapterSlices.findIndex((s) => s.id === slice.id) - 1];
    const events = (previous ? members.get(previous.id) ?? [] : []).filter(
      (n) => n.data.kind === 'event'
    );
    // The right-most event; the nearest by height when several end at the same place.
    const event = events.reduce((best, n) => {
      const right = n.position.x + stickyW(n);
      const bestRight = best ? best.position.x + stickyW(best) : -Infinity;
      return right > bestRight || (right === bestRight && gap(n) < gap(best)) ? n : best;
    }, null);
    if (event) pairs.push([event.id, node.id]);
  }
  return pairs;
}

// The compact layout of an automation or translation slice: the Read Model first, the Command (the
// action) next to it in the same lane, the Processor centred above both, the Event(s) under the
// Command; the other elements (an Integration Event, ...) left aligned. `els` are the slice's
// elements, `left` its left edge, `isIntegration(n)` tells an element in an Integration lane.
// Returns { xs: Map of element id to x, width: the content width }, or null when the slice has no
// single Read Model, Command and Processor outside Integration lanes, or no Event.
export function automationLayout(els, laneIdOf, isIntegration, left) {
  const core = els.filter((n) => !isIntegration(n));
  const only = (kind) => {
    const list = core.filter((n) => n.data.kind === kind);
    return list.length === 1 ? list[0] : null;
  };
  const readModel = only('read_model');
  const command = only('command');
  const processor = only('processor');
  const events = core.filter((n) => n.data.kind === 'event');
  if (!readModel || !command || !processor || !events.length) return null;

  const w = stickyW;
  const xs = new Map();
  const rightOfLane = new Map();
  const put = (n, x) => {
    xs.set(n.id, x);
    const lane = laneIdOf(n);
    rightOfLane.set(lane, Math.max(rightOfLane.get(lane) ?? -Infinity, x + w(n)));
  };
  // Elements of one lane go side by side in their current order, from `start` or after the last one placed.
  const row = (list, start) => {
    for (const n of [...list].sort((a, b) => a.position.x - b.position.x)) {
      const lane = laneIdOf(n);
      put(n, rightOfLane.has(lane) ? rightOfLane.get(lane) + GRID : start(n));
    }
  };

  const readModelX = left + padOf('read_model');
  const commandX = readModelX + w(readModel) + GRID;
  put(readModel, readModelX);
  put(command, commandX);
  put(processor, snap((readModelX + commandX + w(command)) / 2 - w(processor) / 2));
  row(events, () => commandX);
  row(els.filter((n) => !xs.has(n.id)), (n) => left + padOf(n.data.kind));

  const right = Math.max(...els.map((n) => xs.get(n.id) + w(n) + padOf(n.data.kind)));
  return { xs, width: right - left };
}

// The elements whose centre is in the Cell.
export const cellElements = (nodes, cell) => {
  const lane = nodes.find((n) => n.id === cell.laneId);
  if (!lane) return [];
  return (membersOf(nodes).get(cell.sliceId) ?? []).filter((n) => {
    const mid = n.position.y + stickyH(n) / 2;
    return mid >= lane.position.y && mid < lane.position.y + lane.data.height;
  });
};

// The Cell an element sits in (null for anything that is not an element).
export const cellOfElement = (nodes, n) => {
  if (n.type !== 'sticky') return null;
  const slice = sliceOf(slices(nodes), n);
  const mid = n.position.y + stickyH(n) / 2;
  const lane = lanesOf(nodes, n.parentId).find(
    (l) => mid >= l.position.y && mid < l.position.y + l.data.height
  );
  return slice && lane ? { chapterId: n.parentId, laneId: lane.id, sliceId: slice.id } : null;
};

// Only the node `id` is selected (none for null). Returns the same array when nothing changes.
export const selectOnly = (nodes, id) => {
  if (nodes.every((n) => !!n.selected === (n.id === id))) return nodes;
  return nodes.map((n) => (!!n.selected === (n.id === id) ? n : { ...n, selected: n.id === id }));
};

// Asks before deleting elements `gone` whose linked copies elsewhere go with them (R3.22).
export const confirmCopies = (nodes, gone) => {
  const count = nodes.filter((n) => n.data?.copyOf && !gone.has(n.id) && gone.has(n.data.copyOf)).length;
  return !count || window.confirm(`Also delete the ${count} linked copy(ies) of the deleted element(s)?`);
};

// Chapters connect to Chapters of the same Context (as dragged); elements only along FLOWS_TO, and a
// connection dragged the wrong way is turned around. Never to itself, at most once. Null when refused.
export const orient = (nodes, c) => {
  const a = nodes.find((n) => n.id === c.source);
  const b = nodes.find((n) => n.id === c.target);
  if (!a || !b || a.id === b.id) return null;
  if (a.type === 'chapter' && b.type === 'chapter') return a.data.context === b.data.context ? [a.id, b.id] : null;
  if (a.type !== 'sticky' || b.type !== 'sticky') return null;
  if (FLOWS_TO[a.data.kind]?.includes(b.data.kind)) return [a.id, b.id];
  if (FLOWS_TO[b.data.kind]?.includes(a.data.kind)) return [b.id, a.id];
  return null;
};
