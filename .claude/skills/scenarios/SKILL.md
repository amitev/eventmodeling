---
name: scenarios
description: Create, edit, copy, reorder or delete Given/When/Then scenarios via API, using Chapter Commands/Events and field-based examples. Use to write or elaborate scenarios, add error cases or fix examples.
---

# Given/When/Then Scenarios

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first (Events, Commands, naming); use `model-navigation` for lookups, `element-fields` for fields. Do not guess rules.

## Rules to know

| | Rule |
|---|---|
| Scenario | `{ id, name, description, given, when, then, error }`; server-created id |
| Given | List of prior Events; any count; same Event may repeat with separate examples |
| When | One Command entry or `null` |
| Then / error | Resulting Event list or rejection text. **Nonempty `then` requires `error: null`; rejection requires `then: []` + error** |
| Entry | `{ element, example? }`; `element` = same-Chapter **non-copy** `EVENT` id (given/then) or `COMMAND` id (when) |
| Example | Default `{}`; field-name keys; values: **text** (`"42"`, never JSON number `42`), booleans, lists, nested objects |
| Name / description | Name nonempty/nonblank; description free text, may be `""` |
| Container | `SCENARIOS` in Spec lane; at most one element per slice/lane Cell. No arrows, `name`, `info` or `fields` |
| Delete / move | Deleting Event/Command or moving it across Chapters deletes scenarios using it |

## Step 1 — Find the context

1. `GET /rules` once: lane/element types.
2. Locate Command/slice: `GET /search?q=<name>&type=COMMAND`; retain exact-name matches. Several: ask which, naming Chapters; never guess.
3. `GET /outline`: Chapter lanes/slices/elements (`id`, `type`, `name`, `lane`, `copyOf?`, `connectsTo`). Find Command, its output Events (`connectsTo`), prior Events its decision needs, existing Scenarios containers.
4. `GET /elements/:id` for Command and each Event; use `fields` for examples.
5. Resolve copies to original. Original in another Chapter: cannot use; report, **never move it**.

## Step 2 — Get a Scenarios element

Reuse slice's existing `SCENARIOS`. Otherwise:
1. No `SPEC` lane: **ask**, then add via `chapter-setup`: `POST /chapters/:id/lanes` `{ type: "SPEC", after: "<last Event/Integration lane id>" }`; preserve `/rules` lane order.
2. `POST /elements` `{ slice, lane: "<Spec lane id>", type: "SCENARIOS" }`. Occupied Cell (Notes/Scenarios): ask, never remove user's element.

## Step 3 — Design the scenarios (do not invent facts)

- **One behavior**, business-sentence name: "Place order with a valid payment", "Reject order when stock is empty"; reason in `description`.
- Cover happy path, **each** documented precondition rejection (`error` scenario), repeats when relevant. Only user/model rules; ask rather than invent.
- **Given:** precondition Events in time order; empty allowed.
- **When:** exactly one Command of slice, never Event.
- **Then:** recorded Events with examples, or error + `then: []`; never both.
- A recorded business failure driving an alternative flow (e.g. `Payment Capture Failed`) is a Then Event with `error: null`, not a precondition rejection (`eventmodeling-core-rules`).
- Use existing elements only; report missing Commands/Events.
- No Read Model outcomes supported; state-read slice has no scenario content.

### Example data

Read each element's `fields`:
- Exact field-name keys only; board drops unknown keys on Save. `object` → nested object; `list: true` → list of values/objects.
- Booleans: `true`/`false`; **all other scalar types text**, including numbers, dates and UUIDs (`"3"`, `"19.99"`, `"2026-11-05"`).
- Keep shared Command/output Event values identical; Given ids must match When references; generated ids/timestamps get plausible fixed values.
- Omit empty text, `false`, empty lists (card hides them). `pii`: **obviously fake**, never real personal data.
- No fields: free entries `{ "name": "text" }`, unique names; preferably ask to define fields first (`element-fields`).
- Server checks value types, **not names**; check names yourself.

## Step 4 — Write

Several scenarios: one atomic `POST /ops`, one revision; `as` / `"$<as>"` for created ids. Build JSON with `ConvertTo-Json -Depth 20` or `JSON.stringify`.

**Create** `POST /elements/:scenariosId/scenarios`
```json
{
  "name": "Place order with a valid payment",
  "description": "Stock and payment are valid.",
  "given": [{ "element": "<event id>", "example": { "sku": "A-1", "quantity": "5" } }],
  "when": { "element": "<command id>", "example": { "sku": "A-1", "quantity": "2" } },
  "then": [{ "element": "<event id>", "example": { "sku": "A-1", "quantity": "2" } }],
  "error": null,
  "index": 0
}
```
Optional `index`: list position, default end. Rejection: `"then": []`, `"error": "Insufficient stock"`.

**Change:** `PATCH /scenarios/:id` `{ name?, description?, given?, when?, then?, error?, index? }`; `index` reorders. **Lists replace whole lists:** read container first, keep unchanged entries/examples in full `given`/`then`. `when: null` clears Command. Switch outcome atomically: `{ then: [...], error: null }` or `{ then: [], error: "<text>" }`.

**Copy:** `POST /scenarios/:id/copy`; identical, new id, immediately after original; PATCH copy for variants.
**Delete:** `DELETE /scenarios/:id`; **ask first**.

## Step 5 — Verify and report

1. `GET /elements/:scenariosId`: verify entries and `error: null` when `then` nonempty.
2. Report container (id, Chapter, slice), scenarios (id, name, one-line GWT), invented example values, uncovered preconditions (missing elements, cross-Chapter originals, no fields), automatic board updates (pull behavior: API reference).
3. Errors: 400 invalid body, wrong type/Chapter, copy, JSON number in example or error + Then; 404 unknown id; 409 forbidden model change. Read `error`, fix cause, retry.
