# State Change slice — Screen → Command → Event

- **Slice type:** `STATE_CHANGE`. **Find by:** `COMMAND`.
- **Description seed:** Build or implement a STATE_CHANGE slice from the event model, including its Screen-driven Command, resulting Events, and behavior defined by its scenarios. Use for requests such as "Build slice X" or "Build the slice in Chapter Y"; identify the requested slice and its type from the model. Not for STATE_READ slices or AUTOMATION/TRANSLATION slices.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `COMMAND` element | the handler's name (imperative), input `fields` (`generated` fields are filled by the system, e.g. time or acting user, not by the caller), and `info` implementation constraints |
| `EVENT` elements (arrow Command → Event) | the facts the handler records; each Event's `fields` are its payload and its `info` gives implementation constraints |
| `SCREEN` element (arrow Screen → Command) | context only: its `fields` are what the caller supplies and its `info` gives relevant implementation constraints. No UI is built |
| `SCENARIOS` element in the Spec lane | each scenario's `name`, `description`, `given` (Events), `when` (Command), `then` (Events), `error` (refusal) and example data; description supplies test requirements too |
| Events in `given` from other slices | the state the Command decides on; read each one's fields and `info` with `GET /elements/<id>` |

## Step 4 — Implement (neutral part)

1. **Command**: the input type from the Command's fields.
2. **Decision**: from the history (`given` Events) and the Command, return the Events of `then`, or refuse as the `error` scenarios say. The scenarios are the only source of business rules; if a required rule has no scenario, stop and report the missing scenario. Do not invent rules or ask.
3. **Events**: one type per Event with its fields, named as in the model.
4. **Tests**: one per scenario, applying the common scenario-test rule to description, GWT and example data.

## Gaps to report

Fields with no source, rules with no scenario.
