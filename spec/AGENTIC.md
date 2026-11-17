# Event Modeling — Agent Requirements

Requirements and learnings for skills and agent workflows, not board or server behavior.

## 1. External-event translation

- **A1.1** `eventmodeling-core-rules` defines the Translation Chain. Board conventions: [R5b.3/R5b.4](./MODELING_BOARD.md#5b-slice-types).
- **A1.2** `translating-external-events` discovers external-event contracts and builds translation flows through existing API skills.
  - Ask only for missing source, payload, mapping, correlation, delivery and failure decisions; confirm location/scope before writes.
  - Capture field sources/conversions, correlation timing, atomic deduplication/evidence, ordering, enrichment, validation, timestamps and personal-data handling.
  - Keep external schemas in Integration lanes; internal primary identity stays domain-owned. Agreed correlation/delivery metadata may be `technical`.
  - Never invent defaults, guarantees or business rules; never hide lineage gaps with `generated`.
  - Save contracts/adapter policies in `info` or Notes; Command outcomes in GWT. Document pre-Command behavior and successful no-ops outside GWT.
  - Reuse `slice-modeler`, `element-fields` and `scenarios`; downstream capabilities need separate scope approval.
  - Verify stored model; report gaps and runtime work not implemented. Board checks never prove integration correctness.
- **A1.3** Prototype export excludes translation Processors' outputs from closing Events and missing-closing-arrow warnings.
  - **Learning (implementation):** use derived slice type (R5b.1); linked Processors use original's slice.

## 2. Field editing

- **A2.1** Skills follow Propagate's default (R9.4) through editing API S4.17/S4.20.
- **A2.2** Existing-field edits, renames and removals need separate approval for downstream changes.

## 3. Model validation

- **A3.1** `model-validation-checklist` complements `model-check` with a read-only semantic review of completed models; it reports evidence and never edits the board.
- **A3.2** `model-validation-checklist`, `prototype`, `slice-implementation-skill-builder`, `source-to-event-model`, `stressor-analysis` and `wdyt` are slash-command only; they do not auto-activate.
- **A3.3** Keep skills concise and token-efficient without losing full intent, scope, triggers or constraints.
- **A3.4** Orchestrator skills delegate owned procedures to task-specific skills instead of restating them.
- **A3.5** Every skill edit requires a token-efficiency review before completion: remove repetition/filler, reuse shared procedures/defaults and preserve full intent, scope, triggers and constraints. Fix in the same edit without waiting for user feedback.

## 4. Walkthrough

- **A4.1** `walkthrough` gives read-only explain/impact reports, one step per slice; impact sketches never write to the model.
- **A4.2** Report Context, Chapter and slice names; do not promise canvas deep links.

## 5. Read Model list hints

- **A5.1** Modeling skills set `isList` for list queries, including automation/translation todo lists (R3.25); ask when cardinality is unclear. Field edits preserve it and never propagate it.
- **A5.2** Navigation, review and implementation skills read `isList` from element/Chapter content, following `copyOf`; outline/search omit it. Report conflicts with documented query behavior; read-only skills never fix flags.
- **A5.3** Generated implementation skills map `isList` through confirmed stack decisions; item fields stay separate (R9.9). Conflicts block implementation.
- **A5.4** Prototype export includes each Read Model's original `isList` as a boolean, default `false`.

## 6. Scenario-driven tests

- **A6.1** Test-implementation skills read scenario `description` alongside name, GWT/error and example data; apply stated requirements to setup, actions and assertions, not only labels/comments.
- **A6.2** Generated implementation skills stop before code changes on ambiguous descriptions, conflicts with GWT/example data, or conflicts between scenarios for the same conditions; never invent requirements or silently choose one source.
- **A6.3** Report description requirements covered by tests. Prototype checks report requirements they cannot exercise as coverage gaps; GWT matches alone do not prove full coverage.

## 7. Automation feedback

- **A7.1** Skills allow a back arrow within an Automation slice from its Command's output Event to the TODO Read Model used by its Processor. Cross-slice forward-only and Translation TODO rules stay unchanged.

## 8. Alternative business-failure flows

- **A8.1** A Command may record a business-failure Event (e.g. `Payment Capture Failed`) when an alternative flow follows.
- **A8.2** The alternative flow may start a new Chapter with a linked copy of that Event; the original Command remains its producer.
- **A8.3** Recorded business failure: Then Event with `error: null`. Precondition rejection: no Event, `then: []` and `error`.
- **A8.4** An intentional copied-fact-only entry slice may have no derived type; do not add unrelated elements merely to force a type.

## 9. Optional distant-copy arrows

- **A9.1** Event → Read Model arrow may be omitted only for a linked Read Model copy in a later slice of the same Chapter, with at least three slices strictly between endpoints (index difference ≥4; e.g. slices 1 → 5).
- **A9.2** Omission reduces arrow clutter, not the Event dependency. It never applies to originals, nearer copies or other arrow types; never remove existing arrows unasked.
- **A9.3** Skills permit eligible omissions. Reviews do not flag omission alone as a gap; arrow-based dependency reports state that omitted dependencies are absent.

## 10. Review findings as Tasks

- **A10.1** `wdyt`, `model-check`, `model-validation-checklist`, `language-check`, `pii-audit` and `stressor-analysis` offer selected findings as Tasks after reporting; skip when none.
- **A10.2** Confirm findings, titles and Context/Chapter assignment before Task writes. Never create Tasks automatically; Task approval does not authorize model fixes.
- **A10.3** Shared API reference owns Task capture: business-language titles, question/evidence descriptions, default `Open` status, API writes and read-back; report saved count/titles and failures.
- **A10.4** Approved Task capture is the only write exception during read-only reviews.
- **A10.5** Uncertain findings stay questions in Tasks, not confirmed fixes.

## 11. API efficiency

- **A11.1** Batch ready writes with compact responses (S4.20/S4.24); retain required approvals, creation order and verification. Shared API reference owns response shape and mode choice.
- **A11.2** Navigation uses resolved Screen metadata (S3.13) to check linked-copy mockup presence without fetching HTML.

## 12. Stressor analysis

- **A12.1** `stressor-analysis` reviews one Chapter through Markdown tables and structured user decisions; read-only until explicit redesign approval. Task capture follows section 10.
- **A12.2** Start with about 15 wide stressors, at least 5 external; alternate external/business stressors. More adds about 10, retaining previous rows/IDs. Residues describe surviving/lost behavior, not fixes.
- **A12.3** Submitted unacceptable residues lead directly to an incidence matrix of all affected business elements. Shared hits suggest coupling; unknown behavior stays explicit.
- **A12.4** Retain baseline, selections, approvals and judgments across turns. Reassess changed evidence before writes; use revision guards. Apply only approved additions via `slice-modeler`, including its HTML/scenario checks.
- **A12.5** Compare the same fresh stressors before/after using separate user judgments. Report acceptable/assessed and unknown counts; no runtime-resilience claim from model changes. No-new-element hits is a stopping heuristic, not proof.

Board rules: [Fields](./MODELING_BOARD.md#9-fields). API rules: [Editing API](./SERVER.md#4-editing-api).
