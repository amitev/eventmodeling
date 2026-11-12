---
name: translating-external-events
description: Analyze external webhooks, queues, APIs, polling or device events and model their translation into domain facts. Use when payload mapping, correlation, enrichment, duplicate handling or ordering needs discovery. Builds translation slices and scenarios through the API. Already-specified translation slice uses slice-modeler; downstream business behavior is a separate task.
---

# Translating External Events

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`; use the user's configured server when different. No cloud board ids, tokens or connection skill.

Read `eventmodeling-core-rules` first. Use `model-navigation` for lookups, `slice-modeler` for the translation recipe, `element-fields` for schemas and `scenarios` for GWT. This skill discovers the integration rules and models them; it does **not** implement or run integrations.

## 1. Locate and interview

Read `/rules` and `/outline`; inspect relevant elements, lane `info` and slice Notes, not the whole model. Reuse known facts; ask only for missing decisions. Confirm Chapter, insertion point, lanes and source types in scope before writing. Several matches: ask.

For each source, gather:

| Topic | Needed decisions |
|---|---|
| Source | System name, event types, delivery (webhook/queue/polling/file/device), format/version, endpoint or payload documentation, sanitized sample per type |
| Delivery | Authentication/verification method, retries, ordering guarantees, retention, limits; for polling, schedule, cursor and overlap policy |
| Meaning | Business fact represented; direct mapping, aggregation or multi-source enrichment; internal Command/Event names |
| Correlation | Internal entity id supplied/echoed as metadata, or external-to-internal reference; where/when reference is recorded and how late/missing references resolve |
| Reliability | Stable delivery/business identity, deduplication scope, concurrent delivery policy, ordering key/version, stale/late events and replay behavior |
| Missing data | Required context, authoritative source, arrival before context exists, retry/defer/reject/manual-review policy and owner |
| Data handling | Units, enum meanings, source/receipt times and timezone, validation, personal data and retention constraints |

Never request credentials or real personal payloads. Record authentication method, not secrets. Do not invent provider guarantees, business rules, schedules, default values or manual-review flows. Unknowns: ask; preserve unanswered questions as comments on relevant elements, never as decided failures.

## 2. Define the translation contract

Work one concrete flow with sanitized examples, then cover each requested source event type. Present:

| Source field/context | Domain field | Rule | Missing/invalid handling |
|---|---|---|---|
| Exact payload path or prior fact | Confirmed name/type | Copy, convert, correlate, enrich, derive or ignore; include units/enum/time rules | Explicit agreed policy |

- Account for every required domain field and relevant source field; ignored data needs no domain field. Distinguish captured facts from computed Read Model values.
- Correlation: when initiating an external action, record the returned external reference against internal identity, or send internal identity as echoed metadata. For unsolicited events, agree another authoritative bridge. Do not assume one exists.
- Enrichment: identify prior Events/Read Models supplying context; if another external system is needed, model that dependency explicitly, never invent a lookup.
- Keep provider names/schema in Integration lanes. Domain fields use business language and internal entity identity. Necessary correlation/delivery metadata may remain when agreed; mark implementation-only fields `technical`, personal data `pii`. External ids never replace internal primary identity.
- Define idempotency before success: key + scope, durable processed evidence and an atomic uniqueness/recording policy. A check followed by an unguarded write is insufficient under concurrent retries. Evidence may be technical metadata or a separate receipt record; do not require provider ids on every domain Event.
- Specify duplicate, out-of-order, stale, conflicting and partial deliveries separately. Distinguish a repeated delivery from a later valid fact about the same entity.
- Validate authenticity and payload shape before trusting data. Define timestamp precedence/timezone and missing-field behavior; never silently default, guess identity or infer a business fact without an agreed rule.
- Aggregation: identify required facts, completion condition and timeout policy. Do not force a many-event decision into an invented one-to-one mapping.

Confirm unresolved contract decisions before creating affected behavior. Do not block unrelated, fully agreed source types.

## 3. Model the agreed flow

Use `slice-modeler`'s Translation recipe, not standalone internal Events:

```text
external Event -> translation todo Read Model -> Processor -> Command -> internal Event
```

1. Reuse/create one named Integration lane per system via `chapter-setup`; lane `info` holds known delivery details. External Event keeps source name/fields; its `info` identifies payload source and sanitized example.
2. Reuse existing source Event identity; cross-Chapter dependencies use a local linked copy via `connections`. Ensure the translation slice contains an Integration-lane element.
3. Build the translation slice atomically with `POST /ops`, following recipe layout/creation order. Each Processor has its own todo Read Model with `isList: true`; fields describe one item, query returns items. External Event feeds translation todo only.
4. Translation todo never closes; **omit the Automation recipe's closing arrow**. Internal Event is a new domain fact, not a linked copy. Only it may feed downstream worker todo lists/views.
5. Apply the contract via `element-fields`. Incoming arrows copy raw fields; PATCH final Read Model fields **before** wiring onward, then keep Command/Event schemas consistent. Retain agreed technical context only where needed.
6. API arrows copy fields; they do not execute mapping or correlation. Document transformations in `info`/Notes. Every non-generated field needs a same-named upstream source; never mark it `generated` just to hide a renamed/missing source. Explain genuine system-created values; report unresolved lineage gaps.
7. Store ordered translation steps and contract in slice `info` or Notes; summaries in Notes. Preserve existing content. One element per Spec Cell: use another Spec lane only with approval when Notes and Scenarios both need space.

Downstream commands/views/worker automations and correlation-establishment slices are separate capabilities: reuse existing ones; report missing dependencies and ask before creating them. Never silently expand scope or move/delete existing elements.

## 4. Capture examples and failures

Use `scenarios` for the translation Command: success and each agreed rejection. Given = prior same-Chapter non-copy Events, When = Command, Then = internal Events; rejection = `then: []` + `error`.

- Cover correlation present/missing/late, malformed or unsupported data, incomplete enrichment, duplicate/concurrent delivery and stale/out-of-order arrival where relevant.
- Separate pre-Command adapter behavior (authentication, parsing, defer/retry, polling cursors) from Command decisions. Record it in `info`/Notes; never invent board Events/Commands to make it fit GWT.
- Ignored duplicate/deferred delivery is not automatically a rejection. GWT cannot express a successful no-op (`then: []`, no error) as a complete outcome; document it in Notes, not a fabricated error/Event.
- Rejections record no Event. A decided business failure recorded as a fact is a separate successful outcome with its agreed Event.
- Same-Chapter non-copy constraint may prevent external/correlation Given entries; report limitation, never move originals or manufacture Events.
- Use exact field keys and sanitized fixed examples; `scenarios` defines value types. Decided failures stay scenarios; unanswered questions stay comments.

## 5. Verify and report

Read back affected slices/elements/scenarios through the API. Verify `TRANSLATION` type, named Integration lane, recipe arrows/layout, field lineage, no closing arrow and no external-to-worker shortcut. Use `model-check` after model changes; report gaps without inventing fixes.

Report:
- Created/reused slice and element names/ids, Chapter and source system.
- Source-to-domain mapping, correlation, deduplication/evidence, ordering, enrichment and failure policies.
- Scenarios, unresolved questions, missing dependencies and any behavior only documented rather than expressible in GWT.
- **Modeled, not implemented:** webhook verification, lookups, atomic deduplication, retries and runtime behavior still require code and tests.

Do not claim integration correctness from board validation. API failures: surface `error`, fix cause and retry failed atomic batch; never replace failure with a success-shaped fallback.
