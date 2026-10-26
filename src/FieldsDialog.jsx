import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose } from './popup.js';
import { FIELD_FLAGS, FIELD_TYPES, OBJECT, cloneFields, newField } from './fields.js';

// The draft carries editing-only keys: `_k` (React key), `_new` and `_propagate` (a top-level
// field created in this popup and whether to copy it down the chain).
const keyed = (fields, counter) =>
  fields.map((f) => ({
    ...f,
    _k: ++counter.current,
    ...(f.fields ? { fields: keyed(f.fields, counter) } : {}),
  }));

const clean = (fields) =>
  fields.map(({ _k, _new, _propagate, fields: sub, ...f }) => ({
    ...f,
    name: f.name.trim(),
    ...(sub ? { fields: clean(sub) } : {}),
  }));

// The first problem of a field list (empty or repeated name), or null.
function problem(fields) {
  const names = new Set();
  for (const f of fields) {
    const name = f.name.trim();
    if (!name) return 'Every field needs a name.';
    if (names.has(name)) return `The field name "${name}" is used twice in one list.`;
    names.add(name);
    const inner = f.fields && problem(f.fields);
    if (inner) return inner;
  }
  return null;
}

// Edits a copy of the draft: fn gets the list that holds the field at `path`.
const listAt = (root, path) => path.reduce((list, i) => list[i].fields, root);

function FieldRows({ fields, path, edit, counter }) {
  const add = () =>
    edit((root) => {
      listAt(root, path).push({ ...newField(), _k: ++counter.current, _new: path.length === 0, _propagate: true });
    });
  return (
    <>
      {fields.map((f, i) => {
        const here = [...path, i];
        const set = (patch) => edit((root) => Object.assign(listAt(root, path)[i], patch));
        return (
          <div key={f._k} className="field-item">
            <div className="field-row">
              <input
                className="f-name"
                value={f.name}
                placeholder="Name"
                autoFocus={!f.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              <select
                className="f-type"
                value={f.type}
                onChange={(e) =>
                  edit((root) => {
                    const target = listAt(root, path)[i];
                    target.type = e.target.value;
                    if (target.type === OBJECT) target.fields ??= [];
                    else delete target.fields;
                  })
                }
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="f-flag" title="A list of values">
                <input type="checkbox" aria-label="List" checked={f.list} onChange={(e) => set({ list: e.target.checked })} />
              </label>
              {FIELD_FLAGS.map(({ key, hint }) => (
                <label key={key} className="f-flag" title={hint}>
                  <input type="checkbox" aria-label={key} checked={f[key]} onChange={(e) => set({ [key]: e.target.checked })} />
                </label>
              ))}
              <label
                className="f-prop"
                title="Also copy this new field to all following elements in the chain"
                style={{ visibility: f._new ? 'visible' : 'hidden' }}
              >
                <input
                  type="checkbox"
                  aria-label="Propagate"
                  checked={!!f._propagate}
                  onChange={(e) => set({ _propagate: e.target.checked })}
                />
              </label>
              <button
                type="button"
                className="f-rm"
                title="Remove the field"
                aria-label="Remove the field"
                onClick={() => edit((root) => listAt(root, path).splice(i, 1))}
              >
                ×
              </button>
            </div>
            {f.type === OBJECT && (
              <div className="field-children">
                <FieldRows fields={f.fields ?? []} path={here} edit={edit} counter={counter} />
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="f-add" onClick={add}>
        + Field
      </button>
    </>
  );
}

// The fields popup of an element (R9.3). `parent` is the list of fields to take over with "Get
// from parent". onSave gets the fields and those created here to copy down the chain.
export function FieldsDialog({ title, initial, parent, onSave, onClose }) {
  const counter = useRef(0);
  const [fields, setFields] = useState(() => keyed(cloneFields(initial), counter));
  const [error, setError] = useState(null);
  const backdrop = useBackdropClose(onClose);

  const saveRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const edit = (fn) => {
    setError(null);
    setFields((cur) => {
      const next = structuredClone(cur);
      fn(next);
      return next;
    });
  };

  const getFromParent = () =>
    edit((root) => {
      for (const p of keyed(cloneFields(parent), counter)) {
        const i = root.findIndex((f) => f.name.trim() === p.name);
        if (i === -1) root.push(p);
        else root[i] = p;
      }
    });

  const save = () => {
    const found = problem(fields);
    if (found) return setError(found);
    onSave(
      clean(fields),
      clean(fields.filter((f) => f._new && f._propagate))
    );
  };
  saveRef.current = save;

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div className="fields-dialog" role="dialog" aria-modal="true" aria-label="Fields">
        <div className="info-title">
          {title}
          <button
            type="button"
            className="fields-parent"
            disabled={!parent.length}
            title={parent.length ? 'Copy all fields of the parent elements, replacing fields of the same name' : 'No parent element has fields'}
            onClick={getFromParent}
          >
            Get from parent
          </button>
        </div>
        <div className="fields-body">
          <div className="field-row field-head">
            <span className="f-name">Name</span>
            <span className="f-type">Type</span>
            <span className="f-flag" title="A list of values">List</span>
            {FIELD_FLAGS.map(({ key, label, hint }) => (
              <span key={key} className="f-flag" title={hint}>
                {label}
              </span>
            ))}
            <span className="f-prop" title="Also copy a new field to all following elements in the chain">
              Propagate
            </span>
            <span className="f-rm" />
          </div>
          <FieldRows fields={fields} path={[]} edit={edit} counter={counter} />
        </div>
        {error && <div className="fields-error">{error}</div>}
        <div className="info-actions">
          <button type="button" className="primary" onClick={save}>
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
