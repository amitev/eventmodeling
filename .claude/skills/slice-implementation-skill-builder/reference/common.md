# Common to all generated slice-implementation skills

Technology-neutral base. The generated skill's Steps 1, 2 and 5 come from here; Step 3 and the neutral part of Step 4 from the per-type file; Step 4 is then made concrete with the confirmed decisions.

## Frontmatter of a generated skill

- `name`: as the user chose (builder topic 15). `description`: what it implements, from the type file's "Description seed", plus the technology; "Use for ..." phrases; "Not for ..." naming the sibling skills by their chosen names.
- First line of the body: `Read eventmodeling-core-rules first. Endpoints: [../api.md](../api.md) (base URL http://localhost:3300). Reads only: this skill never changes the model.` Then, if a shared decisions file exists, a link to it.

## Step 1 — Which slice (ask, do not assume)

1. Find the slice: `GET /api/model/outline` (see `model-navigation`) or `GET /api/model/search?q=<name>&type=<TYPE>` (`chapterId`, `sliceId`); `<TYPE>` is in the type file ("Find by"). Several matches: ask which.
2. Check the outline's slice `type` is the one of the type file. Another type: stop and name the right sibling skill. `null`: the slice is incomplete; tell the user, do not build.
3. The stack is fixed by the decisions of the builder: use them. Anything they do not cover: ask the user, do not choose.

## Step 2 — Fetch the slice

```powershell
Invoke-RestMethod "http://localhost:3300/api/model/chapters/<chapterId>?slice=<sliceId>&screenContent=false"
```

Result: the Chapter as stored (name, `info`, lanes) with **only this slice** in `slices` (S4.21). Print a projection, not the whole response (`model-navigation`).

- Use `screenContent=true` only when the Screen's HTML is to be built too.
- Linked copies (`copyOf`) hold no content: read the original with `GET /api/model/elements/<copyOf>`.
- Chapter, lane and element `info`: implementation details (formats, limits, integrations). Read them all; they bind the code.

Every field has `name`, `type`, flags (`list`, `generated`, `pii`, ...) and, for `object`, children. Field names are kept exactly. `connectsTo` lists the arrows out of an element; parents are the elements whose `connectsTo` holds its id.

## Step 5 — Report

The slice (id, name, type, Chapter), the files written, the tests and what they cover, the commands run and their result, and gaps (type file lists the usual ones), `info` that could not be applied, questions for the user.
