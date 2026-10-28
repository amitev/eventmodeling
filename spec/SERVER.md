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
- **S2.8** The published package contains `server/index.js`, `server/app.js`, `server/api.js`, `server/model-store.js` and `server/public/`. `prepack` runs the build.
- **S2.9** `--dev`: serve only `/api` (S1.1 and S1.3 do not apply); skip the build check (S2.6). The board comes from the Vite dev server.

## 2a. Development

- **S2a.1** `npm run dev` starts the server (`node --watch`, `--dev`; restarts on code change) and the Vite dev server (port 5173) together.
- **S2a.2** The Vite dev server proxies `/api` to `http://localhost:<PORT>`, `PORT` defaulting to `3300`. One `PORT` environment variable sets both the server (S2.2) and the proxy.

## 3. Model storage

The board pushes its Chapters to the server and pulls them back (MODELING_BOARD.md section 10).

- **S3.1** Files live in `<cwd>/.event-modeling/model/`, where `<cwd>` is the directory the CLI was started in. Folders are created as needed.
- **S3.2** Written with `js-yaml`.
  - `contexts.yaml`: the ordered list of Contexts, each `id` and `name`. The first is the Default.
  - `<context>/<chapter name>.yaml`: one file per Chapter, holding the Chapter as received (MODELING_BOARD.md R6.3), at top level. The `<context>` folder is the one of the Chapter's `context` id in `contexts.yaml`.
  - The server does not check a Chapter further; the board does on pull (R10.2).
- **S3.3** `<context>` is the Context name lower-cased, trimmed, each whitespace character replaced by `_`. `<chapter name>` is the Chapter name, trimmed.
- **S3.4** In both names each of `\ / : * ? " < > |` and control characters becomes `_`; trailing dots become `_`. A name that is empty or a Windows device name (`con`, `nul`, `com1`, ...) gets 400.
- **S3.5** A Chapter is identified by its `id`. Pushing it deletes any other file holding that id (rename, other Context). A folder left without Chapters is removed. A Context without Chapters stays in `contexts.yaml`.
- **S3.6** Collisions get 409, compared case-insensitively: the target file holds another Chapter id, or the folder holds other Chapters of another Context (by their `context`). Nothing is written. A Chapter whose Context is not in `contexts.yaml` also gets 409.
- **S3.7** Files are written to a `.tmp` file, then renamed. Operations run one at a time.
- **S3.8** Bodies are JSON (`Content-Type: application/json`, at most 50 MB). No CORS headers. No authentication: with `--host` other than localhost anyone who can reach the port can read and write the folder.

### API

Errors: `{ "error": text }` with the status below. Unknown `/api` paths get 404.

| Request | Body | Result |
|---|---|---|
| `PUT /api/model/contexts` | `{ contexts: [{ id, name }] }`: not empty, unique ids | Writes `contexts.yaml`; `{ count }`. 400 invalid body |
| `PUT /api/model/chapters/:id` | The Chapter (R6.3); `chapter.id` equals `:id` | Writes the file; `{ path }`. 400 invalid body or name, 409 collision or unknown Context (S3.6) |
| `POST /api/model/prune` | `{ chapterIds: [text] }` | Deletes files of Chapters not listed and folders left without Chapters (S3.5); `{ removed }`. Files that cannot be read stay. 400 invalid body |
| `GET /api/model` | | Export file (MODELING_BOARD.md R6.2): Contexts in file order, Chapters by `x`, `y`, `id` (R6.8). 404 no `contexts.yaml`, 422 a file cannot be read or a Chapter's `context` is not in `contexts.yaml` (message names the file) |
