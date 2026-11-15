import { useEffect, useRef } from 'react';
import { HTML_INSPECTION_SANDBOX, HTML_SANDBOX } from '../model/mockup.js';
import { SOURCE_ATTRIBUTE, highlightHtml } from '../../../server/html-highlights.js';

export function HighlightPreview({ text, highlights, model, picking, onPick, onError, onKey }) {
  const frame = useRef(null);
  const cleanup = useRef(null);
  const scroll = useRef({ x: 0, y: 0 });
  const callbacks = useRef(null);
  callbacks.current = { onPick, onError, onKey };
  useEffect(() => () => cleanup.current?.(), []);

  const loaded = () => {
    cleanup.current?.();
    cleanup.current = null;
    if (!picking) return;
    const doc = frame.current.contentDocument;
    if (!doc?.body) {
      callbacks.current.onError('The preview left the HTML document. Highlighting is unavailable on external pages.');
      return;
    }
    const view = doc.defaultView;
    const outline = doc.createElement('div');
    outline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:1px dashed #ff5252;border-radius:3px;box-sizing:border-box;display:none;filter:none!important';
    doc.body.append(outline);
    let hovered = null;
    const position = () => {
      if (!hovered?.isConnected) {
        outline.style.display = 'none';
        return;
      }
      const rect = hovered.getBoundingClientRect();
      Object.assign(outline.style, {
        display: 'block', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
      });
    };
    const target = (event) => {
      const element = event.target.closest?.(`[${SOURCE_ATTRIBUTE}]`);
      return element && doc.body.contains(element) &&
        !/^(BODY|SCRIPT|STYLE|LINK|META)$/.test(element.tagName.toUpperCase()) ? element : null;
    };
    const move = (event) => { hovered = target(event); position(); };
    const leave = () => { hovered = null; position(); };
    const rememberScroll = () => {
      scroll.current = { x: view.scrollX, y: view.scrollY };
      position();
    };
    const stop = (event) => event.preventDefault();
    const pick = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const element = target(event);
      if (!element) return;
      rememberScroll();
      if (callbacks.current.onPick(Number(element.getAttribute(SOURCE_ATTRIBUTE)), text)) {
        doc.documentElement.style.pointerEvents = 'none';
        leave();
      }
    };
    const key = (event) => {
      if (event.key === 'Escape' ||
        (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'Enter') ||
        ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's')) {
        event.preventDefault();
        callbacks.current.onKey(event);
      }
    };
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerleave', leave);
    doc.addEventListener('pointerdown', stop, true);
    doc.addEventListener('pointerup', pick, true);
    doc.addEventListener('click', stop, true);
    doc.addEventListener('keydown', key, true);
    doc.addEventListener('scroll', rememberScroll, true);
    view.addEventListener('resize', position);
    view.scrollTo(scroll.current.x, scroll.current.y);
    cleanup.current = () => {
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerleave', leave);
      doc.removeEventListener('pointerdown', stop, true);
      doc.removeEventListener('pointerup', pick, true);
      doc.removeEventListener('click', stop, true);
      doc.removeEventListener('keydown', key, true);
      doc.removeEventListener('scroll', rememberScroll, true);
      view.removeEventListener('resize', position);
      outline.remove();
    };
  };

  return (
    <iframe
      ref={frame}
      key={picking ? 'picking' : 'preview'}
      className="html-preview"
      title="Preview"
      sandbox={picking ? HTML_INSPECTION_SANDBOX : HTML_SANDBOX}
      srcDoc={highlightHtml(text, highlights, picking, model)}
      onLoad={loaded}
    />
  );
}
