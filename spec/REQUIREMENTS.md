# Event Modeling Board — Requirements

A browser-based board for event modeling, built with React and React Flow (`@xyflow/react`, version 12).
This document records the business requirements agreed so far. It describes behaviour, not implementation.

## 1. Board and Chapter

- **R1.1** The board is a single page showing an event-modeling canvas. Time flows left to right. The board holds one or more Chapters (section 1a).
- **R1.1a** A **Chapter** is one modelled area: its lanes, slices and their elements.
- **R1.2** The canvas supports pan and zoom, a minimap, zoom controls and a dotted background grid.
- **R1.3** Items snap to a 20px grid.
- **R1.3a** The small buttons on lane labels (**×**, **+**, colour, **i**), slice headers (**i**, **+**, **×**) and the Chapter handle (**i**, **↔**, **×**, context rename and delete) look alike: 18px squares with a 3px radius, and drawn icons (10px, 1.6px stroke, not text characters) exactly centred.
- **R1.4** The board starts with one empty Chapter, "Chapter 1", in the Default Context: the three default lanes and one default slice ("New Slice", 220px wide), no elements.
- **R1.6** The board is saved automatically in the browser and restored on reload. The saved data is exactly the export file's information (R6.10), with the same ids, so a reload loses or renumbers nothing. If the saved board is missing or unreadable, the starting board (R1.4) is shown.

### Chapter width

- **R1.7** The Chapter has one width shared by all lanes.
- **R1.8** The Chapter is exactly as wide as its slices: from the left edge of the lanes to the end of the last slice. It cannot be resized on its own and has no resize handle.
- **R1.9** It grows and shrinks automatically when a slice is added, resized or deleted. It always has at least one slice (R5.19), so it is never narrower than the label zone plus that slice.

### Moving the Chapter

- **R1.10** The Chapter is moved by dragging its **Chapter** handle above the slices, any **lane header** (the vertical label column) or any **slice header**. Lanes, slices and elements move together as one unit, the Chapter snaps to the 20px grid and becomes the active one (R1a.4). A header that is only clicked or double-clicked (to rename) does not move it, nor does the lane **×** button or a name being edited.
- **R1.10a** Moving a Chapter never moves the view, however it is moved (R1.10), including towards the screen edge. The user pans separately by dragging empty canvas.
- **R1.11** Moving a Chapter changes nothing inside it: relative positions of lanes, slices and elements, and connections, stay the same.
- **R1.12** A Chapter's position is saved with the board. A Chapter cannot be deleted with the keyboard, only with its own button (R1a.6).
- **R1.13** Elements and slices keep their positions relative to the Chapter, so the layout rules (slice layout, centring, margins) apply wherever the Chapter is. An element dropped from the toolbar is added in the Cell it is released over (R3.3).

### Identifiers

- **R1.14** Every Context, Chapter, lane, slice and element has an **id** matching `^[A-Za-z0-9]{6}$`, random, generated from the browser's secure random source (not a counter or the time) when the item is created. An id is unique among all items of the board, whatever their kind, and never changes: renaming, moving, resizing or reordering keeps it.
- **R1.15** Everything that creates items uses such ids: the starting board (R1.4), **+ New context...** (R1b.4), **+ Chapter**, **+ Slice**, the slice **+** button, **+ Lane** and the element buttons. A generated id already in use is regenerated.
- **R1.16** Connections (arrows) have no id; one is identified by the two items it joins and its direction (R4.5).
- **R1.17** Ids are never shown to the user, who refers to items by name and title. Items refer to each other by id, never by name, so renaming cannot break a reference (lanes: R2.9).

## 1a. Multiple Chapters

- **R1a.1** The board can hold any number of Chapters, each with its own lanes, slices and elements, laid out independently: resizing a slice or adding a lane in one never changes another. Sections 2 to 5 apply per Chapter.
- **R1a.2** **+ Chapter** adds a Chapter with the three default lanes and one default slice ("New Slice", 220px wide, as if **+ Slice** had been used once) and no elements; its width is the label zone plus that slice. Its lane area is centred (snapped to the grid) on the centre of the visible canvas, so it is seen straight away; the view does not pan or zoom. If it lands on another Chapter, the user drags it away by its handle.
- **R1a.3** Each Chapter has a name, shown as a large text (36px, bold) centred above the Chapter, above the Chapter's handle ("Chapter 1", "Chapter 2", ... by default; the starting Chapter's is "Chapter 1"). It is only a title: dragging it does not move the Chapter. The user renames it by double-clicking it. The name can never be empty: an empty rename is ignored and the previous name kept, as for lanes (R2.4a). The Chapter's small **handle** (R1.10), just above the slice headers at the left, holds the grip, the Context controls (R1b), the **↔** and **×** buttons and no name.
- **R1a.4** **Active Chapter:** the one the user last clicked or dragged something in; initially the first. The header shows its name next to "Add to:". **+ Slice** and **+ Lane** act on it. Element buttons do not: they act on the selected Cell (R3.3). An element dragged from the header joins the Chapter of the Cell it is released over (R3.3); released over no Cell, nothing is added.
- **R1a.5** An element moves to another Chapter when dropped with its centre over a Cell of that Chapter (R5.14): it joins that Cell's lane and slice and follows its layout rules (R3.6a, R5.13 to R5.17). Released anywhere else, including over another Chapter's label zone, it stays in its Chapter and returns to where the drag started (R5.14). Its connections are kept.
- **R1a.6** A Chapter is removed with the **×** button in its handle, hidden when only one Chapter is left (the board always has one). Its lanes, slices, elements and every connection attached to them or to it are removed too. If it holds slices or elements, the user confirms first.

### Connecting Chapters

- **R1a.7** Chapters are connected with arrows showing the flow from one to the next. Each has an **outgoing** point on its **right** side and an **incoming** one on its **left**, both at the vertical middle and mostly outside the outline, so they are easy to reach.
- **R1a.8** The user connects Chapters by dragging from one's right point to another's left point.
- **R1a.9** Chapter connections differ from element connections: darker, thicker arrows, larger arrowhead, larger connection points. The points are mostly transparent, and fully visible on mouse-over or while connecting.
- **R1a.10** Chapters connect only to Chapters, elements only to elements. A Chapter–element connection is refused, as is a Chapter to itself.
- **R1a.11** Selected Chapter connections are deleted with Backspace or Delete, like element connections (R4.4). Moving a Chapter keeps its connections attached.

## 1b. Contexts

- **R1b.1** A **Context** has an id (R1.14) and a name, nothing else for now. The board has a list of Contexts, independent from the Chapters: a Context can exist without any Chapter using it.
- **R1b.2** Every Chapter has exactly one Context. Several Chapters can share the same one. A Chapter refers to its Context by id, never by name (as for lanes, R2.9).
- **R1b.3** The first Context of the list is the **Default**. It is named "Default" at first, can be renamed (R1b.5) but never deleted, so the board always has at least one Context. A new Chapter, the starting Chapter and a Chapter whose Context was deleted use it.
- **R1b.4** The Chapter handle has a dropdown listing all Contexts and showing the Chapter's own. Choosing one assigns it to the Chapter. The last entry, **+ New context...**, asks for a name, appends a new Context to the list and assigns it to the Chapter. An empty name or cancelling does nothing.
- **R1b.5** A rename button next to the dropdown renames the Chapter's Context, for every Chapter that shares it. An empty name is ignored (previous kept).
- **R1b.6** A delete button next to it deletes the Chapter's Context after confirmation; the Chapters that used it move to the Default. The button is hidden for the Default.

## 1c. Info

- **R1c.1** A Chapter, a lane and a slice can carry **info**: free text in Markdown, empty by default.
- **R1c.2** Each has an **i** button in its header, in front of its label: for a Chapter in its handle, before the Context dropdown; for a lane in its label zone, between the colour button and the name; for a slice at the left of its header, before the name. The button is filled when the item has info and plain when it has none.
- **R1c.3** The button opens a modal panel titled with the item's kind and name. The panel has two sides: the Markdown editor on the left, with a row of helper buttons above it, and a live preview on the right. The buttons are **B** (bold), *I* (italic), ~~S~~ (strikethrough), a separator, then task list, table, code and link. Each acts on the selected text, or inserts a placeholder when nothing is selected: bold `**`, italic `*`, strikethrough `~~`, inline code in backticks (a fenced block for several lines), a link `[text](url)` with `url` selected, task list inserts `- [ ] Task` and `- [x] Resolved task` when nothing is selected, otherwise toggles `- [ ] ` on the selected lines, table inserts a 2-column table. **Save** applies the text (one undo step) and closes the panel; **Cancel** and Esc discard the changes. Info that is empty or only whitespace is removed.
- **R1c.4** The preview is rendered with `marked` (version 18.1.1). Its HTML is always sanitised with DOMPurify before it is shown, so scripts, event handlers and `javascript:` links never run. Links open in a new tab without access to the board.

## 2. Lanes

- **R2.1** Elements sit in horizontal swimlanes stacked top to bottom.
- **R2.2** The default lanes are: **UI / Actors**, **Commands / Read Models** and **Events**.
- **R2.3** **+ Lane** appends a lane named "New Lane" at the bottom of the active Chapter (R1a.4), with the current Chapter width.
- **R2.3a** Every lane has a **+** button at the bottom of its label zone. It adds a lane named "New Lane", colour `none`, right below that lane; lanes below it, with their elements, move down. The Chapter becomes active (R1a.4).
- **R2.4** Each lane has a reserved 48px label zone at its left edge holding the lane name, the **×** button (at the top) and the colour button (R2.6) under it, and the **+** button (R2.3a) at the bottom. The name is written vertically, bottom to top; if too long it is cut off with an ellipsis and shown in full on hover. Slices never enter this zone (R5.7).
- **R2.4a** Double-clicking a lane name renames it **in place**: the vertical title becomes editable text, keeping its orientation, with a caret and highlighted outline, all selected. Enter, Esc and clicking away save. The name is one line; an empty name is ignored (previous kept).
- **R2.5** The **×** button removes a lane.
  - Lanes below move up to close the gap.
  - Notes in it are deleted with their connections; if there are any, the user confirms first.
  - A Chapter's last lane cannot be removed.
- **R2.6** A lane has a colour: `none` (default, no tint), `orange`, `red`, `green`, `blue`, `pink`, `purple`, `yellow`, `brown` or `gray`. Each is a light, transparent tint, not intrusive. There is no alternating shading. A colour button under the **×** button in the label zone opens a small palette of the ten colours; picking one applies it and closes the palette, as does clicking elsewhere. The button shows the current colour. The last lane's button works the same.
- **R2.6a** Every Chapter has a clear, dark 2px outline around its whole area, including the label column: left and right edges on every lane, top on the first, bottom on the last. Lanes are separated by a thin light line, the label column by a line of the dark colour. Adding or removing lanes keeps it correct.
- **R2.7** Lanes cannot be dragged, selected or deleted with the keyboard.
- **R2.8** An element sits in exactly one lane of its Chapter: the one it is vertically centred in (R3.6a). Moving between lanes: R5.14.
- **R2.9** A lane is referred to by **id**, never by name, so renaming (R2.4a) changes only the displayed name. The export file likewise names an element's lane by id (R6.5).

**Learning (implementation).** Lanes and slices are translucent and overlap. A lane added later was drawn above the slices and looked lighter than the older lanes, until a reload reordered the items. Items are drawn in list order (a child's z-index cannot go below its parent's), so lanes are always kept before slices and elements in the list.

## 3. Elements

An element is a sticky note with an id (R1.14), a type, a title and a position. It always sits in exactly one Cell: one lane and slice of one Chapter (R2.8, R5.13), and cannot exist outside one.

- **R3.1** Element types:

  | Type | Colour |
  |------|--------|
  | Screen | light grey |
  | Command | blue |
  | Read Model | green |
  | Event | orange |
  | Processor | lavender, shown with a ⚙️ gear emoji |

- **R3.2** An element has no default lane; it goes in the lane of the Cell it is added to (R3.3). It can be dragged freely but always ends up inside a Cell (R5.14).
- **R3.3** Elements are added by clicking a toolbar button or dragging it onto the board. A click puts the element in the selected Cell (R5a.10); with none selected it does nothing. A button released over a Cell adds the element there, at the release position kept inside the slice margins (R5.14); released elsewhere it adds nothing. An element is never created outside a Cell.
- **R3.4** For now the body holds no text and cannot be edited; it only shows the Screen mockup (R3.7 to R3.10), and double-clicking it does nothing. An element has no `text` field, and a new one has an empty title (R3.6b).
- **R3.4a** Double-clicking the header edits the title (R3.6b); Enter, Esc and clicking away save. The title is one line. The editor looks like the title itself (same place and font, thin outline only), so the element does not resize or move while editing.
- **R3.5** Selected elements can be deleted with Backspace or Delete.
- **R3.6** Only Processor carries an icon (⚙️), shown at the start of its header; no other type has an icon. The type is shown by header colour (R3.1), not a label.
- **R3.6a** Elements are always vertically centred in their lane: when added, dropped or dragged (snapping to the centre of the lane released in), when their size changes (e.g. showing a Screen mockup), and when a board is loaded or imported. One taller than its lane aligns to the lane's top edge.
- **R3.6b** Every element has a header bar and a body. The header holds the free-text **title**, filled with the type's colour (R3.1). The title has **no default**: a new element has an empty title shown as a faint "Title" placeholder (not saved or exported). A long title is cut off with an ellipsis. The body is white and holds nothing, except the Screen mockup and its editor. The Screen colour is a slightly darker grey (`#e2e2e2`) so its header stands out from the body. Backgrounds are opaque. The body is at least 104px high (twice its former height), so an element is at least 132px tall with its 26px header, growing when its content needs it.

### Screen elements

- **R3.7** A Screen element can hold an HTML mockup, edited through a `</>` button on the element.
- **R3.8** The HTML is optional. With HTML, the Screen shows it in an iframe preview in its body, at the normal element width; without, the Screen shows nothing in place of the mockup.
- **R3.9** The preview is sandboxed with no permissions: no scripts or form submissions.
- **R3.10** While its element is not selected, the preview does not capture the mouse, so the element can still be dragged, selected and connected. Once the element is selected, the preview takes the mouse, so its content can be scrolled with the wheel; the element is then dragged by its header.

## 4. Connections

- **R4.1** Elements are connected with arrows (directed, with an arrowhead).
- **R4.2** Each element has two connection points, at the **top** and the **bottom**, not left and right. Either can start or end a connection. An arrow leaves the **lower** point of its source and enters the **upper** point of its target when the target is below the source (also in another slice or Chapter); when the target is above, it leaves the source's top point and enters the target's bottom point. Equal height counts as below. The points follow the elements when they move.
- **R4.3** The user creates a connection by dragging from a connection point of one element to a connection point of another; which points the arrow uses is decided by R4.2, not by where the drag started.
- **R4.4** Selected connections can be deleted with Backspace or Delete.
- **R4.5** Two elements are connected at most once: A to B cannot be made twice. A connection is identified by source and target and has no id (R1.16).
- **R4.6** An element cannot be connected to itself. Elements can be connected across slices and across Chapters.
- **R4.7** Element connections follow the flow of the model. The arrow always points:
  - Screen → Command
  - Processor → Command
  - Command → Event
  - Event → Read Model
  - Read Model → Screen
  - Read Model → Processor

  If the user drags between two elements of such a pair the wrong way (e.g. from a Command to a Screen), the connection is created in the right direction (Screen → Command). Any other pair, including two elements of the same type, is refused. These rules apply to new connections only; existing ones, imported or saved, are not checked.

## 5. Slices

A slice is a vertical band across all lanes that groups the elements of one piece of behaviour.

- **R5.1** Each slice has an id (R1.14), a name and a width, and sits in the Chapter above the lanes.
- **R5.2** **+ Slice** appends a slice named "New Slice" after the last slice of the active Chapter (R1a.4).
- **R5.2a** Every slice has a **+** button at the right end of its header. It adds a 220px "New Slice" right after that slice; later slices and their elements move right (R5.7, R5.15). The Chapter becomes active (R1a.4). The button neither starts a Chapter drag nor triggers renaming. Next to it is the **×** delete button (R5.4).
- **R5.3** Double-clicking a slice header renames it. The name can never be empty: an empty rename is ignored (previous kept), as for lanes (R2.4a).
- **R5.4** A slice itself cannot be selected, only its Cells (section 5a). A plain click on a slice header (not a drag, also not on its buttons or while renaming) selects the **top Cell** of that slice (R5a.5). A slice is deleted with the **×** button in its header (R5.11, R5.18, R5.19); Backspace and Delete never delete a slice.
- **R5.5** A slice's height always covers all lanes, also after lanes are added or removed.
- **R5.6** Only the slice header captures the mouse, so elements underneath stay usable.
- **R5.7** Slices form one contiguous run, laid out automatically: the first starts right after the label zone (R2.4), each next one where the previous ends. No gaps, no overlaps. A slice has only a dashed right border, which separates it from the next slice; it has no left, top or bottom border. The border does not cover the header.
- **R5.8** Slice order is fixed: slices cannot be dragged within the Chapter and have no left resize handle. Dragging a header moves the Chapter (R1.10). New slices are added at the end with **+ Slice** or after a given slice with its **+** button (R5.2a).
- **R5.9** A slice is resized by dragging its right edge, minimum 120px. There are no resize buttons.
- **R5.10** Resizing moves all following slices along; preceding ones do not move.
- **R5.11** Deleting a slice closes the gap: following slices move left; the next becomes first if the first was deleted.
- **R5.12** Saved boards and imported files are laid out the same way on load: slices are packed in stored order (the file's `slices` list) and their elements move with them. A saved board failing the R7.4 checks is unreadable (R1.6).

### Elements and slices

- **R5.13** An element sits entirely inside exactly one slice of its Chapter: never across two, never outside every slice. The slice is part of the element's data: the export lists the element under it (R6.4); nothing is guessed from coordinates. Being fully inside, it is also the slice containing the element's centre.
- **R5.14** Where an element ends up when added, dropped or dragged is decided by the Cell (lane and slice) under its **centre** on release:
  - **Over a Cell of the same Chapter:** it moves into that Cell: to its slice, and to its lane, centred in it (R3.6a). Horizontally it stays fully inside the slice, at least 40px from the borders (the slice grows if needed, R5.17).
  - **Over a Cell of another Chapter:** R1a.5.
  - **Over no Cell** (outside every Chapter, over a label zone, above the slices, beyond the last slice, below the last lane): it returns to its position at drag start, in its own slice and lane.

  So an element is never left outside a slice.
- **R5.15** Elements move with their slice: when a slice is resized, following slices shift with their elements, keeping each element's position relative to its slice. Elements of the resized slice stay put.
- **R5.16** A slice cannot be narrower than its elements plus a 40px margin to the slice borders on the left and right.
- **R5.17** An element wider than its slice is moved inside, and the slice grows to fit it plus the 40px margin if needed.
- **R5.18** Deleting a slice always deletes its elements and their connections, and closes the gap. If it holds elements, the user confirms first.
- **R5.19** A Chapter always has at least one slice, as elements only exist in slices. Its last slice cannot be deleted: its header has no **×** button. Other selected items are deleted as usual.
- **R5.20** **Compact.** The **↔** button in the Chapter handle compacts its slices and makes it active (R1a.4). A slice with elements gets the width from the left edge of its left-most element to the right edge of its right-most, plus the 40px margin (R5.16) on both sides, rounded up to the 20px grid, minimum 120px. If no Cell of the slice holds more than one element, each element is first centred horizontally in the slice, and the width is that of the widest element plus the margins. Otherwise the elements keep their relative positions and lanes and move together so the group is centred horizontally. Either way left and right padding are at least 40px. A slice without elements gets 220px. Following slices move left to close gaps (R5.7, R5.15), so the Chapter shrinks or grows. Nothing else changes. One undo step (R8.1).

**Learning (implementation).** At rest, an element's slice is the one holding its left edge (it stays at least 40px inside its slice), not the one holding its centre.

## 5a. Cells

- **R5a.1** A **Cell** is the intersection of one lane and one slice of a Chapter: a box of its grid (lanes are rows, slices columns). 3 lanes and 2 slices make 6 Cells. The label zone is not part of any Cell.
- **R5a.2** A Cell is not a stored object; it follows from lanes and slices: adding, removing, renaming or resizing them changes the Cells, and moving the Chapter moves them. It has no data of its own, so it is not saved, exported or imported. (An element's Cell comes from the slice it is listed under and its lane id, R6.4, R6.5.)
- **R5a.3** A Cell has no colour of its own; it shows its lane's colour (R2.6).
- **R5a.4** A Cell holds any number of elements, freely positioned: an element sits in the Cell of its lane and slice (R5.13), can be dragged freely, ends up in the Cell it is released over (R5.14), and is vertically centred in the lane (R3.6a).
- **R5a.5** Clicking a Cell selects it: a thin (2px), slightly transparent blue border around the whole Cell, above its elements, visible but not intrusive. One Cell is selected at a time; clicking another moves the selection. Its Chapter becomes active (R1a.4).
- **R5a.6** Clicking an element, lane header, Chapter handle or connection selects that item and clears any Cell selection, as do starting to drag an element and undo or redo. A click on a slice header selects the slice's top Cell instead (R5.4).
- **R5a.7** A click outside every Cell (empty canvas, label zone, area above the slices) clears the Cell selection.
- **R5a.8** The selection border follows the Cell: through panning, zooming, moving the Chapter, and slice resizing or shifting. If the Cell's lane or slice is removed, the selection disappears.
- **R5a.9** Selecting a Cell is not an operation: not recorded for undo (R8.6), and Backspace and Delete do nothing to it.
- **R5a.10** With a Cell selected, clicking an element button adds the element **in that Cell**, whatever its type (R3.2): in the Cell's lane and slice, vertically centred (R3.6a), at the first free spot from the left inside the slice margins (R5.14), not overlapping elements already there. If there is no room, it goes after the last element and the slice grows to fit; later slices move right with their elements (R5.15). The Cell stays selected, so several elements can be added in a row. Dragging a button is unaffected: the element goes where released (R3.3). With no Cell selected, or its lane or slice gone, a click does nothing (R3.3).

**Learning (implementation).** Lane nodes cover the Chapter's whole Cell area. If they take the mouse they sit above the arrows and block selecting them, so lanes ignore the mouse; a click on an empty part of a Cell then reaches the canvas, which finds the Cell from the click position (R5a.5, R5a.7).

## 6. Export

The export file is the single, complete description of a board, written and read **only by software** (this app, other tools, LLMs); people are not expected to read or edit it. It is plain JSON, chosen for exactness and strict checking, not readability. YAML was rejected: its readability and comments only help hand editing, while its silent type guessing (an id `1e3` or value `no` misread) and many equivalent spellings work against exact import checks (R7.4) and byte-for-byte output (R6.9). Only JSON is read and written. It states what exists and how it is connected, and stores every user choice. Values that follow from the layout rules are left out and recomputed on read (R6.10).

- **R6.1** An **Export JSON** button downloads `event-model.json`.
- **R6.2** The file is one JSON object with exactly these fields, in this order:
  - `format`: the text `"event-model"`;
  - `version`: the number `1`;
  - `contexts`: the list of Contexts, each with `id` and `name`;
  - `chapters`: the list of Chapters.

  There is no timestamp and nothing else.
- **R6.3** Each Chapter has exactly these fields, in this order:
  - `id`, `name`, `info` (optional, R1c.1);
  - `context`: the **id** of the Chapter's Context (R1b.2), which must be in `contexts`;
  - `x`, `y`: the Chapter's position on the canvas;
  - `connectsTo`: the ids of the Chapters this Chapter has an arrow to (R6.7);
  - `lanes`: the lanes from top to bottom, each with `id`, `name`, optional `info` and `color`;
  - `slices`: the slices from left to right.
- **R6.4** Each slice has exactly these fields, in order: `id`, `name`, optional `info`, `width`, `elements`. `elements` lists the elements in that slice. An element is listed under exactly one slice; there is no other place for elements, so one outside a slice cannot be written (R5.13).
- **R6.5** Each element has exactly these fields, in this order:
  - `id`;
  - `type`: `screen`, `command`, `readmodel`, `event` or `processor`;
  - `lane`: the **id** of the element's lane, which must be a lane of the same Chapter (R2.9). Never the lane's name;
  - `title`: free text, empty (`""`) when not set;
  - `html`: the Screen mockup. Optional: it is written only for a `screen` that has HTML, and left out otherwise;
  - `x`: the horizontal position of the element **relative to the left edge of its slice**, in pixels. It is stored exactly and restored exactly;
  - `connectsTo`: the ids of the elements this element has an arrow to (R6.7).
- **R6.6** Every field above is written for every item, except `html` (R6.5) and `info` (R1c.1), which are written only when not empty. No other field is left out because it is empty or has its default value: an empty title is `""` and an item with no connections has `"connectsTo": []`.
- **R6.7** A connection is stored on the item it leaves: the source's `connectsTo` lists its target ids; direction is owner to each listed id. Element connections go element to element; Chapter connections Chapter to Chapter, from the owner's right side to the target's left (R1a.7). Each is written once, on its source. There is no connection list and no connection id (R1.16).
- **R6.8** The order in the file is fixed:
  - Chapters by `x`, then `y`, then `id`;
  - Contexts in list order (the first is the Default, R1b.3);
  - lanes top to bottom, slices left to right;
  - elements within a slice by `x`, then by lane (top lane first), then by `id`;
  - each `connectsTo` in the order in which its targets appear in the file.

  The JSON is indented with 2 spaces. No person is expected to read the file, but the indentation makes a failed import or a diff between exports easy to inspect; its size cost is irrelevant (correctness before size).
- **R6.9** The same board always produces the same file, byte for byte.
- **R6.10** What the file stores, and what it does not.
  - **Stored:** all ids, names, titles and mockups; info texts; the list of Contexts and each Chapter's Context; each lane's colour; each element's type, lane, slice (by where it is listed) and `x`; each slice's `width`; each Chapter's `x` and `y`; the order of lanes and slices; all connections.
  - **Not stored, worked out on load:** a slice's own position (slices form one run, R5.7); the widths of the lanes and of the Chapter (R1.8); the lane height; an element's vertical position (centred in its lane, R3.6a). Also not stored: the selected Cell, the active Chapter, the undo history and the pan and zoom of the view.

## 7. Import

- **R7.1** **Import JSON** loads a file in the export format (section 6) and rebuilds the whole board from it (Chapters, lanes, slices, elements, connections, same ids). It replaces the current board; it does not merge.
- **R7.2** The user must confirm before the current board is replaced.
- **R7.3** Export then import reproduces the same board exactly, and exporting again gives an identical file (R6.9).
- **R7.4** The whole file is checked before anything changes. If a check fails, the file is rejected, the board stays untouched, and an error names the first problem and its location, e.g. `chapters[0].slices[1].elements[2].lane: no lane with id "q7w2e9r4t1u8" in this chapter`. The checks:
  - **Structure.** Valid JSON. `format` is `"event-model"`, `version` is `1`. Every field required in R6.2 to R6.5 is present with the right type (`html` and `info` may be missing), and no other fields. `chapters` is not empty, and every Chapter has at least one lane and one slice (R2.5, R5.19). `contexts` is not empty (R1b.3).
  - **Ids.** Every id matches `^[A-Za-z0-9_-]{6,}$`. Ids are unique across the whole file, whatever the item kind (R1.14).
  - **References.** A Chapter's `context` is the id of a Context of the file. An element's `lane` is the id of a lane of its own Chapter. Each `connectsTo` entry is the id of an existing item of the owner's kind (elements for an element, Chapters for a Chapter). An item does not connect to itself, and no id is listed twice in one `connectsTo`.
  - **Values.** `name` of a Context, Chapter, lane or slice is not empty. `type` is one of the five element types. A lane's `color` is one of the ten colours (R2.6). `html`, when present, is a non-empty text and belongs to a `screen`. `info`, when present, is a non-empty text. `x`, `y` and `width` are finite numbers.
  - **Geometry.** A slice `width` is at least 120. An element `x` is at least 40. Every element fits its slice with the 40px margins: `x` plus the element width (160px) plus 40 is at most the slice `width` (R5.16, R5.17). Nothing is corrected; a file breaking one of these is rejected.
- **R7.5** An accepted file is laid out as a saved board (R5.12): slices packed in file order, elements centred in their lanes (R3.6a). A file written by the app already satisfies the R7.4 checks. After import no Cell is selected, the first Chapter is active, and the import is one undo step (R8.1).
- **R7.6** Files in any earlier format are rejected by the R7.4 checks (no `format` field), with a message saying so.

## 8. Undo and redo

- **R8.1** Every user operation that modifies the board is recorded in memory so it can be undone: adding, editing (title and HTML), moving (including to another Chapter) and deleting elements; creating and deleting connections, including Chapter connections; adding, renaming, resizing and deleting slices; compacting a Chapter; adding, renaming and removing lanes; changing a lane's colour; editing the info of Chapters, lanes and slices; adding, renaming, moving and removing Chapters; adding, renaming and deleting Contexts and changing a Chapter's Context; and import.
- **R8.2** **Undo** and **Redo** buttons sit in the header next to the title, disabled when there is nothing to undo or redo.
- **R8.3** Ctrl+Z (Cmd+Z) undoes; Ctrl+Y or Ctrl+Shift+Z redoes. They are ignored while typing in a text field, so the field's own undo applies.
- **R8.4** A continuous gesture is one step: dragging an element or a Chapter, or resizing a slice, is recorded once when it ends.
- **R8.5** An operation and its automatic adjustments (re-settling elements in slices, centring in lanes, shifting later slices) are one step; undo restores the board exactly as before.
- **R8.6** Selecting items (including Cells, R5a.9), panning and zooming are not operations and are not recorded.
- **R8.7** Making a new change after an undo discards the redo history.
- **R8.8** History keeps the last 100 operations, in memory only: lost on reload (the board itself is still saved, R1.6).

## Out of scope for now

- Icons for element types other than Processor.

## Open points

None at the moment.
