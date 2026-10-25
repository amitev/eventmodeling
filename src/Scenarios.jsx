import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';

const Icon = ({ children }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    {children}
  </svg>
);

// A scenario: { id, title, description, given: [entry], when: entry | null, then: [entry],
// error: text | null }. An entry is { element: id of an Event/Command, example: [{ name, example }] }.
export const entriesOf = (s) => [...s.given, ...(s.when ? [s.when] : []), ...s.then];

// Scenarios that use an element which is gone or no longer in the Scenarios element's Chapter
// are deleted. Returns { nodes, removed: [titles] }, or null when nothing changes.
export function pruneScenarios(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const removed = [];
  const next = nodes.map((n) => {
    if (n.type !== 'sticky' || n.data.kind !== 'scenarios') return n;
    const kept = n.data.scenarios.filter((s) => {
      const ok = entriesOf(s).every((e) => byId.get(e.element)?.parentId === n.parentId);
      if (!ok) removed.push(s.title || 'Untitled');
      return ok;
    });
    return kept.length === n.data.scenarios.length ? n : { ...n, data: { ...n.data, scenarios: kept } };
  });
  return removed.length ? { nodes: next, removed } : null;
}

const BLANK_EXAMPLE = [{ name: '', example: '' }];
const EXAMPLE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { name: { type: 'string' }, example: { type: 'string' } },
    required: ['name', 'example'],
    additionalProperties: false,
  },
};

// Reads the text of the example editor: { value } or { error }.
function parseExample(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { error: err.message };
  }
  if (!Array.isArray(value)) return { error: 'must be a list' };
  const ok = value.every(
    (f) =>
      f !== null &&
      typeof f === 'object' &&
      !Array.isArray(f) &&
      Object.keys(f).sort().join() === 'example,name' &&
      typeof f.name === 'string' &&
      typeof f.example === 'string'
  );
  return ok ? { value } : { error: 'every item needs a text "name" and a text "example"' };
}

// The Scenarios card of a Scenarios element: its list of scenarios.
export function ScenariosCard({ id, data, selected, onEdit, newId }) {
  const { setNodes } = useReactFlow();
  const scenarios = data.scenarios;
  const [drag, setDrag] = useState(null); // { from, over }: indexes while a scenario is dragged

  const save = (list) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, scenarios: list } } : n)));
  const move = (from, to) => {
    if (from === to) return;
    const list = [...scenarios];
    list.splice(to, 0, ...list.splice(from, 1));
    save(list);
  };
  const copy = (i) => {
    const list = [...scenarios];
    list.splice(i + 1, 0, { ...structuredClone(scenarios[i]), id: newId() });
    save(list);
  };
  const remove = (i) => {
    if (window.confirm(`Delete the scenario "${scenarios[i].title || 'Untitled'}"?`)) {
      save(scenarios.filter((_, j) => j !== i));
    }
  };
  const stop = (e) => e.stopPropagation();

  return (
    <div className={`sticky scenarios ${selected ? 'selected' : ''}`}>
      <div className="scenarios-head">
        <span>Scenarios</span>
      </div>
      <div className="scenarios-list nowheel">
        {!scenarios.length && <div className="scenarios-empty">No scenarios yet</div>}
        {scenarios.map((s, i) => (
          <div
            key={s.id}
            className={`scenario-item nodrag${s.error !== null ? ' failed' : ''}${
              drag && drag.over === i && drag.from !== i ? (drag.from < i ? ' over-after' : ' over-before') : ''
            }`}
            title="Double-click to edit, drag to reorder"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', s.id);
              setDrag({ from: i, over: i });
            }}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.stopPropagation();
              setDrag({ ...drag, over: i });
            }}
            onDrop={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.stopPropagation();
              move(drag.from, i);
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            onDoubleClick={(e) => {
              stop(e);
              onEdit(id, s.id);
            }}
          >
            <span className={`scenario-text${s.title ? '' : ' empty'}`}>{s.title || 'Untitled'}</span>
            <button className="scenario-icon" title="Copy" aria-label="Copy" onDoubleClick={stop} onClick={() => copy(i)}>
              <Icon>
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1H3.5A1.5 1.5 0 0 0 2 2.5v6A1.5 1.5 0 0 0 3.5 10H5" />
              </Icon>
            </button>
            <button className="scenario-icon" title="Delete" aria-label="Delete" onDoubleClick={stop} onClick={() => remove(i)}>
              <Icon>
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </Icon>
            </button>
          </div>
        ))}
      </div>
      <div className="scenarios-foot">
        <button
          className="scenario-btn nodrag"
          title="Add a scenario (A)"
          onDoubleClick={stop}
          onClick={() => onEdit(id, null)}
        >
          + Add
        </button>
        <button className="scenario-btn nodrag">
          <Icon>
            <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1H13v11H4.5A1.5 1.5 0 0 0 3 13.5v-11ZM3 13.5A1.5 1.5 0 0 0 4.5 15H13v-3" />
          </Icon>
          + Storyline
        </button>
        <span className="scenario-count">{scenarios.length}</span>
      </div>
    </div>
  );
}

// The JSON editor of an entry's example data (josdejong/jsoneditor, code mode). Loaded on
// first use so the board itself starts without it.
function ExampleEditor({ text, onChange }) {
  const box = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    let editor;
    let gone = false;
    Promise.all([import('jsoneditor'), import('jsoneditor/dist/jsoneditor.css')]).then(([mod]) => {
      if (gone) return;
      const JSONEditor = mod.default ?? mod;
      editor = new JSONEditor(box.current, {
        mode: 'code',
        mainMenuBar: false,
        statusBar: false,
        schema: EXAMPLE_SCHEMA,
        onChangeText: (t) => latest.current(t),
      });
      editor.setText(text);
    });
    return () => {
      gone = true;
      editor?.destroy();
    };
    // The editor is created once per entry (the parent keys it); `text` only seeds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="example-editor" ref={box} />;
}

let keySeq = 0;
const newEntry = (element, example = BLANK_EXAMPLE) => ({
  key: ++keySeq,
  element,
  text: JSON.stringify(example, null, 2),
});

const SECTIONS = {
  given: { label: 'Given', key: 'G', kind: 'event', plural: 'Events' },
  when: { label: 'When', key: 'W', kind: 'command', plural: 'Commands' },
  then: { label: 'Then', key: 'T', kind: 'event', plural: 'Events' },
};

const isTyping = (t) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

// The popup to edit one scenario. Nothing is applied before Save. `candidates` are the Events and
// Commands of the Chapter: { id, kind, title, where }.
export function ScenarioDialog({ scenario, candidates, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    title: scenario?.title ?? '',
    description: scenario?.description ?? '',
    given: (scenario?.given ?? []).map((e) => newEntry(e.element, e.example)),
    when: scenario?.when ? newEntry(scenario.when.element, scenario.when.example) : null,
    then: (scenario?.then ?? []).map((e) => newEntry(e.element, e.example)),
    error: scenario?.error ?? null,
  }));
  const [selected, setSelected] = useState(null); // key of the entry whose example data is shown
  const [picker, setPicker] = useState(null); // section whose list of elements is open
  const [problem, setProblem] = useState('');
  const [focusError, setFocusError] = useState(false);
  const errorInput = useRef(null);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const entries = [...draft.given, ...(draft.when ? [draft.when] : []), ...draft.then];
  const current = entries.find((e) => e.key === selected);

  const open = (section) => {
    if (section === 'then' && draft.error !== null) return;
    setPicker((p) => (p === section ? null : section));
  };
  const pick = (section, candidate) => {
    const entry = newEntry(candidate.id);
    setPicker(null);
    setSelected(entry.key);
    setProblem('');
    set(section === 'when' ? { when: entry } : { [section]: [...draft[section], entry] });
  };
  const removeEntry = (section, key) => {
    if (selected === key) setSelected(null);
    set(section === 'when' ? { when: null } : { [section]: draft[section].filter((e) => e.key !== key) });
  };
  const setText = (key, text) =>
    setDraft((d) => {
      const edit = (e) => (e.key === key ? { ...e, text } : e);
      return { ...d, given: d.given.map(edit), when: d.when && edit(d.when), then: d.then.map(edit) };
    });
  const openError = () => {
    if (draft.then.length) return;
    setPicker(null);
    if (draft.error === null) set({ error: '' });
    setFocusError(true);
  };

  useEffect(() => {
    if (!focusError) return;
    errorInput.current?.focus();
    setFocusError(false);
  }, [focusError]);

  // Hotkeys (assigned on every render; the listener stays registered).
  const keys = useRef(null);
  keys.current = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (picker) setPicker(null);
      else onClose();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    const section = { g: 'given', w: 'when', t: 'then' }[k];
    if (section) {
      e.preventDefault();
      open(section);
    } else if (k === 'e') {
      e.preventDefault();
      openError();
    }
  };
  useEffect(() => {
    const onKey = (e) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!picker) return;
    const close = (e) => {
      if (!e.target.closest?.('.gwt-chip-wrap')) setPicker(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [picker]);

  const nameOf = (e) => byId.get(e.element)?.title || 'Untitled';

  const save = () => {
    for (const e of entries) {
      const r = parseExample(e.text);
      if (r.error) {
        setSelected(e.key);
        setProblem(`The example data of "${nameOf(e)}" is not valid: ${r.error}`);
        return;
      }
    }
    const out = (e) => ({ element: e.element, example: parseExample(e.text).value });
    onSave({
      id: scenario?.id ?? null,
      title: draft.title.trim(),
      description: draft.description,
      given: draft.given.map(out),
      when: draft.when ? out(draft.when) : null,
      then: draft.then.map(out),
      error: draft.error,
    });
  };

  const chip = (section) => {
    const { label, key, kind, plural } = SECTIONS[section];
    const list = section === 'when' ? [] : draft[section];
    const used = new Set(list.map((e) => e.element));
    const options = candidates.filter((c) => c.kind === kind && !used.has(c.id));
    const has = section === 'when' ? !!draft.when : list.length > 0;
    return (
      <span className="gwt-chip-wrap">
        <button
          className="gwt-chip"
          title={`Choose ${label === 'Given' || label === 'Then' ? 'an event' : 'the command'} (${key})`}
          disabled={section === 'then' && draft.error !== null}
          onClick={() => open(section)}
        >
          {label} ({key})
        </button>
        {has && (
          <button
            className="gwt-more"
            disabled={section === 'then' && draft.error !== null}
            aria-label={`Choose ${label} element`}
            onClick={() => open(section)}
          >
            ▾
          </button>
        )}
        {picker === section && (
          <div className="gwt-menu" role="menu">
            {options.length ? (
              options.map((c) => (
                <button key={c.id} role="menuitem" className={`gwt-option ${c.kind}`} onClick={() => pick(section, c)}>
                  <span className="gwt-dot" />
                  <span className={c.title ? '' : 'empty'}>{c.title || 'Untitled'}</span>
                  <small>{c.where}</small>
                </button>
              ))
            ) : (
              <div className="gwt-none">No more {plural} in this Chapter</div>
            )}
          </div>
        )}
      </span>
    );
  };

  const card = (section, e) => {
    const c = byId.get(e.element);
    if (!c) return null;
    const r = parseExample(e.text);
    return (
      <div
        key={e.key}
        className={`gwt-card ${c.kind}${selected === e.key ? ' selected' : ''}`}
        onClick={() => {
          setSelected(e.key);
          setProblem('');
        }}
      >
        <div className="gwt-card-head">
          <span className="gwt-card-title">{nameOf(e)}</span>
          <button
            aria-label="Remove"
            title="Remove"
            onClick={(ev) => {
              ev.stopPropagation();
              removeEntry(section, e.key);
            }}
          >
            ×
          </button>
        </div>
        <div className="gwt-card-body">
          {r.error ? (
            <em>Invalid example data</em>
          ) : (
            r.value
              .filter((f) => f.example !== '')
              .map((f, i) => (
                <div key={i}>
                  {f.name}: {f.example}
                </div>
              ))
          )}
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="info-backdrop">
      <div className="scenario-dialog" role="dialog" aria-modal="true" aria-label="Scenario">
        <button className="scenario-close" title="Close without saving (Esc)" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="scenario-form">
          <label className="scenario-field">
            Title
            <input
              autoFocus
              spellCheck={false}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <label className="scenario-field">
            Description
            <textarea
              rows={3}
              placeholder="Scenario description"
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
          <div className="gwt-section">
            {chip('given')}
            {draft.given.map((e) => card('given', e))}
          </div>
          <div className="gwt-section">
            {chip('when')}
            {draft.when && card('when', draft.when)}
          </div>
          <div className="gwt-section">
            <div className="gwt-chips">
              {chip('then')}
              <button
                className="gwt-chip gwt-error-chip"
                title="Expect an error instead of events (E)"
                disabled={draft.then.length > 0}
                onClick={openError}
              >
                Then Error (E)
              </button>
            </div>
            {draft.then.map((e) => card('then', e))}
            {draft.error !== null && (
              <div className="gwt-error">
                <div className="gwt-error-label">
                  In case you expect an error
                  <button aria-label="Remove the error" title="Remove" onClick={() => set({ error: null })}>
                    ×
                  </button>
                </div>
                <input
                  ref={errorInput}
                  value={draft.error}
                  onChange={(e) => set({ error: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="scenario-actions">
            {problem && <span className="scenario-problem">{problem}</span>}
            <button className="scenario-save" onClick={save}>
              Save
            </button>
          </div>
        </div>
        <div className="scenario-example">
          {current ? (
            <>
              <div className={`scenario-example-head ${byId.get(current.element)?.kind}`}>
                <div className="scenario-example-title">{nameOf(current)}</div>
                <div className="scenario-example-sub">Example data</div>
              </div>
              <ExampleEditor key={current.key} text={current.text} onChange={(t) => setText(current.key, t)} />
            </>
          ) : (
            <div className="scenario-example-none">Select an Event or Command to edit its example data.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
