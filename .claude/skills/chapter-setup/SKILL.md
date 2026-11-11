---
name: chapter-setup
description: Create, rename, move, reorder, resize or delete Contexts, Chapters, lanes and slices through the API; insert slices and mark flow ends. Use for "add a chapter", "create a context", "add a slice after X", "move this slice", "add a lane", "rename", "split the model into contexts".
---

# Chapter Setup (structure)

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Paths below: `http://localhost:3300/api/model`.

Read `eventmodeling-core-rules` first; use `model-navigation` for lookups. Do not guess rules. Related: `html-screen`, `element-fields`, `connections`, `scenarios`.

## Rules to know

| | Rule |
|---|---|
| Context | `{ id, name, info? }`; first = **Default**, renamable but not deletable (409). Each Chapter has exactly one Context |
| Context name | File name: nonempty; no `\ / : * ? " < > |`, control characters or trailing dot; not `contexts` or Windows device names (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, including extensions). Case-insensitive collisions forbidden. Refused with 400/409; ask, never alter a name to fit |
| Chapter/slice/lane names | Nonempty; not server-checked file names, but avoid the same characters the board filters |
| Chapter defaults | Actor, Interaction, Event lanes; one empty "New Slice", width 220. `x`, `y`: multiples of 20, default 0 |
| Lanes | Actor, Interaction, Event, Integration, Spec order (`GET /rules`: `laneTypes`, `laneColors`); retain at least one Actor, Interaction and Event lane |
| Slices | Automatic contiguous left-to-right layout; order + `width`, no `x`. Width multiple of 20, ≥ 120, fits elements + margins. Retain at least one slice |
| Flow end | `flowEnd: true` marks flow end |
| Delete | Lane/slice: elements, their arrows/copies and scenarios using them. Chapter: all its elements. Context: Chapters move to Default |
| Ids | Server-created, globally unique |
| Info | Markdown, default empty; mainly implementation details (formats, limits, integrations, technical constraints). Never citations, summaries or traceability. Summaries go in Notes, which may also hold implementation details |

## Step 1 — Look first

1. `GET /outline` (`?context=<id>` to narrow): get ids, positions, lanes, slice order/widths and elements. Never guess ids.
2. Multiple name matches: ask which, naming Chapters.
3. **Ask before content loss or unexpected changes:** lane/slice/Chapter/Context deletion, adding a lane to an existing Chapter, moving a Chapter between Contexts.

## Step 2 — Contexts

| Do | Call |
|---|---|
| Create | `POST /contexts` `{ name }` |
| Rename / info | `PATCH /contexts/:id` `{ name?, info? }`; empty info removes it |
| Delete | `DELETE /contexts/:id` → `{ moved }`: Chapter ids moved to Default |

## Step 3 — Chapters

| Do | Call |
|---|---|
| Create | `POST /chapters` `{ context, name, x?, y? }` → Chapter + three lanes + slice; use returned ids |
| Change | `PATCH /chapters/:id` `{ name?, info?, context?, x?, y? }`; `info: null` removes it |
| Delete | `DELETE /chapters/:id` → `{ removed: { elements, scenarios } }` |
| Connect | `PUT /chapters/:id/connections/:targetId`; `DELETE` removes. Chapter → Chapter only, never self |
| Connect from slice | `PUT /slices/:id/connections/:targetId`; `DELETE` removes. Slice bottom centre → another Chapter in same Context, never own Chapter; stored in slice `connectsTo` |

**Position:** server permits overlaps. Put new Chapter right of rightmost: `x = rightmost.x + 48 + sum(rightmost slice widths) + 100`, rounded to multiple of 20; `y = rightmost.y`. `48` is lane-label width. User can drag it later.

## Step 4 — Lanes

`POST /chapters/:id/lanes` `{ type, after, name?, color?, info? }`.
- `type`: `ACTOR`, `INTERACTION`, `EVENT`, `INTEGRATION`, `SPEC`; default name = type name, color = `none`.
- `after`: same-Chapter lane id; insert immediately below. Type must fit between `after` and its successor; 400 names required order.
- Prefer system-actor/Processor lanes above human-role/Screen lanes. In new Chapter, rename first Actor lane for system actor; add human lane below, further system lanes after last system lane. **Never reorder existing lanes unasked.**
- Usually Integration follows last Event lane; Spec follows last Event/Integration lane.
- **One Integration lane per external system**, named after it; `info` describes how it reaches us (`eventmodeling-core-rules`, External systems). Ask name/details; add further systems after last Integration lane.

`PATCH /lanes/:id` `{ name?, info?, color? }`; type immutable. `DELETE /lanes/:id`: deletes elements; 409 for last Actor/Interaction/Event lane.

## Step 5 — Slices

| Do | Call |
|---|---|
| Append | `POST /chapters/:id/slices` `{ name? }`; defaults "New Slice", width 220. Name exactly like Command/Read Model/Processor; never leave default |
| Insert between | Same POST `{ name, after: "<slice id>" }`; insert immediately after |
| Insert first | Create after first slice, then `PATCH /slices/:newId` `{ index: 0 }`. One `POST /ops`: create with `as: "s"`, then path `/slices/$s` |
| Move | `PATCH /slices/:id` `{ index: n }`; 0-based Chapter position, elements move too |
| Rename / resize / mark | `PATCH /slices/:id` `{ name?, info?, width?, flowEnd? }`; `flowEnd: true` marks, `false`/`null` clears |
| Delete | `DELETE /slices/:id` → `{ removed }`; 409 for last slice |

- New slice: empty, no arrows. Moving keeps arrows; report any now pointing backward.
- Server widens slices for added elements; set `width` only when asked.
- `index`: 0 through slice count − 1; out of range: 400.
- Whole slice + elements: one atomic `POST /ops`, one revision; create with `as: "s"`, elements with `slice: "$s"`.

## Step 6 — Verify and report

1. Check ids, order, widths using write response or `GET /outline`.
2. Report changed items (name, id, Chapter), deletion `removed` (elements/scenarios), `moved`, backward arrows and automatic board updates (pull behavior: API reference).
3. Errors: 400 invalid body/value, file-unsafe name, lane order, unknown body id or index range; 404 unknown path id; 409 Default, last required lane/slice or name collision. Read `error`, fix cause, retry.
