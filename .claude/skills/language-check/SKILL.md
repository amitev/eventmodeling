---
name: language-check
description: Cross-Chapter and cross-Context consistency pass on the model's language — a bundled script finds the same or nearly the same names, Commands and Events with no shared subject, tense slips, and a field defined with different types on different elements; the agent then judges synonyms and writes a glossary (in chat and to a Markdown file). Use for "check the language", "find duplicates", "are we consistent", "build a glossary", "ubiquitous language". It proposes renames; changes go through `edit-and-delete`.
---

# Language Check

Read `eventmodeling-core-rules` first, and `naming` (the naming rules the findings refer to). To look things up in the model, use the `model-navigation` skill (cheap reads). `model-check` checks one Chapter at a time; this skill compares **all Chapters and Contexts**, which is where inconsistent language hides. The check changes **nothing**.

## Run

```
node .claude/skills/language-check/language.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] [--terms]
```

- Run it from the repository root. The server must be running (default base `http://localhost:3300`).
- Without options it reports every Chapter. `--context` or `--chapter` limits what is **reported**; every Chapter and Context is still compared with it.
- `--terms` adds a list of the words used in element and field names, with counts, kinds and Chapters: the raw material for a glossary.
- Output: a count line, one line per finding, then the terms:
  `[CANDIDATE] Chapter > Slice: TYPE "Name" (id) - message`

## What the findings mean

All are `CANDIDATE`: questions, not verdicts. Judge each against the business context, and drop it when the domain justifies it.

| Finding | Question to ask |
|---|---|
| The same type and name on two elements | One fact (use a linked copy of the first) or two different things (rename one)? |
| Nearly the same name (same type, small spelling difference) | The same concept spelled two ways? Which spelling wins? |
| A Command and the Event it produces share no subject word (`Place Order` → `Payment Received`) | A wrong arrow, a wrong name, or a legitimate different outcome? |
| An Event with no past-tense word in its name, or a Command that starts like one | Does the name follow the naming rules? (The word lists are approximate.) |
| A field with the same name but a different type or list-ness on different elements | One definition, or two concepts that need two names? |

## Synonyms and the glossary

The script cannot see synonyms (`Customer` / `Client` / `Buyer`). Judge them yourself:

1. Run with `--terms`. Look for words that name the same concept, words used in only one Chapter that a neighbouring Chapter spells differently, and field families (`customerId`, `clientId`).
2. Propose **one preferred term** per concept and the variants to retire, each with where it occurs. Never decide a business term yourself: when two terms could both be right, ask the user which one the business uses.
3. Write the glossary in chat **and** to a Markdown file, `docs/glossary.md` for one Context (`docs/glossary-<context>.md` when several are covered; create the folder if it is missing; do not overwrite a file the user wrote without asking). Tell the user the path. One table: `Term | Meaning | Also called (retire) | Where used`.

   Take meanings from the model and from the user; leave a meaning empty and mark it `to confirm` rather than inventing one.

## After the run

1. Report: the count, then the findings grouped by kind, each with the proposed action. Keep it short; with no findings, say so.
2. Do not rename on your own. Rename with `edit-and-delete` (a rename shows everywhere by id; a field rename is not propagated: `element-fields`), only after the user agrees.
3. A repeated fact becomes a linked copy: delete the duplicate and create the copy with `slice-modeler` / `edit-and-delete` only after the user agrees; the duplicate's arrows and scenarios are lost with it, so check them first.
4. After changes, run the check again.
5. A script error (`GET ... -> status`) names the failed request: a wrong `--base` or a stopped server is the usual cause.

## Limits

- Word lists (tense, irregular verbs) are English and approximate.
- Synonyms, business meaning and the right term are for the user.
- Only names and field definitions are compared: not mockup text or scenario descriptions.
