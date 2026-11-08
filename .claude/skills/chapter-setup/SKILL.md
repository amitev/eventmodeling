---
name: chapter-setup
description: Set up and reshape the structure of the model through the server API — Contexts, Chapters, lanes and slices: create, rename, move, reorder, resize, insert a slice between two slices, mark a flow end, delete. Use for "add a chapter", "create a context", "add a slice after X", "move this slice", "add a lane", "rename", "split the model into contexts".
---

# Chapter Setup (structure)

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` first (lane types, slices, slice types). Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Do not guess the rules below. To look things up in the model, use the `model-navigation` skill (cheap reads). Elements, fields, arrows and scenarios have their own skills: `html-screen`, `element-fields`, `connections`, `scenarios`.

## Rules to know

| | Rule |
|---|---|
| Context | `{ id, name }`. The first Context is the **Default**: it cannot be deleted (409), but can be renamed. Every Chapter has exactly one Context. |
| Context name | Becomes a file name: it must not contain `\ / : * ? " < > |` or control characters, end with a dot, be empty, be `contexts`, or be a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, also with an extension). Two Contexts must not collide as file names (case-insensitive). The server refuses (400, 409); never change a name to make it fit: ask. |
| Chapter / slice / lane names | Not file names and not checked by the server, but the board filters the same characters: avoid them. A name is never empty. |
| Chapter | Starts with an Actor, an Interaction and an Event lane and one "New Slice" (220 wide), no elements. `x`, `y` are whole multiples of 20 (default 0). |
| Lanes | Types keep the order Actor, Interaction, Event, Integration, Spec (`GET /rules` → `laneTypes`). A Chapter always keeps at least one Actor, Interaction and Event lane. Lane colours: `GET /rules` → `laneColors`. |
| Slices | One contiguous run, left to right, laid out automatically: no `x` for a slice, only an order and a `width`. Width is a multiple of 20, at least 120, and never below its elements plus their margins. A Chapter always keeps at least one slice. |
| Flow end | `flowEnd: true` marks a slice as the end of a flow. |
| Deleting | Deleting a lane or slice deletes its elements, their arrows, their linked copies and the scenarios that use them. Deleting a Chapter deletes all of its elements. Deleting a Context moves its Chapters to the Default. |
| Ids | Created by the server, unique in the whole model. |
| Info | Markdown on a Chapter, lane, slice or element, empty by default. Reserved mainly for implementation details (formats, limits, integrations, technical constraints). Not for source citations, summaries or traceability: summaries go in Notes elements (which may also carry implementation details). |

## Step 1 — Look first

1. `GET /api/model/outline` (add `?context=<id>` for one Context): Contexts, Chapters with `x`, `y`, `lanes` and `slices` (with `width` and elements). Use it to get ids and the order. Never guess an id.
2. Names are not unique. When the user names a Chapter, slice or lane that matches several, ask which one (name its Chapter).
3. Ask before **anything that deletes content** or that the user may not expect: deleting a lane, slice, Chapter or Context, adding a lane to an existing Chapter, moving a Chapter to another Context.

## Step 2 — Contexts

| Do | Call |
|---|---|
| Create | `POST /contexts` `{ "name" }` |
| Rename | `PATCH /contexts/:id` `{ "name" }` |
| Delete | `DELETE /contexts/:id` → `{ moved }`: the ids of the Chapters that moved to the Default |

## Step 3 — Chapters

| Do | Call |
|---|---|
| Create | `POST /chapters` `{ "context", "name", "x"?, "y"? }` → the Chapter with its three lanes and one slice (read their ids from the answer) |
| Change | `PATCH /chapters/:id` `{ "name"?, "info"?, "context"?, "x"?, "y"? }` (`info` is Markdown, `null` removes it) |
| Delete | `DELETE /chapters/:id` → `{ removed: { elements, scenarios } }` |
| Connect | `PUT /chapters/:id/connections/:targetId` adds a Chapter → Chapter arrow, `DELETE` removes it. Chapters connect only to Chapters; not to themselves. |

**Position:** Chapters are laid out independently and the server does not stop overlaps. Put a new Chapter to the right of the others: `x` = (right edge of the rightmost Chapter) + 100, `y` = that Chapter's `y`, where the right edge is its `x` + 48 (the lane label zone) + the sum of its slice widths. Round to a multiple of 20. The user can drag it away on the board.

## Step 4 — Lanes

`POST /chapters/:id/lanes` `{ "type", "after", "name"?, "color"?, "info"? }`.
- `type` is `ACTOR`, `INTERACTION`, `EVENT`, `INTEGRATION` or `SPEC`. `name` defaults to the type name, `color` to `none`.
- `after` is the id of a lane of the Chapter. The new lane goes right below it. The order must hold: the type may not come before the type of `after`, nor after the type of the lane that follows. A refusal (400) names the order.
- Preferred: system actors (Actor lanes with Processors) on the top Actor lanes, human roles (Actor lanes with Screens) below. A new lane can only go below an existing lane (`after`), so in a new Chapter use the first Actor lane for the system actor (rename it) and add the human-role lane after it; add further system-actor lanes after the last system-actor lane. Do not reorder existing lanes unasked.
- Typical: Integration goes below the last Event lane; Spec goes below the last Event or Integration lane.
- **One Integration lane per external system**, named after the system, its `info` describing how the system reaches us (core rules, "External systems"). Ask the user for the name and details; a second system gets its own lane, added after the last Integration lane.

`PATCH /lanes/:id` `{ "name"?, "info"?, "color"? }` (the type never changes). `DELETE /lanes/:id` deletes its elements; 409 for the last Actor, Interaction or Event lane.

## Step 5 — Slices

| Do | Call |
|---|---|
| Add at the end | `POST /chapters/:id/slices` `{ "name"? }` (default name "New Slice", width 220). Name it like the Command, Query or Processor it will hold; do not leave "New Slice" |
| Add **between** | `POST /chapters/:id/slices` `{ "name", "after": "<slice id>" }`: the new slice goes right after that slice |
| Add **first** | `after` needs a slice, so add the slice after the first one and move it: `PATCH /slices/:newId` `{ "index": 0 }`. In one `POST /ops` use `"as": "s"` on the create op and `"/slices/$s"` in the path of the next |
| Move | `PATCH /slices/:id` `{ "index": n }`, `n` the 0-based place among the Chapter's slices. Its elements move with it |
| Rename, resize, mark | `PATCH /slices/:id` `{ "name"?, "info"?, "width"?, "flowEnd"? }` (`flowEnd`: `true`, or `false`/`null` to remove) |
| Delete | `DELETE /slices/:id` → `{ removed }`; 409 for the last slice |

- A new slice is empty and gets no arrows. Moving a slice keeps its elements' arrows, so an arrow may now point backward (against the flow, see core rules): tell the user.
- A slice is only as wide as it needs: for elements added later the server widens it. Set `width` only when asked.
- `index` out of range is refused (400): it is from 0 to the slice count − 1.
- Creating a whole slice with its elements is several calls: do them in one `POST /ops` (atomic, one revision), e.g. create the slice with `"as": "s"`, then the elements with `"slice": "$s"`.

## Step 6 — Verify and report

1. `GET /outline` (or the answer of the write) to check ids, order and widths.
2. Tell the user:
   - what was created, changed or deleted, by name, with its id and Chapter;
   - on a delete, `removed` (elements and scenarios) and `moved`;
   - arrows that now point backward after a move;
   - that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed);
   - any error: 400 (invalid body or value, a name the files cannot take, a lane order, an unknown id in the body, `index` out of range), 404 unknown id in the path, 409 (the Default Context, the last lane or slice, a name collision). Read `error`, fix the cause, retry.
