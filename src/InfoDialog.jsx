import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Links in the info preview open in a new tab, without access to the board.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Edits behind the helper buttons: ({ value, start, end }) -> the new text and selection.
const wrapSelection = (before, after, placeholder) => ({ value, start, end }) => {
  const sel = value.slice(start, end) || placeholder;
  const from = start + before.length;
  return {
    value: value.slice(0, start) + before + sel + after + value.slice(end),
    start: from,
    end: from + sel.length,
  };
};

const toggleTasks = ({ value, start, end }) => {
  if (start === end) {
    const atLineStart = start === 0 || value[start - 1] === '\n';
    const ins = `${atLineStart ? '' : '\n'}- [ ] Task\n- [x] Resolved task\n`;
    const at = start + ins.length;
    return { value: value.slice(0, start) + ins + value.slice(end), start: at, end: at };
  }
  const from = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split('\n');
  const on = lines.every((l) => l.startsWith('- [ ] '));
  const next = lines.map((l) => (on ? l.slice(6) : `- [ ] ${l}`)).join('\n');
  return { value: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
};

const insertTable = ({ value, start, end }) => {
  const atLineStart = start === 0 || value[start - 1] === '\n';
  const ins = `${atLineStart ? '' : '\n'}| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n`;
  const at = start + ins.length;
  return { value: value.slice(0, start) + ins + value.slice(end), start: at, end: at };
};

const toCode = (state) => {
  const { value, start, end } = state;
  const sel = value.slice(start, end);
  if (!sel.includes('\n')) return wrapSelection('`', '`', 'code')(state);
  const ins = `\`\`\`\n${sel}\n\`\`\``;
  return { value: value.slice(0, start) + ins + value.slice(end), start, end: start + ins.length };
};

const toLink = ({ value, start, end }) => {
  const text = value.slice(start, end) || 'text';
  const from = start + text.length + 3;
  return {
    value: `${value.slice(0, start)}[${text}](url)${value.slice(end)}`,
    start: from,
    end: from + 3,
  };
};

const svgProps = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };

const MARKDOWN_TOOLS = [
  { title: 'Bold', label: <b>B</b>, edit: wrapSelection('**', '**', 'bold') },
  { title: 'Italic', label: <i className="info-italic">I</i>, edit: wrapSelection('*', '*', 'italic') },
  { title: 'Strikethrough', label: <s>S</s>, edit: wrapSelection('~~', '~~', 'text') },
  null,
  {
    title: 'Task list',
    label: (
      <svg {...svgProps}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="currentColor" />
        <path d="M4 7.2L6.2 9.4L10 4.8" stroke="#fff" />
      </svg>
    ),
    edit: toggleTasks,
  },
  {
    title: 'Table',
    label: (
      <svg {...svgProps}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
        <path d="M1.5 5.2H12.5M1.5 8.8H12.5M7 1.5V12.5" />
      </svg>
    ),
    edit: insertTable,
  },
  { title: 'Code', label: <span className="info-code">&lt;/&gt;</span>, edit: toCode },
  {
    title: 'Link',
    label: (
      <svg {...svgProps}>
        <path d="M6 8L8 6M5.6 5.2L4.4 6.4A2.2 2.2 0 0 0 7.6 9.6L8.4 8.8M8.4 8.8L9.6 7.6A2.2 2.2 0 0 0 6.4 4.4L5.6 5.2" />
      </svg>
    ),
    edit: toLink,
  },
];

// Modal to edit the Markdown info of a Chapter, lane or slice: editor on the left, preview on
// the right. The changes only apply on Save.
export function InfoDialog({ title, initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const area = useRef(null);
  const pending = useRef(null); // selection to restore after a helper button changed the text
  // marked does not sanitise, so its HTML always goes through DOMPurify.
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text]);

  const apply = (edit) => {
    const el = area.current;
    const next = edit({ value: text, start: el.selectionStart, end: el.selectionEnd });
    pending.current = next;
    setText(next.value);
  };

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || !area.current) return;
    pending.current = null;
    area.current.focus();
    area.current.setSelectionRange(p.start, p.end);
  }, [text]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="info-backdrop">
      <div className="info-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="info-title">{title}</div>
        <div className="info-panes">
          <div className="info-left">
            <div className="info-toolbar">
              {MARKDOWN_TOOLS.map((tool, i) =>
                tool ? (
                  <button
                    key={tool.title}
                    title={tool.title}
                    aria-label={tool.title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(tool.edit)}
                  >
                    {tool.label}
                  </button>
                ) : (
                  <span key={i} className="info-sep" />
                )
              )}
            </div>
            <textarea
              ref={area}
              className="info-editor"
              autoFocus
              spellCheck={false}
              placeholder="Markdown"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="info-preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="info-actions">
          <button onClick={() => onSave(text)}>Save</button>
          <button onClick={onCancel} title="Cancel (Esc)">Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
