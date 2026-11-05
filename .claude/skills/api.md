# Event Modeling server API

Base URL: `http://localhost:3300` (CLI `npx event-modeling-cli`, option `--port`). All paths start with `/api`.
Bodies are JSON (max 50 MB). No authentication. Errors: `{ "error": text }` with an HTTP status.

## Storage

Folder `<cwd>/.event-modeling/model/`:
- `contexts.yaml`: ordered list of `{ id, name, file }`; the first is the Default.
- `<file>` (e.g. `backoffice.yaml`): one Context `{ id, name, chapters }`, slices inline.

A Chapter's `context` is a Context `id` that must exist in `contexts.yaml`.
`html` of every `SCREEN` element is compacted on every write.

## How to change the model

- **Agents: use the editing API** (below): small edits by id, atomic, checked against the board's rules. Do not push whole Contexts.
- The open board follows by itself: it pulls when the server model changes, unless it has unpushed changes (then it only shows a notice).
- The **revision** is an opaque text that changes with every change of the stored model. It is the `ETag` header of `GET /api/model`, `GET /api/model/revision` and every write. Pushes (`PUT /api/model/contexts…`) need `If-Match: "<revision>"` (428 without, 412 if stale). Editing writes need no `If-Match`; if sent it is checked the same way.
- `GET /api/model/events`: Server-Sent Events; `data: {"revision":"…"}` on connect and after every change made through the server (not for files edited by hand).

## Endpoints

### `GET /api/model`
Whole model as JSON: Contexts in file order, Chapters ordered by `x`, `y`, `id`. `ETag` header.

### `GET /api/model/revision`
`{ "revision" }` (also in `ETag`).

### `GET /api/model/contexts/:id`
Chapters of Context `:id` as multi-document YAML (`application/yaml`): one `---` document per Chapter, ordered by `x`, `y`, `id`. Empty body if the Context has no Chapters.
- Query `screenContent`: `true` (default) | `false`. `false` omits the `html` of `SCREEN` elements.

### `PUT /api/model/contexts`
Needs `If-Match`. Body: `{ "contexts": [{ "id", "name" }] }` (not empty, unique ids). Replaces `contexts.yaml` and deletes the files of Contexts no longer listed.
Returns `{ "count", "removed" }`.

### `PUT /api/model/contexts/:id`
Needs `If-Match`. Body: the whole Context `{ id, name, chapters }` with slices inline; `id` equals `:id`. The Context must be in `contexts.yaml` with the same name. Writes its file.
Returns `{ "path" }`.

### `GET /api/model/contexts/:id/screens`
Finds Screens (`SCREEN` elements, linked copies included) of Context `:id`, without `html`.
- Query `name`: whole name, case-insensitive. With `contains=true` a part of the name.
- Query `chapter`: Chapter id or name, case-insensitive.
- Without both: all Screens. Names are not unique: several results are possible.

Returns `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`.

### `GET /api/model/contexts/:id/screens/:screenId`
One Screen as above plus `html` or `url` (only the one it has). A linked copy has `copyOf` and returns the `html`/`url` of its original.

### `PUT /api/model/contexts/:id/screens/:screenId/html`
Body: `{ "html": text }` (not empty). Sets the compacted `html` and removes `url` (a Screen has `html` or `url`, never both). Only that element changes.
Returns `{ "html" }` as stored (compacted: `<html>`, `<head>`, `<body>` always present).
A linked copy gets 409 with its original's id: update the original.

## Editing API

Paths are under `/api/model`. Items are addressed by id alone (ids are unique in the whole model, 6 characters `a-zA-Z0-9`, created by the server). Unknown body fields get 400. Writes return the item as stored with the `ETag`; creations return 201.
Types are upper case. Start with `GET /rules` and `GET /outline`. Names of items are free text; an id in a body that does not exist gets 400, in the path 404.

### Read

| Request | Result |
|---|---|
| `GET /rules` | `{ elementTypes, laneTypes: [{ type, label, takes }], connections: [{ from, to }], laneColors, noteColors, fieldTypes, fieldFlags }` |
| `GET /outline?context=` | Contexts (only `context` if given) → Chapters `{ id, name, x, y, connectsTo, lanes: [{ id, name, type }], slices: [{ id, name, type, flowEnd?, width, elements: [{ id, type, name, lane, x, copyOf?, connectsTo }] }] }`. No `html`, `url`, `fields`, `info`, `markdown`, scenarios. A copy's `name` is its original's. |
| `GET /search?q=&type=&context=` | `[{ id, type, name, chapterId, sliceId, lane }]`. `q`: part of the name, case-insensitive; `type`: element type; `context`: Context id |
| `GET /chapters/:id?screenContent=` | The Chapter as stored (`screenContent=false` omits Screen `html`) |
| `GET /elements/:id` | The element as stored (a copy as its own entry) |

### Write

| Request | Body | Notes |
|---|---|---|
| `POST /contexts` | `{ name }` | Name is a file name (see Rules) |
| `PATCH /contexts/:id` | `{ name }` | |
| `DELETE /contexts/:id` | | 409 for the Default (the first). Its Chapters move to the Default: `{ moved }` |
| `POST /chapters` | `{ context, name, x?, y? }` | Starts with Actor, Interaction, Event lanes and one "New Slice" (220). `x`, `y` multiples of 20, default 0 |
| `PATCH /chapters/:id` | `{ name?, info?, context?, x?, y? }` | |
| `DELETE /chapters/:id` | | `{ removed: { elements, scenarios } }` |
| `PUT` / `DELETE /chapters/:id/connections/:targetId` | | Arrow Chapter → Chapter |
| `POST /chapters/:id/lanes` | `{ type, after, name?, color?, info? }` | New lane right below lane `after`; lane types keep the order of `GET /rules`. `color` default `none` |
| `PATCH /lanes/:id` | `{ name?, info?, color? }` | Type never changes |
| `DELETE /lanes/:id` | | 409 for the last Actor, Interaction or Event lane. Deletes its elements |
| `POST /chapters/:id/slices` | `{ name?, after?, width? }` | Default name "New Slice", after the last slice, width 220 (multiple of 20, ≥ 120) |
| `PATCH /slices/:id` | `{ name?, info?, flowEnd?, width?, index? }` | `index`: 0-based place in the Chapter. Width not below its elements |
| `DELETE /slices/:id` | | 409 for the last slice. Deletes its elements |
| `POST /elements` | see below | |
| `PATCH /elements/:id` | see below | |
| `DELETE /elements/:id` | | Also deletes its linked copies, its arrows and the scenarios that use it: `{ removed: { elements, scenarios } }` |
| `POST /connections` | `{ from, to }` | Elements. Direction is fixed by the flow rules (any order accepted); a repeat or other pair gets 400. Copies the source's fields to the target |
| `DELETE /connections` | `{ from, to }` | Either order; 404 if not connected |
| `POST /elements/:id/scenarios` | `{ name, description?, given?, when?, then?, error?, index? }` | Element must be `SCENARIOS` |
| `PATCH /scenarios/:id` | same fields | |
| `DELETE /scenarios/:id` | | `{ removed }` |
| `POST /scenarios/:id/copy` | | Inserted right after the original |
| `POST /ops` | see below | |

**Create element** `POST /elements`: `{ slice, lane, type, name?, info?, html?, url?, markdown?, color?, fields?, x?, autoConnect? }`, or `{ slice, lane, copyOf, x?, autoConnect? }` for a linked copy (original is not a copy; not `SCENARIOS`/`NOTES`).
- The lane belongs to the slice's Chapter and takes the type (`GET /rules`). A `SPEC` lane holds one element per slice.
- `html`/`url` only for `SCREEN` (not both), `markdown`/`color` (`red`, `green`, `yellow`) only for `NOTES`, `fields` only for `SCREEN`, `COMMAND`, `EVENT`, `QUERY`, no `info`/`name` for `SCENARIOS`/`NOTES`.
- `x`: from the left edge of the slice, at least the margin (40; 20 for `SCENARIOS`/`NOTES`). Without it the element is placed like the board does; the slice grows as needed.
- `autoConnect` (default `true`) adds the arrows the board adds (Screen→Command, Command→Event, Query→Screen, Event→Query).
- `fields`: `[{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }]`; `type` default `string` (`object` has `fields`), flags default `false`.

**Change element** `PATCH /elements/:id`: `{ name?, info?, html?, url?, markdown?, color?, fields?, slice?, lane?, x? }`. `null` removes an optional field. Setting `html` removes `url` and the reverse. `slice` and `lane` come together and move it (also to another Chapter; scenarios that use it are deleted; a `SCENARIOS` element cannot change Chapter). A linked copy accepts only `slice`, `lane`, `x`; other fields get 409 naming the original.

**Scenarios**: `given` and `then` are lists, `when` an entry or `null`, entry `{ element, example? }`: `element` is an `EVENT` (given, then) or `COMMAND` (when) of the same Chapter, not a copy; `example` is an object of text, booleans, lists or objects. `error` is text or `null`; it must be `null` when `then` is not empty.

**Batch** `POST /ops`: `{ ops: [{ method, path, body?, as? }] }`. Runs write requests above in order, atomically (all or none, one revision). `path` is relative to `/api/model`. `as: "a"` names the `id` of the created item; later `"$a"` as a path segment or body value is replaced by it. Returns `{ results: [{ status, body }] }`; on an error nothing is written and the message starts `ops[<index>]: `.
Example: `{ "ops": [{ "method": "POST", "path": "/chapters/CH/slices", "body": { "name": "Add item" }, "as": "s" }, { "method": "POST", "path": "/elements", "body": { "slice": "$s", "lane": "LANE", "type": "COMMAND", "name": "Add item" } }] }`

### Errors
400 invalid body or value, or refused by a board rule (the result is checked as the board checks a pull). 404 unknown id in the path. 409 the model does not allow it (the Default Context, the last lane or slice, a linked copy's own fields, a `SCENARIOS` element changing Chapter, file name collisions). 412 stale `If-Match`. 422 the stored model is invalid. 428 push without `If-Match`.

## Rules

- Push order: `PUT /model/contexts`, then `PUT /model/contexts/:id` per Context, each with the `ETag` of the previous answer in `If-Match`.
- Context names are file names: they must not contain `\ / : * ? " < > |` or control characters, end with a dot, be empty, be `contexts` or be a Windows device name.
- `info` (Markdown on Chapters, lanes, slices and elements) is reserved mainly for implementation details: not for source citations, summaries or traceability. Summaries go in `NOTES` elements.
