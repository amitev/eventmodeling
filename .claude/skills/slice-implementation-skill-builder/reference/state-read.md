# State Read slice — Event(s) → Read Model → Screen

- **Slice type:** `STATE_READ`. **Find by:** `READ_MODEL`.
- **Description seed:** Implement one STATE_READ slice (Event(s) → Read Model → Screen): the read model (projection of the Events) and the query, from the slice's fields. Use for "implement the slice X", "build the order list read model", "code this read model". Not for Commands, Processors or translations.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `READ_MODEL` element | the read model's name (noun phrase), one result item's fields, and `info` implementation constraints; query cardinality (one or many items) is separate from the field schema |
| `EVENT` elements with an arrow to the Read Model (also copies) | what the projection listens to; each Event's `fields` are what it can copy into the read model, and its `info` gives implementation constraints |
| `SCREEN` element (arrow Read Model → Screen) | context only: who consumes the Read Model; its `info` gives relevant implementation constraints. No UI is built |

A copied Event in this slice's Chapter stands for an Event of another Chapter: the projection handles the original Event. Read the original Event's fields and `info`. Events that feed the Read Model change the read model; others are ignored.

## Step 4 — Implement (neutral part)

1. **Projection**: for every feeding Event, how the read model changes (insert, update, remove a row). If the fields do not say which Event removes a row or how a key is matched, stop and report the missing rule. Do not guess or ask.
2. **Query**: returns one or many result items as specified; each item's shape matches the Read Model's fields. Do not use an outer list field to encode multiple results.
3. **Tests**: feed example Events, check result fields and cardinality.

## Gaps to report

Read Model fields no Event supplies, Events with unclear effect.
