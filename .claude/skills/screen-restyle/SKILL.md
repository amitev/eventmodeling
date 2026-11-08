---
name: screen-restyle
description: Restyle many Screens at once to the look of one base Screen the user names — keeping every Screen's content, fields, ids and structure — after a fingerprint of each Screen's look, a count and a confirmation, since the previous mockups are not saved. Use for "make all screens match", "unify the look of this Chapter", "apply the style of X to these screens". One new Screen in a base style is `html-screen`; this skill does not redesign content.
---

# Screen Restyle

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`.

Read `eventmodeling-core-rules` first. To look things up in the model, use the `model-navigation` skill (cheap reads). The mockup rules (one document per Screen, 1024×768, no scripts, what the server removes, full width) are those of `html-screen`; its "Step 2a — Style from another Screen" says what a style reference takes and what it leaves. This skill applies that to **many existing Screens**.

> **The previous mockups are not saved.** A write replaces a Screen's `html`; the server keeps no history. You decided that the user restyles at their own risk, so there is no backup step. That is why Step 3 ends with a confirmation before the first write.

## Step 1 — What to restyle, and the base

1. The **base Screen** must be **named by the user** ("make them look like X"). Never choose it yourself; if the request names none, ask which Screen is the base. Find it as `html-screen` Step 1 does (`search`, names equal; several: ask which, naming the Chapters).
2. The **set**: named by the user — a Chapter, a slice, a Context, or a list of Screens. Not named: ask. The base is never in the set. Linked copies are skipped (they show their original; restyle the original).
3. A base with a `url` and no `html`, or with no mockup, has no look to take: say so and ask.

## Step 2 — Fingerprint

```
node .claude/skills/screen-restyle/fingerprint.mjs --context <context id or name> [--chapter <id or name>] --base-screen <id or name>
```

It prints the base's fonts, colours and corner radii, then one line per Screen in scope with the same and how much of the base look it already has (`base colours present 3/8, same fonts: no`). Use it to:
- see which Screens already match (skip those, or the user may not want them touched);
- list Screens that cannot be restyled: no `html` (a placeholder, or a `url`), reported as such;
- give the user the count.

Do not read every Screen's HTML into the conversation up front: read one Screen at a time in Step 4.

## Step 3 — Count and confirm

Tell the user, in a few lines: the base, the number of Screens to restyle, which are skipped and why, and that **the previous mockups are not saved**. Ask for a yes before the first write. This is the only confirmation; do not ask again per Screen.

## Step 4 — Restyle, one Screen at a time

Read the base's look once: `GET /api/model/elements/:baseId` (`html`; pull out the `<style>` blocks and the repeated components with a shell filter, `model-navigation`). Then for each Screen:

1. Read its `html` (`GET /api/model/elements/:id`).
2. Rewrite it with the base's look: the page background, colours, fonts and sizes, spacing, borders, radii, shadows, and the styling of the same components (buttons, inputs, tables, cards, header or navigation). Keep from the Screen: **all text and values, the structure, every `id`, every class that names a field, and the order of the content.** Other tools (the `prototype` skill) bind inputs and rows by `id` and by class names equal to field names, so renaming those breaks them.
3. Take the look, not the layout or width (`html-screen`: the full-width rule stays; a narrow card becomes an inner panel). Take the layout too only when the user says so.
4. Write it: `PATCH /api/model/elements/:id` `{ "html": "<markup>" }` (or `PUT /api/model/contexts/:contextId/screens/:id/html`). The answer is the stored html (compacted). Do not send `fields`: they are unchanged.
5. A Screen that fails to write (400, 409, 412): read `error`, fix the cause, retry; never leave it half done silently, list it in the report.

Do several Screens in one turn; there is no batch for html, so one call each. Large Screens cost tokens: say so when the set is big.

## Step 5 — Verify and report

1. Run the fingerprint again with the same options: each restyled Screen should now show the base colours present and `same fonts: yes`. A Screen that does not is listed.
2. Report: how many Screens were restyled, which were skipped (already matching, no html, a copy) and which failed; that the previous mockups were not saved; and that the open board shows the change by itself (it pulls the server model and replaces any changes not yet pushed).
3. Offer, don't do: a look at one or two restyled Screens in the board before anything else changes.

## Limits

- Screens are standalone documents: there is no shared stylesheet to extract, each Screen carries its own CSS (`html-screen`: no external files).
- Only `html` Screens. A Screen shown from a `url` is not restyled.
- Content is never rewritten: if a Screen's content is wrong, that is `html-screen` or the user's decision.
