---
name: prototype
description: Build a clickable prototype of one context in the /prototype folder — Screens from the board's HTML, an in-browser event store, Commands decided by the Given/When/Then scenarios, Queries as projections of the Events, todo lists with an Automations tab, and an in-page scenario check. A bundled script exports the model; read-only on the board. Use for "build a prototype of X", "make the Registration context clickable", "update the prototype".
---

Clarification: Posting the questions means reporting.

---

## Step 1 — Gather inputs

1. **Context name** — the bounded context to focus on (e.g. `Registration`, `Orders`) — ask if not provided.

If the user already provided context name in their message, use it directly.

---

## Step 2 — Export the model

Do not read the model yourself. Run the bundled script from the repository root:

```
node .claude/skills/prototype/export-model.mjs --context <context id or name> [--base http://localhost:3300] [--out prototype/model.js]
```

It reads the model through the server API (all Chapters: arrows and linked copies cross Chapters) and writes `prototype/model.js`: `const MODEL = { context, screens, commands, events, queries, processors, scenarios }`. Linked copies are folded into their originals. It prints the counts; tell the user how many Screens have no mockup (their tab shows a placeholder).

| In `MODEL` | Holds |
|---|---|
| `screens[]` | `id, name, chapter, slice, html, url, fields, commandIds, queryIds` (the Commands it triggers, the Queries it shows) |
| `commands[]` | `id, name, fields, screenIds, processorIds, eventIds` |
| `events[]` | `id, name, fields` |
| `queries[]` | `id, name, fields, eventIds, openingEventIds, closingEventIds, processorIds, screenIds`: a Processor's todo list is **opened** by the Events that feed it and **closed** by the Events its Command produces |
| `processors[]` | `id, name, queryIds, commandIds` |
| `scenarios[]` | `id, name, description, chapter, given, when, then, error` (entries `{ element, example }`; `element` is an Event or Command id) |

A field is `{ name, type, list, id, optional, generated, pii, technical, fields? }`. In an `example`, an **absent** field means empty (empty text, `false`, empty list).

If the export is wrong or a Context is unknown the script says so: fix the cause, never edit `model.js` by hand (it is overwritten on every run).

---

## Step 3 — Write `prototype/index.html`

Write the page by hand, once; on a later run rewrite it only when the engine or the layout must change (a model change needs only Step 2). Plain HTML, CSS and JavaScript: no build step, no framework, no server logic, no network. Load `model.js` first (`<script src="model.js">`), then the page script. The page must work opened from the file system.

Layout: a header with one **tab per Screen name**, then **Automations** (only when `MODEL.processors` is not empty), **Scenarios** and **Events**, and a **Reset** button that empties the event store. A message line (toast) shows the result of every action.

**Screen tabs.** The Screen HTML is a full document with global styles (`body`, `*`, `form`, ...). Render each Screen in an `<iframe srcdoc>` so its styles and the page's do not leak into each other.
- Wire it from the parent page: attach listeners and re-render via `frame.contentDocument` after the frame's `load`. Set the `load` handler **for every Screen**, and clear it (`frame.onload = null`) for a Screen shown by `url` or as a placeholder: a handler left over from the previous Screen would run on it, and a page from another origin has no readable `contentDocument`.
- Do NOT set the `sandbox` attribute on the iframe. Without `allow-scripts` the browser blocks the parent's listeners ("Blocked script execution in 'about:srcdoc'"). `allow-scripts` + `allow-same-origin` cancels the sandbox anyway, and the content is the user's own board HTML.
- A Screen with a `url` instead of `html` is shown in an iframe of that address; one with neither shows a placeholder naming it.
- Several Screens with one name (different Chapters): one tab each, labelled with the Chapter.

---

## Step 4 — The engine (rules the page implements)

Let `norm(s)` = lower case without anything but letters and digits.

**Event store.** An array in `localStorage` (key `prototype-<MODEL.context.id>`), append-only, starting **empty**; **Reset** empties it. An entry is `{ id: Event id, type: Event name, data, at }`. Everything shown is derived from it.

**Command values.** Fields of the Screen's inputs: a text input gives its text, a checkbox a boolean, a field with `list: true` is not supported (warn). Empty means `''` / `false`.

**Executing a Command** `execute(command, values, store)`:
1. Candidates: scenarios whose `when.element` is the Command.
2. A scenario **applies** when:
   - **Given:** every `given` entry has a matching Event in the store. An Event matches an entry when its id equals the entry's `element` and, for every field the Command and the Event share, the Command's value is empty or equals the Event's value. Entries of the same Event each need their own stored Event.
   - **When:** for every Command field that is not `generated`, the scenario's `when.example` value (absent = empty) agrees with the actual value: booleans must be equal; for everything else both must be empty or both non-empty (the typed text itself is not compared).
3. Take the **first applying scenario in list order**.
4. If it has an `error`: **refuse**, showing the error text; nothing is stored.
5. Otherwise append one store entry per `then` entry, in order. The `data` of each field of that Event is, in this order: the Command's value of the same name (if not empty); the same-named value of the matching Given Event; a generated value if the field is `generated` (`uuid`: a new UUID, `date`/`datetime`: now); the scenario's example value; empty.
6. If **no scenario applies**: refuse with "No scenario covers this case" and name the Given Events that are missing or the field that disagrees. This is a gap in the model: do not invent behaviour.

**Queries** (`project(query, store)`): fold the store entries whose Event id is in `query.eventIds`, in order. An Event only counts for a Query when it has an arrow to it: a completion Event without that arrow never closes an item (the export warns).
- The row key is the Query's fields with `id: true` that the Event also has. No key field: rows are only appended (warn in the report: mark an `id` field).
- A Query with one `list: true` `object` field gives a **list of rows** (the fields of that object); without one it gives a **single record**.
- An Event in `closingEventIds` **removes** the row with the same key; any other Event **adds** the row or **updates** the row with the same key (its same-named fields replace the row's).
- Events that should remove rows of a plain Query (a deletion, a cancellation): the model does not say which. Ask the user; names like Deleted, Removed, Cancelled, Closed are a hint, never a decision. Keep the answer as `const REMOVING = [Event ids]` at the top of the page script and treat those Events like `closingEventIds`.

**Showing data on a Screen.** For every Query in the Screen's `queryIds`: an element of the Screen whose `id` or class `norm`s to a Query field name shows that field (`textContent`, or `value` for an input). For a list, find the repeated element (the first of a group of siblings of the same tag and class that contains such elements), use it as the template, clone it once per row, fill each clone, and remove the template; with no rows keep one "No items" line.

**Acting on a Screen.**
- An input (`input`, `select`, `textarea`) belongs to the Command field whose `norm`ed name equals the `norm`ed `id` of the input or the `norm`ed text of its label: `label[for]` or a wrapping label, and, when it has neither, the nearest preceding element in the same container (its `previousElementSibling`, or, when it has none, its parent's `previousElementSibling`), e.g. a label-like div, span or heading. Inputs that match nothing are listed in a warning under the tab and in the report, and so are Command fields no input matches, except `generated` fields and fields a shown row supplies (the same-named fields of the Screen's Queries' rows).
- A Screen with **one** Command: every button of the Screen runs it. A button inside a repeated row also gets that row's values for the Command's fields of the same name. A Screen with **several** Commands: ask the user which button runs which; do not guess. A Screen with none: its buttons only show "No command on this Screen".
- After every action: show the result in the toast (the Events recorded, or the refusal text), then re-render all tabs.

**Automations tab.** For each Processor: its name, then the rows of its todo-list Query (`queryIds[0]`, projected as above) and a **Run** button per row that executes the Processor's Command (`commandIds[0]`) with the row's values for same-named fields. The completion Event closes the row by itself (`closingEventIds`). Several Queries or Commands on one Processor: ask the user. A Processor with no Query or no Command is listed with a warning.

**Scenarios tab.** Run every scenario on a **fresh in-memory store**, never the user's store. Preload the store with the scenario's `given` entries (Event name from `MODEL`, `data` = the example), run `execute` with the Command's values taken from `when.example` (absent = empty, `false` for booleans), and compare:
- a scenario with an `error` **passes** when the engine refuses with that error text;
- one with `then` entries **passes** when the recorded Events are the same Events, in the same order;
- otherwise **fail**, with the reason: the other scenario that applied ("applies instead: X"), the refusal text, or the Events recorded instead.

Show one row per scenario (grouped by Chapter) with pass/fail and the reason, and a total. A scenario with no `when` is listed as not runnable. List as a warning on the scenario every key of an `example` that is not a field of its element (Given, When and Then): the engine ignores such a key, so the scenario could pass without checking it.

**Events tab.** A table of the store: time, Event name, data as JSON. Newest last.

---

## Step 5 — Report

Tell the user:
- the files written (`prototype/model.js`, and `prototype/index.html` when you wrote it) and how to open the page: `prototype/index.html` in a browser, with `model.js` next to it;
- the counts from the export, Screens without a mockup, and every warning the page shows (inputs or Command fields not tied to anything, Screens with several Commands that need a button mapping, Queries without an `id` field, Commands with no scenario, which are always refused, Events you asked about for removal);
- what you asked and what they decided (`REMOVING`, button mappings);
- that the page is generated from the model: after a model change run Step 2 again, and the open page needs a reload.

Do not test the page yourself: ask whether the user wants you to open it and try the flows.
