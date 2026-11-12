---
name: model-validation-checklist
description: Read-only semantic readiness review of a completed event model. Complements model-check with evidence-based checks of Event meaning, business rules, traceability, flow and structural shapes. Use before declaring a model ready, not while it is still being explored.
disable-model-invocation: true
---

# Model Validation Checklist

**Model access:** API only ([../api.md](../api.md)). Never read or edit files in `.event-modeling/`. Read `eventmodeling-core-rules` once per session. Use `model-navigation` for reads. This is a read-only review: do not change the board or post comments.

`model-check` provides the technical pass; this checklist judges business meaning and evidence the script cannot. Do not repeat its checks by hand or treat its candidates as automatic failures. For business questions during exploration, use `wdyt`.

## 1. Run the technical pass

From the repository root with the server running:

```sh
node .claude/skills/model-check/check.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] --dependencies
```

By default, this checks every Chapter. Read the relevant Chapter content and element details through the API when you need fields, scenarios, `info` or Notes. Do not assume arrows prove business sequence or correctness.

Treat `RULE` and `GAP` findings as failures unless the model itself gives evidence otherwise. Judge each `CANDIDATE` against `eventmodeling-core-rules` and the business context; count alone is not a failure.

## 2. Evaluate the checks

For each check, report **PASS**, **FAIL** or **WARNING** (evidence is missing or unclear). Cite the actual element names and Chapter/slice. Do not invent business rules to resolve uncertainty.

### Phase 1 — Event and Command ownership

1. **Event owner:** Each canonical Event belongs to one entity's story. A linked copy is the same Event, not a second owner. Judge from the model's names and context; the board has no explicit entity-timeline field.
2. **Command issuer:** Each Command has exactly one inbound Screen or Processor. Use `model-check` for the structural result.

### Phase 2 — Event quality

3. **Business fact:** Events record facts that happened, not calculations, projections, UI state or technical activity.
4. **Immutability:** Event meaning and data describe a fact that does not change. Board Event definitions are editable; do not confuse that with changing a recorded Event instance.
5. **Past tense:** Event names state what happened in business language.

### Phase 3 — Read Model purpose

6. **Projection, not history:** Each Read Model describes a projection/query result, not an Event or a second event timeline.
7. **Natural query:** Each Read Model answers a clear query need and has a relevant consumer. Fields describe one result item; element `isList` hints list results (omitted = `false`, copies use original). Report conflicts with documented query behavior; never encode result count as an outer list field.

### Phase 4 — Business rules

8. **Command preconditions:** The conditions that accept or reject each Command are explicit in the model's scenarios, `info` or Notes.
9. **Required prior facts:** Given Events and examples make the required prior state clear for each documented Command outcome. Do not assume a prior Event is required when the model does not say so.

### Phase 5 — Data traceability

10. **Input-to-view lineage:** Command inputs are accounted for in resulting Events or are system-created; Read Model fields trace to source Events or are system-created. Use `model-check` for name-based source findings, then judge whether the flow makes business sense.

### Phase 6 — Causal flow

11. **Valid flow:** Slice transitions, Chapter starting points and documented scenario dependencies do not contradict known business rules. Arrows show allowed dependencies, not strict chronological order.
12. **Event boundaries:** A downstream behavior consumes another slice's Events, not shared state or a second owner's copy of the same fact. Event ownership itself is checked in 1.

### Phase 7 — Structural shapes

13. **One decision per Screen:** A Screen triggers at most one Command. This is a structural failure, not a count-based candidate.
14. **Fan-out and scenario outliers:** Review Command outputs, Read Model inputs and scenario-count outliers using the thresholds and judgments in `eventmodeling-core-rules` → Structural Shapes. Report only shapes that still combine distinct jobs after reviewing their Events, fields and scenarios.

## 3. Answer the readiness questions

- Could a modeler new to this domain understand the model in 15 minutes?
- Could a Read Model's business rules or calculations change without rewriting recorded Event history?

Answer **YES**, **NO** or **UNCLEAR**, with brief evidence. Do not turn an unclear answer into a pass.

## 4. Report

Include:

1. Chapters reviewed and `model-check` counts.
2. Each of the 14 checks with status and specific evidence.
3. Both readiness answers.
4. Findings and unresolved business questions, with suggested next skill only when useful (`model-check`, `wdyt`, `scenarios`, `element-fields`, `connections` or `chapter-setup`).
5. One verdict:
   - **PASS** — all checks pass and both readiness answers are YES.
   - **PASS WITH WARNINGS** — no failures, but at least one check or readiness answer is unclear.
   - **FAIL** — at least one check fails or either readiness answer is NO.

Never report a confidence percentage. Never fix findings unless the user asks.
