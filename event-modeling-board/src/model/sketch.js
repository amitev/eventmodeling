import { parse } from 'parse5';
import { MOCKUP_W, MOCKUP_H } from './mockup.js';

export const SKETCH_ID = 'em-screen-sketch';
const SVG_STYLE = 'display:block;max-width:100%;height:auto;background:#fff';
const COLOR = /^(#[0-9a-f]{6}|none)$/i;
const SVG_ATTRS = new Set(['id', 'xmlns', 'width', 'height', 'viewBox', 'style']);
const RECT_ATTRS = new Set(['id', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'stroke-width']);
const TEXT_ATTRS = new Set(['id', 'x', 'y', 'font-size', 'font-family', 'fill', 'textLength', 'lengthAdjust']);
const LINE_ATTRS = new Set(['id', 'x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width']);
const TABLE_ATTRS = new Set(['id', 'class']);
export const TABLE_MIN_COLUMN = 24;
export const TABLE_MIN_HEIGHT = 60;
const number = (value) => Math.round(value * 100) / 100;
const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const children = (node) => (node.childNodes ?? []).filter((child) => child.nodeName !== '#text' || child.value.trim());
const attributes = (node) => Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
const onlyAttrs = (node, allowed) => node.attrs.every(({ name }) => allowed.has(name));
const numeric = (value) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));

export const sketchLayers = (shapes) => [
  ...shapes.filter(({ type }) => type === 'table'),
  ...shapes.filter(({ type }) => type !== 'table' && type !== 'text'),
  ...shapes.filter(({ type }) => type === 'text'),
];

export const sketchItems = (shapes) => {
  const items = [];
  const groups = new Map();
  for (const shape of sketchLayers(shapes)) {
    if (!shape.groupId) {
      items.push(shape);
      continue;
    }
    let group = groups.get(shape.groupId);
    if (!group) {
      group = { id: shape.groupId, type: 'group', shapes: [] };
      groups.set(shape.groupId, group);
      items.push(group);
    }
    group.shapes.push(shape);
  }
  return items;
};

const shapeHtml = (shape) => {
  const { id, x, y, width, fill } = shape;
  if (shape.type === 'table') {
    const parts = tableParts(shape).map(({ tag, attrs }) =>
      `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}></${tag}>`,
    ).join('');
    return `<g id="${id}" class="em-sketch-table">${parts}</g>`;
  }
  if (shape.type === 'rect') {
    return `<rect id="${id}" x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(shape.height)}" fill="${fill}" stroke="${shape.stroke}" stroke-width="2"></rect>`;
  }
  if (shape.type === 'line') {
    const { x1, y1, x2, y2 } = lineEndpoints(shape);
    return `<line id="${id}" x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}" stroke="${shape.stroke}" stroke-width="2"></line>`;
  }
  return `<text id="${id}" x="${number(x)}" y="${number(y + shape.fontSize)}" font-size="${number(shape.fontSize)}" font-family="sans-serif" fill="${fill}" textLength="${number(width)}" lengthAdjust="spacingAndGlyphs">${escape(shape.text)}</text>`;
};

export function recordSketchHistory(history, present, group = null) {
  if (present === history.present) return history;
  return {
    past: group && group === history.group ? history.past : [...history.past, history.present].slice(-5),
    present, future: [], group,
  };
}

export function travelSketchHistory(history, redo = false) {
  const from = redo ? 'future' : 'past';
  const to = redo ? 'past' : 'future';
  if (!history[from].length) return history;
  return {
    ...history,
    [from]: history[from].slice(0, -1),
    [to]: [...history[to], history.present].slice(-5),
    present: history[from].at(-1),
    group: null,
  };
}

export function sketchHtml(shapes) {
  const content = sketchItems(shapes).map((item) => item.type === 'group'
    ? `<g id="${item.id}" class="em-sketch-group">${item.shapes.map(shapeHtml).join('')}</g>`
    : shapeHtml(item),
  ).join('');
  return `<!DOCTYPE html><html><head></head><body style="margin:0"><svg id="${SKETCH_ID}" xmlns="http://www.w3.org/2000/svg" width="${MOCKUP_W}" height="${MOCKUP_H}" viewBox="0 0 ${MOCKUP_W} ${MOCKUP_H}" style="${SVG_STYLE}">${content}</svg></body></html>`;
}

// Read only our complete SVG document; never silently drop handwritten HTML or SVG features.
export function readSketch(html) {
  const problem = (error) => ({ shapes: null, error });
  if (!html.trim()) return problem('No sketch yet.');
  const document = parse(html);
  const root = document.childNodes.find((node) => node.tagName === 'html');
  const head = root?.childNodes.find((node) => node.tagName === 'head');
  const body = root?.childNodes.find((node) => node.tagName === 'body');
  const svg = body && children(body)[0];
  if (!svg || svg.tagName !== 'svg' || attributes(svg).id !== SKETCH_ID) {
    return problem('This content is not an editable sketch.');
  }
  const attrs = attributes(svg);
  if (root.attrs.length || head.attrs.length || children(head).length || children(body).length !== 1 ||
      !onlyAttrs(body, new Set(['style'])) || attributes(body).style !== 'margin:0' ||
      !onlyAttrs(svg, SVG_ATTRS) || attrs.width !== String(MOCKUP_W) || attrs.height !== String(MOCKUP_H) ||
      attrs.viewBox !== `0 0 ${MOCKUP_W} ${MOCKUP_H}` || attrs.style !== SVG_STYLE) {
    return problem('The sketch document has unsupported HTML or SVG settings. Edit Content or start a new sketch.');
  }
  const shapes = [];
  const ids = new Set();
  const groupIds = new Set();
  const nodes = [];
  for (const node of children(svg)) {
    const a = attributes(node);
    if (node.tagName === 'g' && a.class === 'em-sketch-group') {
      if (!onlyAttrs(node, TABLE_ATTRS) || !/^em-sketch-group-[1-9]\d*$/.test(a.id) || groupIds.has(a.id)) {
        return problem('The sketch has invalid or duplicate group ids.');
      }
      const members = children(node);
      if (members.length < 2) return problem('A sketch group must contain at least two shapes.');
      groupIds.add(a.id);
      for (const member of members) nodes.push({ node: member, groupId: a.id });
    } else {
      nodes.push({ node, groupId: null });
    }
  }
  for (const { node, groupId } of nodes) {
    const allowed = { rect: RECT_ATTRS, text: TEXT_ATTRS, line: LINE_ATTRS, g: TABLE_ATTRS }[node.tagName];
    if (!allowed || !onlyAttrs(node, allowed)) {
      return problem('The sketch contains unsupported shapes or attributes. Edit Content or start a new sketch.');
    }
    const a = attributes(node);
    if (!/^em-sketch-[1-9]\d*$/.test(a.id) || ids.has(a.id)) {
      return problem('The sketch has invalid or duplicate shape ids.');
    }
    if (!['line', 'g'].includes(node.tagName) && (!numeric(a.x) || !numeric(a.y) || !COLOR.test(a.fill ?? ''))) {
      return problem('The sketch has invalid ids, positions or colors. Edit Content or start a new sketch.');
    }
    const shape = { id: a.id, type: node.tagName, ...(groupId ? { groupId } : {}) };
    if (!['line', 'g'].includes(node.tagName)) Object.assign(shape, { x: Number(a.x), y: Number(a.y), fill: a.fill });
    if (node.tagName === 'g') {
      const table = readTable(node);
      if (!table) return problem('A sketch table has invalid geometry or unsupported content. Edit Content or start a new sketch.');
      Object.assign(shape, table);
    } else if (node.tagName === 'line') {
      if (children(node).length || !['x1', 'y1', 'x2', 'y2'].every((name) => numeric(a[name])) ||
          !COLOR.test(a.stroke ?? '') || a['stroke-width'] !== '2') {
        return problem('A sketch line has invalid endpoints, content or stroke settings.');
      }
      Object.assign(shape, lineBetween({ x: Number(a.x1), y: Number(a.y1) }, { x: Number(a.x2), y: Number(a.y2) }), { stroke: a.stroke });
    } else if (node.tagName === 'rect') {
      if (children(node).length || !numeric(a.width) || !numeric(a.height) || !COLOR.test(a.stroke ?? '') || a['stroke-width'] !== '2') {
        return problem('A sketch rectangle has unsupported size, content or border settings.');
      }
      Object.assign(shape, { width: Number(a.width), height: Number(a.height), stroke: a.stroke });
    } else {
      if (node.childNodes.some((child) => child.nodeName !== '#text') ||
          !numeric(a['font-size']) || !numeric(a.textLength) || a['font-family'] !== 'sans-serif' || a.lengthAdjust !== 'spacingAndGlyphs') {
        return problem('Sketch text has unsupported content, font or size settings.');
      }
      const fontSize = Number(a['font-size']);
      Object.assign(shape, {
        y: shape.y - fontSize, fontSize, width: Number(a.textLength), height: fontSize * 1.2,
        text: node.childNodes.map((child) => child.value).join(''),
      });
      if (fontSize < 8) return problem('Sketch text must use a font size of at least 8.');
    }
    if (shape.x < -0.02 || shape.y < -0.02 || !validSketchSize(shape) ||
        shape.x + shape.width > MOCKUP_W + 0.02 || shape.y + shape.height > MOCKUP_H + 0.02) {
      return problem('A sketch shape has an invalid size or lies outside the canvas.');
    }
    ids.add(shape.id);
    shapes.push(shape);
  }
  return { shapes, error: '' };
}

export function sketchId(shapes) {
  return `em-sketch-${Math.max(0, ...shapes.map(({ id }) => Number(id.slice('em-sketch-'.length)))) + 1}`;
}

export function sketchGroupId(shapes) {
  const max = Math.max(0, ...shapes.map(({ groupId }) =>
    Number(groupId?.slice('em-sketch-group-'.length)) || 0,
  ));
  return `em-sketch-group-${max + 1}`;
}

export function expandSketchSelection(shapes, selectedIds) {
  const selected = new Set(selectedIds);
  const groupIds = new Set(shapes.filter(({ id, groupId }) => selected.has(id) && groupId).map(({ groupId }) => groupId));
  return shapes.filter(({ id, groupId }) => selected.has(id) || groupIds.has(groupId)).map(({ id }) => id);
}

export function groupSketchShapes(shapes, selectedIds, groupId) {
  const selected = new Set(expandSketchSelection(shapes, selectedIds));
  if (selected.size < 2) return shapes;
  return shapes.map((shape) => selected.has(shape.id) ? { ...shape, groupId } : shape);
}

export function ungroupSketchShapes(shapes, selectedIds) {
  const selected = new Set(expandSketchSelection(shapes, selectedIds));
  return shapes.map((shape) => {
    if (!selected.has(shape.id) || !shape.groupId) return shape;
    const { groupId, ...ungrouped } = shape;
    return ungrouped;
  });
}

export function sketchPoint(x, y) {
  return { x: clamp(x, 0, MOCKUP_W), y: clamp(y, 0, MOCKUP_H) };
}

export function rectangleBetween(start, end) {
  return {
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
  };
}

export function lineBetween(start, end) {
  return { ...rectangleBetween(start, end), reverse: (end.x - start.x) * (end.y - start.y) < 0 };
}

export function lineEndpoints(shape) {
  return {
    x1: shape.x, y1: shape.y + (shape.reverse ? shape.height : 0),
    x2: shape.x + shape.width, y2: shape.y + (shape.reverse ? 0 : shape.height),
  };
}

export function validSketchSize(shape) {
  if (shape.type === 'table') {
    return shape.height >= TABLE_MIN_HEIGHT && shape.columns.length >= 3 &&
      shape.columns.every((width) => width * shape.width >= TABLE_MIN_COLUMN - 0.02);
  }
  return shape.type === 'line' ? Math.hypot(shape.width, shape.height) >= 4 : shape.width >= 4 && shape.height >= 4;
}

export function tableDividers(shape) {
  let x = shape.x;
  return shape.columns.slice(0, -1).map((width) => {
    x += width * shape.width;
    return x;
  });
}

export function tableParts(shape) {
  const { x, y, width, height } = shape;
  const rect = (fill, h = height, stroke = 'none') => ({
    tag: 'rect', attrs: { x: number(x), y: number(y), width: number(width), height: number(h), fill, stroke, 'stroke-width': 2 },
  });
  const line = (x1, y1, x2, y2) => ({
    tag: 'line', attrs: { x1: number(x1), y1: number(y1), x2: number(x2), y2: number(y2), stroke: '#1f2937', 'stroke-width': 2 },
  });
  return [
    rect('#ffffff'), rect('#e5e7eb', height / 3),
    line(x, y + height / 3, x + width, y + height / 3),
    line(x, y + height * 2 / 3, x + width, y + height * 2 / 3),
    ...tableDividers(shape).map((at) => line(at, y, at, y + height)),
    rect('none', height, '#1f2937'),
  ];
}

function readTable(node) {
  if (attributes(node).class !== 'em-sketch-table') return null;
  const parts = children(node);
  if (parts.length < 7 || parts[0].tagName !== 'rect' || parts.some((part) => !['rect', 'line'].includes(part.tagName))) return null;
  const a = attributes(parts[0]);
  if (!['x', 'y', 'width', 'height'].every((name) => numeric(a[name]))) return null;
  const shape = { type: 'table', x: Number(a.x), y: Number(a.y), width: Number(a.width), height: Number(a.height) };
  if (shape.width <= 0 || shape.height <= 0) return null;
  const boundaries = [shape.x, ...parts.slice(4, -1).map((part) => Number(attributes(part).x1)), shape.x + shape.width];
  if (boundaries.some((value, i) => !Number.isFinite(value) || i > 0 && value <= boundaries[i - 1])) return null;
  shape.columns = boundaries.slice(1).map((value, i) => (value - boundaries[i]) / shape.width);
  const expected = tableParts(shape);
  if (parts.length !== expected.length || parts.some((part, i) => {
    const wanted = expected[i];
    const actual = attributes(part);
    return part.tagName !== wanted.tag || children(part).length ||
      Object.keys(actual).length !== Object.keys(wanted.attrs).length ||
      Object.entries(wanted.attrs).some(([key, value]) => typeof value === 'number'
        ? !numeric(actual[key]) || Math.abs(Number(actual[key]) - value) > 0.02
        : actual[key] !== value);
  })) return null;
  return shape;
}

export function addTableColumn(shape) {
  const count = shape.columns.length + 1;
  const columns = [...shape.columns.map((width) => width * (count - 1) / count), 1 / count];
  if (columns.some((width) => width * shape.width < TABLE_MIN_COLUMN)) return null;
  return { ...shape, columns };
}

export function resizeTableColumn(shape, index, point) {
  const edges = [shape.x, ...tableDividers(shape), shape.x + shape.width];
  const x = clamp(point.x, edges[index] + TABLE_MIN_COLUMN, edges[index + 2] - TABLE_MIN_COLUMN);
  const columns = [...shape.columns];
  columns[index] = (x - edges[index]) / shape.width;
  columns[index + 1] = (edges[index + 2] - x) / shape.width;
  return { ...shape, columns };
}

export function resizeSketchLine(shape, point, endpoint) {
  const { x1, y1, x2, y2 } = lineEndpoints(shape);
  const fixed = endpoint === 'start' ? { x: x2, y: y2 } : { x: x1, y: y1 };
  return { ...shape, ...lineBetween(fixed, sketchPoint(point.x, point.y)) };
}

export function sketchBounds(shapes) {
  if (!shapes.length) return null;
  const x = Math.min(...shapes.map((shape) => shape.x));
  const y = Math.min(...shapes.map((shape) => shape.y));
  return {
    x, y,
    width: Math.max(...shapes.map((shape) => shape.x + shape.width)) - x,
    height: Math.max(...shapes.map((shape) => shape.y + shape.height)) - y,
  };
}

export function selectSketchShapes(shapes, box) {
  return expandSketchSelection(shapes, shapes.filter((shape) =>
    shape.x >= box.x && shape.y >= box.y &&
    shape.x + shape.width <= box.x + box.width &&
    shape.y + shape.height <= box.y + box.height,
  ).map(({ id }) => id));
}

export function moveSketchShapes(shapes, selectedIds, dx, dy) {
  const selected = new Set(expandSketchSelection(shapes, selectedIds));
  const bounds = sketchBounds(shapes.filter(({ id }) => selected.has(id)));
  if (!bounds) return shapes;
  dx = clamp(dx, -bounds.x, MOCKUP_W - bounds.x - bounds.width);
  dy = clamp(dy, -bounds.y, MOCKUP_H - bounds.y - bounds.height);
  return shapes.map((shape) => selected.has(shape.id) ? { ...shape, x: shape.x + dx, y: shape.y + dy } : shape);
}

export function resizeSketchShape(shape, point, corner) {
  const west = corner.includes('w');
  const north = corner.includes('n');
  const anchorX = west ? shape.x + shape.width : shape.x;
  const anchorY = north ? shape.y + shape.height : shape.y;
  const maxWidth = west ? anchorX : MOCKUP_W - anchorX;
  const maxHeight = north ? anchorY : MOCKUP_H - anchorY;
  const minWidth = shape.type === 'table' ? TABLE_MIN_COLUMN / Math.min(...shape.columns) : 4;
  const minHeight = shape.type === 'table' ? TABLE_MIN_HEIGHT : 4;
  let width = clamp(west ? anchorX - point.x : point.x - anchorX, minWidth, maxWidth);
  let height = clamp(north ? anchorY - point.y : point.y - anchorY, minHeight, maxHeight);
  let fontSize = shape.fontSize;
  if (shape.type === 'text') {
    const scale = clamp(
      (width * shape.width + height * shape.height) / (shape.width ** 2 + shape.height ** 2),
      Math.max(8 / shape.fontSize, 4 / shape.width),
      Math.min(maxWidth / shape.width, maxHeight / shape.height),
    );
    width = shape.width * scale;
    height = shape.height * scale;
    fontSize *= scale;
  }
  return {
    ...shape, width, height,
    x: west ? anchorX - width : anchorX,
    y: north ? anchorY - height : anchorY,
    ...(shape.type === 'text' ? { fontSize } : {}),
  };
}
