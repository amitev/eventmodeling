---
name: eventmodeling-core-rules
description: Shared, foundational rules for event modeling on the board — what a SCREEN/COMMAND/EVENT/QUERY/PROCESSOR is, how each is named, how slices and arrows follow the flow, and the anti-patterns to reject. Not a task of its own — referenced upfront by the other skills (element-fields, scenarios, connections, wdyt, ...) instead of each restating its own copy. Do not use standalone.
---

# Event Modeling — Core Rules

These rules apply to every task on the board, regardless of which skill you're currently following. Read this once per session — a skill's own file only states what's specific to it, not these fundamentals.

## Modes

What you were asked to do sets the posture — don't mix them.

- **Modeling Mode** — building or changing the model (`html-screen`, `element-fields`, `connections`, `scenarios`): explore and build. Capture the process as completely as you can. A naming slip or an incomplete precondition is something to flag and move past, not a reason to stall the whole task — don't over-correct early.
- **Critic Mode** — reviewing what's already there (`wdyt`): apply every rule in this file strictly. Surface every violation, gap, and inconsistency — don't soften a finding because the model "mostly works." Post findings as comments rather than silently fixing them, unless asked to fix.

Don't mix them in one pass: a modeling task is not the place to run a full rules audit, and a critic task is not the place to quietly add missing structure on the model's behalf instead of flagging it.

## Lanes — What Lives Where

Every Chapter has lanes of these types, always in this top-to-bottom order (several lanes of one type are allowed; a Chapter always has at least one Actor, Interaction and Event lane), and each element type belongs to specific lane types:

| Lane type | Elements allowed | What it represents |
|---|---|---|
| `ACTOR` | SCREEN, PROCESSOR | Who or what initiates — a human via a screen, or a system via a processor |
| `INTERACTION` | COMMAND, QUERY | The business intent going in (COMMAND), or the query result coming out (QUERY) |
| `EVENT` | EVENT | The business fact recorded — which system/entity's own story this event belongs to |
| `INTEGRATION` | EVENT, QUERY | Optional. Facts and views of external systems |
| `SPEC` | SCENARIOS, NOTES | The Given/When/Then scenarios and notes of the slice. At most one element per Cell |

The lane types and what they take are also in `GET /api/model/rules`. This table is only "what belongs where," not how to place it.

## Slices

A **slice** is a vertical band across all lanes that groups the elements of one piece of behaviour: the thinnest possible cut — one COMMAND's behaviour, or one QUERY's view, never combined. Slices communicate with each other only via events.

The board works out a slice's **type** from its elements, ignoring SCENARIOS and NOTES (a linked copy counts as its original's type). You never choose it:

```
state change = SCREEN? → COMMAND → EVENT(s)                    only Screen, Command and Event, at least a Command and an Event
state read   = QUERY → SCREEN (fed by EVENTs of earlier slices)  only Query and Screen, at least a Query
automation   = EVENT(s) → QUERY → PROCESSOR → COMMAND → EVENT  a Processor, a Command and an Event, no element in an Integration lane
translation  = as automation, with at least one element in an Integration lane
```

Anything else (and an empty slice) has no type. A slice never mixes a COMMAND and a QUERY outside an automation or translation: those are two different slice types (`state change` and `state read`), even when they belong to the same feature.

**A slice is named exactly like its Command, Query or Processor** (`Place Order`, `Order Summary`): the same text, case and spacing, never a broader "feature" name. An automation or translation slice may carry the Processor's name or its Command's. Never leave the default "New Slice".

## Elements

### EVENT
- Represents a business fact that already happened.
- Naming: past tense, business language.
  - Valid: `OrderPlaced`, `PaymentAuthorized`, `UserRegistered`
  - Invalid: `SidebarOpened`, `RequestCompleted`, `ApiCalled` — these describe machinery or UI state, not business facts
- Immutable — never modify or delete an event once created; a correction is a new event, not an edit.
- Contains only captured facts. No computed or derived values — those belong in a QUERY.

### COMMAND
- Represents business intent — what an actor wants to do.
- Can be rejected; only succeeds if its documented preconditions hold.
- Carries every piece of information its validation needs that isn't in the stream's prior events. That includes context such as the current time or date, the acting user and the tenant (fields marked `generated`). The decision never reads a clock or a session on its own.
- Naming: imperative, business language.
  - Valid: `PlaceOrder`, `ConfirmPayment`, `CancelSubscription`
  - Invalid: `LoadOrders`, `FetchData`, `OpenDialog` — these are queries or UI-only actions, not business intent
- Issued by exactly one SCREEN or PROCESSOR — never two: one inbound arrow, from a Screen or a Processor.
- Produces one or more EVENTs on success, or is rejected with no event.

### QUERY
- A projection built from events, shaped for a specific query.
- Naming: noun phrase, business language, named for the data — not the machinery that produces it.
  - Valid: `OrderSummary`, `InvoiceList`
  - Invalid: `OrderSummaryProjector`, `InvoiceListRepository` — implementation detail leaking into the model
- Optional — nothing requires a QUERY to exist for a COMMAND or a downstream consumer.
- Never drives COMMAND validation directly — a COMMAND is checked against its own documented preconditions, not a query.
- **List-shaped queries**: when the QUERY returns multiple rows (each row shaped by its fields), not a single projected record, give it one `list: true` field of type `object` holding the row's fields — a field's `list` flag, not a flag of the element. Every todo-list query (see Translation Chain below) is list-shaped; so is any other QUERY that naturally returns a set of rows (e.g. `ProductList`, `InvoiceList`).

### SCREEN
- Represents what a user sees and can act on.
- Naming: what a user would call it, not its internals.
  - Valid: `Dashboard`, `OrderOverviewPage`
  - Invalid: `OrderOverviewComponent`, `ProjectorView`

### PROCESSOR
- Represents an automated actor — a processor, scheduler, or system reacting to events.
- Has no fields of its own: it passes on the fields of the Query that feeds it (Query → Processor → Command).
- Naming: what it does, in business language.
  - Valid: `BillingScheduler`, `InventoryReserver`
  - Invalid: `OrderServiceHandler` — implementation-flavored, not a business actor's name

## Causality

- Every EVENT traces to the COMMAND that produced it.
- Every COMMAND traces to the SCREEN or PROCESSOR that issued it — exactly one.
- A process starts with a read (QUERY + SCREEN) or a PROCESSOR reacting to an existing EVENT — never with an unmotivated COMMAND.

## Roles

- Name Actor lanes (and the Screens and Processors in them) for a specific **human role** (Customer, Seller, Admin...) or **system actor** (Payment Gateway, Scheduler...) in domain language. No COMMAND may be attributed to a generic "User".
- Every COMMAND is issued by exactly one role/actor (the single-issuer rule above, from the roles' side).
- **Lane order (preferred):** when a Chapter has several Actor lanes, put the **system actors** (the lanes with PROCESSORs) on the **top** lanes and the human roles (the lanes with SCREENs) below them, closest to the Interaction lane. Place new Actor lanes accordingly; do not reorder existing lanes unasked.
- A human role needs at least one COMMAND and one QUERY — a role that never acts and never sees anything is decorative, not modeled.

## Field Lineage (Information Completeness)

Every field on every element has a known source: a same-named field on a connected upstream element, or `generated: true` where the information starts. Check it each time you add or rename a field (see the `element-fields` skill for how fields move along arrows). **A field with no source is a gap, not a detail to fill in later.**

## Connections Read Forward

Within a slice an arrow goes vertically between lanes (Screen → Command → Event, Query → Screen). Between slices it goes **forward to a later slice** — never backward (right-to-left). This is why elements that belong together — a SCREEN and the QUERY it shows, a SCREEN/PROCESSOR and the COMMAND it issues, a COMMAND and the EVENT it produces — should share a slice whenever possible: the moment they don't, a backward arrow becomes a real risk.

When an element's natural slice is already occupied by something else, add a new slice immediately before or after (whichever keeps every connection forward) rather than wiring across the gap. The allowed arrows and how to create them are in the `connections` skill.

## Updating a Query That Already Feeds a Screen

A later EVENT sometimes needs to change data an earlier QUERY already shows on a SCREEN — e.g. a cancellation affecting an "active items" view placed several slices earlier. Wiring that later EVENT straight back into the existing QUERY is never the fix: it's a backward arrow (see Connections Read Forward).

Instead, add a **new QUERY** in a slice **immediately after** the later EVENT's slice, with a matching SCREEN there (same name as the earlier one, showing the updated data). Connect the later EVENT forward into the new QUERY: the arrow copies the Event's fields into it, and the rest of the QUERY's fields are the ones the view needs. It is a normal QUERY, not a linked copy: a linked copy shows its original unchanged and cannot be edited, so use one only where the later point shows the same data unchanged. The new SCREEN is a normal Screen with its own mockup. Leave the earlier QUERY and SCREEN exactly as they are — they're still what that earlier point in the timeline correctly showed. Never delete them.

## Linked Copies

A **linked copy** (`copyOf` the id of its original) is an element of the same type that mirrors another element elsewhere on the board — in another slice or Chapter. Any element except Scenarios and Notes can be copied; a copy of a copy is a copy of the original. **Arrows stay within one Chapter** (a recommendation, not enforced): to depend on an element of another Chapter, place a linked copy of it in this Chapter and connect the copy; never draw the arrow across Chapters (see `connections`, "Across Chapters"). Reuse a fact like this: never place an element that repeats another lane's already-recorded fact under its own unlinked identity — either connect forward to the original, or make a linked copy. The one exception is a translation chain's own internal EVENT (see Translation Chain below): it is a genuine new domain fact recorded in this side's own language, not a copy, even when it shares the external EVENT's name.

To make one: `POST /elements` with `{ slice, lane, copyOf }` (the lane must take the original's type), then connect it to its own neighbors normally (the `connections` skill).

A linked copy shows its original's type and content (name, fields, mockup) **live** and **cannot be changed**: only `slice`, `lane` and `x`; any other change is refused (409) and must be made on the original. It gets no fields from arrows, but its original's fields pass on along its arrows. So a copy never diverges from its original: a view that must show changed data is a new element (see Updating a Query That Already Feeds a Screen).

**Scenarios are always added to the original, never to a copy.** A scenario can only choose an Event or Command that is not a copy and sits in the same Chapter as its Scenarios element. The `scenarios` skill carries the step-by-step.

Deleting the original deletes all its copies, its arrows and the scenarios that use it: never delete an original that has copies without asking the user first.

## Translation Chain

A PROCESSOR reacting to an event from another system — external (a webhook/API, an element in an Integration lane) or another team's own timeline — needs a two-stage shape, never a direct reaction:

```
external EVENT → todo-list QUERY → translation PROCESSOR → COMMAND → internal EVENT → worker PROCESSOR's own todo-list QUERY
```

- The external/other-team EVENT feeds only a *translation* processor's todo list — never a *worker* processor's todo list directly.
- A translation processor's own todo list is opened by that external event and is never closed — it doesn't track "done," it only relays.
- Its resulting COMMAND produces the internal EVENT the domain actually works with — that's the moment external data becomes a business fact in this domain's own language, ready for a worker processor (or anything else) to react to. Decide explicitly how the external payload's raw fields map to the internal EVENT's domain fields (correlation, idempotency, duplicate handling).

Every PROCESSOR, translation or worker, needs its own todo-list QUERY (opened by triggering events, closed by completion events: EVENT → QUERY arrows) — no "pure relay" exemption. A todo-list QUERY is list-shaped (see QUERY above). A slice with a PROCESSOR, a COMMAND, an EVENT and an element in an Integration lane is a `translation` slice (see Slices).

## Open Questions vs. Decided Failures

Two different things are easy to conflate, and conflating them corrupts completeness checking:

- **Open question** — something genuinely undecided. Post it as a comment on the relevant element, worded as a question. There is no separate question type — it stays open (unresolved) until someone actually answers it, resolving means answering, not deleting the comment.
- **Decided failure** — a rejection or error case whose behavior is already decided (e.g. "payment fails → reject, no event"). Model it as a scenario with an `error` text and no Then Events (the `scenarios` skill), never as a comment. It's permanent, specified behavior, not something waiting on an answer.

A decided failure left as a lingering, unresolved question comment looks unresolved when it isn't. When counting completeness, only a genuinely unanswered question comment counts as a gap — a decided failure path needs its scenario with an `error`, not a comment standing in for one.

## Info and Notes

`info` (Markdown on a Chapter, lane, slice or element) is reserved mainly for implementation details: formats, limits, integrations, technical constraints. Do not use it for source citations, summaries or traceability. A summary, an open question or a remark for the reader goes in a Notes element (Spec lane, one per Cell).

## Offline-First Thinking

Model the business process as it would work without any software first, then translate to elements:

- How would this work manually, with people, on paper?
- Who acts, and what triggers each action?
- What information do they need before they can act?

Question any step that exists only because of the system — a loading spinner, a cache refresh, a session check is not a business step and does not belong on the timeline. This is the discipline behind the Anti-Patterns below; the anti-patterns are what it looks like when this principle is skipped.

## Concrete Over Generic

Looking at the model, a reader must understand how the business works. Model one real flow with real examples and real data, not a generic model that covers every case. This applies to generic platforms too: model one real case the platform handles, not the platform's own structure.

Example (a template-driven health record system):
- ❌ `Commit Composition` with fields `content`, or `name`/`category`/`entries` — still says nothing about the business.
- ✅ `Record Blood Pressure` → `Blood Pressure Recorded` with `systolic: 132`, `diastolic: 92`, `pulse: 113`, `composer: Dr. Marcus Johnson`.

## Anti-Patterns

- **Data-loading commands**: `LoadOrders`/`FetchData` are queries, not business intent — model as a QUERY, not a COMMAND.
- **UI-interaction events**: `SidebarOpened`/`ButtonClicked` are UI state, not business facts — don't model them unless the business genuinely cares.
- **Technical events**: `ApiCalled`/`ResponseReceived` describe machinery, not an outcome — find the business fact underneath.
- **Calculated events**: an event whose value is recomputed as source data changes (a running total, an average) is a QUERY, not an EVENT.

## Structural Shapes

Beyond the local anti-patterns above, four recurring **connection shapes** are worth checking whenever the model's arrows are visible — a fan-out or fan-in count crossing a rough threshold. Only one is a real anti-pattern regardless of context; the other three are **candidates** — worth checking against the business context, not automatically wrong. Reason about the actual events/fields/scenarios involved before flagging a candidate; if the domain justifies the count, it's not a violation. These are internal shorthand names for spotting the shape — never surface "bed", "left chair", "right chair", or "shelf" in anything shown to a business stakeholder (a comment, a report); describe the concern in plain terms instead.

- **The bed (real anti-pattern — always flag)** — one SCREEN wired to more than one COMMAND. A screen is where the user has already committed to one decision, so it should trigger exactly one command; wiring several to it means the choice is being made somewhere invisible to the model.
- **The left chair (candidate)** — one COMMAND resulting in more than two EVENTs. May mean the command is doing more than one job, or it may be a single business outcome that legitimately fans out. Check whether the outcomes always happen together or could happen independently before treating it as a concern.
- **The right chair (candidate)** — one QUERY built from more than three EVENTs. May mean the view is answering more than one question at once, or it may be one coherent picture that genuinely needs that many sources. Check whether the fields shown belong to a single thing the user is checking before treating it as a concern.
- **The shelf (candidate)** — one slice with noticeably more scenarios than the others in the Chapter (a rough outlier, not a fixed threshold — compare against the typical count for that Chapter). May mean the step is quietly covering ground that belongs to a separate step, or it may just be genuinely more complex. Check what the extra scenarios actually cover before treating it as a concern.

## Flow & Causality

Model causality, not strict sequence:

- A Chapter starts with a **state read** slice (a QUERY feeding a SCREEN) or an **automation** reacting to an EVENT already on the board — never with an unmotivated COMMAND.
- Every COMMAND must be traceable to a trigger: a SCREEN (a user decision) or a PROCESSOR (a system reaction).
- A `state change` slice must not follow another `state change` slice without a trigger in between (a new SCREEN or PROCESSOR) — two COMMANDs in a row with nothing issuing the second one is a gap, not a shortcut.

Valid transitions between slices (types as in Slices; a `translation` slice follows the rules of `automation`):
- state read → state change
- state change → state read
- state change → automation
- automation → state change
- automation → state read

## Quick Self-Check

Before treating a model as done, verify:

- [ ] Every EVENT is past tense and describes a business fact, not machinery or UI state
- [ ] Every COMMAND is imperative business intent, not a data-loading query
- [ ] Every QUERY is named for its data, not its implementation
- [ ] No EVENT holds a computed/aggregated value — that belongs in a QUERY
- [ ] Every COMMAND has exactly one issuer (one inbound arrow from a SCREEN or PROCESSOR)
- [ ] Every COMMAND traces back to a SCREEN (user decision) or PROCESSOR (system reaction)
- [ ] The Chapter starts with a state read or an automation reacting to an event — not a bare COMMAND
- [ ] No two `state change` slices are chained without a new trigger between them
- [ ] No SCREEN is wired to more than one COMMAND (the bed — see Structural Shapes)
- [ ] The model follows one real flow with real data, not a generic one (see Concrete Over Generic)
- [ ] Every field has a source (see Field Lineage)
