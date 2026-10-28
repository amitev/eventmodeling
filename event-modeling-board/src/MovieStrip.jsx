import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose, useModalFocus } from './popup.js';
import { HTML_SANDBOX, URL_SANDBOX, MOCKUP_W, MOCKUP_H } from './mockup.js';

const ZOOMS = [0.3, 0.4, 0.5, 0.65, 0.8, 1]; // size of the current screen, 1 = fits the window
const START_ZOOM = 4;
const NEIGHBOUR = 0.5; // the other screens are this much of the current one's size
const CAPTION_H = 36;
const GAP = 48;
const MARGIN = 40; // free space above and below the current screen at zoom 1

function Icon({ children }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// One screen of the strip: its mockup scaled to `width`, the name below. Only the screens near
// the current one load their mockup.
function Card({ screen, width, state, live, onClick }) {
  const height = (width * MOCKUP_H) / MOCKUP_W;
  const hasMockup = !!(screen.html || screen.url);
  return (
    <div
      className={`movie-card${state === 0 ? ' current' : ''}`}
      style={{ width, opacity: state === 0 ? 1 : Math.abs(state) === 1 ? 0.6 : 0.3 }}
      title={screen.name || undefined}
      onClick={state === 0 ? undefined : onClick}
    >
      <div className="movie-shot" style={{ height }}>
        {hasMockup ? (
          live && (
            <iframe
              key={screen.url ?? 'code'}
              className="movie-frame"
              title={screen.name || 'Screen mockup'}
              sandbox={screen.url ? URL_SANDBOX : HTML_SANDBOX}
              scrolling="no"
              {...(screen.url ? { src: screen.url } : { srcDoc: screen.html })}
              style={{ width: MOCKUP_W, height: MOCKUP_H, transform: `scale(${width / MOCKUP_W})` }}
            />
          )
        ) : (
          <span className="movie-none" style={{ fontSize: Math.max(8, width / 28) }}>
            No preview yet
          </span>
        )}
      </div>
      <div className="movie-caption" style={{ height: CAPTION_H, fontSize: state === 0 ? 16 : 11 }}>
        {screen.name}
      </div>
    </div>
  );
}

// The movie strip of a Chapter (R11): its Screens one after the other, the current one big in the
// middle. `screens` is a list of { id, name, html, url } in reading order.
export function MovieStrip({ screens, onClose }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(START_ZOOM);
  const [maximized, setMaximized] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stage = useRef(null);
  const backdrop = useBackdropClose(onClose);
  const modal = useModalFocus();

  useLayoutEffect(() => {
    const el = stage.current;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const last = screens.length - 1;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(last, i + 1));
      else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'Enter') setMaximized((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, last]);

  const fit = Math.max(120, Math.min(size.w * 0.7, ((size.h - CAPTION_H - 2 * MARGIN) * MOCKUP_W) / MOCKUP_H));
  const currentW = fit * ZOOMS[zoom];
  const widthOf = (i) => (i === index ? currentW : currentW * NEIGHBOUR);
  let before = 0;
  for (let i = 0; i < index; i++) before += widthOf(i) + GAP;

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div ref={modal} tabIndex={-1} className={`movie-dialog${maximized ? ' maximized' : ''}`} role="dialog" aria-modal="true" aria-label="Screens">
        <div className="movie-head">
          <div className="movie-title">Screens</div>
          <div className="movie-count">
            Screen {index + 1} of {screens.length}
          </div>
          <div className="movie-buttons">
            <button title="Smaller" aria-label="Smaller" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
              <Icon>
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="M6 8.5h5M12.5 12.5L17 17" />
              </Icon>
            </button>
            <button title="Larger" aria-label="Larger" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
              <Icon>
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="M6 8.5h5M8.5 6v5M12.5 12.5L17 17" />
              </Icon>
            </button>
            <button title="Fit to the window" aria-label="Fit to the window" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(ZOOMS.length - 1)}>
              <Icon>
                <rect x="2.5" y="5" width="15" height="10" rx="2" />
                <circle cx="6" cy="10" r="1" fill="currentColor" />
              </Icon>
            </button>
            <button
              title={maximized ? 'Restore the size (Alt+Enter)' : 'Full screen (Alt+Enter)'}
              aria-label={maximized ? 'Restore the size' : 'Full screen'}
              aria-pressed={maximized}
              onClick={() => setMaximized((v) => !v)}
            >
              <Icon>
                {maximized ? (
                  <path d="M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17" />
                ) : (
                  <path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5" />
                )}
              </Icon>
            </button>
          </div>
        </div>
        <div ref={stage} className="movie-stage">
          <div className="movie-track" style={{ gap: GAP, transform: `translateX(${-(before + currentW / 2)}px)` }}>
            {screens.map((s, i) => (
              <Card key={s.id} screen={s} width={widthOf(i)} state={i - index} live={Math.abs(i - index) <= 1} onClick={() => setIndex(i)} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
