# Event Modeling server API

Base: `http://localhost:3300/api/model` (`npx em-cli board`, `--port` override). Relative paths; `/` = base. JSON bodies ≤50 MB; no auth. Errors: HTTP status + `{ error: text }`. `?` = optional key.

## HTTP requests

- API reads/writes: prefer `curl` (`curl.exe` in Windows PowerShell). Other clients only if curl unavailable/insufficient; state why. Never switch clients to bypass denied approval.
- Safely serialize JSON; send `Content-Type: application/json`. Complex bodies: `--data-binary @<payload-file>`, UTF-8, outside `.em/model/`. Check HTTP status/error body.
- Scripts may prepare/filter data, not replace curl when sufficient. Keep prescribed bundled analysis/export scripts.
- All skill temporary files/folders belong in `<cwd>/.em/.tmp/`; create as needed. Delete own temporary files after use; if cleanup needs approval, report leftovers.
- Prefer relative paths over absolute ones in commands.
- **NEVER delete files/folders outside the task's working directory.** Resolve each target before deletion; reject paths escaping through `..`, symlinks or junctions. Never change directories to evade this boundary. Temporary-file cleanup: Bash `rm [-f|-rf] .em/.tmp/<file>`; Windows PowerShell `Remove-Item -LiteralPath .em\.tmp\<file>`. Inspected, task-owned files only; no extra targets outside `.em/.tmp/`.

## Agent rules and storage

- **API only. Never read/create/edit/delete `<cwd>/.em/model/` files. Use atomic, board-validated editing endpoints, not whole-Context pushes.**
- Storage: `contexts.yaml` = ordered `[{ id, name, info?, file }]`; first Context = Default. Each `<file>` = `{ id, name, tasks?, chapters }`, slices inline. Chapter `context` must reference a listed Context id; Tasks live in its file.
- Every write compacts all Screen `html`.
- Board auto-pulls after in-flight sync; warns when replacing unpushed edits.
- Revision: opaque text, changes per stored-model change. `GET /`, `GET /revision` and all writes return `ETag`. Pushes require `If-Match: "<revision>"`; editing writes check only if supplied.
- Read `GET /rules` once/session; lookups: `model-navigation`. Server ids: globally unique, 6 characters (`a-zA-Z0-9`); address by id alone. Types uppercase; names free text except Contexts.
- Context names: nonempty file names; no `\ / : * ? " < > |`, control characters, trailing dot, `contexts` or Windows device names.
- `info`: Markdown on Chapters, lanes, slices and elements, mainly implementation details; no citations/summaries/traceability. Summaries → `NOTES`, which may hold implementation details.

## Task capture

After reporting findings, offer Tasks; skip if none.
- Before writes, confirm selection, business-language titles and Context/Chapter. Descriptions keep questions/evidence; uncertain findings remain questions, not fixes.
- Read-only reviews permit only approved Task creation; approval never authorizes model fixes.
- `POST /tasks`, default status; Chapter-specific: its id, Context-wide: `chapter: null`.
- Read back: `GET /tasks?context=<contextId>`; report saved count/titles and failures.

## Reads

| GET path | Result / query |
|---|---|
| `/` | Whole model JSON; Contexts in file order, Chapters sorted by `x`, `y`, `id` |
| `/revision` | `{ revision }` |
| `/events` | SSE `data: {"revision":"…"}` on connect/server changes, not manual file edits |
| `/rules` | `{ elementTypes, laneTypes: [{ type, label, takes }], connections: [{ from, to }], laneColors, noteColors, fieldTypes, fieldFlags }` |
| `/outline?context=` | Contexts → Chapters `{ id, name, x, y, connectsTo, lanes: [{ id, name, type }], slices: [{ id, name, type, flowEnd?, width, elements: [{ id, type, name, lane, x, copyOf?, connectsTo }] }] }`. Optional Context id filter; excludes `html`, `url`, `fields`, `info`, `markdown`, scenarios; copies use original names |
| `/outline?detail=chapters&context=` | Context `{ id, name, chapters }`; Chapter `{ id, name, x, y }`. Same filter; default `detail=full` |
| `/search?q=&type=&context=` | `[{ id, type, name, chapterId, sliceId, lane }]`; `q`: case-insensitive name substring; `type`: element type; `context`: Context id |
| `/chapters/:id?screenContent=&slice=` | No `slice` query: stored Chapter. With `slice=<sliceId>`: `{ chapter, context, slices }`; `chapter` includes lanes, `context` excludes tasks, `slices` contains only requested slice (404 if absent). `screenContent=false` omits Screen `html` |
| `/elements/:id` | Stored element, copy's own entry |
| `/tasks?context=` | `[{ context, id, title, description, status, chapter }]`; omitted filter = all Contexts. Context order, then creation order |
| `/tasks/:id` | Stored task `{ id, title, description, status, chapter }` |
| `/contexts/:id?screenContent=` | `application/yaml`: one `---` document/Chapter, sorted by `x`, `y`, `id`; empty if none. Default `screenContent=true`; `false` omits Screen `html` |
| `/contexts/:id/screens?name=&contains=&chapter=` | Includes linked copies, no `html`: `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`. Copies resolve original name/content flags across Contexts; own identity/location. `name`: case-insensitive whole resolved name, substring if `contains=true`; `chapter`: case-insensitive id/name. No filters: all Screens; names may repeat |
| `/contexts/:id/screens/:screenId` | Same shape + `html`/`url`, own `highlights?`. Copies resolve original name/content across Contexts, never highlights |

## Editing writes

Unknown body keys/ids: 400; unknown path ids: 404. Board-pull validation. Returns stored item + `ETag` unless noted; creation: 201.

| Request | Body | Effect / limits / result |
|---|---|---|
| `POST /contexts` | `{ name, info? }` | File-safe name |
| `PATCH /contexts/:id` | `{ name?, info? }` | `info: null` or empty removes it |
| `DELETE /contexts/:id` | | Default: 409; otherwise move Chapters to Default; `{ moved }` |
| `POST /chapters` | `{ context, name, x?, y? }` | Actor, Interaction, Event lanes + "New Slice" (220). `x`, `y`: multiples of 20, default 0 |
| `PATCH /chapters/:id` | `{ name?, info?, context?, x?, y? }` | |
| `DELETE /chapters/:id` | | `{ removed: { elements, scenarios } }` |
| `PUT` / `DELETE /chapters/:id/connections/:targetId` | | Chapter → Chapter arrow |
| `POST /chapters/:id/lanes` | `{ type, after, name?, color?, info? }` | Below lane `after`; preserve `/rules` lane-type order. Default `color: none` |
| `PATCH /lanes/:id` | `{ name?, info?, color? }` | Cannot change type |
| `DELETE /lanes/:id` | | Deletes elements; 409 for last Actor, Interaction or Event lane |
| `POST /chapters/:id/slices` | `{ name?, after?, width? }` | Defaults: "New Slice", after last slice, width 220. Width multiple of 20, ≥ 120 |
| `PATCH /slices/:id` | `{ name?, info?, flowEnd?, width?, index? }` | `index`: 0-based Chapter position; width must fit elements |
| `DELETE /slices/:id` | | Deletes elements; 409 for last slice |
| `PUT` / `DELETE /slices/:id/connections/:targetId` | | Slice bottom centre → other Chapter in same Context, never own. Stored in slice `connectsTo`; no field copies |
| `DELETE /elements/:id` | | Deletes linked copies, arrows, scenarios using it; `{ removed: { elements, scenarios } }` |
| `POST /connections` | `{ from, to }` | Either element order; flow rules set direction. Invalid/repeated pair: 400. Copies source fields |
| `DELETE /connections` | `{ from, to }` | Either order; 404 if not connected |
| `POST /elements/:id/scenarios` | `{ name, description?, given?, when?, then?, error?, index? }` | Requires `SCENARIOS` element |
| `PATCH /scenarios/:id` | Same fields | |
| `DELETE /scenarios/:id` | | `{ removed }` |
| `POST /scenarios/:id/copy` | | Insert after original |
| `POST /tasks` | `{ context, title, description?, status?, chapter? }` | Title required, trimmed, nonblank. Defaults: description `""`, status `Open`, chapter `null` (Context-level). Status: `Open`/`Done`; Chapter id must belong to Context |
| `PATCH /tasks/:id` | Same keys, all optional | Moving Context requires a valid destination Chapter or `chapter: null` |
| `DELETE /tasks/:id` | | `{ removed: id }` |

### Elements

`POST /elements`:
- New: `{ slice, lane, type, name?, info?, isList?, html?, url?, highlights?, markdown?, color?, fields?, x?, autoConnect? }`.
- Copy: `{ slice, lane, copyOf, highlights?, x?, autoConnect? }`; original cannot be copy/`SCENARIOS`/`NOTES`.
- Lane: same Chapter as slice, accepts type (`/rules`); `SPEC`: one element/slice.
- Type-only keys: `SCREEN`: `html`/`url` (never both), `highlights`; `NOTES`: `markdown`, `color` (`red`, `green`, `yellow`); `READ_MODEL`: `isList`. No `info`/`name` on `SCENARIOS`/`NOTES`. `fields`: `SCREEN`, `COMMAND`, `EVENT`, `READ_MODEL` only.
- `highlights`: `[{ id: "customer-name", color: "blue" }]`; prefer unique nonempty HTML ids, else `{ path: "body/form[1]/input[2]", color: "blue" }` (same-tag sibling indices). Exactly one target key/entry; no duplicate targets/extra keys. Lane colours except `none`; default no highlights; `[]`/`null` removes. Invalid colour/target: 400. Copies edit independently. Across Contexts: structure/id edits clear path selections; id selections survive while unique target exists. Response `clearedHighlights?`: affected Screen ids. Explicit selections apply after clearing; formatting/text edits preserve selections.
- `isList`: list-result/code-generation hint, default `false`; `true` stores, `false`/`null` removes, other values: 400. Fields describe one result item; field `list` marks collection-valued attributes.
- `x`: offset from slice left, ≥40 (≥20 for `SCENARIOS`/`NOTES`); omitted: board placement. Slice grows as needed.
- Default `autoConnect=true`: Screen→Command, Command→Event, Read Model→Screen, Event→Read Model.
- `fields`: `[{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }]`; defaults: type `string`, flags `false`; `object` nests `fields`.

`PATCH /elements/:id`: `{ name?, info?, isList?, html?, url?, highlights?, markdown?, color?, fields?, slice?, lane?, x? }`.
- `null` removes optional field; `html`/`url` replaces the other.
- `isList`: POST rules; read from element/Chapter content, not outline/search; copies use original's value.
- Move: `slice` + `lane` together, even across Chapters; deletes scenarios using element. `SCENARIOS` cannot change Chapter.
- Copies accept only `slice`, `lane`, `x`, Screen `highlights`; otherwise 409 naming original.

### Scenario data

`given`/`then`: lists; `when`: entry/`null`. Entry: `{ element, example? }`; same-Chapter, non-copy `EVENT` for given/then, `COMMAND` for when. `example`: object of text/booleans/lists/objects. `error`: text/`null`; nonempty `then` requires `null`.

### Atomic batch

`POST /ops`: `{ ops: [{ method, path, body?, as? }], compact?, verify? }`. Ordered edits, all-or-none, one revision. `as: "a"` binds id for later `"$a"` path segments/body values. `POST /chapters`, `as: "ch"` also binds `$ch.actor`, `$ch.interaction`, `$ch.event`, `$ch.slice` (default lanes/first slice). No alias collisions. Returns `{ results: [{ status, body }] }`; error prefix: `ops[<index>]: `.

**Batch ready writes with `compact: true`** unless full bodies needed. Keeps present `id`, `from`, `to`, `removed`, `moved`, `clearedHighlights`; preserves status/order/`ETag`. `compact`: boolean, default `false`.

**Verify in batch:** `verify: ["$ch.slice", "$s", "<slice id>"]` adds ordered, deduplicated `slices`. Invalid input/missing final slice: 400, full rollback. Summary: `chapter`, `id`, `name`, `type`, `width`, `elements` (`id`, `name`, `type`, `lane`, `connectsTo`, `copyOf?`). Field holders: top-level `fields` names; Read Models: `isList`; Screens: `hasHtml`/`hasUrl`; copies resolve originals. Scenarios: `id`, `name`, `given`/`then` Event ids, `when` Command id/`null`, `error`. Exact field definitions, HTML and scenario examples omitted; read only when needed.

Example: `{"compact":true,"ops":[{"method":"POST","path":"/chapters/CH/slices","body":{"name":"Add item"},"as":"s"},{"method":"POST","path":"/elements","body":{"slice":"$s","lane":"LANE","type":"COMMAND","name":"Add item"}}]}`

## Screen HTML write

`PUT /contexts/:id/screens/:screenId/html`: `{ html: text }`, nonempty. Compacts HTML, removes `url`; [highlight rules](#elements) apply. Returns `{ html, clearedHighlights? }` with `<html>`, `<head>`, `<body>`. Copy: 409 with original id; update original.

## Whole-Context pushes (not for agents)

Push list, then each Context; pass previous `ETag` as next `If-Match` (required).

| PUT path | Body | Effect / result |
|---|---|---|
| `/contexts` | `{ contexts: [{ id, name, info? }] }` | Nonempty, unique ids; replaces `contexts.yaml`, deletes unlisted files; `{ count, removed }` |
| `/contexts/:id` | `{ id, name, tasks?, chapters }`, slices inline | Body id matches path, name matches listed Context. Writes Context file; omitted/empty tasks removes them; `{ path }` |

## Error statuses

| Status | Meaning |
|---|---|
| 400 | Invalid body/value or board-rule violation |
| 404 | Unknown path id (or missing connection/slice as noted) |
| 409 | Forbidden model change: Default deletion, last required lane/slice, linked-copy fields, `SCENARIOS` Chapter move, file-name collision |
| 412 | Stale `If-Match` |
| 422 | Invalid stored model |
| 428 | Push missing `If-Match` |
