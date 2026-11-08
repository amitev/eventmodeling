---
name: model-check
description: Read-only quality check of the model — runs a bundled script that reads the model through the server API and prints only the findings (rule violations, gaps, candidates), checks slice boundaries and names, and reports the event dependencies between slices. Use after building or changing the model, before a review, or for "check the model", "what is missing", "is this consistent", "validate the chapter", "review the slices", "what does this slice depend on".
---

# Model Check

Read `eventmodeling-core-rules` first (the rules the findings refer to). The check changes **nothing** and costs few tokens: the script does the reading and prints only findings. Do not re-derive its checks by reading the model yourself.

For business questions to the product owner use `wdyt` instead. This skill is the technical pass.

## Run

```
node .claude/skills/model-check/check.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] [--dependencies]
```

- Run it from the repository root. The server must be running (default base `http://localhost:3300`; use `--base` for another port).
- Without options it checks every Chapter. `--context` or `--chapter` limits what is **reported**; the whole model is still read, because linked copies point to originals in other Chapters.
- Output: a count line, then one line per finding, rules first:
  `[KIND] Chapter > Slice: TYPE "Name" (id) - message`
- `--dependencies` adds, after the findings, one line per slice: the Events it produces and the Events of other slices it depends on (see Slices and dependencies).

## What the kinds mean

| Kind | Meaning | What to do |
|---|---|---|
| `RULE` | Breaks a modelling rule: a Command with more than one issuer, a Screen that triggers more than one Command, an arrow that goes backward to an earlier slice, a slice with more than one Command, Processor or (without a Processor) Query, or one that mixes a Command and a Query without a Processor | Report it; fix only when asked. A slice that breaks the one-element rule: propose a split (see Slices and dependencies) |
| `GAP` | Something missing: no name, not connected, no fields, a field with no source, no mockup, an empty slice or a slice with no type, a Command with no issuer / no Event / no scenario, an Event no Command produces, a Query no Event feeds or that feeds nothing, a Processor without a todo-list Query or Command, a scenario with no When / no outcome, a Scenarios element with no scenarios, a scenario example with a key that is not a field of its element, the default name "New Slice" | Report it; ask before filling it, never invent content |
| `CANDIDATE` | Worth a look, not necessarily wrong: a Command with more than two Events, a Query built from more than three Events, a slice with many more scenarios than the others, a Command named like a query or UI action, a second element with the same name and type (should it be a linked copy?), a Then Event the When Command does not produce, an **arrow that crosses Chapters** (recommended: a linked copy in the same Chapter instead, `connections` "Across Chapters"), a slice whose name differs from its Command, Query or Processor (case and spacing are ignored; an automation slice may carry the Processor's or its Command's name) | Judge it against the business context first (see Structural Shapes in the core rules); drop it if the domain justifies it |

## Slices and dependencies

A slice is one Command, one Query, or one Processor with its Events, Query and Command (the core rules, Slices). The check flags a slice that has more than one Command or Processor, more than one Query without a Processor, or a Command and a Query without a Processor. A linked copy counts like any element.

- **Naming:** name a slice exactly like its Command, Query or Processor (`Place Order`); an automation slice may carry the Processor's name or its Command's. The check ignores case and spacing, so `Place order` matches `Place Order`.
- **Splitting:** the skill proposes, the user decides. Describe the proposed new slices (which elements move to which new slice, in which order) and **ask before moving anything**. After a yes: `chapter-setup` creates the slice (`after` the right one), `edit-and-delete` moves each element (`PATCH` with `slice` and `lane`: arrows stay, none are added, a Cell holds at most one Spec element). Build a missing part with `slice-modeler`, then run the check again for the Chapter.
- **Dependencies:** slices depend on each other only through Events, never directly or through shared state. A Query depends on the Events that feed it from another slice (arrows). A Command depends on the Events the Given entries of its scenarios name when they come from another slice. `--dependencies` prints that per slice; report it in chat as "X depends on the Events of Y". Do not write it to the board.
- Patterns, a description template and a worked example are in `reference/patterns.md` and `reference/example.md`.

## Limits (the script does not check)

- Naming quality: Event tense, business language, implementation names. Read the names yourself against the core rules.
- Scenario example values against the fields (only that every example **key** is a field of its element is checked), mockup content, or whether a flow starts with a trigger.
- A field's source is compared by name only (top-level, and the row fields of a list field). Arrows across Chapters are reported as candidates; where one exists it is still followed for the source check.
- Fields that start a flow legitimately have no source (for example what a user enters on a Screen): only Command, Event and Query fields are checked for a source; mark the rest `generated` where the system creates them.

## After the run

1. Report to the user: the counts, then the findings grouped by Chapter and slice, rules first. Keep it short; when there are none, say so.
2. Do not fix findings on your own. Offer the fix with the skill that does it:
   - names, structure, lanes, slices → `chapter-setup`
   - missing elements and arrows → `slice-modeler`, `connections`
   - fields and their sources → `element-fields`
   - missing mockup → `html-screen`
   - missing scenarios → `scenarios`
3. After a fix, run the check again for that Chapter (`--chapter`) to confirm the finding is gone.
4. A script error (`GET ... -> status`) names the request that failed: a wrong `--base` or a stopped server is the usual cause.
