# Event Modeling Board

A project for implementing an Event Modeling board.

## Technologies

Main technologies that are used:

- React
- React Flow

## Requirements specification

The Agent and LLM should NOT assume anything, bur rather ask for clarification and confirmation.

All (without any exception) the requirements and learnings during the implementation are documented in `spec/`. The specification is updated with every change so that it stays relevant.

- [Board requirements](spec/MODELING_BOARD.md): contains only requirements related to the board (`event-modeling-board/`).
- [Server requirements](spec/SERVER.md): contains only requirements related to the HTTP server and CLI (`server/`).

When writing the specification use the minimal wording needed that still retains the intent. Avoid long and overbloated sentences. Style:

- One fact per rule; state it once and point to other rules by number (e.g. R5.14) instead of restating them.
- Short words and active voice: "fix", not "implement a solution for". Drop filler (the, a, "so that", "also", "now and in future") when meaning survives.
- Compact lists and tables over prose. Fragments are fine.
- Keep exact values, names, keys and numbers verbatim. Never drop negations or limits (not, never, only, at most).
- Rule numbers are referenced from the source code: never renumber or remove one. A new rule gets a new number.
- Do not add background or rationale beyond what is needed to keep the intent, except short **Learning (implementation)** notes.

We're still in alpha version. Forget about backwards compatibility when making changes.

## Code layout

- `event-modeling-board/`: the board (Vite + React app). `index.html`, `vite.config.js` and `src/`. Builds into `server/public/`.
- `server/`: the HTTP server hosting the built board. `index.js`: CLI (`npx event-modeling-cli`). `app.js`: `createServer()`. `api.js`: the `/api` routes. `model-store.js`: `ModelStore`, `contexts.yaml`, `chapter.yaml` and the Slice files in `.event-modeling/`.

Board code, all in `event-modeling-board/src/`:

- `EventModelBoard.jsx`: the board (React Flow nodes, `Board()` with its operations and hotkeys).
- `model.js`: constants, element kinds and flow rules, layout/geometry rules, node factories. No UI.
- `io.js`: export (`serialize`), import (`parseBoard`) and localStorage loading.
- `history.js`: undo/redo (`useHistory`) and the gesture context.
- `InfoDialog.jsx`: the Markdown info editor. `HtmlDialog.jsx`: the Screen mockup popup. `mockup.js`: URL check and sandbox settings of a Screen mockup.
- `Hotkeys.jsx`: the hotkey help dialog and the keys that add an element to a Cell.
- `popup.js`: `useBackdropClose` and `useModalFocus`, which every popup must use (R1.17).
- `fields.js`: fields of elements, copy and inheritance rules (R9). `FieldsDialog.jsx`: the fields popup.
- `Search.jsx`: the Ctrl+F search box (R1e).
- `Scenarios.jsx`: the Scenarios card, its popup and scenario pruning. `ExampleTree.jsx` and `examples.js`: the example data tree and its rules.
- `sync.js`: push and pull of Chapters to and from the server (R10).

## Testing

## TODOs

TODO.txt is ignored.

Do NOT test by yourself. Always ask me whether I want you to test the changes for me.
