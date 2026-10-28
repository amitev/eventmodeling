import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose, useModalFocus } from './popup.js';
import { HTML_SANDBOX, URL_SANDBOX, isWebUrl } from './mockup.js';

// Pasted HTML loses its <script> tags (and their code): the preview is sandboxed anyway, but a
// mockup has no use for scripts (R3.7).
export const stripScripts = (html) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<\/?script\b[^>]*>/gi, '');

// Modal to edit the mockup of a Screen (R3.7): either HTML code, or a web page by URL. The
// URL wins and disables the code editor. The code is on the left, the rendering on the right in
// a sandboxed iframe, so the mockup's styles cannot reach the board. The changes only apply on Save.
export function HtmlDialog({ title, initial, initialUrl = '', initialReading = false, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const [url, setUrl] = useState(initialUrl);
  const [urlInvalid, setUrlInvalid] = useState(false); // after a refused Save
  const [reading, setReading] = useState(initialReading); // view mode: only the preview is shown
  const [maximized, setMaximized] = useState(false); // the popup fills the whole window
  const backdrop = useBackdropClose(onCancel);
  const modal = useModalFocus();
  const urlInput = useRef(null);
  const usingUrl = url.trim() !== '';
  const pageUrl = usingUrl && isWebUrl(url.trim()) ? url.trim() : null; // what the preview shows

  // Save refuses a URL that is not an http(s) address (its field turns red).
  const save = () => {
    const wanted = url.trim();
    if (wanted && !isWebUrl(wanted)) {
      setUrlInvalid(true);
      urlInput.current?.focus();
      return;
    }
    onSave(text, wanted);
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
      setText(el.value);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        setMaximized((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault(); // not the browser's Save page
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

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
          <button
            className="info-mode"
            title={reading ? 'Edit mode: show the editor' : 'View mode: show only the preview'}
            aria-label={reading ? 'Edit mode' : 'View mode'}
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
          {!reading && (
            <div className="info-left">
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
              <textarea
                className="info-editor html-code"
                autoFocus={!usingUrl}
                spellCheck={false}
                placeholder={usingUrl ? 'The URL is used; the code editor is disabled' : '<h1>Hello</h1>'}
                disabled={usingUrl}
                value={usingUrl ? '' : text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
              />
            </div>
          )}
          <div className="html-preview-box">
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
            ) : (
              <iframe
                key={pageUrl ?? 'code'}
                className="html-preview"
                title="Preview"
                sandbox={pageUrl ? URL_SANDBOX : HTML_SANDBOX}
                {...(pageUrl ? { src: pageUrl } : { srcDoc: text })}
              />
            )}
          </div>
        </div>
        <div className="info-actions">
          <button onClick={save} title="Save (Ctrl+S)">
            Save
          </button>
          <button onClick={onCancel} title="Cancel (Esc)">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
