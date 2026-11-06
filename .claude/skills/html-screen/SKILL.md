---
name: html-screen
description: Design and render a real HTML/CSS mockup onto a Screen element (creating the element if needed), optionally in the style of another Screen the user names — this is the default skill for any "design a screen" / "storyboard this" request; wireframe sketches (storyboard-screen) are used only when the user explicitly asks for one
---

# HTML Screen Designer

> **DEFAULT SCREEN SKILL**: Reach for this skill on any ordinary "design a screen" / "storyboard this" request — it is the default, rendering a real HTML/CSS mockup onto a `SCREEN` element.

> **MANDATORY RENDER**: The write call in Step 4 is **not optional**. This skill exists solely to produce rendered mockups. A `SCREEN` element without `html` is an empty placeholder that adds no value to the model. If the write call is skipped or fails, the task is incomplete — retry or report the error.

Design an HTML/CSS mockup and store it as the `html` of a `SCREEN` element — creating the element if it doesn't exist yet, or updating it in place if it does. Use this to build a realistic, styled mockup (forms, tables, real page layout) rather than a wireframe sketch. A Screen holds **one** HTML document. A multi-step form is one Screen per step, not one document with hidden sections.

All endpoints are in [../api.md](../api.md) (base URL `http://localhost:3300`). The server compacts the `html` on every write. To look things up in the model, use the `model-navigation` skill (cheap reads).

## Step 1 — Parse arguments

Get the screen name from the user (and the Chapter, if they name one).

1. Find it: `GET /api/model/search?q=<name>&type=SCREEN` → `[{ id, type, name, chapterId, sliceId, lane }]`. `q` is a part of the name, case-insensitive; keep the results whose `name` equals it.
   - One result: that is the screen. Go to Step 2.
   - Several (names are not unique): ask the user which one (name the Chapters), never guess.
   - None: the screen is new. Get the target with `GET /api/model/outline` and ask the user in which Chapter and slice it goes. The `lane` is a lane of that Chapter with `type` `ACTOR` (see `GET /api/model/rules`); `slice` is a slice id of the Chapter. Ask if the Chapter has several Actor lanes.
2. A linked copy (it has `copyOf` in `GET /api/model/elements/:id`) cannot be changed: use its original's id instead.
3. **Style reference.** Only when the user — or a skill that calls this one (for example `add-next-slice`) — **names** another Screen as the base for the look ("in the style of X", "same look as X", "based on X"): note its name for Step 2a. Never choose a reference yourself.

## Step 2 — If updating an existing screen, load its current HTML first

`GET /api/model/elements/:id` returns the element as stored: `html` or `url` (only the one it has) and `fields`.

- Read the `html` and keep its look and structure; change only what the user asked for.
- If the screen has a `url` (it shows a web page) and no `html`: writing `html` **removes the `url`**. Ask the user before doing that.
- Note the `fields` (Step 5).

## Step 2a — Style from another Screen (only when the user named one)

Skip this step unless Step 1 noted a style reference.

1. Find the reference as in Step 1: `GET /api/model/search?q=<name>&type=SCREEN`, keep the results whose `name` equals it. Several: ask which one (name the Chapters). None: say so and ask.
2. Read its mockup: `GET /api/model/elements/:id` (`html`). A linked copy has no `html` of its own: read its original (`copyOf`). Do not print the whole document into the conversation: pull out the `<style>` blocks and the repeated parts of the markup (header, navigation, buttons, inputs, tables, cards) with a short shell filter. See `model-navigation`.
3. A reference with a `url` and no `html` (a web page) has no styling to take: tell the user and ask what to do. A reference with no mockup at all: say so.
4. **Take the look:** the `<style>` rules (page background, colours, fonts and sizes, spacing, borders, radii, shadows) and the styling and class names of the components the new Screen also needs (buttons, inputs, labels, tables, cards, header or navigation bar, footer). Reuse its class names and markup patterns for those components, and copy only the CSS rules the new page uses.
5. **Do not take:** the reference's content (texts, example data, field names, headings), or its page layout and width. The full-width rule of Step 3 still applies: a narrow centred card in the reference becomes the card style of an inner panel, not the width of the page. Take the layout too only when the user says so ("same layout").
6. The reference is **never changed**: no `PATCH` on it.
7. Updating an existing Screen with a style reference means restyling it: the user asked for a new look. Keep its content and structure; only the look changes.
8. Two or more named references: ask which look wins where they differ.

## Step 3 — Design the page

Write normal, full-size HTML/CSS — as if designing a real webpage, not a tiny thumbnail. With a style reference (Step 2a), its look is the base: the new page must read as part of the same product. The board lays the mockup out at **1024x768** (4:3) and scales it down to fit; content beyond 1024x768 is cut off and nothing scrolls. Design at a realistic scale (e.g. 16px body text, generous padding) and make it fit that frame.

Guidelines:
- **Keep it simple — this is a view-only mockup, not a working app.** No JavaScript, no interactivity beyond what a static page can show. The preview runs in a sandbox without scripts or form submission.
- One complete, standalone piece of markup per Screen. Do not write `<html>`, `<head>` or `<body>` tags: the server always adds them.
- **Inline styles** (`style="..."`) are the simplest way to keep it self-contained. A small `<style>` block is fine. No CSS frameworks, CDN links or external files.
- **Full width — no fixed or maximum widths.** Unless the user explicitly asks for a specific width (e.g. "mobile layout", "420px card"), the page fills the whole frame: no `max-width`, no fixed `width: 420px` on the outermost element, no auto-centered narrow card. Use `width:100%` (or nothing, a block element is already full width) with ordinary padding. A narrow card in the 1024px frame shows as a small box in the corner. Inner pieces may be sized relative to the page (grid columns, percentages, `flex`). A real page background (e.g. a light gray full-bleed background) reads more realistically than a bare form on white.
- The server **removes** these on every write, so do not rely on them:
  - tags `script`, `noscript`, `title`, `meta`, `base`, `template`, `iframe`, `object`, `embed`, and `link` unless it is a stylesheet;
  - attributes `on*`, `data-*`, `aria-*`, `role`, `name`, `required`, `pattern`, `min/maxlength`, `autocomplete`, `autofocus`, `action`, `method`, `target`, `rel`, `title`, `tabindex`, `contenteditable`, `spellcheck`, `draggable`;
  - HTML comments.
- Removing `name` ungroups radio buttons: show a group with exactly one `checked` radio, or style the choice yourself.
- Whitespace is collapsed, so do not use spaces for layout.

## Step 4 — Write the HTML

The body is JSON: escape quotes and line breaks in the HTML, e.g. build the body with `ConvertTo-Json` or `JSON.stringify`. Send `Content-Type: application/json`.

**Updating an existing screen**

`PATCH /api/model/elements/:id` with `{ "html": "<markup>", "fields": [...] }` (`fields` as in Step 5; leave it out if the fields do not change). Setting `html` removes the `url`. Returns the element as stored, with the compacted `html` (HTTP 200).

(`PUT /api/model/contexts/:contextId/screens/:id/html` with `{ "html": "<markup>" }` sets only the HTML.)

**Creating a new screen**

`POST /api/model/elements` with
```json
{ "slice": "<slice id>", "lane": "<actor lane id>", "type": "SCREEN", "name": "<screen name>", "html": "<markup>", "fields": [...] }
```
Returns the new element (HTTP 201). `x` is optional: without it the element is placed like the board does. `autoConnect` is `true` by default: it connects a Query below the Screen in the same slice (Query → Screen), which copies the Query's fields to it. Other arrows: see the `connections` skill.

On an error (400, 404, 409, 412, 422) read `error`, fix the cause and retry; do not leave the screen without `html`.

## Step 5 — Define field data lineage (mandatory)

Every screen, new or updated, needs `fields`: every piece of data the mockup shows or lets the user enter must be a field of the Screen, named exactly as in the mockup. A screen with only a title and no fields is an empty placeholder from a data-lineage standpoint, even if the mockup itself looks complete.

A field is `{ name, type?, list?, id?, optional?, generated?, pii?, technical?, fields? }`; `type` is one of `string`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `uuid`, `object` (an `object` has its own `fields`; `list: true` for a list). Flags default to `false`.
- **Shown from a read model** (Query → Screen): the field comes from the Query. Never invent it.
- **Entered by the user** (goes to a Command): a normal field (`generated: false`).
- **Session values and display-only calculations** (current user, today's date, totals): `generated: true`.
- Mark `pii: true` for personal data and `id: true` for identifiers.

**For a brand-new screen**
1. Find the Query that feeds it: in `GET /api/model/outline` (the Chapter's slices) look for a `QUERY` element whose `connectsTo` will point to the screen, usually in the same slice or the one before; `GET /api/model/elements/:queryId` gives its `fields`.
2. Design the mockup around those fields, then send them, plus the entered and generated fields, as `fields` in the `POST`. The Query's own fields are also copied when `autoConnect` adds the arrow; fields of the same name are replaced by the Query's.
3. No Query is connected yet: use `fields` for what the mockup shows, and say so in the report.

**For an existing screen**
1. `GET /api/model/elements/:id` → current `fields` (those from the Query are already in it).
2. Keep every existing field unless the user asked to remove it. `fields` in a `PATCH` **replaces the whole list**: send the existing fields plus the new ones.
3. Fields you add are not copied to the connected Command; say so in the report so the user can update the Command.

## Step 6 — Report back

Tell the user:
- The element ID that was created or updated
- The style reference, when there was one: which Screen (name, Chapter), what was taken (for example colours, fonts, buttons, header) and what was left out on purpose (content, width)
- Whether the write succeeded (HTTP 200 for an update, 201 for a new screen) and the Chapter it is in
- Which fields the screen now has, and which of them are generated
- That the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed)
- Any errors
