# State Change slice — Screen → Command → Event

- **Slice type:** `STATE_CHANGE`. **Find by:** `COMMAND`.
- **Description seed:** Implement one STATE_CHANGE slice (Screen → Command → Event): the command handler, its events and its input type, from the slice's fields and Given/When/Then scenarios. Use for "implement the slice X", "build the Place Order command", "code this state change". Not for read models, Processors or translations.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `COMMAND` element | the handler's name (imperative), input `fields` (`generated` fields are filled by the system, e.g. time or acting user, not by the caller), and `info` implementation constraints |
| `EVENT` elements (arrow Command → Event) | the facts the handler records; each Event's `fields` are its payload and its `info` gives implementation constraints |
| `SCREEN` element (arrow Screen → Command) | context only: its `fields` are what the caller supplies and its `info` gives relevant implementation constraints. No UI is built |
| `SCENARIOS` element in the Spec lane | the examples, by name: `given` (Events), `when` (the Command), `then` (Events), `error` (the refusal). Entries carry example data |
| Events in `given` from other slices | the state the Command decides on; read each one's fields and `info` with `GET /elements/<id>` |

## Step 4 — Implement (neutral part)

1. **Command**: the input type from the Command's fields.
2. **Decision**: from the history (`given` Events) and the Command, return the Events of `then`, or refuse as the `error` scenarios say. The scenarios are the only source of business rules; if a required rule has no scenario, stop and report the missing scenario. Do not invent rules or ask.
3. **Events**: one type per Event with its fields, named as in the model.
4. **Tests**: one per scenario, Given/When/Then with the scenario's example data.

## Gaps to report

Fields with no source, rules with no scenario.
