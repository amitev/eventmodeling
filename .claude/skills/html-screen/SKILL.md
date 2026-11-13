---
name: html-screen
description: Design/render HTML/CSS on a new or existing Screen, optionally matching a named Screen. Default for "design a screen" or "storyboard this"; use `storyboard-screen` wireframes only when explicitly requested.
---

# HTML Screen Designer

**Model access:** API only ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`. Lookups: `model-navigation`.

> **DEFAULT SCREEN SKILL:** realistic HTML/CSS mockups (forms, tables, page layouts), not wireframes unless explicitly requested.

> **MANDATORY RENDER:** Step 4 must store `html`. A Screen without it is an empty placeholder; skipped/failed write means incomplete task. Retry or report error.

Create Screen if missing, otherwise update in place. **One document per Screen; one Screen per multi-step form step**, never hidden sections. Server compacts HTML on every write.

## Step 1 — Parse arguments

Get user-provided Screen name and Chapter, if named.
1. `GET /search?q=<name>&type=SCREEN` → `[{ id, type, name, chapterId, sliceId, lane }]`; case-insensitive substring search, then retain exact-name matches.
   - One: update it.
   - Several: ask which, naming Chapters; never guess.
   - None: `GET /outline`; ask target Chapter/slice and Actor lane if several. Lane must be same-Chapter `ACTOR` (`GET /rules`).
2. Linked copy (`copyOf` in `GET /elements/:id`): use original id; never edit copy.
3. **Style reference:** only when user or calling skill (e.g. `add-next-slice`) **names** one ("in the style of X", "same look as X", "based on X"). Record for Step 2a; **never choose one yourself**.

## Step 2 — If updating an existing screen, load its current HTML first

`GET /elements/:id`: stored `html` or `url`, plus `fields`.
- Preserve HTML look/structure except requested changes.
- URL-only Screen: writing HTML **removes URL; ask first**.
- Keep fields for Step 5.

## Step 2a — Style from another Screen (only when the user named one)

Skip unless Step 1 supplied a reference.
1. Search as Step 1; multiple exact-name matches: ask which, naming Chapters; none: report and ask.
2. `GET /elements/:id` for HTML (copy: read original). Shell-filter `<style>` blocks and repeated header/navigation/buttons/inputs/tables/cards; never print whole document (`model-navigation`).
3. URL-only reference: no reusable styling; explain and ask. No mockup: report.
4. **Take look:** background, colours, fonts/sizes, spacing, borders/radii/shadows; shared components' styling, classes and markup patterns (buttons, inputs, labels, tables, cards, header/navigation/footer). Copy only used CSS.
5. **Not content, layout or width:** no reference texts/data/field names/headings. Step 3 full-width rule stays; narrow reference card becomes inner-panel styling. Layout only if explicitly requested ("same layout").
6. **Never change reference.** Updating target with a reference restyles look only; preserve target content/structure.
7. Multiple references: ask which look wins conflicts.

## Step 3 — Design the page

Design a real full-size page, not thumbnail: **1024x768 (4:3)**, then board scales down. Overflow is clipped, no scrolling. Fit realistic scale (e.g. 16px body text, generous padding). Named reference's look must read as same product.

Guidelines:
- **Static, view-only:** no JavaScript or interactivity beyond static HTML; sandbox blocks scripts/form submission.
- One standalone markup per Screen; **omit `<html>`, `<head>`, `<body>`**, server adds them.
- Prefer inline styles (`style="..."`); small `<style>` block allowed. No CSS frameworks, CDN links or external files.
- **Full width by default:** no outer fixed/max width or auto-centred narrow card. Use `width:100%` or block default, ordinary padding. Specific width only when user explicitly requests (e.g. mobile layout, 420px card). Inner layout may use grid/percentages/flex. Prefer realistic full-bleed background (e.g. light gray) over bare white form.
- Server **removes on every write**; never rely on:
  - tags `script`, `noscript`, `title`, `meta`, `base`, `template`, `iframe`, `object`, `embed`, and `link` unless it is a stylesheet;
  - attributes `on*`, `data-*`, `aria-*`, `role`, `name`, `required`, `pattern`, `min/maxlength`, `autocomplete`, `autofocus`, `action`, `method`, `target`, `rel`, `title`, `tabindex`, `contenteditable`, `spellcheck`, `draggable`;
  - HTML comments.
- Removed `name` ungroups radios: exactly one `checked` per group, or style choice yourself.
- Whitespace collapses; never lay out with spaces.

## Step 4 — Write the HTML

Build JSON with `ConvertTo-Json` or `JSON.stringify` (escape HTML quotes/newlines); send `Content-Type: application/json`.

**Updating an existing screen**

`PATCH /elements/:id` `{ html: "<markup>", fields: [...] }`; Step 5 fields, omit if unchanged. Removes `url`; returns stored element + compacted HTML, HTTP 200.

HTML-only alternative: `PUT /contexts/:contextId/screens/:id/html` `{ html: "<markup>" }`.

**Creating a new screen**

`POST /elements`:
```json
{ "slice": "<slice id>", "lane": "<actor lane id>", "type": "SCREEN", "name": "<screen name>", "html": "<markup>", "fields": [...] }
```
Returns new element, HTTP 201. Omit optional `x` for board placement. Default `autoConnect: true` links same-slice Read Model below → Screen, copying its fields. Other arrows: `connections`.

Errors 400/404/409/412/422: read `error`, fix cause, retry; never silently leave Screen without HTML.

## Step 5 — Define field data lineage (mandatory)

**Every new/updated Screen needs fields for all shown/entered data, named exactly as in mockup.** Title-only Screen with no fields remains a lineage placeholder despite complete-looking HTML.

Field: `{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }`; types `string`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `uuid`, `object` (nested `fields`). `list: true` for lists; flags default `false`.
- Read Model → Screen: use its fields, never invent.
- User input → Command: `generated: false`.
- Session/display-only calculations (current user, today, totals): `generated: true`.
- Personal data: `pii: true`; identifiers: `id: true`.
- Apply the core completeness rule to Screens with incoming arrows; report gaps. Never mark user data generated to bypass it.

**For a brand-new screen**
1. Outline: find intended feeding Read Model (`connectsTo` will target Screen), usually same/previous slice; `GET /elements/:readModelId` for fields.
2. Design around those fields; POST them plus entered/generated fields. Automatic Read Model arrow replaces same-named fields with Read Model's versions.
3. No connected Read Model: define shown fields and report missing connection.

**For an existing screen**
1. Read current fields, including inherited Read Model fields.
2. **PATCH replaces whole list:** keep every existing field unless removal requested; send full list with additions.
3. For new top-level fields, apply `element-fields` Propagate unless user opts out. Existing-field changes stay local; downstream edits need separate approval.

## Step 6 — Report back

- Created/updated element id, Chapter, write success/status (200 update, 201 create).
- Reference Screen (name/Chapter), taken styling and intentionally excluded content/width.
- Final fields, marking generated; lineage gaps and Command fields not updated.
- Automatic board updates (pull behavior: API reference); any errors.
