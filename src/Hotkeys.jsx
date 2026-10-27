import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose, useModalFocus } from './popup.js';

// Keys that add an element of that type to the selected Cell (R5a.11).
export const CELL_ADD_KEYS = { s: 'screen', c: 'command', r: 'query', q: 'query', e: 'event', p: 'processor', x: 'scenarios', n: 'notes' };
export const hotkeyOf = (kind) =>
  Object.keys(CELL_ADD_KEYS)
    .filter((k) => CELL_ADD_KEYS[k] === kind)
    .map((k) => k.toUpperCase())
    .join(' / ');

// The hotkey help, grouped by context (R1d.1).
const HOTKEYS = [
  {
    group: 'Board',
    keys: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
      ['Backspace / Delete', 'Delete the selected elements or arrows'],
      ['Ctrl+F', 'Search elements by title'],
    ],
  },
  {
    group: 'Search box',
    keys: [
      ['↑ / ↓', 'Move through the results'],
      ['Enter', 'Focus the highlighted element'],
      ['Esc', 'Close the search'],
    ],
  },
  {
    group: 'Selected Cell',
    keys: [
      ['← ↑ → ↓', 'Select the neighbouring Cell'],
      ['Shift+← / Shift+→', 'Make the slice narrower / wider'],
      ['Ctrl+← / Ctrl+→', 'Move the slice left / right'],
      ['Shift+C', 'Compact the slice'],
      ['Shift+I', 'Open the slice info'],
      ['S', 'Add a Screen in the Cell'],
      ['C', 'Add a Command in the Cell'],
      ['R / Q', 'Add a Query in the Cell'],
      ['E', 'Add an Event in the Cell'],
      ['P', 'Add a Processor in the Cell'],
      ['X', 'Add a Scenarios element in the Cell'],
      ['N', 'Add a Notes element in the Cell'],
      ['Ctrl+V', 'Paste a linked copy of the remembered element in the Cell'],
      ['+', 'Add a slice right after the Cell’s slice'],
      ['Enter', 'Edit the title of the first element in the Cell, or open the editor of a selected Notes element'],
      ['Delete / Backspace', 'Delete the selected elements, or the elements in the Cell (asks first)'],
      ['Shift+Delete / Shift+Backspace', 'Delete the slice (asks first)'],
      ['Esc', 'Clear the Cell selection'],
    ],
  },
  {
    group: 'Selected element',
    keys: [
      ['I', 'Open the info of the element (not for Notes, Scenarios or a linked copy)'],
      ['F', 'Open the fields of a Screen, Command, Event or Query (not a linked copy)'],
      ['Ctrl+C', 'Remember the element (not Scenarios or Notes) to paste a linked copy of it'],
    ],
  },
  {
    group: 'Selected Scenarios element',
    keys: [
      ['A', 'Add a scenario'],
      ['Ctrl+1 ... Ctrl+9', 'Open the first ... ninth scenario'],
    ],
  },
  {
    group: 'Selected Notes element',
    keys: [
      ['E', 'Edit the notes'],
      ['V / R', 'View the notes (read mode)'],
    ],
  },
  {
    group: 'Editing a name or title',
    keys: [
      ['Enter / Esc', 'Save'],
      ['Ctrl+Z', "The field's own undo"],
    ],
  },
  {
    group: 'Scenario editor',
    keys: [
      ['G', 'Choose a Given event'],
      ['W', 'Choose the When command'],
      ['T', 'Choose a Then event'],
      ['E', 'Add or edit the expected error (Then Error)'],
      ['Ctrl+S', 'Save and close'],
      ['Esc', 'Close the list, or close without saving'],
    ],
  },
  {
    group: 'Info panel',
    keys: [
      ['Ctrl+S', 'Save and close'],
      ['Ctrl+B', 'Bold (Markdown editor)'],
      ['Ctrl+I', 'Italic (Markdown editor)'],
      ['Ctrl+L', 'Link (Markdown editor)'],
      ['Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)', 'Undo / redo in the Markdown editor'],
      ['Esc', 'Cancel'],
    ],
  },
  {
    group: 'Fields popup',
    keys: [
      ['Ctrl+S', 'Save and close'],
      ['Esc', 'Close without saving'],
    ],
  },
];

export function HotkeysDialog({ onClose }) {
  const backdrop = useBackdropClose(onClose);
  const modal = useModalFocus();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="info-backdrop" {...backdrop}>
      <div
        ref={modal}
        tabIndex={-1}
        className="hotkeys-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Hotkeys"
      >
        <div className="info-title">Hotkeys</div>
        <div className="hotkeys-body">
          {HOTKEYS.map(({ group, keys }) => (
            <section key={group}>
              <h3>{group}</h3>
              <dl>
                {keys.map(([key, what]) => (
                  <div key={key + what}>
                    <dt>
                      <kbd>{key}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="info-actions">
          <button onClick={onClose} title="Close (Esc)">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
