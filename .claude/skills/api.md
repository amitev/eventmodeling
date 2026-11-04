# Event Modeling server API

Base URL: `http://localhost:3300` (CLI `npx event-modeling-cli`, option `--port`). All paths start with `/api`.
Bodies are JSON (max 50 MB). No authentication. Errors: `{ "error": text }` with an HTTP status.

## Storage

Folder `<cwd>/.event-modeling/model/`:
- `contexts.yaml`: ordered list of `{ id, name, file }`; the first is the Default.
- `<file>` (e.g. `backoffice.yaml`): one Context `{ id, name, chapters }`, slices inline.

A Chapter's `context` is a Context `id` that must exist in `contexts.yaml`.
`html` of every `SCREEN` element is compacted on push.
The board overwrites server changes on its next push: after changing the model through the API, pull in the board.

## Endpoints

### `GET /api/model`
Whole model as JSON: Contexts in file order, Chapters ordered by `x`, `y`, `id`.

### `GET /api/model/contexts/:id`
Chapters of Context `:id` as multi-document YAML (`application/yaml`): one `---` document per Chapter, ordered by `x`, `y`, `id`. Empty body if the Context has no Chapters.
- Query `screenContent`: `true` (default) | `false`. `false` omits the `html` of `SCREEN` elements.

### `PUT /api/model/contexts`
Body: `{ "contexts": [{ "id", "name" }] }` (not empty, unique ids). Replaces `contexts.yaml` and deletes the files of Contexts no longer listed.
Returns `{ "count", "removed" }`.

### `PUT /api/model/contexts/:id`
Body: the whole Context `{ id, name, chapters }` with slices inline; `id` equals `:id`. The Context must be in `contexts.yaml` with the same name. Writes its file.
Returns `{ "path" }`.

### `GET /api/model/contexts/:id/screens`
Finds Screens (`SCREEN` elements, linked copies included) of Context `:id`, without `html`.
- Query `name`: whole name, case-insensitive. With `contains=true` a part of the name.
- Query `chapter`: Chapter id or name, case-insensitive.
- Without both: all Screens. Names are not unique: several results are possible.

Returns `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`.

### `GET /api/model/contexts/:id/screens/:screenId`
One Screen as above plus `html` or `url` (only the one it has). A linked copy has `copyOf` and returns the `html`/`url` of its original.

### `PUT /api/model/contexts/:id/screens/:screenId/html`
Body: `{ "html": text }` (not empty). Sets the compacted `html` and removes `url` (a Screen has `html` or `url`, never both). Only that element changes.
Returns `{ "html" }` as stored (compacted: `<html>`, `<head>`, `<body>` always present).
A linked copy gets 409 with its original's id: update the original.

## Rules

- Push order: `PUT /model/contexts`, then `PUT /model/contexts/:id` per Context.
- Context names are file names: they must not contain `\ / : * ? " < > |` or control characters, end with a dot, be empty, be `contexts` or be a Windows device name.
- Details: `spec/SERVER.md` (S3).
