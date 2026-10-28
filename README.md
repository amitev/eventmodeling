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
| `-h`, `--help` | | Show usage |

Example: `npx event-modeling-cli --port 8080 --host 0.0.0.0`

## Develop

```sh
npm run dev
```

Starts the server (API only, restarts on code change) and the Vite dev server for the board with hot reload. No build needed. Open the Vite URL (http://localhost:5173); it proxies `/api` to the server.

To use another server port, set `PORT` for both: `$env:PORT=8080; npm run dev` (PowerShell) or `PORT=8080 npm run dev` (bash).

## Model storage

The board's **Push to server** / **Pull from server** buttons store Contexts in `.event-modeling/model/contexts.yaml` and Chapters in `.event-modeling/model/<context>/<chapter name>.yaml`, relative to the directory the CLI was started in.
