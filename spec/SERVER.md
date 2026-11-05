# Event Modeling Server — Requirements

HTTP server that hosts the built board ([MODELING_BOARD.md](./MODELING_BOARD.md)). Started as a CLI.

## 1. Hosting

- **S1.1** The server serves the built board from `server/public/`. It never builds it at start.
- **S1.2** `npm run build` writes the board build to `server/public/`.
- **S1.3** `GET`/`HEAD` for a path with no matching file returns `index.html` (SPA fallback). Other methods return 404.
- **S1.4** The server hides `X-Powered-By`.
- **S1.5** `createServer()` (`server/app.js`) returns a not-yet-listening `http.Server`, so WebSockets can attach to it later.

## 2. CLI

- **S2.1** Started with `npx event-modeling-cli`. Package name and bin name are `event-modeling-cli`.
- **S2.2** `-p`, `--port <port>`: default the `PORT` environment variable, else `3300`. Must be an integer 0–65535; otherwise exit 1 with usage.
- **S2.3** `--host <host>`: default `localhost`.
- **S2.4** `-h`, `--help`: print usage, exit 0. Unknown options: exit 1 with usage.
- **S2.5** On start print `Event Modeling Board: http://<host>:<port>` and `Model folder: <cwd>/.event-modeling/model`.
- **S2.6** Missing board build: exit 1 with "Board build not found. Run "npm run build" first."
- **S2.7** Port in use: exit 1 with "Port <port> is already in use."
- **S2.8** The published package contains `server/index.js`, `server/app.js`, `server/api.js`, `server/http-error.js`, `server/model-edit.js`, `server/model-rules.js`, `server/model-store.js`, `server/html-compact.js` and `server/public/`. `prepack` runs the build.
- **S2.9** `--dev`: serve only `/api` (S1.1 and S1.3 do not apply); skip the build check (S2.6). The board comes from the Vite dev server.

## 2a. Development

- **S2a.1** `npm run dev` starts the server (`node --watch`, `--dev`; restarts on code change) and the Vite dev server (port 5173) together.
- **S2a.2** The Vite dev server proxies `/api` to `http://localhost:<PORT>`, `PORT` defaulting to `3300`. One `PORT` environment variable sets both the server (S2.2) and the proxy.

## 3. Model storage

The board pushes its Contexts, with their Chapters, to the server and pulls them back (MODELING_BOARD.md section 10).

- **S3.1** Files live in `<cwd>/.event-modeling/model/`, where `<cwd>` is the directory the CLI was started in. The folder is created as needed.
- **S3.2** Written with `js-yaml`.
  - `contexts.yaml`: the ordered list of Contexts, each `id`, `name` and `file` (the file name of the Context file, e.g. `backoffice.yaml`). The first is the Default. The server sets `file` from the name on push (S3.3); the board does not send it. Reads use `file`, they do not recompute it. Not part of the export file (R6.2).
  - `<context>.yaml`: one file per Context: `id`, `name` and `chapters`, the list of its Chapters as received (MODELING_BOARD.md R6.3), slices inline (R6.4). Every Chapter's `context` equals the Context `id`.
  - The server does not check a Chapter further; the board does on pull (R10.2).
- **S3.3** `file` is the Context name lower-cased, trimmed, each space replaced by `_`, plus `.yaml`. A rename changes it; the Context push (S3.5) replaces the old file.
- **S3.4** Names are never changed to fit: a Context name that contains `\ / : * ? " < > |` or a control character, ends with a dot, is empty or is a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, also with an extension) gets 400. So does `contexts` (it would be `contexts.yaml`, S3.2). The board prevents these names (MODELING_BOARD.md R1.19); imported ones can still reach the server. Chapter and slice names are not file names and are not checked.
- **S3.5** A Context is identified by its `id` in the file. Pushing it deletes any other file holding that id (rename). Pushing the Contexts deletes the files of Contexts no longer listed. A Context without a file has no Chapters. A file that cannot be read is left alone.
- **S3.6** Collisions get 409, compared case-insensitively: the target file holds another Context id; two pushed Contexts get the same `file`. Nothing is written. A Context not in `contexts.yaml`, or pushed with a name other than the one there, also gets 409.
- **S3.7** Files are written to a `.tmp` file, then renamed. A Context push writes its file, then removes stale files. Operations run one at a time.
- **S3.8** Bodies are JSON (`Content-Type: application/json`, at most 50 MB). No CORS headers. No authentication: with `--host` other than localhost anyone who can reach the port can read and write the folder.
- **S3.9** Not used (was: Slice files, now inline, S3.2). Folders and non-`.yaml` files in the model folder are ignored on pull.
- **S3.10** On push the `html` of every `SCREEN` element (R6.5) is compacted (`server/html-compact.js`, parse5); `url` and other fields are untouched. Pull returns what is stored. Existing files change when pushed again. The output is serialized by parse5, so `<html>`, `<head>` and `<body>` are always present and boolean attributes read `x=""`.
  - Whitespace: runs collapse to one space. Spaces next to a block element, at the start and end of a block, and whitespace-only text between blocks are dropped; a space between inline content stays. Blocks are listed in `BLOCK`; any other element counts as inline. `<pre>`, `<textarea>` and `<listing>` text is kept as is. `<style>` CSS goes on one line: comments removed, whitespace runs one space, quoted strings kept.
  - Comments are removed. `<!DOCTYPE>` is kept.
  - Tags removed with their content: `script`, `noscript`, `title`, `meta`, `base`, `template`, `iframe`, `object`, `embed`, and `link` unless its `rel` has `stylesheet`.
  - Attributes removed: `on*`, `data-*`, `aria-*`, `role`, `autocomplete`, `required`, `minlength`, `maxlength`, `pattern`, `autofocus`, `action`, `method`, `target`, `rel` (kept on a stylesheet `link`), `title`, `tabindex`, `contenteditable`, `spellcheck`, `draggable`, `name`.
  - **Learning (implementation):** removing `name` ungroups radio buttons. Other removals do not change the sandboxed preview (R3.9).
- **S3.11** `GET /api/model/contexts/:id` returns the Chapters of one Context as multi-document YAML (`Content-Type: application/yaml`): one document per Chapter, each starting with `---`, as stored (S3.2, S3.10), ordered by `x`, `y`, `id` (R6.8). Only that Context's file is read. A Context without a file or Chapters gives an empty body.
- **S3.12** S3.11 takes the query parameter `screenContent` (`true` or `false`, default `true`). With `false` the `html` of every `SCREEN` element (R6.5) is left out; `url` and other fields stay. Any other value gets 400.
- **S3.13** `GET /api/model/contexts/:id/screens` lists the `SCREEN` elements (R6.5) of one Context, linked copies included, without `html` or `url`: `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`. Query `name` keeps those with that name (whole name, case-insensitive, trimmed); with `contains=true` (`true` or `false`, default `false`, other values 400) a part of the name is enough. Query `chapter` keeps those of the Chapter with that id or name (case-insensitive). Without both, all. A Context without a file gives `[]`. Order as stored.
- **S3.14** `GET /api/model/contexts/:id/screens/:screenId` returns the Screen as S3.13 plus its `html` or `url` (only the ones it has). A linked copy (R3.22) returns the `html` or `url` of its original, in its own Context file, and keeps `copyOf`.
- **S3.15** `PUT /api/model/contexts/:id/screens/:screenId/html` with `{ html: text }` (not empty) sets the Screen's `html`, compacted (S3.10), and removes its `url` (R3.7). Only that element changes; other fields and their order stay. Returns `{ html }` as stored. A linked copy gets 409 naming its original. The board shows the change by auto-pull (R10.6); a push with an older revision gets 412 (S4.2).

### API

Errors: `{ "error": text }` with the status below. Unknown `/api` paths get 404.

| Request | Body | Result |
|---|---|---|
| `PUT /api/model/contexts` | `{ contexts: [{ id, name }] }`: not empty, unique ids | Writes `contexts.yaml` with `file` added (S3.2); deletes the files of Contexts not listed (S3.5); `{ count, removed }`. `If-Match` required (S4.2). 400 invalid body or name (S3.4), 409 same `file` twice (S3.6), 412 stale revision, 428 no `If-Match` |
| `PUT /api/model/contexts/:id` | The whole Context `{ id, name, chapters }` (R6.3, slices inline); `id` equals `:id`; every Chapter has `id`, `name`, `context` = `:id` and slices with unique ids; chapter ids unique | Writes the Context file (S3.2); `{ path }` of it. `If-Match` required (S4.2). 400 invalid body or name, 409 collision, unknown Context or other name (S3.6), 412 stale revision, 428 no `If-Match` |
| `GET /api/model/contexts/:id?screenContent=` | | The Context's Chapters as multi-document YAML (S3.11); `screenContent=false` omits Screen `html` (S3.12). 400 invalid `screenContent`, 404 no `contexts.yaml` or unknown Context, 422 the Context file cannot be read, is invalid or holds another Context (as `GET /api/model`) |
| `GET /api/model/contexts/:id/screens?name=&chapter=&contains=` | | The Context's Screens without `html` (S3.13). 400 invalid `contains`, 404 unknown Context, 422 as `GET /api/model/contexts/:id` |
| `GET /api/model/contexts/:id/screens/:screenId` | | The Screen with its `html` or `url` (S3.14). 404 unknown Context or Screen, 422 as above |
| `PUT /api/model/contexts/:id/screens/:screenId/html` | `{ html: text }`, not empty | Sets the compacted `html`, removes `url` (S3.15); `{ html }`. 400 invalid body, 404 unknown Context or Screen, 409 linked copy, 422 as above |
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

- **S4.8** `GET /rules` returns what an agent must not guess: element types, lane types in order with the element types each takes (R2.10), allowed connections (R4.7), lane colours (R2.6), Notes colours (R3.24), the field types (R9).
- **S4.9** `GET /outline?context=` returns the Contexts (only the one with id `context`, when given), each with its Chapters: `id`, `name`, `x`, `y`, `connectsTo`, lanes (`id`, `name`, `type`) and slices (`id`, `name`, `type`, `flowEnd?`, `width`) with their elements `{ id, type, name, lane, x, copyOf?, connectsTo }` (`name` of a linked copy is its original's). No `html`, `url`, `fields`, `info`, `markdown` or scenarios. Order as R6.8.
- **S4.10** `GET /search?q=&type=&context=` lists elements `{ id, type, name, chapterId, sliceId, lane }`. `q`: part of the name, case-insensitive; `type`: an element type (upper case); `context`: a Context id. Without all three, all elements.
- **S4.11** `GET /chapters/:id?screenContent=` returns the Chapter as stored (R6.3; `screenContent` as S3.12). `GET /elements/:id` returns the element as stored (R6.5), a linked copy as its own entry (unlike S3.14).

### Write

- **S4.12** **Contexts.** `POST /contexts` `{ name }`; `PATCH /contexts/:id` `{ name }`; `DELETE /contexts/:id` (its Chapters move to the Default, R1b.6).
- **S4.13** **Chapters.** `POST /chapters` `{ context, name, x?, y? }` creates the Chapter as R1a.2 (`x`, `y` default 0). `PATCH /chapters/:id` `{ name?, info?, context?, x?, y? }`. `DELETE /chapters/:id`. `PUT` and `DELETE /chapters/:id/connections/:targetId` add and remove a Chapter connection (R1a.10).
- **S4.14** **Lanes.** `POST /chapters/:id/lanes` `{ type, after, name?, color? }` adds a lane right below lane `after`; `name` defaults to the type name (R2.2); the type order must hold (R2.10, R2.3a). `PATCH /lanes/:id` `{ name?, info?, color? }`; the type never changes. `DELETE /lanes/:id`.
- **S4.15** **Slices.** `POST /chapters/:id/slices` `{ name?, after?, width? }`: `name` defaults to "New Slice", `after` is a slice id (default: the last), `width` to 220. `PATCH /slices/:id` `{ name?, info?, flowEnd?, width?, index? }`; `index` is the 0-based place among the Chapter's slices (R5.8). `DELETE /slices/:id`.
- **S4.16** **Elements.** `POST /elements` `{ slice, lane, type, name?, info?, html?, url?, markdown?, color?, fields?, x?, autoConnect? }`, or `{ slice, lane, copyOf, x?, autoConnect? }` for a linked copy (R3.22; the original is not a copy). The lane belongs to the slice's Chapter and takes the type (R2.10). Fields as R9.6, a field's `type` defaulting to `string` and its flags to `false`; `html` and `url` not both. `x` is relative to the slice (R6.5), at least the margin (R5.16); without it the element is placed as R5a.10. `autoConnect` (default `true`) adds the arrows of R4.8; like every new arrow they copy fields as R9.4 (S4.18).
- **S4.17** `PATCH /elements/:id` `{ name?, info?, html?, url?, markdown?, color?, fields?, slice?, lane?, x? }`. `null` removes an optional field. Setting `html` clears `url` and the reverse (R3.7). `slice` and `lane` come together and move the element, also to another Chapter (R1a.5; the scenarios that use it go, R3.17; a Scenarios element stays in its Chapter, S4.4); without `x` it is placed as R5a.10, with `x` as given; its arrows stay and none are added. `x` alone moves it inside its Cell. A linked copy accepts only `slice`, `lane` and `x`; other fields get 409 naming the original (as S3.15). `DELETE /elements/:id`.
- **S4.18** **Connections.** `POST /connections` `{ from, to }` between two elements; the server sets the direction (R4.7); a repeat is refused (R4.5). The source's fields are copied to the target as R9.4 says for an added arrow (without Propagate). `DELETE /connections` `{ from, to }` (either order).
- **S4.19** **Scenarios** (R3.11 to R3.16), addressed by their id. `POST /elements/:id/scenarios` `{ name, description?, given?, when?, then?, error?, index? }` appends (or inserts at `index`) to a Scenarios element. `PATCH /scenarios/:id` the same fields. `DELETE /scenarios/:id`. `POST /scenarios/:id/copy` inserts an identical scenario right after (R3.14). Entries and `error` as R6.5, checked as R7.4.

### Batch

- **S4.20** `POST /ops` `{ ops: [{ method, path, body?, as? }] }` runs the requests of S4.12 to S4.19 in order, atomically: all or none. One write, one revision. `path` is relative to `/api/model`. `as` names the `id` of the item an op creates; a later `path` segment or `body` value that is exactly `"$<as>"` is replaced by it. Result `{ results: [{ status, body }] }`, in order. On the first error nothing is written and the response has that op's status and `{ "error": text }` with the text starting `ops[<index>]: `.

### Editing API table

| Request | Result |
|---|---|
| `GET /api/model/revision`, `GET /api/model/events`, `GET /api/model/rules`, `GET /api/model/outline`, `GET /api/model/search` | S4.1, S4.3, S4.8 to S4.10 |
| `GET /api/model/chapters/:id`, `GET /api/model/elements/:id` | S4.11 |
| `POST /api/model/contexts`, `PATCH`/`DELETE /api/model/contexts/:id` | S4.12 |
| `POST /api/model/chapters`, `PATCH`/`DELETE /api/model/chapters/:id`, `PUT`/`DELETE /api/model/chapters/:id/connections/:targetId` | S4.13 |
| `POST /api/model/chapters/:id/lanes`, `PATCH`/`DELETE /api/model/lanes/:id` | S4.14 |
| `POST /api/model/chapters/:id/slices`, `PATCH`/`DELETE /api/model/slices/:id` | S4.15 |
| `POST /api/model/elements`, `PATCH`/`DELETE /api/model/elements/:id` | S4.16, S4.17 |
| `POST`/`DELETE /api/model/connections` | S4.18 |
| `POST /api/model/elements/:id/scenarios`, `PATCH`/`DELETE /api/model/scenarios/:id`, `POST /api/model/scenarios/:id/copy` | S4.19 |
| `POST /api/model/ops` | S4.20 |

Statuses as S4.4; 422 as `GET /api/model` when a stored file cannot be read.
