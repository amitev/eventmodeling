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
- **S2.2** `-p`, `--port <port>`: default `3300`. Must be an integer 0–65535; otherwise exit 1 with usage.
- **S2.3** `--host <host>`: default `localhost`.
- **S2.4** `-h`, `--help`: print usage, exit 0. Unknown options: exit 1 with usage.
- **S2.5** On start print `Event Modeling Board: http://<host>:<port>`.
- **S2.6** Missing board build: exit 1 with "Board build not found. Run "npm run build" first."
- **S2.7** Port in use: exit 1 with "Port <port> is already in use."
- **S2.8** The published package contains `server/index.js`, `server/app.js` and `server/public/`. `prepack` runs the build.
