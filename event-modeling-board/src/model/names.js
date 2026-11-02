// Chapter, slice and Context names become file and folder names on the server (SERVER.md S3.3),
// so they must be valid on every OS (R1.18).
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
const DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export const stripIllegalChars = (text) => text.replace(ILLEGAL, '');

// For a trimmed name without illegal characters: refuses a trailing dot and Windows device names.
export const isFileSafeName = (name) => !name.endsWith('.') && !DEVICE.test(name);

// A name that can be stored: not empty, no illegal character, file safe.
export const cleanName = (text) => {
  const name = stripIllegalChars(text).trim();
  return name && isFileSafeName(name) ? name : '';
};

// onChange of a name input: drops illegal characters as they are typed or pasted, keeping the caret.
export function filterNameInput(input) {
  const { value } = input;
  const clean = stripIllegalChars(value);
  if (clean === value) return;
  const caret = stripIllegalChars(value.slice(0, input.selectionStart)).length;
  input.value = clean;
  input.setSelectionRange(caret, caret);
}
