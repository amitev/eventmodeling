# Event Modeling Board

A project for implementing an Event Modeling board.

## Technologies

Main technologies that are used:

- React
- React Flow

## Agent rules

The Agent and LLM should NOT assume anything, bur rather ask for clarification and confirmation.

All (without any exception) the requirements and learnings during the implementation are documented in [Requirements](spec/REQUIREMENTS.md). The specification is updated with every change so that it stays relevant.
When writing the specification use the minimal wording needed that still retains the intent. Avoid long and оverbloated sentences.

We're still in alpha version. Forget about backwards compatibility when making changes.

## Code layout

All in `src/`:

- `EventModelBoard.jsx`: the board (React Flow nodes, `Board()` with its operations and hotkeys).
- `model.js`: constants, element kinds and flow rules, layout/geometry rules, node factories. No UI.
- `io.js`: export (`serialize`), import (`parseBoard`) and localStorage loading.
- `history.js`: undo/redo (`useHistory`) and the gesture context.
- `InfoDialog.jsx`: the Markdown info editor.
- `Scenarios.jsx`: the Scenarios card, its popup, the example data editor and scenario pruning.

## Testing

Do NOT test by yourself. Always ask me whether I want you to test the changes for me.
