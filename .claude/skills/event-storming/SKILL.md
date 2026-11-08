---
name: event-storming
description: Live event-storming facilitator — asks questions about any business process (or accepts any text or document) and continuously builds and adjusts the timeline on the board as Events are discovered, renamed or reordered, records hot spots and open questions as red Notes, and on request enriches the discovered Events into full slices. Use for "let's storm this process", "walk me through the events", "what happens first / next", "put these events on the board". For a whole document with rules and deadlines use `summarize`.
---

# Event Storming

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` once per session first (what an Event is, causality). You also use `naming` (Event names), `chapter-setup` (Chapters, slices, lanes), `edit-and-delete` (rename, move, delete), `model-navigation` (cheap reads) and, at hand-over, `slice-modeler`, `element-fields`, `connections`, `html-screen` and `scenarios`. Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`).

**Posture: Modeling Mode.** Explore and capture; a wrong name or order is cheap to fix by talking. Do not audit while storming.

**Exception to ask-before-assuming:** in a storming session you apply each Event you extract **at once** and say so in one line; the user corrects by talking. The session is exploratory and every change is easy to undo. Everything outside this (deleting enriched slices, adding lanes to a Chapter that is not yours, hand-over decisions) follows the usual rule: ask.

---

## How a discovered Event is shown

While storming, **one slice per discovered Event**, in a Chapter named for the process, with the Event alone in the **Event lane**:

- the slice has the **same name as its Event** (`Order Placed`);
- slices run left to right in **time order**;
- the Chapter's other lanes stay empty until hand-over (Commands, Screens, Queries come later).

Such a slice has no type yet (the board works the type out from the elements). That is expected: do not run `model-check` during a storm.

---

## Step 0 — Start

Ask, in one message (use the ask tool), what you cannot know:
- **the process** to storm (its name becomes the Chapter name; see `naming`);
- the **Context** (an existing one, or a new one);
- whether it **starts from a text or document** the user will paste, or from questions.

Then create the Chapter (`chapter-setup`; keep its first "New Slice" and rename it to the first Event, or delete it once a first Event slice exists). A Chapter that already exists is extended, not replaced.

## Step 1 — The facilitation loop

Ask **one or two questions at a time**, in the user's words, and wait. Useful questions:

- What **starts** the process? What is the very first thing that happens?
- And then what happens? What must **already have happened** before this?
- Who or what **causes** it (a person, a system, time)?
- What can **go wrong** here? What happens then?
- Is there a **deadline** or waiting time?
- Does **another party** do something here (an authority, a bank, a supplier)?
- Where does it **end**? What is the last thing that happens?
- Is there something **people disagree** about?

One concept per question. Do not lead, and do not fill gaps from "what such processes usually do": a gap is a question, or a hot spot.

## Step 2 — Turn answers into Events, live

From what the user says, extract the **Events**: things that happened, in the past tense, as business facts (`naming`, the core rules). Reject UI events (`ButtonClicked`), technical events (`ApiCalled`) and computed values, and say why in a few words.

For each Event:
1. Check the Chapter for the same or a similar name (`model-navigation`); a duplicate is a question, not a second slice.
2. Add it **right away** at the position the story says: one atomic `POST /ops` (`chapter-setup`: create the slice `after` the previous Event's slice, named like the Event; then `POST /elements` `{ slice: "$s", lane: <Event lane>, type: "EVENT", name }`). First position: create after the first slice, then `PATCH` its `index` to 0.
3. Say it in **one line**: `Added "Order Placed" after "Cart Checked Out".` Not a summary of the board.

**Adjusting live:**

| The user says | Do |
|---|---|
| "call it X instead" | rename the Event **and** its slice in one `POST /ops` (`PATCH` both) |
| "that comes before Y" / "swap them" | `PATCH /slices/:id { "index": n }` of the slice that moves |
| "remove it" | `DELETE /slices/:id` (the slice holds only the Event while storming: no confirmation); after hand-over follow `edit-and-delete` and confirm |
| "these two are the same" | keep one; delete the other slice |
| "this can also end in Z" | an **alternative outcome** is its own Event slice right after the Event it branches from; say so. If the user wants whole branches as separate flows, ask whether to use another Chapter |
| "these happen in parallel" | consecutive slices; say that the board shows them one after the other |
| unclear, undecided, disputed | a **hot spot** (below), and carry on |

Remember (in the conversation, not on the board) the **actors, triggers and rules** the user mentions, such as "the customer clicks Pay" or "the bank confirms". You will need them at hand-over.

## Hot spots and open questions

A hot spot is something unclear, undecided or disputed. Record it so it is not lost:

1. The Chapter needs a **Spec lane named "Hot spots"**: if missing, add it (`POST /chapters/:id/lanes` `{ "type": "SPEC", "after": <last lane>, "name": "Hot spots" }`). It is part of this skill's own Chapter; in a Chapter you did not create, ask first.
2. Put a **red Notes element** in that lane, in the slice of the Event the question belongs to: `POST /elements` `{ slice, lane, type: "NOTES", color: "red", markdown }`. A Spec Cell takes only one element, so several questions of one slice are **one note**, a numbered list, one question per line, each answerable in one line.
3. List them in chat too, at checkpoints.
4. When a question is answered: update or delete the note (`PATCH` its `markdown`, or `edit-and-delete`) and say so.

Do not use `info` for questions or notes (it is for implementation details).

## From text or a document

The user may paste a passage, a story, minutes, or name a file:

1. Read it all. Extract the Events in time order, each with the sentence it comes from. Do not invent: an Event the text does not state is a question.
2. Show the list (names in order, ambiguous ones marked), ask only about the unclear ones, then add all of them in **one** `POST /ops`, one line per Event, as in Step 2.
3. Unclear or contradictory passages become hot spots.
4. For a long document, or one with rules, deadlines and penalties that must be modelled and traced, say that `summarize` is the better tool and offer it.

## Checkpoints

After every five to eight new Events, and whenever the user asks, **read the timeline back**: the Events in order, as a numbered list from the outline (`model-navigation`), then ask: Is anything missing? Is the order right? What starts it, and where does it end? Also list the open hot spots and what you remember about actors, triggers and rules.

---

## Hand-over: from Events to slices

When the user says the storm is done, or asks to detail it, enrich the Event slices **in place**, one at a time, in time order:

1. For each Event slice, work out from the conversation **what triggers it**: a person on a Screen (then a Command), a system (a Processor), an external party (a translation slice, the Event in an Integration lane of that system: ask for the system's name and how it reaches us, add the lane as `chapter-setup` says (one lane per system, named after it, `info` with the details; core rules, "External systems"), then move the Event with `PATCH` `{ slice, lane }`). Fill gaps by **asking** the user: who does it, what do they enter, what rule applies. Never invent.
2. Build the missing parts **inside the existing slice** with the recipes of `slice-modeler` (do not create a new slice): the Command in the Interaction lane and the Screen or Processor in the Actor lane. The Event already exists, so connect the Command to it with `POST /connections` `{ from: <command>, to: <event> }` (the Screen → Command arrow is automatic when the Screen exists first); fields copy along the arrows (`element-fields`, `connections`).
3. **Rename the slice to its Command** (`Place Order`), as the core rules and `model-check` expect. The Event keeps its name.
4. Queries the Events feed (what a user needs to see) are **new slices** after the slice that produces the Event: `slice-modeler`, state read recipe.
5. Mockups with `html-screen`; scenarios from the rules the user gave with `scenarios`.
6. Then run `model-check` for the Chapter and report the findings; the open hot spots stay as red Notes until the user answers them.

Do hand-over only on request. A storm that stays a list of Events is a complete result.

## Report

At the end of a session, and on request: the process and Chapter; the Events in order (count); the hot spots and open questions; the assumptions made; what is ready for hand-over. Offer, don't do: hand-over, `wdyt`, `scenarios`.
