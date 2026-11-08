# State Change slice — Screen → Command → Event

- **Slice type:** `STATE_CHANGE`. **Find by:** `COMMAND`.
- **Description seed:** Implement one STATE_CHANGE slice (Screen → Command → Event): the command handler, its events and the input, from the slice's fields and Given/When/Then scenarios. Use for "implement the slice X", "build the Place Order command", "code this state change". Not for read models, Processors or translations.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `COMMAND` element | the handler's name (imperative) and its input: `fields` (`generated` fields are filled by the system, e.g. time or acting user, not by the caller) |
| `EVENT` elements (arrow Command → Event) | the facts the handler records; each Event's `fields` are its payload |
| `SCREEN` element (arrow Screen → Command) | the input form: its `fields`, mockup `html`/`url`. Optional unless the user asks for the UI |
| `SCENARIOS` element in the Spec lane | the examples, by name: `given` (Events), `when` (the Command), `then` (Events), `error` (the refusal). Entries carry example data |
| Events in `given` from other slices | the state the Command decides on; read each one's fields with `GET /elements/<id>` |

## Step 4 — Implement (neutral part)

1. **Command**: the input type from the Command's fields.
2. **Decision**: from the history (`given` Events) and the Command, return the Events of `then`, or refuse as the `error` scenarios say. The scenarios are the only source of business rules; a rule with no scenario: ask, do not invent.
3. **Events**: one type per Event with its fields, named as in the model.
4. **Input** (only if asked): a Screen/endpoint that builds the Command from the Screen's fields.
5. **Tests**: one per scenario, Given/When/Then with the scenario's example data.

## Gaps to report

Fields with no source, rules with no scenario.
