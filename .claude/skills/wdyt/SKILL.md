---
name: wdyt
description: Review all slices as a business analyst. Show questions/observations first; report findings only after agreement. Comments mark questions; canvas arrows also mark relationships.
disable-model-invocation: true
---

# WDYT — What Do You Think?

**API only:** [API reference](../em-board-api.md). Never read/write/delete `.event-modeling/` files, including `contexts.yaml`.

> **Before doing anything else**, ...

**Posting questions means chat-only reporting.**

## Step 1 — Gather inputs

Use requested **Context name**; ask only if absent.

## Step 2 — Load the model

Use `model-navigation`: `GET /api/model/outline` for Context id/name, then only needed Chapter content.

Chapter = lanes/slices/elements (`SCREEN`, `COMMAND`, `EVENT`, `READ_MODEL`, `PROCESSOR`, `SCENARIOS`, `NOTES`) + `connectsTo` arrows. First four have fields; `SCENARIOS` holds scenarios.

Track all slice titles/types, per-slice scenario counts (including zero), Event/Command/Read Model/Screen names and relationships.

## Step 3 — Analyse from a business perspective

Apply categories per slice, except I (whole graph). Ask short, direct business questions, ideally one sentence; prompt, never prescribe. Focus on production risks, user edge cases and unclear ownership. Skip inapplicable or clearly handled concerns; never force questions.

**Questions and summaries:** product-owner language, not developer terms.
- Never: "no error event", "no actor", "no spec", "not modelled", "no failure modelling", "command", "event", "read model", "actor", "spec", "slice", "GWT".
- Use: "What happens when this fails?", "Who does this?", "What do we expect when X?", "What does the user see?", "What if the user does Y?"

### Category A: Failure paths
- Command: **"Can this fail?"** Skip if error Event exists; domain expert supplies failure modes, never enumerate technical ones.
- Wired automation/external system: ask about nonresponse only if no scenario/error Event covers it.

### Category B: Duplicate / replay protection
- Only with evidence (natural key, uniqueness scenario, repeatable automation): can user submit twice in actual flow, or wired automation process same Event twice? Never invent duplicate-prevention requirements.

### Category C: Missing pre-conditions
- Preconditions true, enforced, visible? Invalid-state rejection (cancel shipped order)? Implied but absent lifecycle (created → active → suspended → deleted)?

### Category D: Missing read models / screens
- Flag only clear needs in current slice's graph: Command without wired Screen, Read Model feeding nothing. Never infer missing confirmation/list/success views from absence; later slices may not exist yet.

### Category E: Missing GWT scenarios
- Ground in actual fields: "What happens when a customer registers without a name?" No "missing spec"/"no specs"/"scenario" or technical GWT wording.
- No scenarios: **2–3 questions**: one happy-path, one/two field-supported edge cases. Happy path only: ask expected behavior for obvious edge case.

### Category F: Permissions and roles
- Who acts/is allowed? Acting on another's behalf intentional? Relevant company/team boundary?

### Category G: Time and ordering
- Order matters/out-of-order behavior? Implied deadline/timeout (invitation/session expiry, payment window)? Implied but absent scheduled/recurring Events?

### Category H: Data completeness
- Flag only data clearly required downstream in this model (e.g. displayed field absent from feeding Read Model).
- Never flag missing infrastructure fields: ids, timestamps, correlation ids, versions are implementation choices.
- Notifications (welcome email/verification/webhook): ask only if explicitly required but unwired; absence alone is insufficient.

### Category J: What happens here? (screens and their elements)

Unwired button, unstored field, result without next Screen, action without rule: ask **what happens, what's stored, what's next, which rules, example**. Explain requested example will become future GWT scenario.

### Category I: Structural shapes
Once after loading all slices: full graph + scenario counts. Use `eventmodeling-core-rules`, **Structural Shapes**, for definitions, thresholds and violation/candidate status.

Never flag candidates on count alone: inspect Events/fields/scenarios for multiple jobs; silently drop domain-justified counts. Never report internal shape names.

- **Bed: always flag assertively:** "This screen triggers several actions—should these be separate steps or buttons to make the choice clear?"
- If justified: **left chair:** "Do these outcomes always happen together, or independently?"; **right chair:** "Does this screen answer one question or several bundled together?"; **shelf:** "Does this step have more cases because it's more complex, or because some belong in another step?"

Comment on central element; arrow per Step 4.2 **only for concern about one specific edge**.

## Step 4

TODO

## Step 5 — Report back to the user

**With chat:** report = 4.0 message (count in text, questions in snippet); after answers, briefly state applied model changes. **Without chat:** after comments, summarize:

1. **Flows:** count + business-name list.
2. **Questions:** count.
3. **Visual annotations:** count + one line each.
4. **Themes:** business questions about failures, permissions, invalid input, etc.
5. **One concrete next step**, only for a clear, meaningful gap.

No meaningful questions: say so, no padding.

### Offer Tasks

Follow [Task capture](../em-board-api.md#task-capture).
