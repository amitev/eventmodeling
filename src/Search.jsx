import { useEffect, useMemo, useRef, useState } from 'react';
import { KINDS } from './model.js';

// The search box (R1e): a floating box over the board. `items` are { id, kind, title, copy }.
// `focusTick` changes when Ctrl+F is pressed again, to focus the input.
export function SearchBox({ items, focusTick, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const activeRow = useRef(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusTick]);

  // Nothing is listed until something is typed; then every match.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.title.toLowerCase().includes(q)) : [];
  }, [items, query]);
  const current = Math.min(active, results.length - 1);

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [current, results]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter' && results[current]) {
      e.preventDefault();
      onPick(results[current].id);
    }
  };

  return (
    <div className="search-box" role="search">
      <div className="search-input-row">
        <input
          ref={input}
          value={query}
          placeholder="Search elements by title"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="search-close" title="Close (Esc)" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {query.trim() && (
        <div className="search-results" role="listbox">
          {results.length ? (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={i === current}
                ref={i === current ? activeRow : null}
                className={`search-result${i === current ? ' active' : ''}${r.copy ? ' copy' : ''}`}
                style={{ background: KINDS[r.kind].color }}
                onMouseMove={() => setActive(i)}
                onClick={() => onPick(r.id)}
              >
                {r.title}
              </button>
            ))
          ) : (
            <div className="search-none">No element found</div>
          )}
        </div>
      )}
    </div>
  );
}
