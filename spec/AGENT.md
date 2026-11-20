# Event Modeling Agent — Requirements

The `em-cli agent` command and its server connection. Shared CLI rules: [SERVER.md](./SERVER.md#2-cli). Board controls: [MODELING_BOARD.md](./MODELING_BOARD.md#13-connected-clis).

Rule IDs retain their original numbers.

## CLI and sessions

- **S2.16** `npx em-cli agent --model <model> --agent-type <type> [--name <name>]` connects to a running board server on localhost until Ctrl+C or S2.25. Report connection errors to stderr; retry as S2.32.
- **S2.17** `agent -p` or `agent --port`: use the default and error behavior of [S2.2](./SERVER.md#2-cli), but require a port in 1–65535.
- **S2.18** `GET /api/agent/events?model=<model>&agentType=<type>&name=<name>&harness=<harness>` opens a server-sent event stream; `name` and `harness` are optional. Trim supplied name/model; blank or repeated query values or missing model: 400. Type follows S2.28; harness follows S2.33. No demo messages.
- **S2.19** `agent` requires `--model <model>`. `--name <name>` is optional. Trim supplied values; blank values or missing model: exit 1 with usage. Send model and any supplied name to S2.18.
- **S2.20** Keep live sessions in memory per server. Assign each connection a new UUID; remove it on disconnect. Names must be unique, ignoring case and surrounding spaces. Reject explicit duplicates with 409; release names on disconnect or stop.
- **S2.21** `GET /api/agents` returns `[{ id, name, model, agentType, harness, lastPing }]` for live sessions in connection order with `Cache-Control: no-store`.
- **S2.22** Not used (was: forward board messages).
- **S2.23** Not used (was: validate board messages).
- **S2.24** On connect and every 30 seconds send a `ping` event with `{ id, nonce }`; skip a backed-up stream. CLI posts `{ nonce }` to `/api/agents/:id/ping`. A matching unused nonce sets `lastPing` to server epoch milliseconds and returns 204; invalid nonce: 400, missing session: 404. `lastPing` starts `null`.
- **S2.25** `DELETE /api/agents/:id` removes the session, ends only its stream with a `stop` event, and returns 204. Missing session: 404. On `stop`, CLI prints `Agent stopped from the board.` to stdout and exits 0.
  - **Learning (implementation):** Report unexpected EOF only after reading the whole stream, not after a heartbeat or a chunk.
- **S2.26** Without `--name`, server atomically picks an unused surname: `Mozart`, `Haydn`, `Schubert`, `Strauss`, `Bruckner`, `Mahler`. Each available name has equal probability. All taken: 409 with a request for an explicit unique name.
- **S2.27** `server/agent.js` owns the agent client: connection, event handling and heartbeat acknowledgments. `server/index.js` parses and validates CLI options, then calls `runAgent()`. `server/agent-api.js` owns name assignment and uniqueness.
- **S2.28** Require `--agent-type`: exactly `modeler` or `builder`. Missing or invalid: exit 1 with usage. Send as `agentType`; server rejects missing, repeated or invalid values with 400.
- **S2.29** After accepting a successful event-stream response, CLI prints `Agent connected to http://localhost:<port>.` once to stdout. Failed connections do not print it.
- **S2.30** `POST /api/agents/:id/run` sends a `run` event only to that live session. Return 202 when queued to its stream, 404 if gone, 503 if backed up. Accept no caller-supplied command or arguments.
- **S2.31** On `run`, spawn the configured harness with `-p "What model are you" --model <configured model> --output-format json` in the CLI's working directory, without a shell. Keep processing events while it runs. Capture stdout/stderr; print them to the agent console after exit. Report spawn failures and nonzero exits explicitly. Stop child processes when the event stream ends.
- **S2.32** Retry network failures, unexpected disconnects and HTTP 408/429/5xx every 10 seconds. At most 10 connection attempts per outage, including the first; successful connection resets the count. Log each retry; after exhaustion log failure and exit 1. Do not retry intentional stop, other HTTP rejections or invalid protocol data.
- **S2.33** `--harness`: `claude` (default, Claude Code) or `copilot` (Copilot CLI). Reject other values with usage and exit 1. Send `harness` to server; server defaults omitted value to `claude`, rejects invalid values with 400.
- **S2.34** Dialects live in `server/harnesses/claude.js` and `server/harnesses/copilot.js`; each defines executable, label and arguments. Agent shares process capture and lifecycle handling. Claude emits JSON; Copilot emits JSONL. Preserve either output format when logging.
