# Event Modeling Board

A project for implementing an Event Modeling board.

## Technologies

Main technologies that are used:

- React
- React Flow

## Requirements specification

The Agent and LLM should NOT assume anything, bur rather ask for clarification and confirmation.

The Agent and LLM must NOT edit files in `.event-modeling/model/` manually. Use the SKILLs and the server API.

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

## Skills

Skills are in `.claude/skills/`. Read `spec/*` only to write or update a skill; never refer to it from a skill: no file names (`spec/...`) and no rule numbers (R9.4, S4.19, ...). State the rule itself in the skill instead.

When a skill refers to another skill, use its name in backticks (e.g. `element-fields`), not the path of its `SKILL.md`.
IMPORTANT: Keep skills concise and LLM-token efficient while retaining their full intent.

## Code layout

- `event-modeling-board/`: the board (Vite + React app). `index.html`, `vite.config.js` and `src/`. Builds into `server/public/`.
- `server/`: the HTTP server hosting the built board. `index.js`: CLI (`npx em-cli`). `app.js`: `createServer()`. `api.js`: the `/api` routes, the revision headers and the event stream. `model-store.js`: `ModelStore`, `contexts.yaml` and the Context files (Chapters and slices inline) in `.event-modeling/`, the revision and `edit()`/`read()`. `model-edit.js`: the editing API (S4): the operations and `ROUTES`. `model-rules.js`: the board's rules for the server (lane types, flows, `validateModel()`, `canonical()`). `http-error.js`: `HttpError`. `html-compact.js`: `compactHtml()`, which shrinks Screen HTML on push (S3.10).

Board code, all in `event-modeling-board/src/`:

- `EventModelBoard.jsx`: the board (`Board()` with its operations and hotkeys). `main.jsx`: entry. `styles.css`: all styles. `Search.jsx`: the Ctrl+F search box (R1e).
- `model/`: pure rules and data. No UI.
  - `model.js`: constants, element kinds and flow rules, layout/geometry rules, node factories.
  - `cells.js`: rules about Cells and connections (`spotInCell`, `autoConnections`, `orient`, `selectOnly`, `confirmCopies`, …).
  - `fields.js`: fields of elements, copy and inheritance rules (R9).
  - `examples.js`: the rules of the example data tree.
  - `names.js`: file-safe names (R1.19): filter for name inputs and the name check.
  - `mockup.js`: URL check, sandbox settings and size of a Screen mockup. `beautify.js`: `beautifyHtml()`, the layout of the HTML in the mockup popup (R3.7).
- `state/`: the board's plumbing.
  - `io.js`: board file writing (`serialize`) and reading (`parseBoard`), and localStorage loading.
  - `sync.js`: push and pull of Chapters to and from the server (R10).
  - `history.js`: undo/redo (`useHistory`) and the gesture context.
  - `BoardActions.js`: the `BoardActions` context through which the nodes call the board.
- `nodes/`: the React Flow node components. `LaneNode.jsx`, `StickyNode.jsx`, `SliceNode.jsx`, `ChapterNode.jsx`; `index.js`: `nodeTypes`; `parts.jsx`: drag hooks and buttons they share; `Notes.jsx`: the Notes card.
- `dialogs/`: the popups.
  - `InfoDialog.jsx`: the Markdown info editor.
  - `HtmlDialog.jsx`: the Screen mockup popup.
  - `MovieStrip.jsx`: the movie strip popup (R11).
  - `FieldsDialog.jsx`: the fields popup.
  - `Hotkeys.jsx`: the hotkey help dialog and the keys that add an element to a Cell.
  - `popup.js`: `useBackdropClose` and `useModalFocus`, which every popup must use (R1.17).
- `scenarios/`: `Scenarios.jsx`: the Scenarios card, its popup and scenario pruning. `ExampleTree.jsx`: the example data tree editor.

## Testing

## TODOs

TODO.txt is ignored.

Do NOT test by yourself. Always ask me whether I want you to test the changes for me.
