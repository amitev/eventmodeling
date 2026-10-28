import { OBJECT } from './fields.js';

// Example data of a scenario entry (R3.16): an object with a value per field of the element,
// keyed by field name. A value is text (every type but boolean), true/false, an object (an
// `object` field) or a list of these (a list field). An element without fields has free
// entries: name to text.

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// One (non-list) value of field `f`; `v` is kept when it has the right shape, else it is empty.
function fitItem(f, v) {
  if (f.type === OBJECT) return fitExample(f.fields ?? [], v);
  if (f.type === 'boolean') return v === true;
  return typeof v === 'string' ? v : '';
}

// `value` shaped like `fields`: stale keys are dropped, missing values are empty.
export function fitExample(fields, value) {
  return Object.fromEntries(
    fields.map((f) => {
      const v = isObj(value) ? value[f.name] : undefined;
      return [f.name, f.list ? (Array.isArray(v) ? v : []).map((item) => fitItem(f, item)) : fitItem(f, v)];
    })
  );
}

export const newItem = (f) => fitItem(f, undefined);

const hasContent = (v) =>
  v === true ||
  (typeof v === 'string' && v !== '') ||
  (Array.isArray(v) && v.some(hasContent)) ||
  (isObj(v) && Object.values(v).some(hasContent));

// The lines that show example data compactly: { depth, text }. Empty values (empty text,
// false, empty lists and objects) are left out.
export function exampleLines(value, depth = 0, out = []) {
  for (const [name, v] of Object.entries(value)) {
    if (!hasContent(v)) continue;
    if (Array.isArray(v) && v.every((x) => !isObj(x))) {
      out.push({ depth, text: `${name}: ${v.filter(hasContent).join(', ')}` });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (!hasContent(item)) return;
        out.push({ depth, text: `${name} #${i + 1}` });
        exampleLines(item, depth + 1, out);
      });
    } else if (isObj(v)) {
      out.push({ depth, text: `${name}:` });
      exampleLines(v, depth + 1, out);
    } else out.push({ depth, text: `${name}: ${v}` });
  }
  return out;
}

// Free entries (an element without fields): editing rows { key, name, text } <-> example data.
let rowKey = 0;
export const newRow = (name = '', text = '') => ({ key: ++rowKey, name, text });
export const rowsOf = (example) =>
  Object.entries(isObj(example) ? example : {}).map(([name, v]) =>
    newRow(name, typeof v === 'string' ? v : JSON.stringify(v))
  );

// The example data of rows: { value } or { error }. Rows with no name and no text are skipped.
export function valueOfRows(rows) {
  const value = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) {
      if (r.text !== '') return { error: 'every entry with a value needs a name' };
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(value, name)) return { error: `the name "${name}" is used twice` };
    value[name] = r.text;
  }
  return { value };
}

// Like valueOfRows but never fails (later rows win), for showing the rows on a card.
export const previewOfRows = (rows) =>
  Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.text]));

// Whether `v` is valid example data in a file: text, true/false, a list of these, or an object of them.
export const isExampleValue = (v) =>
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (Array.isArray(v) && v.every(isExampleValue)) ||
  (isObj(v) && Object.values(v).every(isExampleValue));
