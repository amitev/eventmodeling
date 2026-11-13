---
name: model-check
description: Read-only API script check for rules, gaps, candidates, slice boundaries/names and Event dependencies. Use after model changes or before review to check gaps, consistency, a Chapter, slices or dependencies.
---

# Model Check

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` first. **Read-only technical pass:** script reads model and prints findings; never re-derive its checks by reading model yourself. Business/product-owner questions: `wdyt`.

## Run

```
node .claude/skills/model-check/check.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] [--dependencies]
```

- Run from repository root with server running; `--base` overrides default `http://localhost:3300`.
- Default: all Chapters. `--context`/`--chapter` filter **reports only**; reads whole model to resolve cross-Chapter originals.
- Output: counts, then one line per finding, rules first:
  `[KIND] Chapter > Slice: TYPE "Name" (id) - message`
- `--dependencies`: append one line per slice with produced Events and dependencies on other slices' Events (below).

## What the kinds mean

| Kind | Meaning | What to do |
|---|---|---|
| `RULE` | Command with >1 issuer; Screen triggering >1 Command; backward arrow to earlier slice; slice with >1 Command or Processor, >1 Read Model without Processor, or Command + Read Model without Processor. Confirmed independent duplicates of the same Read Model/Screen definition are also violations (semantic review below, not inferred by script) | Report; fix only when asked. Cardinality violation: propose split below |
| `GAP` | Missing name/connection/fields/field source/mockup; empty or untyped slice; Command without issuer/Event/scenario; Event without producing Command; Read Model without feeding Events or consumers; Processor without todo-list Read Model/Command; scenario without When/outcome; empty Scenarios container; example key absent from element's fields; "New Slice" | Report; ask before filling, never invent content |
| `CANDIDATE` | Command with >2 Events; Read Model built from >3 Events; disproportionately many scenarios; query/UI-like Command name; duplicate type/name (requires identity review below); Then Event not produced by When; **cross-Chapter arrow** (prefer local copy: `connections`, Across Chapters); slice name differing from Command/Read Model/Processor (ignores case/spacing; automation may use Processor or Command name) | Judge business context first (`eventmodeling-core-rules`, Structural Shapes); drop domain-justified candidates, but never dismiss duplicate views merely as refreshed data |

## Required duplicate-definition review

The script reports matching names as `CANDIDATE`, because names alone cannot establish business identity. This is not permission to leave confirmed duplicate definitions.

1. For each duplicate Read Model/Screen candidate, read the originals via API and compare the business query/interaction, fields, `isList`, `info` and Screen content. Resolve existing `copyOf` links before comparing. This semantic review supplements the script; do not repeat its structural checks.
2. If independent elements describe the same view or interaction, report a **confirmed `RULE` violation**: later appearances must use `copyOf` referencing one canonical original. Creating, updating or deleting result rows, later timeline positions, and "refreshed snapshots" are **not exceptions**. Assess Read Models and Screens separately.
3. If definitions genuinely differ, explain the business distinction and retain independent originals. Ask when evidence does not settle identity; do not guess from names or identical field shapes alone.
4. Report script counts unchanged, with semantic confirmations separately so an unchanged script result is not misrepresented as automated enforcement.
5. Propose a canonical original and later linked copies with forward arrows. **Never convert/delete existing elements unasked**; approved repairs follow `edit-and-delete`, `slice-modeler` and `connections`, then rerun the check and verify `copyOf`.

## Slices and dependencies

A slice is one Command, one Read Model, or one Processor with its Events, Read Model and Command (`eventmodeling-core-rules`, Slices). Linked copies count as elements; cardinality violations are `RULE`s above.

- **Naming:** exact Command/Read Model/Processor name; automation: Processor or Command. Checker ignores case/spacing (`Place order` matches `Place Order`), not permission to change spelling.
- **Split:** propose destination slices, element moves and order; **ask before moving anything**. Approved: `chapter-setup` creates slices with `after`; `edit-and-delete` moves via PATCH `slice` + `lane` (arrows stay, none added; at most one Spec element per Cell). Build missing parts with `slice-modeler`; recheck Chapter.
- **Dependencies:** only through Events, never direct/shared state. Read Model: other slices' feeding Events (arrows). Command: other slices' Events named in scenario Givens. Report `--dependencies` in chat as "X depends on the Events of Y"; **never write to board**.
- **Omitted distant-copy arrows:** apply `eventmodeling-core-rules`; an eligible omitted Event → Read Model copy arrow is not a gap by itself. Arrow-based dependency output cannot show omitted dependencies; report this limit, never invent the missing sources.
- Patterns/template/example: `reference/patterns.md`, `reference/example.md`.

## Limits (the script does not check)

- No naming-quality judgment (tense, business language, implementation names); check manually against core rules.
- No semantic duplicate-identity judgment: matching names remain script candidates; the mandatory review above confirms violations. Linked copies are definitions reused across occurrences, not frozen result snapshots.
- No scenario-value validation (only example **keys** against fields), mockup-content check or flow-start trigger check.
- No check of Read Model `isList` against query behavior or outer-list field wrappers; inspect element/Chapter content (original for copies) and verify manually against `eventmodeling-core-rules`. Report conflicts; never silently change flags.
- Field sources matched by name only: top-level + list row fields. Existing cross-Chapter arrows are followed for this check despite candidate status.
- Source checks cover only Command/Event/Read Model. Flow-start fields (e.g. Screen input) may legitimately lack upstream source; mark system-created fields `generated`.

## After the run

1. Briefly report counts, then findings by Chapter/slice, rules first; explicitly say when none.
2. **Never fix unasked.** Offer: names/structure/lanes/slices → `chapter-setup`; elements/arrows → `slice-modeler`, `connections`; fields/sources → `element-fields`; mockups → `html-screen`; scenarios → `scenarios`.
3. After approved fix, rerun with `--chapter`; confirm finding gone.
4. Script error `GET ... -> status` names failed request; check `--base` and server availability.
