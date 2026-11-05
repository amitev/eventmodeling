---
name: element-fields
description: Create, change or remove the fields (data) of a Screen, Command, Event or Query element through the server API, and carry them along the arrows exactly as the board does (inheritance on a new arrow, Propagate downstream, Get from parent). Use for "add field X to Y", "define the fields of this command/event/query", "propagate this field", "make the fields consistent along the flow", "get the fields from the parent".
---

# Element Fields

Read `eventmodeling-core-rules` first (what each element is, field lineage). Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Do not guess the rules below. To look things up in the model, use the `model-navigation` skill (cheap reads).

> **The server does less than the board.** It copies fields only when an arrow is added. `PATCH` with `fields` **replaces the whole list** and copies **nothing** downstream. *Propagate* and *Get from parent* are done by you, with the steps below.

## Rules to know

| | Rule |
|---|---|
| Holders | Only `SCREEN`, `COMMAND`, `EVENT`, `QUERY` have `fields`. `PROCESSOR`, `SCENARIOS`, `NOTES` have none. |
| Field | `{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }`. `type` default `string`; one of `string`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `uuid`, `object` (list: `GET /api/model/rules` → `fieldTypes`). Only `object` has `fields` (nested, any depth). Flags (`list`, `id`, `optional`, `generated`, `pii`, `technical`) default `false`. A list of values is `list: true`. |
| Names | Not empty, unique within their list. |
| Flags | `id` identifies the object; `optional` may be missing; `generated` is created by the system (an id, the current date, the acting user); `pii` is personal data; `technical` is an implementation detail. |
| Flow | Arrows: Screen → Command, Processor → Command, Command → Event, Event → Query, Query → Screen, Query → Processor. See the `connections` skill. |
| Copy | Fields are **copied**, never linked. A copied field **replaces** the same-named field of the target as a whole (nested `fields` included, no deep merge), in place; new names are appended. |
| Processor | Holds no fields but passes them on: Query → Processor → Command copies the Query's fields to the Command. |
| Linked copy | An element with `copyOf` is **never a target** (it shows its original's fields; change the original, a `PATCH` on it gets 409). As a **source** it gives its original's fields. |
| New arrow | The source's fields are all copied to the target; one hop only. Done by the server on `POST /connections` and on the automatic arrows of `POST /elements` (Screen → Command, Command → Event, Query → Screen, Event → Query). |
| Propagate | A newly created **top-level** field is also copied to **all** elements downstream, through the whole chain, around loops too, replacing same-named fields. Edited or removed fields are never propagated. |
| Get from parent | Copy the fields of all parents (elements with an arrow to this one, through Processors) into the element, replacing same-named fields; several parents in the order of their arrows, a later one replacing an earlier one. |

## Step 1 — Find the elements

1. `GET /api/model/rules` once (field types and flags).
2. Name given: `GET /api/model/search?q=<name>&type=<TYPE>`; keep results whose `name` equals it. Several: ask the user which (name the Chapters), never guess. None: ask; do not create an element unless asked.
3. `GET /api/model/outline` gives for every element `{ id, type, name, lane, copyOf?, connectsTo }` and the slices in order. This is the arrow graph: `connectsTo` lists the **targets** of an element. Parents of `X` are the elements that have `X` in their `connectsTo`.
4. `GET /api/model/elements/:id` (or `GET /api/model/chapters/:id?screenContent=false` for a whole Chapter) gives the current `fields`.
5. A linked copy cannot be changed: use its original's id.

## Step 2 — Decide the content (do not invent data)

- **Follow the lineage.** Every field has a source: a same-named field upstream, or `generated: true` where the information starts. A field with no source is a gap: report it, do not hide it.
- **Screen**: what the mockup shows or lets the user enter. Shown from a Query: it comes from the Query. Session values and display-only calculations: `generated: true`.
- **Command**: everything its decision needs (also the current time, the acting user, the tenant: `generated: true` where the Screen does not supply them). Business language, names matching the Screen's input fields.
- **Event**: only captured facts, no computed values.
- **Query**: the data shaped for the Screen that reads it; one `list: true` `object` field when it returns rows.
- Mark `pii` for personal data, `id` for identifiers.
- Unsure about a name, type or flag, or whether to propagate: ask the user (use the ask tool), with a recommended default.

## Step 3 — Write

Use `POST /api/model/ops` when more than one element changes, so all changes are one atomic write and one revision. Body `{ "ops": [{ "method": "PATCH", "path": "/elements/<id>", "body": { "fields": [...] } }] }`; read `results[].status`. The body is JSON: build it with `ConvertTo-Json -Depth 10` or `JSON.stringify`.

### A. New element (with fields)

`POST /elements` with `fields`. `autoConnect` (default `true`) adds the automatic arrows and each arrow **copies the source's fields over yours**: a same-named field from the parent replaces yours. So define the element's own fields, but expect the parent's version of shared names to win. Read the stored element back (`GET /elements/:id`) and report the final fields.

### B. Add or change fields of an existing element

1. `GET /elements/:id` → current `fields`.
2. Build the new list: keep every existing field unless the user asked to remove it; add or edit the wanted ones (nested objects: send the full nested list).
3. `PATCH /elements/:id` `{ "fields": [...] }` (`null` removes all fields).
4. If the change adds **new top-level fields** and the user wants them carried on: do **Propagate** (C) for those fields only. Not for edits or removals.

### C. Propagate new top-level fields downstream

Do what the board does (breadth-first, each element once, the source itself never changed):

1. From the outline, start at the source element and follow `connectsTo` transitively. Mark each element reached as visited (loops end there).
2. For each reached element:
   - type `SCREEN`, `COMMAND`, `EVENT` or `QUERY` and **no** `copyOf`: it gets the fields. Read its current `fields`, replace the same-named ones with the new ones (same position), append the others.
   - a `PROCESSOR` or a linked copy: change nothing, but **keep following** its `connectsTo`.
   - `SCENARIOS` and `NOTES` have no arrows.
3. One `PATCH /elements/:id` per changed element, all in one `POST /ops` (include the source's own `PATCH` first).
4. Elements are in other slices and Chapters too: follow the arrows there; read their fields with `GET /chapters/:id?screenContent=false` per Chapter.
5. Copy the new field objects exactly (same type, flags, nested fields) so the copies are identical.

### D. Get from parent (pull fields into an element)

1. Parents: elements whose `connectsTo` includes the target; for a `PROCESSOR` parent, use its own parents instead (recursively). A linked copy parent gives its original's fields (`copyOf`). The API gives no arrow order: use the order of the outline, and ask the user which wins if several parents share a field name with different definitions.
2. Merge the parents' fields into one list (a later parent replaces same-named fields of an earlier one), then merge that into the element's own list (same-named replaced, others stay).
3. `PATCH /elements/:id` with the result. Nothing is copied further: add Propagate (C) only if the user asks.

### E. New arrow between existing elements

Create it as the `connections` skill says (`POST /connections` `{ from, to }`). It copies the source's fields to the target, one hop, and nothing else: no Propagate. Add Propagate (C) only if the user asks.

### F. Remove or rename a field

Never propagated. `PATCH` the element, and say in the report which downstream elements still hold the old field (list them by name and Chapter) so the user decides. Do not change them unasked.

## Step 4 — Verify and report

1. `GET /elements/:id` for each changed element when it matters (new element with `autoConnect`, or a conflict with a parent's same-named field).
2. Tell the user:
   - the ids and names of the elements changed, and the Chapter of each;
   - the fields each now has (mark `generated`, `pii`, `id`), and which were propagated or inherited from where;
   - fields with no upstream source (gaps), and elements left untouched on purpose (linked copies, edits/removals not propagated);
   - that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed);
   - any error (400 invalid body or board rule, 404 unknown id, 409 linked copy, 422 stored model invalid): read `error`, fix the cause, retry.
