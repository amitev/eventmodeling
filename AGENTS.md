# Event Modeling Board

A project for implementing an Event Modeling board.

## Technologies

Main technologies that are used:

- React
- React Flow

## Requirements specification

The Agent and LLM should NOT assume anything, bur rather ask for clarification and confirmation.

All (without any exception) the requirements and learnings during the implementation are documented in [Requirements](spec/REQUIREMENTS.md). The specification is updated with every change so that it stays relevant.
When writing the specification use the minimal wording needed that still retains the intent. Avoid long and overbloated sentences. Style:

- One fact per rule; state it once and point to other rules by number (e.g. R5.14) instead of restating them.
- Short words and active voice: "fix", not "implement a solution for". Drop filler (the, a, "so that", "also", "now and in future") when meaning survives.
- Compact lists and tables over prose. Fragments are fine.
- Keep exact values, names, keys and numbers verbatim. Never drop negations or limits (not, never, only, at most).
- Rule numbers are referenced from the source code: never renumber or remove one. A new rule gets a new number.
- Do not add background or rationale beyond what is needed to keep the intent, except short **Learning (implementation)** notes.

We're still in alpha version. Forget about backwards compatibility when making changes.

## Code layout

All in `src/`:

- `EventModelBoard.jsx`: the board (React Flow nodes, `Board()` with its operations and hotkeys).
- `model.js`: constants, element kinds and flow rules, layout/geometry rules, node factories. No UI.
- `io.js`: export (`serialize`), import (`parseBoard`) and localStorage loading.
- `history.js`: undo/redo (`useHistory`) and the gesture context.
- `InfoDialog.jsx`: the Markdown info editor. `HtmlDialog.jsx`: the Screen mockup popup.
- `Hotkeys.jsx`: the hotkey help dialog and the keys that add an element to a Cell.
- `popup.js`: `useBackdropClose` and `useModalFocus`, which every popup must use (R1.17).
- `fields.js`: fields of elements, copy and inheritance rules (R9). `FieldsDialog.jsx`: the fields popup.
- `Search.jsx`: the Ctrl+F search box (R1e).
- `Scenarios.jsx`: the Scenarios card, its popup and scenario pruning. `ExampleTree.jsx` and `examples.js`: the example data tree and its rules.

## Testing

## TODOs
TODO.txt is ignored.

Do NOT test by yourself. Always ask me whether I want you to test the changes for me.
