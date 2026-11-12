# State Read slice — Event(s) → Read Model → Screen

- **Slice type:** `STATE_READ`. **Find by:** `READ_MODEL`.
- **Description seed:** Implement one STATE_READ slice (Event(s) → Read Model → Screen): the read model (projection of the Events) and the query, from the slice's fields. Use for "implement the slice X", "build the order list read model", "code this read model". Not for Commands, Processors or translations.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `READ_MODEL` element | the read model's name (noun phrase) and one result item's fields; query cardinality (one or many items) is separate from the field schema |
| `EVENT` elements with an arrow to the Read Model (also copies) | what the projection listens to; each Event's `fields` are what it can copy into the read model |
| `SCREEN` element (arrow Read Model → Screen) | context only: who consumes the Read Model. No UI is built |

A copied Event in this slice's Chapter stands for an Event of another Chapter: the projection handles the original Event. Events that feed the Read Model change the read model; others are ignored.

## Step 4 — Implement (neutral part)

1. **Projection**: for every feeding Event, how the read model changes (insert, update, remove a row). Where the fields alone do not say it (which Event removes a row, how a key is matched): ask, do not guess.
2. **Query**: returns one or many result items as specified; each item's shape matches the Read Model's fields. Do not use an outer list field to encode multiple results.
3. **Tests**: feed example Events, check result fields and cardinality.

## Gaps to report

Read Model fields no Event supplies, Events with unclear effect.
