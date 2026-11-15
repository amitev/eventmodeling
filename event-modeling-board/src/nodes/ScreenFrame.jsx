import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fitMockup, HTML_INSPECTION_SANDBOX, MOVIE_HTML_SANDBOX, URL_SANDBOX, MOCKUP_W, MOCKUP_H } from '../model/mockup.js';

// Self-contained: movie frames run this function inside their opaque-origin sandbox.
function observeContent(doc, report) {
  const view = doc.defaultView;
  const range = doc.createRange();
  let pending = 0;
  let stopped = false;
  let previous;
  let observed = new Set();
  const transparent = (color) => color === 'transparent' || /,\s*0(?:\.0+)?\)$/.test(color);
  const measure = () => {
    pending = 0;
    const watch = new Set();
    let bounds = null;
    const add = (rect, clip) => {
      const left = Math.max(rect.left, clip.left);
      const top = Math.max(rect.top, clip.top);
      const right = Math.min(rect.right, clip.right);
      const bottom = Math.min(rect.bottom, clip.bottom);
      if (right <= left || bottom <= top) return;
      bounds = bounds ? {
        left: Math.min(bounds.left, left), top: Math.min(bounds.top, top),
        right: Math.max(bounds.right, right), bottom: Math.max(bounds.bottom, bottom),
      } : { left, top, right, bottom };
    };
    const visit = (element, clip) => {
      if (/^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT)$/i.test(element.tagName)) return;
      const style = view.getComputedStyle(element);
      if (style.display === 'none' || Number(style.opacity) === 0) return;
      const rect = element.getBoundingClientRect();
      const visible = style.visibility !== 'hidden' && style.visibility !== 'collapse';
      const canvas = rect.width >= view.innerWidth * 0.95 && rect.height >= view.innerHeight * 0.95;
      const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
        parseFloat(style[`border${side}Width`]) > 0 &&
        style[`border${side}Style`] !== 'none' && !transparent(style[`border${side}Color`]));
      const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const surface = style.backgroundImage !== 'none' || !transparent(style.backgroundColor);
      const replaced = /^(INPUT|SELECT|TEXTAREA|BUTTON|IMG|SVG|CANVAS|VIDEO|IFRAME|OBJECT|EMBED|HR)$/i.test(element.tagName);
      if (element !== doc.body && visible && (replaced || border || outlined || style.boxShadow !== 'none' || surface && !canvas)) {
        add(rect, clip);
        watch.add(element);
      }
      if (/^(SVG|TEXTAREA|SELECT)$/i.test(element.tagName)) return;
      const childClip = {
        left: style.overflowX === 'visible' ? clip.left : Math.max(clip.left, rect.left),
        right: style.overflowX === 'visible' ? clip.right : Math.min(clip.right, rect.right),
        top: style.overflowY === 'visible' ? clip.top : Math.max(clip.top, rect.top),
        bottom: style.overflowY === 'visible' ? clip.bottom : Math.min(clip.bottom, rect.bottom),
      };
      for (const child of element.childNodes) {
        if (child.nodeType === 1) visit(child, childClip);
        else if (visible && child.nodeType === 3 && child.textContent.trim()) {
          range.selectNodeContents(child);
          for (const textRect of range.getClientRects()) add(textRect, childClip);
          watch.add(element);
        }
      }
    };
    visit(doc.body, { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight });
    for (const element of observed) if (!watch.has(element)) resize.unobserve(element);
    for (const element of watch) if (!observed.has(element)) resize.observe(element);
    observed = watch;
    const result = bounds ? {
      x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top,
    } : null;
    const signature = JSON.stringify(result);
    if (signature !== previous) {
      previous = signature;
      report(result);
    }
  };
  const schedule = () => {
    if (!stopped && !pending) pending = view.requestAnimationFrame(measure);
  };
  const resize = new view.ResizeObserver(schedule);
  resize.observe(doc.documentElement);
  resize.observe(doc.body);
  const mutations = new view.MutationObserver(schedule);
  mutations.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  doc.addEventListener('load', schedule, true);
  doc.addEventListener('transitionend', schedule, true);
  doc.addEventListener('animationend', schedule, true);
  view.addEventListener('resize', schedule);
  doc.fonts?.ready.then(schedule);
  schedule();
  return () => {
    stopped = true;
    view.cancelAnimationFrame(pending);
    resize.disconnect();
    mutations.disconnect();
    doc.removeEventListener('load', schedule, true);
    doc.removeEventListener('transitionend', schedule, true);
    doc.removeEventListener('animationend', schedule, true);
    view.removeEventListener('resize', schedule);
  };
}

export function ScreenFrame({ html, url, title, width, height, className, scripted = false }) {
  const id = useId();
  const token = useMemo(() => `${id}-${Math.random()}`, [id, html, url, scripted]);
  const frame = useRef(null);
  const stop = useRef(null);
  const timer = useRef(null);
  const received = useRef(null);
  const [measurement, setMeasurement] = useState(null);
  const accept = (bounds, error = '') => {
    received.current = token;
    clearTimeout(timer.current);
    setMeasurement({ token, bounds, error });
  };
  useLayoutEffect(() => {
    const message = (event) => {
      const fit = event.data?.screenFit;
      if (event.source !== frame.current?.contentWindow || fit?.token !== token) return;
      const b = fit.bounds;
      if (b !== null && (!b || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(b[key])) || b.width <= 0 || b.height <= 0)) {
        accept(null, 'Invalid content size; showing the full page.');
      } else accept(b);
    };
    if (scripted && !url) window.addEventListener('message', message);
    return () => {
      window.removeEventListener('message', message);
      stop.current?.();
      stop.current = null;
      clearTimeout(timer.current);
    };
  }, [token, scripted, url]);
  const relay = scripted && !url
    ? `<script>(function(){function start(){var stop=(${observeContent.toString()})(document,function(bounds){parent.postMessage({screenFit:{token:${JSON.stringify(token)},bounds:bounds}},"*")});addEventListener("pagehide",stop,{once:true})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start()})()</script>`
    : '';
  const loaded = () => {
    stop.current?.();
    stop.current = null;
    clearTimeout(timer.current);
    if (url) return;
    if (scripted) {
      if (received.current !== token) {
        timer.current = setTimeout(() => accept(null, 'Content could not be measured; showing the full page.'), 2000);
      }
      return;
    }
    const doc = frame.current.contentDocument;
    if (!doc?.body) accept(null, 'Content cannot be measured after navigation; showing the full page.');
    else stop.current = observeContent(doc, (bounds) => accept(bounds));
  };
  const current = measurement?.token === token ? measurement : null;
  const fit = fitMockup(url ? null : current?.bounds, width, height);
  return (
    <>
      <iframe
        ref={frame}
        key={url ?? 'code'}
        className={className}
        title={title}
        sandbox={url ? URL_SANDBOX : scripted ? MOVIE_HTML_SANDBOX : HTML_INSPECTION_SANDBOX}
        scrolling="no"
        {...(url ? { src: url } : { srcDoc: html + relay })}
        onLoad={loaded}
        style={{ width: MOCKUP_W, height: MOCKUP_H, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}
      />
      {current?.error && <div className="screen-fit-error" role="status">{current.error}</div>}
    </>
  );
}
