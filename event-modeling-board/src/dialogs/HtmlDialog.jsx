import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose, useModalFocus } from './popup.js';
import { URL_SANDBOX, isWebUrl } from '../model/mockup.js';
import { beautifyHtml } from '../model/beautify.js';
import { extractHighlights, htmlStructure, inspectHtml, toggleHighlight } from '../../../server/html-highlights.js';
import { MarkdownEditor } from './InfoDialog.jsx';
import { HighlightPreview } from './HtmlHighlight.jsx';
import { ColorPicker } from '../nodes/parts.jsx';

// Pasted HTML loses its <script> tags (and their code): the preview is sandboxed anyway, but a
// mockup has no use for scripts (R3.7).
export const stripScripts = (html) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<\/?script\b[^>]*>/gi, '');

// One draft for Screen content and info; tab panels stay mounted to keep editor state.
export function HtmlDialog({ title, initial, initialUrl = '', initialInfo = '', initialHighlights = [], initialTab = 'content', initialReading = false, previewOnly = false, readOnly = false, highlightsReadOnly = readOnly, onSave, onCancel }) {
  const [content] = useState(() => extractHighlights(initial));
  const [text, setText] = useState(() => initialTab === 'content' ? beautifyHtml(content.html) : content.html);
  const [highlights, setHighlights] = useState(initialHighlights);
  const [structureNotice, setStructureNotice] = useState(false);
  const [url, setUrl] = useState(initialUrl);
  const [info, setInfo] = useState(initialInfo);
  const [tab, setTab] = useState(initialTab);
  const formatted = useRef(initialTab === 'content');
  const tabId = useId();
  const editors = useRef(null);
  const [urlInvalid, setUrlInvalid] = useState(false); // after a refused Save
  const [reading, setReading] = useState(initialReading || previewOnly);
  const [maximized, setMaximized] = useState(false); // the popup fills the whole window
  const [highlighting, setHighlighting] = useState(false);
  const [highlightColor, setHighlightColor] = useState('red');
  const [pickingColor, setPickingColor] = useState(false);
  const [highlightError, setHighlightError] = useState('');
  const backdrop = useBackdropClose(onCancel);
  const modal = useModalFocus();
  const urlInput = useRef(null);
  const focusUrl = useRef(false);
  const usingUrl = url.trim() !== '';
  const pageUrl = usingUrl && isWebUrl(url.trim()) ? url.trim() : null; // what the preview shows
  const highlightModel = useMemo(() => inspectHtml(text, highlights), [text, highlights]);
  const picking = highlighting && !highlightsReadOnly && !reading && tab === 'content' && !usingUrl;
  const canSave = !readOnly || !highlightsReadOnly;
  const pickHighlight = (offset, source) => {
    const element = highlightModel.elements.find((item) => item.start === offset && item.path);
    if (!picking || source !== text || !element) {
      setHighlightError('The preview no longer matches the HTML. Wait for it to reload and try again.');
      return false;
    }
    setHighlightError('');
    if (highlightColor === 'none' && !element.selected) return false;
    setHighlights(toggleHighlight(text, offset, highlights, highlightColor, highlightModel));
    return true;
  };
  const changeText = (value) => {
    if (htmlStructure(value) !== highlightModel.structure) {
      setHighlights([]);
      setStructureNotice(true);
    }
    setText(value);
  };

  const selectTab = (next) => {
    if (next === 'content' && !formatted.current) {
      formatted.current = true;
      setText(beautifyHtml(text));
    }
    setTab(next);
  };
  const onTabKey = (e) => {
    if (readOnly) return;
    const next = {
      ArrowLeft: tab === 'content' ? 'info' : 'content',
      ArrowRight: tab === 'content' ? 'info' : 'content',
      Home: 'content',
      End: 'info',
    }[e.key];
    if (!next) return;
    e.preventDefault();
    selectTab(next);
    e.currentTarget.querySelector(`[data-tab="${next}"]`).focus();
  };
  useLayoutEffect(() => {
    if (!reading) {
      const field = tab === 'content' && usingUrl ? 'input' : 'textarea:not(:disabled)';
      editors.current?.querySelector(`[role="tabpanel"]:not([hidden]) ${field}`)
        ?.focus({ preventScroll: true });
    }
  }, [reading]);
  useLayoutEffect(() => {
    if (focusUrl.current && !reading && tab === 'content') {
      focusUrl.current = false;
      urlInput.current?.focus({ preventScroll: true });
    }
  }, [urlInvalid, tab, reading]);

  // Save refuses a URL that is not an http(s) address (its field turns red).
  const save = () => {
    const wanted = url.trim();
    if (wanted && !isWebUrl(wanted)) {
      focusUrl.current = true;
      setUrlInvalid(true);
      selectTab('content');
      setReading(false);
      urlInput.current?.focus();
      return;
    }
    onSave(text, wanted, info, usingUrl ? [] : highlights);
  };
  const saveRef = useRef(save); // the latest save, for the Ctrl+S listener
  saveRef.current = save;

  const onPaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    const clean = stripScripts(pasted);
    if (clean === pasted) return; // nothing to remove: the browser pastes as usual
    e.preventDefault();
    // insertText keeps the browser's own undo; setRangeText is the fallback.
    if (!document.execCommand('insertText', false, clean)) {
      const el = e.target;
      el.setRangeText(clean, el.selectionStart, el.selectionEnd, 'end');
      changeText(el.value);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') onCancel();
    else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      setMaximized((v) => !v);
    } else if (canSave && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); // not the browser's Save page
      saveRef.current();
    }
  };
  const keyHandler = useRef(onKey);
  keyHandler.current = onKey;
  useEffect(() => {
    const onKey = (e) => keyHandler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div
        ref={modal}
        tabIndex={-1}
        className={`info-dialog${maximized ? ' maximized' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="info-title">
          <span>{title}</span>
          {!previewOnly && (
            <button
              className="info-mode"
              title={reading ? (readOnly ? 'Show shared source (read-only)' : 'Edit mode: show the editor') : 'View mode: show only the preview'}
              aria-label={reading ? (readOnly ? 'Show source' : 'Edit mode') : 'View mode'}
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
          )}
          {!reading && (
            <div className="screen-editor-tabs" role="tablist" aria-label="Screen editor" onKeyDown={onTabKey}>
              {(readOnly ? ['content'] : ['content', 'info']).map((name) => (
                <button
                  key={name}
                  id={`${tabId}-${name}-tab`}
                  type="button"
                  role="tab"
                  data-tab={name}
                  aria-selected={tab === name}
                  aria-controls={`${tabId}-${name}-panel`}
                  tabIndex={tab === name ? 0 : -1}
                  onClick={() => selectTab(name)}
                >
                  {name === 'content' ? 'Content' : 'Info'}
                </button>
              ))}
            </div>
          )}
          <button
            className="info-mode info-maximize"
            title={maximized ? 'Restore the size (Alt+Enter)' : 'Full screen (Alt+Enter)'}
            aria-label={maximized ? 'Restore the size' : 'Full screen'}
            aria-pressed={maximized}
            onClick={() => setMaximized((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              {maximized ? (
                <path d="M6 1.5V6H1.5M10 1.5V6h4.5M6 14.5V10H1.5M10 14.5V10h4.5" />
              ) : (
                <path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" />
              )}
            </svg>
          </button>
        </div>
        <div className={`info-panes${reading ? ' reading' : ''}`}>
          <div ref={editors} className="info-left screen-editors" hidden={reading}>
            <div
              id={`${tabId}-content-panel`}
              role="tabpanel"
              aria-labelledby={`${tabId}-content-tab`}
              className="screen-editor-panel"
              hidden={tab !== 'content'}
            >
              <div className="html-url-row">
                <input
                  ref={urlInput}
                  className={`html-url${urlInvalid ? ' invalid' : ''}`}
                  type="text"
                  inputMode="url"
                  spellCheck={false}
                  placeholder="URL of a web page (http:// or https://), instead of the code"
                  aria-label="URL"
                  aria-invalid={urlInvalid}
                  readOnly={readOnly}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlInvalid(false);
                  }}
                />
                {pageUrl && (
                  <a className="html-open" href={pageUrl} target="_blank" rel="noopener noreferrer" title="Open the page in a new tab">
                    Open ↗
                  </a>
                )}
              </div>
              {readOnly && (
                <div className="html-blocked-hint">
                  Shared content is read-only.{!highlightsReadOnly && " Save changes only this Screen's highlights."}
                </div>
              )}
              <textarea
                className="info-editor html-code"
                aria-label="Screen HTML"
                spellCheck={false}
                value={usingUrl ? '' : text}
                placeholder={usingUrl ? 'The URL is used; the code editor is disabled' : '<h1>Hello</h1>'}
                disabled={usingUrl}
                readOnly={readOnly}
                onChange={(e) => changeText(e.target.value)}
                onPaste={readOnly ? undefined : onPaste}
              />
            </div>
            <div
              id={`${tabId}-info-panel`}
              role="tabpanel"
              aria-labelledby={`${tabId}-info-tab`}
              className="screen-editor-panel"
              hidden={tab !== 'info'}
            >
              <MarkdownEditor text={info} onChange={setInfo} active={!readOnly && !reading && tab === 'info'} autoFocus={false} />
            </div>
          </div>
          <div className="html-preview-box">
            {!highlightsReadOnly && (readOnly || !reading && tab === 'content') && (
              <div className="html-highlight-tools">
                <button
                  type="button"
                  disabled={usingUrl}
                  aria-pressed={picking}
                  title={usingUrl ? 'Highlighting is available for HTML only' : 'Click preview elements to toggle highlights'}
                  onClick={() => {
                    setHighlightError('');
                    setHighlighting(!picking);
                    if (!picking) {
                      selectTab('content');
                      setReading(false);
                    }
                  }}
                >
                  Highlight elements
                </button>
                <ColorPicker
                  color={highlightColor}
                  onChange={(color) => {
                    setHighlightColor(color);
                    setHighlightError('');
                    setHighlighting(true);
                    selectTab('content');
                    setReading(false);
                  }}
                  open={pickingColor}
                  onOpenChange={setPickingColor}
                  disabled={usingUrl}
                  label="Highlight colour"
                />
                <button
                  type="button"
                  disabled={usingUrl || !highlightModel.selected.length}
                  onClick={() => {
                    setHighlightError('');
                    setHighlights([]);
                  }}
                >
                  Clear highlights
                </button>
                <span>{usingUrl ? 'HTML only' : `${highlightModel.selected.length} selected`}</span>
                {!usingUrl && <span>Choose colour, then click: recolour or toggle. None removes.</span>}
              </div>
            )}
            {structureNotice && <div className="html-blocked-hint" role="status">HTML structure changed. Draft highlights were cleared; saving structural changes clears copies too.</div>}
            {highlightError && <div className="html-highlight-error" role="alert">{highlightError}</div>}
            {usingUrl && (
              <div className="html-blocked-hint">
                Blank page or an error? The site may not allow being shown in a frame.{' '}
                {pageUrl && (
                  <a href={pageUrl} target="_blank" rel="noopener noreferrer">
                    Open it in a new tab ↗
                  </a>
                )}
              </div>
            )}
            {usingUrl && !pageUrl ? (
              <div className="html-preview html-invalid">Enter an http:// or https:// address.</div>
            ) : pageUrl ? (
              <iframe
                key={pageUrl}
                className="html-preview"
                title="Preview"
                sandbox={URL_SANDBOX}
                src={pageUrl}
              />
            ) : (
              <HighlightPreview
                text={text}
                highlights={highlights}
                model={highlightModel}
                picking={picking}
                onPick={pickHighlight}
                onKey={onKey}
                onError={(message) => {
                  setHighlightError(message);
                  setHighlighting(false);
                }}
              />
            )}
          </div>
        </div>
        <div className="info-actions">
          {canSave && (
            <button className="primary" onClick={save} title="Save (Ctrl+S)">
              Save
            </button>
          )}
          <button onClick={onCancel} title={canSave ? 'Cancel (Esc)' : 'Close (Esc)'}>
            {canSave ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
