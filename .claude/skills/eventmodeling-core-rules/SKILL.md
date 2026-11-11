---
name: eventmodeling-core-rules
description: Shared rules for elements, naming, slices, flow and anti-patterns. Read upfront from other modeling skills (element-fields, scenarios, connections, wdyt, etc.) rather than repeating fundamentals. Not a standalone task.
---

# Event Modeling — Core Rules

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Applies to **every board task**. Read once per session; individual skills add task-specific rules.

## Modes

Request determines mode; **never mix in one pass**:
- **Modeling Mode** — building/changing (`html-screen`, `element-fields`, `connections`, `scenarios`): explore, capture process completely. Flag naming slips/incomplete preconditions and continue; don't stall or over-correct with a full audit.
- **Critic Mode** — reviewing (`wdyt`): apply every rule strictly; surface every violation/gap/inconsistency, even if model mostly works. Post comments; never silently fix/add missing structure unless asked.

## Lanes — What Lives Where

Top-to-bottom order below; multiple lanes per type allowed. **Retain ≥1 Actor, Interaction and Event lane per Chapter.**

| Lane type | Elements allowed | What it represents |
|---|---|---|
| `ACTOR` | SCREEN, PROCESSOR | Human via Screen or system via Processor initiates |
| `INTERACTION` | COMMAND, READ_MODEL | Incoming business intent or outgoing query result |
| `EVENT` | EVENT | Recorded fact in system/entity's own story |
| `INTEGRATION` | EVENT, READ_MODEL | Optional. Facts and views of external systems |
| `SPEC` | SCENARIOS, NOTES | Slice's GWT scenarios/notes; **at most one element per Cell** |

Types/allowed elements also in `GET /api/model/rules`; table defines membership, not placement.

### External systems

**One Integration lane per external system, named after it** (e.g. "Payment Provider", not generic "Integration" once multiple systems).
- Lane `info`: system identity/delivery (webhook, queue, polling, file), format, ordering, retention, authentication, limits. Implementation details only; slice Notes may add more.
- External Events/Read Models keep **source system's language/names/fields**, not this domain's. Element `info`: endpoint, payload source, example.
- Unknown details: **ask, never invent**; leave `info` empty until known.
- External Event reaches read models only after translation into internal Event (Translation Chain).

## Slices

A **slice** is a vertical band across all lanes: thinnest behavior cut, one Command or one Read Model view, never combined outside automation/translation. Slices communicate **only via Events**.

Board derives **type**, never user-selected; ignores SCENARIOS/NOTES, counts copies as original type:

```
state change = SCREEN? → COMMAND → EVENT(s)                    only Screen, Command and Event, at least a Command and an Event
state read   = READ_MODEL → SCREEN (fed by EVENTs of earlier slices)  only Read Model and Screen, at least a Read Model
automation   = EVENT(s) → READ_MODEL → PROCESSOR → COMMAND → EVENT  a Processor, a Command and an Event, no element in an Integration lane
translation  = as automation, with at least one element in an Integration lane
```

Anything else, including empty slice: no type.

**Automation layout** (also translation): Processor above in Actor lane; Read Model left, Command **right beside it in same Interaction lane**; Event **directly under Command** in Event lane (`slice-modeler`, Automation). Command + Read Model otherwise require separate state-change/state-read slices, even within one feature.

**Slice name = exact Command/Read Model/Processor name**, same text/case/spacing (`Place Order`, `Order Summary`), not broader feature. Automation/translation: Processor or Command name. Never "New Slice".

## Elements

### EVENT
- Past business fact; past-tense business name.
  - Valid: `OrderPlaced`, `PaymentAuthorized`, `UserRegistered`
  - Invalid: `SidebarOpened`, `RequestCompleted`, `ApiCalled` (machinery/UI state)
- **Immutable in Event Sourcing:** never modify/delete a recorded Event instance; correction = new Event.
- **Board Event element:** editable model definition, not a recorded instance. Its edits/deletes change the model, not event-store history; follow the task's confirmation rules.
- Captured facts only; computed/derived values belong in READ_MODEL.

### COMMAND
- Actor's business intent; reject unless documented preconditions hold.
- Carries **all validation inputs not in prior stream Events**, including current time/date, acting user, tenant (`generated`). **Decision never reads clock/session itself.**
- Imperative business name.
  - Valid: `PlaceOrder`, `ConfirmPayment`, `CancelSubscription`
  - Invalid: `LoadOrders`, `FetchData`, `OpenDialog` (read models/UI actions)
- **Exactly one SCREEN/PROCESSOR issuer**, one inbound arrow, never two.
- Success: ≥1 EVENT; rejection: no Event.

### READ_MODEL
- Event projection for specific query; business noun phrase naming data, not machinery.
  - Valid: `OrderSummary`, `InvoiceList`
  - Invalid: `OrderSummaryProjector`, `InvoiceListRepository` (implementation)
- Optional: Command/downstream consumer does not require one.
- **Never directly validates Command**; Command uses documented preconditions.
- **Rows:** one `list: true` `object` field containing row fields; `list` belongs to **field, not element**. All todo lists and other row sets (`ProductList`, `InvoiceList`) use this, unlike single records.

### SCREEN
- What user sees/acts on; user-facing name, not internals.
  - Valid: `Dashboard`, `OrderOverviewPage`
  - Invalid: `OrderOverviewComponent`, `ProjectorView`

### PROCESSOR
- Automated actor/scheduler/system reacting to Events; business name for what it does.
- **No own fields:** passes feeding Read Model fields through to Command.
  - Valid: `BillingScheduler`, `InventoryReserver`
  - Invalid: `OrderServiceHandler` (implementation, not business actor)

## Causality

- Every EVENT traces to producing COMMAND.
- Every COMMAND traces to exactly one issuing SCREEN/PROCESSOR.
- Start with read (READ_MODEL + SCREEN) or Processor reacting to existing Event, **never unmotivated Command**.

## Roles

- Actor lanes and their Screens/Processors name specific domain **human role** (Customer, Seller, Admin) or **system actor** (Payment Gateway, Scheduler), never generic "User" for Command attribution.
- Single-issuer rule applies to roles: exactly one role/actor per Command.
- **Preferred order:** system/Processor Actor lanes above human/Screen lanes, humans nearest Interaction. Add lanes accordingly; **never reorder existing lanes unasked**.
- Human role needs ≥1 Command **and** ≥1 Read Model; otherwise decorative.

## Field Lineage (Information Completeness)

Every field needs same-named connected upstream source or `generated: true` where information starts. Check every addition/rename (`element-fields`). **No source = gap, never deferred detail.**

## Connections Read Forward

Within slice: vertical between lanes (Screen → Command → Event, Read Model → Screen). Across slices: **forward to later slice, never right-to-left**. Keep related Screen/Read Model, issuer/Command and Command/Event in same slice when possible to avoid backward arrows.

Natural slice occupied: add slice immediately before/after, keeping **every arrow forward**, not wiring across gap. Allowed arrows/API: `connections`.

## Updating a Read Model That Already Feeds a Screen

Later Event changes earlier view (e.g. cancellation affecting "active items"): **never wire backward into old Read Model**.

Add **new normal Read Model + Screen immediately after later Event's slice**, same Screen name, updated data, own mockup. Connect Event forward; arrow copies Event fields, add remaining fields view needs. **Not linked copies:** copies show original unchanged; use copies only for unchanged data. **Leave old Read Model/Screen untouched; never delete them**: they correctly show earlier timeline state.

## Linked Copies

**Linked copy**: `copyOf` original id; same type, mirrors element in another slice/Chapter. All types except Scenarios/Notes; copy of copy resolves original.
- **Keep arrows within Chapter** (recommendation, not enforced): cross-Chapter dependency uses local copy, never direct arrow (`connections`, Across Chapters).
- Never duplicate another lane's recorded fact under unlinked identity: connect forward to original or use copy.
- **Exception:** translation's internal Event is genuinely new domain fact in local language, **not copy**, even if external Event has same name.

Create: `POST /elements` `{ slice, lane, copyOf }`; lane must accept original type; connect neighbors via `connections`.

Copy mirrors original type/name/fields/mockup **live**, never diverges. Only `slice`, `lane`, `x` editable; other changes: 409, edit original. Receives no arrow fields, passes original's fields onward. Changed view requires new normal element (previous section).

**Scenarios on originals only:** choose same-Chapter, non-copy Event/Command (`scenarios`).

Deleting original removes all copies, arrows, scenarios using it. **Ask before deleting original with copies.**

## Translation Chain

Processor reacting to external system (webhook/API, Integration lane) **or another team's timeline** needs two stages, never direct reaction:

```
external EVENT → todo-list READ_MODEL → translation PROCESSOR → COMMAND → internal EVENT → worker PROCESSOR's own todo-list READ_MODEL
```

- External/other-team Event feeds **translation todo list only**, never worker todo list directly.
- Translation todo opens on external Event and **never closes**: relay, not "done" tracker.
- Translation Command records internal domain-language Event for worker/other consumers. **Explicitly map raw external → internal fields**, including correlation, idempotency, duplicate handling.

**Every Processor needs own list-shaped todo Read Model; no pure-relay exemption.** Trigger Event → Read Model opens; completion Event → Read Model closes (translation never closes, above). Processor + Command + Event + Integration-lane element = translation slice.

## Open Questions vs. Decided Failures

- **Open question:** genuinely undecided; comment on relevant element, phrased as question. No separate question type. Stays unresolved until **answered, not deleted**.
- **Decided failure:** specified rejection/error (e.g. payment fails → reject, no Event); permanent scenario with `error` and no Then Events (`scenarios`), **never comment standing in for scenario**.
- Completeness: only genuinely unanswered question comments count as gaps; don't leave decided failures as unresolved questions.

## Info and Notes

`info`: Markdown on Chapter/lane/slice/element, mainly implementation details (formats, limits, integrations, technical constraints), **never citations/summaries/traceability**. Summaries, open questions, reader remarks go in Notes (Spec lane, one per Cell). Notes may also hold implementation details: read **both `info` and slice Notes**.

## Offline-First Thinking

Model manual process **before software**, then translate to elements:

- How would this work manually, with people, on paper?
- Who acts, and what triggers each action?
- What information do they need before they can act?

System-only steps (spinner, cache refresh, session check) are not business steps; exclude from timeline. See Anti-Patterns.

## Concrete Over Generic

Reader must understand business: model **one real flow with real examples/data**, not generic all-cases model. Even generic platforms: show one case handled, not platform structure.

Example (a template-driven health record system):
- ❌ `Commit Composition` with fields `content`, or `name`/`category`/`entries` — still says nothing about the business.
- ✅ `Record Blood Pressure` → `Blood Pressure Recorded` with `systolic: 132`, `diastolic: 92`, `pulse: 113`, `composer: Dr. Marcus Johnson`.

## Anti-Patterns

- **Data-loading commands:** `LoadOrders`/`FetchData` → READ_MODEL, not COMMAND.
- **UI events:** `SidebarOpened`/`ButtonClicked` are UI state; model only if business cares.
- **Technical events:** `ApiCalled`/`ResponseReceived` are machinery; find business outcome.
- **Calculated events:** values recomputed when sources change (running total, average) → READ_MODEL, not EVENT.

## Structural Shapes

Check these shapes when arrows are visible. Only **bed always violates**; others are **candidates, not count-based verdicts**. Inspect actual Events/fields/scenarios first; drop domain-justified candidates. **Never expose shape names to business stakeholders** in comments/reports; use plain business language.

| Internal name | Threshold / judgment |
|---|---|
| **Bed: always flag** | SCREEN → **>1 COMMAND**. Screen represents one committed decision; must trigger exactly one Command, not hide action choice |
| **Left chair: candidate** | COMMAND → **>2 EVENTs**. Multiple jobs or legitimate fan-out? Check whether outcomes always happen together or independently |
| **Right chair: candidate** | READ_MODEL built from **>3 EVENTs**. Multiple questions or coherent view? Check whether fields serve one user question |
| **Shelf: candidate** | Slice scenario count noticeably above Chapter's typical count; **rough outlier, no fixed threshold**. Check extra cases for separate behavior vs genuine complexity |

## Flow & Causality

**Causality, not strict sequence:** Chapter starts with state read (Read Model → Screen) or automation reacting to Event already on board, never bare Command. Every Command has Screen/Processor trigger. Consecutive state changes require **new Screen/Processor trigger**; unissued second Command = gap.

Valid slice transitions (`translation` follows `automation` rules):
- state read → state change
- state change → state read
- state change → automation
- automation → state change
- automation → state read

## Quick Self-Check

Before done:

- [ ] EVENTs: past-tense business facts, not machinery/UI
- [ ] COMMANDs: imperative business intent, not loading queries
- [ ] READ_MODELs: data names, not implementation names
- [ ] Computed/aggregated values in READ_MODELs, never EVENTs
- [ ] Exactly one SCREEN/PROCESSOR issuer/inbound arrow per COMMAND
- [ ] Every COMMAND traces to user decision/system reaction
- [ ] Chapter starts state read/event-triggered automation, never bare COMMAND
- [ ] New trigger between consecutive state changes
- [ ] No SCREEN triggers >1 COMMAND
- [ ] One real flow with real data, not generic
- [ ] Every field has source (Field Lineage)
