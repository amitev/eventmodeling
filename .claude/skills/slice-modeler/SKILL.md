---
name: slice-modeler
description: Build a whole slice in one atomic call — the slice, its elements in the right lanes, the arrows and the fields — for the four slice types (state change, state read, automation, translation). Use for "add a slice for X", "model the Place Order step", "create a screen, command and event for Y", "add a view for Z", "add an automation that reacts to E".
---

# Slice Modeler

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` first (element types, lanes, slice types, naming, causality). Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Do not guess the rules below. To look things up in the model, use the `model-navigation` skill (cheap reads). The details live in other skills: `chapter-setup` (slices, lanes), `connections` (arrows), `element-fields` (fields), `html-screen` (mockup), `scenarios` (Given/When/Then).

A slice is built with **one `POST /api/model/ops`**: atomic (all or none), one revision, one write. A refused op changes nothing and its message starts `ops[<index>]: `.

## Step 1 — Gather (ask, do not assume)

1. **Chapter and place.** `GET /api/model/outline`. Ask which Chapter, and after which slice the new one goes (or at the end). The Chapter needs lanes for the types below: one lane per needed type. Several lanes of one type: ask which. A missing type: ask, then add it as `chapter-setup` says. Several Actor lanes: Processors go in a system-actor lane, Screens in a human-role lane; prefer system-actor lanes on top of the human ones when adding a lane.
2. **Type of slice and the business behaviour**, in the user's words: who does what, which facts are recorded, what is shown. Pick the recipe below. Not clear which one: ask.
3. **Names** in business language, as the core rules and `naming` say: the slice named exactly like its Command, Query or Processor; Screen as a user calls it; Command imperative; Event past tense; Query a noun phrase. Unsure: ask.
4. **Fields** (names, types, flags) of each element: from the user or from the upstream elements (they copy along the arrows). Do not invent data: a field with no source is `generated: true` or a question to the user.
5. Existing elements the slice must reuse (an Event of an earlier slice feeding a Query): find them in the outline by name; several matches: ask.

## How the server wires things

- Elements are placed in the lane you name, with `x` left out (placed like the board does; the slice widens as needed). Only the lane decides the row. The one case where you give `x` is the automation layout (see Automation).
- With `autoConnect` (default `true`) a new element gets arrows **within its slice** at once, using the elements that exist at that moment: Command with a Screen above ← Screen; Event with a Command above ← Command; Screen with a Query below ← Query; Query with a Screen above → Screen; a Query also ← the right-most Event of the **previous slice**; Command with a Processor in the slice ← Processor (nearest); Processor with a Query in the slice ← Query (nearest). Create elements in the order of the recipe so these arrows appear.
- An arrow copies all the source's fields to the target, replacing same-named fields. An element's own `fields` in the same `POST` are kept, then the parent's fields are merged in: give each element only the fields it adds, the rest arrives by itself.
- Every arrow not listed above is created with `POST /connections`.
- The right-most Event of the previous slice is only a guess. When the Query should be fed by other Events (or by several), create it with `"autoConnect": false` and connect the right ones explicitly.
- Do not use `info` on the elements you create for notes, source citations or summaries: it is reserved mainly for implementation details (formats, limits, integrations, technical constraints). Notes and summaries go in Notes elements.

## Recipes

Lane = lane of that type in the Chapter. Ids written `<...>` come from the outline; `$name` refers to the id created by an earlier op (`"as": "name"`, in a path segment or a body value).

### State change — Screen → Command → Event

1. `POST /chapters/<chapter>/slices` `{ name, after }`, `as: "s"`
2. `POST /elements` Screen: `{ slice: "$s", lane: <Actor lane>, type: "SCREEN", name, fields }` (the data the user enters or sees), `as: "screen"`
3. `POST /elements` Command: `{ slice: "$s", lane: <Interaction lane>, type: "COMMAND", name, fields }` (extra fields only, e.g. `generated` context such as the acting user and the time), `as: "cmd"` → arrow Screen → Command, fields copied
4. `POST /elements` Event per resulting fact: `{ slice: "$s", lane: <Event lane>, type: "EVENT", name, fields }` → arrow Command → Event, fields copied (an Event holds only captured facts: remove computed or display-only fields afterwards with `PATCH`).

Without a Screen (the trigger is not a person) it is not this recipe: use Automation.

### State read — Query → Screen

1. Slice as above.
2. `POST /elements` Query: `{ slice: "$s", lane: <Interaction lane>, type: "QUERY", name, fields }`; fed by the Events that build it (an automatic arrow from the previous slice's right-most Event, or `autoConnect: false` and then `POST /connections` per Event, `{ from: <event>, to: "$q" }`). A Query that returns rows has a `list: true` `object` field. **Order matters:** each Event arrow copies the Event's fields into the Query as flat fields, and every later arrow out of the Query copies the Query's fields at that moment. So connect the Events first, then `PATCH` the Query to its final fields (the list field), and only then create the Screen (step 3) or connect the Query onward; otherwise the Screen gets the Event's flat fields.
3. `POST /elements` Screen: `{ slice: "$s", lane: <Actor lane>, type: "SCREEN", name, fields }` (what is entered or calculated on top of the Query's fields) → arrow Query → Screen, the Query's fields copied.

Events from another Chapter are not connected directly (the recommendation in `connections`, "Across Chapters"): place a linked copy of the Event in **this** Chapter (`POST /elements` `{ slice, lane, copyOf, "autoConnect": false }`, never into the state read slice itself) and connect the copy to the Query with `POST /connections`.

### Automation — Event → Query → Processor → Command → Event

**Layout:** the Query comes first and the Command (the action) sits **next to it, to its right, in the same Interaction lane**; the Processor is in the Actor lane above them; the Event is in the Event lane **directly under the Command** (same `x`). Give these `x` (relative to the slice, 160px wide elements, 20px gap, 40px margin): Query `40`, Command `220`, Processor `140` (centred over both, snapped to the 20px grid like the board's compaction, R5.20a), Event `220`. Never leave the Event's `x` out: the server would centre it, not put it under the Command.

1. Slice as above.
2. Query (the **todo list**, list-shaped): `{ type: "QUERY", lane: <Interaction lane>, x: 40 }`, `autoConnect: false`. Connect the Events that **open** it (`POST /connections`, one per Event), then `PATCH` the Query to its final fields (the list field: arrows copy the Events' flat fields into it) **before** any arrow leaves it (step 3).
3. Processor: `{ type: "PROCESSOR", lane: <Actor lane>, x: 140, name }` (no fields) → arrow Query → Processor is automatic.
4. Command: `{ type: "COMMAND", lane: <Interaction lane>, x: 220, name, fields }` → arrow Processor → Command is automatic: the Processor passes the Query's fields on to the Command. (If the arrows did not appear, e.g. with `autoConnect: false`, add them with `POST /connections` `{ from: "$q", to: "$p" }` and `{ from: "$p", to: "$cmd" }`.)
5. **Only now** the Event(s): `{ type: "EVENT", lane: <Event lane>, x: 220, name }` → arrow Command → Event is automatic. Fields copy one hop only, so an Event created before step 4 gets none of the Query's fields through the Command. With several Events, put the first at `x: 220` and place the others beside it in the Event lane.
6. The Events that **close** the todo list are these Events (the Command's): connect each to the Query (`POST /connections` `{ from: <event>, to: "$q" }`), then `PATCH` the Query's fields once more (the arrow copies the Event's flat fields into it). Without this arrow an item never closes.

### Translation — external Event → Query → Processor → Command → internal Event

As Automation (same layout: Query first, Command next to it, Event under the Command), plus at least one element in an **Integration** lane (an Event or Query of the external system there), which is what makes the slice a translation. Ask the user where the external Event is and which Integration lane to use. The Query is the todo list (never closed). The Command's Event is the internal fact in this domain's language. **Never connect the external Event to any other Query** (a read model): it is stored as an internal Event first, and only that Event feeds read models. On replay the internal Event is at the same point in the event store, which two separate sources cannot guarantee; external streams also keep events only for a limited time.

## Step 2 — Write

`POST /api/model/ops` `{ "ops": [ … ] }`; `body` as JSON, built with `ConvertTo-Json -Depth 20` or `JSON.stringify`. Example (state change, one Event):

```json
{ "ops": [
  { "method": "POST", "path": "/chapters/CH1234/slices", "body": { "name": "Place Order", "after": "SL1234" }, "as": "s" },
  { "method": "POST", "path": "/elements", "body": { "slice": "$s", "lane": "LA0001", "type": "SCREEN", "name": "Checkout",
      "fields": [{ "name": "customerName" }, { "name": "quantity", "type": "integer" }] }, "as": "screen" },
  { "method": "POST", "path": "/elements", "body": { "slice": "$s", "lane": "LA0002", "type": "COMMAND", "name": "Place Order",
      "fields": [{ "name": "orderedAt", "type": "datetime", "generated": true }] }, "as": "cmd" },
  { "method": "POST", "path": "/elements", "body": { "slice": "$s", "lane": "LA0003", "type": "EVENT", "name": "Order Placed" } }
] }
```

Read `results[]` (status and body of each op).

## Step 3 — Finish and verify

1. `GET /api/model/outline?context=<id>`: the new slice's `type` must be the expected one (`STATE_CHANGE`, `STATE_READ`, `AUTOMATION`, `TRANSLATION`), every element in the right lane, `connectsTo` as in the recipe. A slice of type `null` means an element or arrow is missing: fix it.
2. Check the fields of the elements that changed through arrows (`GET /elements/:id`): adjust with `PATCH` as `element-fields` says (it replaces the list and propagates nothing).
3. A new Screen has no mockup yet: it is an empty placeholder. Offer `html-screen` (do not skip it silently), and offer `scenarios` for the Command.
4. Report:
   - the slice (id, name, type, Chapter) and each element created (id, type, name, lane);
   - the arrows (automatic and added) and the fields each element got by copying;
   - gaps: fields with no source, a Query without an Event feeding it, an arrow to confirm;
   - that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed);
   - any error: read `error` (it names the op), fix the cause, retry the whole batch (nothing was written).
