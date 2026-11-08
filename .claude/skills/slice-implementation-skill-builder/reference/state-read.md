# State Read slice — Event(s) → Query → Screen

- **Slice type:** `STATE_READ`. **Find by:** `QUERY`.
- **Description seed:** Implement one STATE_READ slice (Event(s) → Query → Screen): the read model (projection of the Events), the query and the view, from the slice's fields. Use for "implement the slice X", "build the order list view", "code this read model". Not for Commands, Processors or translations.

## Step 3 — Read the slice

| Where | What it gives |
|---|---|
| `QUERY` element | the read model's name (noun phrase) and its result shape: `fields` (a `list` `object` field = the rows) |
| `EVENT` elements with an arrow to the Query (also copies) | what the projection listens to; each Event's `fields` are what it can copy into the read model |
| `SCREEN` element (arrow Query → Screen) | the view: the Query's fields plus what is entered or calculated on top; mockup `html`/`url` |

A copied Event in this slice's Chapter stands for an Event of another Chapter: the projection handles the original Event. Events that feed the Query change the read model; others are ignored.

## Step 4 — Implement (neutral part)

1. **Projection**: for every feeding Event, how the read model changes (insert, update, remove a row). Where the fields alone do not say it (which Event removes a row, how a key is matched): ask, do not guess.
2. **Query**: returns the read model in the shape of the Query's fields.
3. **View**: shows the Screen's fields from the Query (only if asked; mockup from `html`).
4. **Tests**: feed example Events, check the Query result.

## Gaps to report

Query fields no Event supplies, Events with unclear effect.
