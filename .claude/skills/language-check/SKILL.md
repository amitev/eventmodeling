---
name: language-check
description: Cross-Chapter/Context language check — script finds duplicate/near names, Command/Event subject mismatches, tense slips and field-type conflicts; judge synonyms and write glossary in chat and Markdown. Use for "check the language", "find duplicates", "are we consistent", "build a glossary", "ubiquitous language". Propose renames; approved changes use `edit-and-delete`.
---

# Language Check

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` and `naming` first; lookups: `model-navigation`. Unlike a Chapter-local `model-check` pass, compare **all Chapters and Contexts**. Check changes **nothing**.

## Run

```
node .claude/skills/language-check/language.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] [--terms]
```

- Run from repository root with server running; default base `http://localhost:3300`.
- Default: report all Chapters. `--context`/`--chapter` filter **reports only**; comparisons still span every Chapter/Context.
- `--terms`: glossary input, words in element/field names with counts, kinds, Chapters.
- Output: counts, one line per finding, then terms:
  `[CANDIDATE] Chapter > Slice: TYPE "Name" (id) - message`

## What the findings mean

All `CANDIDATE`: questions, not verdicts. Judge business context; drop domain-justified findings.

| Finding | Question to ask |
|---|---|
| Same type/name on two elements | One fact (linked copy) or different things (rename one)? |
| Same type, near-identical spelling | Same concept? Which spelling wins? |
| Command/output Event share no subject (`Place Order` → `Payment Received`) | Wrong arrow/name or legitimate different outcome? |
| Event lacks past-tense word, or Command starts with one | Correct tense? Word lists are approximate |
| Same-named field with different type/list-ness | One definition, or two concepts needing distinct names? |

## Synonyms and the glossary

Script cannot detect synonyms (`Customer` / `Client` / `Buyer`); judge manually:

1. Run `--terms`; find same-concept words, spelling differences between neighbouring Chapters, field families (`customerId`, `clientId`).
2. Propose **one preferred term** per concept, variants to retire and occurrence locations. Never decide business terminology yourself: multiple valid terms → ask which business uses.
3. Write in **chat and Markdown**: `docs/glossary.md` for one Context; `docs/glossary-<context>.md` when several. Create folder if missing; **ask before overwriting user-written files**. Report path.
4. Table: `Term | Meaning | Also called (retire) | Where used`. Meanings from model/user only; unknown: leave empty, mark `to confirm`, never invent.

## After the run

1. Briefly report count, findings by kind and proposed actions; explicitly say when none.
2. **Rename only after approval**, via `edit-and-delete`. Element rename shows everywhere by id; field rename does not propagate (`element-fields`).
3. Duplicate fact → linked copy: inspect arrows/scenarios first (deletion loses them); **get approval** before delete/recreate via `slice-modeler` / `edit-and-delete`.
4. Rerun after changes.
5. Script error `GET ... -> status` names failed request; check `--base` and server availability.

## Limits

- Tense/irregular-verb word lists: English, approximate.
- User decides synonyms, business meaning and preferred terms.
- Compares names/field definitions only, not mockup text or scenario descriptions.
