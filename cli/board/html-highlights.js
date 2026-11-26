import { parse } from 'parse5';
import { DROP_TAGS } from './html-compact.js';
import { LANE_COLORS, LANE_COLOR_RGB } from './lane-colors.js';

const SELECTED = 'em-screen-highlight';
const STYLE_ID = 'em-screen-highlight-style';
export const SOURCE_ATTRIBUTE = 'data-em-screen-source';

const highlightClass = (color) => `${SELECTED}-${color}`;
const isHighlightClass = (name) => name === SELECTED || LANE_COLORS.some((color) => name === highlightClass(color));
const targetKey = (item) => item.id !== undefined ? `id:${item.id}` : item.path;
const targetOf = (element) => element.id ? { id: element.id } : { path: element.path };

function editSource(source, edits) {
  return edits.sort((a, b) => b.start - a.start).reduce(
    (text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end),
    source,
  );
}

const attributeText = (classes) => classes.length
  ? `class="${classes.join(' ').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
  : '';

function classEdit(element, selected) {
  const classes = element.classes.filter((name) => !isHighlightClass(name));
  if (selected) classes.push(highlightClass(element.color));
  const location = element.location.attrs?.class;
  if (location) return { start: location.startOffset, end: location.endOffset, text: attributeText(classes) };
  const at = element.location.startTag.startOffset + element.tag.length + 1;
  return { start: at, end: at, text: ` ${attributeText(classes)}` };
}

export function highlightProblem(value) {
  if (!Array.isArray(value) || value.some((item) =>
    !item || typeof item !== 'object' || Array.isArray(item) ||
    Object.keys(item).length !== 2 ||
    !(typeof item.id === 'string' && item.id.trim() && !('path' in item) ||
      typeof item.path === 'string' && /^body(?:\/[A-Za-z][A-Za-z0-9:-]*\[[1-9]\d*\])+$/.test(item.path) && !('id' in item)) ||
    !LANE_COLORS.includes(item.color) || item.color === 'none')) {
    return 'highlights must be a list of { id, color } or { path, color } using HTML element targets and lane colors other than none';
  }
  if (new Set(value.map(targetKey)).size !== value.length) return 'highlights must not contain duplicate targets';
  return null;
}

export function inspectHtml(source, highlights = []) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const elements = [];
  const styles = [];
  const seen = new Set();
  const structure = [];
  const ids = new Map();
  const wanted = new Map(highlights.map((item) => [targetKey(item), item.color]));
  let styleAt = 0;
  const visit = (node, path = '') => {
    if (node.tagName === 'body') path = 'body';
    const selectable = path && !DROP_TAGS.has(node.tagName) && !['style', 'link'].includes(node.tagName);
    const id = node.attrs?.find((attr) => attr.name === 'id')?.value ?? '';
    if (id && !DROP_TAGS.has(node.tagName)) ids.set(id, (ids.get(id) ?? 0) + 1);
    if (selectable) structure.push([path, node.attrs.find((attr) => attr.name === 'id')?.value ?? '']);
    const location = node.sourceCodeLocation;
    if (node.nodeName === '#documentType' && location) styleAt = location.endOffset;
    if (node.tagName === 'head' && location?.startTag) styleAt = location.startTag.endOffset;
    if (node.tagName && location?.startTag && !seen.has(location.startOffset)) {
      seen.add(location.startOffset);
      if (node.tagName === 'style' && node.attrs.some((attr) => attr.name === 'id' && attr.value === STYLE_ID)) {
        styles.push({ start: location.startOffset, end: location.endOffset });
      } else {
        const classes = (node.attrs.find((attr) => attr.name === 'class')?.value ?? '').split(/\s+/).filter(Boolean);
        elements.push({
          start: location.startOffset, end: location.endOffset, tag: node.tagName,
          path: selectable && path !== 'body' ? path : '',
          id, classes, legacy: classes.some(isHighlightClass), location,
        });
      }
    }
    if (DROP_TAGS.has(node.tagName)) return;
    const counts = new Map();
    node.childNodes?.forEach((child) => {
      if (child.tagName) counts.set(child.tagName, (counts.get(child.tagName) ?? 0) + 1);
      visit(child, path && child.tagName ? `${path}/${child.tagName}[${counts.get(child.tagName)}]` : '');
    });
  };
  visit(document);
  for (const element of elements) {
    if (!element.path || !element.id.trim() || ids.get(element.id) !== 1) element.id = '';
    const key = wanted.has(targetKey(targetOf(element))) ? targetKey(targetOf(element)) : element.path;
    element.selected = !!element.path && wanted.has(key);
    element.color = wanted.get(key);
    element.highlightKey = key;
  }
  const selected = elements.filter((element) => element.selected);
  return { elements, selected, styles, styleAt, structure: JSON.stringify(structure) };
}

export function htmlStructure(source = '') {
  return inspectHtml(source).structure;
}

export function highlightHtml(source, highlights = [], inspection = false, model) {
  if (!inspection && !highlights.length && !source.includes(SELECTED) && !source.includes(STYLE_ID)) return source;
  model = model ?? inspectHtml(source, highlights);
  const edits = [];
  for (const element of model.elements) {
    if (element.legacy || element.selected) edits.push(classEdit(element, element.selected));
    if (inspection && element.path) {
      const at = element.location.startTag.startOffset + element.tag.length + 1;
      edits.push({ start: at, end: at, text: ` ${SOURCE_ATTRIBUTE}="${element.start}"` });
    }
  }
  const css = [...new Set(model.selected.map((element) => element.color))]
    .map((color) => `.${highlightClass(color)} { outline: 2px solid rgb(${LANE_COLOR_RGB[color]}) !important; outline-offset: 2px !important; }`)
    .join('\n');
  const style = `<style id="${STYLE_ID}">${css}\n</style>`;
  model.styles.forEach((range, index) => edits.push({ ...range, text: model.selected.length && index === 0 ? style : '' }));
  if (model.selected.length && !model.styles.length) edits.push({ start: model.styleAt, end: model.styleAt, text: style });
  return editSource(source, edits);
}

export function extractHighlights(source = '') {
  if (!source.includes(SELECTED) && !source.includes(STYLE_ID)) return { html: source, highlights: [] };
  const model = inspectHtml(source);
  const highlights = model.elements.filter((element) => element.legacy && element.path).map((element) => ({
    ...targetOf(element),
    color: LANE_COLORS.find((color) => color !== 'none' && element.classes.includes(highlightClass(color))) ?? 'red',
  }));
  return { html: highlightHtml(source, [], false, model), highlights };
}

export function retainHighlights(before = '', after = '', highlights = []) {
  const model = inspectHtml(after, highlights);
  const sameStructure = htmlStructure(before) === model.structure;
  const selected = new Set(model.selected.map((element) => element.highlightKey));
  return highlights.filter((item) => (item.id !== undefined || sameStructure) && selected.has(targetKey(item)));
}

export function clearScreenHighlights(elements, originalId, before, after) {
  const cleared = [];
  for (const element of elements) {
    if ((element.id === originalId || element.copyOf === originalId) && element.highlights?.length) {
      const kept = retainHighlights(before, after, element.highlights);
      if (kept.length === element.highlights.length) continue;
      cleared.push(element.id);
      if (kept.length) element.highlights = kept;
      else delete element.highlights;
    }
  }
  return cleared;
}

export function toggleHighlight(source, offset, highlights = [], color = 'red', model = inspectHtml(source, highlights)) {
  if (!LANE_COLORS.includes(color)) throw new Error('Choose a lane color for the highlight.');
  const element = model.elements.find((item) => item.start === offset && item.path);
  if (!element) throw new Error('The preview no longer matches the HTML. Wait for it to reload and try again.');
  if (color === 'none' || element.color === color) return highlights.filter((item) => targetKey(item) !== element.highlightKey);
  const highlight = { ...targetOf(element), color };
  return element.selected
    ? highlights.map((item) => targetKey(item) === element.highlightKey ? highlight : item)
    : [...highlights, highlight];
}
