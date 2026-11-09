# Event Modeling Board

A browser-based Event Modeling board (React + React Flow), served by a small HTTP server.

- Board requirements: [spec/MODELING_BOARD.md](spec/MODELING_BOARD.md)
- Server requirements: [spec/SERVER.md](spec/SERVER.md)

## Build

```sh
npm install
npm run build
```

The board is built into `server/public/`.

## Run

```sh
npx event-modeling-cli
```

Or, from the repository: `npm start`.

Opens at `http://localhost:3300`.

| Option | Default | Description |
|---|---|---|
| `-p`, `--port <port>` | `PORT` env, else `3300` | Port to listen on |
| `--host <host>` | `localhost` | Host to bind to |
| `--dev` | | API only, no build needed (used by `npm run dev`) |
| `--init` | | Install the skills into the current directory, then exit |
| `--target <dir>` | `.claude/skills` | With `--init`: skills folder |
| `-h`, `--help` | | Show usage |

Example: `npx event-modeling-cli --port 8080 --host 0.0.0.0`

## Skills

```sh
npx event-modeling-cli@latest --init
```

Creates `.event-modeling/` and copies the packaged skills and `api.md` to `.claude/skills/`. Run it again after a new CLI version: it replaces the skills it installed before (removing those no longer shipped) and leaves your own skills alone. Local edits to the shipped skills are overwritten.

## Develop

```sh
npm run dev
```

Starts the server (API only, restarts on code change) and the Vite dev server for the board with hot reload. No build needed. Open the Vite URL (http://localhost:5173); it proxies `/api` to the server.

To use another server port, set `PORT` for both: `$env:PORT=8080; npm run dev` (PowerShell) or `PORT=8080 npm run dev` (bash).

## Model storage

The board stores Contexts (it pushes after every change) in `.event-modeling/model/contexts.yaml`, and each Context, with its Chapters and their slices, in `.event-modeling/model/<context>.yaml`, relative to the directory the CLI was started in.

LLM agents edit the same files in small steps through the `/api/model` editing API (`GET /api/model/rules` lists what is allowed; see `spec/SERVER.md` section 4). The open board updates itself when the server model changes.
