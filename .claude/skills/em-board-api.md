# Event Modeling server API

Base: `http://localhost:3300/api/model` (CLI `npx em-cli board`, port option `--port`). Paths below are relative; `/` means base itself. JSON bodies, max 50 MB; no auth. Errors: `{ error: text }` + HTTP status. Shapes use `?` for optional keys.

## Agent rules and storage

- **Use only the API. Never read, create, edit or delete files in `<cwd>/.event-modeling/model/`. Use atomic, board-validated editing endpoints, not whole-Context pushes.**
- Storage: `contexts.yaml` = ordered `[{ id, name, info?, file }]`; first Context is Default. Each `<file>` (e.g. `backoffice.yaml`) = `{ id, name, tasks?, chapters }`, slices inline. Chapter `context` must reference a listed Context id; Tasks live in that Context file.
- Every write compacts all `SCREEN` `html`.
- Board auto-pulls server changes, after any in-flight sync. It shows a notice if the pull replaces unpushed edits.
- Revision: opaque text, changes with each stored-model change; returned as `ETag` by `GET /`, `GET /revision` and all writes. Pushes require `If-Match: "<revision>"`; editing writes check it only if supplied.
- Read `GET /rules` once per session; scope lookups via `model-navigation`. Server creates globally unique 6-character ids (`a-zA-Z0-9`); address items by id alone. Types uppercase; names free text except Context names.
- Context names are file names: nonempty; no `\ / : * ? " < > |`, control characters or trailing dot; not `contexts` or Windows device names.
- `info`: Markdown on Chapters, lanes, slices and elements, mainly implementation details; not citations, summaries or traceability. Put summaries in `NOTES`; these may also hold implementation details.

## Task capture

After reporting findings, offer selected items as Tasks; skip if none.
- Confirm selection, business-language titles and owning Context/Chapter before writes. Descriptions retain questions/evidence; uncertain findings stay questions, not confirmed fixes.
- Read-only reviews allow only approved Task creation; Task approval does not authorize model fixes.
- Use `POST /tasks` with default status. Chapter-specific: that Chapter; Context-wide: `chapter: null`.
- Read back via `GET /tasks?context=<contextId>`; report saved count/titles and failures.

## Reads

| GET path | Result / query |
|---|---|
| `/` | Whole model JSON; Contexts in file order, Chapters sorted by `x`, `y`, `id` |
| `/revision` | `{ revision }` |
| `/events` | SSE `data: {"revision":"…"}` on connect and every server-made change; not manual file edits |
| `/rules` | `{ elementTypes, laneTypes: [{ type, label, takes }], connections: [{ from, to }], laneColors, noteColors, fieldTypes, fieldFlags }` |
| `/outline?context=` | Contexts (filter by Context id) → Chapters `{ id, name, x, y, connectsTo, lanes: [{ id, name, type }], slices: [{ id, name, type, flowEnd?, width, elements: [{ id, type, name, lane, x, copyOf?, connectsTo }] }] }`. Excludes `html`, `url`, `fields`, `info`, `markdown`, scenarios; copies use original names |
| `/outline?detail=chapters&context=` | Context `{ id, name, chapters }`; Chapter `{ id, name, x, y }`. Optional Context id filter; `detail=full` is the default |
| `/search?q=&type=&context=` | `[{ id, type, name, chapterId, sliceId, lane }]`; `q`: case-insensitive name substring; `type`: element type; `context`: Context id |
| `/chapters/:id?screenContent=&slice=` | Stored Chapter; `screenContent=false` omits Screen `html`. `slice=<sliceId>` filters `slices` only, retaining Chapter fields/all lanes; 404 if slice not in Chapter |
| `/elements/:id` | Stored element; copy returns its own entry |
| `/tasks?context=` | `[{ context, id, title, description, status, chapter }]`; omit `context` query for all Contexts. Context order, then task creation order |
| `/tasks/:id` | Stored task `{ id, title, description, status, chapter }` |
| `/contexts/:id?screenContent=` | `application/yaml`: one `---` document per Chapter, sorted by `x`, `y`, `id`; empty body for no Chapters. `screenContent=true` (default) or `false` to omit Screen `html` |
| `/contexts/:id/screens?name=&contains=&chapter=` | Screens including linked copies, without `html`: `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`. Copies resolve original name/content flags across Contexts; identity/location stay the copy's. `name`: case-insensitive whole resolved name, substring if `contains=true`; `chapter`: case-insensitive Chapter id/name. Neither filter: all Screens. Names need not be unique |
| `/contexts/:id/screens/:screenId` | Same shape + `html`/`url`, optional own `highlights`. Copies resolve original name/content across Contexts, never inherit highlights |

## Editing writes

Unknown body keys or nonexistent body ids: 400; nonexistent path ids: 404. Results validated like board pulls. Returns stored item + `ETag` unless noted; creations: 201.

| Request | Body | Effect / limits / result |
|---|---|---|
| `POST /contexts` | `{ name, info? }` | File-safe name |
| `PATCH /contexts/:id` | `{ name?, info? }` | `info: null` or empty removes it |
| `DELETE /contexts/:id` | | 409 for Default; otherwise move Chapters to Default; `{ moved }` |
| `POST /chapters` | `{ context, name, x?, y? }` | Actor, Interaction, Event lanes + "New Slice" (220). `x`, `y`: multiples of 20, default 0 |
| `PATCH /chapters/:id` | `{ name?, info?, context?, x?, y? }` | |
| `DELETE /chapters/:id` | | `{ removed: { elements, scenarios } }` |
| `PUT` / `DELETE /chapters/:id/connections/:targetId` | | Chapter → Chapter arrow |
| `POST /chapters/:id/lanes` | `{ type, after, name?, color?, info? }` | Immediately below lane `after`; preserve `/rules` lane-type order. Default `color: none` |
| `PATCH /lanes/:id` | `{ name?, info?, color? }` | Cannot change type |
| `DELETE /lanes/:id` | | Deletes elements; 409 for last Actor, Interaction or Event lane |
| `POST /chapters/:id/slices` | `{ name?, after?, width? }` | Defaults: "New Slice", after last slice, width 220. Width multiple of 20, ≥ 120 |
| `PATCH /slices/:id` | `{ name?, info?, flowEnd?, width?, index? }` | `index`: 0-based Chapter position; width must fit elements |
| `DELETE /slices/:id` | | Deletes elements; 409 for last slice |
| `PUT` / `DELETE /slices/:id/connections/:targetId` | | Slice bottom centre → another Chapter in same Context, never own Chapter. Stored as slice `connectsTo`; copies no fields |
| `DELETE /elements/:id` | | Deletes linked copies, arrows, scenarios using it; `{ removed: { elements, scenarios } }` |
| `POST /connections` | `{ from, to }` | Elements, either order; flow rules set direction. Invalid/repeated pair: 400. Copies source fields to target |
| `DELETE /connections` | `{ from, to }` | Either order; 404 if not connected |
| `POST /elements/:id/scenarios` | `{ name, description?, given?, when?, then?, error?, index? }` | Requires `SCENARIOS` element |
| `PATCH /scenarios/:id` | Same fields | |
| `DELETE /scenarios/:id` | | `{ removed }` |
| `POST /scenarios/:id/copy` | | Insert immediately after original |
| `POST /tasks` | `{ context, title, description?, status?, chapter? }` | Title required, trimmed, not blank; description defaults to `""`; status `Open` (default) or `Done`; chapter `null` (default, Context-level) or Chapter id of same Context |
| `PATCH /tasks/:id` | Same keys, all optional | Moving Context requires a valid destination Chapter or `chapter: null` |
| `DELETE /tasks/:id` | | `{ removed: id }` |

### Elements

`POST /elements`:
- New: `{ slice, lane, type, name?, info?, isList?, html?, url?, highlights?, markdown?, color?, fields?, x?, autoConnect? }`.
- Linked copy: `{ slice, lane, copyOf, highlights?, x?, autoConnect? }`; original cannot be a copy or `SCENARIOS`/`NOTES`.
- Lane must belong to slice's Chapter and accept type (`/rules`); `SPEC`: one element per slice.
- `SCREEN` only: `html` or `url`, never both. `NOTES` only: `markdown`, `color` (`red`, `green`, `yellow`). No `info`/`name` on `SCENARIOS`/`NOTES`. `fields` only on `SCREEN`, `COMMAND`, `EVENT`, `READ_MODEL`.
- `highlights`: Screen-only `[{ path: "body/form[1]/input[2]", color: "blue" }]`; unique paths (same-tag sibling indices), lane colours except `none`, no extra keys. Default none; copies edit independently; `[]`/`null` removes. Invalid colours/targets: 400. Structure/id edits clear original/copy selections across Contexts; optional response `clearedHighlights` lists affected ids. Explicit new selections apply after clearing; formatting/text edits preserve.
- `READ_MODEL` only: `isList` is the list-result/code-generation hint, default `false`. `true` is stored; `false` or `null` removes it; other values: 400. Fields still describe one result item; field `list` describes a collection-valued attribute.
- `x`: offset from slice left, ≥ 40 (≥ 20 for `SCENARIOS`/`NOTES`); omitted: board placement. Slice grows as needed.
- `autoConnect=true` by default: Screen→Command, Command→Event, Read Model→Screen, Event→Read Model.
- `fields`: `[{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }]`; default type `string`, flags `false`; `object` has nested `fields`.

`PATCH /elements/:id`: `{ name?, info?, isList?, html?, url?, highlights?, markdown?, color?, fields?, slice?, lane?, x? }`.
- `null` removes optional field; setting `html` removes `url` and vice versa.
- `isList` follows POST rules. Read it from element/Chapter content, not outline/search. Linked copies use their original's setting.
- Move with `slice` + `lane` together, including across Chapters; deletes scenarios using element. `SCENARIOS` cannot change Chapter.
- Linked copies accept only `slice`, `lane`, `x` and Screen `highlights`; otherwise 409 naming original.

### Scenario data

`given`, `then`: lists; `when`: entry or `null`. Entry: `{ element, example? }`; `element`: same-Chapter, non-copy `EVENT` for given/then, `COMMAND` for when. `example`: object of text, booleans, lists or objects. `error`: text or `null`; must be `null` if `then` nonempty.

### Atomic batch

`POST /ops`: `{ ops: [{ method, path, body?, as? }], compact?, verify? }`. Runs edits in order, all or none, one revision. Paths relative to `/api/model`. `as: "a"` binds an id; later `"$a"` path segments/body values resolve to it. `POST /chapters` with `as: "ch"` also binds `$ch.actor`, `$ch.interaction`, `$ch.event` and `$ch.slice` (default lanes and first slice). Aliases cannot collide. Returns `{ results: [{ status, body }] }`. Op errors start `ops[<index>]: `.

**Batch ready writes with `compact: true`** unless full stored bodies are needed. Compact bodies keep present `id`, `from`, `to`, `removed`, `moved`, `clearedHighlights`; status, order and `ETag` stay. `compact` must be boolean; default `false`.

**Verify in the batch:** `verify: ["$ch.slice", "$s", "<slice id>"]` adds `slices` in requested order without duplicates. Invalid input or absent final slice rolls back all writes (400). Summary: `chapter`, `id`, `name`, `type`, `width`, `elements` (`id`, `name`, `type`, `lane`, `connectsTo`, `copyOf?`). Field holders show top-level `fields` names; Read Models show `isList`; Screens show `hasHtml`/`hasUrl`; copies resolve their original. Scenarios show `id`, `name`, `given`/`then` event ids, `when` Command id or null, and `error`. Read exact field definitions, HTML or scenario examples only when needed; the summary does not include them.

Example: `{"compact":true,"ops":[{"method":"POST","path":"/chapters/CH/slices","body":{"name":"Add item"},"as":"s"},{"method":"POST","path":"/elements","body":{"slice":"$s","lane":"LANE","type":"COMMAND","name":"Add item"}}]}`

## Screen HTML write

`PUT /contexts/:id/screens/:screenId/html`: `{ html: text }`, nonempty. Compacts `html`, removes `url`; highlight clearing as above. Returns `{ html, clearedHighlights? }`; HTML always contains `<html>`, `<head>`, `<body>`. Linked copy: 409 with original id; update original.

## Whole-Context pushes (not for agents)

Require `If-Match`. Push list first, then each Context, passing previous response's `ETag` as next `If-Match`.

| PUT path | Body | Effect / result |
|---|---|---|
| `/contexts` | `{ contexts: [{ id, name, info? }] }` | Nonempty, unique ids. Replaces `contexts.yaml`, deletes unlisted Context files; `{ count, removed }` |
| `/contexts/:id` | `{ id, name, tasks?, chapters }`, slices inline | Body id must match path; listed Context must have same name. Writes Context file; omitted/empty tasks removes them; `{ path }` |

## Error statuses

| Status | Meaning |
|---|---|
| 400 | Invalid body/value or board-rule violation |
| 404 | Unknown path id (or missing connection/slice as noted) |
| 409 | Forbidden model change: Default deletion, last required lane/slice, linked-copy fields, `SCENARIOS` Chapter move, file-name collision |
| 412 | Stale `If-Match` |
| 422 | Invalid stored model |
| 428 | Push missing `If-Match` |
