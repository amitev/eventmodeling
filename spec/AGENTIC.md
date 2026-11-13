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
- **A3.2** `model-validation-checklist`, `prototype`, `slice-implementation-skill-builder`, `summarize` and `wdyt` are slash-command only; they do not auto-activate.
- **A3.3** Keep skill descriptions concise and token-efficient without losing scope, triggers or constraints.

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
- **A6.2** Generated implementation skills stop before code changes on ambiguous descriptions or conflicts with GWT/example data; never invent requirements or silently choose one source.
- **A6.3** Report description requirements covered by tests. Prototype checks report requirements they cannot exercise as coverage gaps; GWT matches alone do not prove full coverage.

Board rules: [Fields](./MODELING_BOARD.md#9-fields). API rules: [Editing API](./SERVER.md#4-editing-api).
