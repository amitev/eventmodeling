# Common to all generated slice-implementation skills

Technology-neutral base. The generated skill's Steps 1, 2 and 5 come from here; Step 3 and the neutral part of Step 4 from the per-type file; Step 4 is then made concrete with the confirmed decisions.

## Frontmatter of a generated skill

- `name`: as the user chose (builder topic 14). `description`: what it implements, from the type file's "Description seed", plus the technology; "Use for ..." phrases; "Not for ..." naming the sibling skills by their chosen names.
- First line of the body: `Read eventmodeling-core-rules first. Endpoints: [../em-board-api.md](../em-board-api.md) (base URL http://localhost:3300). Reads only: this skill never changes the model.` Then, if a shared decisions file exists, a link to it.
- Second line: `**Model access:** the model is read only through the API ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`.`

Generated skills are **backend only**: no UI code, no Screen mockup use.

Put this rule in every generated skill, as its own section before Step 1:

> **Scope:** implement only the requested slice. No other slice may be affected: do not change, move or delete code of other slices, and do not create what another slice owns (e.g. a database table, a queue, a shared type, another slice's Event or Read Model). Shared code the decisions name is used, not changed. If something the slice depends on is missing (a table, a queue, an Event type, a configuration, a library), **stop with an error** that names what is missing and which slice should provide it. Write nothing, do not create it, do not work around it. Missing or unclear model information (no scenario for a required rule, a red Note, unclear `info`) also blocks implementation: stop and list the missing information. Never ask the user for clarification. Complete all discovery and gap analysis before the first code write; if any required information is missing or ambiguous, make no code changes.

## Step 1 — Preflight (no questions)

1. Find the slice: `GET /api/model/outline` (see `model-navigation`) or `GET /api/model/search?q=<name>&type=<TYPE>` (`chapterId`, `sliceId`); `<TYPE>` is in the type file ("Find by"). No match or several matches: stop and report the missing or ambiguous target, including candidate IDs.
2. Check the outline's slice `type` is the one of the type file. Another type: stop and name the right sibling skill. `null`: stop and report that the slice is incomplete.
3. Use the stack fixed by the builder's decisions. If a required implementation detail is not covered, stop and name it as missing information.
4. Check the dependencies the slice needs exist (see Scope above) before writing any file. Missing: stop with the error.
5. Proceed only when the target, model information, stack decisions and dependencies are sufficient. Fetch and analyze the slice before writing any code. If a gap is found at any point, stop without code changes and report the missing information.

## Step 2 — Fetch the slice

```powershell
Invoke-RestMethod "http://localhost:3300/api/model/chapters/<chapterId>?slice=<sliceId>&screenContent=false"
```

Result: the Chapter as stored (name, `info`, lanes) with **only this slice** in `slices` (S4.21). Print a projection, not the whole response (`model-navigation`).

- Always call with `screenContent=false` (never `true`): the skills are backend only and never use the Screen's HTML.
- Linked copies (`copyOf`) hold no content: read the original with `GET /api/model/elements/<copyOf>`.
- Chapter, lane and every element type that supports `info`, and the `NOTES` elements of the slice (Spec lane; they may hold implementation details, among other things): implementation details (formats, limits, integrations). Read them all; they bind the code. Do not limit element `info` to translation elements. A red Note is unresolved information: stop and report it; do not guess or ask.

Every field has `name`, `type`, flags (`list`, `generated`, `pii`, ...) and, for `object`, children. Field names are kept exactly. `connectsTo` lists the arrows out of an element; parents are the elements whose `connectsTo` holds its id.

## Scenario-driven tests (copy into every generated skill)

Read each scenario's `name`, `description`, `given`, `when`, `then`, `error` and example data before implementing tests. Apply requirements stated in `description` to test setup, actions and assertions; never use it only as a label/comment or ignore it because GWT has example values. Do not invent unstated requirements. Ambiguous descriptions or conflicts with GWT/example data block implementation: stop and report before code changes, never choose one silently.

## Step 5 — Report

The slice (id, name, type, Chapter), the files written, the tests and what they cover (including description requirements), the commands run and their result, and any missing information that blocked implementation or `info` that could not be applied. Do not ask follow-up questions.
