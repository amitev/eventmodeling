# Automation and Translation slice — Event → todo-list Read Model → Processor → Command → Event

- **Slice type:** `AUTOMATION` or `TRANSLATION`. **Find by:** `PROCESSOR`.
- **Description seed:** Implement one AUTOMATION or TRANSLATION slice (Event → todo-list Read Model → Processor → Command → Event): the todo list, the Processor and the Command it issues; for a translation also the mapping of an external Event into an internal one. Use for "implement the automation X", "code the processor", "implement this translation slice". Not for Screen-driven Commands or read models.

Both share one shape: a todo list (Read Model) feeds a Processor, which issues a Command, which records Events. A **Translation** also has an element in an **Integration** lane (the external Event or Read Model).

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `READ_MODEL` element | the **todo query**: items still to do; its `fields` describe one todo item, while the query returns the open items; its `info` gives implementation constraints |
| `EVENT` elements with an arrow to the Read Model | the Events that **open** a todo item (their fields fill it); each Event's `info` gives implementation constraints |
| `PROCESSOR` element | the automation's name: it takes todo items and issues the Command. No fields of its own: it passes the Read Model's fields on; its `info` gives implementation constraints |
| `COMMAND` element (arrow Processor → Command) | the action: `fields` (`generated` ones are filled by the system) and `info` implementation constraints |
| `EVENT` elements after the Command | the facts recorded; these Events **close** the item they belong to (automation); each Event's `info` gives implementation constraints |
| `SCENARIOS` element in the Spec lane | examples for the Command (`given`, `when`, `then`, `error`) |
| Translation only: the Integration-lane element | the external Event/Read Model: its fields are the source data; the lane's `info` (the system, how it reaches us: format, delivery, ordering, retention, authentication) and the element's `info` bind the code; if required information is missing, stop and report it |

## Step 4 — Implement (neutral part)

1. **Todo query**: a projection of the opening Events (and, for an automation, the closing ones). Each item's fields match the Read Model's fields; do not encode multiple items with an outer list field. If a rule is unclear (what closes an item, ordering, retries), stop and report the missing rule.
2. **Processor**: for each open item, issues the Command with the item's fields. A repeat or crash must not duplicate the action.
3. **Command handler**: decides and records the Events as the Scenarios say (as `state-change.md`, Step 4).
4. **Translation only**: the external Event is **first stored as an internal Event** (the Command's Event, in this domain's language); only that Event feeds read models. Never feed another Read Model from the external Event. The todo list is never closed (as modelled); if required translation information is unclear, stop and report it.
5. **Tests**: scenarios for the Command; one for the todo list (Events in, items out); one Processor run (item in, Command issued).

## Gaps to report

Unclear closing rule, fields with no source, missing `info` (external system, schedule): stop and report the missing information; do not ask.
