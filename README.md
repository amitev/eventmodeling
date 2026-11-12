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

## Build and install the CLI

To install the CLI from this checkout for local use:

```sh
npm install
npm run build
npm link
```

`em-cli` is then available globally; `em-cli board` runs the board from the current directory.

To create and install a package tarball:

```sh
npm pack
npm install -g ./em-cli-1.0.0.tgz
```

`npm pack` runs the build automatically. The tarball name includes the package version.

## Run

```sh
npx em-cli board
```

Or, from the repository: `npm start`.

Serves at `http://localhost:3300`.

Commands: `board` starts the server; `init` installs skills. No command prints help.
Options belong to their command; the old `--init` and commandless server options are not accepted.
Use `em-cli --help` for commands or `em-cli <command> --help` for command options.

| Command | Option | Default | Description |
|---|---|---|---|
| `board` | `-p`, `--port <port>` | `PORT` env, else `3300` | Port to listen on |
| `board` | `--host <host>` | `localhost` | Host to bind to |
| `board` | `--dev` | | API only, no build needed (used by `npm run dev`) |
| `init` | `--target <dir>` | `.claude/skills` | Skills folder |
| Both | `-h`, `--help` | | Show command usage |

Example: `npx em-cli board --port 8080 --host 0.0.0.0`

## Skills

```sh
npx em-cli@latest init
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
