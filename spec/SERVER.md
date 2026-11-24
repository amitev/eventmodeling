# Event Modeling Server — Requirements

HTTP server that hosts the built board ([MODELING_BOARD.md](./MODELING_BOARD.md)). Started as a CLI.

## 1. Hosting

- **S1.1** The server serves the built board from `cli/board/public/`. It never builds it at start.
- **S1.2** `npm run build` writes the board build to `cli/board/public/`.
- **S1.3** `GET`/`HEAD` for a path with no matching file returns `index.html` (SPA fallback). Other methods return 404.
- **S1.4** The server hides `X-Powered-By`.
- **S1.5** `createServer()` (`cli/board/app.js`) returns a not-yet-listening `http.Server`, so WebSockets can attach to it later.

## 2. CLI

- **S2.1** `npx em-cli board` starts the server; `npx em-cli init` installs skills. Package name and bin name are `em-cli`. No command: print usage, exit 0.
- **S2.2** `-p`, `--port <port>`: default the `PORT` environment variable, else `3300`. Must be an integer 0–65535; otherwise exit 1 with usage.
- **S2.3** `--host <host>`: default `localhost`.
- **S2.4** `-h`, `--help`: print usage, exit 0; after a command, print its usage. Unknown commands, options or extra arguments: exit 1 with usage.
- **S2.5** On start print `Event Modeling Board: http://<host>:<port>` and `Model folder: <cwd>/.em/model`.
- **S2.6** Missing board build: exit 1 with "Board build not found. Run "npm run build" first."
- **S2.7** Port in use: exit 1 with "Port <port> is already in use."
- **S2.8** The published package contains `cli/index.js`, `cli/init.js`, `cli/agent/agent.js`, `cli/agent/harnesses/`, board server modules in `cli/board/` (`app.js`, `api.js`, `agent-api.js`, `http-error.js`, `model-edit.js`, `model-rules.js`, `model-store.js`, `html-compact.js`, `html-highlights.js`, `lane-colors.js`), `cli/board/public/` and `.claude/skills/`. Exclude tests. `prepack` runs the build.
  - **Learning (implementation):** Rerun `npm link --force` after changing the bin entry path to refresh installed launchers.
- **S2.9** `--dev`: serve only `/api` (S1.1 and S1.3 do not apply); skip the build check (S2.6). The board comes from the Vite dev server.
S2.10–S2.13 moved to [CLI.md](./CLI.md); IDs unchanged.

- **S2.14** Options follow their command: `board` takes S2.2, S2.3 and S2.9; `init` takes S2.12; `agent` options: [AGENT.md](./AGENT.md#cli-and-sessions). All take S2.4. Reject `--init`, commandless server options and options from another command.
- **S2.15** Once listening, `board` tries to open the default browser at its HTTP URL; skip with `--dev`. Use the actual port, `localhost` for wildcard hosts `0.0.0.0` and `::`, and brackets around IPv6 hosts. Browser-launch failures stay silent and do not stop the server.

S2.16–S2.25 moved to [AGENT.md](./AGENT.md#cli-and-sessions); IDs unchanged.

## 2a. Development

- **S2a.1** `npm run dev` starts the server (`node --watch cli/index.js board --dev`; restarts on code change) and the Vite dev server (port 5173) together. `npm start` runs `board`.
- **S2a.2** The Vite dev server proxies `/api` to `http://localhost:<PORT>`, `PORT` defaulting to `3300`. One `PORT` environment variable sets both the server (S2.2) and the proxy.

## 3. Model storage

The board pushes its Contexts, with their Chapters, to the server after every change and pulls them back when it opens and when the server changes (MODELING_BOARD.md section 10).

- **S3.1** Files live in `<cwd>/.em/model/`, where `<cwd>` is the directory the CLI was started in. The folder is created as needed.
- **S3.2** Written with `js-yaml`.
  - `contexts.yaml`: the ordered list of Contexts, each `id`, `name`, optional `info` (omitted when empty) and `file` (the file name of the Context file, e.g. `backoffice.yaml`). The first is the Default. The server sets `file` from the name on push (S3.3); the board does not send it. Reads use `file`, they do not recompute it. Not part of the export file (R6.2).
  - `<context>.yaml`: one file per Context: `id`, `name`, optional `tasks` (MODELING_BOARD.md R12.1), and `chapters`, the list of its Chapters as received (R6.3), slices inline (R6.4). Every Chapter's `context` equals the Context `id`. Tasks live here, never in `contexts.yaml`.
  - The server does not check a Chapter further; the board does on pull (R10.2).
- **S3.3** `file` is the Context name lower-cased, trimmed, each space replaced by `_`, plus `.yaml`. A rename changes it; the Context push (S3.5) replaces the old file.
- **S3.4** Names are never changed to fit: a Context name that contains `\ / : * ? " < > |` or a control character, ends with a dot, is empty or is a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, also with an extension) gets 400. So does `contexts` (it would be `contexts.yaml`, S3.2). The board prevents these names (MODELING_BOARD.md R1.19); imported ones can still reach the server. Chapter and slice names are not file names and are not checked.
- **S3.5** A Context is identified by its `id` in the file. Pushing it deletes any other file holding that id (rename). Pushing the Contexts deletes the files of Contexts no longer listed. A Context without a file has no Chapters. A file that cannot be read is left alone.
- **S3.6** Collisions get 409, compared case-insensitively: the target file holds another Context id; two pushed Contexts get the same `file`. Nothing is written. A Context not in `contexts.yaml`, or pushed with a name other than the one there, also gets 409.
- **S3.7** Files are written to a `.tmp` file, then renamed. A Context push writes its file, then removes stale files. Operations run one at a time.
- **S3.8** Bodies are JSON (`Content-Type: application/json`, at most 50 MB). No CORS headers. No authentication: with `--host` other than localhost anyone who can reach the port can read and write the folder.
- **S3.9** Not used (was: Slice files, now inline, S3.2). Folders and non-`.yaml` files in the model folder are ignored on pull.
- **S3.10** On push the `html` of every `SCREEN` element (R6.5) is compacted (`cli/board/html-compact.js`, parse5); `url` and other fields are untouched. Pull returns what is stored. Existing files change when pushed again. The output is serialized by parse5, so `<html>`, `<head>` and `<body>` are always present and boolean attributes read `x=""`.
  - Whitespace: runs collapse to one space. Spaces next to a block element, at the start and end of a block, and whitespace-only text between blocks are dropped; a space between inline content stays. Blocks are listed in `BLOCK`; any other element counts as inline. `<pre>`, `<textarea>` and `<listing>` text is kept as is. `<style>` CSS goes on one line: comments removed, whitespace runs one space, quoted strings kept.
  - Comments are removed. `<!DOCTYPE>` is kept.
  - Tags removed with their content: `script`, `noscript`, `title`, `meta`, `base`, `template`, `iframe`, `object`, `embed`, and `link` unless its `rel` has `stylesheet`.
  - Attributes removed: `on*`, `data-*`, `aria-*`, `role`, `autocomplete`, `required`, `minlength`, `maxlength`, `pattern`, `autofocus`, `action`, `method`, `target`, `rel` (kept on a stylesheet `link`), `title`, `tabindex`, `contenteditable`, `spellcheck`, `draggable`, `name`.
  - **Learning (implementation):** removing `name` ungroups radio buttons. Other removals do not change the sandboxed preview (R3.9).
- **S3.11** `GET /api/model/contexts/:id` returns the Chapters of one Context as multi-document YAML (`Content-Type: application/yaml`): one document per Chapter, each starting with `---`, as stored (S3.2, S3.10), ordered by `x`, `y`, `id` (R6.8). Only that Context's file is read. A Context without a file or Chapters gives an empty body.
- **S3.12** S3.11 takes the query parameter `screenContent` (`true` or `false`, default `true`). With `false` the `html` of every `SCREEN` element (R6.5) is left out; `url` and other fields stay. Any other value gets 400.
- **S3.13** `GET /api/model/contexts/:id/screens` lists the `SCREEN` elements (R6.5) of one Context, linked copies included, without `html` or `url`: `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`. Query `name` keeps those with that name (whole name, case-insensitive, trimmed); with `contains=true` (`true` or `false`, default `false`, other values 400) a part of the name is enough. Query `chapter` keeps those of the Chapter with that id or name (case-insensitive). Without both, all. A Context without a file gives `[]`. Order as stored.
  - Copies resolve original `name`, `hasHtml` and `hasUrl` across Contexts; `name` filters use resolved names. Identity and location stay the copy's.
- **S3.14** `GET /api/model/contexts/:id/screens/:screenId` returns S3.13 plus `html` or `url` and optional own `highlights` (R3.7b). Copies resolve original name/content across Contexts but never inherit highlights. HTML excludes generated highlight markup; selections stay separate.
- **S3.15** `PUT /api/model/contexts/:id/screens/:screenId/html` with `{ html: text }` (not empty) sets compacted `html` (S3.10), removes `url` (R3.7) and follows S4.17a. Other fields stay. Returns `{ html, clearedHighlights? }`. A linked copy gets 409 naming its original. The board shows the change by auto-pull (R10.6); a push with an older revision gets 412 (S4.2).

### API

Errors: `{ "error": text }` with the status below. Unknown `/api` paths get 404.

| Request | Body | Result |
|---|---|---|
| `PUT /api/model/contexts` | `{ contexts: [{ id, name, info? }] }`: not empty, unique ids, `info` text if present | Writes `contexts.yaml` with `file` added (S3.2); deletes the files of Contexts not listed (S3.5); `{ count, removed }`. `If-Match` required (S4.2). 400 invalid body or name (S3.4), 409 same `file` twice (S3.6), 412 stale revision, 428 no `If-Match` |
| `PUT /api/model/contexts/:id` | The whole Context `{ id, name, tasks?, chapters }` (R6.3, R12.1, slices inline); `id` equals `:id`; every Chapter has `id`, `name`, `context` = `:id` and slices with unique ids; chapter ids unique | Writes the Context file (S3.2); `{ path }` of it. Tasks validated as R12.1; omitted/empty removes tasks. `If-Match` required (S4.2). 400 invalid body or name, 409 collision, unknown Context or other name (S3.6), 412 stale revision, 428 no `If-Match` |
| `GET /api/model/contexts/:id?screenContent=` | | The Context's Chapters as multi-document YAML (S3.11); `screenContent=false` omits Screen `html` (S3.12). 400 invalid `screenContent`, 404 no `contexts.yaml` or unknown Context, 422 the Context file cannot be read, is invalid or holds another Context (as `GET /api/model`) |
| `GET /api/model/contexts/:id/screens?name=&chapter=&contains=` | | The Context's Screens without `html` (S3.13). 400 invalid `contains`, 404 unknown Context, 422 as `GET /api/model/contexts/:id` |
| `GET /api/model/contexts/:id/screens/:screenId` | | The Screen with its `html` or `url` (S3.14). 404 unknown Context or Screen, 422 as above |
| `PUT /api/model/contexts/:id/screens/:screenId/html` | `{ html: text }`, not empty | Sets compacted `html`, removes `url` (S3.15); `{ html, clearedHighlights? }`. 400 invalid body, 404 unknown Context or Screen, 409 linked copy, 422 as above |
| `GET /api/model` | | Export file (MODELING_BOARD.md R6.2, slices inline): Contexts in file order, Chapters by `x`, `y`, `id` (R6.8); `ETag` header (S4.1). 404 no `contexts.yaml`, 422 a file cannot be read, has no Context `id` and `name` or no `chapters` list of Chapters with `id`, `context` (= the Context) and `slices`, or its Context is not in `contexts.yaml`; 422 also an entry of `contexts.yaml` without `id`, `name` or a valid `file` (message names the file) |

## 4. Editing API

Small edits for LLM agents; the board follows (MODELING_BOARD.md R10.6). Paths are under `/api/model`, bodies and results JSON. Rules the board applies are referenced, not restated; a write that would break them is refused (S4.4).

### Revision

- **S4.1** The **revision** is an opaque text that changes whenever the stored model changes. An empty store has one. It is the `ETag` header of `GET /api/model`, of `GET /api/model/revision` (`{ revision }`) and of every successful write (S3.5 pushes and section 4 writes).
- **S4.2** The Context pushes (S3.5) need `If-Match: <revision>`. Missing: 428. Not the current revision: 412, nothing written. Section 4 writes may send it; if present it is checked the same way.
- **S4.3** `GET /api/model/events` is a Server-Sent Events stream. It sends `data: { "revision": text }` on connect and after every change made through this server (S3.5, section 4). Changes to the files made outside the server are not announced.

### Rules

- **S4.4** Status: 400 invalid body or value, an unknown id in a body, or refused by a board rule (lane type R2.10, connection R4.7, margins R5.16, names S3.4, checks R7.4; the result is checked as R7.4 before it is written); 404 unknown id in the path; 409 the current model does not allow it (last lane R2.5, last slice R5.19, the Default R1b.3, a linked copy's own fields R3.22, a Scenarios element changing Chapter, S3.6); 422 the stored model fails R7.4 (message names the problem). Nothing is written on an error. Unknown body fields get 400.
- **S4.5** Items are addressed by id alone (R1.14: unique in the model), so no Context or Chapter is in the path. The server creates ids as R1.14 does, with a secure random source. A Chapter's `x`, `y` and a slice's `width` are multiples of 20 (R1.3).
- **S4.6** Every write compacts Screen `html` (S3.10), keeps the order of R6.8 and returns the item as stored, with the `ETag`; creations get 201. A delete returns `{ removed }`: the ids of the `elements` (copies included) and `scenarios` that went with it (cascades S4.7); deleting a Context returns `{ moved }`, the ids of its Chapters that moved to the Default (R1b.6); deleting a scenario returns `{ removed }`, its id.
- **S4.7** Layout is the server's job, as the board does it: element placement R5a.10, R5.14, R5.17; slice width R5.9, R5.16; centring (R3.6a) is not stored. Deleting follows the cascades R1a.6, R2.5, R5.18, R3.17, R3.22 and R1b.6, without asking.

### Read

- **S4.8** `GET /rules` returns what an agent must not guess: element types, lane types in order with the element types each takes (R2.10), allowed connections (R4.7), lane colours including `white`/`black` (R2.6), Notes colours (R3.24), Processor icon names (R3.6), the field types (R9).
- **S4.9** `GET /outline?context=` returns the Contexts (only the one with id `context`, when given), each with its Chapters: `id`, `name`, `x`, `y`, `connectsTo`, lanes (`id`, `name`, `type`) and slices (`id`, `name`, `type`, `flowEnd?`, `width`, `connectsTo`) with their elements `{ id, type, name, lane, x, copyOf?, connectsTo }` (`name` of a linked copy is its original's). No `html`, `url`, `fields`, `info`, `markdown` or scenarios. Order as R6.8.
- **S4.10** `GET /search?q=&type=&context=` lists elements `{ id, type, name, chapterId, sliceId, lane }`. `q`: part of the name, case-insensitive; `type`: an element type (upper case); `context`: a Context id. Without all three, all elements.
- **S4.11** `GET /chapters/:id?screenContent=` returns the Chapter as stored (R6.3; `screenContent` as S3.12). `GET /elements/:id` returns the element as stored (R6.5), a linked copy as its own entry (unlike S3.14).
- **S4.21** `GET /chapters/:id?slice=` returns `{ chapter, context, slices }`. `chapter` holds all Chapter fields except `slices`, including its Context id (`context`) and `lanes`. `context` holds `id`, `name` and optional `info` only. `slices` holds only the requested slice. Unknown slice in that Chapter: 404; non-text `slice`: 400. `screenContent` follows S4.11.
### Write

- **S4.12** **Contexts.** `POST /contexts` `{ name, info? }`; `PATCH /contexts/:id` `{ name?, info? }` (`info` null or empty removes it; `name` optional); `DELETE /contexts/:id` (its Chapters move to the Default, R1b.6).
- **S4.13** **Chapters.** `POST /chapters` `{ context, name, x?, y? }` creates the Chapter as R1a.2 (`x`, `y` default 0). `PATCH /chapters/:id` `{ name?, info?, context?, x?, y? }`. `DELETE /chapters/:id`. `PUT` and `DELETE /chapters/:id/connections/:targetId` add and remove a Chapter connection (R1a.10).
- **S4.14** **Lanes.** `POST /chapters/:id/lanes` `{ type, after, name?, color? }` adds a lane right below lane `after`; `name` defaults to the type name (R2.2); the type order must hold (R2.10, R2.3a). `PATCH /lanes/:id` `{ name?, info?, color? }`; the type never changes. `DELETE /lanes/:id`.
- **S4.15** **Slices.** `POST /chapters/:id/slices` `{ name?, after?, width? }`: `name` defaults to "New Slice", `after` is a slice id (default: the last), `width` to 220. `PATCH /slices/:id` `{ name?, info?, flowEnd?, width?, index? }`; `index` is the 0-based place among the Chapter's slices (R5.8). `DELETE /slices/:id`.
- **S4.22** `PUT` and `DELETE /slices/:id/connections/:targetId` add and remove slice-to-Chapter arrows (R1a.12), stored in the slice's `connectsTo` (R6.4). Add refuses own Chapter, different Context or repeat (400). Unknown ids or absent arrow on delete: 404. No fields copied. Chapter deletion removes incoming slice arrows; slice deletion removes its outgoing arrows.
- **S4.16** **Elements.** `POST /elements` `{ slice, lane, type, name?, info?, icon?, isList?, html?, url?, highlights?, markdown?, color?, fields?, x?, autoConnect? }`, or `{ slice, lane, copyOf, highlights?, x?, autoConnect? }` for a linked copy (R3.22; the original is not a copy). Highlights follow S4.17a. `icon` is a Processor icon name (R3.6). `isList` is Read Model-only (R3.25): `true` stores it; `false` or `null` removes it; other values get 400. The lane belongs to the slice's Chapter and takes the type (R2.10). Fields as R9.6, a field's `type` defaulting to `string` and its flags to `false`; `html` and `url` not both. `x` is relative to the slice (R6.5), at least the margin (R5.16); without it the element is placed as R5a.10. `autoConnect` (default `true`) adds the arrows of R4.8, including those of a Processor, "nearest" being by lane distance; like every new arrow they copy fields as R9.4 (S4.18).
- **S4.17** `PATCH /elements/:id` `{ name?, info?, icon?, isList?, html?, url?, highlights?, markdown?, color?, fields?, slice?, lane?, x? }`. `icon` is a Processor icon name; `null` restores the default (R3.6). `isList` follows S4.16; highlights follow S4.17a. `null` removes other optional fields. Setting `html` clears `url` and the reverse (R3.7). `slice` and `lane` come together and move the element, also to another Chapter (R1a.5; the scenarios that use it go, R3.17; a Scenarios element stays in its Chapter, S4.4); without `x` it is placed as R5a.10, with `x` as given; its arrows stay and none are added. `x` alone moves it inside its Cell. A linked copy accepts only `slice`, `lane`, `x` and Screen `highlights`; other fields get 409 naming the original (as S3.15). `DELETE /elements/:id`.
- **S4.17a** **Screen highlights.** S4.16/S4.17 accept `highlights: [{ path, color }]` on original and copy `SCREEN`s (R3.7b): unique valid paths into original HTML; each `color` is a lane colour except `none`. Missing/invalid colours, extra entry keys, other element types or missing targets get 400. `[]`/`null` removes highlights; omit empty storage, default none. Copy's shared content remains read-only. HTML structure/id changes clear original/copy highlights across Contexts; writes return affected ids as optional `clearedHighlights`, never stored. Explicit new `highlights` in same PATCH apply after clearing. Formatting/text/other attribute edits preserve selections. Whole-Context pushes carry board's cleared state; they do not cascade into other Contexts.
  - Replacing `fields` copies nothing downstream. Clients apply Propagate (R9.4) with explicit downstream PATCHes, atomically via S4.20.
- **S4.18** **Connections.** `POST /connections` `{ from, to }` between two elements; the server sets the direction (R4.7); a repeat is refused (R4.5). The source's fields are copied to the target as R9.4 says for an added arrow (without Propagate). `DELETE /connections` `{ from, to }` (either order).
- **S4.19** **Scenarios** (R3.11 to R3.16), addressed by their id. `POST /elements/:id/scenarios` `{ name, description?, given?, when?, then?, error?, index? }` appends (or inserts at `index`) to a Scenarios element. `PATCH /scenarios/:id` the same fields. `DELETE /scenarios/:id`. `POST /scenarios/:id/copy` inserts an identical scenario right after (R3.14). Entries and `error` as R6.5, checked as R7.4.
- **S4.23** **Tasks.** `GET /tasks?context=` lists tasks as `{ context, id, title, description, status, chapter }`, all Contexts by default; unknown Context 404. Order as R6.8. `GET /tasks/:id` returns task as R12.1. `POST /tasks` `{ context, title, description?, status?, chapter? }` creates one with defaults from R12.1. `PATCH /tasks/:id` accepts same keys, all optional; `context` may move it, but `chapter` must remain valid in destination (send `null` to detach). `DELETE /tasks/:id` returns `{ removed: id }`. Chapter/Context changes follow R12.4. `/rules` includes `taskStatuses`.

### Batch

- **S4.20** `POST /ops` `{ ops: [{ method, path, body?, as? }], compact? }` runs the requests of S4.12 to S4.19, S4.22 and S4.23 in order, atomically: all or none. One write, one revision. `path` is relative to `/api/model`. `as` names the `id` of the item an op creates; a later `path` segment or `body` value that is exactly `"$<as>"` is replaced by it. Result `{ results: [{ status, body }] }`, in order; compact bodies follow S4.24. On the first error nothing is written and the response has that op's status and `{ "error": text }` with the text starting `ops[<index>]: `.
- **S4.24** `compact` is boolean, default `false`; other values get 400 before any op. With `true`, each result body keeps only present `id`, `from`, `to`, `removed`, `moved`, `clearedHighlights`; status/order, aliases, validation, atomicity and `ETag` stay unchanged. Omitted/false returns full bodies (S4.6).
- **S4.25** `/outline?detail=chapters` returns only Context `id`, `name`, `chapters` and Chapter `id`, `name`, `x`, `y`; `context` and order follow S4.9. Default `detail=full` follows S4.9; other values get 400.
- **S4.26** In S4.20, `POST /chapters` with `as: "ch"` also binds `ch.actor`, `ch.interaction`, `ch.event` and `ch.slice` to the three default lanes and first slice. All alias names must be unused.
- **S4.27** `/ops` accepts optional `verify`, a list of final slice ids or batch aliases. Invalid shape or unknown final slice gets 400 and rolls back the batch. Response adds `slices` in requested order, deduplicated by resolved id. Each gives `chapter` (id), `id`, `name`, `type`, `width` and `elements` with `id`, `name`, `type`, `lane`, `connectsTo`, `copyOf?`. Field holders give top-level `fields` names; Read Models give `isList`; Screens give `hasHtml`, `hasUrl`. A copy uses its original's definition. Scenarios give `scenarios: [{ id, name, given, when, then, error }]`; `given`/`then` list event ids and `when` is a Command id or null. No HTML or examples. Independent of `compact`.

### Editing API table

| Request | Result |
|---|---|
| `GET /api/model/revision`, `GET /api/model/events`, `GET /api/model/rules`, `GET /api/model/outline`, `GET /api/model/search` | S4.1, S4.3, S4.8 to S4.10 |
| `GET /api/model/chapters/:id`, `GET /api/model/elements/:id` | S4.11, S4.21 (`?slice=`) |
| `POST /api/model/contexts`, `PATCH`/`DELETE /api/model/contexts/:id` | S4.12 |
| `POST /api/model/chapters`, `PATCH`/`DELETE /api/model/chapters/:id`, `PUT`/`DELETE /api/model/chapters/:id/connections/:targetId` | S4.13 |
| `POST /api/model/chapters/:id/lanes`, `PATCH`/`DELETE /api/model/lanes/:id` | S4.14 |
| `POST /api/model/chapters/:id/slices`, `PATCH`/`DELETE /api/model/slices/:id`, `PUT`/`DELETE /api/model/slices/:id/connections/:targetId` | S4.15, S4.22 |
| `POST /api/model/elements`, `PATCH`/`DELETE /api/model/elements/:id` | S4.16, S4.17 |
| `POST`/`DELETE /api/model/connections` | S4.18 |
| `POST /api/model/elements/:id/scenarios`, `PATCH`/`DELETE /api/model/scenarios/:id`, `POST /api/model/scenarios/:id/copy` | S4.19 |
| `GET`/`POST /api/model/tasks`, `GET`/`PATCH`/`DELETE /api/model/tasks/:id` | S4.23 |
| `POST /api/model/ops` | S4.20 |

Statuses as S4.4; 422 as `GET /api/model` when a stored file cannot be read.
