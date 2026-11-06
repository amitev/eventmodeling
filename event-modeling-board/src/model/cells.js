// Pure rules about Cells (a lane crossed with a slice) and connections. No UI.
import {
  GRID,
  LANE_TYPES,
  FLOWS_TO,
  kindW,
  padOf,
  snapUp,
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
  }
  if (kind === 'event') {
    const command = above('command');
    if (command) pairs.push([command.id, node.id]);
  }
  if (kind === 'screen') {
    const query = below('query');
    if (query) pairs.push([query.id, node.id]);
  }
  if (kind === 'processor') {
    // The nearest Query; without one, the nearest Event in an Integration lane.
    const inIntegration = (n) => {
      const cell = cellOfElement(nodes, n);
      return nodes.find((l) => l.id === cell?.laneId)?.data.type === 'integration';
    };
    const source =
      nearest(others.filter((n) => n.data.kind === 'query')) ??
      nearest(others.filter((n) => n.data.kind === 'event' && inIntegration(n)));
    if (source) pairs.push([source.id, node.id]);
  }
  if (kind === 'query') {
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
