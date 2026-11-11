---
name: model-navigation
description: Read the model cheaply through the API — endpoint choice, outline navigation, arrows, copies, filtered output and read reuse. Use before model lookups ("find X", "what feeds this", "which slices are in this chapter", "what fields does Y have", "list the screens") and large reads.
---

# Model Navigation (cheap reads)

**Model access:** API only ([../api.md](../api.md)); never read model files in `.event-modeling/` directly. Reads change nothing. Paths below are relative to `http://localhost:3300/api/model`.

## Principles

1. **Read narrowly.** Never fetch the whole model (`GET /api/model`) for lookups. Outline first; `elements/:id` for a few elements. Chapter/Context content only when most elements are needed; use `screenContent=false` unless reading mockups.
2. **Filter before printing.** Use shell `curl` or PowerShell `Invoke-RestMethod`; select needed ids, names and properties in the same command, not the whole response.
3. **Reuse reads and write responses.** Re-read content only after a change you did not make; structural verification is the exception below.
4. **Look up ids, never recall them from memory.** Use search/outline. Names are not unique: ask which match, naming Chapters; never choose one.

## Which call for which question

| Need | GET path | Result / query |
|---|---|---|
| Changes since last read | `/revision` | `{ revision }` + `ETag`; unchanged text = unchanged model |
| Structure and arrows | `/outline?context=<id>` | Context list with Chapters, lanes, slices, elements; ids, names, types, positions, `copyOf?`, `connectsTo`, slice `width`. No `html`, `fields`, `info`, scenarios. Omit filter for all; unknown Context: 404 |
| Element by name | `/search?q=<text>&type=<TYPE>&context=<id>` | `[{ id, type, name, chapterId, sliceId, lane }]`; `q`: case-insensitive substring; `type`: uppercase |
| Element content | `/elements/:id` | Stored element: `fields`, `info`, `html` or `url`, `markdown`, `scenarios`, `connectsTo`, `copyOf` |
| Chapter content | `/chapters/:id?screenContent=false` | Stored Chapter without Screen `html` |
| Context content | `/contexts/:id?screenContent=false` | Multi-document YAML, one document per Chapter |
| Screens | `/contexts/:id/screens` | `[{ id, name, chapterId, chapterName, sliceId, copyOf?, hasHtml, hasUrl }]`; no `html`. Filters: `?name=`, `?contains=true`, `?chapter=` |
| Screen mockup | `/contexts/:id/screens/:screenId` | Screen + `html` or `url`; copy returns original's |
| Types, lanes, arrows, colours, field types | `/rules` | Read once per session |

## Reading the outline

Element: `{ id, type, name, lane, x, copyOf?, connectsTo }`.

- **Slice:** `elements` ordered by `x`; board-derived `type`: `STATE_CHANGE`, `STATE_READ`, `AUTOMATION`, `TRANSLATION` or `null` (including empty).
- **Lane:** element `lane` references the same Chapter's `lanes`; look up its `type` there.
- **Children:** `connectsTo` target ids. **Parents:** elements listing this id in `connectsTo`; build target-id → source-ids map once for multiple lookups.
- **Downstream/upstream:** traverse targets/parents with a visited set; loops exist (Read Model → Screen → Command → Event → Read Model). `PROCESSOR` passes things on.
- **Linked copy:** `copyOf` = original id; original supplies name/content. Read original for fields/mockup; follow `copyOf` for cross-Chapter dependencies (normally connected through local copies).
- **Scenarios:** `SCENARIOS` in Spec lane; read entries with `GET /elements/:id`.
- **Chapter/slice arrows:** their `connectsTo` lists target Chapter ids.
- Empty slice, Chapter with one empty slice, or Context without Chapters: normal.

## Typical lookups

| Question | How |
|---|---|
| Element location | Search's `chapterId`, `sliceId`; names from outline |
| Slice content/type | Outline's `elements`, `type` |
| What feeds a Screen/Command/Read Model? | Parents, through Processors |
| What does an Event reach? | Traverse `connectsTo` downstream |
| Scenario choices | Outline's same-Chapter, non-copy `COMMAND`/`EVENT` elements |
| All Command fields in a Chapter | Chapter read; filter `COMMAND`, print `name`, `fields` |
| Screens without mockups | Screens endpoint: both `hasHtml`, `hasUrl` false |
| Missing names/fields/arrows | Outline for names/arrows; Chapter read for fields |

## Reading without flooding the conversation

Print projections, not responses (PowerShell):

```powershell
$o = Invoke-RestMethod "http://localhost:3300/api/model/outline?context=<id>"
$o.chapters.slices | ForEach-Object { "$($_.id) $($_.type) $($_.name): " + (($_.elements | ForEach-Object { "$($_.type):$($_.name)" }) -join ', ') }
```

Check response shape once (first item or property names), then script the rest. For output offloaded to a file, search it and read only needed ranges.

## After a change

- Use stored-item write responses (creation: 201) for new ids; no outline re-read needed.
- Verify structure (slice type, arrows, order) with one Context-filtered outline read.
- Server changes notify the open board automatically; no manual notification.
