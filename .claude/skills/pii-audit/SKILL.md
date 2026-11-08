---
name: pii-audit
description: Read-only audit of personal data in the model — a bundled script lists every field flagged `pii`, shows which Screens, Commands, Events and Queries carry it, and flags fields that look personal (name, email, address, birth date, ...) but are not flagged, flags that differ between elements, and personal data in Events. Use for "where does personal data go", "GDPR review", "check the PII flags", "which fields are personal". It reports and never changes flags unasked.
---

# PII Audit

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` first. To look things up in the model, use the `model-navigation` skill (cheap reads). The audit changes **nothing**: the script does the reading and prints only the result. Do not re-derive it by reading fields yourself.

A field is flagged with `pii: true` when it is personally identifiable information (the flags of a field are in `element-fields`). Fields are copied by name along the arrows, so one personal field usually appears on several elements, and the audit compares them by name.

## Run

```
node .claude/skills/pii-audit/audit.mjs [--base http://localhost:3300] [--context <context id>] [--chapter <chapter id or name>] [--patterns <file.json>]
```

- Run it from the repository root. The server must be running (default base `http://localhost:3300`).
- Without options it audits every Chapter. `--context` or `--chapter` limits what is **reported**; the whole model is read, because the same field appears in several Chapters.
- `--patterns` is a JSON array of regular expressions (case-insensitive) tested against a field's name with the words joined (`emailAddress` → `emailaddress`). It **replaces** the built-in English word list.
- Output: a count line, a **PII map** (each flagged field name and where it is carried), then **Findings** one per line:
  `[KIND] Chapter > Slice: TYPE "Name" (id) - message`

## What the findings mean

| Kind | Finding | What to do |
|---|---|---|
| `GAP` | A field that **looks personal** but is not flagged anywhere (built-in English words such as email, phone, address, street, city, birth, gender, ssn, passport, iban, salary, first/last/full name, a bare `name`) | Ask the user whether it is personal data; flag it with `element-fields` only when they confirm, on every element that carries it |
| `GAP` | A field flagged `pii` on some elements but **not on others** with the same name | Report it; the flags should agree: ask, then align them with `element-fields` |
| `CANDIDATE` | **Personal data in an Event**. Events are immutable facts, so personal data in one cannot be corrected or erased there | Judge it with the user: does the Event need it, or only a reference (an id)? Do not change it unasked |

## Limits (the audit does not check)

- Names in other languages: the built-in word list is English only. Use `--patterns` for others.
- Whether a flagged field really is personal, or why it is carried: those are decisions for the user.
- Personal data that is not in a field of its own (inside free text), and mockup content.
- Anything outside the model (storage, retention, consent).

A name-based guess has false positives (`name` of a product) and misses (`ref` that holds an email): the findings are questions, not verdicts.

## After the run

1. Report: the counts, the PII map (which personal fields reach which Screens, Queries and Events), then the findings, gaps first. Keep it short; with no findings, say so.
2. Do not change flags on your own. Offer the fix: flags through `element-fields` (the change is not propagated downstream by the server: use its Propagate steps), names through `edit-and-delete`.
3. After a fix, run the audit again for that Chapter (`--chapter`) to confirm it is gone.
4. A script error (`GET ... -> status`) names the failed request: a wrong `--base` or a stopped server is the usual cause.
