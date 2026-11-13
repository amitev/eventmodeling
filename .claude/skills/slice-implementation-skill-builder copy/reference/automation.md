# Automation and Translation slice — Event → todo-list Read Model → Processor → Command → Event

- **Slice type:** `AUTOMATION` or `TRANSLATION`. **Find by:** `PROCESSOR`.
- **Description seed:** Build or implement an AUTOMATION or TRANSLATION slice from the event model. For automation, implement its event-driven processing and resulting Events; for translation, map the external Event into the internal Event. Use for requests such as "Build slice X" or "Build the slice in Chapter Y"; identify the requested slice and its type from the model. Not for STATE_CHANGE or STATE_READ slices.

Both share one shape: a todo list (Read Model) feeds a Processor, which issues a Command, which records Events. A **Translation** also has an element in an **Integration** lane (the external Event or Read Model).

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `READ_MODEL` element | the **todo query**: items still to do; `isList: true` hints list results, `fields` describe one todo item, `info` gives implementation constraints; copies use original content |
| `EVENT` elements with an arrow to the Read Model | the Events that **open** a todo item (their fields fill it); each Event's `info` gives implementation constraints |
| `PROCESSOR` element | the automation's name: it takes todo items and issues the Command. No fields of its own: it passes the Read Model's fields on; its `info` gives implementation constraints |
| `COMMAND` element (arrow Processor → Command) | the action: `fields` (`generated` ones are filled by the system) and `info` implementation constraints |
| `EVENT` elements after the Command | the facts recorded; these Events **close** the item they belong to (automation); each Event's `info` gives implementation constraints |
| `SCENARIOS` element in the Spec lane | Command scenarios: `name`, `description`, `given`, `when`, `then`, `error` and example data; description supplies test requirements too |
| Translation only: the Integration-lane element | the external Event/Read Model: its fields are the source data; the lane's `info` (the system, how it reaches us: format, delivery, ordering, retention, authentication) and the element's `info` bind the code; if required information is missing, stop and report it |

## Step 4 — Implement (neutral part)

1. **Todo query**: a projection of the opening Events (and, for an automation, the closing ones). Read `isList` (omitted = `false`); if it conflicts with the todo-list query, stop and report, never change the model. Each item's fields match the Read Model's fields; no outer list field for multiple items. Unclear closing, ordering or retry rule: stop and report.
2. **Processor**: for each open item, issues the Command with the item's fields. A repeat or crash must not duplicate the action.
3. **Command handler**: decides and records the Events as the Scenarios say (as `state-change.md`, Step 4).
4. **Translation only**: the external Event is **first stored as an internal Event** (the Command's Event, in this domain's language); only that Event feeds read models. Never feed another Read Model from the external Event. The todo list is never closed (as modelled); if required translation information is unclear, stop and report it.
5. **Tests**: scenarios for the Command using the common scenario-test rule; one for the todo list (Events in, items out); one Processor run (item in, Command issued). Apply relevant scenario-description requirements to these checks too.

## Gaps to report

Unclear closing rule, fields with no source, missing `info` (external system, schedule): stop and report the missing information; do not ask.
