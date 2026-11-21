# State Change slice — Screen → Command → Event

- **Slice type:** `STATE_CHANGE`. **Find by:** `COMMAND`.
- **Description seed:** Implement one STATE_CHANGE slice (Screen → Command → Event): the command handler, its events and its input type, from the slice's fields and model behavior, using Given/When/Then scenarios when present. Use for "implement the slice X", "build the Place Order command", "code this state change". Not for read models, Processors or translations.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `COMMAND` element | the handler's name (imperative), input `fields` (`generated` fields are filled by the system, e.g. time or acting user, not by the caller), and `info` implementation constraints |
| `EVENT` elements (arrow Command → Event) | the facts the handler records; each Event's `fields` are its payload and its `info` gives implementation constraints |
| `SCREEN` element (arrow Screen → Command) | context only: its `fields` are what the caller supplies and its `info` gives relevant implementation constraints. No UI is built |
| `SCENARIOS` element in the Spec lane, if present | each scenario's `name`, `description`, `given` (Events), `when` (Command), `then` (Events), `error` (refusal) and example data; description supplies test requirements too |
| Events in `given` from other slices | the state the Command decides on; read each one's fields and `info` with `GET /elements/<id>` |

## Step 4 — Implement (neutral part)

1. **Command**: the input type from the Command's fields.
2. **Decision**: from the history (`given` Events) and the Command, return the Events of `then`, or refuse as the `error` scenarios say. Use scenarios when present to determine business decisions and refusals. If behavior is fully specified by the model structure and fields (for example, direct Command-to-Event field mapping), implement it without requiring a scenario. Do not invent business rules. Stop only when a specific required behavior cannot be determined from any model information; report that behavior, not merely the absence of scenarios.
3. **Events**: one type per Event with its fields, named as in the model.
4. **Tests**: add one test per scenario when scenarios are present, applying the common scenario-test rule to description, GWT and example data. If there are no scenarios, test behavior directly specified by the model with synthetic, type-correct fixture values; do not make fixtures imply unstated business rules.

## Gaps to report

Fields with no source, or a specific required behavior that remains unspecified. Do not report the absence of scenarios alone as a blocker.
