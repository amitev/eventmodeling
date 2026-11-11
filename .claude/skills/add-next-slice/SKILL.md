---
name: add-next-slice
description: Choose and create a genuinely new next capability when the board has no slice for it. Use for "add the next slice", "what comes next", "continue the model", "add another step". Fully specified slice uses `slice-modeler`; existing structure/elements use `chapter-setup` / `edit-and-delete`.
---

# Add Next Slice

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

**Purpose:** choose plausible next capability, create brand-new slice with recipe's elements and real mockup matching Chapter's look.

Read `eventmodeling-core-rules` first; lookups: `model-navigation`. Never guess rules. `slice-modeler` builds slice; this skill chooses **what** and finishes Screen.

## Core concept: a slice is one Command, one Read Model, or one Processor

Follow four slice shapes in core rules/`slice-modeler`: one Command, one Read Model, or one Processor with surrounding elements. Capability needing Command **and** Read Model (e.g. `Place Order` + `Order Details`) needs **two slices**, one at a time, separate batches.

## This is not a case where you stop and ask

A working domain has plausible lifecycle, Screen-affordance or create/update/notification gaps; a new slice is easy to rename/delete.

**Must create new slice this turn, not end with a question.** Choosing capability overrides ask-before-assuming: choose, state assumption in Step 4, create. Ask only undecidable location/process questions in Step 0.

## Step 0 — Where

- Use requested Chapter; absent + exactly one in Context: use it; several: ask.
- Append after last slice unless request names predecessor (`chapter-setup`, Add between).
- **Empty Chapter in empty model, request names nothing:** ask process; only case allowing capability question.

## Step 1 — Decide on the next capability

Bare "add the next slice": derive from Chapter, **never ask for capability**.

1. Read ordered slices: outline names/order; `GET /chapters/:id?screenContent=false` for fields (`model-navigation`). Titles/field names suffice; no mockups yet.
2. Read left-to-right story (e.g. Reserve Table → Cancel Reservation → Check In); find:
   - next **lifecycle stage** (placed → paid → shipped);
   - **unaddressed Screen button/link**: only here read last one/two mockups (`GET /elements/:id`, filtered HTML, never whole output);
   - **entity gap**: created but never updated/cancelled/detailed; action without confirmation/overview; Event no Read Model reads;
   - **red Notes** naming missing step;
   - **external reaction** only if story/Note/request names system/fact (payment confirmed, delivery reported). Never invent system.
3. Prefer **direct narrative continuation**, not unrelated thread.
4. Run Chapter `model-check`; use unfinished slices (untyped, missing mockup, unread Events) as input and report them. Still create **new slice**, not just repairs.

Request/Note/discussion names capability: use it, don't infer another.

Tied options: choose best continuation, report alternatives, create; **never stop at question**.

Business names: `naming`. Fields/types from story: reuse recorded identifiers in Command, captured facts in Read Model. **Never invent business rules**; sourceless field is `generated` or omitted (`element-fields`).

## Step 2 — Create the slice

Use `slice-modeler` recipe, **no further gathering**, one atomic batch.
- **Type:** new Command → state change (Screen → Command → Event); Read Model → state read (Read Model → Screen); Processor → automation; external fact → translation. Translation requires known system name/Event/delivery from story/Note/request; named Integration lane + `info` (`eventmodeling-core-rules`, External systems). Missing details: **choose other capability**, report translation needing input; never infer.
- **Name:** exact Command/Read Model/Processor name; never "New Slice".
- **Lane:** needed type; reuse earlier slice's lane for role. No evidence: first of type, report choice. Processor in system-actor lane, preferably above human lanes.
- **Position:** Step 0.
- **Arrows/fields:** recipe; Read Model fed by previous Events (right-most automatic, others explicit), Screen inherits fields.
- `info`: implementation details only (`slice-modeler`).

## Step 3 — Replace the placeholder Screen, matching the Chapter's style

State-change/state-read Screen starts empty. **Never leave placeholder.**

1. **Style reference priority:** mockup in closest earlier slice → nearest mockup elsewhere in Chapter → Context → none (design fresh, report).
2. `html-screen` updates created Screen, **keeping fields**. Name reference; Step 2a takes look, not content/width. Use new Command/Read Model fields, realistic story values.
3. Always `html-screen`; wireframes only on explicit request.

Automation has no Screen: skip.

## Step 4 — Verify and report

1. One Chapter outline read: expected `STATE_CHANGE`/`STATE_READ`/`AUTOMATION`/`TRANSLATION` and recipe arrows; `null`: fix missing part.
2. Report capability/reason/alternatives; assumptions (lane/style/sourceless field); slice type/name; elements (name/type/lane/id); actual mockup/reference or none; relevant unfinished-work findings.
3. Offer only: `scenarios`, further field flow via `element-fields`, business review via `wdyt`.

Large directional assumption: optional **yellow Notes**, one sentence, only if existing Spec lane has free new-slice Cell. **Never add lane for it.**
