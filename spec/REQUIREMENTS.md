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
- **R1.6** The board is saved automatically in the browser and restored on reload. What is saved is exactly the information of the export file (R6.10), with the same ids, so nothing is lost or renumbered by a reload. If the saved board is missing or cannot be read, the sample board (R1.4) is shown.

### Chapter width

- **R1.7** The Chapter has one width shared by all lanes.
- **R1.8** The Chapter is exactly as wide as its slices: it starts at the left edge of the lanes and ends where the last slice ends. It can be neither longer nor shorter, so it cannot be resized on its own. There is no Chapter resize handle.
- **R1.9** The Chapter therefore grows and shrinks automatically when a slice is added, resized or deleted. A Chapter always has at least one slice (R5.19), so it is never narrower than the label zone plus that slice.

### Moving the Chapter

- **R1.10** The Chapter can be moved on the canvas, in three ways: by dragging the **Chapter** handle above the slices, by dragging any of its **lane headers** (the vertical label column), or by dragging any of its **slice headers**. Whichever is used, the lanes, slices and elements move together as one unit, the Chapter snaps to the 20px grid, and the Chapter becomes the active one (R1a.4). A header that is only clicked or double-clicked (to rename it) does not move the Chapter, and neither does the lane **×** button or a name that is being edited.
- **R1.10a** Moving a Chapter never moves the view: the canvas stays where it is while a Chapter is dragged, whichever way it is moved (R1.10), including when the Chapter is dragged towards the edge of the screen. The user pans the view separately, by dragging empty canvas.
- **R1.11** Moving the Chapter does not change anything inside it: the relative positions of lanes, slices and elements stay the same, and so do the connections.
- **R1.12** A Chapter's position is saved with the board and restored on reload. A Chapter cannot be deleted with the keyboard; it is removed with its own button (R1a.6).
- **R1.13** Elements and slices keep their positions relative to the Chapter, so the layout rules in this document (slice layout, centring, margins) apply regardless of where the Chapter is on the canvas. An element dropped from the toolbar is added in the Cell it is released over, whatever the Chapter position (R3.3).

### Identifiers

- **R1.14** Every Chapter, lane, slice and element has an **id**: a text of 12 characters from `a-z` and `0-9`, generated at random when the item is created, from the browser's secure random source (not from a counter or the time). An id is unique among all items of the board, whatever their kind, and never changes during the item's life: renaming, moving, resizing or reordering an item keeps its id.
- **R1.15** Everything that creates items uses such ids: the sample board (R1.4), **+ Chapter**, **+ Slice**, the slice **+** button, **+ Lane** and the element buttons. If a generated id happens to be in use already, another one is generated.
- **R1.16** Connections (arrows) have no id. A connection is identified by the two items it joins and its direction (R4.5).
- **R1.17** Ids are never shown to the user, who refers to items by their names and titles. Items refer to each other by id, never by name, so renaming an item cannot break a reference (for lanes see R2.9).

## 1a. Multiple Chapters

- **R1a.1** The board can hold any number of Chapters. Each Chapter has its own lanes, slices and elements, and is laid out independently: resizing a slice or adding a lane in one Chapter never changes another Chapter. All rules in sections 2 to 5 apply per Chapter.
- **R1a.2** A **+ Chapter** button in the header adds a new Chapter. It starts with the three default lanes and one default slice, named "New Slice" and 220px wide (as if **+ Slice** had been used once), but no elements. Its width is therefore the label zone plus that slice. It appears in the middle of the part of the canvas that is currently visible (its lane area is centred on the centre of the viewport, snapped to the grid), so the user sees it straight away. The view does not pan or zoom. If it lands on top of another Chapter, the user can drag it away by its handle.
- **R1a.3** Each Chapter has a name, shown in its handle ("Chapter 1", "Chapter 2", ... by default). The user renames it by double-clicking the name. The first Chapter of the sample board is "Chapter 1". A Chapter's name can never be empty: renaming it to nothing is ignored and the previous name is kept, as for lanes (R2.4a).
- **R1a.4** **Active Chapter.** The header's add buttons (**+ Command**, **+ Slice**, **+ Lane**, and so on) act on the active Chapter. This is the Chapter the user last clicked or dragged something in; initially the first Chapter. The header shows its name next to "Add to:". An element dragged from the header onto the board joins the Chapter it is released over; if it is released over no Chapter, it joins the active Chapter.
- **R1a.5** An element can be moved to another Chapter by dragging it and releasing it with its centre over a Cell of that Chapter (R5.14). It then becomes part of that Chapter, in that Cell's lane and slice, and follows its layout rules (R3.6a, R5.13 to R5.17). An element released anywhere else, including over another Chapter's lane label zone, stays in its own Chapter and returns to where the drag started (R5.14). Connections of a moved element are kept.
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
- **R2.8** An element always sits in exactly one lane of its Chapter, the lane it is vertically centred in (R3.6a). It cannot be outside every lane. How an element moves from one lane to another is described in R5.14.
- **R2.9** A lane is referred to by its **id**, never by its name. Renaming a lane (R2.4a) therefore changes nothing but the name that is displayed. The same holds in the export file, where an element names its lane by id (R6.5).

## 3. Elements

An element is a sticky note placed on the board. Each has an id (R1.14), a type, a title, a text and a position, and it always sits in exactly one Cell: one lane and one slice of one Chapter (R2.8, R5.13). An element cannot exist outside a Cell.

- **R3.1** Element types and default placement:

  | Type | Colour | Default lane |
  |------|--------|--------------|
  | Screen | light grey | first |
  | Command | blue | second |
  | Read Model | green | second |
  | Event | orange | third |
  | Processor | lavender, shown with a ⚙️ gear emoji | second |

- **R3.2** Default lane means the lane a new element is placed in when no Cell is selected. If that lane doesn't exist, the last lane is used. Elements can be dragged freely, but always end up inside a Cell (R5.14).
- **R3.3** The user adds an element by clicking its toolbar button, or by dragging the button onto the board. A clicked button puts the element in the selected Cell if there is one (R5a.10); otherwise it joins the active Chapter (R1a.4), in the default lane of its type (R3.2) and in the last slice of that Chapter, at the first free spot from the left (as in R5a.10). A button released over a Cell adds the element in that Cell, at the horizontal position where it was released, kept inside the slice's margins (R5.14). A button released anywhere that is not over a Cell is treated like a click. An element is never created outside a Cell.
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
- **R4.5** Two elements are connected at most once in each direction: connecting A to B a second time is not possible, while A to B and B to A are two different connections. A connection is identified by its source and its target and has no id of its own (R1.16).
- **R4.6** An element cannot be connected to itself. Elements can be connected across slices and across Chapters.

## 5. Slices

A slice is a vertical band across all lanes that groups the elements of one piece of behaviour.

- **R5.1** Each slice has an id (R1.14), a name and a width, and sits in the Chapter above the lanes.
- **R5.2** The user adds a slice with **+ Slice**. It is appended after the last slice of the active Chapter (R1a.4), with the name "New Slice".
- **R5.2a** Every slice has a **+** button at the very right end of its header. It adds a new slice immediately after that slice, named "New Slice" and 220px wide. The slices after it, together with their elements, move to the right to make room (R5.7, R5.15). The Chapter becomes the active one (R1a.4). The button does not start a drag of the Chapter and does not trigger renaming.
- **R5.3** The user renames a slice by double-clicking its header. A slice's name can never be empty: renaming it to nothing is ignored and the previous name is kept, as for lanes (R2.4a).
- **R5.4** Slices can be selected by pressing or clicking their header, and a selected slice is outlined. Selecting works in every state of the header: when it is the start of a drag that moves the Chapter (R1.10), and when its name is being edited (R5.3). A selected slice can be deleted with Backspace or Delete (see R5.11, R5.18 and R5.19).
- **R5.5** A slice's height always covers all current lanes, including after lanes are added or removed.
- **R5.6** Only the slice header captures the mouse, so elements underneath stay usable.
- **R5.7** Slices are laid out automatically as one contiguous run. The first slice starts at the beginning of the slice area, right after the lane label zone (R2.4), and each following slice starts exactly where the previous one ends. There are no gaps and slices never overlap.
- **R5.8** The order of slices is fixed. Slices cannot be dragged to a different position within the Chapter, and have no left resize handle. Dragging a slice header moves the whole Chapter instead (R1.10). New slices are added at the end with **+ Slice**, or right after a given slice with the **+** button in its header (R5.2a).
- **R5.9** The user resizes a slice by dragging its right edge, with a minimum width of 120px. There are no resize buttons.
- **R5.10** Resizing a slice moves all following slices with it, so they stay attached. The preceding slices do not move.
- **R5.11** Deleting a slice closes the gap: the following slices move left, and the next slice becomes first if the first was deleted.
- **R5.12** Saved boards and imported files are laid out the same way on load: slices are packed together in the order in which they are stored (the order of the file's `slices` list), and their elements move with them. Each element is then kept inside its slice with the 20px margin (R5.14, R5.16, R5.17).

### Elements and slices

- **R5.13** An element always sits entirely inside exactly one slice of its Chapter. It never crosses two slices, and it can never be outside every slice. The slice an element is in is part of the element's data: in the export file the element is listed under its slice (R6.4), and nothing is guessed from coordinates. Because an element is always fully inside its slice, that slice is also the one that contains its centre.
- **R5.14** Where an element ends up when it is added, dropped or dragged is decided by the Cell (lane and slice) under the **centre** of the element when it is released:
  - **Over a Cell of the same Chapter:** the element moves into that Cell. If the Cell is in another slice, the element moves to that slice; if it is in another lane, it moves to that lane and is centred in it (R3.6a). Horizontally it is kept fully inside the slice, at least 20px from the slice borders (the slice grows if the element does not fit, R5.17).
  - **Over a Cell of another Chapter:** see R1a.5.
  - **Over no Cell** (outside every Chapter, over a lane label zone, above the slices, beyond the last slice, or below the last lane): the element does not move. It returns to the position it had when the drag started, in its own slice and lane.

  So an element is never left outside a slice: whatever happens during the drag, it is in a slice again when released.
- **R5.15** Elements move with their slice. When a slice is resized, the following slices shift and take their elements with them, keeping each element's position relative to its slice. Elements of the resized slice itself stay put.
- **R5.16** A slice cannot be made narrower than its elements plus a 20px margin between the elements and the slice borders (left and right).
- **R5.17** If an element is wider than its slice (for example a Screen that widens to show an HTML mockup), it is moved inside, and the slice grows to fit it, including the 20px margin, when it would not fit otherwise.
- **R5.18** Deleting a slice always deletes the elements inside it and the connections attached to them, and closes the gap. If the slice holds elements, the user is asked to confirm first.
- **R5.19** A Chapter always has at least one slice, because elements can only exist inside a slice. The last slice of a Chapter cannot be deleted: Backspace and Delete do nothing to it. A deletion that would remove every slice of a Chapter at once is refused as a whole.

**Learning (implementation).** While the board is at rest, the slice an element is in is the one that holds its left edge (an element is kept at least 20px inside its slice and may only grow to the right), not the one that holds its centre: a Screen that widens to show a mockup has its centre outside its slice until the slice has grown, and would otherwise be handed to the next slice.

## 5a. Cells

- **R5a.1** A **Cell** is the intersection of one lane and one slice of a Chapter: one box of the Chapter's grid, with the lanes as rows and the slices as columns. A Chapter with 3 lanes and 2 slices has 6 Cells. The lane label zone is not part of any Cell.
- **R5a.2** A Cell is not a separate object that is stored. It follows from the lanes and slices: adding, removing, renaming or resizing them adds, removes or resizes the Cells, and moving the Chapter moves its Cells. A Cell has no data of its own, so it is not exported or imported, and is not saved with the board. (An element's Cell is given by the slice it is listed under and by its lane id, R6.4 and R6.5.)
- **R5a.3** A Cell has no colour of its own. It shows the shading of its lane (R2.6).
- **R5a.4** A Cell can hold any number of elements. They stay freely positioned, as before: an element sits in the Cell of its lane and slice (R5.13), can be dragged freely, and ends up in the Cell it is released over (R5.14), vertically centred in the lane (R3.6a).
- **R5a.5** Clicking on a Cell selects it: a thin (2px), slightly transparent blue border is drawn around the whole Cell, above its elements. It is meant to be visible without being intrusive. Only one Cell is selected at a time, and clicking another Cell moves the selection. The Chapter of the Cell becomes the active Chapter (R1a.4).
- **R5a.6** Clicking on an element, a slice header, a lane header, a Chapter handle or a connection does not select a Cell; it selects that item, and clears any Cell selection. So does starting to drag an element, and undo or redo.
- **R5a.7** A click on the canvas outside every Cell (empty canvas, the lane label zone, or the area above the slices) clears the Cell selection.
- **R5a.8** The selected Cell's border follows the Cell: it stays on it when the view is panned or zoomed, when the Chapter is moved, and when its slice is resized or shifted. If the Cell's lane or slice is removed, the selection disappears.
- **R5a.9** Selecting a Cell is not an operation: it is not recorded for undo (R8.6), and there is nothing to delete, so Backspace and Delete do nothing to a selected Cell.
- **R5a.10** When a Cell is selected, clicking an element button in the header adds the new element **in that Cell**, whatever the element's default lane (R3.2): it goes in the Cell's lane and slice, vertically centred in the lane (R3.6a), at the first free spot from the left, inside the slice's margins (R5.14), where it does not overlap the elements already in the Cell. If the Cell has no room left, the element is placed after the last element and the Cell's slice grows to fit it; the slices after it, with their elements, move right (R5.15). The Cell stays selected, so several elements can be added in a row. Dragging a button onto the board is not affected: the element goes where it is released. With no Cell selected, or if its lane or slice no longer exists, the element is added as described in R3.3.

**Learning (implementation).** The lanes of a Chapter cover its whole Cell area, so a click on the empty part of a Cell is received by a lane, not by the canvas behind it. Cell selection therefore has to be handled for clicks on lanes as well as on the canvas, using the click position to find the Cell (R5a.5, R5a.7). The first version listened only to canvas clicks and nothing was ever selected.

## 6. Export

The export file is the single, complete description of a board. It is written and read **only by software** (this application, other tools and LLMs); people are not expected to read or edit it. It is therefore plain JSON, chosen for exactness and strict checking, not for readability. YAML was considered and rejected: its readability and comments only help people who edit files by hand, while its silent type guessing (an id such as `1e3` or a value such as `no` being read as something else) and its many equivalent spellings work against exact import checks (R7.4) and byte-for-byte output (R6.9). Only JSON is read and written; no other format is supported. It states what exists and how it is connected, and it stores every choice the user made. Values that follow from the layout rules are left out and are worked out again when the file is read (R6.10).

- **R6.1** An **Export JSON** button downloads `event-model.json`.
- **R6.2** The file is one JSON object with exactly these fields, in this order:
  - `format`: the text `"event-model"`;
  - `version`: the number `1`;
  - `chapters`: the list of Chapters.

  There is no timestamp and nothing else.
- **R6.3** Each Chapter has exactly these fields, in this order:
  - `id`, `name`;
  - `x`, `y`: the Chapter's position on the canvas;
  - `connectsTo`: the ids of the Chapters this Chapter has an arrow to (R6.7);
  - `lanes`: the lanes from top to bottom, each with `id` and `name`;
  - `slices`: the slices from left to right.
- **R6.4** Each slice has exactly these fields, in this order: `id`, `name`, `width`, `elements`. `elements` lists the elements that sit in that slice. An element is listed under exactly one slice; the file has no other place for elements, so an element outside a slice cannot be written (R5.13).
- **R6.5** Each element has exactly these fields, in this order:
  - `id`;
  - `type`: `screen`, `command`, `readmodel`, `event` or `processor`;
  - `lane`: the **id** of the element's lane, which must be a lane of the same Chapter (R2.9). Never the lane's name;
  - `title`, `text`: free text, empty (`""`) when not set;
  - `html`: the Screen mockup. For every type other than `screen` it is `""`;
  - `x`: the horizontal position of the element **relative to the left edge of its slice**, in pixels. It is stored exactly and restored exactly;
  - `connectsTo`: the ids of the elements this element has an arrow to (R6.7).
- **R6.6** Every field above is written for every item. No field is left out because it is empty or has its default value: an empty title is `""` and an item with no connections has `"connectsTo": []`.
- **R6.7** A connection is stored on the item it leaves: the `connectsTo` of the source lists the ids of its targets, and the direction is from the owner to each listed id. Element connections go from element to element. Chapter connections go from Chapter to Chapter, from the right side of the owner to the left side of the target (R1a.7). A connection is written once, on its source. There is no separate connection list and connections have no id (R1.16).
- **R6.8** The order in the file is fixed:
  - Chapters by `x`, then `y`, then `id`;
  - lanes top to bottom, slices left to right;
  - elements within a slice by `x`, then by lane (top lane first), then by `id`;
  - each `connectsTo` in the order in which its targets appear in the file.

  The JSON is indented with 2 spaces. Although no person is expected to read the file, the indentation is kept because it makes a failed import or a difference between two exports easy to inspect; the size it costs is not a concern (correctness comes before size).
- **R6.9** The same board always produces the same file, byte for byte.
- **R6.10** What the file stores, and what it does not.
  - **Stored:** all ids, names, titles, texts and mockups; each element's type, lane, slice (by where it is listed) and `x`; each slice's `width`; each Chapter's `x` and `y`; the order of lanes and slices; all connections.
  - **Not stored, worked out on load:** a slice's own position (slices form one run, R5.7); the widths of the lanes and of the Chapter (R1.8); the lane height; an element's vertical position (centred in its lane, R3.6a); the lane shading. Also not stored: the selected Cell, the active Chapter, the undo history and the pan and zoom of the view.

## 7. Import

- **R7.1** An **Import JSON** button loads a file in the export format (section 6) and rebuilds the whole board from it, with all its Chapters, lanes, slices, elements and connections, and with the same ids. It replaces the current board; it does not merge.
- **R7.2** The user must confirm before the current board is replaced.
- **R7.3** Export followed by import reproduces the same board exactly, and exporting that board again gives an identical file (R6.9).
- **R7.4** The whole file is checked before anything is changed. If any check fails, the file is rejected, the board is left untouched, and an error message names the first problem and where it is, for example `chapters[0].slices[1].elements[2].lane: no lane with id "q7w2e9r4t1u8" in this chapter`. The checks are:
  - **Structure.** The file is valid JSON. `format` is `"event-model"` and `version` is `1`. Every field required in R6.2 to R6.5 is present with the right type, and no other fields are present. `chapters` is not empty, and every Chapter has at least one lane and at least one slice (R2.5, R5.19).
  - **Ids.** Every id is a text of at least 8 characters, using only letters, digits, `-` and `_`. Ids are unique across the whole file: no two Chapters, lanes, slices or elements share an id, whatever their kind (R1.14).
  - **References.** Each element's `lane` is the id of a lane of the element's own Chapter. Each entry of a `connectsTo` is the id of an existing item of the same kind as its owner (an element's entries are elements, a Chapter's entries are Chapters). An item does not connect to itself, and no id is listed twice in one `connectsTo`.
  - **Values.** `name` of a Chapter, lane or slice is not empty. `type` is one of the five element types. `html` is `""` for every type other than `screen`. `x`, `y` and `width` are finite numbers.
- **R7.5** When the file is accepted, the geometry is brought in line with the layout rules, the same as for a saved board (R5.12): slices are packed together in file order; a slice narrower than 120px is widened to 120px; an element `x` below 20 is raised to 20; a slice that is too narrow for its elements plus the 20px margins is widened (R5.16, R5.17); elements are centred in their lanes (R3.6a). A file written by the app already satisfies these rules, so for such a file nothing changes. After the import no Cell is selected, the first Chapter is the active one, and the import is one undo step (R8.1).
- **R7.6** Files in any earlier format are not supported. They are rejected by the checks in R7.4 (no `format` field), with a message saying so.

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

## Open points

Choices made while writing this specification that were not stated by the user. They are the first thing to confirm.

1. **Adding an element with no Cell selected (R3.3):** it goes in the last slice of the active Chapter, in the default lane of its type.
2. **A toolbar button released over no Cell (R3.3):** treated like a click, not ignored.
3. **Characters allowed in imported ids (R7.4):** letters, digits, `-` and `_`, at least 8 characters, no upper limit. Generated ids always have 12 characters from `a-z0-9` (R1.14).
4. **`html` on non-Screen elements (R6.5, R7.4):** written as `""` and rejected on import if it is not empty.
5. **Unknown fields (R7.4):** rejected, so that a misspelt field name is reported instead of silently ignored.
6. **Element position in a file not written by the app (R7.5):** a position that breaks the margin rule is corrected on load, not rejected.
7. **Indentation (R6.8):** the file is indented with 2 spaces even though only software reads it.
8. **Refused deletion of every slice (R5.19):** only the slice deletions of that Chapter are refused; other selected items are deleted as usual.
