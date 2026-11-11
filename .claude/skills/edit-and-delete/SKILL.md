---
name: edit-and-delete
description: Rename, edit, move or delete elements through the API; check impact and confirm destructive changes, including type replacement. Use for "rename X", "move this element to another slice/lane/chapter", "delete X", "change this Command into ...", "clean up".
---

# Edit and Delete Elements

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first; use `model-navigation` for lookups. Do not guess rules. Related: `element-fields`, `connections`, `scenarios`, `chapter-setup`.

## Rules to know

| | Rule |
|---|---|
| Change | `PATCH /elements/:id` `{ name?, info?, html?, url?, markdown?, color?, fields?, slice?, lane?, x? }`; `null` removes optional property; unknown keys: 400 |
| Type | Immutable; replace element (below), never PATCH `type` |
| Content | Screen only: `html`/`url`, setting either removes other. Notes only: `markdown`/`color`. Fields only: Screen, Command, Event, Read Model |
| Linked copy | PATCH only `slice`, `lane`, `x`; other fields: 409 naming original. Edit original for content |
| Move | `slice` + `lane` together; lane must accept type. Omitted `x`: board placement; supplied: given offset. `x` alone moves within Cell. Keeps arrows, adds none |
| Cross-Chapter move | Allowed, including copies; **deletes scenarios using element**. Existing arrows may cross Chapters: report, offer local-copy replacements (`connections`, Across Chapters). `SCENARIOS` cannot change Chapter (409) |
| Spec lane | At most one element per slice; occupied destination Cell refused |
| Rename | References use id; scenarios/copies show new name automatically. Field renames never propagate (`element-fields`) |
| Info | Markdown, default empty; not on Scenarios/Notes. Mainly implementation details (formats, limits, integrations, technical constraints); never citations, summaries or traceability. Summaries go in Notes, which may also hold implementation details |
| Delete | `DELETE /elements/:id`: element **and linked copies, all their incoming/outgoing arrows, every scenario using them**; `{ removed: { elements, scenarios } }` |
| Copied fields | Element/arrow deletion leaves previously copied downstream fields |

## Step 1 — Find the element and its impact

1. Search/outline; multiple matches: ask which, naming Chapters. For copy content, use original.
2. **Before moves/deletes**, inspect:
   - Incoming/outgoing arrows: `connectsTo` and elements listing this id.
   - Copies in any Chapter: `copyOf` = this id.
   - Scenarios: `GET /chapters/:id?screenContent=false`; list entries using element/copies in `given`, `when`, `then`.
   - Downstream fields: children and further consumers.
3. Summarize impact (counts/names). **Confirm before every delete, cross-Chapter move dropping scenarios, or irreversible change.** Side-effect-free rename/content edit needs no confirmation.

## Step 2 — Do it

| Do | Call |
|---|---|
| Rename | `PATCH /elements/:id` `{ name }`; use `naming` |
| Info / mockup / notes | PATCH `info`, `html`, `url`, `markdown` or `color`; respect content restrictions above. Screen mockup: `html-screen` |
| Move | PATCH `{ slice, lane, x? }`; destination slice/lane may be in another Chapter |
| Delete | `DELETE /elements/:id` |

Several changes: one atomic `POST /ops` (all or none).

## Changing the type

**Replace**, never mutate type:
1. Record name, fields, parents/children, scenarios and copies.
2. Confirm loss of old arrows/copies/scenarios; copied downstream fields remain.
3. One `POST /ops`: create replacement with fields in valid lane; add still-valid arrows; **then delete old element**. Account for automatic arrows (`slice-modeler`, `connections`) and new type's allowed pairs.
4. Report arrows/copies/scenarios not carried over; redo scenarios with `scenarios`.

## After a change

- Run `model-check` on Chapter; report findings (removed arrows/elements may orphan Commands, Events or Read Models).
- Report changes (names, ids, Chapter), `removed.elements`, `removed.scenarios`, losses and automatic board updates (pull behavior: API reference).
- Errors: 400 invalid body/value or incompatible lane; 404 unknown id; 409 copy content or `SCENARIOS` Chapter move. Read `error`, fix cause, retry.
