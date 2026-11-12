---
name: screen-restyle
description: Restyle existing Screens to a user-named base, preserving content, fields, ids and structure; fingerprint, count and confirm first since old mockups are not saved. Use for "make all screens match", "unify the look of this Chapter", "apply the style of X to these screens". New Screen in base style uses `html-screen`; no content redesign.
---

# Screen Restyle

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first; lookups: `model-navigation`. Follow `html-screen` mockup rules (one document, 1024×768, no scripts, sanitization, full width) and Step 2a style-transfer rules, here for **many existing Screens**.

> **Old mockups are not saved:** writes replace HTML; server has no history. User accepts risk; no backup step. **Confirm before first write** (Step 3).

## Step 1 — What to restyle, and the base

1. **User must name base Screen**; absent: ask, never choose. Find via `html-screen` Step 1 (exact-name search matches; several: ask which, naming Chapters).
2. **User specifies scope:** Chapter, slice, Context or Screen list; absent: ask. Exclude base and linked copies (restyle originals).
3. Base has only URL/no mockup: explain no reusable look, ask.

## Step 2 — Fingerprint

```
node .claude/skills/screen-restyle/fingerprint.mjs --context <context id or name> [--chapter <id or name>] --base-screen <id or name>
```

Prints base fonts/colours/radii, then each Screen's values and match level (`base colours present 3/8, same fonts: no`). Use to skip already-matching Screens, list nonrestylable URL/placeholders (no HTML) and count changes.

**Never load all HTML upfront**; read one Screen at a time in Step 4.

## Step 3 — Count and confirm

Briefly report base, change count, skips/reasons and **old mockups not saved**. **Get yes before first write**, once for whole set, not per Screen.

## Step 4 — Restyle, one Screen at a time

Read base look once: `GET /elements/:baseId`; shell-filter `<style>` blocks/shared components (`model-navigation`). For each target:

1. `GET /elements/:id` for HTML.
2. Apply base background, colours, fonts/sizes, spacing, borders/radii/shadows, component styling (buttons, inputs, tables, cards, header/navigation). **Keep all target text/values, structure, every `id`, field-naming class and content order.** `prototype` binds inputs/rows by ids and field-name classes; renaming breaks bindings.
3. Look only, **not layout/width unless requested**. Full-width rule stays; narrow reference card becomes inner panel.
4. `PATCH /elements/:id` `{ html: "<markup>" }` or `PUT /contexts/:contextId/screens/:id/html`. Returns stored compacted HTML. **Never send `fields`: unchanged.**
5. Failed write (400/409/412): read `error`, fix cause, retry; never silently leave partial work; report failures.

Several Screens per turn, **one HTML call per Screen**, not a batch. Warn about token cost for large sets.

## Step 5 — Verify and report

1. Rerun fingerprint with same options: base colours present, `same fonts: yes`; list mismatches.
2. Report restyled count, skips/reasons (matching, no HTML, copy), failures; **old mockups not saved**; automatic board updates (pull behavior: API reference).
3. Offer, never start unasked: inspect one/two restyled Screens in board before further changes.

## Limits

- Standalone documents, CSS per Screen; no shared stylesheet/external files (`html-screen`).
- HTML only; never restyle URL Screens.
- Never rewrite content; content fixes use `html-screen` or user decision.
