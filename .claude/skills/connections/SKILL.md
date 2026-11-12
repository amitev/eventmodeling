---
name: connections
description: Add/remove arrows through the API — allowed pairs, direction, automatic arrows and copied fields. Use for "connect X to Y", "link the screen to the command", "remove the arrow", "why is there (no) arrow", "wire up this slice".
---

# Connections (arrows)

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first (elements, Connections Read Forward). Use `model-navigation` for lookups, `element-fields` for field copying. Do not guess rules.

## Rules to know

| | Rule |
|---|---|
| Allowed pairs | Screen → Command, Processor → Command, Command → Event, Event → Read Model, Read Model → Screen, Read Model → Processor. No others (including same-type pairs, Screen → Event). `GET /rules`: `connections` |
| Direction | Pair determines direction; POST accepts **either order** |
| Forbidden | Self, repeated pair (400), any arrow on `SCENARIOS`/`NOTES` |
| Chapters | **Create same-Chapter arrows only.** Use local linked copies for cross-Chapter dependencies (below). Server accepts direct cross-Chapter arrows; this is a recommendation, not enforced |
| Move | Keeps arrows, even across Chapters; adds none |
| Linked copies | Connect normally; receive no fields, supply original's fields |
| Storage | Source `connectsTo` lists target ids; arrows have no id |
| Fields | New arrow copies **all** source fields, replacing same-named fields; **one hop, no further propagation**. Processor passes them through: Read Model → Processor → Command |
| Delete | Element deletion removes its arrows and linked copies |

## Automatic arrows

`POST /elements`: `autoConnect=true` by default; `false` adds none. Same-slice except the previous-slice Event rule below. Above/below means another lane; choose nearest element. Already connected pairs are silently skipped.

| New element | Arrow |
|---|---|
| Command, with a Screen above | Screen → Command |
| Event, with a Command above | Command → Event |
| Screen, with a Read Model below | Read Model → Screen |
| Read Model, with a Screen above | Read Model → Screen |
| Read Model, when the slice just before has Events | Event → Read Model, from the right-most Event (the nearest lane on a tie) |
| Command, with a Processor in the slice | Processor → Command, from the nearest Processor |
| Processor, with a Read Model in the slice | Read Model → Processor, from the nearest Read Model |

- Every matching rule adds an arrow and copies fields.
- Event → Processor: not automatic; server refuses (board drag only).
- **External Events** (Integration lane): translate via Processor + Command to internal Event before feeding read models (`slice-modeler`, Translation). Separate sources cannot replay reproducibly; external streams have limited retention.
- Creation order **Read Model → Processor → Command** is required for their automatic arrows.
- Add other valid arrows explicitly, including nonadjacent Event → Read Model and other cross-slice pairs. Across Chapters: use linked copies.

## Step 1 — Find the elements

1. `GET /search?q=<name>&type=<TYPE>`; retain exact-name matches. Several: ask which, naming Chapters; never guess.
2. `GET /outline`: inspect `connectsTo` targets for existing/automatic arrows.
3. Validate pair first. Invalid: explain and ask; never change types to make it fit.
4. Different Chapters: follow "Across Chapters", not a direct arrow.

## Step 2 — Connect

`POST /connections` `{ from, to }` → stored `{ from, to }` (source, target). Either input order accepted; prefer flow order.

Several arrows: one atomic `POST /ops`, one revision. Example op: `{"method":"POST","path":"/connections","body":{"from":"A","to":"B"}}`. **Check `connectsTo` first: a repeat fails the whole batch.**

New element + arrows: create element first, then add only nonautomatic arrows in the same batch; use `as` / `"$<as>"` for new ids.

## Step 3 — Remove

`DELETE /connections` `{ from, to }`, either order; 404 if absent. **Copied fields stay on target:** report this; never remove them unasked.

## Across Chapters

For a dependency on another Chapter's Event/Screen, place a **linked copy in the consuming Chapter**, then connect it.

1. Resolve original (copy of copy means original); `SCENARIOS`/`NOTES` cannot be copied.
2. Event copy placement:
   - Event lane of **closest earlier slice already containing Events** (state change/automation; extra Event preserves type).
   - **Never a state-read slice:** copy counts as original type; Event would invalidate it.
   - No suitable slice: use `chapter-setup` to add one named like copied Event; report it. Copied-fact-only slice having no type is expected.
3. `POST /elements` `{ slice, lane, copyOf: "<original id>", autoConnect: false }`. **Always disable autoConnect:** otherwise slice's Command could appear to produce the copied Event.
4. `POST /connections` `{ from: "<copy id>", to: "<consumer id>" }`. Copy supplies original's live fields; arrow copies them to target. Creating a Read Model in the next slice may auto-connect a right-most Event copy in the preceding slice.
5. Scenarios cannot use copies or another Chapter's original; report cross-Chapter precondition limits.
6. Edit content on original; deleting it removes copies and their arrows.

Existing cross-Chapter arrows are not errors. Report and offer replacement: create local copy, connect, then delete old arrow. **Never migrate unasked.**

## Chapters

`PUT /chapters/:id/connections/:targetId`: Chapter → Chapter; `DELETE` removes. No field copying.

`PUT /slices/:id/connections/:targetId`: slice bottom centre → another Chapter in same Context, never own Chapter; `DELETE` removes. Targets in slice `connectsTo`; no field copying. Multiple slices/Chapter end may share target. Deleting source slice removes its arrows; deleting target Chapter removes incoming arrows.

## Step 4 — Report

- Added/removed arrows: source → target names and Chapters.
- New arrows copy fields one hop only; separately created fields follow `element-fields`. On removal, copied fields remain.
- Skipped existing arrows; rejected pairs and reasons.
- Automatic board updates (pull behavior: API reference).
- Errors: 400 invalid/repeated/self pair or Scenarios/Notes; 404 unknown id/missing connection. Read `error`, fix cause, retry.
