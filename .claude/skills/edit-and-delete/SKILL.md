---
name: edit-and-delete
description: Safely rename, edit, move or delete an existing element through the server API, with the side effects checked and confirmed first — what a rename shows elsewhere, what a move keeps or deletes, what a delete removes (arrows, linked copies, scenarios), and how to change an element's type. Use for "rename X", "move this element to another slice/lane/chapter", "delete X", "change this Command into ...", "clean up".
---

# Edit and Delete Elements

Read `eventmodeling-core-rules` first. To look things up in the model, use the `model-navigation` skill (cheap reads). Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Do not guess the rules below. Fields, arrows, scenarios and structure (lanes, slices, Chapters) have their own skills: `element-fields`, `connections`, `scenarios`, `chapter-setup`.

## Rules to know

| | Rule |
|---|---|
| Change | `PATCH /elements/:id` `{ name?, info?, html?, url?, markdown?, color?, fields?, slice?, lane?, x? }`. `null` removes an optional property. Unknown properties get 400. |
| Type | Never changes: there is no `type` in a `PATCH`. See "Changing the type". |
| Screen content | Setting `html` removes `url` and the reverse. `html` and `url` only on a Screen; `markdown` and `color` only on Notes; `fields` only on Screen, Command, Event, Query. |
| Linked copy | Accepts only `slice`, `lane` and `x`. Any other change gets 409 naming the original: change the original. |
| Move | `slice` and `lane` come **together**. The lane must take the element's type. Without `x` the element is placed like the board does; with `x` as given. Its arrows stay and none are added. `x` alone moves it inside its Cell. |
| Move to another Chapter | Allowed (also for linked copies). Scenarios that use the element are **deleted**. Its arrows stay, so those to elements of the old Chapter now cross Chapters: report them and offer to replace each with a linked copy (`connections`, "Across Chapters"). A Scenarios element cannot change Chapter (409). |
| Spec lane | Holds at most one element per slice: a move into an occupied Cell is refused. |
| Rename | A name is used everywhere by id: scenarios and linked copies show the new name by themselves. A rename of a field is not propagated (see `element-fields`). |
| Info | Markdown, empty by default; not on Scenarios or Notes. Reserved mainly for implementation details (formats, limits, integrations, technical constraints). Not for source citations, summaries or traceability: summaries go in Notes elements. |
| Delete | `DELETE /elements/:id` removes the element **and** its linked copies, all arrows to and from them, and every scenario that uses them. Answer: `{ removed: { elements, scenarios } }`. |
| Fields already copied | Deleting an element or an arrow does not remove the fields it copied downstream. |

## Step 1 — Find the element and its impact

1. Find it (`search`, or the outline). Several matches: ask which one (name their Chapters). A linked copy: use its original for content changes.
2. For a **move or delete**, work out the impact before touching anything:
   - **Arrows:** the element's `connectsTo` and the elements that list it (outline).
   - **Linked copies:** elements whose `copyOf` is its id (outline), in any Chapter.
   - **Scenarios:** read its Chapter (`GET /chapters/:id?screenContent=false`) and list the scenarios of every `SCENARIOS` element that have the element (or one of its copies) in `given`, `when` or `then`.
   - **Downstream fields:** what the element's fields fed (children and below).
3. Tell the user the impact in a few lines (counts and names), and **ask for confirmation** before any delete, any move to another Chapter that drops scenarios, and any change that cannot be undone from here. A rename or content edit with no side effects needs no confirmation.

## Step 2 — Do it

| Do | Call |
|---|---|
| Rename | `PATCH /elements/:id` `{ "name": "…" }` (names: see `naming`) |
| Change info / mockup / notes | `PATCH` with `info`, `html`, `url`, `markdown` or `color`. `info` only for implementation details (see the rule above): do not move notes, citations or summaries into it. For a Screen mockup use `html-screen` |
| Move inside the Chapter | `PATCH` `{ "slice": "<slice id>", "lane": "<lane id>", "x"? }` |
| Move to another Chapter | the same with a slice and lane of that Chapter |
| Delete | `DELETE /elements/:id` |

Several changes (for example delete an element and add its replacement): one `POST /ops`, so all of it is applied or none of it.

## Changing the type

The type cannot be changed. To turn, say, an Event into a Command, **replace** the element:
1. Note what it has: name, fields, arrows (parents and children), scenarios, copies.
2. Confirm with the user: the replacement loses its arrows, copies and scenarios, and the fields it passed on stay downstream.
3. In one `POST /ops`: create the new element in a lane that takes the new type (`slice-builder` and `connections` explain the automatic arrows), with the fields; add the arrows that remain valid (the allowed pairs differ per type); then delete the old element.
4. Report which arrows, copies and scenarios could not be carried over and must be redone (`scenarios`).

## After a change

- A removed arrow or element can leave a Command without an issuer, an Event no Command produces, or a Query nothing feeds: run `model-check` on the Chapter and report what it finds.
- Report: what changed (names and ids, Chapter), what the delete removed (`removed.elements`, `removed.scenarios`), what could not be carried over, and that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed).
- Errors: 400 (invalid body or value, a lane that does not take the type), 404 unknown id, 409 (a linked copy's content, a Scenarios element changing Chapter). Read `error`, fix the cause, retry.
