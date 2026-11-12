---
name: pii-audit
description: Read-only script audit mapping `pii` fields across Screens/Commands/Events/Read Models; flags suspected unmarked PII, inconsistent flags and PII in Events. Use for "where does personal data go", "GDPR review", "check the PII flags", "which fields are personal". Never changes flags unasked.
---

# PII Audit

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` first; lookups: `model-navigation`. Audit changes **nothing**; script reads model and prints results. Never re-derive it by reading fields yourself.

`pii: true` marks personal data (`element-fields`). Arrow copying puts fields on multiple elements; audit compares them **by name**.

## Run

```
node .claude/skills/pii-audit/audit.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] [--patterns <file.json>]
```

- Run from repository root with server running; default base `http://localhost:3300`.
- Default: all Chapters. `--context`/`--chapter` filter **reports only**; reads whole model for same-name fields across Chapters.
- `--patterns`: JSON array of case-insensitive regexes on joined field-name words (`emailAddress` → `emailaddress`); **replaces**, not extends, built-in English list.
- Output: counts, **PII map** (flagged field names + locations), then one line per finding:
  `[KIND] Chapter > Slice: TYPE "Name" (id) - message`

## What the findings mean

| Kind | Finding | What to do |
|---|---|---|
| `GAP` | Personal-looking field unflagged everywhere: English matches include email, phone, address, street, city, birth, gender, ssn, passport, iban, salary, first/last/full name, bare `name` | Ask if personal; **only after confirmation**, flag every carrying element with `element-fields` |
| `GAP` | Same-named field flagged on some elements, not others | Report; ask before aligning flags via `element-fields` |
| `CANDIDATE` | **PII in Event**: immutable fact cannot be corrected/erased there | Ask whether Event needs data or just id reference; never change unasked |

## Limits (the audit does not check)

- English built-in list only; use `--patterns` for other languages.
- User decides whether data is personal and why carried.
- No detection inside free text or mockup content.
- No checks outside model: storage, retention, consent.

Name matching has false positives (product `name`) and misses (`ref` holding email): **questions, not verdicts**.

## After the run

1. Briefly report counts, PII map (fields reaching Screens, Read Models, Events), then findings, gaps first; explicitly say when none.
2. **Never change flags unasked.** Offer `element-fields` for explicit flag PATCHes on approved elements (not Propagate), `edit-and-delete` for names.
3. After approved fix, rerun with `--chapter`; confirm finding gone.
4. Script error `GET ... -> status` names failed request; check `--base` and server availability.
