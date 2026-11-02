// Lays out the HTML code of a Screen mockup for reading in the editor (R3.7): one tag per line,
// indented by 2 spaces; text-level tags stay in their text; CSS has one declaration per line.
// Only whitespace changes. No line wrapping.

const INDENT = '  ';
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
// Kept on the line of their text: a line break next to them would add a visible space. Form
// controls and media are not here, so each starts its own line.
const INLINE = new Set([
  'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins',
  'kbd', 'mark', 'q', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt',
  'u', 'var', 'wbr',
]);
// Their content is not HTML: style is formatted as CSS, script is only re-indented, the rest is kept as is.
const RAW = new Set(['style', 'script', 'pre', 'textarea']);
// An open tag of these ends an open one of the same name (`<li>a<li>b`).
const SELF_ENDING = new Set(['li', 'p', 'tr', 'td', 'th', 'dt', 'dd', 'option']);

const WHITESPACE = /[ \t\n\r\f]+/g;

// A tag, comment or doctype starting at `i`: { end, name, closing, text } or null (a plain `<`).
function readMarkup(html, i) {
  if (html.startsWith('<!--', i)) {
    const end = html.indexOf('-->', i + 4);
    const stop = end < 0 ? html.length : end + 3;
    return { end: stop, name: '', text: html.slice(i, stop) };
  }
  const next = html[i + 1];
  if (next === '!' || next === '?') {
    const end = html.indexOf('>', i);
    const stop = end < 0 ? html.length : end + 1;
    return { end: stop, name: '', text: html.slice(i, stop) };
  }
  const match = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(i, i + 80));
  if (!match) return null;
  let text = '';
  let j = i;
  while (j < html.length && html[j] !== '>') {
    const c = html[j];
    if (c === '"' || c === "'") {
      const close = html.indexOf(c, j + 1);
      const stop = close < 0 ? html.length : close + 1;
      text += html.slice(j, stop);
      j = stop;
    } else if (/\s/.test(c)) {
      while (j < html.length && /\s/.test(html[j])) j++;
      if (html[j] !== '>' && html[j] !== '/') text += ' ';
    } else {
      text += c;
      j++;
    }
  }
  return {
    end: j + 1,
    name: match[2].toLowerCase(),
    closing: match[1] === '/',
    selfClosed: text.endsWith('/'),
    text: `${text}>`,
  };
}

// CSS as lines, one declaration each, nested blocks indented. Strings, comments and
// parentheses (url(data:...;...)) are never split.
function cssLines(css) {
  const lines = [];
  let level = 0;
  let buf = '';
  let parens = 0;
  const emit = (text) => {
    if (text.trim()) lines.push(INDENT.repeat(level) + text.trim());
  };
  for (let i = 0; i < css.length; ) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      buf += css.slice(i, j + 1);
      i = j + 1;
    } else if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      const comment = css.slice(i, stop);
      if (buf.trim()) buf += comment;
      else emit(comment);
      i = stop;
    } else if (/\s/.test(c)) {
      while (i < css.length && /\s/.test(css[i])) i++;
      if (buf && !buf.endsWith(' ')) buf += ' ';
    } else {
      i++;
      if (c === '(') parens++;
      else if (c === ')') parens = Math.max(0, parens - 1);
      if (parens > 0 || (c !== '{' && c !== '}' && c !== ';')) buf += c;
      else if (c === '{') {
        emit(`${buf.trim()} {`.trim());
        level++;
        buf = '';
      } else if (c === ';') {
        emit(`${buf.trim()};`);
        buf = '';
      } else {
        if (buf.trim()) emit(`${buf.trim()};`);
        buf = '';
        level = Math.max(0, level - 1);
        if (lines[lines.length - 1] === '') lines.pop();
        emit('}');
        lines.push(''); // a blank line after every block
      }
    }
  }
  emit(buf);
  while (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// The code of a script without its common indentation and blank edges.
function scriptLines(code) {
  const lines = code.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const indent = Math.min(...lines.filter(Boolean).map((l) => /^\s*/.exec(l)[0].length));
  return lines.map((l) => l.slice(indent));
}

function layout(html) {
  const entries = []; // { kind: 'text' | 'tag', depth, text }
  const stack = []; // open block tags: { name, at: index of its entry, text }
  let line = '';

  const add = (kind, text, depth = stack.length) => entries.push({ kind, depth, text });
  const flush = () => {
    if (line.trim()) add('text', line.trim());
    line = '';
  };
  const text = (value) => {
    const t = value.replace(WHITESPACE, ' ');
    line += line ? t : t.trimStart();
  };

  // A block holding nothing or one line of text goes on one line: <h1>Title</h1>.
  const close = (open, tag) => {
    const inner = entries.slice(open.at + 1);
    if (inner.length === 0 || (inner.length === 1 && inner[0].kind === 'text')) {
      const depth = entries[open.at].depth;
      entries.length = open.at;
      add('tag', `${open.text}${inner[0]?.text ?? ''}${tag.text}`, depth);
    } else {
      add('tag', tag.text);
    }
  };

  for (let i = 0; i < html.length; ) {
    const lt = html.indexOf('<', i);
    const markup = lt < 0 ? null : readMarkup(html, lt);
    if (!markup) {
      // Plain text up to the next tag (a lone `<` is text).
      const stop = lt < 0 ? html.length : lt + 1;
      text(html.slice(i, stop));
      i = stop;
      continue;
    }
    text(html.slice(i, lt));
    i = markup.end;
    const { name } = markup;

    if (!name) {
      flush();
      add('tag', markup.text);
    } else if (INLINE.has(name)) {
      line += markup.text;
    } else if (markup.closing) {
      flush();
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at < 0) {
        add('tag', markup.text);
      } else {
        const open = stack[at];
        stack.length = at;
        close(open, markup);
      }
    } else if (RAW.has(name) && !markup.selfClosed) {
      flush();
      const end = new RegExp(`</${name}\\s*>`, 'i').exec(html.slice(i));
      const code = html.slice(i, end ? i + end.index : html.length);
      const closeTag = `</${name}>`;
      i = end ? i + end.index + end[0].length : html.length;
      if (name === 'style' || name === 'script') {
        const body = name === 'style' ? cssLines(code) : scriptLines(code);
        add('tag', body.length ? markup.text : `${markup.text}${closeTag}`);
        if (body.length) {
          body.forEach((l) => add('tag', l, stack.length + 1));
          add('tag', closeTag);
        }
      } else {
        add('tag', `${markup.text}${code}${closeTag}`);
      }
    } else if (VOID.has(name) || markup.selfClosed) {
      if (name === 'br') {
        line += markup.text;
        flush();
      } else {
        flush();
        add('tag', markup.text);
      }
    } else {
      flush();
      if (SELF_ENDING.has(name) && stack[stack.length - 1]?.name === name) {
        close(stack.pop(), { text: `</${name}>` });
      }
      stack.push({ name, at: entries.length, text: markup.text });
      add('tag', markup.text, stack.length - 1);
    }
  }
  flush();
  return entries.map((e) => (e.text ? INDENT.repeat(e.depth) + e.text : '')).join('\n');
}

// The code as is when it cannot be laid out.
export function beautifyHtml(html) {
  if (!html.trim()) return html;
  try {
    return layout(html);
  } catch {
    return html;
  }
}
