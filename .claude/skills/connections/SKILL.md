---
name: connections
description: Link elements with arrows (and remove arrows) through the server API — which pairs may be connected and in which direction, the arrows the server adds by itself when an element is created, and what an arrow copies. Use for "connect X to Y", "link the screen to the command", "remove the arrow", "why is there (no) arrow", "wire up this slice".
---

# Connections (arrows)

Read `eventmodeling-core-rules` first (what each element is, "Connections Read Forward"). Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Do not guess the rules below. To look things up in the model, use the `model-navigation` skill (cheap reads). An arrow copies fields: see the `element-fields` skill.

## Rules to know

| | Rule |
|---|---|
| Allowed pairs | Screen → Command, Processor → Command, Command → Event, Event → Query, Event → Processor, Query → Screen, Query → Processor. Nothing else: not two elements of one type, not Screen → Event, and so on. The list is `connections` in `GET /api/model/rules`. |
| Direction | Fixed by the pair. `POST /connections` accepts the elements in **either order** and creates the arrow in the right direction. |
| Not connectable | `SCENARIOS` and `NOTES` elements have no arrows. |
| No self, no repeat | An element is never connected to itself. A pair is connected **at most once**: a repeat is refused (400). |
| Chapters | **Recommendation:** an arrow joins two elements of the **same Chapter**. To depend on an element of another Chapter, place a **linked copy** of it in this Chapter and connect the copy (see "Across Chapters"). The server accepts cross-Chapter arrows; this is advice, not enforced: do not create them. |
| Moving | The arrows of a moved element stay, also when it moves to another Chapter: arrows left behind then cross Chapters. |
| Linked copies | A linked copy (`copyOf`) can be connected like any element. It gets no fields from its arrows, but its original's fields pass on along them. |
| Stored | On the **source**: its `connectsTo` lists the target ids. An arrow has no id. |
| Fields | A new arrow copies **all** the source's fields to the target (a Processor passes them on: Query → Processor → Command). One hop only, same-named fields replaced. Nothing is propagated further. |
| Delete | Deleting an element deletes its arrows (and its linked copies). |

## Automatic arrows

`POST /elements` adds these arrows at once (`autoConnect`, default `true`; `false` adds none), only **within the new element's slice**. "Above" and "below" mean another lane; the nearest such element is used. An already connected pair is skipped silently.

| New element | Arrow |
|---|---|
| Command, with a Screen above | Screen → Command |
| Event, with a Command above | Command → Event |
| Screen, with a Query below | Query → Screen |
| Query, with a Screen above | Query → Screen |
| Query, when the slice just before has Events | Event → Query, from the right-most Event (the nearest lane on a tie) |
| Command, with a Processor in the slice | Processor → Command, from the nearest Processor |
| Processor, with a Query in the slice | Query → Processor, from the nearest Query |
| Processor, no Query but an Event in an Integration lane of the slice | Event → Processor, from the nearest such Event |

- Every matching rule makes its arrow. Each arrow copies fields as above.
- Moving an element (`PATCH` with `slice`, `lane`, `x`) creates **no** arrows and keeps the existing ones.
- Create the Query before the Processor and the Processor before the Command, or their arrows do not appear.
- Not automatic, so connect them yourself: Event → Query across more than one slice, Event → Processor outside an Integration lane, an element in a different slice from its partner. Anything across Chapters: never connect directly, use a linked copy (see "Across Chapters").

## Step 1 — Find the elements

1. `GET /api/model/search?q=<name>&type=<TYPE>`; keep results whose `name` equals it. Several: ask the user which (name the Chapters), never guess.
2. `GET /api/model/outline` shows every element's `connectsTo` (its targets): check whether the pair is already connected, and what the automatic arrows already did.
3. Check the pair against the table above before the call. If it is not an allowed pair, tell the user and ask: do not make it fit by changing types.
4. Check that both elements are in the **same Chapter** (outline). If not, do not connect them: follow "Across Chapters".

## Step 2 — Connect

`POST /connections` `{ "from": "<id>", "to": "<id>" }` → `{ from, to }` as stored (source, target). Either order is fine; use the order of the flow anyway.

Several arrows: `POST /ops` `{ "ops": [{ "method": "POST", "path": "/connections", "body": { "from": "A", "to": "B" } }, …] }` (atomic: all or none, one revision). A repeat fails the whole batch: check `connectsTo` first.

A new element and its arrows: `POST /elements` already adds the automatic ones; add the others with `POST /connections` after it (in one `POST /ops`, with `as` and `"$<as>"` for the new id).

## Step 3 — Remove

`DELETE /connections` `{ "from": "<id>", "to": "<id>" }` (either order). 404 when not connected. Fields already copied by the arrow **stay** on the target: say so in the report; do not remove them unasked.

## Across Chapters

Recommended: **never connect two elements of different Chapters.** When an element needs something from another Chapter (a Query fed by an Event of another Chapter, a Command issued from a Screen of another Chapter), place a **linked copy** of the other element in *this* Chapter and connect the copy.

1. Take the **original** (a copy of a copy is a copy of the original; Scenarios and Notes cannot be copied).
2. Choose the slice of this Chapter for the copy:
   - an Event copy goes in the **Event lane of the closest earlier slice that already has Events** (a state change or automation slice; an extra Event does not change its type);
   - **never into a state read slice**: a linked copy counts as its original's type, so an Event there would leave the slice without a type;
   - no suitable slice: add one for the copy (`chapter-setup`), name it as the copied Event, and tell the user (a slice holding only a copied fact has no type, which is expected).
3. Create it: `POST /elements` `{ "slice", "lane", "copyOf": "<original id>", "autoConnect": false }`. **Always `autoConnect: false`**: an automatic arrow would connect the copy under a Command of that slice as if the Command had produced it.
4. Connect the copy to the element that needs it: `POST /connections` `{ "from": "<copy id>", "to": "<element id>" }` (for an Event copy feeding a Query in the next slice, the automatic arrow of the Query's own creation also applies when the copy is the right-most Event of the previous slice). Used as a source, a copy gives its **original's fields**, live: the arrow copies them to the target.
5. A scenario still cannot use a copy: it uses the original in the original's Chapter. Say so when a rule needs a condition from another Chapter.
6. The copy cannot be edited (any change is made on the original), and deleting the original deletes its copies and their arrows.

Arrows that already cross Chapters (older models) are not an error: report them and offer to replace each with a copy: create the copy as above, connect it, then `DELETE /connections` the cross-Chapter arrow. Do not do it unasked.

## Chapters

Chapters have arrows too, Chapter → Chapter: `PUT /chapters/:id/connections/:targetId` adds one and `DELETE` removes it. They copy no fields.

## Step 4 — Report

Tell the user:
- the arrows added or removed (source name → target name, Chapter of each);
- the fields copied by each new arrow (the target's fields changed), and that they were not propagated further, unless the user asked for it (then use `element-fields`);
- arrows that were already there (skipped) or not allowed (and why);
- that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed);
- any error: 400 (not an allowed pair, a repeat, itself, Scenarios or Notes), 404 unknown id or not connected. Read `error`, fix the cause, retry.
