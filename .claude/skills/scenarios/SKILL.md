---
name: scenarios
description: Create, change, copy, reorder or delete Given/When/Then scenarios on a Scenarios element through the server API — choosing the Events and Command of the Chapter, filling the example data from their fields, and checking the board's rules. Use for "add a scenario", "write the GWT for this command", "elaborate the scenarios of this slice", "add an error scenario", "fix the example data".
---

# Given/When/Then Scenarios

Read `eventmodeling-core-rules` first (what Events and Commands are, naming). Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Do not guess the rules below. To look things up in the model, use the `model-navigation` skill (cheap reads). Example data come from the fields of the chosen elements: see the `element-fields` skill for the fields.

## Rules to know

| | Rule |
|---|---|
| Scenario | `{ id, name, description, given, when, then, error }`. Id is created by the server. |
| Given | List of entries: Events that have happened. Any number, the same Event may repeat (each with its own example). |
| When | At most one entry (a Command), or `null`. |
| Then | List of entries: the resulting Events. |
| Error | Text, or `null`. **Not both** `then` entries and `error`: `error` must be `null` when `then` is not empty. A rejected command has `then: []` and an `error`. |
| Entry | `{ element, example? }`. `element` is the **id** of an `EVENT` (given, then) or `COMMAND` (when) that is **in the same Chapter** as the Scenarios element and **not a linked copy**. |
| Example | Object keyed by field name. Values: **text** (`"42"`, not `42`: JSON numbers are rejected), `true`/`false`, lists, or nested objects. Default `{}`. |
| Name | Not empty (the board refuses an empty or blank name). Description is free text, may be `""`. |
| Container | A `SCENARIOS` element in a **Spec** lane. At most one element per Cell, so one Scenarios element per slice and Spec lane. It cannot be connected and has no `name`, `info` or `fields`. |
| Deleting | Deleting an Event or Command, or moving it to another Chapter, deletes every scenario that uses it. |

## Step 1 — Find the context

1. `GET /api/model/rules` once (lane types, element types).
2. Locate the Command (or the slice) the scenarios are for: `GET /api/model/search?q=<name>&type=COMMAND`; keep results whose `name` equals it. Several: ask the user which (name the Chapters), never guess.
3. `GET /api/model/outline` gives, for the Chapter, `lanes`, `slices` and every element `{ id, type, name, lane, copyOf?, connectsTo }`. Use it to find:
   - the **Command**, the **Events** it produces (`connectsTo` of the Command) and the Events before it in the flow (earlier slices of the Chapter) that its decision depends on;
   - the Chapter's `SCENARIOS` elements (one per slice at most).
4. `GET /api/model/elements/:id` for the Command and each Event used: their `fields` drive the example data (Step 3).
5. A linked copy cannot be chosen: use its original. If the original is in **another Chapter** it cannot be chosen at all; say so in the report, do not move it.

## Step 2 — Get a Scenarios element

Use the existing `SCENARIOS` element of the slice. If there is none:
1. The Chapter needs a lane of type `SPEC` (see `laneTypes` in `GET /rules`). None: ask the user, then add one as the `chapter-setup` skill says (`POST /chapters/:id/lanes` `{ "type": "SPEC", "after": "<lane id>" }`; lane types keep the order of `GET /rules`, so `after` is an Event or Integration lane (the last one)).
2. `POST /elements` `{ "slice": "<slice id>", "lane": "<spec lane id>", "type": "SCENARIOS" }`. If the Cell is occupied (by Notes or Scenarios), the server refuses: ask the user, do not remove their element.

## Step 3 — Design the scenarios (do not invent facts)

- **One behaviour per scenario**, named in business language for what is shown, e.g. "Place order with a valid payment", "Reject order when stock is empty". Put the reason in `description`.
- **Cover** at least: the happy path; every rejection the Command's preconditions have (an `error` scenario each); the repeated case when it matters. Only the preconditions the user or the model gives: do not invent business rules, ask.
- **Given** the Events that make the preconditions true, in time order. An empty `given` is allowed (nothing happened yet).
- **When** the Command of the slice. Exactly one, never an Event.
- **Then** the Events the Command records, each with its example; or **error** text, with `then: []`. Never both.
- You only choose existing elements: if a needed Event or Command is missing, say so, do not make it up.
- The board has no Query results in a scenario (only Events and Commands): a state-read slice has nothing to put in one.

### Example data

For each entry, read the element's `fields` and fill `example`:
- Key = field name exactly; only fields the element has (the board drops the others on Save). Nested `object` fields are nested objects; `list: true` fields are lists (of values, or of objects).
- `boolean`: `true`/`false`. **Every other type is text**: `"2026-11-05"`, `"19.99"`, `"3"`. UUIDs as text.
- **Consistency across the scenario:** a field of the Command's example reappears with the same value in the Events it produces; ids in `given` are the ones the `when` refers to; `generated` fields (ids, timestamps) get plausible fixed values.
- Leave out what is empty: empty text, `false` and empty lists are left out of the board's card anyway. Do not use real personal data for `pii` fields: use obviously fake values.
- An element **without fields** has free entries: `{ "name": "text" }`, names unique. Better: ask the user whether to define the fields first (element-fields skill).
- The server checks only the value types, **not** the field names: check them yourself against `fields`.

## Step 4 — Write

Use `POST /api/model/ops` for several scenarios (atomic, one revision); `as` / `"$<as>"` refers to a created item in later ops. Build the body with `ConvertTo-Json -Depth 20` or `JSON.stringify`.

**Create** `POST /elements/:scenariosId/scenarios`
```json
{
  "name": "Place order with a valid payment",
  "description": "Stock is available and the payment is authorised.",
  "given": [{ "element": "<event id>", "example": { "sku": "A-1", "quantity": "5" } }],
  "when": { "element": "<command id>", "example": { "sku": "A-1", "quantity": "2" } },
  "then": [{ "element": "<event id>", "example": { "sku": "A-1", "quantity": "2" } }],
  "error": null,
  "index": 0
}
```
`index` (optional): place in the list, default the end. Error scenario: `"then": []` and `"error": "Insufficient stock"`.

**Change** `PATCH /scenarios/:id` with any of `name`, `description`, `given`, `when`, `then`, `error`, `index` (move). A list sent **replaces** the whole list: `GET /api/model/elements/:scenariosId` first, send the full new `given`/`then`, keeping the entries and examples you do not change. `when: null` clears the Command. Switching between Then and error needs both in one body (`then: [...]` with `error: null`, or `then: []` with the error text).

**Copy** `POST /scenarios/:id/copy`: identical, new id, right after the original; then `PATCH` the copy (a quick way to build variants).
**Delete** `DELETE /scenarios/:id`. Ask the user first.

## Step 5 — Verify and report

1. `GET /elements/:scenariosId`: check the stored scenarios (entries, `error` is `null` when `then` is not empty).
2. Tell the user:
   - the Scenarios element (id, Chapter, slice) and each scenario created or changed (id, name, Given/When/Then in one line);
   - the example values you made up, so they can correct them;
   - gaps: preconditions you could not cover (missing Events/Commands, originals in another Chapter, elements without fields);
   - that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed);
   - any error: 400 (invalid body, not an Event/Command of this Chapter, a linked copy, a JSON number in `example`, `error` with `then`), 404 unknown id, 409 the model does not allow it. Read `error`, fix the cause, retry.
