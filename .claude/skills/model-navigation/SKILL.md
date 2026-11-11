---
name: model-navigation
description: Read the model through the server API cheaply — which endpoint to call for which question, how to read the outline (arrows, parents, children, slice contents, copies), how to filter responses before printing them, and when not to re-read. Use before any task that needs to look something up in the model ("find X", "what feeds this", "which slices are in this chapter", "what fields does Y have", "list the screens"), and whenever a read would be large.
---

# Model Navigation (cheap reads)

Endpoints: [../api.md](../api.md) (base URL `http://localhost:3300`). Reads never change the model. Do not read the model files in `.event-modeling/` directly: always use the API.

## Principles

1. **Narrowest read that answers the question.** The outline is small (no `html`, `fields`, `info`, scenarios); the rest is expensive. Never fetch the whole model (`GET /api/model`) to look something up.
2. **Filter before you print.** Call the API from the shell (`curl`, or `Invoke-RestMethod` in PowerShell) and select what you need (ids, names, a few properties) in the same command. Do not print a whole response into the conversation just to read one value.
3. **Do not read twice.** Reuse ids and data you already have. A write returns the item as stored: use that instead of reading it again. Re-read only after a change you did not make.
4. **Ids come from the model, never from memory.** Look them up by name (`search`) or in the outline. Names are not unique: several matches means ask the user which (name their Chapters); never pick one.

## Which call for which question

| I want | Call | Returns |
|---|---|---|
| Has the model changed since my last read? | `GET /api/model/revision` | `{ revision }` (also the `ETag`). Same text as before = nothing changed |
| The structure: Contexts, Chapters, lanes, slices, elements, arrows | `GET /api/model/outline` (`?context=<id>` for one Context; an unknown id is 404) | a list of Contexts, each with its `chapters`: ids, names, types, `lane`, `x`, `copyOf?`, `connectsTo`; slices with `type`, `width` and `connectsTo` (target Chapter ids); no content |
| An element by (part of) its name | `GET /api/model/search?q=<text>&type=<TYPE>&context=<id>` | `[{ id, type, name, chapterId, sliceId, lane }]`; `q` is a case-insensitive part of the name; `type` is upper case |
| One element with its content | `GET /api/model/elements/:id` | the element as stored: `fields`, `info`, `html` or `url`, `markdown`, `scenarios`, `connectsTo`, `copyOf` |
| The content of one whole Chapter | `GET /api/model/chapters/:id?screenContent=false` | the Chapter as stored; `screenContent=false` leaves out the (large) Screen `html` |
| Every Chapter of a Context at once | `GET /api/model/contexts/:id?screenContent=false` | multi-document YAML, one document per Chapter |
| The Screens of a Context | `GET /api/model/contexts/:id/screens` (`?name=`, `?contains=true`, `?chapter=`) | `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]` without `html` |
| The mockup of one Screen | `GET /api/model/contexts/:id/screens/:screenId` | the Screen with its `html` or `url` (a copy returns its original's) |
| The rules (types, lane types, allowed arrows, colours, field types) | `GET /api/model/rules` | read it once per session |

Rule of thumb: **outline first**, then `elements/:id` for the few elements whose content you need. Use a Chapter or Context read only when you need the content of most of its elements (e.g. all fields, all scenarios), and always with `screenContent=false` unless you need a mockup.

## Reading the outline

An element is `{ id, type, name, lane, x, copyOf?, connectsTo }`. Everything else is derived:

- **Slice contents:** the `elements` of the slice, in order of `x`. A slice's `type` is `STATE_CHANGE`, `STATE_READ`, `AUTOMATION`, `TRANSLATION`, or `null` (the board works it out; `null` also for an empty slice).
- **Lane of an element:** its `lane` is a lane id of the same Chapter; the lane's `type` is in the Chapter's `lanes`.
- **Children (arrows out):** `connectsTo` lists the ids an element has an arrow **to**.
- **Parents (arrows in):** all elements whose `connectsTo` contains the id. Build a map once (target id → source ids) when you need more than one.
- **Downstream / upstream:** follow `connectsTo` (or the parent map) repeatedly; keep a visited set, the flow can loop (Read Model → Screen → Command → Event → Read Model). A `PROCESSOR` only passes things on.
- **Linked copies:** `copyOf` is the original's id; the copy's `name` is the original's. Its content (fields, mockup) is the original's: read the original. Arrows stay within a Chapter, so a fact of another Chapter reaches an element through its copy: to follow a dependency across Chapters, go from the copy to its original (`copyOf`).
- **Scenarios elements:** type `SCENARIOS`, in a Spec lane; their scenarios are only in `GET /elements/:id`.
- **Chapter arrows:** `connectsTo` of a Chapter lists Chapter ids.
- **Empty things:** a slice with no `elements`, a Chapter with one slice and none, a Context with no Chapter: normal, not errors.

## Typical lookups

| Question | How |
|---|---|
| Which Chapter and slice is element X in? | `search` gives `chapterId` and `sliceId`; names come from the outline |
| What does a slice contain, and what is its type? | outline: the slice's `type` and `elements` |
| What feeds this Screen / Command / Read Model? | its parents (see above), through any `PROCESSOR` |
| What does this Event reach? | downstream from its `connectsTo` |
| Which Commands and Events can a scenario use? | non-copy `COMMAND`/`EVENT` elements of the same Chapter, from the outline |
| What are the fields of all Commands in a Chapter? | `GET /chapters/:id?screenContent=false`, filter to `COMMAND` elements and print `name` and `fields` |
| Which Screens have no mockup? | `GET /contexts/:id/screens`: `hasHtml` and `hasUrl` both false |
| Is anything missing a name, field or arrow? | outline for names and arrows; one Chapter read for fields |

## Reading without flooding the conversation

Print a short projection, not the response. Examples (PowerShell):

```powershell
$o = Invoke-RestMethod "http://localhost:3300/api/model/outline?context=<id>"
$o.chapters.slices | ForEach-Object { "$($_.id) $($_.type) $($_.name): " + (($_.elements | ForEach-Object { "$($_.type):$($_.name)" }) -join ', ') }
```

```powershell
Invoke-RestMethod "http://localhost:3300/api/model/search?q=order&type=COMMAND" | ForEach-Object { "$($_.id) $($_.name) chapter=$($_.chapterId)" }
```

Check the exact shape of a response once (print the first element, or its property names), then script the rest. When a response is saved to a file because it is large, search it and read only the needed range.

## After a change

- A write answers with the item as stored (and creations with 201): use it. No outline re-read is needed to get a new id.
- To confirm a structural change (slice type, arrows, order) read the outline once, for that Context only.
- Changes made through the server notify the open board by themselves; you do not need to tell it.
