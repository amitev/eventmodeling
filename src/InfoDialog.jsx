import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useBackdropClose } from './popup.js';

// Links in the info preview open in a new tab, without access to the board.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Markdown to safe HTML (marked does not sanitise, so its HTML always goes through DOMPurify).
export const renderMarkdown = (text) => DOMPurify.sanitize(marked.parse(text, { async: false }));

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
  { title: 'Bold', key: 'b', label: <b>B</b>, edit: wrapSelection('**', '**', 'bold') },
  { title: 'Italic', key: 'i', label: <i className="info-italic">I</i>, edit: wrapSelection('*', '*', 'italic') },
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
    key: 'l',
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
export function InfoDialog({ title, initial, initialReading = false, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const textRef = useRef(initial); // the latest text, for the Ctrl+S listener
  textRef.current = text;
  const [reading, setReading] = useState(initialReading); // read mode: only the preview is shown
  const backdrop = useBackdropClose(onCancel);
  const area = useRef(null);
  const pending = useRef(null); // selection to restore after a helper button changed the text
  // marked does not sanitise, so its HTML always goes through DOMPurify.
  const html = useMemo(() => renderMarkdown(text), [text]);

  const apply = (edit) => {
    const el = area.current;
    const next = edit({ value: text, start: el.selectionStart, end: el.selectionEnd });
    pending.current = next;
    change(next.value, false);
  };
  const applyRef = useRef(apply); // the latest apply, for the hotkey listener
  applyRef.current = apply;

  // The editor's own undo/redo (the browser's cannot follow the toolbar's edits). Snapshots hold
  // the text and the selection; typing in one burst (pauses under a second) is one step.
  const history = useRef({ past: [], future: [], typingAt: 0 });
  const selection = useRef({ start: 0, end: 0 });
  const snapshot = () => ({ value: text, ...selection.current });
  const change = (value, typing) => {
    const h = history.current;
    const now = Date.now();
    if (!(typing && h.typingAt && now - h.typingAt < 1000 && h.past.length)) h.past.push(snapshot());
    h.typingAt = typing ? now : 0;
    h.future = [];
    setText(value);
  };
  const travel = (from, to) => {
    const h = history.current;
    const target = h[from].pop();
    if (!target) return;
    h[to].push(snapshot());
    h.typingAt = 0;
    pending.current = target;
    setText(target.value);
  };
  const undo = () => travel('past', 'future');
  const redo = () => travel('future', 'past');
  const historyRef = useRef({ undo, redo });
  historyRef.current = { undo, redo };

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || !area.current) return;
    pending.current = null;
    area.current.focus();
    area.current.setSelectionRange(p.start, p.end);
  }, [text]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault(); // not the browser's Save page
        onSave(textRef.current);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && area.current && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) historyRef.current.redo();
        else historyRef.current.undo();
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && area.current && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        historyRef.current.redo();
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && area.current) {
        const tool = MARKDOWN_TOOLS.find((t) => t?.key === e.key.toLowerCase());
        if (tool) {
          e.preventDefault();
          applyRef.current(tool.edit);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onSave]);

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div className="info-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="info-title">
          <span>{title}</span>
          <button
            className="info-mode"
            title={reading ? 'Write mode: show the editor' : 'Read mode: show only the preview'}
            aria-label={reading ? 'Write mode' : 'Read mode'}
            onClick={() => setReading((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {reading ? (
                <path d="M2 14l.8-3.2L11 2.6l2.4 2.4-8.2 8.2L2 14zM9.6 4l2.4 2.4" />
              ) : (
                <>
                  <path d="M1 8C3 4.5 5.5 3 8 3s5 1.5 7 5c-2 3.5-4.5 5-7 5S3 11.5 1 8Z" />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                </>
              )}
            </svg>
          </button>
        </div>
        <div className={`info-panes${reading ? ' reading' : ''}`}>
          {!reading && (
          <div className="info-left">
            <div className="info-toolbar">
              <button
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                disabled={!history.current.past.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={undo}
              >
                ↶
              </button>
              <button
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
                disabled={!history.current.future.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={redo}
              >
                ↷
              </button>
              <span className="info-sep" />
              {MARKDOWN_TOOLS.map((tool, i) =>
                tool ? (
                  <button
                    key={tool.title}
                    title={tool.key ? `${tool.title} (Ctrl+${tool.key.toUpperCase()})` : tool.title}
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
              onChange={(e) => change(e.target.value, true)}
              onSelect={(e) => {
                selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
              }}
            />
          </div>
          )}
          <div className="info-preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="info-actions">
          <button onClick={() => onSave(text)} title="Save (Ctrl+S)">Save</button>
          <button onClick={onCancel} title="Cancel (Esc)">Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
