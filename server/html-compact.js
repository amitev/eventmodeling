import { parse, serialize } from 'parse5';

// Tags removed with their content: they do not draw anything in the sandboxed preview (R3.9).
const DROP_TAGS = new Set(['script', 'noscript', 'title', 'meta', 'base', 'template', 'iframe', 'object', 'embed']);

const DROP_ATTRS = new Set([
  'role', 'autocomplete', 'required', 'minlength', 'maxlength', 'pattern', 'autofocus',
  'action', 'method', 'target', 'rel', 'title', 'tabindex', 'contenteditable', 'spellcheck',
  'draggable', 'name',
]);
const dropAttr = (name) => DROP_ATTRS.has(name) || /^(data|aria)-/.test(name) || /^on[a-z]+$/.test(name);

// Elements that start a new line: whitespace next to them is never drawn. Any other element is
// treated as inline, so a space between two of them is kept.
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'br', 'caption', 'col', 'colgroup', 'dd', 'details',
  'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'li', 'link', 'main', 'nav', 'ol', 'optgroup', 'option',
  'p', 'pre', 'section', 'style', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
const KEEP_WHITESPACE = new Set(['pre', 'textarea', 'listing']);

const isText = (n) => n.nodeName === '#text';
const isElement = (n) => typeof n.tagName === 'string';
const isBlock = (n) => isElement(n) && BLOCK.has(n.tagName);

// CSS on one line: comments go, whitespace runs become one space, strings stay as they are.
function compactCss(css) {
  let out = '';
  for (let i = 0; i < css.length; ) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
    } else if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      if (!out.endsWith(' ')) out += ' ';
    } else if (/\s/.test(c)) {
      while (i < css.length && /\s/.test(css[i])) i++;
      if (!out.endsWith(' ')) out += ' ';
    } else {
      out += c;
      i++;
    }
  }
  return out.trim();
}

function clean(node) {
  if (!node.childNodes) return;
  node.childNodes = node.childNodes.filter((child) => {
    if (child.nodeName === '#comment') return false;
    if (!isElement(child)) return true;
    if (DROP_TAGS.has(child.tagName)) return false;
    if (child.tagName === 'link') {
      const rel = (child.attrs.find((a) => a.name === 'rel')?.value ?? '').toLowerCase().split(/\s+/);
      if (!rel.includes('stylesheet')) return false;
      child.attrs = child.attrs.filter((a) => a.name === 'rel' || !dropAttr(a.name));
    } else {
      child.attrs = child.attrs.filter((a) => !dropAttr(a.name));
    }
    return true;
  });
  const merged = [];
  for (const child of node.childNodes) {
    const last = merged[merged.length - 1];
    if (last && isText(last) && isText(child)) last.value += child.value;
    else merged.push(child);
  }
  node.childNodes = merged;
  node.childNodes.forEach(clean);
}

function collapse(node) {
  if (!node.childNodes) return;
  if (node.tagName === 'style') {
    node.childNodes.forEach((child) => {
      if (isText(child)) child.value = compactCss(child.value);
    });
    return;
  }
  if (KEEP_WHITESPACE.has(node.tagName)) return;
  const kids = node.childNodes;
  const keep = [];
  kids.forEach((child, i) => {
    if (!isText(child)) {
      collapse(child);
      keep.push(child);
      return;
    }
    let text = child.value.replace(/[ \t\n\r\f]+/g, ' ');
    // Edge spaces go next to a block. The document, html and body count as blocks.
    const before = kids[i - 1] ? isBlock(kids[i - 1]) : !isElement(node) || isBlock(node);
    const after = kids[i + 1] ? isBlock(kids[i + 1]) : !isElement(node) || isBlock(node);
    if (before) text = text.replace(/^ /, '');
    if (after) text = text.replace(/ $/, '');
    if (text === '') return;
    child.value = text;
    keep.push(child);
  });
  node.childNodes = keep;
}

// The HTML of a Screen mockup without what does not show in the preview: whitespace between and
// around blocks, repeated whitespace, comments, non-visual tags and attributes (SERVER.md S3.10).
export function compactHtml(html) {
  const doc = parse(html);
  clean(doc);
  collapse(doc);
  return serialize(doc);
}
