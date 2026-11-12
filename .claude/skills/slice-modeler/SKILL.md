---
name: slice-modeler
description: Build a state-change, state-read, automation or translation slice in one atomic call, including elements, lanes, arrows and fields. Use for "add a slice for X", "model the Place Order step", "create a screen, command and event for Y", "add a view for Z", "add an automation that reacts to E".
---

# Slice Modeler

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first (types, lanes, naming, causality); lookups: `model-navigation`. Do not guess rules. Details: `chapter-setup` (structure), `connections`, `element-fields`, `html-screen` (mockups), `scenarios` (GWT).

Build with **one atomic `POST /ops`**, all or none, one revision/write. Refused op changes nothing; error prefixed `ops[<index>]: `.

## Step 1 — Gather (ask, do not assume)

1. **Chapter/place:** `GET /outline`; ask Chapter and insertion point (after which slice, or end). Select one lane per needed type; multiple choices: ask. Missing type: ask, then add via `chapter-setup`. Processors use system-actor lanes, Screens human-role lanes; prefer system lanes above human lanes when adding.
2. **Behavior/type:** user's words for who acts, recorded facts and displayed data; choose recipe below. Unclear: ask.
3. **Names:** business language (`naming`); slice exactly like Command/Read Model/Processor; Screen user-facing, Command imperative, Event past tense, Read Model noun phrase. Unsure: ask.
4. **Fields:** use names/types/flags from the user or parents; never invent. Read Model fields describe one result item; query cardinality is separate. Ask whether a query returns one or many items when unclear. Mark `generated` only for system-created data; otherwise ask. Apply the core completeness rule to non-copy elements with incoming arrows.
5. **Reuse:** find existing dependencies (e.g. earlier Event feeding Read Model) by outline name; multiple matches: ask.

## How the server wires things

- Lane alone determines row. Omit `x` for board placement/automatic widening, **except automation/translation layout below**.
- `autoConnect=true` by default, using elements already present. Same-slice arrows: Screen above → new Command; Command above → new Event; Read Model below → new Screen; new Read Model → Screen above; nearest Processor → new Command; nearest Read Model → new Processor. New Read Model also receives previous slice's **right-most Event**. **Follow recipe creation order.**
- Each arrow copies all source fields, replacing same-named target fields. POST keeps own fields, then merges parent's; supply only added fields.
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

1. Slice as above.
2. `POST /elements` Read Model: `{ slice: "$s", lane: <Interaction lane>, type: "READ_MODEL", name, fields }`, `as: "q"`. Its fields describe one result item; the query may return one or many items. Do not add an outer `list: true` field for multiple results. Ask if result cardinality is unclear. Previous right-most Event auto-feeds it; alternatively `autoConnect: false`, then `POST /connections` per feeding Event `{ from: <event>, to: "$q" }`. **Connect Events → PATCH final Read Model fields → only then create Screen/connect onward.** Incoming arrows copy flat Event fields; outgoing arrows copy current fields, so wrong order gives Screen flat fields.
3. `POST /elements` Screen: `{ slice: "$s", lane: <Actor lane>, type: "SCREEN", name, fields }` (entered/calculated extras) → Read Model → Screen, fields copied.

Other Chapter's Event: **local linked copy, never direct arrow** (`connections`, Across Chapters). `POST /elements` `{ slice, lane, copyOf, autoConnect: false }` **outside state-read slice**, then connect copy → Read Model.

### Automation — Event → Read Model → Processor → Command → Event

**Layout (also translation):** Read Model left, Command right **in same Interaction lane**; Processor above in Actor lane; Event **directly under Command** in Event lane. Slice-relative `x`: Read Model `40`, Command `220`, Processor `140` (centred over both, snapped to board's 20px grid), Event `220`. Elements 160px wide, gap 20px, margin 40px. **Never omit Event `x`: server would centre it instead.**

1. Slice as above.
2. **Todo Read Model**: `{ type: "READ_MODEL", lane: <Interaction lane>, x: 40, autoConnect: false }`, `as: "q"`. Its fields describe one todo item; its query returns the open items. Do not add an outer list field. Connect opening Events individually; **PATCH final item fields before any outgoing arrow** (incoming arrows add flat fields).
3. Processor: `{ type: "PROCESSOR", lane: <Actor lane>, x: 140, name }`, `as: "p"`; no fields → automatic Read Model → Processor.
4. Command: `{ type: "COMMAND", lane: <Interaction lane>, x: 220, name, fields }`, `as: "cmd"` → automatic Processor → Command, passing Read Model fields through. Missing arrows (e.g. `autoConnect: false`): `POST /connections` `{ from: "$q", to: "$p" }`, `{ from: "$p", to: "$cmd" }`.
5. **Only now** Event(s): `{ type: "EVENT", lane: <Event lane>, x: 220, name }` → automatic Command → Event. One-hop copying means earlier Event creation misses Read Model fields. Multiple Events: first at `220`, others beside it in Event lane.
6. Command's Events **close** todo items: connect each → Read Model `{ from: <event>, to: "$q" }`, then **PATCH final Read Model fields again** (arrows add flat fields). Without closing arrow, items never close.

### Translation — external Event → Read Model → Processor → Command → internal Event

Use Automation recipe/layout, plus ≥1 external Event/Read Model in **Integration** lane; this makes type translation.
- Ask system name, Event source and Integration lane. One lane per system, named after it; `info` describes delivery (`eventmodeling-core-rules`, External systems). Missing lane: ask name/details, add via `chapter-setup`.
- Create external Event **first**, or reuse from outline: `POST /elements` `{ slice: "$s", lane: <Integration lane>, type: "EVENT", name: <system's name>, fields: <payload> }`.
- Then create todo Read Model with `autoConnect: false`; connect external Event → todo Read Model. Its fields describe one todo item; the query returns the items, and the translation todo never closes.
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
2. `GET /elements/:id` for arrow-affected fields; apply the core completeness rule and report gaps. Adjust via `element-fields` PATCH (whole-list replacement, no propagation).
3. New Screen is placeholder: **offer `html-screen`, never skip silently**; offer `scenarios` for Command.
4. Report slice (id/name/type/Chapter), elements (id/type/name/lane), automatic/explicit arrows, inherited fields, gaps (no field source, unfed Read Model, uncertain arrow), automatic board updates (pull behavior: API reference).
5. Error names op: read `error`, fix cause, retry **whole batch**; failed batch wrote nothing.
