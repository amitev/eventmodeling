---
name: wdyt
description: Business-analyst review of all slices; show questions/observations first, report when user agrees. Comments carry questions; canvas arrows additionally mark relational findings.
---

# WDYT — What Do You Think?

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

> **Before doing anything else**, ...

**Posting questions means chat-only reporting.**

## Step 1 — Gather inputs

Use requested **Context name** (e.g. `Registration`, `Orders`); ask only if absent.

## Step 2 — Load the model

Find Context id/name via `GET /api/model/outline`; Chapter content via API reference. **Never direct model reads, even `contexts.yaml`.** Use `model-navigation`: outline first, needed content only.

Chapter = lanes/slices/elements (`SCREEN`, `COMMAND`, `EVENT`, `READ_MODEL`, `PROCESSOR`, `SCENARIOS`, `NOTES`) + `connectsTo` arrows. First four have fields; `SCENARIOS` holds scenarios.

Track **all** slice titles/types, presence/absence of GWT scenarios, Event/Command/Read Model/Screen names, edges/relationships and per-slice scenario counts.

## Step 3 — Analyse from a business perspective

Apply categories per slice, except I (whole graph). **Specific questions, no filler; skip inapplicable questions.**

**Business language in every question/summary theme**, product manager to stakeholder, not developer:
- **Never:** "no error event", "no actor", "no spec", "not modelled", "no failure modelling", "command", "event", "read model", "actor", "spec", "slice", "GWT".
- **Use:** "what happens when this fails?", "who does this?", "what do we expect when X?", "what does the user see?", "what if the user does Y?"

### Category A: Failure paths
- **"Can this fail?"** on Command; existing error Event: skip. Never enumerate technical failure modes; domain expert answers.
- Wired automation/external system: ask about nonresponse **only if not covered** by scenario/error Event.
- Short, open, one sentence; prompt, never prescribe.

### Category B: Duplicate / replay protection
- Raise only with concrete evidence: natural key, uniqueness scenario, repeatable automation. **Never invent duplicate-prevention requirements.**
- Can user submit twice in actual flow (submit button/no confirmation)?
- Can wired automation process same Event twice?

### Category C: Missing pre-conditions
- Preconditions: true, enforced, visible?
- Rejection states (cancel already-shipped order)?
- Implied but absent lifecycle (created → active → suspended → deleted)?

### Category D: Missing read models / screens
- Flag only **clearly needed within current slice's graph**: Command with no wired Screen, Read Model feeding nothing.
- **Never infer missing confirmation/list/success views** merely from absence here; later slices may not exist yet.

### Category E: Missing GWT scenarios
- Ground in actual fields: **"What happens when a customer registers without a name?"**, never "missing spec"/"no specs" or technical GWT wording.
- No scenarios: **2–3 questions**, one happy-path, one/two field-supported edge cases.
- Happy path only: ask expected behavior for obvious edge case, without "spec"/"scenario".

### Category F: Permissions and roles
- "Who does this?" / "Who is allowed?", never "no actor is modelled".
- Acting on another's behalf: intentional?
- Relevant company/team boundary?

### Category G: Time and ordering
- Does order matter; what if out of order?
- Implied timeout/deadline (invitation/session expiry, payment window)?
- Implied but absent scheduled/recurring Events?

### Category H: Data completeness
- Only flag data **clearly required by downstream element in this model**, e.g. displayed field absent from feeding Read Model.
- **Never missing infrastructure fields:** ids, timestamps, correlation ids, versions are implementation choices.
- Notifications (welcome email/verification/webhook): ask **only if explicitly required but unwired**, not merely absent; may belong elsewhere/not yet built.

### Category J: What happens here? (screens and their elements)

Unwired button, unstored field, result without next Screen, action without rule: ask **what happens, what's stored, what's next, which rules, example**. Explain requested example will become future GWT scenario.

### Category I: Structural shapes
**Once after loading all slices**, not per-slice: full graph + scenario counts. Read `eventmodeling-core-rules`, **Structural Shapes**, for bed/left chair/right chair/shelf definitions, thresholds and violation-vs-candidate status.

**Never flag candidate on count alone.** Inspect Events/fields/scenarios for multiple jobs; drop domain-justified counts silently. Report business questions, **never internal shape names**.

- **Bed: always flag assertively**, not maybe: "This screen triggers several actions—should these be separate steps or buttons to make the choice clear?"
- **Left chair**, if justified: "Do these outcomes always happen together, or independently?"
- **Right chair**, if justified: "Does this screen answer one question or several bundled together?"
- **Shelf**, if justified: "Does this step have more cases because it's more complex, or because some belong in another step?"

Comment on central element; arrow per Step 4.2 **only for concern about one specific edge**.

## Step 4

TODO

## Step 5 — Report back to the user

**With chat:** report = 4.0 message (count in text, questions in snippet); after answers, one short message stating applied model changes. **Without chat:** after comments, concise summary:

1. **Flows:** count + business-name list.
2. **Questions:** count; **zero valid, never force**.
3. **Visual annotations:** count + one line each (e.g. "arrow from OrderPlaced to ShipOrder—unclear if it always fires").
4. **Themes as business questions**, not modeling observations: registration failure, who may register customers, invalid input expectations; never "No failure modelling"/"No specs"/"No actor on command".
5. **One concrete next step**, only for clear meaningful gap.

Keep tight; no meaningful questions → say so, no padding.


## Persona reminders

- **Curious/direct:** "What happens when X fails?", not vague "I wonder".
- Production-breakage mindset: double submits, user edge cases, unclear ownership.
- **Not exhaustive:** genuine uncertainty only; zero questions valid.
- Never second-guess intentional, clearly handled design.
- Short questions; ideally one sentence/comment.
- **Always business language** for product owner: "this action", "this step", "what user sees", "who does this", "what do we expect"; never developer terms banned above.
