# Event Modeling Board — Requirements

A browser-based board for event modeling, built with React and React Flow (`reactflow`).
This document records the business requirements agreed so far. It describes behaviour, not implementation.

## 1. Board and Chapter

- **R1.1** The board is a single page showing an event-modeling canvas. Time flows left to right. The board holds one or more Chapters (section 1a).
- **R1.1a** The term **Chapter** denotes one modelled area: its lanes, its slices and the elements in them. (It was previously called the timeline; "Chapter" is the term to use from now on.)
- **R1.2** The canvas supports pan and zoom, a minimap, zoom controls and a dotted background grid.
- **R1.3** Items snap to a 20px grid.
- **R1.4** The board starts with one Chapter holding a sample flow ("Add Item" and "View Cart") so there is something to look at.
- **R1.5** A **Reset** button restores the sample flow.
- **R1.6** The board is saved automatically in the browser and restored on reload. This covers Chapters, lanes, slices, elements and all connections.

### Chapter width

- **R1.7** The Chapter has one width shared by all lanes.
- **R1.8** The Chapter is exactly as wide as its slices: it starts at the left edge of the lanes and ends where the last slice ends. It can be neither longer nor shorter, so it cannot be resized on its own. There is no Chapter resize handle.
- **R1.9** The Chapter therefore grows and shrinks automatically when a slice is added, resized or deleted. With no slices it is as wide as the label zone plus one default slice (220px).

### Moving the Chapter

- **R1.10** The Chapter can be moved on the canvas, in three ways: by dragging the **Chapter** handle above the slices, by dragging any of its **lane headers** (the vertical label column), or by dragging any of its **slice headers**. Whichever is used, the lanes, slices and elements move together as one unit, the Chapter snaps to the 20px grid, and the Chapter becomes the active one (R1a.4). A header that is only clicked or double-clicked (to rename it) does not move the Chapter, and neither does the lane **×** button or a name that is being edited.
- **R1.10a** Moving a Chapter never moves the view: the canvas stays where it is while a Chapter is dragged, whichever way it is moved (R1.10), including when the Chapter is dragged towards the edge of the screen. The user pans the view separately, by dragging empty canvas.
- **R1.11** Moving the Chapter does not change anything inside it: the relative positions of lanes, slices and elements stay the same, and so do the connections.
- **R1.12** A Chapter's position is saved with the board and restored on reload. A Chapter cannot be deleted with the keyboard; it is removed with its own button (R1a.6).
- **R1.13** Elements and slices keep their positions relative to the Chapter, so the layout rules in this document (slice layout, centring, margins) apply regardless of where the Chapter is on the canvas. An element dropped from the toolbar is placed where it is released, whatever the Chapter position.

## 1a. Multiple Chapters

- **R1a.1** The board can hold any number of Chapters. Each Chapter has its own lanes, slices and elements, and is laid out independently: resizing a slice or adding a lane in one Chapter never changes another Chapter. All rules in sections 2 to 5 apply per Chapter.
- **R1a.2** A **+ Chapter** button in the header adds a new Chapter. It starts with the three default lanes and one default slice, named "New Slice" and 220px wide (as if **+ Slice** had been used once), but no elements. Its width is therefore the label zone plus that slice. It appears in the middle of the part of the canvas that is currently visible (its lane area is centred on the centre of the viewport, snapped to the grid), so the user sees it straight away. The view does not pan or zoom. If it lands on top of another Chapter, the user can drag it away by its handle.
- **R1a.3** Each Chapter has a name, shown in its handle ("Chapter 1", "Chapter 2", ... by default). The user renames it by double-clicking the name. The first Chapter of the sample board is "Chapter 1".
- **R1a.4** **Active Chapter.** The header's add buttons (**+ Command**, **+ Slice**, **+ Lane**, and so on) act on the active Chapter. This is the Chapter the user last clicked or dragged something in; initially the first Chapter. The header shows its name next to "Add to:". An element dragged from the header onto the board joins the Chapter it is released over; if it is released over no Chapter, it joins the active Chapter.
- **R1a.5** An element can be moved to another Chapter by dragging it so that its centre is over that Chapter's lanes. It then becomes part of that Chapter, follows its layout rules (R3.6a, R5.13 to R5.17), and its position is converted so it stays where it was released. An element released outside every Chapter stays in its own Chapter. Connections of a moved element are kept.
- **R1a.6** A Chapter is removed with the **×** button in its handle. The button is hidden when only one Chapter is left, because the board always has at least one. Removing a Chapter also removes its lanes, slices, elements and every connection attached to them or to the Chapter. If it holds slices or elements, the user is asked to confirm first.

### Connecting Chapters

- **R1a.7** Chapters are connected with arrows to show how the model flows from one Chapter to the next. Each Chapter has an **outgoing** connection point on its **right** side and an **incoming** one on its **left** side, both at its vertical middle.
- **R1a.8** The user creates a Chapter connection by dragging from one Chapter's right point to another Chapter's left point.
- **R1a.9** Chapter connections look different from element connections: darker, thicker arrows with a larger arrowhead, and larger connection points.
- **R1a.10** Chapters connect only to Chapters, and elements only to elements. A connection between a Chapter and an element is refused, and so is a connection from a Chapter to itself.
- **R1a.11** Selected Chapter connections can be deleted with Backspace or Delete, like element connections (R4.4). Moving a Chapter keeps its connections attached and following it.

## 2. Lanes

- **R2.1** Elements sit in horizontal swimlanes stacked top to bottom.
- **R2.2** The default lanes are: **UI / Actors**, **Commands / Read Models** and **Events**.
- **R2.3** The user can add a lane with **+ Lane**. It is appended at the bottom of the active Chapter (R1a.4) with the name "New Lane" and the current Chapter width.
- **R2.4** Each lane has a reserved label zone, a narrow 48px strip at its left edge, that holds the lane name and the **×** button (the button at the top). The lane name is written vertically, reading from bottom to top; a name that does not fit is cut off with an ellipsis, and the full name shows when hovering over it. Slices can never enter this zone (see R5.7).
- **R2.4a** The user can rename a lane by double-clicking its name. The name is edited **in place**: the vertical title itself becomes editable text, keeping its orientation, with a caret and a highlighted outline, and all of it selected to start. Enter, Esc and clicking away save it. The name is a single line, and an empty name is ignored (the previous name is kept).
- **R2.5** The user can remove a lane with its **×** button.
  - Lanes below it move up to close the gap.
  - Notes in the removed lane are deleted, together with the connections attached to them.
  - If the lane contains notes, the user is asked to confirm first.
  - The last remaining lane of a Chapter cannot be removed.
- **R2.6** Lanes have alternating shading, re-applied after any add or remove.
- **R2.6a** Every Chapter has a clear, dark outline (2px) around its whole area, including the lane label column: the left and right edges on every lane, the top edge on the first lane and the bottom edge on the last lane. Lanes are separated by a thin light line. The label column is separated from the slice area by a line in the same dark colour. Adding or removing lanes keeps the outline correct.
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
- **R3.3** The user adds an element by clicking its toolbar button, or by dragging the button onto the board to choose the position (it joins the Chapter it is released over). A clicked button puts the element in the selected Cell if there is one (R5a.10); otherwise it joins the active Chapter (R1a.4), in the default lane of its type (R3.2).
- **R3.4** Double-clicking the body of an element edits its text. Enter saves, Shift+Enter inserts a newline, Esc and clicking away also save.
- **R3.4a** Double-clicking the header of an element edits its title (see R3.6b). Enter, Esc and clicking away save it. The title is a single line.
- **R3.5** Selected elements can be deleted with Backspace or Delete.
- **R3.6** Only Processor carries an icon (⚙️), shown at the start of its header; other types have no icon. The element type is shown by the header colour (R3.1), not by a label.
- **R3.6a** Elements are always vertically centred in the lane that holds them. This applies when an element is added, dropped or dragged (it snaps to the centre of the lane it was released in), when its size changes (for example while editing its text or showing a Screen mockup), and when a board is loaded or imported. An element taller than its lane is aligned to the lane's top edge.
- **R3.6b** Every element has a header bar and a body. The header holds the element's **title** and is filled with the type's colour from R3.1. The title is free text chosen by the user. It has **no default value**: a new element has an empty title, shown as a faint "Title" placeholder in the header (the placeholder is not saved or exported). A long title is cut off with an ellipsis. The body is white and holds the element's text, and for Screens the mockup and its editor. The Screen colour is a slightly darker grey (`#e2e2e2`) so its header stands out from the white body. Backgrounds are opaque.

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

- **R5.1** Each slice has a name and a width, and sits in the Chapter above the lanes.
- **R5.2** The user adds a slice with **+ Slice**. It is appended after the last slice of the active Chapter (R1a.4), with the name "New Slice".
- **R5.2a** Every slice has a **+** button at the very right end of its header. It adds a new slice immediately after that slice, named "New Slice" and 220px wide. The slices after it, together with their elements, move to the right to make room (R5.7, R5.15). The Chapter becomes the active one (R1a.4). The button does not start a drag of the Chapter and does not trigger renaming.
- **R5.3** The user renames a slice by double-clicking its header.
- **R5.4** Slices can be selected by pressing or clicking their header, and a selected slice is outlined. Selecting works in every state of the header: when it is the start of a drag that moves the Chapter (R1.10), and when its name is being edited (R5.3). A selected slice can be deleted with Backspace or Delete (see R5.11 and R5.18).
- **R5.5** A slice's height always covers all current lanes, including after lanes are added or removed.
- **R5.6** Only the slice header captures the mouse, so elements underneath stay usable.
- **R5.7** Slices are laid out automatically as one contiguous run. The first slice starts at the beginning of the slice area, right after the lane label zone (R2.4), and each following slice starts exactly where the previous one ends. There are no gaps and slices never overlap.
- **R5.8** The order of slices is fixed. Slices cannot be dragged to a different position within the Chapter, and have no left resize handle. Dragging a slice header moves the whole Chapter instead (R1.10). New slices are added at the end with **+ Slice**, or right after a given slice with the **+** button in its header (R5.2a).
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

## 5a. Cells

- **R5a.1** A **Cell** is the intersection of one lane and one slice of a Chapter: one box of the Chapter's grid, with the lanes as rows and the slices as columns. A Chapter with 3 lanes and 2 slices has 6 Cells. The lane label zone is not part of any Cell.
- **R5a.2** A Cell is not a separate object that is stored. It follows from the lanes and slices: adding, removing, renaming or resizing them adds, removes or resizes the Cells, and moving the Chapter moves its Cells. A Cell has no data of its own, so it is not exported or imported, and is not saved with the board.
- **R5a.3** A Cell has no colour of its own. It shows the shading of its lane (R2.6).
- **R5a.4** A Cell can hold any number of elements. They stay freely positioned, as before: an element sits in the Cell of its lane and slice (R5.13), can be dragged anywhere within it, and is vertically centred in the lane (R3.6a).
- **R5a.5** Clicking on a Cell selects it: a thin (2px), slightly transparent blue border is drawn around the whole Cell, above its elements. It is meant to be visible without being intrusive. Only one Cell is selected at a time, and clicking another Cell moves the selection. The Chapter of the Cell becomes the active Chapter (R1a.4).
- **R5a.6** Clicking on an element, a slice header, a lane header, a Chapter handle or a connection does not select a Cell; it selects that item, and clears any Cell selection. So does starting to drag an element, and undo or redo.
- **R5a.7** A click on the canvas outside every Cell (empty canvas, the lane label zone, or the area above the slices) clears the Cell selection.
- **R5a.8** The selected Cell's border follows the Cell: it stays on it when the view is panned or zoomed, when the Chapter is moved, and when its slice is resized or shifted. If the Cell's lane or slice is removed, the selection disappears.
- **R5a.9** Selecting a Cell is not an operation: it is not recorded for undo (R8.6), and there is nothing to delete, so Backspace and Delete do nothing to a selected Cell.
- **R5a.10** When a Cell is selected, clicking an element button in the header adds the new element **in that Cell**, whatever the element's default lane (R3.2): it goes in the Cell's lane and slice, vertically centred in the lane (R3.6a), at the first free spot from the left, inside the slice's margins (R5.14), where it does not overlap the elements already in the Cell. If the Cell has no room left, the element is placed after the last element and the Cell's slice grows to fit it; the slices after it, with their elements, move right (R5.15). The Cell stays selected, so several elements can be added in a row. Dragging a button onto the board is not affected: the element goes where it is released. With no Cell selected, or if its lane or slice no longer exists, the element is added as described in R3.3.

**Learning (implementation).** The lanes of a Chapter cover its whole Cell area, so a click on the empty part of a Cell is received by a lane, not by the canvas behind it. Cell selection therefore has to be handled for clicks on lanes as well as on the canvas, using the click position to find the Cell (R5a.5, R5a.7). The first version listened only to canvas clicks and nothing was ever selected.

## 6. Export

- **R6.1** An **Export JSON** button downloads `event-model.json`.
- **R6.2** The file contains:
  - `exportedAt`: an ISO timestamp.
  - `chapters`: the Chapters, ordered left to right. Each has `id`, `name`, `x` and `y` (its position on the canvas), `lanes` (lane names, top to bottom), `slices` and `unassignedElements`.
    - each slice has `id`, `name`, `x`, `width` and `elements`;
    - `unassignedElements` are the Chapter's elements that sit outside every slice.
  - `connections`: element connections, each with `id`, `source` and `target` (element ids).
  - `chapterConnections`: Chapter connections, each with `id`, `source` and `target` (Chapter ids, from the right side of the source to the left side of the target).
- **R6.3** Each element has `id`, `type`, `title` (omitted when empty), `text`, `lane` (the lane name), `position` (relative to its Chapter) and, for Screens with a mockup, `html`.
- **R6.4** An element belongs to the slice of its own Chapter whose horizontal span contains the element's centre. Slices and their elements are listed left to right.
- **R6.5** Connections are listed once at the top level, because they can cross slices and Chapters.

## 7. Import

- **R7.1** An **Import JSON** button loads a file in the export format and rebuilds the whole board from it, with all its Chapters and connections. It replaces the current board; it does not merge.
- **R7.2** The user must confirm before the current board is replaced.
- **R7.3** Export followed by import reproduces the same board. `exportedAt` is ignored.
- **R7.4** A file is rejected with an error message, and the board is left untouched, when:
  - the `chapters` array is missing or empty (see R7.6 for older files);
  - a Chapter has no `slices` array;
  - an element has an unknown type;
  - two Chapters, slices or elements share an id.
- **R7.5** Connections that refer to elements or Chapters not in the file are dropped. An element connection must join two elements, and a Chapter connection two Chapters.
- **R7.6** Older files stay valid:
  - a file written before the board had several Chapters (top-level `lanes`, `slices`, `unassignedElements` and a `chapter` position, but no `chapters`) is read as a single Chapter named "Chapter 1";
  - a missing `lanes` list falls back to the three default lanes;
  - a missing Chapter position falls back to the origin, `(0, 0)`;
  - a `timelineWidth` field from older exports is ignored, because the width is derived from the slices (R1.8).
  - an element without a `title` gets an empty title (R3.6b).

## 8. Undo and redo

- **R8.1** Every user operation that modifies the board is recorded in memory so it can be undone. This covers: adding, editing (text and HTML), moving (including to another Chapter) and deleting elements; creating and deleting connections, including Chapter connections; adding, renaming, resizing and deleting slices; adding, renaming and removing lanes; adding, renaming, moving and removing Chapters; import; and Reset.
- **R8.2** **Undo** and **Redo** buttons sit in the header at the top of the board, next to the title. A button is disabled when there is nothing to undo or redo.
- **R8.3** Keyboard shortcuts: Ctrl+Z (Cmd+Z) undoes, Ctrl+Y or Ctrl+Shift+Z redoes. They are ignored while typing in a text field, so the field's own undo applies there.
- **R8.4** A continuous gesture is one step: dragging an element or a Chapter, or resizing a slice, is recorded once when it ends, not once per movement.
- **R8.5** An operation and the automatic adjustments it triggers (re-settling elements inside slices, centring in lanes, shifting following slices) are one step. Undo restores the board exactly as it was before the operation.
- **R8.6** Selecting items (including Cells, R5a.9), panning and zooming are not operations and are not recorded.
- **R8.7** Making a new change after an undo discards the redo history.
- **R8.8** History keeps the last 100 operations. It lives in memory only: it is lost when the page is reloaded, and the board itself is still saved as before (R1.6).

## Out of scope for now

- Icons for element types other than Processor.
