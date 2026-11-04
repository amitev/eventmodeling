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
- **S2.8** The published package contains `server/index.js`, `server/app.js`, `server/api.js`, `server/model-store.js`, `server/html-compact.js` and `server/public/`. `prepack` runs the build.
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
- **S3.15** `PUT /api/model/contexts/:id/screens/:screenId/html` with `{ html: text }` (not empty) sets the Screen's `html`, compacted (S3.10), and removes its `url` (R3.7). Only that element changes; other fields and their order stay. Returns `{ html }` as stored. A linked copy gets 409 naming its original. The board shows the change after the next pull (R10.2); its next push overwrites it.

### API

Errors: `{ "error": text }` with the status below. Unknown `/api` paths get 404.

| Request | Body | Result |
|---|---|---|
| `PUT /api/model/contexts` | `{ contexts: [{ id, name }] }`: not empty, unique ids | Writes `contexts.yaml` with `file` added (S3.2); deletes the files of Contexts not listed (S3.5); `{ count, removed }`. 400 invalid body or name (S3.4), 409 same `file` twice (S3.6) |
| `PUT /api/model/contexts/:id` | The whole Context `{ id, name, chapters }` (R6.3, slices inline); `id` equals `:id`; every Chapter has `id`, `name`, `context` = `:id` and slices with unique ids; chapter ids unique | Writes the Context file (S3.2); `{ path }` of it. 400 invalid body or name, 409 collision, unknown Context or other name (S3.6) |
| `GET /api/model/contexts/:id?screenContent=` | | The Context's Chapters as multi-document YAML (S3.11); `screenContent=false` omits Screen `html` (S3.12). 400 invalid `screenContent`, 404 no `contexts.yaml` or unknown Context, 422 the Context file cannot be read, is invalid or holds another Context (as `GET /api/model`) |
| `GET /api/model/contexts/:id/screens?name=&chapter=&contains=` | | The Context's Screens without `html` (S3.13). 400 invalid `contains`, 404 unknown Context, 422 as `GET /api/model/contexts/:id` |
| `GET /api/model/contexts/:id/screens/:screenId` | | The Screen with its `html` or `url` (S3.14). 404 unknown Context or Screen, 422 as above |
| `PUT /api/model/contexts/:id/screens/:screenId/html` | `{ html: text }`, not empty | Sets the compacted `html`, removes `url` (S3.15); `{ html }`. 400 invalid body, 404 unknown Context or Screen, 409 linked copy, 422 as above |
| `GET /api/model` | | Export file (MODELING_BOARD.md R6.2, slices inline): Contexts in file order, Chapters by `x`, `y`, `id` (R6.8). 404 no `contexts.yaml`, 422 a file cannot be read, has no Context `id` and `name` or no `chapters` list of Chapters with `id`, `context` (= the Context) and `slices`, or its Context is not in `contexts.yaml`; 422 also an entry of `contexts.yaml` without `id`, `name` or a valid `file` (message names the file) |
