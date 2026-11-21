# Common to all generated slice-implementation skills

Technology-neutral base. The generated skill's Steps 1, 2 and 5 come from here; Step 3 and the neutral part of Step 4 from the per-type file; Step 4 is then made concrete with the confirmed decisions.

## Frontmatter of a generated skill

- `name`: as the user chose (builder topic 14), but do not include a technology name (for example, use `implement-state-change`, not `implement-state-change-springboot`). `description`: technology-neutral; describe what it implements, based on the type file's "Description seed", and match broad requests such as "Build slice X" or "Build the slice in Chapter Y". Tell the skill to identify the requested slice and its type from the model. Include "Use for ..." prompt examples and "Not for ..." with excluded slice types, but do not name sibling skills. Technology decisions belong in the skill body or shared decisions file, not its name or description.
- First line of the body: `Read eventmodeling-core-rules first. Endpoints: [../em-board-api.md](../em-board-api.md) (base URL http://localhost:3300). Reads only: this skill never changes the model.` Then, if a shared decisions file exists, a link to it.
- Second line: `**Model access:** the model is read only through the API ([../em-board-api.md](../em-board-api.md)). Never read, create, edit or delete files in `.event-modeling/`.`

Generated skills are **backend only**: no UI code, no Screen mockup use.

Put this rule in every generated skill, as its own section before Step 1:

> **Scope:** implement only the requested slice. No other slice may be affected: do not change, move or delete code of other slices, and do not create what another slice owns (e.g. a database table, a queue, a shared type, another slice's Event or Read Model). Shared code the decisions name is used, not changed. If something the slice depends on is missing (a table, a queue, an Event type, a configuration, a library), **stop with an error** that names what is missing and which slice should provide it. Write nothing, do not create it, do not work around it. A red Note, unclear required `info` or conflicting scenarios blocks the slice: stop and report before code changes. If a required business rule has no scenario, report the gap and continue only with independent implementable behavior; never invent the rule. Never ask the user for clarification. Complete discovery and gap analysis before writing code.

## Step 1 — Preflight (no questions)

1. Find the slice: `GET /api/model/outline` (see `model-navigation`) or `GET /api/model/search?q=<name>&type=<TYPE>` (`chapterId`, `sliceId`); `<TYPE>` is in the type file ("Find by"). No match or several matches: stop and report the missing or ambiguous target, including candidate IDs.
2. Check the outline's slice `type` is the one of the type file. Another type: stop and name the right sibling skill. `null`: stop and report that the slice is incomplete.
3. Use the stack fixed by the builder's decisions. If a required implementation detail is not covered, stop and name it as missing information.
4. Check the dependencies the slice needs exist (see Scope above) before writing any file. Missing: stop with the error.
5. Proceed only when the target, required stack details and dependencies are sufficient. Fetch and analyze the slice before writing code. For a required business rule with no scenario, report the gap and continue only with independent behavior. If a contradiction, red Note, unclear required `info` or other missing required stack/model detail blocks the slice, stop without code changes and report it.

## Step 2 — Fetch the slice

```powershell
Invoke-RestMethod "http://localhost:3300/api/model/chapters/<chapterId>?slice=<sliceId>&screenContent=false"
```

Read Chapter metadata and lanes from `chapter`, Context metadata from `context`, and the requested slice from `slices[0]`. Print a projection, not the whole response (`model-navigation`).

- Always call with `screenContent=false` (never `true`): the skills are backend only and never use the Screen's HTML.
- Linked copies (`copyOf`) hold no content: read the original with `GET /api/model/elements/<copyOf>`.
- Chapter, lane and every element type that supports `info`, and the `NOTES` elements of the slice (Spec lane; they may hold implementation details, among other things): implementation details (formats, limits, integrations). Read them all; they bind the code. Do not limit element `info` to translation elements. A red Note is unresolved information: stop and report it; do not guess or ask.

Every field has `name`, `type`, flags (`list`, `generated`, `pii`, ...) and, for `object`, children. Field names are kept exactly. `connectsTo` lists the arrows out of an element; parents are the elements whose `connectsTo` holds its id.

## Scenario contract and tests (copy into every generated skill)

Read every scenario's `name`, `description`, `given`, `when`, `then`, `error` and example data before implementation. Treat their combined requirements as binding: satisfy every scenario and cover it in tests. Apply `description` requirements alongside GWT and example data, not only as test labels. Do not invent unstated requirements or silently skip, weaken or prioritize a scenario. If a description conflicts with its GWT/example data, or scenarios conflict for the same relevant conditions, stop and report before code changes. Different outcomes for different conditions are not conflicts.

No scenarios alone does not block implementation. If a required behavior cannot be derived from other explicit model facts, report that gap and continue with independent implementable behavior; do not invent the missing rule.

## Step 5 — Report

The slice (id, name, type, Chapter), the files written, the tests and what they cover (including description requirements), the commands run and their result, and any missing information that blocked implementation or `info` that could not be applied. Do not ask follow-up questions.
