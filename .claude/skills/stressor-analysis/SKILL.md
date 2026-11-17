---
name: stressor-analysis
description: Interactive residuality-theory analysis of one Chapter. Explore wide stressors and surviving behavior, map hidden coupling, and propose new slices. Read-only until explicit redesign approval.
disable-model-invocation: true
---

# Stressor analysis

**Model access:** API only ([API reference](../em-board-api.md)); never read, create, edit or delete `.event-modeling/` files. Read `eventmodeling-core-rules` first; use `model-navigation` for lookups.

Run a multi-turn chat loop, not an automatic board redesign. Use Markdown tables for results and `ask_user` for decisions; if unavailable, pause and report the missing capability. No hosted chat snippets, connection tokens, prompt queues or canvas links.

## Concepts

- **Stressor:** something that could happen to the business, environment or system. Explore many directions, including far-fetched ones; not a prediction or ranked risk register.
- **Residue:** what still works and what state/data survives or is lost after a stressor. Observe it; the proposed fix is not the residue.
- **Goal:** make residues acceptable to the user. Broader coverage probes resilience; it does not prove survival of every unlisted stressor.
- **Incidence matrix:** stressors by affected elements. Shared hits suggest hidden coupling, not proof of a shared cause.

## 0. Load and retain the round

1. Resolve Chapter from arguments/message. If absent and exactly one exists, use it; otherwise ask, showing Context and Chapter names. Ambiguous names require a choice.
2. Read outline and target Chapter with `screenContent=false`. Resolve copies to original content; retain each occurrence's location. Read external originals or Screen HTML only when needed.
3. Keep the baseline revision, relevant model snapshot, stressor ledger, selected IDs, matrix, chosen cluster, approvals and before/after judgments across turns. Use conversation/session state, never board Notes as scratch. Missing state: recover history or ask; never infer prior selections or approval.
4. Reuse this snapshot during the round. Before writes or a new round, check revision; reload changed evidence and reassess affected residues. Changed approved scope needs renewed approval.

Use only observed element IDs internally. In reports, use business names and slice/Chapter names to disambiguate; show stressor IDs (`S1`, etc.), never raw board IDs. Treat undocumented behavior as unknown, not guaranteed survival or loss.

## 1. Offer stressors and residues

Offer about **15** stressors, alternating external and Chapter-business stressors:
- At least **5 external**, spanning nature, people, legal, market and infrastructure: a flood, acquisition, new law, key person leaving, competitor going free.
- Others from the Chapter's business, such as a customer changing their mind or a partner stopping delivery. Avoid near-duplicates and concentrate on least-covered directions/elements.

One row per stressor:

| ID | Stressor | Residue |
|---|---|---|
| S1 | Payment partner stops trading | Purchase Receipt remains available, but Pay Premium cannot complete new purchases. |

Use actual slice/element names, not the example's. Title: at most **8 words**. Residue: **one short business sentence**, naming affected/surviving behavior; no fixes. No field names, attribute values, races, token/API mechanics or parenthetical sub-lists in either column.

Show the **full table first**, then one form:
- Multi-select: **"Tick the ones whose residue is unacceptable"**, options labelled with ID and title.
- Action: **"These are unacceptable"** (default) or **"More stressors first"**.

| Response | Next |
|---|---|
| More, before submission | Add about **10 fresh** stressors. Show all previous rows unchanged, then additions; continue IDs. State new/total counts, then repeat form. Retain any supplied selections. |
| Submit | Union selected IDs across lists; go directly to Step 2. Never ask again whether to build the matrix or offer more first. |
| Enough, without submitting | Point to current selection form; wait. |
| Stale More/Enough after matrix | Briefly state analysis has moved on; retain current step. |

A declined/cancelled form is not a submitted empty selection or approval. Pause; do not invent answers.

## 2. Map incidence and choose a cluster

For each selected stressor, identify **every affected business element**, not just the worst hit. Use fields, arrows, scenarios and stated constraints as evidence; field names may appear here. Separate evidence from assumptions; ask about uncertainties that change a hit. Copies share definitions but remain separate occurrences.

Render a Markdown matrix:
- Rows: elements hit at least once, sorted by descending hit count; qualify duplicate names by slice.
- Columns: `Element`, `Hits`, then selected stressor IDs; use `X` for a hit and `-` otherwise.
- More than **10 selected**: replace individual stressor columns with `Hit by` containing IDs.
- Legend: each selected ID and its title.

Name hotspots and clusters sharing the same stressor pair/set; explain suspected shared causes without presenting them as proven. Fewer than **5 selected**: say coupling evidence is thin. No selections: report an empty matrix, no inferred cluster/redesign, and ask whether to finish or start a fresh round.

Use one form to choose which cluster to redesign first, with finish as an option. No pair-shared cluster: offer an affected element as a focus, not a fabricated cluster.

## 3. Propose one redesign

Propose only the chosen cluster's new slices. For each, state business purpose, insertion point, elements, required field sources and dependencies; reuse shared definitions. Include the **proposed new residue for every stressor hitting the cluster**, separating model-supported behavior from runtime work.

Resolve material business decisions; do not invent fallback guarantees, grace periods or ownership. Ask explicit approval: **"Add these N slices for <cluster>?"** List exact scope before the form. A no leaves the board unchanged; offer another cluster or finish.

## 4. Apply only approved scope

Use `slice-modeler` directly for approved slices, not queued prompts. Pass confirmed Chapter/location, behavior, elements, field sources, dependencies and rejection rules. It owns structure, persisted Screen HTML, scenarios and verification; use its supporting skills rather than duplicating procedures. Shared API reference owns batching and compact response choice.

Approval covers only described additions. Existing-element edits/deletes, new lanes or unresolved requirements need their own confirmation through the owning skill. Use `If-Match`, starting at approved revision and chaining returned ETags across batches. A 412 requires reload/reassessment, not a blind retry.

Report saved slices and any blockers; failed/partial writes are not a completed redesign. Board changes do not implement or prove runtime resilience.

## 5. Validate with fresh stressors

Generate stressors not used in prior rounds, keeping Step 1's breadth and wording. Evaluate the **same fresh set** against retained baseline and verified redesigned model; show before/after residues side by side.

Ask the user to mark unacceptable residues **separately for before and after**. Compute the **residual index** only from explicit judgments: `acceptable / assessed` for each, e.g. `before: 6/12; after: 10/12`. Keep unknown/unassessed counts separate; do not invent acceptability or compare different denominators without stating them.

Use unacceptable after-residues for the next matrix/redesign cycle. Offer to finish when fresh stressors stop exposing new affected elements; this is a stopping heuristic, not proof. Otherwise continue only at the user's direction.

## Reporting

Keep prose per step within **1000 characters**; tables/forms carry detail. Explain a residue with a same-stressor before/after example when asked. Preserve the current step on side questions.

At finish, summarize selected stressors, clusters, accepted/rejected redesigns, measured judgments and unresolved assumptions. Offer selected findings as Tasks through shared API reference; selecting an unacceptable residue does **not** approve Task creation or model changes.
