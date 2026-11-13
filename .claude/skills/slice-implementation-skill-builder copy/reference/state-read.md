# State Read slice — Event(s) → Read Model → Screen

- **Slice type:** `STATE_READ`. **Find by:** `READ_MODEL`.
- **Description seed:** Build or implement a STATE_READ slice from the event model, including its Read Model projection/query and Screen. Use for requests such as "Build slice X" or "Build the slice in Chapter Y"; identify the requested slice and its type from the model. Not for STATE_CHANGE slices or AUTOMATION/TRANSLATION slices.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `READ_MODEL` element | name (noun phrase), one result item's `fields`, `isList` list-result/code-generation hint (omitted = `false`), and `info` implementation constraints; copies use original content |
| `EVENT` elements with an arrow to the Read Model (also copies) | what the projection listens to; each Event's `fields` are what it can copy into the read model, and its `info` gives implementation constraints |
| `SCREEN` element (arrow Read Model → Screen) | context only: who consumes the Read Model; its `info` gives relevant implementation constraints. No UI is built |

A copied Event in this slice's Chapter stands for an Event of another Chapter: the projection handles the original Event. Read the original Event's fields and `info`. Events that feed the Read Model change the read model; others are ignored.

## Step 4 — Implement (neutral part)

1. **Projection**: for every feeding Event, how the read model changes (insert, update, remove a row). If the fields do not say which Event removes a row or how a key is matched, stop and report the missing rule. Do not guess or ask.
2. **Query**: use `isList` and confirmed stack mapping for list/single results; each item's shape matches the Read Model's fields. No outer list field for multiple results. Conflicting documented cardinality: stop and report, never guess or change the model.
3. **Tests**: feed example Events, check result fields and cardinality.

## Gaps to report

Read Model fields no Event supplies, Events with unclear effect.
