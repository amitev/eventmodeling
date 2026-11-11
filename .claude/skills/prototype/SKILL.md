---
name: prototype
description: Build a clickable one-Context prototype in /prototype — board HTML Screens, browser event store, GWT-driven Commands, projected Read Models, Automations/todo lists and scenario checks. Script exports model; board read-only. Use for "build a prototype of X", "make the Registration context clickable", "update the prototype".
---

**Model access:** API only ([../api.md](../api.md)); board read-only for this skill. Never read, create, edit or delete files in `.event-modeling/`.

Clarification: Posting the questions means reporting.

## Step 1 — Gather inputs

Use requested **Context name** (e.g. `Registration`, `Orders`); ask only if absent.

## Step 2 — Export the model

**Do not read model yourself.** Run bundled script from repository root:

```
node .claude/skills/prototype/export-model.mjs --context <context id or name> [--base http://localhost:3300] [--out prototype/model.js]
```

Reads all Chapters via API to resolve cross-Chapter copies/older arrows; folds copies into originals. Writes `prototype/model.js`: `const MODEL = { context, screens, commands, events, readModels, processors, scenarios }`. Reports counts; tell user missing-mockup Screen count (tabs show placeholders).

| In `MODEL` | Holds |
|---|---|
| `screens[]` | `id, name, chapter, slice, html, url, fields, commandIds, readModelIds` (triggered Commands, displayed Read Models) |
| `commands[]` | `id, name, fields, screenIds, processorIds, eventIds` |
| `events[]` | `id, name, fields` |
| `readModels[]` | `id, name, fields, eventIds, openingEventIds, closingEventIds, processorIds, screenIds`; todo list opens on feeding Events, closes on Processor's Command output Events |
| `processors[]` | `id, name, readModelIds, commandIds` |
| `scenarios[]` | `id, name, description, chapter, given, when, then, error`; entries `{ element, example }`, Event/Command id |

Field: `{ name, type, list, id, optional, generated, pii, technical, fields? }`. Absent example field = empty text/`false`/empty list.

Wrong export/unknown Context: fix reported cause; **never hand-edit `model.js`**, overwritten each run.

## Step 3 — Write `prototype/index.html`

Hand-write page once; rewrite only for engine/layout changes. Model-only changes need Step 2. Plain HTML/CSS/JavaScript, **no build/framework/server logic/network**; works from file system. Load `<script src="model.js">` before page script.

Header: Screen tabs, **Automations** only if `MODEL.processors` nonempty, **Scenarios**, **Events**, **Reset** (empties store). Toast shows every action's result.

**Screen tabs:** one per Screen name; duplicate names across Chapters still get separate tabs labelled by Chapter.
- HTML is full document with global styles: isolate in `<iframe srcdoc>`.
- Parent attaches listeners/renders via `frame.contentDocument` after `load`. **Set handler for every HTML Screen; clear `frame.onload = null` for URL/placeholders** to prevent stale handlers and cross-origin access.
- **No iframe `sandbox`:** without `allow-scripts`, browser blocks parent's listeners; adding `allow-scripts` + `allow-same-origin` cancels sandbox. Content is user's board HTML.
- URL-only: iframe at URL. Neither HTML nor URL: named placeholder.

## Step 4 — The engine (rules the page implements)

`norm(s)` = lowercase, retaining only letters/digits.

**Event store:** append-only `localStorage` array, key `prototype-<MODEL.context.id>`, initially **empty**; Reset clears it. Entry `{ id: Event id, type: Event name, data, at }`. All displayed data derives from store.

**Command values:** Screen text inputs → text, checkboxes → booleans. `list: true` unsupported: warn. Empty = `''` / `false`.

**Executing a Command** `execute(command, values, store)`:
1. Candidates: scenarios with `when.element` = Command id.
2. Applies only if both match:
   - **Given:** every entry matches stored Event id = `element`; for each shared Command/Event field, Command value is empty or equals Event value. Repeated entries for same Event need **distinct stored Events**.
   - **When:** compare actual values against `when.example` (absent = empty) for **nongenerated** Command fields. Booleans equal; others both empty or both nonempty. **Do not compare typed text itself.**
3. Use **first matching scenario in list order**.
4. `error`: refuse with exact text; store nothing.
5. Otherwise append one Event per `then`, in order. Each data field's precedence: **nonempty same-name Command value → matching Given Event's same-name value → generated value if marked (`uuid`: new UUID; `date`/`datetime`: now) → Then example → empty**.
6. No match: refuse **"No scenario covers this case"**, naming missing Given Events or mismatched field. Model gap; never invent behavior.

**Read Models** `project(readModel, store)`: fold entries with id in `readModel.eventIds`, in store order. **Only Events with feeding arrows count**; completion without arrow never closes item (export warns).
- Key: Read Model `id: true` fields also present on Event. No key: append-only rows; warn to mark id field.
- One `list: true` `object` field → row list using nested fields; otherwise single record.
- `closingEventIds`: remove same-key row. Others: add/upsert same-key row, replacing same-named fields.
- Plain Read Model removal Events: **ask**, never infer from Deleted/Removed/Cancelled/Closed names. Record answer as `const REMOVING = [Event ids]` atop page script; treat like `closingEventIds`.

**Screen data:** for each `readModelIds` entry, match normalized element id/class to normalized field name. Set `textContent` (`value` for inputs). List template = first repeated sibling with same tag/class containing matching elements; clone/fill once per row, remove template. Empty list: one **"No items"** line.

**Acting on a Screen.**
- `input`/`select`/`textarea` → Command field by normalized field name matching input id or label text. Label: `label[for]` or wrapping label; neither: nearest preceding element in same container (`previousElementSibling`, else parent's `previousElementSibling`), e.g. div/span/heading.
- Warn under tab **and in report** for unmatched inputs and unmatched Command fields; exempt `generated` fields and same-named fields supplied by displayed Read Model rows.
- One Command: **every button** runs it; repeated-row buttons also supply row's same-named values. Several Commands: **ask button mapping**, never guess. None: buttons only show **"No command on this Screen"**.
- Every action: toast recorded Events/refusal, then re-render **all tabs**.

**Automations tab:** each Processor's name, projected `readModelIds[0]` todo rows, **Run** per row executing `commandIds[0]` with same-named row values. Completion Event closes via `closingEventIds`. Several Read Models/Commands: **ask**. Missing either: list Processor with warning.

**Scenarios tab:** run each on **fresh in-memory store, never user's store**. Preload Given entries (Event name from `MODEL`, data = example); execute Command using `when.example` (absent = empty/`false`).
- Error scenario passes only on refusal with that error text.
- Then scenario passes only on same Events in same order.
- Otherwise fail with reason: **"applies instead: X"**, refusal text or actual recorded Events.

Show row per scenario, Chapter-grouped, pass/fail/reason + total. No `when`: not runnable. Warn on **every unknown example key** in Given/When/Then; ignored keys can cause unchecked passes.

**Events tab:** store table, time/Event name/JSON data, newest last.

## Step 5 — Report

- Written files (`prototype/model.js`, `prototype/index.html` if changed); open HTML in browser with `model.js` beside it.
- Export counts, missing mockups, **all warnings**: unmatched inputs/fields, required button mappings, missing Read Model ids, Commands without scenarios (always refused), removal Events needing decisions.
- Questions/decisions (`REMOVING`, button mappings).
- After model changes: rerun Step 2, reload page.

**Do not test unasked:** ask whether user wants you to open page and try flows.
