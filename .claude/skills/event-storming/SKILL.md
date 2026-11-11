---
name: event-storming
description: Facilitate live event storming from questions/text/documents; build/adjust Event timeline, record red Notes for hot spots, enrich into full slices only on request. Use for "let's storm this process", "walk me through the events", "what happens first / next", "put these events on the board". Whole document with rules/deadlines uses `summarize`.
---

# Event Storming

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` once/session first (Events, causality). Use `naming`, `chapter-setup`, `edit-and-delete`, `model-navigation`; hand-over adds `slice-modeler`, `element-fields`, `connections`, `html-screen`, `scenarios`.

**Modeling Mode:** explore/capture, adjust names/order conversationally. **No audit during storming.**

**Ask-before-assuming exception:** apply extracted Events **immediately**, report one line, user corrects conversationally. Outside exploratory changes—enriched-slice deletion, lanes in others' Chapters, hand-over decisions—**ask**.

## How a discovered Event is shown

Here, **Event** means the board element (model definition), not a recorded Event Sourcing instance. Renaming, moving or deleting it changes the model, not event-store history.

Process-named Chapter; **one slice per Event**, Event alone in Event lane, slice name = Event (`Order Placed`). Left-to-right **time order**; other lanes empty until hand-over. Untyped slices expected; **never run `model-check` during storm**.

## Step 0 — Start

Ask missing inputs in **one ask-tool message**: process (Chapter name; `naming`), existing/new Context, start from text/document or questions.

Create via `chapter-setup`; rename initial "New Slice" to first Event, or delete after first Event slice exists. **Extend existing Chapter, never replace.**

## Step 1 — The facilitation loop

Ask **one/two questions, then wait**; user's words, one concept each:

- What **starts** the process? What is the very first thing that happens?
- And then what happens? What must **already have happened** before this?
- Who or what **causes** it (a person, a system, time)?
- What can **go wrong** here? What happens then?
- Is there a **deadline** or waiting time?
- Does **another party** do something here (an authority, a bank, a supplier)?
- Where does it **end**? What is the last thing that happens?
- Is there something **people disagree** about?

Never lead or fill gaps from typical processes; gaps become questions/hot spots.

## Step 2 — Turn answers into Events, live

Extract past-tense business facts (`naming`, core rules). Reject UI (`ButtonClicked`), technical (`ApiCalled`) and computed values; briefly explain.

For each Event:
1. Check same/similar names in Chapter (`model-navigation`); duplicate → question, not second slice.
2. **Immediately** add at story position, one atomic `POST /ops`: create Event-named slice `after` predecessor (`chapter-setup`), then `POST /elements` `{ slice: "$s", lane: <Event lane>, type: "EVENT", name }`. First position: create after first slice, PATCH `index: 0`.
3. **One line**, not board summary: `Added "Order Placed" after "Cart Checked Out".`

**Adjusting live:**

| The user says | Do |
|---|---|
| "call it X instead" | PATCH Event **and slice** in one `POST /ops` |
| "that comes before Y" / "swap them" | `PATCH /slices/:id` `{ index: n }` for moving slice |
| "remove it" | `DELETE /slices/:id`; Event-only storm slice: no confirmation. After hand-over: `edit-and-delete`, confirm |
| "these two are the same" | Keep one, delete duplicate slice |
| "this can also end in Z" | Separate alternative Event slice immediately after branch point; report. Separate-flow branches: ask about another Chapter |
| "these happen in parallel" | Consecutive slices; explain sequential display |
| unclear, undecided, disputed | Hot spot, continue |

Keep **actors/triggers/rules in conversation, not board**, for hand-over (e.g. customer clicks Pay, bank confirms).

## Hot spots and open questions

Record unclear/undecided/disputed points:
1. Missing **Spec "Hot spots" lane**: `POST /chapters/:id/lanes` `{ type: "SPEC", after: <last lane>, name: "Hot spots" }`. **Ask first in Chapter you did not create.**
2. In relevant Event slice: `POST /elements` `{ slice, lane, type: "NOTES", color: "red", markdown }`. One note per Spec Cell: numbered questions, one per line, each answerable in one line.
3. Include in checkpoint chat.
4. Answered: update `markdown` or delete note (`edit-and-delete`); report.

**Never questions/notes in `info`**; implementation details only.

## From text or a document

For passage/story/minutes/file:
1. Read all; extract time-ordered Events with source sentences. Unstated Event = question, never invention.
2. Show ordered names, mark ambiguity; ask only unclear points, then add all in **one `POST /ops`**, report one line/Event.
3. Ambiguity/contradictions → hot spots.
4. Long source or traceable rules/deadlines/penalties: recommend/offer `summarize`.

## Checkpoints

Every **five to eight new Events**, and on request: numbered timeline from outline (`model-navigation`); ask what's missing, correct order, start/end. List open hot spots and remembered actors/triggers/rules.

## Hand-over: from Events to slices

When user says done/requests detail, enrich **existing Event slices in place**, one at a time, time order:
1. Trigger from conversation: person → Screen/Command; system → Processor; external party → translation. Ask system name/delivery, add named Integration lane via `chapter-setup` (one/system, details in `info`; `eventmodeling-core-rules`, External systems), PATCH Event `{ slice, lane }`. **Ask gaps**: who, inputs, rules; never invent.
2. `slice-modeler` recipe **inside existing slice**, not replacement: Command in Interaction, Screen/Processor in Actor. Existing Event needs explicit `POST /connections` `{ from: <command>, to: <event> }`; Screen → Command automatic if Screen created first. Copy fields via `element-fields` / `connections`.
3. Rename slice to **Command** (`Place Order`); keep Event name.
4. Feeding Read Models: **new state-read slices after producing Event slice**, via `slice-modeler`.
5. `html-screen` mockups; `scenarios` from user-given rules.
6. Run Chapter `model-check`; report findings. Unanswered hot spots stay red Notes.

**Hand-over only on request. Event-only timeline is complete result.**

## Report

Session end/on request: process/Chapter, ordered Events/count, hot spots/questions, assumptions, hand-over readiness. Offer only: hand-over, `wdyt`, `scenarios`.
