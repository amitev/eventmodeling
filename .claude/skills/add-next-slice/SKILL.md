---
name: add-next-slice
description: Decide on and create a genuinely new slice from scratch when the model does not yet suggest an obvious next capability — the story on the board has no slice for what naturally comes next. Use for "add the next slice", "what comes next", "continue the model", "add another step". Do not use for - building a slice the user has fully specified (use `slice-modeler`), or changing, moving or deleting existing slices and elements (use `chapter-setup`, `edit-and-delete`).
---

# Add Next Slice

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

**Purpose**: Given a Chapter whose story has no slice yet for what naturally comes next, decide on a plausible next capability and create it as a brand-new slice — Screen, Command or Query, and Event — all at once, with a real mockup that matches the Chapter's existing look.

Read `eventmodeling-core-rules` first (slices, lanes, naming, causality). Do not guess the rules below. To look things up in the model, use the `model-navigation` skill (cheap reads). The slice itself is built with `slice-modeler`; this skill decides **what** to build and finishes the Screen.

---

## Core concept: a slice is one Command, one Query, or one Processor

A slice is one Command, one Query, or one Processor, with the Event(s), Query and Command around it (the four slice types and their shapes are in the core rules and in `slice-modeler`). The slice you create must obey them like any other. If the capability you decide on needs both a Command and a Query (for example "place an order" needs a `Place Order` Command and an `Order Details` Query), that is **two slices**: create them one at a time, each its own batch.

---

## This is not a case where you stop and ask

"I don't know what the next capability is" is not the same as "any guess risks doing the wrong thing." A plausible next slice — the next lifecycle stage, an unaddressed affordance on an existing Screen, a natural create/update/notification gap — always exists for a working domain, and a wrong guess costs nothing: it is one more slice, easy to rename or delete later.

**Ending the turn with a question and no new slice is not an acceptable outcome of this skill.** For the choice of the next capability this skill overrides the general rule to ask before assuming: make the assumption, state it (Step 4), and create the slice in the same turn. The only things you may still ask about are the ones you cannot decide at all (Step 0).

---

## Step 0 — Where

- The Chapter: named in the request. Not named and the Context has exactly one Chapter: use it. Several Chapters: ask which.
- The place in the Chapter: after the last slice, unless the request names a slice to follow (`chapter-setup`, "Add between").
- An **empty** Chapter in an empty model and a request that names nothing: there is no story to continue. Ask what the process is. This is the only case where you ask what the capability is.

## Step 1 — Decide on the next capability

**If the request gives no specific instruction about the next slice** (a bare "add the next slice"), do not ask for one: read the story already on the Chapter and derive the next step yourself.

1. Read the Chapter's slices in order (`model-navigation`: the outline for names and order, `GET /chapters/:id?screenContent=false` for the elements' fields). Titles and field names are enough; do not read mockups yet.
2. The Commands, Events, Queries and Screens, left to right, tell a story (for example Reserve Table → Cancel Reservation → Check In → …). Identify what is missing next:
   - the natural following **lifecycle stage** (placed → paid → shipped → …);
   - an **unaddressed affordance** on an existing Screen: a button or link with nothing behind it. Only for this, read the mockup of the last one or two Screens (`GET /api/model/elements/:id`, `html`; filter it, do not print it all);
   - a **gap** the existing entity clearly has: created but never updated, cancelled or shown in detail; an action with no confirmation or overview; an Event that no Query reads;
   - open **red Notes** in the Chapter (open questions) that name a missing step.
3. Prefer the option that most directly **continues the existing narrative** over one that starts an unrelated thread: the goal is the slice that makes the most sense as *next*, not just any plausible one.
4. `model-check` (for this Chapter) lists unfinished work: slices with no type, Screens with no mockup, Events nothing reads. Use it as input, and name unfinished slices in the report; creating the new slice is still the task.

**If the request names the capability** (or points to a Note or discussion that does), use that instead of inferring one.

If several next steps are equally reasonable, pick the one that best continues the story, record the alternative in the report, and create the slice. Never stop at the question.

**Naming and content** of what you decide: business language as `naming` says. Field names and types come from the story: the next Command carries the identifiers the earlier Events recorded; a Query shows what earlier Events captured. Do not invent business rules; a field with no source in the story is `generated` or left out (`element-fields`).

## Step 2 — Create the slice

Build it with `slice-modeler`: gather nothing from the user (Step 1 decided it), pick the recipe for the slice type, and write one atomic batch.

- **Type:** state change for a new Command (Screen → Command → Event), state read for a new Query (Query → Screen), automation for a new Processor (and translation when an external party acts). Per the core concept above, one Command, Query or Processor per slice.
- **Name the slice after its element** (the Command, Query or Processor name), never leave "New Slice".
- **Lanes:** the lane of the needed type. If the Chapter has more than one lane of a type (for example several Actor lanes for different roles), use the one the story's earlier slices use for that role; when nothing points to one, use the first of that type, and say which in the report. A Processor goes in a system-actor lane; system-actor lanes are preferably the top Actor lanes, above the human roles.
- **Place** it after the last slice (or where Step 0 said).
- **Arrows and fields** as the recipe says: a Query is fed by the previous slice's Events (automatic arrow from the previous slice's right-most Event; connect other Events explicitly), and the Screen inherits the fields.
- Do not use `info` for anything but implementation details (`slice-modeler`).

## Step 3 — Replace the placeholder Screen, matching the Chapter's style

For a state change or state read slice, the Screen created in Step 2 has **no mockup**: it is an empty placeholder. Never leave it like that.

1. Choose the **style reference**: the Screen with a mockup in the closest earlier slice of the Chapter. None there: the nearest Screen with a mockup anywhere in the Chapter, then in the Context. None at all: no reference; design it fresh and say so.
2. Use `html-screen` to write the mockup into the Screen you created (an update, so its fields stay), naming the chosen Screen as the style reference (its Step 2a: take the look, not the content or the width). Tell it what the Screen contains: the fields of the new Command or Query, with realistic values from the story.
3. Always `html-screen`: never a wireframe sketch unless the user explicitly asks for one.

An automation slice has no Screen: skip this step.

## Step 4 — Verify and report

1. Read the outline for the Chapter once: the new slice's `type` must be the expected one (`STATE_CHANGE`, `STATE_READ`, `AUTOMATION`, `TRANSLATION`), with the arrows of the recipe. `null` means something is missing: fix it.
2. Report:
   - the **capability** you decided on and why (what in the story pointed to it), and the alternatives you passed over;
   - the **assumptions** you made (the lane, the style reference, a field with no source);
   - the slice type, its name and each element created (name, type, lane, id);
   - whether the Screen got a real mockup and which Screen it matches (or that none existed);
   - findings of `model-check` that matter (unfinished slices).
3. Offer, don't do: `scenarios` for the new Command, `element-fields` if a field should flow further, `wdyt` for a business review.

When an assumption is large (a new capability that changes the story's direction) and the Chapter already has a Spec lane with a free Cell in the new slice, you may add a yellow Notes element there with the assumption in one sentence. Do not add a lane for it.
