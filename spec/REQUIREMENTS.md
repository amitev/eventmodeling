# Event Modeling Board — Requirements

A browser-based board for event modeling, built with React and React Flow (`reactflow`).
This document records the business requirements agreed so far. It describes behaviour, not implementation.

## 1. Board and timeline

- **R1.1** The board is a single page showing an event-modeling canvas. Time flows left to right.
- **R1.2** The canvas supports pan and zoom, a minimap, zoom controls and a dotted background grid.
- **R1.3** Items snap to a 20px grid.
- **R1.4** The board starts with a sample flow ("Add Item" and "View Cart") so there is something to look at.
- **R1.5** A **Reset** button restores the sample flow.
- **R1.6** The board is saved automatically in the browser and restored on reload. This covers lanes, slices, elements and connections.

### Timeline width

- **R1.7** The timeline has one width shared by all lanes.
- **R1.8** The timeline is exactly as wide as its slices: it starts at the left edge of the lanes and ends where the last slice ends. It can be neither longer nor shorter, so it cannot be resized on its own. There is no timeline resize handle.
- **R1.9** The timeline therefore grows and shrinks automatically when a slice is added, resized or deleted. With no slices it is as wide as the label zone plus one default slice (220px).

## 2. Lanes

- **R2.1** Elements sit in horizontal swimlanes stacked top to bottom.
- **R2.2** The default lanes are: **UI / Actors**, **Commands / Read Models** and **Events**.
- **R2.3** The user can add a lane with **+ Lane**. It is appended at the bottom with the name "New Lane" and the current timeline width.
- **R2.4** Each lane has a reserved label zone, a 180px strip at its left edge, that holds the lane name and the **×** button. Slices can never enter this zone (see R5.7).
- **R2.4a** The user can rename a lane by double-clicking its label.
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
- **R5.2** The user adds a slice with **+ Slice**. It is appended after the last slice, with the name "New Slice".
- **R5.3** The user renames a slice by double-clicking its header.
- **R5.4** Selected slices can be deleted with Backspace or Delete.
- **R5.5** A slice's height always covers all current lanes, including after lanes are added or removed.
- **R5.6** Only the slice header captures the mouse, so elements underneath stay usable.
- **R5.7** Slices are laid out automatically as one contiguous run. The first slice starts at the beginning of the slice area, right after the lane label zone (R2.4), and each following slice starts exactly where the previous one ends. There are no gaps and slices never overlap.
- **R5.8** The order of slices is fixed. Slices cannot be dragged, and have no left resize handle. New slices are always appended at the end.
- **R5.9** The user resizes a slice by dragging its right edge, with a minimum width of 120px. There are no resize buttons.
- **R5.10** Resizing a slice moves all following slices with it, so they stay attached. The preceding slices do not move.
- **R5.11** Deleting a slice closes the gap: the following slices move left, and the next slice becomes first if the first was deleted.
- **R5.12** Saved boards and imported files are laid out the same way on load: slices are ordered by their stored `x`, packed together, and their elements move with them and are settled inside a single slice (R5.13).

### Elements and slices

- **R5.13** An element never crosses two slices. It sits entirely inside one slice, or entirely outside every slice. An element belongs to the slice that contains its centre.
- **R5.14** When an element is added, dropped or dragged so that it overlaps a slice, it is moved fully inside the slice it overlaps most, keeping at least 20px of space from the slice borders. Elements clear of every slice stay where they are.
- **R5.15** Elements move with their slice. When a slice is resized, the following slices shift and take their elements with them, keeping each element's position relative to its slice. Elements of the resized slice itself stay put.
- **R5.16** A slice cannot be made narrower than its elements plus a 20px margin between the elements and the slice borders (left and right).
- **R5.17** If an element is wider than its slice (for example a Screen that widens to show an HTML mockup), it is moved inside, and the slice grows to fit it, including the 20px margin, when it would not fit otherwise.
- **R5.18** Deleting a slice always deletes the elements inside it and the connections attached to them, and closes the gap. If the slice holds elements, the user is asked to confirm first.

## 6. Export

- **R6.1** An **Export JSON** button downloads `event-model.json`.
- **R6.2** The file contains:
  - `exportedAt`: an ISO timestamp.
  - `lanes`: lane names, top to bottom.
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
  - a `timelineWidth` field from older exports is ignored, because the width is derived from the slices (R1.8).

## Out of scope for now

- Icons for element types other than Processor.
