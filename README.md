# Event Modeling Board

A browser-based Event Modeling board (React + React Flow), served by a small HTTP server.

- Board requirements: [spec/MODELING_BOARD.md](spec/MODELING_BOARD.md)
- Server requirements: [spec/SERVER.md](spec/SERVER.md)
- Agent CLI requirements: [spec/AGENT.md](spec/AGENT.md)
- Skills requirements: [spec/SKILLS.md](spec/SKILLS.md)

## Build

```sh
npm install
npm run build
```

The board is built into `cli/board/public/`.

CLI layout: `cli/index.js` dispatches commands; `cli/init.js` installs skills; `cli/board/` hosts the board server; `cli/agent/` holds the agent client and harness dialects.

## Build and install the CLI

To install the CLI from this checkout for local use:

```sh
npm install
npm run build
npm link --force
```

Or a single command:

```sh
npm install && npm run build && npm link --force
```

`em-cli` is then available globally; `em-cli board` runs the board from the current directory.
Run `npm link --force` again after the CLI entry path changes.

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

Serves at `http://localhost:3300` and tries to open the default browser. Uses the selected host and actual port (`localhost` for wildcard hosts). If no browser is available, the server continues without a warning. No browser opens with `--dev`.

Commands: `board` starts the server; `init` installs skills; `agent` connects to the running server. With no command, the CLI prints help.
Options belong to their command; the old `--init` and commandless server options are not accepted.
Use `em-cli --help` for commands or `em-cli <command> --help` for command options.

| Command | Option | Default | Description |
|---|---|---|---|
| `board` | `-p`, `--port <port>` | `PORT` env, else `3300` | Port to listen on |
| `board` | `--host <host>` | `localhost` | Host to bind to |
| `board` | `--dev` | | API only, no build needed (used by `npm run dev`) |
| `init` | `--target <dir>` | `.claude/skills` | Skills folder |
| `agent` | `--name <name>` | Random Austrian composer | Display name on the board |
| `agent` | `--model <model>` | Required | Model identifier sent to the server |
| `agent` | `--type <type>` | Required | `modeler` or `builder` |
| `agent` | `--harness <name>` | `claude` | `claude` (Claude Code) or `copilot` (Copilot CLI) |
| `agent` | `-p`, `--port <port>` | `PORT` env, else `3300` | Board server port on localhost |
| `agent` | `-v`, `--verbose` | Off | Also log the prompt and the response; `-vv` (or repeated) also logs the raw harness output |
| All | `-h`, `--help` | | Show command usage |

Example: `npx em-cli board --port 8080 --host 0.0.0.0`

Start one CLI per terminal:

```sh
npx em-cli agent --name frontend --model model-a --type modeler
npx em-cli agent --name backend --model model-b --type builder --harness copilot
```

Omit `--name` to pick an unused Austrian composer surname, for example `npx em-cli agent --model model-a --type modeler`. If all six names are taken, supply a unique `--name`. Names are unique regardless of case or surrounding spaces and become available after disconnect. The predefined list is in [spec/AGENT.md](spec/AGENT.md#cli-and-sessions). `--model` and `--type` stay required.

Each connected CLI appears as a robot icon in the board header; the same name always has the same color. Hover over it to see its name, model and last acknowledged heartbeat, or to stop that CLI. **Cancel run** is disabled until cancellation is supported.

The board has no button for the harness check; `POST /api/agents/:id/run` (S2.30) remains. Harness builds run from the folder where you started `em-cli agent`. The agent terminal logs each build task and its prompt, then prints harness output and stderr after exit. Keep the server on localhost: anyone who can reach it can trigger harness runs.

Both harnesses get file read, write, edit, grep and glob permissions. Claude also gets curl rules for `http://localhost` and `http://127.0.0.1` URLs, whether the URL immediately follows `curl` or curl options. Claude also gets rules for `gradle`, `./gradlew`, `gradlew` and `gradlew.bat`; `init` writes them to `.claude/settings.json`, so run `init` in the folder where you start `em-cli agent`. Copilot gets file tools only.

Use the **Agent Task** robot/checkmark button on an element toolbar, slice header or Chapter handle to send Markdown instructions to a selected connected modeling agent. Slice tasks may create, edit and delete elements in that slice and change its name/width, but cannot change other slices or slice structure. For an empty Cell, right-click and choose **Agent Task...**. No task action appears in element, slice, Chapter or occupied Cell context menus. A Cell is one lane x slice, not the whole slice. Enter sends; Shift+Enter adds a line. The header **Agent Tasks** view shows queued/running tasks and finished agent responses. Tasks run one at a time per modeler, independently of builder tasks; history lasts until server restart. Disconnect returns running work to that modeler's queue.

Modeling tasks use `cli/agent/modeling-task-prompt.md` and installed modeling skills. The modeler may read surrounding context but must edit only selected scope and report missing decisions or required outside-scope work. This is prompt-guided, not API-enforced. Copilot's file-only permissions stay unchanged: it cannot perform API modeling edits and should report that limitation. Use a Claude modeler for API editing.

Builder agents build slices from the build queue. Open the header **Agent cockpit** to see every Chapter of the current Context with its slices, colored by build status: not queued, queued, in progress, done, failed or changed. A completed build turns purple **Changed** when its captured slice timestamp differs from the current one; selecting it still shows the previous build log. A slice with a task shows its builder's robot icon. Select slices and use **Build** in the bar on top to queue unbuilt slices or rebuild done, failed or changed slices; with several builders, pick one. Selected slices enter the queue in cockpit order: Chapters top to bottom, slices left to right. Remove queued or originally failed slices from their tile or the bar, including changed failures. Click a slice to add it to or remove it from the selection, Shift+click to add a range within a Chapter. A slice has at most one task. Each builder runs one task at a time with its configured harness, using `Build Slice <slice id> from Chapter <chapter id> of Context <context id>`. It must return `{"success": <boolean>, "response": "<explanation>"}`; `false`, an invalid response, or a nonzero harness exit marks the task failed (red in the cockpit). The queue is kept in memory and lost on server restart. A disconnected builder's running task returns to the queue and resumes when an agent with the same name reconnects.

Before each build, the agent CLI fetches the slice definition and saves it as `.em/slices/<slice id>.json` under its working directory. The file contains `chapter` (including its lanes), `context` (ID, name, and optional info, no tasks), and `slices` (only the requested slice). The agent logs the saved path and task ID, not the file contents. The harness prompt tells it to read that file, not fetch the definition from the server. If the fetch or write fails, the build fails without launching the harness.

Press Ctrl+C to disconnect. On connection failure or unexpected disconnect, `agent` retries every 10 seconds, up to 10 attempts per outage. A successful connection resets the count. Invalid configuration and intentional stops do not retry. For a custom board port, pass the same `--port` to `agent`. The server has no authentication.

## Skills

```sh
npx em-cli@latest init
```

Creates `.em/`, adds `.em/.slices` to `.gitignore`, adds the Claude permissions to `.claude/settings.json` (existing settings are kept) and copies the packaged skills and `em-board-api.md` to `.claude/skills/`. Run it again after a new CLI version: it replaces the skills it installed before (removing those no longer shipped) and leaves your own skills alone. Local edits to the shipped skills are overwritten.

## Develop

```sh
npm run dev
```

Starts the server (API only, restarts on code change) and the Vite dev server for the board with hot reload. No build needed. Open the Vite URL (http://localhost:5173); it proxies `/api` to the server.

To use another server port, set `PORT` for both: `$env:PORT=8080; npm run dev` (PowerShell) or `PORT=8080 npm run dev` (bash).

## Model storage

The board stores Contexts (it pushes after every change) in `.em/model/contexts.yaml`, and each Context, with its Chapters and their slices, in `.em/model/<context>.yaml`, relative to the directory the CLI was started in.

LLM agents edit the same files in small steps through the `/api/model` editing API (`GET /api/model/rules` lists what is allowed; see `spec/SERVER.md` section 4). The open board updates itself when the server model changes.
