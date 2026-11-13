---
name: slice-modeler
description: Model a slice, workflow or process with atomic structure creation, HTML screen mockups and Given/When/Then scenarios. Supports state-change, state-read, automation and translation slices.
---

# Slice Modeler

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first (types, lanes, naming, causality); lookups: `model-navigation`. Do not guess rules. Details: `chapter-setup` (structure), `connections`, `element-fields`, `html-screen` (mockups), `scenarios` (GWT).

Build the structure with **one atomic `POST /ops`**, all or none, one revision/write. Refused op changes nothing; error prefixed `ops[<index>]: `. The required HTML and scenario steps below may use subsequent API writes; do not describe the entire workflow as atomic when they do.

**Default deliverable:** modeling a slice, workflow or process includes its structure, fields, **persisted HTML screen mockups and Given/When/Then scenarios**. Invoke `html-screen` and `scenarios` as applicable; merely offering them as follow-up is not completion. Skip either only when the user explicitly excludes it (for example, "structure only"). This applies to elements in the requested scope, not unrelated existing placeholders. Automation/translation without Screens needs no mockup; state-read slices need no GWT scenarios.

## Step 1 — Gather (ask, do not assume)

1. **Chapter/place:** `GET /outline`; ask Chapter and insertion point (after which slice, or end). Select one lane per needed type; multiple choices: ask. Missing type: ask, then add via `chapter-setup`. Processors use system-actor lanes, Screens human-role lanes; prefer system lanes above human lanes when adding.
2. **Behavior/type:** user's words for who acts, recorded facts and displayed data; choose recipe below. Unclear: ask.
3. **Names:** business language (`naming`); slice exactly like Command/Read Model/Processor; Screen user-facing, Command imperative, Event past tense, Read Model noun phrase. Unsure: ask.
4. **Fields:** use names/types/flags from the user or parents; never invent. Read Model fields describe one result item; set element `isList: true` for list results, omit for single results. Ask whether a query returns one or many items when unclear. Mark `generated` only for system-created data; otherwise ask. Apply the core completeness rule to non-copy elements with incoming arrows.
5. **Mandatory reuse check:** before creating any Read Model or Screen, search the outline for existing definitions and resolve `copyOf` to the canonical original. Read candidate originals' fields, `isList`, `info` and Screen content. The same business query/view or interaction **must use a linked copy**, even when a later Event changes displayed values. Compare Read Model and Screen separately; a distinct interaction may need a new Screen but the same Read Model. Multiple independent matches or unclear identity: ask. A new original requires a genuinely different definition, never just a refresh. Also find existing dependencies (e.g. earlier Event feeding Read Model).
6. **Screens and scenario coverage:** gather happy-path behavior and documented rejection rules with the workflow requirements. Do not invent business rules to fill scenarios; synthetic example values are allowed. For Command slices, identify an existing `SPEC` lane and Scenarios container. If a lane is missing, ask permission during this initial clarification, then add it via `chapter-setup`; if a Spec Cell is occupied by Notes, ask rather than replacing it. Record any explicitly named style reference for `html-screen`, but do not select an existing Screen as a reference yourself.

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
3. Explicitly connect the relevant earlier Events to `"$q"` with `POST /connections`; eligible distant arrows may be omitted per `eventmodeling-core-rules`. Keep all arrows forward; never connect the later Event backward to the original.
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
6. Command's Events **close** todo items: connect each → Read Model `{ from: <event>, to: "$q" }`, then **PATCH final Read Model fields again** (arrows add flat fields). This same-slice back arrow is allowed by `eventmodeling-core-rules`. Without closing arrow, items never close.

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

## Step 3 — Create HTML screens and GWT scenarios

These are required execution steps, not optional offers, unless explicitly excluded by the user.

1. **HTML:** invoke `html-screen` for every new original Screen. Pass the known Context, Chapter, slice and Screen ids, fields, confirmed behavior and any explicitly named style reference. Work on those ids rather than asking the user to select already identified elements. Generate real HTML mockups, not new placeholder Screen elements.
2. Resolve Screen copies to their canonical originals and process each original once. Reuse an existing original's HTML; if it is blank and in scope, invoke `html-screen` on that original. Never write HTML to a copy. Preserve existing designs unless changes are requested; URL-only Screens still require confirmation before replacing the URL with HTML.
3. **GWT:** invoke `scenarios` for every new original Command, including automation/translation Commands. Pass the known Chapter, slice, Command, output Event, prior Event, approved Spec lane and container ids, plus confirmed rules and fields. Use same-Chapter non-copy Commands/Events, resolving copies first. If an original belongs to another Chapter, report the limitation; never move it to manufacture scenario references.
4. Persist at least one successful Given/When/Then scenario per Command and a rejection scenario for **each documented precondition failure**. A rejection has `then: []` and an `error`, not a failure Event. A recorded business failure driving an alternative flow instead has a Then Event and `error: null`; the alternative Chapter may start with its linked copy (`eventmodeling-core-rules`, `connections`). Given may be empty when no prior Events are needed. Use synthetic field-based examples with matching ids and Command/Event values; follow `scenarios` scalar encoding. Do not add scenario containers to state-read slices.
5. Reuse existing containers and scenarios; add only missing behavior coverage, never duplicate scenarios on a rerun or overwrite user scenarios unasked. Missing permissions or genuinely undecided behavior must be asked about or reported as blocked, not silently skipped.

## Step 4 — Finish and verify

1. `GET /outline?context=<id>`: expected `STATE_CHANGE`/`STATE_READ`/`AUTOMATION`/`TRANSLATION`, correct lanes and recipe arrows. `null`: fix missing element/arrow, except an intentional copied-fact-only entry slice described in `connections`.
2. `GET /elements/:id` for arrow-affected fields; apply the core completeness rule and report gaps. For copies, read the original and verify `copyOf` resolves to the intended definition. Adjust originals only via `element-fields` PATCH (whole-list replacement, no propagation). Confirm repeated views did not become independent originals.
3. Read back each in-scope original Screen and verify nonempty persisted `html`, with shown/entered data matching its fields. Confirm linked Screen copies resolve to those originals. A placeholder is not a completed screen. Preserve explicitly accepted existing URL-only Screens; report any unresolved URL replacement permission as blocked.
4. Read back each Scenarios container. Verify every in-scope Command has a successful scenario and coverage of each documented rejection, correct element references and example field names, and mutually exclusive Then Events/error. Do not treat a container's existence or scenario count alone as coverage.
5. Run `model-check` for the target Chapter(s), report findings and verify the HTML/GWT requirements above separately. Missing required HTML or scenarios means the requested modeling work is incomplete, unless explicitly excluded. Retry failed writes or report partial completion and the exact blocker; never report placeholders or planned scenarios as created.
6. Report slice (id/name/type/Chapter), elements (id/type/name/lane), automatic/explicit arrows, inherited fields, generated/reused HTML originals and copies, scenario names/coverage, explicit exclusions, gaps (no field source, unfed Read Model, uncertain arrow), and automatic board updates (pull behavior: API reference).
7. Error names op: read `error`, fix cause, retry **whole failed batch**; that failed batch wrote nothing. A failed follow-up HTML/scenario batch does not roll back earlier successful structure writes.
