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
| `-p`, `--port <port>` | `3300` | Port to listen on |
| `--host <host>` | `localhost` | Host to bind to |
| `-h`, `--help` | | Show usage |

Example: `npx event-modeling-cli --port 8080 --host 0.0.0.0`

## Develop

```sh
npm run dev
```

Starts the Vite dev server for the board with hot reload.
