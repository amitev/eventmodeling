---
name: walkthrough
description: Give a read-only, slice-by-slice explanation of an existing feature or map the impact of a planned change. Use for "how does X work?", "walk me through X" or "what would change if X?". Never edits the board.
disable-model-invocation: true
---

# Walkthrough

**Model access:** API only ([../api.md](../api.md)). Never read or edit files in `.event-modeling/`. Read `eventmodeling-core-rules` once per session; use `model-navigation` for lookups. Report in chat as Markdown, one step per slice. This board has no shareable slice deep link: give the Context, Chapter and slice names; never invent a URL or promise to zoom the board.

## 1. Choose mode and scope

- **Explain:** describe a flow already modeled as intended, in the order a person experiences it.
- **Impact:** describe what a proposed or planned feature/change would use, adjust or add. A feature described as new or planned is impact mode even if phrased as "how does X work?" If it is unclear whether the person means current behavior or a proposed change, ask.

Use the subject named by the person. If there is no subject, ask what flow or planned change they mean; do not guess from the open board or selection. If names match several Contexts or Chapters, ask which one.

1. Read `GET /outline` (or its Context-filtered form) to find relevant Contexts, Chapters, slices, element names and arrows.
2. Read only the chosen Chapter or slices with `GET /chapters/:id?screenContent=false&slice=<sliceId>`; use `GET /elements/:id` only for needed element details. Read Scenarios and Notes for business rules and context; use element, slice or Chapter `info` only for relevant implementation details.
3. Use outline arrows and Event dependencies to follow the flow. Resolve linked copies with `model-navigation`. Do not treat arrows as proof of strict event order or business correctness.

Keep the scope to slices that explain the feature or are needed to understand its impact. Follow upstream for required inputs and downstream for affected Events, views, Screens and Processors. Do not include an unrelated Chapter just because it is nearby. If the flow spans more than about 20 slices, explain that it likely contains multiple features and ask which part to cover first.

## 2. Build the walkthrough

Start with a **1–3 sentence summary**. Then give **one step per slice**, ordered by the flow; never make separate steps for individual elements or scenarios.

In explain mode, include only slices needed to follow the requested behavior. In impact mode, include each relevant slice in flow order:

| Status | Meaning |
|---|---|
| `existing` | Needed to understand the change, but used as-is |
| `changed` | Exists but needs an adjustment; state it under Changes |
| `new` | Does not exist; present it as a proposal |

For every step, provide:

- **Slice:** the board's slice name and `Context > Chapter` location.
- **Lanes:** existing elements grouped by their actual lane and board name (Actor, Interaction, Event, Integration, Spec). Keep the slice as one unit.
- **What happens:** 1–3 business-language sentences explaining its role in the flow.
- **Rules:** only rules evidenced by Scenarios; Notes may add context. Preserve exact thresholds and outcomes. If a rule is not modeled, call it an open question, not a rule.
- **Changes:** impact mode only; concise, evidence-based adjustments to this slice.

For a `new` impact step, sketch a valid board slice using `eventmodeling-core-rules`:

- State change: optional Screen → one Command → resulting Event(s).
- State read: Read Model → Screen, fed by earlier Event(s).
- Automation: prior Event(s) → todo Read Model → Processor → Command → Event(s).
- Translation: follow the Translation Chain and name the external system only when known.

List proposed elements by lane, using business names and field names only when the request or existing model supports them. Mark assumptions and missing business decisions as open questions. Use `naming` for proposed names when needed. Do not create model elements, fields, scenarios, or Screen HTML; later work uses `slice-modeler`, `element-fields`, `scenarios`, `connections` or `html-screen`.

## 3. Report and check

Use this shape:

```markdown
## Summary
<1–3 sentences; in impact mode include counts of existing, changed and new slices>

## Walkthrough
### 1. <slice name> — <status, impact mode only>
**Location:** <Context> > <Chapter>
**Lanes:** Actor: ...; Interaction: ...; Event: ...
**What happens:** ...
**Rules:** ...
**Changes:** ...
```

Omit empty sections. In explain mode, omit statuses and Changes. For new slices, say **Proposed**; include the intended Context and Chapter if clear, but no nonexistent slice name, id or board link. Do not include ids as links: refer to existing board elements by name and location.

Before replying, check that:

- The step count matches the slices listed; every impact step has one of the three statuses.
- `changed` steps state their changes; `new` steps are clearly proposals.
- The summary agrees with the steps and status counts.
- No invented rule, field source, element, slice or deep link is presented as existing.

This skill is read-only. If the person asks to make the proposed changes, handle that as a separate task with the relevant modeling skills.
