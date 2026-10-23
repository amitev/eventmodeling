# Event Modeling Board — Testing

**Status: proposal.** This document records suggested tests for the project. Nothing in it is implemented yet, and it is meant to be revised before work starts. The requirement IDs (R5.11 and so on) refer to [REQUIREMENTS.md](REQUIREMENTS.md).

## Approach

Tests are split into three layers, from cheapest to most expensive. Each test should be named after the requirement it checks (for example `R5.11 resizing a slice shifts the later slices`), so the specification and the tests stay linked. Tests check behaviour described in the specification, not the implementation.

| Layer | Tool | Covers | Cost |
|-------|------|--------|------|
| 1. Unit | Vitest | Pure logic: layout, import/export, history | Low |
| 2. Component | Vitest + React Testing Library + jsdom | UI wiring | Medium |
| 3. End-to-end | Playwright | Real browser behaviour | High |

Suggested order: layer 1 first, then layer 3 if a browser can be driven on the development machine, layer 2 last and kept small.

### Prerequisite

The pure logic currently lives inside `src/EventModelBoard.jsx`. For layer 1 it has to be moved into its own module (or modules) that tests can import. This is a small part of the larger file split that was deferred; only the logic needed by the tests would be moved.

## 1. Unit tests for pure logic

The logic is deterministic: nodes and edges in, nodes and edges out. It carries most of the risk, so this layer gets the most tests.

### Slice layout (R5.7 to R5.12)
- Slices form one gapless run, starting right after the lane label zone.
- Resizing a slice shifts the following slices, and their elements with them.
- A slice cannot be made narrower than its elements plus the 20px margin.
- The Chapter's width equals the end of its last slice.
- A Chapter with no slices is as wide as the label zone plus one default slice.
- Inserting a slice after a given slice (R5.2a) puts it directly after that slice and shifts the later ones, in the first, middle and last position.
- Repeated inserts keep the run contiguous.
- Slices are ordered by their stored position when a board is loaded.

### Elements in slices (R5.13 to R5.18)
- An element never straddles two slices: one that overlaps a slice is moved fully inside the slice it overlaps most.
- The 20px margin to the slice borders holds.
- An element wider than its slice (a Screen with a mockup) grows the slice.
- An element clear of every slice is left where it is.
- Deleting a slice also deletes its elements and the connections attached to them.

### Lanes (R2.x, R3.6a)
- Elements are vertically centred in the lane that holds their centre.
- An element taller than its lane is aligned to the lane's top edge.
- Removing a lane shifts the lanes below it up and re-applies the alternating shading.
- Removing a lane removes the elements in it and their connections.
- The last lane of a Chapter cannot be removed.

### Multiple Chapters (R1a.x)
- Every layout rule above applies per Chapter and never leaks into another Chapter. For example, resizing a slice in Chapter A does not move anything in Chapter B.
- A new Chapter starts with the three default lanes and one default slice.
- An element dragged so that its centre is over another Chapter is adopted by it, and its coordinates are converted so it stays where it was released.
- An element released outside every Chapter keeps its own Chapter.
- Connection validity: Chapter to Chapter and element to element are allowed; Chapter to element, element to Chapter and a Chapter to itself are refused.
- Removing a Chapter removes its lanes, slices, elements and every connection attached to them.

### Export and import (R6, R7)
- Export followed by import reproduces the same board (R7.3).
- Elements are assigned to the slice of their own Chapter that contains their centre (R6.4).
- A title is exported only when it is not empty (R6.3).
- Older formats are read (R7.6): the single-Chapter file with top-level `lanes` and `slices`, a missing `lanes` list, a missing Chapter position, a `timelineWidth` field, and elements without a `title`.
- Invalid files are rejected and leave the board untouched (R7.4): a missing or empty `chapters` array, a Chapter without `slices`, an unknown element type, and duplicate ids.
- Connections that refer to elements or Chapters missing from the file are dropped (R7.5).
- Element connections and Chapter connections are restored as the right kind.

### Undo and redo (R8)
- A continuous gesture (dragging, resizing) is one step (R8.4).
- An operation and the automatic adjustments it triggers are one step (R8.5).
- A new change after an undo clears the redo steps (R8.7).
- History keeps at most 100 steps (R8.8).
- Selecting items, panning and zooming are not recorded (R8.6).
- Undo and redo restore nodes and connections exactly.

## 2. Component tests

React Testing Library with jsdom. These check the UI wiring, not positions: jsdom has no real layout, so React Flow needs its sizing mocked. This layer should stay small.

- `+ Chapter` adds a Chapter that has the default lanes and a slice.
- `+ Slice`, `+ Lane` and the element buttons act on the active Chapter, and the header shows its name.
- The slice **+** button adds a slice after its own slice.
- Double-clicking an element header edits its title; double-clicking its body edits its text.
- A new element has an empty title and shows the "Title" placeholder.
- A lane name is edited in place; an empty name is ignored.
- Undo and Redo buttons are disabled when there is nothing to undo or redo.
- Import asks for confirmation, and shows an error for a bad file.
- Removing a slice, a lane or a Chapter that has content asks for confirmation.

## 3. End-to-end tests

Playwright in a real browser. This is the only layer that can check what the screen actually does.

- Moving a Chapter by its handle, by a lane header and by a slice header; the view stays still while it moves (R1.10, R1.10a).
- A click or double-click on a header does not move the Chapter.
- Resizing a slice with its right-edge handle, including the pushing of later slices and elements.
- Dragging an element from the header onto a Chapter; moving an element to another Chapter.
- Connecting two Chapters from the right port to the left port, and the refused mixed connections.
- The vertical lane title and in-place renaming.
- Reload keeps the board (R1.6).
- A few screenshots of the Chapter outline, element headers and slice headers, to catch visual regressions (R2.6a, R3.6b).

**Open question:** headless Chrome and Edge would not open a debugging port on the development machine. Playwright installs its own browser and may work; this has not been tried. If it does not, this layer stays manual and should be listed as untested.

## Not planned

- Testing React Flow itself (panning, zooming, the minimap).
- Exact pixel or colour checks, apart from a few screenshots.
- Tests that copy the implementation instead of checking behaviour from the specification.

## Open points for revision

- Whether to add all three layers, or start with layer 1 only.
- Where test files live (next to the code, or in a `tests/` folder).
- How the pure logic is split out of `EventModelBoard.jsx`, and how much of the deferred file split to do with it.
- Whether screenshot comparison is worth maintaining.
- Whether tests run in CI, and which checks gate a change.
