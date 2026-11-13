---
name: slice-modeler
description: Atomically build a fully specified state-change, state-read, automation or translation slice, including elements, lanes, arrows and fields. Use to add/model a slice, view or automation.
---

# Slice Modeler

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first (types, lanes, naming, causality); lookups: `model-navigation`. Do not guess rules. Details: `chapter-setup` (structure), `connections`, `element-fields`, `html-screen` (mockups), `scenarios` (GWT).

Build with **one atomic `POST /ops`**, all or none, one revision/write. Refused op changes nothing; error prefixed `ops[<index>]: `.

## Step 1 — Gather (ask, do not assume)

1. **Chapter/place:** `GET /outline`; ask Chapter and insertion point (after which slice, or end). Select one lane per needed type; multiple choices: ask. Missing type: ask, then add via `chapter-setup`. Processors use system-actor lanes, Screens human-role lanes; prefer system lanes above human lanes when adding.
2. **Behavior/type:** user's words for who acts, recorded facts and displayed data; choose recipe below. Unclear: ask.
3. **Names:** business language (`naming`); slice exactly like Command/Read Model/Processor; Screen user-facing, Command imperative, Event past tense, Read Model noun phrase. Unsure: ask.
4. **Fields:** use names/types/flags from the user or parents; never invent. Read Model fields describe one result item; set element `isList: true` for list results, omit for single results. Ask whether a query returns one or many items when unclear. Mark `generated` only for system-created data; otherwise ask. Apply the core completeness rule to non-copy elements with incoming arrows.
5. **Mandatory reuse check:** before creating any Read Model or Screen, search the outline for existing definitions and resolve `copyOf` to the canonical original. Read candidate originals' fields, `isList`, `info` and Screen content. The same business query/view or interaction **must use a linked copy**, even when a later Event changes displayed values. Compare Read Model and Screen separately; a distinct interaction may need a new Screen but the same Read Model. Multiple independent matches or unclear identity: ask. A new original requires a genuinely different definition, never just a refresh. Also find existing dependencies (e.g. earlier Event feeding Read Model).

## How the server wires things

- Lane alone determines row. Omit `x` for board placement/automatic widening, **except automation/translation layout below**.
- `autoConnect=true` by default, using elements already present. Same-slice arrows: Screen above → new Command; Command above → new Event; Read Model below → new Screen; new Read Model → Screen above; nearest Processor → new Command; nearest Read Model → new Processor. New Read Model also receives previous slice's **right-most Event**. **Follow recipe creation order.**
- Each arrow into a non-copy copies all source fields, replacing same-named target fields. POST keeps own fields, then merges parent's; supply only added fields. Linked copies receive no fields and supply their original's fields; incoming Events must not be used to reshape a copy.
- Other arrows: `POST /connections`. Previous right-most Event is only a guess: for other/multiple feeding Events use `autoConnect: false`, then connect explicitly.
- `info`: mainly implementation details (formats, limits, integrations, technical constraints), never notes/citations/summaries. Put those in Notes, which may also hold implementation details; one Notes element per Spec Cell.

## Recipes

Lanes belong to target Chapter. `<...>` ids come from outline; `$name` resolves earlier op's `as: "name"` in path segments/body values.

### State change — Screen → Command → Event

1. `POST /chapters/<chapter>/slices` `{ name, after }`, `as: "s"`
2. `POST /elements` Screen: `{ slice: "$s", lane: <Actor lane>, type: "SCREEN", name, fields }` (entered/shown data), `as: "screen"`
3. `POST /elements` Command: `{ slice: "$s", lane: <Interaction lane>, type: "COMMAND", name, fields }` (extras only, e.g. `generated` acting user/time), `as: "cmd"` → Screen → Command, fields copied
4. `POST /elements` per resulting fact: `{ slice: "$s", lane: <Event lane>, type: "EVENT", name, fields }` → Command → Event, fields copied. **Captured facts only:** PATCH away computed/display-only fields afterwards.

Nonhuman trigger/no Screen: use Automation.

### State read — Read Model → Screen

**Choose reuse before the creation recipe below.** If the same Read Model or Screen exists, use the linked-copy recipe for that element, not a new normal element. Changes to appointment rows after create/update/delete are reuse, not new view definitions.

1. Slice as above.
2. `POST /elements` Read Model: `{ slice: "$s", lane: <Interaction lane>, type: "READ_MODEL", name, fields, isList? }`, `as: "q"`. Set `isList: true` for list results; omit for single results. Fields describe one result item, never an outer `list: true` wrapper for multiple results. Ask if cardinality is unclear. Previous right-most Event auto-feeds it; alternatively `autoConnect: false`, then `POST /connections` per feeding Event `{ from: <event>, to: "$q" }`. **Connect Events → PATCH final Read Model fields → only then create Screen/connect onward.** Incoming arrows copy flat Event fields; outgoing arrows copy current fields, so wrong order gives Screen flat fields.
3. `POST /elements` Screen: `{ slice: "$s", lane: <Actor lane>, type: "SCREEN", name, fields }` (entered/calculated extras) → Read Model → Screen, fields copied.

**Repeated view — linked-copy recipe** (same atomic batch):

1. Create the later state-read slice immediately after the Event's slice.
2. `POST /elements` `{ slice: "$s", lane: <Interaction lane>, copyOf: <original Read Model id>, autoConnect: false }`, `as: "q"`.
3. Explicitly connect the relevant earlier Events to `"$q"` with `POST /connections`. Keep all arrows forward; never connect the later Event backward to the original.
4. `POST /elements` `{ slice: "$s", lane: <Actor lane>, copyOf: <original Screen id>, autoConnect: false }`, `as: "screen"`, then explicitly connect `"$q"` to `"$screen"`. Copies mirror content, not the original occurrence's arrows.
5. Do not send `type`, `name`, `fields`, `isList`, `html` or `info` on copy creation, and do not PATCH copy content. If the shared definition needs fields, update the original via `element-fields` before connecting onward. If only one of the two definitions is reused, use a copy for it and the normal recipe for the genuinely new element.

Other Chapter's Event: **local linked copy, never direct arrow** (`connections`, Across Chapters). `POST /elements` `{ slice, lane, copyOf, autoConnect: false }` **outside state-read slice**, then connect copy → Read Model.

### Automation — Event → Read Model → Processor → Command → Event

**Layout (also translation):** Read Model left, Command right **in same Interaction lane**; Processor above in Actor lane; Event **directly under Command** in Event lane. Slice-relative `x`: Read Model `40`, Command `220`, Processor `140` (centred over both, snapped to board's 20px grid), Event `220`. Elements 160px wide, gap 20px, margin 40px. **Never omit Event `x`: server would centre it instead.**

1. Slice as above.
2. **Todo Read Model**: `{ type: "READ_MODEL", lane: <Interaction lane>, isList: true, x: 40, autoConnect: false }`, `as: "q"`. Its fields describe one todo item; its query returns the open items. Do not add an outer list field. Connect opening Events individually; **PATCH final item fields before any outgoing arrow** (incoming arrows add flat fields).
3. Processor: `{ type: "PROCESSOR", lane: <Actor lane>, x: 140, name }`, `as: "p"`; no fields → automatic Read Model → Processor.
4. Command: `{ type: "COMMAND", lane: <Interaction lane>, x: 220, name, fields }`, `as: "cmd"` → automatic Processor → Command, passing Read Model fields through. Missing arrows (e.g. `autoConnect: false`): `POST /connections` `{ from: "$q", to: "$p" }`, `{ from: "$p", to: "$cmd" }`.
5. **Only now** Event(s): `{ type: "EVENT", lane: <Event lane>, x: 220, name }` → automatic Command → Event. One-hop copying means earlier Event creation misses Read Model fields. Multiple Events: first at `220`, others beside it in Event lane.
6. Command's Events **close** todo items: connect each → Read Model `{ from: <event>, to: "$q" }`, then **PATCH final Read Model fields again** (arrows add flat fields). Without closing arrow, items never close.

### Translation — external Event → Read Model → Processor → Command → internal Event

Payload mapping, correlation or delivery policies unclear: use `translating-external-events` to discover and confirm them before building.

Use Automation recipe/layout, plus ≥1 external Event/Read Model in **Integration** lane; this makes type translation.
- Ask system name, Event source and Integration lane. One lane per system, named after it; `info` describes delivery (`eventmodeling-core-rules`, External systems). Missing lane: ask name/details, add via `chapter-setup`.
- Create external Event **first**, or reuse from outline: `POST /elements` `{ slice: "$s", lane: <Integration lane>, type: "EVENT", name: <system's name>, fields: <payload> }`.
- Then create todo Read Model with `isList: true, autoConnect: false`; connect external Event → todo Read Model. Its fields describe one todo item; the query returns the items, and the translation todo never closes.
- Command records internal Event in domain language. **External Event feeds no other Read Model**; only internal Event feeds read models. This preserves replay position in event store; separate sources cannot guarantee order and external retention is limited.

## Step 2 — Write

`POST /ops` `{ ops: [...] }`; build JSON with `ConvertTo-Json -Depth 20` or `JSON.stringify`. State-change example:

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

Check each `results[]` status/body.

## Step 3 — Finish and verify

1. `GET /outline?context=<id>`: expected `STATE_CHANGE`/`STATE_READ`/`AUTOMATION`/`TRANSLATION`, correct lanes and recipe arrows. `null`: fix missing element/arrow.
2. `GET /elements/:id` for arrow-affected fields; apply the core completeness rule and report gaps. For copies, read the original and verify `copyOf` resolves to the intended definition. Adjust originals only via `element-fields` PATCH (whole-list replacement, no propagation). Confirm repeated views did not become independent originals.
3. New normal Screen is placeholder: **offer `html-screen`, never skip silently**; a Screen copy reuses the original's mockup, so offer a design only if that original lacks one. Offer `scenarios` for Command.
4. Report slice (id/name/type/Chapter), elements (id/type/name/lane), automatic/explicit arrows, inherited fields, gaps (no field source, unfed Read Model, uncertain arrow), automatic board updates (pull behavior: API reference).
5. Error names op: read `error`, fix cause, retry **whole batch**; failed batch wrote nothing.
