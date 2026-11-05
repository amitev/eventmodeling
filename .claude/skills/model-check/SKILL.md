---
name: model-check
description: Read-only quality check of the model — runs a bundled script that reads the model through the server API and prints only the findings (rule violations, gaps, candidates). Use after building or changing the model, before a review, or for "check the model", "what is missing", "is this consistent", "validate the chapter".
---

# Model Check

Read `eventmodeling-core-rules` first (the rules the findings refer to). The check changes **nothing** and costs few tokens: the script does the reading and prints only findings. Do not re-derive its checks by reading the model yourself.

For business questions to the product owner use `wdyt` instead. This skill is the technical pass.

## Run

```
node .claude/skills/model-check/check.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>]
```

- Run it from the repository root. The server must be running (default base `http://localhost:3300`; use `--base` for another port).
- Without options it checks every Chapter. `--context` or `--chapter` limits what is **reported**; the whole model is still read, because arrows and linked copies cross Chapters.
- Output: a count line, then one line per finding, rules first:
  `[KIND] Chapter > Slice: TYPE "Name" (id) - message`

## What the kinds mean

| Kind | Meaning | What to do |
|---|---|---|
| `RULE` | Breaks a modelling rule: a Command with more than one issuer, a Screen that triggers more than one Command, an arrow that goes backward to an earlier slice | Report it; fix only when asked |
| `GAP` | Something missing: no name, not connected, no fields, a field with no source, no mockup, an empty slice or a slice with no type, a Command with no issuer / no Event / no scenario, an Event no Command produces, a Query no Event feeds or that feeds nothing, a Processor without a todo-list Query or Command, a scenario with no When / no outcome, a Scenarios element with no scenarios, a scenario example with a key that is not a field of its element, the default name "New Slice" | Report it; ask before filling it, never invent content |
| `CANDIDATE` | Worth a look, not necessarily wrong: a Command with more than two Events, a Query built from more than three Events, a slice with many more scenarios than the others, a Command named like a query or UI action, a second element with the same name and type (should it be a linked copy?), a Then Event the When Command does not produce | Judge it against the business context first (see Structural Shapes in the core rules); drop it if the domain justifies it |

## Limits (the script does not check)

- Naming quality: Event tense, business language, implementation names. Read the names yourself against the core rules.
- Scenario example values against the fields (only that every example **key** is a field of its element is checked), mockup content, or whether a flow starts with a trigger.
- Arrows across Chapters are included in the arrow checks, but a field's source is compared by top-level name only.
- Fields that start a flow legitimately have no source (for example what a user enters on a Screen): only Command, Event and Query fields are checked for a source; mark the rest `generated` where the system creates them.

## After the run

1. Report to the user: the counts, then the findings grouped by Chapter and slice, rules first. Keep it short; when there are none, say so.
2. Do not fix findings on your own. Offer the fix with the skill that does it:
   - names, structure, lanes, slices → `chapter-setup`
   - missing elements and arrows → `slice-builder`, `connections`
   - fields and their sources → `element-fields`
   - missing mockup → `html-screen`
   - missing scenarios → `scenarios`
3. After a fix, run the check again for that Chapter (`--chapter`) to confirm the finding is gone.
4. A script error (`GET ... -> status`) names the request that failed: a wrong `--base` or a stopped server is the usual cause.
