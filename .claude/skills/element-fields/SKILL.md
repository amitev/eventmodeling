---
name: element-fields
description: Create, edit or remove Screen/Command/Event/Read Model fields through the API; inherit, Propagate and Get from parent as the board does. Use for "add field X to Y", "define the fields of this command/event/read model", "propagate this field", "make the fields consistent along the flow", "get the fields from the parent".
---

# Element Fields

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first (elements, lineage); use `model-navigation` for lookups. Do not guess rules.

> **PATCH `fields` replaces the whole list and copies nothing downstream.** Server copies only on new arrows. You perform *Propagate* and *Get from parent* below.

## Rules to know

| | Rule |
|---|---|
| Holders | Only `SCREEN`, `COMMAND`, `EVENT`, `READ_MODEL`; no fields on `PROCESSOR`, `SCENARIOS`, `NOTES` |
| Field | `{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }`; types: `string` (default), `integer`, `decimal`, `boolean`, `date`, `datetime`, `uuid`, `object` (`GET /rules`: `fieldTypes`). Only `object` has nested `fields`, any depth |
| Names / flags | Names nonempty, unique per list. Flags default `false`; `list: true` = list; `id` = identifier; `optional` = may be absent; `generated` = system-created (id, current date, acting user); `pii` = personal data; `technical` = implementation detail |
| Flow | Screen → Command, Processor → Command, Command → Event, Event → Read Model, Read Model → Screen, Read Model → Processor (`connections`) |
| Copy | **Copied, not linked.** Replace same-named target field in place, whole object including nested fields; **no deep merge**. Append new names |
| Processor | No fields; passes Read Model's fields through to Command |
| Linked copy | Never a field-write target: shows original; PATCH fields gets 409. As source supplies original's fields |
| New arrow | `POST /connections` or automatic `POST /elements` arrow copies all source fields **one hop only** (Screen → Command, Command → Event, Read Model → Screen, Event → Read Model) |
| Propagate | Only **new top-level fields**, enabled by default unless user opts out; copy through entire downstream chain, including loops, replacing same-named fields. Never propagate existing-field edits (including flags), renames or removals |
| Get from parent | Copy all parents' fields through Processors; later parent wins same-name conflicts. Arrow order governs; API-order handling below |

## Step 1 — Find the elements

1. `GET /rules` once: field types/flags.
2. `GET /search?q=<name>&type=<TYPE>`; retain exact-name matches. Several: ask which, naming Chapters. None: ask, never create unless requested.
3. `GET /outline`: ordered slices + `{ id, type, name, lane, copyOf?, connectsTo }`. `connectsTo` = targets; parents of X list X there.
4. Read current fields: `GET /elements/:id`, or `GET /chapters/:id?screenContent=false` for whole Chapter.
5. For linked-copy changes, use original id.

## Step 2 — Decide the content (do not invent data)

- **Lineage:** same-named upstream source, or `generated: true` where information starts. No source = gap to report, never hide.
- **Information completeness:** apply the core rule to each edited element; report unmatched non-generated top-level fields. Mark fields generated only when system-created.
- **Screen:** shown/entered mockup data; displayed Read Model data comes from it. Session/display-only calculations: `generated: true`.
- **Command:** all decision inputs, including time, acting user, tenant (`generated: true` if not Screen-supplied); business names matching Screen inputs.
- **Event:** captured facts only, no computed values.
- **Read Model:** fields describe one result item, shaped for the consuming Screen. Element `isList` hints list results (default `false`), never an outer `list: true` field. Field `list` is only for a collection-valued attribute within one item. Preserve `isList` during field edits; change it only when requested via `edit-and-delete`. Never propagate it with fields.
- Personal data: `pii`; identifiers: `id`.
- Unclear name/type/flag/propagation: ask user with ask tool and recommended default.

## Step 3 — Write

Multiple elements: one atomic `POST /ops`, one revision. Body `{"ops":[{"method":"PATCH","path":"/elements/<id>","body":{"fields":[...]}}]}`; check `results[].status`. Build JSON with `ConvertTo-Json -Depth 10` or `JSON.stringify`.

### A. New element (with fields)

`POST /elements` with own `fields`. `autoConnect=true` by default; automatic arrows **replace same-named fields with parent's version**. Read stored element back (`GET /elements/:id`); report final fields.

### B. Add or change fields of an existing element

1. Read current `fields`.
2. Keep every field unless removal requested; add/edit wanted fields. Send full nested lists too.
3. `PATCH /elements/:id` `{ fields: [...] }`; `fields: null` removes all.
4. Propagate (C) new **top-level** fields unless user opts out. Existing-field changes stay local; downstream edits need separate approval.

### C. Propagate new top-level fields downstream

1. Traverse outline `connectsTo` **breadth-first**, each element once, visited set for loops. **Never change source during traversal.**
2. Reached non-copy `SCREEN`/`COMMAND`/`EVENT`/`READ_MODEL`: read fields, replace same-named fields in place, append new names. Copy objects **exactly**, including types, flags, nested fields.
3. Processor/linked copy: no write, but **continue traversal**. Scenarios/Notes have no arrows.
4. Follow across slices; use Chapter reads with `screenContent=false`. Normally cross-Chapter dependencies use local copies showing original's live fields, not cross-Chapter propagation. Follow existing direct cross-Chapter arrows too; read other Chapters as needed.
5. One PATCH per changed element, one `POST /ops`; source's own add-field PATCH comes first.

### D. Get from parent (pull fields into an element)

1. Find parents from `connectsTo`; recursively replace Processor parents with their parents. Copy parents supply original's fields (`copyOf`).
2. API exposes no arrow order: use outline order; conflicting definitions of same name: **ask which wins**.
3. Merge parents (later wins), then into target's own fields (same-name replaced, others retained); PATCH target.
4. No further copying; inherited fields are not newly created fields for Propagate.

### E. New arrow between existing elements

Use `connections`: `POST /connections` `{ from, to }` copies one hop only. Separately created fields follow B–C.

### F. Remove or rename a field

Never propagate. PATCH element; list downstream elements retaining old field (name, Chapter) for user decision. Never change them unasked.

## Step 4 — Verify and report

1. Read changed elements when needed: new `autoConnect` element or parent same-name conflict.
2. Report names/ids/Chapters; final fields (`generated`, `pii`, `id`); propagation/inheritance sources; lineage gaps; intentional nonchanges (copies, edits/removals not propagated); automatic board updates (pull behavior: API reference).
3. Errors: 400 invalid body/board rule; 404 unknown id; 409 linked copy; 422 invalid stored model. Read `error`, fix cause, retry.
