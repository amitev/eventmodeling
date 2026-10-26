import { OBJECT } from './fields.js';
import { newItem, newRow } from './examples.js';

// The tree that fills the example data of a scenario entry (R3.16). Its names and types come
// from the element's fields; the user only fills the values (and adds or removes list items).

function Scalar({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  return (
    <input
      className="ex-input"
      value={value}
      placeholder={field.type}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// One value of a field that is not a list (or one item of a list).
function Item({ field, value, onChange }) {
  return field.type === OBJECT ? (
    <ObjectValues fields={field.fields ?? []} value={value} onChange={onChange} />
  ) : (
    <Scalar field={field} value={value} onChange={onChange} />
  );
}

function ObjectValues({ fields, value, onChange }) {
  return fields.map((f) => {
    const v = value[f.name];
    const set = (next) => onChange({ ...value, [f.name]: next });
    return (
      <div key={f.name} className="ex-field">
        <div className="ex-name" title={f.name}>
          {f.name}
        </div>
        <div className={`ex-value${f.type === OBJECT && !f.list ? ' ex-nested' : ''}`}>
          {f.list ? (
            <>
              {v.map((item, i) => (
                <div key={i} className="ex-item">
                  <div className={f.type === OBJECT ? 'ex-nested' : 'ex-scalar'}>
                    <Item field={f} value={item} onChange={(next) => set(v.map((x, j) => (j === i ? next : x)))} />
                  </div>
                  <button
                    type="button"
                    className="ex-rm"
                    title="Remove the item"
                    aria-label="Remove the item"
                    onClick={() => set(v.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="ex-add" onClick={() => set([...v, newItem(f)])}>
                + Item
              </button>
            </>
          ) : (
            <Item field={f} value={v} onChange={set} />
          )}
        </div>
      </div>
    );
  });
}

// `value` is example data shaped like `fields` (see fitExample).
export function ExampleTree({ fields, value, onChange }) {
  return (
    <div className="example-tree">
      <ObjectValues fields={fields} value={value} onChange={onChange} />
    </div>
  );
}

// Free entries (name and text) of an element without fields.
export function FreeEntries({ rows, onChange }) {
  const set = (key, patch) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="example-tree">
      <div className="ex-hint">The element has no fields: add entries freely.</div>
      {rows.map((r) => (
        <div key={r.key} className="ex-field">
          <input
            className="ex-name-input"
            value={r.name}
            placeholder="Name"
            spellCheck={false}
            onChange={(e) => set(r.key, { name: e.target.value })}
          />
          <div className="ex-value ex-item">
            <input
              className="ex-input"
              value={r.text}
              placeholder="Value"
              spellCheck={false}
              onChange={(e) => set(r.key, { text: e.target.value })}
            />
            <button
              type="button"
              className="ex-rm"
              title="Remove the entry"
              aria-label="Remove the entry"
              onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="ex-add" onClick={() => onChange([...rows, newRow()])}>
        + Entry
      </button>
    </div>
  );
}
