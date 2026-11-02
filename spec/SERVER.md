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

The board pushes its Chapters to the server and pulls them back (MODELING_BOARD.md section 10).

- **S3.1** Files live in `<cwd>/.event-modeling/model/`, where `<cwd>` is the directory the CLI was started in. Folders are created as needed.
- **S3.2** Written with `js-yaml`.
  - `contexts.yaml`: the ordered list of Contexts, each `id` and `name`. The first is the Default.
  - `<context>/<chapter name> - <chapter id>.yaml`: one file per Chapter, holding the Chapter as received (MODELING_BOARD.md R6.3), slices inline (R6.4), at top level. The `<context>` folder is the one of the Chapter's `context` id in `contexts.yaml`.
  - The server does not check a Chapter further; the board does on pull (R10.2).
- **S3.3** `<context>` is the Context name lower-cased, trimmed, each space replaced by `_`. `<chapter name>` is the name, trimmed.
- **S3.4** Names are never changed to fit: a Chapter or Context name that contains `\ / : * ? " < > |` or a control character, ends with a dot, is empty or is a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, also with an extension) gets 400. The same for a chapter id with such a character. The board prevents these names (MODELING_BOARD.md R1.19); imported ones can still reach the server. Slice names are not file names and are not checked.
- **S3.5** A Chapter is identified by its `id` in the file. Pushing it deletes any other file holding that id (rename, other Context). A Context folder left empty is removed. A Context without Chapters stays in `contexts.yaml`.
- **S3.6** Collisions get 409, compared case-insensitively: the target file holds another Chapter id; the Context folder holds Chapters of another Context (by their `context`). Nothing is written. A Chapter whose Context is not in `contexts.yaml` also gets 409.
- **S3.7** Files are written to a `.tmp` file, then renamed. A push writes the Chapter file, then removes stale files. Operations run one at a time.
- **S3.8** Bodies are JSON (`Content-Type: application/json`, at most 50 MB). No CORS headers. No authentication: with `--host` other than localhost anyone who can reach the port can read and write the folder.
- **S3.9** Not used (was: Slice files, now inline in the Chapter file, S3.2). Folders and non-`.yaml` files inside a Context folder are ignored on pull.
- **S3.10** On push the `html` of every `SCREEN` element (R6.5) is compacted (`server/html-compact.js`, parse5); `url` and other fields are untouched. Pull returns what is stored. Existing files change when pushed again. The output is serialized by parse5, so `<html>`, `<head>` and `<body>` are always present and boolean attributes read `x=""`.
  - Whitespace: runs collapse to one space. Spaces next to a block element, at the start and end of a block, and whitespace-only text between blocks are dropped; a space between inline content stays. Blocks are listed in `BLOCK`; any other element counts as inline. `<pre>`, `<textarea>` and `<listing>` text is kept as is. `<style>` CSS goes on one line: comments removed, whitespace runs one space, quoted strings kept.
  - Comments are removed. `<!DOCTYPE>` is kept.
  - Tags removed with their content: `script`, `noscript`, `title`, `meta`, `base`, `template`, `iframe`, `object`, `embed`, and `link` unless its `rel` has `stylesheet`.
  - Attributes removed: `on*`, `data-*`, `aria-*`, `role`, `autocomplete`, `required`, `minlength`, `maxlength`, `pattern`, `autofocus`, `action`, `method`, `target`, `rel` (kept on a stylesheet `link`), `title`, `tabindex`, `contenteditable`, `spellcheck`, `draggable`, `name`.
  - **Learning (implementation):** removing `name` ungroups radio buttons. Other removals do not change the sandboxed preview (R3.9).

### API

Errors: `{ "error": text }` with the status below. Unknown `/api` paths get 404.

| Request | Body | Result |
|---|---|---|
| `PUT /api/model/contexts` | `{ contexts: [{ id, name }] }`: not empty, unique ids | Writes `contexts.yaml`; `{ count }`. 400 invalid body |
| `PUT /api/model/chapters/:id` | The whole Chapter (R6.3, slices inline); `chapter.id` equals `:id`; slices have unique ids | Writes the Chapter file (S3.2); `{ path }` of it. 400 invalid body or name, 409 collision or unknown Context (S3.6) |
| `POST /api/model/prune` | `{ chapterIds: [text] }` | Deletes Chapters not listed (their files) and empty folders (S3.5); `{ removed }`. A file that cannot be read stays. 400 invalid body |
| `GET /api/model` | | Export file (MODELING_BOARD.md R6.2, slices inline): Contexts in file order, Chapters by `x`, `y`, `id` (R6.8). 404 no `contexts.yaml`, 422 a file cannot be read or has no Chapter `id`, `context` and `slices` list, or a Chapter's `context` is not in `contexts.yaml` (message names the file) |
