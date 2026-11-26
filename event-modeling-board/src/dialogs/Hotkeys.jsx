import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose, useModalFocus } from './popup.js';

// Keys that add an element of that type to the selected Cell (R5a.11).
export const CELL_ADD_KEYS = { s: 'screen', c: 'command', r: 'read_model', q: 'read_model', e: 'event', p: 'processor', n: 'notes' };
// S adds a Scenarios element instead of a Screen in a Spec lane, which takes no Screen.
export const kindOfKey = (key, laneType) => (key === 's' && laneType === 'spec' ? 'scenarios' : CELL_ADD_KEYS[key]);
export const hotkeyOf = (kind) =>
  (kind === 'scenarios' ? ['s'] : Object.keys(CELL_ADD_KEYS).filter((k) => CELL_ADD_KEYS[k] === kind))
    .map((k) => k.toUpperCase())
    .join(' / ');

// The hotkey help, grouped by context (R1d.1).
const HOTKEYS = [
  {
    group: 'Board',
    keys: [
      ['← ↑ → ↓', 'Pan the view when nothing is selected (100 board pixels, minimum 100 screen pixels)'],
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
      ['Backspace / Delete', 'Delete the selected elements or arrows'],
      ['Ctrl+F', 'Search elements by name'],
      ['Ctrl+H', 'High level view (Esc leaves it)'],
      ['Shift+A', 'Run Agent Task for the selected element, empty Cell, slice header or Chapter'],
      ['Shift+T', 'Toggle Agent Tasks history'],
      ['Shift+C', 'Open Agent cockpit'],
      ['Shift+F', 'Fit view: show the whole board'],
      ['Esc', 'In app full screen: close popups first, otherwise exit (requires keyboard permission)'],
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
      ['Shift+I', 'Open the slice info'],
      ['Shift+E', 'Mark / unmark the slice as the end of a flow'],
      ['S', 'Add a Screen in the Cell (a Scenarios element in a Spec lane)'],
      ['C', 'Add a Command in the Cell'],
      ['R / Q', 'Add a Read Model in the Cell'],
      ['E', 'Add an Event in the Cell'],
      ['P', 'Add a Processor in the Cell'],
      ['N', 'Add a Notes element in the Cell'],
      ['Ctrl+V', 'Paste a linked copy of the remembered element in the Cell'],
      ['+', 'Add a slice right after the Cell’s slice'],
      ['Enter', 'Edit the name of the first element in the Cell, or open the editor of a selected Notes element'],
      ['Delete / Backspace', 'Delete the selected elements, or the elements in the Cell (asks first)'],
      ['Shift+Delete / Shift+Backspace', 'Delete the slice (asks first)'],
      ['Esc', 'Clear the Cell selection'],
    ],
  },
  {
    group: 'Cell context menu',
    keys: [
      ['Up / Down', 'Focus the previous / next enabled menu item'],
      ['Home / End', 'Focus the first / last enabled menu item'],
      ['Enter / Space', 'Run the focused menu action'],
      ['Esc / Tab', 'Close the menu without an action'],
    ],
  },
  {
    group: 'Selected element',
    keys: [
      ['I', 'Open element info; Screens open the Info tab (not for Notes, Scenarios or a linked copy)'],
      ['F', 'Open the fields of a Screen, Command, Event or Read Model (not a linked copy)'],
      ['E', 'Open Screen Content (linked copies: code is read-only)'],
      ['V', 'View the HTML mockup of a Screen, or of the original of a linked copy (see also Scenarios, Notes)'],
      ['G', 'Select the original of a linked copy and go to it'],
      ['Ctrl+C', 'Remember the element (not Scenarios or Notes) to paste a linked copy of it'],
    ],
  },
  {
    group: 'Selected Scenarios element',
    keys: [
      ['A', 'Add a scenario'],
      ['V', 'View the scenarios'],
      ['1 ... 9', 'Open the first ... ninth scenario'],
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
    group: 'Editing a name',
    keys: [
      ['Enter / Esc', 'Save'],
      ['Ctrl+Z', "The field's own undo"],
    ],
  },
  {
    group: 'Scenario editor',
    keys: [
      ['Ctrl+1 ... Ctrl+9 / Cmd+1 ... Cmd+9', 'Switch to the first ... ninth scenario; keeps drafts, also while typing'],
      ['G', 'Choose a Given event'],
      ['W', 'Choose the When command'],
      ['T', 'Choose a Then event'],
      ['E', 'Add or edit the expected error (Then Error)'],
      ['← / →', 'Select the previous / next card in Given or Then'],
      ['↑ / ↓', 'Select a card in the section above / below (Given, When, Then)'],
      ['Ctrl+S', 'Save all edited scenarios and close'],
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
    group: 'Screen editor',
    keys: [
      ['Ctrl+S', 'Save and close'],
      ['← / → / Home / End', 'Switch Content / Sketch / Info / Fields when a tab is focused'],
      ['Delete / Backspace', 'Delete all selected sketch shapes while the sketch canvas is focused'],
      ['Enter', 'Finish in-place sketch text editing'],
      ['Ctrl+Z / Cmd+Z', 'Undo sketch operation (last 5; Sketch tab only)'],
      ['Ctrl+Y / Ctrl+Shift+Z / Cmd+Y / Cmd+Shift+Z', 'Redo sketch operation (Sketch tab only)'],
      ['Alt+Enter', 'Full screen on / off'],
      ['Esc', 'Close without saving'],
    ],
  },
  {
    group: 'Scenarios view',
    keys: [['Esc', 'Close']],
  },
  {
    group: 'Movie strip',
    keys: [
      ['← / →', 'Previous / next screen'],
      ['Alt+Enter', 'Full screen on / off'],
      ['Esc', 'Close'],
    ],
  },
  {
    group: 'Tasks popup',
    keys: [
      ['Enter', 'Save the in-place task title, or add a line break in the description'],
      ['Esc', 'Cancel the in-place edit, otherwise close and discard the unsaved form'],
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
