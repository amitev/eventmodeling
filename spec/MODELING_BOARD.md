# Event Modeling Board — Requirements

A browser-based event-modeling board built with React and React Flow (`@xyflow/react` 12).
Business requirements agreed so far. They describe behaviour, not implementation.

## 1. Board and Chapter

- **R1.1** The board is a single page with an event-modeling canvas; time flows left to right. It holds Chapters (section 1a).
- **R1.1a** A **Chapter** is one modelled area: its lanes, slices and their elements.
- **R1.2** The canvas has pan, zoom, a minimap, zoom controls and a dotted background grid. The minimap shows each Chapter as a solid light-gray block; it hides all content inside Chapters. The board opens fitted, as with Fit view (R1.20), once its Chapters are measured (minimum zoom 20%).
- **R1.3** Items snap to a 20px grid.
- **R1.3a** The small buttons on lane labels (**×**, **+**, colour, **i**), slice headers (**i**, auto-name, **Copy Context**, **Flow end**, **+**, **×**, **Grip**) and the Chapter handle (**i**, **Copy Context**, **↔**, **×**, movie strip, context delete) look alike: 18px squares, 3px radius, drawn icons (10px, 1.6px stroke, not text characters) exactly centred.
- **R1.3b** Main header buttons and Context dropdown share 28px height, 1px border, 4px radius and 13px text. Icon-only buttons are 28px squares; text controls keep content-based widths. SVG icons are 16px, centred on both axes; no emoji or text-glyph icons. Canvas controls keep R1.3a sizes.
- **R1.4** The board starts with one empty Chapter, "Chapter 1", in the Default Context: lanes Actor, Interaction, Event (R2.10), one "New Slice" (220px wide), no elements.
- **R1.6** The board is saved automatically in the browser and restored on reload. The saved data is exactly the export file's information (R6.10), same ids. A missing or unreadable saved board gives the starting board (R1.4). The server model replaces it as soon as the server answers (R10.2).

### Chapter width

- **R1.7** The Chapter has one width for all lanes.
- **R1.7a** The Chapter's right border is continuous across all lanes, including when zoomed out.
- **R1.8** The Chapter is exactly as wide as its slices: from the lanes' left edge to the end of the last slice. It has no resize handle.
- **R1.9** It grows and shrinks automatically as slices change. It always has a slice (R5.19), so it is never narrower than the label zone plus that slice.

### Moving the Chapter

- **R1.10** The Chapter is moved by dragging any **lane header** (the vertical label column) or any **slice header**; its **handle** (R1a.3) does not move it. It moves as one unit (lanes, slices, elements) and snaps to the 20px grid. A header only clicked or double-clicked (rename), the lane **×** button and a name being edited do not move it. A slice is reordered with its grip instead (R5.8).
- **R1.10a** Moving a Chapter never moves the view, also towards the screen edge. The user pans by dragging empty canvas.
- **R1.11** Moving a Chapter changes nothing inside it: relative positions and connections stay.
- **R1.12** A Chapter's position is saved with the board. A Chapter is deleted only with its own button (R1a.6), not the keyboard.
- **R1.13** Elements and slices keep their positions relative to the Chapter, so layout rules (slice layout, centring, margins) apply wherever it is.

### Identifiers

- **R1.14** Every Context, Chapter, lane, slice, element, scenario and task has an **id** matching `^[A-Za-z0-9]{6}$`, generated randomly from the browser's secure random source (not a counter or the time) on creation. An id is unique among all items of the board, whatever their kind, and never changes (renaming, moving, resizing, reordering).
- **R1.15** Everything that creates items uses such ids: the starting board (R1.4), **+ New context...** (R1b.4), **+ Chapter**, the slice **+** button, lane buttons and Cell menu (R5a.13). An id already in use is regenerated.
- **R1.16** Connections (arrows) have no id; one is identified by its two items and direction (R4.5).
- **R1.17** **Modal popups.** Every modal popup (over a blurred backdrop: info and Notes panel, scenario popup, hotkey help, any future one) closes on a click on the backdrop, like Cancel/Close (changes discarded). Only press and release both on the backdrop close it, so selecting text and releasing outside does not. A new modal popup must use the shared `useBackdropClose` hook and `useModalFocus` (focus moves into the popup, so Esc does not reach the element that was focused on the board and deselect it). Non-modal Tasks follow R12.3. **Buttons:** the popup's bottom row is `.info-actions` (or `.scenario-actions`); **Save** has class `primary` (blue), **Cancel** and **Close** are white; Save comes first.
- **R1.18** Ids are never shown. Users refer to items by name; items refer to each other by id, never name, so renaming cannot break a reference (lanes: R2.9).
- **R1.19** **File-safe names.** Context names become file names on the server (SERVER.md S3.3), so they must be valid on every OS. Chapter and slice names are filtered the same way, though the server no longer uses them as file names. When one is typed or pasted (Chapter and slice: the inline input; Context: the name prompt):
  - the characters `\ / : * ? " < > |` and control characters are dropped as typed (nothing is shown); in a prompt they are removed from the result;
  - a name ending with a dot, or a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, also with an extension), is ignored (previous kept), as an empty name is (R1a.3, R5.3, R1b.4, R1b.5).

  Import and a saved board are not checked (R7.4); the server refuses such names on push (SERVER.md S3.4).
- **R1.20** **Fit view.** **Shift+F** does what the Fit view button of the zoom controls does: it zooms and pans so the whole board fits the window, **including 100px above each Chapter** (its handle fully, its title partly, R1a.3) (with 4% padding). The Fit view button of the zoom controls does the same, as does changing the Context filter (R1b.7). Ignored while typing in a field or while a popup is open. The button's tooltip is "Fit view (Shift+F)" (R1d.2). Not an undo step.
- **R1.21** **Large boards stay responsive.** During a drag or resize (R8.4) the board is not saved (R1.6) and not checked for deleted scenarios (R3.17) or copies (R3.22) and Chapter arrows (R1b.8); this happens once when it ends. **Learning (implementation):**
  - A Screen's mockup (R3.8) loads when the Screen first comes near the view (300px margin) and then stays loaded, also when it leaves the view again. A Screen never in view stays unloaded.
  - A `useStore` selector runs on every store change, pan and zoom included. It reads a Chapter's nodes through the store's `parentLookup` (`childrenOf`), never by scanning `nodeLookup`.
  - The `BoardActions` value must not depend on `nodes`: it calls the actions that read the board through a ref to their newest version. A changing value re-renders every node on every drag frame.
  - Slice insertion lays out only its Chapter. Other Chapters keep their positions and widths.
  - Notes and Scenarios share Cell counts and stretch widths per Chapter. Reuse widths until Chapter geometry or element kinds change.
  - Chapter, lane and slice selectors share lane counts, bounds, height, first/last slice and Screen count per Chapter and store update. Select primitive values to avoid unrelated re-renders.
  - Development insertion profiles show React/React Flow rendering, JSX checks and garbage collection can dominate. Measure production click-to-paint before attributing remaining delay to model calculations.
  - Saving and sync reuse unchanged Chapters' serialized content and JSON. Check all Chapters for changes; resolve arrows in global file order. Include measured sizes used for membership.
  - Selection-only changes do not rewrite browser storage. Save timing stays unchanged. Undo keys reuse unchanged node data JSON.
  - Reuse displayed edge objects and array while source edges, visibility, handle direction and overview color stay unchanged. React Flow still tracks endpoint geometry.
  - Production profiles still show React store-subscription callbacks, per-toolbar selected-node scans, DOM insertion and browser layout/paint costs. Edge identity reuse alone does not establish a click-latency improvement.

- **R1.22** **Global full screen.** The rightmost main-header button toggles the Fullscreen API on `document.documentElement`, including header, board and popup portals. Request hidden browser navigation UI. Match R1.3b; keep visible in overview.
  - Icon, pressed state and tooltip follow `fullscreenchange`: "Full screen" or "Exit full screen".
  - Unsupported API: disable with tooltip "Full screen is unavailable in this browser". Failed requests show a notice.
  - Capture `Escape` with Keyboard Lock while app full screen. Esc closes/cancels popup content first (modals, movie strip, Tasks, search and Cell menu); without a popup, exit full screen. Ignore key repeats; holding Esc retains browser emergency exit.
  - Request keyboard permission when needed; release lock on full-screen exit or board unmount. Unsupported/denied lock: show a notice; native Esc behavior remains.
  - No saved state or undo step. F11 remains browser-controlled; its separate browser mode cannot be triggered or reliably detected by the button.

- **R1.23** With no Cell, node or arrow selected, unmodified arrow keys pan the view 100 board pixels in their direction, with a minimum of 100 screen pixels per press. Works in high level view. Ignore while typing or while a popup or search is open. Holding a key repeats. No selection, model change or undo step.

## 1a. Multiple Chapters

- **R1a.1** The board holds any number of Chapters, each with its own lanes, slices and elements, laid out independently: changing one never changes another. Sections 2 to 5 apply per Chapter.
- **R1a.2** **+ Chapter** adds a Chapter with the three starting lanes (R2.10), one "New Slice" (220px) and no elements. Its lane area is centred (grid-snapped) on the centre of the visible canvas; the view does not pan or zoom. If it lands on another Chapter, the user drags it away by a lane header or slice header (R1.10).
- **R1a.3** Each Chapter has a name ("Chapter 1", "Chapter 2", ... by default), shown as a title (36px, bold, centred) above the Chapter and its handle; dragging it does not move the Chapter. Double-clicking renames it; the editor has no border, only a thin dark outline; an empty name is ignored (previous kept), as for lanes (R2.4a). The Chapter's small **handle**, just above the slice headers at the left, holds the info button, the Context controls (R1b), Copy Context (R1c.6), the movie strip button (R11.1), **↔** and **×**, and no name; it has no grip and does not move the Chapter (R1.10). **Learning (implementation):** the title text and its editor carry `nodrag nopan`, as headers do, so the canvas pan and double-click zoom do not take the mouse.
- **R1a.4** **Active Chapter:** the one the user last clicked or dragged in; initially the first. The main header's only add button is **+ Chapter** (R1a.2); no "Add to:" label.
- **R1a.5** An element dropped with its centre over a Cell of another Chapter (R5.14) moves there: it joins that Cell's lane and slice and follows its layout rules (R3.6a, R5.13 to R5.17). Released anywhere else, including over another Chapter's label zone, it returns to the drag start (R5.14). Its connections are kept.
- **R1a.6** A Chapter is removed with the **×** button in its handle, also when it is the only one (the board may then be empty; **+ Chapter** adds one). Its lanes, slices, elements and every connection attached to them or to it go too. If it holds slices or elements, the user confirms first.

### Connecting Chapters

- **R1a.7** Chapters are connected with arrows showing the flow. Each has an **outgoing** point on its **right** side and an **incoming** one on its **left**, both at the vertical middle and mostly outside the outline, so they are easy to reach.
- **R1a.8** The user connects Chapters by dragging from one's right point or a slice's bottom point to another's left point.
- **R1a.9** Chapter connections differ from element connections: darker arrows (same 3px thickness) and larger connection points. The points are mostly transparent, fully visible on mouse-over or while connecting.
- **R1a.10** Chapter and slice ports connect only to Chapters, elements only to elements. A Chapter–element connection is refused, as is a Chapter or slice to its own Chapter.
- **R1a.11** Selected Chapter connections are deleted with Backspace or Delete, like element connections (R4.4). Moving a Chapter keeps its connections attached.
- **R1a.12** Every slice has an outgoing point at its bottom centre, styled as R1a.9. Its arrows follow resizing, reordering and Chapter moves; deleting the slice removes them. Each slice and Chapter end may connect independently to the same target Chapter.

## 1b. Contexts

- **R1b.1** A **Context** has an id (R1.14), a name and optional `info` (Markdown, like Chapters; empty means omitted). The board has a list of Contexts, independent from Chapters: a Context can exist without any Chapter.
- **R1b.2** Every Chapter has exactly one Context; several can share it. A Chapter refers to its Context by id, never name (as for lanes, R2.9).
- **R1b.3** The first Context of the list is the **Default**: named "Default" at first, renamable (R1b.5), never deletable, so the board always has one. New Chapters, the starting Chapter and Chapters whose Context was deleted use it.
- **R1b.4** The Chapter handle has a dropdown of all Contexts showing the Chapter's own; choosing one assigns it. The last entry, **+ New context...**, asks for a name, appends a Context and assigns it to the Chapter. An empty name or cancelling does nothing.
- **R1b.5** A **Rename context** button (pencil icon, tooltip "Rename the selected context") in the header, after the Context filter (R1b.7), renames the Context chosen in the filter, for every Chapter sharing it. Disabled for **All contexts**. An empty name is ignored (previous kept). It is on the board menu, not on a Chapter.
- **R1b.8** A **Context info** button (i icon) after Rename context opens the info popup (R1c) of the Context chosen in the filter, titled "Context — <name>". Disabled without a choice. Filled like the other **i** buttons when there is info. Read-only in the overview (R1f). Not shown on the canvas.
- **R1b.6** A **Delete context** button (trash icon) after Context info (R1b.8) deletes the Context chosen in the filter after confirmation; its Chapters move to the Default, and the filter resets to **All contexts**. Disabled without a choice and for the Default. It is on the board menu, not on a Chapter.
- **R1b.7** **Context filter.** A dropdown in the header, after Redo (tooltip "Show only the Chapters of one Context"), followed by the **Rename context** button (R1b.5), lists **All contexts** (no filter, the default) and every Context. With a Context chosen, only its Chapters show; the others are **hidden** with their lanes, slices, elements and arrows, and so are arrows between a shown and a hidden Chapter. Nothing is deleted or changed: ids, positions, data, push and pull (section 10) and the saved board (R1.6) are unaffected, and the filter is not an undo step. Hidden elements and arrows are never selected: hiding deselects them, and a selection (e.g. by a box) never keeps them selected. Hidden Chapters have no Cells: clicking, dropping an element or pasting where one lies selects or joins no Cell.
  - Changing the filter fits the view to the shown Chapters (as Fit view, R1.20; not on load) and deselects hidden elements and Cells.
  - The filter is kept in the browser (localStorage key `event-model-board-context-filter`), not in the board file or on the server, and applies again on reload. If its Context no longer exists (deleted, pull, undo) it is All contexts.
  - **+ Chapter** gives a new Chapter the filter's Context (the Default for All contexts). Changing a shown Chapter's Context to another one hides it. Toolbar buttons that act on the active Chapter only act on shown Chapters; the active Chapter is a shown one. Search (R1e) lists only elements of shown Chapters. A Chapter with an unknown Context counts as the Default's.
- **R1b.8** **Chapter arrows stay in one Context.** An arrow between Chapters (R1a.7) can only join Chapters of the same Context: dragging one to a Chapter of another Context is refused, as to oneself. When a Chapter's Context changes (R1b.4, or R1b.6 moving it to the Default), its arrows to Chapters of other Contexts are removed at once, with no confirmation, in the same undo step. A saved board (R1.6) or a pull (R10.2) with such an arrow is accepted and the arrow is dropped, not rejected (R7.4 does not check it). Element arrows are unaffected.
- **R1b.9** The header Context dropdown ends with **+ New context...**. It uses the name prompt of R1b.4, appends an empty Context and selects it in the filter. No Chapter is created or moved. An empty name or cancelling changes nothing.

## 1c. Info

- **R1c.1** A Chapter, lane, slice and element (except Notes, which is Markdown text itself, R3.18, and Scenarios) can carry **info**: Markdown text, empty by default.
- **R1c.1a** **Element toolbar.** While exactly one element is selected, a toolbar floats above it (white, thin border, shadow; it does not capture the element's drag). Buttons are 24x24px on screen at zoom 100% and below; zoomed in, the toolbar (buttons, icons, spacing, gap to the element) grows with the zoom up to 28x28px buttons. It holds the copy button (two overlapping squares, drawn and exactly centred, R1.3a; R3.22), the button **i** (as on slices, R1c.2; filled when the element has info) and, for a Processor, an icon button (R3.6). For a Screen, it holds **`</>`** and an **eye** (R3.7). For a Screen, Command, Event and Read Model it also holds the **Fields** button (three lines icon; filled when the element has fields, R9.2). The key **F** (without modifiers) opens the fields popup while one such element is selected. **i** and **I** (without Shift) open info: Screen editor's Info tab (R3.7a) for Screens, otherwise info panel (R1c.3), titled with type and name. Shift+I stays the slice's info (R5a.11). It also holds the **Copy Context** button (R1c.6), last. Notes and Scenarios elements have a toolbar with only that button, as they have no info. A linked copy (R3.22) has **`</>`** and eye (Screen copies only), then Copy Context.
- **R1c.2** Each has an **i** button in its header, before its label: Chapter: in its handle, before the Context dropdown; lane: in its label zone, between the colour button and the name; slice: at the left of its header, before the name. Filled when the item has info, plain otherwise. For a slice, **Shift+I** with one of its Cells selected opens the same panel (R5a.11).
- **R1c.3** The button opens a modal panel titled with the item's kind and name: the Markdown editor on the left, with helper buttons above it, and a live preview on the right. The panel is 90% of the window width (at most 2400px) and 90% of its height. Editor and preview text: `clamp(13px, 1vw, 24px)`.  - Buttons: **B** (bold), *I* (italic), ~~S~~ (strikethrough), a separator, task list, table, code, link. Each acts on the selected text, or inserts a placeholder when nothing is selected: `**`, `*`, `~~`; inline code in backticks (a fenced block for several lines); `[text](url)` with `url` selected; task list `- [ ] Task` and `- [x] Resolved task` (with a selection: toggles `- [ ]` on the selected lines); a 2-column table.
  - **Save** applies the text (one undo step) and closes the panel. **Ctrl+S** (Cmd+S) does the same instead of the browser's Save, in every Markdown popup, now and in future. **Cancel**, Esc and a click outside (R1.17) discard the changes. Empty or whitespace-only info is removed.
  - In write mode **Ctrl+B**, **Ctrl+I** and **Ctrl+L** apply bold, italic and link like their buttons.
  - The editor has its own **undo and redo**, as the browser's cannot follow toolbar edits: buttons **↶** and **↷** at the start of the toolbar (tooltips "Undo (Ctrl+Z)", "Redo (Ctrl+Y)"; disabled when nothing to undo or redo) and the keys **Ctrl+Z**, **Ctrl+Y**, **Ctrl+Shift+Z**. A step restores text and selection. Typing in one burst (pauses under a second) is one step, each toolbar or hotkey edit its own; a new edit clears the redo steps. While the panel is open the board's undo and redo (R8.3) are off.
  - An icon button right after the title switches between **write mode** (default: both sides) and **read mode** (editor and its buttons hidden, preview full width). Its icon is an eye in write mode (switch to read) and a pencil in read mode. The text is kept; Save and Cancel work in both.
  - The same panel edits a Notes element's text (R3.19).
- **R1c.4** The preview is rendered with `marked` (18.2.0); its HTML is always sanitised with DOMPurify, so scripts, event handlers and `javascript:` links never run. Links open in a new tab without access to the board.
- **R1c.5** **Use of info.** Info is reserved mainly for implementation details: formats, limits, integrations, technical constraints. Not for source citations, summaries or traceability; summaries go in Notes (R3.18). A convention only: the board does not check it.
- **R1c.6** **Copy Context.** Button (tooltip "Copy Context (Shift+A)") on the element toolbar (R1c.1a) and, as the first button of the slice's actions, in the slice header (R5.22) and the Chapter handle (before the movie strip button, R11.1). It puts one line of ids in the system clipboard: `Context <context id> Chapter <chapter id> Slice <slice id> Element <element id>`. The slice button and the key with no element selected omit ` Element <element id>`. The Chapter button omits ` Slice <slice id> Element <element id>`. A linked copy (R3.22) gives its own id. A notice shows the copied text, or says the copy failed. Key **Shift+A** (not while typing; with a Cell selected, R5a.11): one element selected (also by R5a.12) copies as the element button, else as the slice button. Not an undo step. **Learning (implementation):** Shift+C already compacts the slice (R5.20).
- **R1c.7** The Markdown panel's editor and preview text is 16px (line height 1.5).
## 1d. Hotkey help

- **R1d.1** A keyboard-icon button just before Global full screen (R1.22) in the board header opens a modal popup listing the hotkeys, grouped by context: Board (undo, redo, delete, search, fit view), Search box, Selected Cell (R5a.11), Selected Scenarios element (R3.14), Selected Notes element (R3.18), Editing a name, Scenario editor (R3.15), Info panel, Fields popup, Screen mockup popup, Scenarios view. It closes with **Close**, Esc or a click outside it. It must list every hotkey of the app; update it whenever one is added or changed.
- **R1d.2** Every control with a hotkey names it in its tooltip, in brackets after the description, e.g. "Undo (Ctrl+Z)", "Add a scenario (A)". The label stays unchanged, except where the hotkey is part of its design (scenario popup chips, R3.15). A new hotkey is not done until its tooltip names it.
- **R1d.3** Tooltips never explain mouse gestures ("double-click to ...", "drag to ...", click or drop hints). An element's tooltip is its **full name** (none when unnamed), so a name cut off by an ellipsis can be read; a slice header's is the slice name, a scenario item's its name (R3.14).

## 1e. Search

- **R1e.1** **Ctrl+F** (Cmd+F) anywhere on the board, also while typing in a board field, or the **magnifier** button (tooltip "Search elements by name (Ctrl+F)") just before the hotkey-help button in the header, opens a **search box** instead of the browser's find; pressed again it focuses the box. Ignored while a popup is open. It is a small box floating at the top centre of the window, above the popups (z-index), not modal: the board stays usable. It is not part of the board's data and not an undo step.
- **R1e.2** The box has a text input and a **×** (tooltip "Close (Esc)"). The list shows every element of all Chapters whose **name** contains the text, case-insensitive: first those whose name **starts with** it, then the others; each group in order of position on the canvas (left to right, then top to bottom); nothing is listed for an empty text, and "No element found" when none matches. Elements without a name (also Scenarios and Notes) are not searched. A linked copy is searched by its original's name.
- **R1e.3** Each result is only the name, on the colour of its element type (R3.1); a linked copy is semi-transparent (75%), as on the board (R3.22). Results keep their full height (16px text) and the list scrolls; the box is at most 560px wide. The first result is highlighted; **↑** / **↓** move the highlight (wrapping), the mouse also moves it.
- **R1e.4** **Enter** or a click on a result **focuses** the element and closes the box: the element and its Cell are selected (R5a.12), its Chapter becomes active (R1a.4), and the view moves to centre it, zooming in to at least 100% (never zooming out). **Esc** or **×** closes the box without changing anything.

## 1f. High level view

- **R1f.1** The **high level view** is read-only, without slice borders and buttons. The **High level view** button (tooltip "High level view: read-only, without slice borders and buttons (Ctrl+H)", pressed while on; just before the magnifier, R1e.1) or **Ctrl+H** (Cmd+H; ignored while typing or while a popup is open) switches it on and off; **Esc** switches it off (ignored while typing or while a popup is open). Not saved, not an undo step; it is off when the board opens.
- **R1f.2** **Hidden** while on: the header's commands (Undo, Redo, Context rename, Add buttons; the title, Context filter, Tasks, High level view, search, hotkey and Global full screen buttons stay), slice borders, backgrounds, headers and titles, the lane type text (R2.10) and the lane buttons (info, **×**, colour, **+**; the lane name stays), the Chapter handle (R1a.3), element toolbars (R1c.1a), the Cell highlight (R5a.12), the Scenarios footer and scenario Copy/Delete buttons, and the Notes colour dots. The Chapter title stays.
- **R1f.3** Element arrows are **dotted** and take the colour of their source's type: Screen grey `#8a8a8a`, Command blue `#6f93b3`, Read Model green `#7aa64f`, Event orange `#e08a3c`, Processor purple `#9b7cc4`. Chapter arrows (R1a.9) are unchanged.
- **R1f.4** **Read-only:** nothing can be added, moved, renamed, connected, deleted or edited, and there is no undo or redo. Panning (including R1.23), zooming, Fit view, Shift+F, search, selecting and the Context filter work. The popups open in view mode only: **V** (Screen mockup, Notes, Scenarios) and the Notes and Scenarios eye buttons; the Info and Screen popups have no edit mode or Save there. The movie strip (R11.1) is not reachable, as the handle is hidden. All other hotkeys are off.
  - Tasks are an exception: their popup stays editable (R12.2).

## 2. Lanes

- **R2.1** Elements sit in horizontal swimlanes stacked top to bottom.
- **R2.2** The default lanes are one each of **Actor**, **Interaction** and **Event** (R2.10), named after their type.
- **R2.3** There is no toolbar button to add lanes; use the buttons in a lane's label zone (R2.3a, R2.10).
- **R2.3a** Every lane has a **+** button and, below it, letter buttons (R2.10) at the bottom of its label zone. **+** adds a lane of the **same type**, named after the type, colour `none`, right below that lane. A letter button adds a lane of that letter's type below the last lane that comes before that type in the order, so the order is kept. Lanes below, with their elements, move down. Tooltips: "Add lane below: <type>".
- **R2.4** Each lane has a reserved 48px label zone at its left edge holding the lane name, the **×** button (top), the colour button (R2.6) under it, and the **+** button (R2.3a) at the bottom. The name is written vertically, bottom to top; if too long it is cut off with an ellipsis and shown in full on hover. Only the info button (R1c.2) is always visible; the **×**, colour and **+** buttons show only while the mouse is over the label zone, or a button in it has the keyboard focus, or the palette is open (R2.6); otherwise the name takes their room, so as much of it shows as possible (the buttons come back on hover, shortening the name). Slices never enter this zone (R5.7).
- **R2.4a** Double-clicking a lane name renames it in a **horizontal** one-line input that floats over the label zone (the zone is too narrow for horizontal text), at the title's vertical middle, 200px wide, all selected; the vertical title stays underneath. Enter, Esc and clicking away save. An empty name is ignored (previous kept).
- **R2.5** **×** removes a lane; lanes below move up. Its elements are deleted with their connections, after confirmation if there are any. A Chapter's last lane of each required type (Actor, Interaction, Event) cannot be removed: it has no **×**.
- **R2.6** A lane has a colour: `none` (default, no tint), `red`, `orange`, `yellow`, `lime`, `green`, `turquoise`, `blue`, `purple`, `pink`, `brown`, `gray`, `white` or `black`. Each is a light, transparent tint, not intrusive; no alternating shading. The colour button under **×** shows the current colour and opens a shared palette in this order (two per row; white/black at bottom). `none` shows a transparent checkerboard without a crossing line. Picking a colour applies it and closes the palette, as does clicking elsewhere. The last lane's button works the same.
- **R2.6a** Every Chapter has a light 2px outline around its whole area, label column included: left and right edges on every lane, top on the first, bottom on the last. The four outer corners have a 4px radius, like the slice headers. Lanes are separated by an even lighter 1px line, the label column by a line in the outline colour. Adding or removing lanes keeps it correct.
- **R2.7** Lanes cannot be dragged, selected or deleted with the keyboard.
- **R2.8** An element sits in exactly one lane of its Chapter: the one it is vertically centred in (R3.6a). Moving between lanes: R5.14.
- **R2.9** A lane is referred to by **id**, never name, so renaming (R2.4a) changes only the displayed name.
- **R2.10** **Lane types.** Every lane has a type, chosen on creation, never changed. It decides which elements the lane takes (R3.2). Types, in the fixed top-to-bottom order lanes always keep, with their letter button:

  | Type | Letter | Takes |
  |------|--------|-------|
  | Actor | A | Screen, Processor |
  | Interaction | I | Command, Read Model |
  | Event | E | Event |
  | Integration | 🔗 | Event, Read Model (external integrations) |
  | Spec | S | Scenarios, Notes (at most **one element per Cell**, left aligned, R3.21) |

  Several lanes of one type are allowed. The type is shown as small faint uppercase text in the upper part of the lane's first Cell (first slice), centred horizontally; elements are drawn above it. Each lane offers the letter button of the next type in the list (Actor: I; Interaction: E; Event: 🔗 and S, as Integration is optional; Integration: S); a Spec lane has none. A Chapter always has at least one Actor, Interaction and Event lane (R2.5, R7.4).

**Learning (implementation).** Lanes and slices are translucent and overlap. A later-added lane was drawn above the slices and looked lighter than older lanes until a reload reordered the items. Items are drawn in list order (a child's z-index cannot go below its parent's), so lanes are kept before slices and elements in the list.

## 3. Elements

An element is a sticky note with an id (R1.14), a type, a name and a position. It sits in exactly one Cell (one lane and slice of one Chapter, R2.8, R5.13) and cannot exist outside one.

- **R3.1** Element types:

  | Type | Colour |
  | ------ | -------- |
  | Screen | light grey |
  | Command | blue |
  | Read Model | green |
  | Event | orange |
  | Processor | lavender icon (R3.6a1), selected icon on its toolbar button |
  | Scenarios | blue, a card instead of a sticky (R3.11) |
  | Notes | white card (yellow menu swatch), a card instead of a sticky (R3.18); hidden in the minimap (R1.2) |

- **R3.2** An element has no default lane: it goes in the lane of the Cell it is added to (R3.3), only if that lane's type takes it (R2.10); otherwise nothing is added. An element can be dragged freely but always ends up inside a Cell (R5.14).
- **R3.3** Add elements through the Cell menu (R5a.13) or Cell hotkeys (R5a.11), using R5a.10 placement. No drag-from-header creation.
- **R3.4** The body cannot be edited and ignores double-click. It shows the Screen mockup (R3.7 to R3.10) or the element's fields (R9.5). An element has no `text` field.
- **R3.4a** Double-clicking the header edits the name (R3.6b); Enter, Esc and clicking away save. One line. The editor looks like the name (same place and font, thin outline only), so the element does not resize or move while editing. Hovering an editable element title or Processor title uses the arrow cursor. Linked-copy titles are not editable.
- **R3.5** Selected elements can be deleted with Backspace or Delete.
- **R3.6** Only Processor carries an icon. Its toolbar button opens an anchored dropdown, like lane colours, with named choices: `gear` (default), `envelope`, `chat`, `bell`, `phone`, `clock`, `calendar`, `credit-card`, `file`, `pdf`, `table`, `printer`, `refresh`, `diamonds`, `cloud`, `bolt`, `truck`. Selecting an icon stores its name immediately in one undo step and closes the dropdown. No Save/Cancel or modal backdrop. Esc, clicking outside or toggling the button closes it without changes. The type is shown by header colour (R3.1), not a label.
- **R3.6a1** A Processor is no sticky: no box, header bar, border or shadow. It shows its name centred above the selected lavender icon (88px; `gear` has 8 teeth, centre hole and thin dark outline), 160px wide and 114px tall. The name edits as R3.4a. Its top connection points sit on the icon's top, not above the name. It has no body or fields (R9.1); R3.6b applies to the other types.
- **R3.6a** Elements are always vertically centred in their lane: when added, dropped or dragged (snapping to the centre of the lane released in), when their size changes (e.g. showing a Screen mockup), and on load or import. One taller than its lane aligns to the lane's top edge.
- **R3.6b** Every element has a header bar and a body. The header holds the free-text **name** in semi-bold (600), filled with the type's colour (R3.1). The name has **no default**: a new element shows a faint "Name" placeholder (not saved or exported). A long name is cut off with an ellipsis. While edited, the name's input has a white background. The body is white and empty, except the Screen mockup and its editor and the fields (R9.5). The Screen colour is a slightly darker grey (`#e2e2e2`) so its header stands out. Backgrounds are opaque. The body is at least 104px high, so an element is at least 132px tall with its 26px header, growing with its content. A **Screen** is at least **146px** tall (118px body), whether or not it has a mockup, so all Screens match one with a mockup (R3.8). **Command**, **Read Model** and **Event** are exactly **146px** tall (as a Screen), no more, no less: see R3.6c.
- **R3.6c** The fields of a Command, Read Model or Event (R9.5) scroll vertically in the body when they do not fit. The mouse wheel over the body zooms the board (R1.2), as everywhere; it scrolls the fields only while the element is **selected** (clicked) and its fields overflow. Other types are unchanged (R3.6b).
- **R3.25** **Read Model list.** A Read Model's toolbar has an **Is list** toggle with a drawn `[]` icon centred horizontally and vertically, filled when on. Default `false`. Tooltip: "Defines whether the ReadModel is a list element. Primarily serves as a hint for code generation." Toggling takes one undo step. Linked copies use their original's setting and cannot edit it (R3.22). When on, the title ends with `[]`, after any ellipsis. Fields still describe one item (R9.9).

### Screen elements

- **R3.7** Screen mockups use the unified editor (R3.7a). Toolbar **`</>`** and **E** open Content with source visible for original or linked-copy Screens (same key conditions as V; E no longer adds an Event). Tooltip: "Edit Screen content (E)" for originals, "View Screen content (E)" for copies. Copy source/URL stays read-only; highlight editing follows R3.7b.
  - Content: HTML editor with URL above it; live sandboxed preview (R3.9). Non-blank URL wins, disables/greys code editor and keeps draft HTML until Save; clearing URL re-enables code. Saving URL clears HTML; blank HTML without URL removes mockup.
  - Only `http://` and `https://` URLs accepted. Invalid URL refuses Save, opens Content and focuses red URL field.
  - URL preview has **Open ↗** (new tab) and hint "Blank page or an error? The site may not allow being shown in a frame." with another new-tab link. Frame refusal (X-Frame-Options/CSP) cannot be detected; browser error stays in frame.
  - Title's eye/pencil toggles edit/view mode; view hides editors and expands preview. Top-right **Full screen** / **Restore the size** (Alt+Enter, even while typing) maximizes/restores popup; not remembered.
  - Toolbar eye (tooltip "View (V)", disabled without HTML/URL) and **V** open preview-only mode. V requires one Screen with HTML/URL; ignored while typing, with modifiers or popup open. Linked copies share original content but own highlights (R3.22).
  - **Beautify:** format HTML/CSS when Content is first shown (also on opening preview-only): 2 spaces, one tag/CSS declaration per line, blank line after CSS blocks, text-level tags stay in text, no wrapping (`model/beautify.js`, no library). Save stores formatted draft even if unedited; Info-only editing leaves unseen HTML unchanged. Server compacts on push (SERVER.md S3.10).
  - HTML paste strips `<script>` tags and code; typed scripts unchanged.
- **R3.7a** **Screen editor.** One modal (R1.17), titled "Screen" plus name; same size as R1c.3. Header order: title, eye/pencil, **Content** / **Sketch** / **Info** / **Fields** tabs, maximize. Tabs choose left editor; right Screen preview stays visible on all tabs. Info reuses Markdown tools and editor-local undo from R1c.3. Fields reuses R9.3 validation, nested rows, parent copying and R9.4 propagation; scrolls independently, horizontally when needed. Fields button/F still opens separate popup (R9.2).
  - Opening an original Screen's edit dialog selects **Sketch** when it has no URL and its SVG root id is `em-screen-sketch`, even if unsupported; the Sketch tab shows its error. Copies do not auto-select Sketch.
  - **i** / **I** open Info (R1c.1a). Switching tabs preserves drafts, cursor positions, scroll and editor undo. Focused tabs support Left/Right/Home/End.
  - Shared Save / Ctrl+S (Cmd+S) commits content, info, fields and propagation in one board undo step; Cancel / Esc / backdrop discards all drafts. Invalid fields refuse Save and open Fields in edit mode. Blank info is removed (R1c.3).
  - Keep `html`/`url`, `info`, `fields` and `highlights` separate in storage. Overview stays preview-only, without Save. Copies open Content via R3.7 with shared HTML/URL read-only and may edit/save only highlights; Info and Fields editing are unavailable. Eye/V still opens preview; copy's header toggle can show source, including URL mockups.
  - Disabled or read-only HTML editor has grey background (`#f1f2f6`).
- **R3.7c** **Sketch editor.** Originals only; fixed 1024x768 canvas, scaled to fit, top-aligned and horizontally centred. Drag to draw rectangles or straight lines; click to add single-line text. Select, move, resize and delete shapes. Delete/Backspace deletes only while canvas has focus; text inputs keep normal editing keys.
  - Canvas focus never adds an outline, including keyboard and programmatic focus; shape selection outlines stay visible.
  - Selection/Rectangle/Line/Table/Text tools use 16px pointer/outlined-square/diagonal-line/grid/"A" SVG icons, with tooltips and accessible names. Tables draw behind other shapes; text draws above all others. Keep order within each layer. Selection outline never blocks text selection.
  - Selection tool: drag from empty canvas to select shapes whose bounds are fully inside the box. Click an ungrouped shape to select only it; drag any selected shape to move the selection together. Clamp group movement at canvas edges, preserving relative positions. Delete button/Delete/Backspace removes the selection; corner resize and property editing require one selected shape.
  - Hold Ctrl when starting a drag on selected shapes to clone the selection. Move/select clones; originals stay fixed. Preserve shape properties and group membership with fresh shape/group ids. Use normal movement bounds. Click without movement creates nothing; cancelled drag discards clones. Resize handles and table dividers keep their normal behavior. Clone drag takes one undo step.
  - Toolbar **Copy selected shapes** uses a 16px overlapping-squares icon, tooltip and accessible name. Clone as above, offset 20px right/down with normal movement bounds; select copies and activate Selection tool. Disable with no selection or during gestures. Copy takes one undo step.
  - **Group** combines selected shapes; **Ungroup** restores their individual selection. Clicking or marquee-selecting any group member selects the whole group. Groups move and delete as a unit, do not resize together, and must be ungrouped before editing a member. Groups may be combined but not nested. Group and Ungroup each take one undo step.
  - A group occupies the layer position of its first member; members keep layer order. Save groups as SVG `<g id="em-sketch-group-<positive integer>" class="em-sketch-group">` containing at least two shapes. Reopen restores membership; unsupported groups still refuse partial import.
  - Lines: solid 2px stroke, editable color, no arrowheads; at least 4px long. Horizontal, vertical and diagonal supported. Drag either endpoint to resize/change direction; opposite endpoint stays fixed. Marquee selection uses the full line bounds. Lines share group movement, deletion and history; SVG uses `line` with `x1`, `y1`, `x2`, `y2`, `stroke`, `stroke-width`. Wider invisible hit target is editor-only.
  - Tables: click to insert 360x180px, 3 equal columns and 3 equal rows (1 header, 2 body). White body, `#e5e7eb` header, `#1f2937` 2px grid. Corner handles resize whole table; selected table's dividers resize adjacent columns without changing total width. Minimum column width 24px, table height 60px.
  - Selected table: **Add column** appends right, keeping total width and shrinking existing widths proportionally; new column gets `1 / new count` of width. Refuse with notice if any column would fall below 24px. Rows stay fixed; whole-table resize preserves column ratios.
  - Place independent text, rectangles or lines over cells; no attachment, nesting, scaling or cascading deletion. Tables share selection, movement, deletion and history. Store table as SVG `g.em-sketch-table` with shape id and plain rect/line children; derive column widths from grid lines on reopen. No separate table metadata.
  - Properties share tools row, aligned right; never wrap below tools. Narrow rows scroll horizontally.
  - Edit text in place, never in toolbar: double-click existing text; new text starts editing immediately. Enter or blur finishes; Delete/Backspace edits characters while typing. Inline editor uses shape font size and stays out of stored SVG.
    - **Learning (implementation):** pointer capture retargets double-clicks to canvas; locate text by canvas coordinates.
  - Delete uses a trash-bin icon; hide selection count. Undo/Redo use icons, disabled when unavailable; tooltips name hotkeys.
  - Keep last 5 sketch operations per open editor: add, move, resize, delete, color or text edit. One drag/group action is one step; group typing until blur. Selection and no-op edits add no steps; new edits clear redo.
  - Sketch tab: Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes, including while editing sketch text. Other tabs keep their own history. Preserve sketch history across tab switches; reset after external Content/URL edits, not formatting. History stays local, never saved.
  - Fill, border, line and text color reuse R2.6 picker and exact colors; no arbitrary color input. Fill/text allow `none`; border/line omit it. Store colors as hex or `none`; existing colors and borderless SVG stay unchanged until edited. Palettes escape toolbar clipping. Rectangle border is 2px. Text uses sans-serif; resizing scales font, at least 8px. Shapes stay inside canvas; rectangle sides and text width are at least 4px.
  - Store sketch as SVG in `html`, replacing all prior HTML/URL only after confirmation. Switching tabs alone never changes content. Existing sketches reopen for editing; unsupported HTML/SVG shows a notice, never partial import.
  - SVG root id `em-screen-sketch`, shape ids `em-sketch-<positive integer>`; geometry, colors, text and group membership use SVG elements/attributes/content, not `data-*` or separate model data. Formatting and server compaction preserve editability. Content edits update Sketch or show unsupported-content notice.
  - Sketch gestures stay local until release; shared Save/Cancel and highlight clearing follow R3.7a/R3.7b. Selection outlines and handles never enter stored HTML.
- **R3.8** Mockup (HTML or URL) is optional; Screen body shows an iframe or nothing. Layout viewport stays 1024x768px; body stays 118px high.
  - Board/timeline and movie-strip HTML previews always fit visible content, centred, with uniform scale and 8px source-space clearance. No toggle; source HTML/model/layout unchanged. Frame size stays fixed; differing aspect ratios may leave space.
  - Bounds include visible text, controls, images and painted panels; ignore hidden content and viewport-sized background-only wrappers (at least 95% viewport width/height). Respect clipping and viewport limits. Refresh after content, font, image and size changes.
  - Empty HTML keeps full-page view. Measurement failure shows a warning and full-page view.
  - URLs keep full-page width scaling, without fitting/cropping; bottom 3px of 768px viewport may be cut off. Editor's large preview stays unchanged.
- **R3.7b** **HTML highlights.** Content preview has **Highlight elements** toggle, selected count and **Clear highlights**. HTML only; disabled for URL previews, hidden in overview and Info tab. Original's preview-only mode hides tools; copies expose them to enter highlight editing.
  - While picking, hover outlines element with thin dashed red border; clicks never activate controls/links. Selected elements get solid `2px` outlines, offset `2px`, without changing layout.
  - Each highlighted HTML element owns a colour. Reuse lane colour picker and exact colours (R2.6); default brush `red`. Choosing colour enables picking; click adds or recolours, same colour toggles off. `none` removes.
  - HTML source stays plain: no selection borders, marks or colour overlays. Other preview elements stay unchanged: never blur, hide or dim. Nested selections are allowed.
  - Save stores `highlights` on each Screen, never in shared HTML. New linked copies start empty; editing one Screen's highlights never changes another's. Board, editor and movie strip render that Screen's selections. Cancel discards draft changes; Clear empties only its selection.
  - Store `[{ path, color }]`, e.g. `{ path: "body/form[1]/input[2]", color: "blue" }`; unique paths, same-tag sibling indices, lane colours except `none`. Omit empty lists. Paths target authored body elements in shared HTML, not URL content.
  - Changing parsed HTML element structure or ids clears old highlights on original and all copies, across Contexts, with a notice. Draft structure edits clear draft selections; users may select new targets before Save. Formatting, text and other attribute edits preserve selections.
  - Source edits rebuild element/range mapping; stale preview picks show an error. Scroll preview back after picking reloads it. Temporary source markers and hover overlay never enter saved HTML.
  - **Learning (implementation):** shared `server/html-highlights.js` uses `parse5` paths/source locations. Inject colour classes/CSS only for rendering; import old embedded markers as original's selections, never copies'. Ignore compactor-dropped tags in structure checks. Lanes and highlights reuse `ColorPicker`; shared palette names/RGB live in `server/lane-colors.js`.
- **R3.9** Editor's ordinary **HTML** preview has no sandbox permissions. Board/timeline measurement (R3.8) and active highlight picking (R3.7b) grant `allow-same-origin` for DOM inspection; scripts/forms remain blocked. Leaving picking reloads permissionless editor preview. **URL** preview permits `allow-scripts allow-same-origin`; enter only trusted addresses. Movie-strip HTML follows R11.4, never gaining same-origin access.
- **R3.10** The preview never captures the mouse (also when its element is selected), so the element can always be dragged, selected and connected, and nothing in it scrolls. The mockup is viewed in full in the Screen mockup popup (R3.7).
- **R3.10a** **Hover zoom.** A Screen with a mockup (HTML or URL, also a linked copy of one) grows to **2.5x** in all directions around its **centre** (also upward) while the mouse has been over it for **300ms** (not before; the pointer pressed, e.g. to select or drag, shrinks it and it grows again 300ms after release) and **hides its header**, so only the mockup shows, filling the element; it returns to its size when the mouse leaves (0.15s transition). Hovering its toolbar never triggers growth. It is only drawn bigger: its size, position, the layout, the board size and the arrows' end points do not change. It is drawn above all other elements and their toolbars while grown, also above the selected Cell's border (R5a.12). **A linked Screen copy is fully opaque while grown. The selected Screen's element toolbar is hidden while grown.** It does not grow while dragged. Applies in all modes, also in the high level view (R1f) and while editing. **Learning (implementation):** React Flow measures a handle from its screen position. A handle inside the scaled element was measured scaled (e.g. on a resize while shrinking) and the arrows ended at wrong points. The handles are therefore siblings of the scaled element, never inside it. The toolbar is a sibling too: React portal pointer events bubble through the React tree.

- **R3.10b** **Hover zoom toggle.** A magnifier-plus button in bottom-left zoom controls enables/disables R3.10a. Off by default; remembered in this browser, not model data or an undo step. Pressed state shows when enabled; tooltip is "Enable Screen hover zoom" or "Disable Screen hover zoom". Disabling cancels pending growth and shrinks grown Screens. Applies to all Screens, including linked copies and high level view.

### Scenarios elements

- **R3.11** A **Scenarios** element is a 280x200px card (280 is the minimum width, R3.20; fixed height; not hand-resizable) with no header bar, name or connection points (R3.6b does not apply). It shows a "SCENARIOS" caption with an **eye** button (tooltip "View (V)", as on Notes, R3.18; opens the scenarios view, R3.23, as does the key **V** while the element is selected, ignored while typing, with modifiers or while a popup is open), the list of its scenarios and a footer with **+ Add** (white, with the standard button border and text) and the scenario count. The eye and **+ Add** buttons show only while the card is hovered or has keyboard focus. No Storyline button. A new element has none (the list says "No scenarios yet"). The list scrolls when longer than the card, with its scrollbar only: the mouse wheel zooms the board (R1.2).
- **R3.12** Otherwise it is an element like the others: added through R3.3, including the **S** hotkey in a Spec lane (R5a.11), kept in a Cell (R3.2), vertically centred (R3.6a), movable and deletable (R3.5), exported (section 6). It cannot be connected (R4.7). Its margin to the slice borders is 20px, not 40px (R5.16); adding it widens the slice as needed (R5a.10).
- **R3.13** A **scenario** is a Given/When/Then (GWT) example with an id (R1.14), a name, a description, and:
  - **Given:** any number of Events that have happened;
  - **When:** at most one Command that is executed;
  - **Then:** any number of resulting Events, or one expected **error** text (not both).

  Events and Commands are chosen from the board and referred to by id, so renaming shows everywhere. Only elements of the Chapter holding the Scenarios element can be chosen. Each chosen element carries its own **example data** (R3.16). A scenario has no Context and is not numbered.
- **R3.14** Each scenario is one item in the card's list: its name (a long name is cut off with an ellipsis, the tooltip shows it whole), a **copy** and a **×** (delete) icon. The copy and delete icons show only while their scenario item is hovered or has keyboard focus; removing them from the layout lets the title expand. Items with an expected error (Then Error) are red. Dropping an item on another reorders the list. **+ Add** opens the popup (R3.15) for a new scenario, created only on Save; so does hotkey **A** while exactly one element is selected and it is a Scenarios element (ignored while typing, with modifiers or while a popup is open). Copy inserts an identical scenario (new id) right after the original. × deletes it after confirmation. Double-clicking an item opens its popup, as does **1** ... **9** for the first ... ninth scenario while the Scenarios element is the only selected element (ignored while typing, with modifiers or while a popup is open; nothing when there is no such scenario). Dragging an item does not move the element. Hovering a scenario title uses the arrow cursor.
- **R3.15** **Scenario popup.** A modal (90% of the window width, at most 1600px; 92% of its height, at most 1000px) with a form on the left and the example data tree on the right, opened as in R3.14. The form has the **Name** (mandatory: **Save** is refused and the field border turns red while it is empty or only spaces) and **Description** fields; chips **Given (G)**, **When (W)**, **Then (T)**, **Then Error (E)**; the chosen elements as cards (side by side in a row that wraps for Given and Then; header in the element's colour with its name and a × to remove it; body with its example data as `name: value` lines (R3.16)); and **Save** and **Cancel** (in this order; Cancel closes without saving, like **×** and Esc). Text is 14–20px (card header and body 14px, inputs 18px) for legibility at high resolutions.
  - A chip, its hotkey (when not typing in a field) or the **▾** next to it (shown once the section has elements) opens a list of the Chapter's Events (Given, Then) or Commands (When) in slice order, each a box in the element's colour (as in the search box, R1e) with its name and slice name. The list has a focused filter field (matches name or slice name, case-insensitive); ↑ / ↓ and Enter choose. Given and Then can take the same Event more than once, each time as its own card with its own example data; choosing for When replaces the Command. Esc or a click elsewhere closes the list.
  - **Then** is disabled while an error is set, **Then Error** while Then has Events. **Then Error** shows a field "In case you expect an error" with a × to remove it.
  - Clicking a card selects it and shows its example data on the right (R3.16). The arrow keys select too (ignored while typing in a field, while a list is open and with modifiers): **←** / **→** the previous / next card in Given or Then, **↑** / **↓** the card in the section above / below (Given, When, Then; empty sections skipped), at the same position or the last one. With no card selected, any arrow selects the first card (first Given, else When, else Then). No wrap-around at the edges. The selected card scrolls into view.
  - Top-left navigation shows one small outlined square per scenario in the same Scenarios card, in list order; current square is blue and receives focus on open and after switching. Each square's tooltip names its scenario and hotkey for the first nine: **Ctrl+1** ... **Ctrl+9** (Cmd on Mac). Hotkeys switch also while typing; Alt/Shift combinations are ignored, absent targets do nothing. Switching keeps drafts. A new scenario has its own square until saved.
  - **Save** (tooltip "Save (Ctrl+S)"; also **Ctrl+S** / Cmd+S, also while typing in a field) validates all edited drafts, applies them in one undo step (R8.1) and closes the popup. Empty names or invalid example data (R3.16) block all saves and show the affected scenario and field/card. **Cancel** (tooltip "Cancel (Esc)"), **×** (top right), Esc and backdrop close discard all drafts.
- **R3.16** **Example data** of a chosen element is a tree edited in the popup's right pane, built from the element's fields (R9) and keyed by field name. Names and types are fixed; the user fills the values:
  - `boolean`: a checkbox; every other primitive (including `date`, `datetime`, numbers): a text input;
  - `object`: its fields, nested;
  - a list: any number of items (**+ Item**, **×** per item), each a value or an object tree.
  
  An element **without fields** has free entries instead: name and text, added with **+ Entry**, removed with **×**; an entry with a value needs a name and names are unique (Save is refused otherwise). The tree follows the element's current fields: values of fields that no longer exist are dropped on Save, new fields start empty (empty text, unchecked, empty list). Card lines (R3.15): nested fields indented, list items numbered; empty text, `false` and empty lists are left out.
- **R3.17** When an Event or Command used by a scenario is deleted or leaves the Scenarios element's Chapter, the **whole scenario** is deleted in the same undo step and a notification names it. The notification closes by click or after 8 seconds.

### Notes elements

- **R3.18** A **Notes** element is a card the size of a Scenarios element (280x200px: 280 is the minimum width, R3.20; fixed height; not hand-resizable) with no name, header bar or connection points (R3.6b does not apply). It shows a "NOTES" caption with an **eye** button named **View** (tooltip "View (V)"; opens the Markdown panel in read mode, R1c.3; also the keys **V** and **R** while the element is selected, ignored while typing, with modifiers or while a popup is open). The eye shows only while the card is hovered or the element is selected. Below the caption is the **Markdown text rendered** (as in the info panel, R1c.4); with no text, a faint "No notes yet". Overflowing text scrolls vertically inside the card (never horizontally), with its scrollbar only: the mouse wheel zooms the board, also over the text (R1.2). Links open in a new tab.
- **R3.19** The text is edited in the Markdown editor of the info panel (R1c.3), titled "Notes". It opens with a **double-click** on the card, or **Enter** or **E** while the element is selected (R5a.11). Saving empty text leaves the element empty. It is added through R3.3, including hotkey **N**, only in a Spec lane (R2.10). It cannot be connected (R4.7).
- **R3.20** **Stretching.** The width of a Scenarios or Notes element (280px) is its **minimum**. As the **only element in its Cell** it stretches to fill the slice: slice width minus the two 20px margins (R5.16), between 280px and **560px maximum**, at the left margin (R3.21). With other elements in the Cell it keeps 280px. It follows when the slice is resized, compacted or moved, or when elements join or leave the Cell. Layout (slice minimum width, free spots, compaction) counts it as 280px wide, so a slice holding one is never narrower than 320px. The stretched width is not stored: the export holds only `x` (R6.5), the left margin when stretched.
- **R3.21** **Spec lane Cells.** A Cell of a Spec lane (R2.10) holds **at most one element**: adding a second adds nothing; dragging an element into an occupied Spec Cell returns it to its drag start (R5.14). Creation menu entries follow R5a.13. Spec lane elements are **left aligned**: a new one goes at the left margin (R5a.10, not centred); compaction (R5.20) left-aligns all elements, not only these.
- **R3.22** **Linked copies.**
  - Copy: the copy button (tooltip "Copy (Ctrl+C)") at the left of an element's toolbar, or **Ctrl+C** with exactly one element selected, remembers it. Scenarios and Notes cannot be copied; the memory is browser-only, lost on reload, kept until the next copy.
  - Paste: **Ctrl+V** pastes a **linked copy** of the remembered element into the selected Cell, in any Chapter, under the adding rules (R5a.10: the lane type must take it) with the automatic arrows (R4.8); repeatable.
  - Each selected copy highlights its original with a 4px solid orange (`#ff9800`) outline, a 3px offset and a soft orange halo. The highlight remains while any linked copy of that original is selected.
  - The copy shows its original's type and content (name, Screen mockup, fields) **live**: no name, info, mockup or fields edit (no **I**, no **Enter**). Screen highlights are independent (R3.7b). Screen copies have Content (**`</>`** / **E**) and preview (**eye** / **V**) entry points (R3.7); shared code stays read-only. Eye is disabled without original's mockup. Highlight editing uses Save / Ctrl+S (R3.7a). Every copy's toolbar also has Copy Context (R1c.6); other copies have only that. It gets no fields from arrows (R9.4), but its original's fields pass on along its arrows. Its link button (tooltip "Go to original element (G)"), and the key **G** while it is the only selected element (ignored while typing, with modifiers or while a popup is open), select the original (and its Cell, as the search does, R1e) and move the viewport to it, keeping the zoom.
  - Unlike other elements (R3.6b) it has a dashed outline and is semi-transparent (75% opacity). It can be moved, connected (R4.7) and deleted; scenarios do not offer it (R3.13).
  - Copying a copy remembers its original, so copies never chain.
  - Deleting an original deletes all its copies in the same undo step, asking first when copies exist (also when a slice, lane, Chapter or Cell holding the original is deleted).
  - The export holds the original's id in `copyOf` (R6.5).

- **R3.23** **Scenarios view.** The eye button (R3.11) opens a read-only modal on a white background (R1.17; **Close**, Esc and a click outside close it; **V** opens it, see R3.11), titled "Scenarios". It lists every scenario of the element in list order, each as its **name** and a row of three boxes joined by arrows: **GIVEN** → **WHEN** → **THEN**. A box has a header and a body:
  - the body holds the chosen elements as pills carrying their names, in the colour of their type (Events orange, Commands blue); an empty section shows "—" and a grey header;
  - the header of a section with elements is tinted in that colour (Given and Then: Event, When: Command); a Then with an expected error shows the error text in red and a red header;
  - example data is not shown.

- **R3.24** **Notes colour.** A Notes element is white by default, or `red`, `green` or `yellow` (pastel card, header and body). Three dots (white, red, green, yellow; 12px circles, right end of the header, `nodrag`) show only while the pointer is over the element or keyboard focus is inside it; the current colour has an outline. Clicking one sets it (one undo step, R8.1; double-click does not open the editor). Stored as `color` (R6.5). Not for other elements; linked copies cannot copy Notes (R3.22).

## 4. Connections

- **R4.1** Elements are connected with directed arrows (with arrowhead), 3px thick.
- **R4.2** Each connectable element has **top** and **bottom** points; Processors also have **left** and **right** points at the icon's side centres. Each point can start or end a connection. When the target is below the source (also in another slice or Chapter; equal height counts as below), the arrow leaves the source's **lower** point and enters the target's **upper** point; when above, it leaves the source's top point and enters the target's bottom point. For each Processor endpoint, use left/right whenever the other element's centre x differs from its own; use top/bottom only when centre x matches. Compare board coordinates, including Chapter offsets. Other endpoint follows normal rules. Recompute on movement; points follow elements.
- **R4.3** The user connects by dragging from a connection point of one element to one of another; R4.2, not the drag's start, decides which points the arrow uses.
- **R4.4** Selected connections can be deleted with Backspace or Delete.
- **R4.5** Two elements are connected at most once (A to B cannot be made twice). A connection is identified by source and target and has no id (R1.16).
- **R4.6** An element cannot be connected to itself. Elements can be connected across slices and Chapters.
- **R4.7** Element connections follow the flow of the model. The arrow always points:
  - Screen → Command
  - Processor → Command
  - Command → Event
  - Event → Read Model
  - Event → Processor
  - Read Model → Screen
  - Read Model → Processor

  Dragging such a pair the wrong way (e.g. Command to Screen) creates the connection in the right direction (Screen → Command). Any other pair, including two elements of one type, is refused. Event → Processor is made only by dragging on the board (never automatic, R4.8; the server refuses it, S4.18). Scenarios (R3.11) and Notes (R3.18) elements are in no pair, so cannot be connected. The rules apply to new connections only: existing ones, imported or saved, are not checked, except that import refuses an arrow to or from a Scenarios or Notes element (R7).
- **R4.8** **Automatic arrows.** An added element (R3.3) gets these arrows (R4.7) at once, within the same slice. "Above" and "under" mean another lane; the nearest such element is used. An already connected pair is not connected again. Moving an element creates no arrows.
  - A Command under a Screen: Screen → Command.
  - An Event under a Command: Command → Event.
  - A Screen above a Read Model: Read Model → Screen.
  - A Read Model under a Screen: Read Model → Screen.
  - A Read Model when the slice just before its own has an Event: Event → Read Model. With several Events, the right-most (nearest by height on a tie).
  - A Command in a slice with a Processor: Processor → Command, the nearest by height (above or under).
  - A Processor with a Read Model in its slice: Read Model → Processor, the nearest by height (above or under). Event → Processor is never automatic.

  Every matching rule creates its arrow. The element and its arrows are one undo step (R8.1). The server adds the same arrows (S4.16).

- **R4.9** An element-to-element arrow gets focus only after 100ms of continuous hover; leaving sooner cancels it. The focused arrow and its endpoints stay fully visible; unrelated sticky elements and other arrows wholly within its source Chapter fade to 20% opacity. Other Chapters and cross-Chapter arrows stay unchanged. Pointer leave clears the focus. Chapter and slice arrows do not trigger this effect.

## 5. Slices

A slice is a vertical band across all lanes that groups the elements of one piece of behaviour.

- **R5.1** Each slice has an id (R1.14), a name and a width, and sits in the Chapter above the lanes.
- **R5.2** No **+ Slice** button in the main header; add slices through R5.2a or R5a.13.
- **R5.2a** Every slice has a **+** button at the right end of its header (shown on mouse-over, R5.22). It adds a 220px "New Slice" right after that slice; later slices and their elements move right (R5.7, R5.15). The new slice's top Cell is selected (R5a.5). The button neither starts a Chapter drag nor triggers renaming. The **×** delete button follows it (R5.4).
- **R5.3** Double-clicking a slice header renames it; an empty name is ignored (previous kept), as for lanes (R2.4a).
- **R5.4** A slice cannot be selected, only its Cells (section 5a). A plain click on a slice header (not a drag, nor on its buttons or while renaming) selects its **top Cell** (R5a.5). A slice is deleted with the **×** in its header (R5.11, R5.18, R5.19), or **Shift+Delete** / **Shift+Backspace** while one of its Cells is selected, after confirmation (R5a.11).
- **R5.5** A slice's height always covers all lanes, also after lane add/remove.
- **R5.6** Only the slice header captures the mouse, so elements underneath stay usable.
- **R5.7** Slices form one contiguous run, laid out automatically: the first starts right after the label zone (R2.4), each next where the previous ends; no gaps or overlaps. A slice has only a dashed right border, separating it from the next (the last slice has none: the Chapter outline is there), and no left, top or bottom border. The border does not cover the header. The header band is semi-transparent (60% opacity), so it is not intrusive.
- **R5.8** Slices have no left resize handle. Their order changes by dragging the **grip** (six dots, tooltip "Move the slice"), the last button at the very right of the slice header (shown on mouse-over, R5.22), sideways, or with **Ctrl+←** / **Ctrl+→** (R5a.11); elements move with their slice (R5.15). The drag works within the slice's own Chapter and is live: the header follows the pointer horizontally and the other slices, with their elements, shift as it passes their centres; on release the slice and its elements settle in the new place. A press on the grip that does not move does nothing. The whole drag is one undo step (R8.4). Dragging the rest of the header moves the Chapter (R1.10). New slices use R5.2a or R5a.13.
- **R5.9** A slice is resized by dragging its right edge, minimum 120px, or with **Shift+→** / **Shift+←** while one of its Cells is selected (R5a.11). There are no resize buttons.
- **R5.10** Resizing moves all following slices along; preceding ones stay.
- **R5.11** Deleting a slice closes the gap: following slices move left; the next becomes first if the first was deleted. The top Cell of the previous slice is then selected (R5a.5, R5a.12); with no previous slice, the top Cell of the slice that became first.
- **R5.21** **Flow end.** A **Flow end** button in the slice header (after Copy Context, R1c.6, before +, an 18px square, R1.3a, vertical bar icon) marks the slice as the end of a flow; pressing it again removes the mark. A Flow end slice has a **red** right border (same dashed 2px line as other slices'), also when it is its Chapter's last slice, and its button looks pressed. The mark is part of the slice: saved, exported and imported (R6.4); changing it is an undo step (R8.1). Tooltip: "Flow end: mark this slice as the end of a flow, e.g. to separate use cases in one Chapter without a new Chapter (Shift+E)" ("Flow end: remove the mark (Shift+E)" when set). **Shift+E** with one of the slice's Cells selected toggles the mark too (R5a.11).
- **R5.12** Saved boards and imported files are laid out the same way on load: slices packed in stored order (the file's `slices` list), elements moving with them. A saved board failing the R7.4 checks is unreadable (R1.6).

### Elements and slices

- **R5.13** An element sits entirely inside exactly one slice of its Chapter: never across two, never outside every slice. The slice is part of the element's data: the export lists the element under it (R6.4); nothing is guessed from coordinates. Being fully inside, it is also the slice containing its centre.
- **R5.14** Where an element ends up when added, dropped or dragged is decided by the Cell (lane and slice) under its **centre** on release:
  - **Over a Cell of the same Chapter:** it moves into that Cell: its slice and lane, centred in it (R3.6a). Horizontally it stays fully inside the slice, at least 40px from the borders (20px for Scenarios; the slice grows if needed, R5.17).
  - **Over a Cell of another Chapter:** R1a.5.
  - **Over no Cell** (outside every Chapter, over a label zone, above the slices, beyond the last slice, below the last lane) **or over a Cell whose lane type does not take it** (R2.10): it returns to its drag-start position, in its own slice and lane.
- **R5.15** Elements move with their slice: when a slice is resized, following slices shift with their elements, keeping each element's position relative to its slice. Elements of the resized slice stay put.
- **R5.16** A slice cannot be narrower than its elements plus a 40px margin to the borders on the left and right (20px for a Scenarios element, R3.12).
- **R5.17** An element wider than its slice is moved inside, and the slice grows to fit it plus the 40px margin if needed.
- **R5.18** Deleting a slice always deletes its elements and their connections, and closes the gap. If it holds elements, the user confirms first.
- **R5.19** A Chapter always has at least one slice, as elements only exist in slices. Its last slice cannot be deleted: its header has no **×**. Other selected items are deleted as usual.
- **R5.20** **Compact.** The **↔** button in the Chapter handle compacts its slices. A slice with elements gets the width of its content, rounded up to the 20px grid, minimum 120px, plus the margins (R5.16) on both sides. Compaction does **not centre** elements; it **left-aligns** them, then applies the padding rules:
  - If **every Cell of the slice holds at most one element**, each element starts at the left margin and the content width is that of the widest element.
  - If **any Cell holds several**, the elements keep their relative positions and lanes and move together so the left-most starts at the left margin; the content width runs from the left edge of the left-most element to the right edge of the right-most. So the right padding is at least the margin too (40px; 20px next to a Scenarios element).
  - A slice without elements gets 220px.
  - An **automation or translation** slice with exactly one Read Model, one Command and one Processor, none in an Integration lane (R2.10), and at least one Event, is laid out by R5.20a instead of the two rules above.

  Following slices move left to close gaps (R5.7, R5.15), so the Chapter shrinks or grows. Nothing else changes; one undo step (R8.1). **Shift+C** with a Cell selected compacts only that Cell's slice the same way (R5a.11); slices after it still close the gap.

- **R5.20a** **Automation layout.** Compaction (R5.20) lays out a matching slice as: the Read Model at the left margin; the Command in the same lane, to its right with a 20px gap; the Processor centred (on the grid) above both; each Event directly under the Command (several Events in one Cell go side by side, left to right in their current order, from the Command's x). Lanes do not change. Other elements (e.g. an Event in an Integration lane) are left aligned at the margin, after any element already in their lane. Content width as R5.20 (right edge of the right-most element plus its margin).

**Learning (implementation).** At rest, an element's slice is the one holding its left edge (it stays at least 40px inside its slice), not the one holding its centre.

- **R5.22** **Slice header buttons.** To keep the header compact, only the **i** button (R1c.2) is always visible. Auto-name (R5.24), **Copy Context** (R1c.6), **Flow end** (R5.21), **+** (R5.2a), **×** (R5.4) and the **grip** (R5.8) show only while the mouse is over the header (or a button in it has the keyboard focus), in that order at its right end; the name takes the room otherwise. They keep their hotkeys and tooltips.
- **R5.23** The slice body has a 15% white background tint, so lane backgrounds and borders remain visible.
- **R5.24** **Auto-name.** The first button on the right of a slice header is a wand with a golden icon. It sets the slice name from its elements: the Command for a state-change slice, the Read Model for a state-read slice, and the Processor for an automation or translation slice. A linked copy uses its original's name (R3.22). It changes the name only when exactly one matching element has a non-empty name; otherwise it does nothing. One undo step (R8.1). Tooltip and accessible name: "Name from slice elements".

## 5a. Cells

- **R5a.1** A **Cell** is the intersection of one lane and one slice of a Chapter: a box of its grid (lanes are rows, slices columns). 3 lanes and 2 slices give 6 Cells. The label zone is not part of any Cell.
- **R5a.2** A Cell is not a stored object; it follows from lanes and slices (changing them changes the Cells; moving the Chapter moves them). It has no data of its own, so it is not saved, exported or imported. (An element's Cell comes from the slice it is listed under and its lane id, R6.4, R6.5.)
- **R5a.3** A Cell has no colour of its own; it shows its lane's colour (R2.6).
- **R5a.4** A Cell holds any number of freely positioned elements: an element sits in the Cell of its lane and slice (R5.13), ends up in the Cell it is released over (R5.14) and is vertically centred in the lane (R3.6a).
- **R5a.5** Clicking a Cell selects it: a thin (2px), slightly transparent blue border around the whole Cell, above its elements but below the element toolbar (R1c.1a). One Cell is selected at a time. Its Chapter becomes active (R1a.4).
- **R5a.6** Clicking an element selects it and its Cell (R5a.12). Clicking a lane header, Chapter handle or connection selects that item and clears any Cell selection, as do starting to drag an element and undo or redo. A click on a slice header selects the slice's top Cell (R5.4).
- **R5a.7** A click outside every Cell (empty canvas, label zone, area above the slices) clears the Cell selection.
- **R5a.8** The selection border follows the Cell through panning, zooming, moving the Chapter, and slice resizing or shifting. If the Cell's lane is removed, the selection disappears; if its slice is removed, R5.11 applies.
- **R5a.9** Selecting, moving and clearing the Cell selection is not an operation and is not recorded for undo (R8.6). Backspace and Delete never delete the Cell itself (R5a.11).
- **R5a.10** Adding an element through R3.3 puts it **in the selected Cell**, whatever its type (R3.2), if the Cell's lane type takes it (R2.10; otherwise nothing is added). It sits in the Cell's lane and slice, vertically centred (R3.6a). In an empty Cell it is horizontally centred in the slice (which first grows to element plus 40px margins if narrower); otherwise it goes at the first free spot from the left inside the slice margins (R5.14), not overlapping others. If there is no room, it goes after the last element and the slice grows to fit; later slices move right with their elements (R5.15). The Cell stays selected, so several elements can be added in a row.
- **R5a.11** **Cell hotkeys.** With a Cell selected:
  - **Arrow keys** move the selection to the neighbouring Cell of the same Chapter: up/down to the lane above/below in the same slice, left/right to the previous/next slice in the same lane; nothing at an edge.
  - **Shift+→** / **Shift+←** make the Cell's slice one grid step (20px) wider/narrower, down to its minimum (R5.9, R5.16); one undo step per press; R5.10 and R5.15 apply.
  - **Ctrl+←** / **Ctrl+→** move the Cell's slice one place left/right, swapping it with its neighbour, elements with it (R5.8); nothing at the first or last place; one undo step per press.
  - **Shift+C** compacts the Cell's slice (R5.20).
  - **Shift+I** opens the info of the Cell's slice (R1c.3).
  - **Shift+E** marks or unmarks the Cell's slice as a Flow end (R5.21); one undo step.
  - **Shift+A** copies the Context (R1c.6).
  - **S, C, R or Q, E, P, N** add a Screen, Command, Read Model, Event, Processor or Notes element in the Cell, using R5a.10, with its automatic arrows (R4.8). In a Spec lane, which takes no Screen, **S** adds a Scenarios element instead.
  - **+** adds a slice right after the Cell's slice, as the slice's **+** does (R5.2a).
  - **Enter** opens the editor of a selected Notes element (R3.19), as does **E** (a Notes element only sits in a Spec lane, which takes no Event, so E adds nothing there); **V** and **R** open it in read mode (R3.18; R adds no Read Model there either); otherwise Enter edits the name of the Cell's left-most element (R3.4a), if any.
  - **Delete** or **Backspace** deletes the selected elements with their arrows (R3.5), without confirmation. With no element selected and elements in the Cell, it deletes the Cell's elements with their arrows, after confirmation (one undo step, R8.1); in an empty Cell it does nothing. **Shift+Delete** or **Shift+Backspace** deletes the Cell's **slice** with its elements and arrows, after confirmation, whatever is selected (R5.18); a Chapter's last slice cannot be deleted. One press does one thing; a held key does not repeat.
  - **Esc** clears the Cell selection and any element selected with it (R5a.12).
  - **Ctrl+V** pastes a linked copy of the element remembered with **Ctrl+C** (R3.22).

  Keys are ignored while typing in a text field, while the info panel, hotkey help or scenario popup is open, and with Ctrl, Cmd, Alt or Shift held (except **Ctrl+←** / **Ctrl+→**, **Ctrl+C** / **Ctrl+V**, **+**, Shift+← / Shift+→, Shift+A, Shift+C, Shift+E, Shift+I and Shift+Delete / Shift+Backspace). **Operations on the slice use Shift or, for moving it, Ctrl**; those without a modifier act on the Cell or its elements.
- **R5a.12** **Cell and element selection.** Selecting a Cell (by click, arrow keys, slice header click or creating a slice) also selects its element when it holds exactly one; with none or several, none is selected. Any other selected element is deselected. An element added in the selected Cell (R5a.10, R5a.11) is selected, whatever else the Cell holds; one added in another Cell by dragging is not. An element selected this way can be used like any selected element (e.g. **A** for a Scenarios element, R3.14). Selecting an element also selects its Cell: by a click, and after a drag when dropped (the Cell it lands in). While a Cell is selected the arrow keys move the Cell selection (R5a.11), so elements cannot be moved with the keyboard: the board's own keyboard handling of elements (arrow-key moves, Enter, Space) is off, whatever is selected or focused.

- **R5a.13** **Cell context menu.** Right-click a Cell or its element to select it and open a non-modal menu at the pointer, within the window. An enlarged Screen targets its own Cell. No menu outside Cells or in overview.
  - **Add <type>** lists only types the lane accepts (R2.10). A full Spec Cell disables creation. Creation uses R5a.10, automatic arrows (R4.8) and inherited fields (R9.4).
  - **Paste** appears when a copyable element is remembered with Ctrl+C; it pastes a linked copy into the Cell, as Ctrl+V (R3.22). It is disabled if the lane rejects that element or the Spec Cell is full.
  - **Copy Context** uses R1c.6; include the clicked element's id, or omit Element for a Cell's empty space.
  - **Add next slice** uses R5.2a. **Delete current slice** uses R5.18 and linked-copy safeguards (R3.22); disabled for the Chapter's last slice (R5.19).
  - **Add <type> lane** entries sit at the bottom, after a separator. Types and insertion match the lane header buttons (R2.10), including the current lane's type.
  - Close after an action, outside press, viewport move, window resize or outside scroll. Esc and Tab close without an action; Up/Down cycle enabled entries; Home/End focus first/last; Enter/Space run the focused action. Board hotkeys do not run while open. No backdrop; menu selection is not an undo step.

**Learning (implementation).** Lane nodes cover the Chapter's whole Cell area. If they took the mouse they would sit above the arrows and block selecting them, so lanes ignore the mouse; a click on an empty part of a Cell reaches the canvas, which finds the Cell from the click position (R5a.5, R5a.7).

## 5b. Slice types

- **R5b.1** A slice has a **type**, one of the four Event Modeling patterns, or none. It is **worked out** from the slice's elements and never chosen or stored on the board. It is only written to the export (R6.4). Rules, on the elements of the slice, **ignoring Scenarios and Notes** (a linked copy counts as its original's type, R3.22):
  - **translation** (`TRANSLATION`): has a Processor, a Command and an Event, and at least one element in an Integration lane (R2.10). Checked first;
  - **automation** (`AUTOMATION`): has a Processor, a Command and an Event, and no element in an Integration lane. Other elements (Read Model, Screen, Integration events) are allowed;
  - **state change** (`STATE_CHANGE`): only Screen, Command and Event, with at least a Command and an Event (the Screen is optional);
  - **state read** (`STATE_READ`): only Read Model and Screen, with at least a Read Model;
  - **none** (`null`): anything else, also an empty slice.
- **R5b.2** The type is not shown in the UI. On import the stored `type` is only checked to be valid (R7.4); the type is recomputed from the elements.
- **R5b.3** **External events.** An Event in an Integration lane (R2.10) never updates a Read Model directly. A translation slice (R5b.1) turns it into an internal Event (Command → Event) that is stored, and only that Event feeds the Read Model. Reason: on replay the internal Event arrives at the same point in the event store, whereas two sources (external stream, own events) do not replay to the same outcome; external streams also keep events only for a limited time. A convention only: the board does not check it.
- **R5b.4** Translation todo lists are permanent feeds: recording an internal Event never closes their rows.
- **R5b.5** Moved to [Agent requirements, A1.2](./AGENTIC.md#1-external-event-translation).

## 6. Board file

Type names (slice, element and lane types) are written in **upper case** in the file; the colours and field types (R9.6) are not.

The board file is the single, complete description of a board, written and read **only by software** (this app, other tools, LLMs), not people. It is plain JSON, chosen for exactness and strict checking, not readability. YAML was rejected: its readability only helps hand editing, while its silent type guessing (id `1e3` or value `no` misread) and many equivalent spellings work against exact read checks (R7.4) and byte-for-byte output (R6.9). The board writes and reads it for the saved board (R1.6) and for the server (section 10); there is no file download or upload. The files stored by the server are YAML, written by the server and read back only through it. The file states what exists and how it is connected and stores every user choice; values that follow from layout rules are left out and recomputed on read (R6.10).

- **R6.1** Removed: there is no Export JSON button.
- **R6.2** The file is one JSON object with exactly these fields, in this order:
  - `format`: the text `"event-model"`;
  - `version`: the number `1`;
  - `contexts`: the list of Contexts, each with `id`, `name`, optional `info`, optional `tasks` (R12.1);
  - `chapters`: the list of Chapters.

  No timestamp, nothing else.
- **R6.3** Each Chapter has exactly these fields, in this order:
  - `id`, `name`, `info` (optional, R1c.1);
  - `context`: the **id** of the Chapter's Context (R1b.2), which must be in `contexts`;
  - `x`, `y`: the Chapter's position on the canvas;
  - `connectsTo`: the ids of the Chapters this Chapter has an arrow to (R6.7);
  - `lanes`: the lanes from top to bottom, each with `id`, `name`, `type` (`ACTOR`, `INTERACTION`, `EVENT`, `INTEGRATION` or `SPEC`), optional `info` and `color`;
  - `slices`: the slices from left to right.
- **R6.4** Each slice has exactly these fields, in order: `id`, `name`, optional `info`, optional `flowEnd`, `type`, `width`, `connectsTo`, `elements`. `flowEnd` is `true` for a Flow end slice (R5.21), otherwise left out. `type` is the slice type (R5b.1), worked out on export: `"STATE_CHANGE"`, `"STATE_READ"`, `"AUTOMATION"`, `"TRANSLATION"` or `null`. `connectsTo` lists target Chapter ids (R6.7). `elements` lists the elements in that slice; an element is listed under exactly one slice (R5.13).
- **R6.5** Each element has exactly these fields, in this order:
  - `id`;
  - `type`: `SCREEN`, `COMMAND`, `READ_MODEL`, `EVENT`, `PROCESSOR`, `SCENARIOS` or `NOTES`;
  - `lane`: the **id** of the element's lane, a lane of the same Chapter (R2.9); never its name;
  - `name`: free text, `""` when not set;
  - `info`: the element's info (R1c.1a). Optional: only when not empty, not for `notes` or `scenarios`;
  - `icon`: a named Processor icon (R3.6). Optional: only for a Processor; omitted means `gear`;
  - `isList`: `true` for a list Read Model (R3.25); otherwise omitted;
  - `html`: the Screen mockup as HTML code. Optional: only for a `screen` that has HTML;
  - `url`: the Screen mockup as a web page address (`http://` or `https://`). Optional: only for a `screen` that has one; a Screen has `html` or `url`, never both (R3.7);
  - `highlights`: non-empty `{ path, color }` list (R3.7b); optional on original or linked-copy `SCREEN`;
  - `markdown`: the text of a Notes element. Optional: only for a `notes` element with text;
  - `color`: the colour of a Notes element (R3.24): `red`, `green` or `yellow`. Optional: only for a `notes` element not white (white is left out);
  - `fields`: the fields (R9.6). Optional: only for a `screen`, `command`, `event` or `read_model` with fields;
  - `x`: the horizontal position **relative to the left edge of its slice**, in pixels, stored and restored exactly;
  - `connectsTo`: the ids of the elements this element has an arrow to (R6.7);
  - `scenarios`: the scenarios, in list order (R3.14). Only for a `scenarios` element; each has `id`, `name`, `description`, `given` (list of entries), `when` (an entry or `null`), `then` (list of entries) and `error` (text or `null`). An entry is `{ "element": id of an Event/Command of the same Chapter, "example": the example data }` (R3.16): an object keyed by field name whose values are text, `true`/`false`, a list of values, or a nested object (`{}` when empty). `error` is `null` when `then` is not empty.

  A **linked copy** (R3.22) has only `id`, `type` (its original's), `lane`, `copyOf`, optional Screen `highlights`, `x` and `connectsTo`, in this order. `copyOf` is the **id** of its original, an element of the file that is not a copy and has the same type.
- **R6.6** Every field above is written for every item, except the optional ones (`info`, `icon`, `isList`, `flowEnd`, `html`, `url`, `highlights`, `markdown`, `color`, `fields`, `scenarios`; R6.3 to R6.5) and a linked copy's omitted fields (R6.5). No other field is left out for being empty or default: an empty name is `""`, an item without connections has `"connectsTo": []`.
- **R6.7** A connection is stored once, on the item it leaves: the source's `connectsTo` lists its target ids. Element connections go element to element; Chapter connections leave a Chapter's right side or slice's bottom centre and enter the target Chapter's left (R1a.8). There is no connection list or id (R1.16).
- **R6.8** The order in the file is fixed:
  - Chapters by `x`, then `y`, then `id`;
  - Contexts in list order (the first is the Default, R1b.3);
  - tasks in creation order within each Context; tasks moved from another Context append, keeping their order;
  - lanes top to bottom, slices left to right;
  - elements within a slice by `x`, then lane (top first), then `id`;
  - each `connectsTo` in the order its targets appear in the file.

  The JSON is compact on a single line, without indentation or trailing newline. Line breaks within text values are escaped, preserving content.
- **R6.9** The same board always produces the same file, byte for byte.
- **R6.10** What the file stores, and what it does not.
  - **Stored:** every user choice, i.e. all fields in R6.2 to R6.5. A slice's `type` is the exception: it is written for readers of the file but worked out (R5b.1), so it is not read back.
  - **Not stored, worked out on load:** a slice's position (slices form one run, R5.7); the widths of lanes and Chapter (R1.8); lane height; an element's vertical position (centred in its lane, R3.6a). Also not stored: selected Cell, active Chapter, undo history, pan and zoom.

## 7. Reading the file

- **R7.1** Removed: there is no Import JSON button. The file is read for the saved board (R1.6) and a pull (R10.2), with the checks below.
- **R7.2** Removed (see R7.1).
- **R7.3** Writing then reading reproduces the same board exactly; writing again gives an identical file (R6.9).
- **R7.4** The whole file is checked before anything changes. If a check fails, the file is rejected, the board stays untouched, and an error names the first problem and its location, e.g. `chapters[0].slices[1].elements[2].lane: no lane with id "q7w2e9r4t1u8" in this chapter`. The checks:
  - **Structure.** Valid JSON. `format` is `"event-model"`, `version` is `1`. Every field required in R6.2 to R6.5 is present with the right type (optional fields may be missing), and no others. `chapters` may be empty; every Chapter has at least one lane and one slice (R2.5, R5.19), lanes in type order with at least one of each required type (R2.10). `contexts` is not empty (R1b.3).
  - **Ids.** Every id is a non-empty text (not `null`); the R1.14 pattern is not checked, as it applies only to generated ids. Ids are unique across the whole file, whatever the item kind (R1.14).
  - **References.** A Chapter's `context` is the id of a Context of the file. An element's `lane` is the id of a lane of its own Chapter whose type takes the element's type (R2.10). Each `connectsTo` entry is an existing element id for an element, or Chapter id for a Chapter or slice; not the source's Chapter for a slice, not the owner and not repeated. A `scenarios` or `notes` element is neither owner nor target. A `copyOf` is the id of a non-copy element of the same type (not `scenarios` or `notes`). In a scenario, each `element` is the id of a non-copy element of the Scenarios element's Chapter: an `event` in `given` and `then`, a `command` in `when`.
  - **Values.** `name` of a Context, Chapter, lane or slice, and `name` of a scenario, is not empty. An element `type` is one of the seven types and a lane `type` one of the five (R2.10), written in upper case (a value in lower case is rejected); a lane `color` is one of the twelve colours (R2.6). When present, `html` is a non-empty text on a `screen`, `url` an `http://` or `https://` address on a `screen` without `html`, `markdown` a non-empty text on a `notes` element, `color` (`red`, `green` or `yellow`) only on a `notes` element, `info` a non-empty text (not on `notes` or `scenarios`), `fields` a non-empty list on a `screen`, `command`, `event` or `read_model` (never on a linked copy), and `flowEnd` is `true`. A slice `type` is `null` or one of the four types; its value is not used (the type is recomputed, R5b.2). A field has exactly the keys of R9.6: `name` non-empty and unique in its list, `type` one of the eight, the booleans true or false, `fields` only (and always) on an `object`. `scenarios` is present exactly for a `scenarios` element, and `error` is `null` when `then` is not empty. `x`, `y` and `width` are finite numbers. A scenario entry's `example` is an object whose values are text, `true`/`false`, or lists and objects of these.
  - **Geometry.** A slice `width` is at least 120. An element `x` is at least 40 (20 for Scenarios) and every element fits its slice with the margins (R5.16, R5.17): `x` plus element width (160px; 280px for Scenarios) plus margin (40px; 20px for Scenarios) is at most the slice `width`. A Spec lane holds at most one element per slice (R3.21). Nothing is corrected: a file breaking a check is rejected.
  - **Tasks.** `tasks`, when present, is a list of exactly the fields of R12.1. Ids follow the checks above; title is not blank, description is text, status is `Open` or `Done`, chapter is `null` or a Chapter id of the owning Context.
- **R7.5** An accepted file is laid out as a saved board (R5.12). After a pull no Cell is selected, the first Chapter is active, and the pull is one undo step (R8.1).
- **R7.6** Files in any earlier format are rejected by the R7.4 checks (no `format` field), with a message saying so.

## 8. Undo and redo

- **R8.1** Every user operation that modifies the board is recorded in memory so it can be undone: adding, editing (name and HTML), moving (including to another Chapter) and deleting elements; adding, editing, copying, reordering and deleting scenarios; creating and deleting connections, including Chapter connections; adding, renaming, resizing and deleting slices; compacting a Chapter; adding, renaming and removing lanes; changing a lane's colour; editing the info of Chapters, lanes and slices; adding, renaming, moving and removing Chapters; adding, renaming and deleting Contexts and changing a Chapter's Context; and a pull from the server other than on opening (R10.2).
- **R8.2** Icon-only **Undo** and **Redo** buttons sit in the header next to the title, with tooltips "Undo (Ctrl+Z)" and "Redo (Ctrl+Y)"; disabled when there is nothing to undo or redo.
- **R8.3** Ctrl+Z (Cmd+Z) undoes; Ctrl+Y or Ctrl+Shift+Z redoes. Ignored while typing in a text field (its own undo applies) and while the scenario popup is open (R3.15).
- **R8.4** A continuous gesture is one step: dragging an element or a Chapter, reordering a slice or resizing a slice, is recorded once when it ends.
- **R8.5** An operation and its automatic adjustments (re-settling elements in slices, centring in lanes, shifting later slices) are one step; undo restores the board exactly.
- **R8.6** Selecting items (including Cells, R5a.9), panning and zooming are not operations and are not recorded.
- **R8.7** A new change after an undo discards the redo history.
- **R8.8** History keeps the last 10 operations, in memory only: lost on reload (the board is still saved, R1.6).

## 9. Fields

- **R9.1** A Screen, Command, Event and Read Model element can have **fields**: the data it carries. Processor, Scenarios and Notes have none. Fields are part of the element, saved and exported (R9.6).
- **R9.2** The element toolbar (R1c.1a) has a **Fields** button (tooltip "Edit fields (F)") that opens the fields popup (R9.3), as does the key **F** while one such element is selected (ignored while typing, with modifiers or while a popup is open); filled when the element has fields. A linked copy has none (R3.22).
- **R9.3** **Fields popup** (modal, R1.17, Esc closes). One row per field: name, type, **List**, the five attributes (R9.7), a **Propagate** checkbox (R9.4, only for fields created in this popup) and a remove **×**. **+ Field** adds a row. A field of type `object` holds its own fields, in a nested list with its own **+ Field**, to any depth. A list of values is the **List** checkbox, so a field is a primitive, an object, a list of primitives or a list of objects.
  - **Types:** `string`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `uuid`, `object`.
  - A name is not empty and unique within its list; Save is refused with a message otherwise.
  - **Get from parent** copies the fields of the parents (R9.4) into the popup, replacing fields of the same name; the rest stay. Disabled when no parent has fields. Nothing changes until **Save**.
  - **Save** (first) and **Cancel** (second). **Save** and **Ctrl+S** (Cmd+S) apply everything as one undo step (R8.1) and close; **Cancel**, Esc and a click outside discard.
- **R9.4** **Inheritance.** Fields are copied along the arrows of R4.7, never linked; no trace of the source is kept. A parent is an element with an arrow to this one. A Processor holds no fields but passes them on: Read Model → Processor → Command copies the Read Model's fields to the Command.
  - When an arrow is added, by hand or automatically (R4.8), all fields of its source are copied to its target, replacing fields of the same name. Only that hop; nothing further is copied.
  - **Propagate:** a field created in the popup has a checkbox, checked by default. On Save, a checked new top-level field is also copied to **all** elements downstream, following arrows through the whole chain (around loops too), replacing fields of the same name. The setting is not stored. Fields later edited or removed are not propagated.
  - **Get from parent** (R9.3): several parents are applied in the order of their arrows; a later parent replaces same-named fields of an earlier one.
  - A linked copy is never a target; as a source it gives its original's fields.
- **R9.5** The body of a Command, Event and Read Model lists its field names, compact, nested fields indented. No type or attribute is shown there (they are in the popup). A Screen shows its mockup (R3.8), not its fields.
- **R9.6** **Export.** `fields` is a list; each field has exactly these keys in order: `name`, `type`, `list`, `id`, `optional`, `generated`, `pii`, `technical` (all booleans written), and for `object` also `fields` (the nested list). Import checks as in R7.4.
- **R9.7** **Attributes** (each true/false, a checkbox with a tooltip):
  - **ID**: identifies the object;
  - **Optional**: may be missing;
  - **Generated**: generated by the system, e.g. an id or the current date;
  - **PII**: personally identifiable information;
  - **Technical**: an implementation detail.
- **R9.8** **Information completeness.** A non-copy Screen, Command, Event or Read Model with incoming element arrows fails when it has a non-generated top-level field whose name no parent supplies (through Processors). All incoming arrows turn bright red (`#ff0000`) and become thicker (4px). Same-named fields count as inherited regardless of type or attributes.
- **R9.9** A Read Model's fields describe one result item. Use `isList` (R3.25), not an outer `list: true` field, for multiple results. Use `list: true` only for a collection-valued attribute within one result item.
- **R9.10** A non-copy Command's toolbar has a down-arrow button after Fields, tooltip "Copy fields from connected Events". It merges fields from outgoing directly connected Events in arrow order; later Events replace same-named fields, other Command fields stay. Include Generated fields, all attributes and nested fields; linked Events supply their original's fields. Apply immediately as one undo step, without propagation. Disabled with tooltip "No connected Event has fields" when none supplies fields.
- **R9.11** A non-copy Screen has R9.10's button and copy behavior, using outgoing directly connected Commands instead of Events. Tooltips: "Copy fields from connected Commands"; disabled: "No connected Command has fields".

**Learning (implementation).** Copying is one hop (R9.4): fields reach an element only when an arrow to it is added. Building a chain through the server (SERVER.md S4.16 to S4.18) therefore depends on order: connect the upstream arrows first (Read Model → Processor → Command), then add the Event below the Command, or it gets none of those fields. A `PATCH` of `fields` (S4.17) replaces the list and copies nothing.

## 10. Server storage

The board stores its Contexts on the server (SERVER.md section 3), one file per Context holding its Chapters.

- **R10.1** **Auto-push.** There is no push button. 1 s after the last change to the board (R8.1 changes, not selection or view), while there is a known revision (R10.5) and the board differs from its last pull or push, the board sends the Contexts, which removes stored Contexts no longer on the board, then every Context with its Chapters, one request per Context, each with the known revision; the revision of each response becomes the known one. Renamed Contexts replace their old file; a Chapter deleted or moved to another Context leaves its old file with the next push of that Context. No notice on success. On failure a notice gives the server's message; the next change tries again (a stale revision: R10.7). Nothing changes on the board.
- **R10.2** **Open and pull.** There is no pull button. The board rebuilds itself from the stored Contexts and Chapters when it opens or reloads (the saved board, R1.6, is replaced; a server with no model gives the starting board, R1.4) and on R10.6 and R10.7. The server returns them as an export file (R6.2), checked as in R7.4; a failed check or error shows a notice and the board stays untouched. No confirmation is asked (unlike R7.2). Accepted: as R7.5. Opening is not an undo step; the others are (R8.1). The revision of the response becomes the known one (R10.5).
- **R10.3** All Contexts are stored, in list order, so empty Contexts and the Default (R1b.3) survive a pull.
- **R10.4** The server stores a Context and its Chapters, slices inline, in one file `<context>.yaml` (SERVER.md S3.2), the Chapters exported as in R6.3 and R6.4. The board always sends and receives whole Contexts, slices inline. Contexts and Chapters are identified by their id. The server compacts the `html` of Screens on push (SERVER.md S3.10), so pulled HTML can differ in form (not in look) from what was pushed.
- **R10.5** The board keeps the server's **revision** (SERVER.md S4.1) of its last successful pull or push: the **known revision**. It is not saved (R1.6); after a reload there is none, and no push (R10.1) happens until the first pull (R10.2).
- **R10.6** **Auto-pull.** The board listens to the server's events (SERVER.md S4.3), also after a lost connection or a refused stream: it reopens the stream every 3 s until it connects. During a push or pull, it keeps the latest notified revision and checks it after sync. A revision other than the known one or one made by the board's own push triggers R10.2 (**the server wins**, also over changes not yet pushed). With **no known revision** the first notification triggers the open pull. A notice says the board was updated; if changes not yet pushed were replaced, it says so.
- **R10.7** A push with a stale revision (SERVER.md S4.2, 412) stops (R10.1) and the board pulls as R10.6; its changes not yet pushed are replaced.

## 11. Movie strip

The Screens of a Chapter shown one after the other, like a prototype walk-through.

- **R11.1** A **Movie strip** button (film icon, tooltip "Movie strip") in the Chapter handle, before **↔**, opens the movie strip popup (R11.2). Disabled when the Chapter has no Screen.
- **R11.2** The **movie strip popup** is modal (R1.17: Esc and a click on the backdrop close it). It lists **every Screen** of the Chapter, with or without a mockup, in reading order: slice order, then `x`, then lane (top first), then id. A linked copy shows its original (R3.22).
- **R11.3** Layout: centred title "Screens", then "Screen *n* of *m*", then four round buttons, then the strip. The strip shows the **current** Screen big in the middle (blue frame), the others smaller (half size) and faded at the sides, cut off by the popup's edges. It opens on the first Screen.
- **R11.4** A Screen uses a 4:3 frame, HTML content fit or full-page URL (R3.8), with its **name** below (element name only; nothing when unnamed). Without a mockup it shows "No preview yet". The **current** Screen's mockup is interactive (clicks, typing); the others are view-only (no clicks reach them, a click makes them current, R11.5). HTML code runs its scripts in the strip (sandbox `allow-scripts`, no same origin; unlike R3.9). Only the current Screen and its two neighbours load their mockup. **Learning (implementation):** HTML frames relay content bounds and keys to parent; accept bounds only from matching frame/source token. `KEY_RELAY` posts Esc, **←** / **→** (not while typing in a field) and Alt+Enter. A URL page cannot be given one: after a click in it, Esc and arrows work again only after a click outside mockup.
- **R11.5** Navigation: **←** / **→** go to the previous / next Screen (stopping at the ends); a click on another Screen makes it current. The strip slides to centre it.
- **R11.6** Buttons, in this order: **Smaller** and **Larger** (size of the current Screen, six steps from 30% to 100% of what fits the window; starts at 100%), **Fit to the window** (100%), **Full screen** (the popup fills the window and back; **Alt+Enter** does the same). The popup always opens full screen. Zoom and full screen are not remembered. A button at its limit is disabled.
- **R11.7** The popup changes nothing on the board and is not an undo step. It is listed in the hotkey help (R1d.1).

## 12. Tasks

- **R12.1** Each Context owns an optional `tasks` list, omitted when empty. Each task has these keys in order: `id` (R1.14), `title` (required, trimmed, not blank), `description` (text, empty allowed), `status` (`Open` default, or `Done`), `chapter` (`null` for Context itself, otherwise a Chapter id of that Context). Saved and synced with the Context.
- **R12.2** A **Tasks** button in top header toggles a non-modal popup, also in high level view. Horizontally centred, 8px below header; follows header height changes and fits remaining window height with 8px bottom gap. No backdrop or blur; board stays usable. Shows current Context's tasks, or all Contexts' tasks when filter is **All contexts**, in Context order then task order (R6.8). Lists title, description, status and Context/Chapter names; Chapter filter as R12.6.
- **R12.3** Popup supports Add, Edit, Delete (confirm first), status changes and Context/Chapter assignment. New task uses filtered Context; with **All contexts**, require a Context choice. Chapter choices belong to chosen Context; blank option means no Chapter. Changing Context resets Chapter to blank. Save commits one task. List status changes save at once. Each mutation is one undo step (R8.1). Cancel, Esc inside popup or click outside closes it and discards unsaved form only; outside press and release required. Uses `useOutsideClose` and `useModalFocus` instead of R1.17's backdrop.
- **R12.4** Deleting a Chapter keeps its tasks in its Context with `chapter: null`. Moving a Chapter to another Context moves its tasks with it. Deleting a Context moves all its tasks to Default with its Chapters (R1b.6); Chapter links stay.
- **R12.5** Clicking a task's Chapter name closes Tasks, makes that Chapter active, clears Cell selection and fits it into view with R1.20's title/handle space and padding. Not an undo step. Context-only tasks show only Context name, without separator or Chapter label.
- **R12.6** Chapter dropdown directly after Context name in popup title filters task list. Blank default shows all tasks in current Context scope, including Chapter tasks; other options filter per Chapter. No **No Chapter** option. Group Chapter names under Context headings; sort groups and Chapters alphabetically. Show only current Context's group, or all groups with **All contexts**; omit empty groups. Missing Chapter selection falls back to blank. Resets on popup reopen; not saved or an undo step. Header Context filter stays unchanged.
- **R12.7** Task title shows a text cursor on hover without a border. Double-click to edit in place; select full title. Enter or blur saves one undo step; Esc cancels title edit without closing Tasks. Reject blank titles with an error; keep original title.
- **R12.8** Description edits in place as R12.7, using a 6-row multiline field. Enter inserts a line break; blur saves and ends editing; Esc cancels without closing Tasks. Empty allowed; show an editable "Description" placeholder when empty. Same hover and text cursor.
- **R12.9** Task row's status dropdown, Edit and Delete share 28px height and 13px text; widths fit content.
- **R12.10** Header Tasks button is icon-only, 28px square, with a count badge for Open tasks in selected Context, or all Contexts when **All contexts** is selected. Include Context-only and Chapter tasks; show 0 when none. Tooltip and accessible label: `Tasks (<count> open)`.

## Out of scope for now

- Icons for element types other than Processor.

## Open points

None at the moment.
