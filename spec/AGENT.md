# Event Modeling Agent — Requirements

The `em-cli agent` command and its server connection. Shared CLI rules: [SERVER.md](./SERVER.md#2-cli). Board controls: [MODELING_BOARD.md](./MODELING_BOARD.md#13-connected-clis).

Rule IDs retain their original numbers.

## CLI and sessions

- **S2.16** `npx em-cli agent --model <model> --agent-type <type> [--name <name>]` connects to a running board server on localhost until Ctrl+C or S2.25. Report connection errors to stderr; retry as S2.32.
- **S2.17** `agent -p` or `agent --port`: use the default and error behavior of [S2.2](./SERVER.md#2-cli), but require a port in 1–65535.
- **S2.18** `GET /api/agent/events?model=<model>&agentType=<type>&name=<name>&harness=<harness>` opens a server-sent event stream; `name` and `harness` are optional. Trim supplied name/model; blank or repeated query values or missing model: 400. Type follows S2.28; harness follows S2.33. No demo messages.
- **S2.19** `agent` requires `--model <model>`. `--name <name>` is optional. Trim supplied values; blank values or missing model: exit 1 with usage. Send model and any supplied name to S2.18.
- **S2.20** Keep live sessions in memory per server. Assign each connection a new UUID; remove it on disconnect. Names must be unique, ignoring case and surrounding spaces. Reject explicit duplicates with 409; release names on disconnect or stop.
- **S2.21** `GET /api/agents` returns `[{ id, name, model, agentType, harness, lastPing, building }]` for live sessions in connection order with `Cache-Control: no-store`. `building`: slice name of the session's running build task (S2.37), else `null`.
- **S2.22** Not used (was: forward board messages).
- **S2.23** Not used (was: validate board messages).
- **S2.24** On connect and every 30 seconds send a `ping` event with `{ id, nonce }`; skip a backed-up stream. CLI posts `{ nonce }` to `/api/agents/:id/ping`. A matching unused nonce sets `lastPing` to server epoch milliseconds and returns 204; invalid nonce: 400, missing session: 404. `lastPing` starts `null`.
- **S2.25** `DELETE /api/agents/:id` removes the session, ends only its stream with a `stop` event, and returns 204. Missing session: 404. On `stop`, CLI prints `Agent stopped from the board.` to stdout and exits 0.
  - **Learning (implementation):** Report unexpected EOF only after reading the whole stream, not after a heartbeat or a chunk.
- **S2.26** Without `--name`, server atomically picks an unused surname: `Mozart`, `Haydn`, `Schubert`, `Strauss`, `Bruckner`, `Mahler`. Each available name has equal probability. All taken: 409 with a request for an explicit unique name.
- **S2.27** `cli/agent/agent.js` owns the agent client: connection, event handling and heartbeat acknowledgments. `cli/index.js` parses and validates CLI options, then calls `runAgent()`. `cli/board/agent-api.js` owns name assignment, uniqueness and the agent and build-queue routes. `cli/board/build-queue.js` owns build-queue state (S2.36–S2.39).
- **S2.28** Require `--agent-type`: exactly `modeler` or `builder`. Missing or invalid: exit 1 with usage. Send as `agentType`; server rejects missing, repeated or invalid values with 400.
- **S2.29** After accepting a successful event-stream response, CLI prints `Agent connected to http://localhost:<port>.` once to stdout. Failed connections do not print it.
- **S2.30** `POST /api/agents/:id/run` sends a `run` event only to that live session. Return 202 when queued to its stream, 404 if gone, 503 if backed up. Accept no caller-supplied command or arguments.
- **S2.31** On `run`, log the harness check. Spawn the configured harness with `-p "What model are you" --model <configured model> --output-format json`, without a shell. Use the agent CLI's current working directory, not the board server's. Keep processing events while it runs. Log spawn failures and nonzero exits. Stop child processes when the event stream ends.
- **S2.32** Retry network failures, unexpected disconnects and HTTP 408/429/5xx every 10 seconds. At most 10 connection attempts per outage, including the first; successful connection resets the count. Log each retry; after exhaustion log failure and exit 1. Do not retry intentional stop, other HTTP rejections or invalid protocol data.
- **S2.33** `--harness`: `claude` (default, Claude Code) or `copilot` (Copilot CLI). Reject other values with usage and exit 1. Send `harness` to server; server defaults omitted value to `claude`, rejects invalid values with 400.
- **S2.34** Dialects live in `cli/agent/harnesses/claude.js` and `cli/agent/harnesses/copilot.js`; each defines executable, label and arguments. Agent shares process capture and lifecycle handling. Claude emits JSON; Copilot emits JSONL. Preserve either output format when logging.
- **S2.35** On connect, before the first `ping`, server sends `welcome` `{ id, name }`. CLI reconnects (S2.32) with that name, so an automatic name (S2.26) stays the same.

## Build queue

- **S2.36** Server keeps one in-memory build queue: tasks `{ id, contextId, chapterId, sliceId, sliceName, builder, status, error }` in add order. `status`: `queued`, `running`, `done` or `failed`; `error`: text when failed, else `null`. A `sliceId` has at most one task. Done tasks stay as the slice's last result. Lost on server restart.
- **S2.37** Each builder runs at most one task. Server starts the builder's first `queued` task and sends it as `build` event `{ id, contextId, chapterId, sliceId, sliceName }` on: builder connect, task added for it, its previous task finished.
- **S2.38** Routes:

| Route | Body | Result |
| --- | --- | --- |
| `GET /api/build-queue` | | Tasks (S2.36), `Cache-Control: no-store` |
| `POST /api/build-queue` | `{ contextId, chapterId, sliceId, sliceName, builder }` | 201 task. Trim values; blank or missing: 400. `builder` matches a live `builder` session ignoring case, stored with its session name; none: 404. Slice with a `queued` or `running` task: 409; a `done` or `failed` task is replaced by a new one at the end |
| `DELETE /api/build-queue/:id` | | 204. Only `queued` or `failed`; else 409 |
| `POST /api/agents/:id/tasks/:taskId/done` | | 204; task `done` |
| `POST /api/agents/:id/tasks/:taskId/failed` | `{ error? }` | 204; task `failed`, `error` defaults to `Build failed` |

  Unknown task or session: 404. `done`/`failed` for a task not running on that session: 409.
- **S2.39** Builder disconnect or stop puts its running task back to `queued`, still assigned to the same name; it resumes when that name reconnects.
- **S2.40** On `build`, log `Building slice "<sliceName>". Task: <id>`. After S2.43, run the harness as in S2.31. Require exactly `{"success": <boolean>, "response": "<explanation>"}` as the harness response, with no extra fields or surrounding text. `success: true` reports `done`; `false` reports `failed` with `error` set to `response`. Invalid responses and fetch, write or harness failures report `failed`. The prompt identifies the slice and Chapter/Context, tells the harness to read `.em/slices/<sliceId>.json` and not the server, and defines the response contract. Log build and reporting errors to stderr.
- **S2.41** Before spawning a harness, log its name and prompt to the agent terminal. After exit, log nonempty stdout and stderr to their respective streams, with separate harness and stream headers (S2.34).
- **S2.42** Preapprove file read, write, edit, grep and glob for both harnesses. Claude also preapproves Bash curl commands starting with `curl http://localhost:` or `curl http://127.0.0.1:`. Copilot exposes only file tools; no curl or shell.
- **S2.43** Before each build, fetch `GET /api/model/chapters/:chapterId?slice=<sliceId>` ([S4.21](./SERVER.md#4-editing-api)). Check `chapter.id`, `chapter.context`, `context.id`, the requested slice ID and the presence of `chapter.lanes`. Replace `.em/slices/<sliceId>.json` in the agent CLI's working directory with the full response JSON. Do not launch the harness if preparation fails or the stream ends before launch.
- **S2.44** After saving the slice definition and before logging the harness prompt, log `Saved slice definition to "<path>". Task: <id>`. Do not log the definition contents.
