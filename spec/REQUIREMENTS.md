# Event Modeling Board — Requirements

A browser-based board for event modeling, built with React and React Flow (`reactflow`).
This document records the business requirements agreed so far. It describes behaviour, not implementation.

## 1. Board and timeline

- **R1.1** The board is a single page showing an event-modeling canvas. Time flows left to right.
- **R1.2** The canvas supports pan and zoom, a minimap, zoom controls and a dotted background grid.
- **R1.3** Items snap to a 20px grid.
- **R1.4** The board starts with a sample flow ("Add Item" and "View Cart") so there is something to look at.
- **R1.5** A **Reset** button restores the sample flow.
- **R1.6** The board is saved automatically in the browser and restored on reload. This covers lanes, slices, elements, connections and the timeline width.

### Timeline width

- **R1.7** The timeline has one width shared by all lanes.
- **R1.8** The user resizes the timeline by dragging a handle at the right end of a lane. There are no resize buttons.
- **R1.9** The timeline has a minimum width of 800px and can never be narrower than the slices it contains.
- **R1.10** The timeline grows automatically when a slice is added, moved or resized past its end.

## 2. Lanes

- **R2.1** Elements sit in horizontal swimlanes stacked top to bottom.
- **R2.2** The default lanes are: **UI / Actors**, **Commands / Read Models** and **Events**.
- **R2.3** The user can add a lane with **+ Lane**. It is appended at the bottom with the name "New Lane" and the current timeline width.
- **R2.4** The user can rename a lane by double-clicking its label.
- **R2.5** The user can remove a lane with its **×** button.
  - Lanes below it move up to close the gap.
  - Notes in the removed lane are deleted, together with the connections attached to them.
  - If the lane contains notes, the user is asked to confirm first.
  - The last remaining lane cannot be removed.
- **R2.6** Lanes have alternating shading, re-applied after any add or remove.
- **R2.7** Lanes cannot be dragged, selected or deleted with the keyboard.

## 3. Elements

An element is a sticky note placed on the board. Each has a type, a text and a position.

- **R3.1** Element types and default placement:

  | Type | Colour | Default lane |
  |------|--------|--------------|
  | Screen | light grey | first |
  | Command | blue | second |
  | Read Model | green | second |
  | Event | orange | third |
  | Processor | lavender, shown with a ⚙️ gear emoji | second |

- **R3.2** Default lane means the lane a new element is placed in. If that lane doesn't exist, the last lane is used. Elements can be dragged anywhere.
- **R3.3** The user adds an element by clicking its toolbar button, or by dragging the button onto the board to choose the position.
- **R3.4** Double-clicking an element edits its text. Enter saves, Shift+Enter inserts a newline, Esc and clicking away also save.
- **R3.5** Selected elements can be deleted with Backspace or Delete.
- **R3.6** Only Processor carries an icon; other types show their text label.

### Screen elements

- **R3.7** A Screen element can hold an HTML mockup, edited through a `</>` button on the element.
- **R3.8** When a Screen has HTML, the element widens and shows the HTML in an iframe preview.
- **R3.9** The preview is sandboxed with no permissions: scripts and form submissions do not run.
- **R3.10** The preview does not capture the mouse, so the element can still be dragged, selected and connected.

## 4. Connections

- **R4.1** Elements are connected with arrows (directed, with an arrowhead).
- **R4.2** Connection points are at the **top** (incoming) and **bottom** (outgoing) of each element, not left and right.
- **R4.3** The user creates a connection by dragging from one element's bottom point to another's top point.
- **R4.4** Selected connections can be deleted with Backspace or Delete.

## 5. Slices

A slice is a vertical band across all lanes that groups the elements of one piece of behaviour.

- **R5.1** Each slice has a name and a width, and sits on the timeline above the lanes.
- **R5.2** The user adds a slice with **+ Slice**. It is placed directly after the last slice, with the name "New Slice".
- **R5.3** The user renames a slice by double-clicking its header.
- **R5.4** Selected slices can be deleted with Backspace or Delete.
- **R5.5** A slice's height always covers all current lanes, including after lanes are added or removed.
- **R5.6** Only the slice header captures the mouse, so elements underneath stay usable.
- **R5.7** A slice moves along the timeline only, by dragging its header.
- **R5.8** The user resizes a slice by dragging its left or right edge, with a minimum width of 120px. There are no resize buttons.

### Non-overlap

- **R5.9** Slices never overlap. A slice cannot start before the start of the timeline.
- **R5.10** Moving a slice stops at its neighbours.
- **R5.11** Resizing a slice pushes its neighbours: the right edge pushes slices to the right, the left edge pushes slices to the left.
  - Pushed slices return to their original positions if the drag is reversed before release.
  - A left-edge drag cannot go past the start of the timeline.
- **R5.12** Slices on saved boards or imported files that overlap are pushed apart on load.

### Known limitation

- **R5.13** Elements do not move with their slice. If a slice is moved or pushed, its elements stay where they were and may end up under a different slice or none.

## 6. Export

- **R6.1** An **Export JSON** button downloads `event-model.json`.
- **R6.2** The file contains:
  - `exportedAt`: an ISO timestamp.
  - `lanes`: lane names, top to bottom.
  - `timelineWidth`: the shared timeline width.
  - `slices`: each with `id`, `name`, `x`, `width` and `elements`.
  - `unassignedElements`: elements outside every slice.
  - `connections`: each with `id`, `source` and `target` (element ids).
- **R6.3** Each element has `id`, `type`, `text`, `lane` (the lane name), `position` and, for Screens with a mockup, `html`.
- **R6.4** An element belongs to the slice whose horizontal span contains the element's centre. Slices and their elements are listed left to right.
- **R6.5** Connections are listed once at the top level, because they can cross slices.

## 7. Import

- **R7.1** An **Import JSON** button loads a file in the export format and rebuilds the whole board from it. It replaces the current board; it does not merge.
- **R7.2** The user must confirm before the current board is replaced.
- **R7.3** Export followed by import reproduces the same board. `exportedAt` is ignored.
- **R7.4** A file is rejected with an error message, and the board is left untouched, when:
  - the `slices` array is missing;
  - an element has an unknown type;
  - two elements share an id.
- **R7.5** Connections that refer to elements not in the file are dropped.
- **R7.6** Older files stay valid:
  - a missing `lanes` list falls back to the three default lanes;
  - a missing `timelineWidth` falls back to the default width.

## Out of scope for now

- Moving elements together with their slice (see R5.13).
- Icons for element types other than Processor.
