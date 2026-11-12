---
name: slice-implementation-skill-builder
description: Interview and confirm every technology decision, then generate state-change, state-read and automation/translation implementation skills. Never assume; confirm every answer and before every write. Use for "set up slice implementation for <technology>", "build the implement skills for Kotlin / .NET / TypeScript ...", "make the implement skills concrete", "change the stack of the implement skills". Not for implementing slices; use generated skills.
disable-model-invocation: true
---

# Slice Implementation Skill Builder

**Model access:** API only ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. **Every generated skill must state this rule.**

Generate **three backend-only skills**: state change, state read, automation (includes translation). **No UI/Screen/view/form/mockup code.** `reference/` defines technology-neutral slice meaning/API reads; add confirmed technology. Read `eventmodeling-core-rules` first.

| File | Holds |
|---|---|
| [reference/common.md](reference/common.md) | frontmatter, find/fetch slice (`GET /chapters/:id?slice=`), report |
| [reference/state-change.md](reference/state-change.md) | Screen → Command → Event: what to read, what to implement |
| [reference/state-read.md](reference/state-read.md) | Event(s) → Read Model → Screen: what to read, what to implement |
| [reference/automation.md](reference/automation.md) | Event → Read Model → Processor → Command → Event, and translation: what to read, what to implement |

## Rules (no exceptions)

1. **Never assume** technology/version/library/folder/name/command/convention—not usual choices, unrelated prior answers or discovered code. Not user-confirmed → ask.
2. **Confirm every answer:** repeat one line, ask yes/no/change; record only confirmed decisions. Silence/empty/declined reply is **not confirmation**; ask again or leave open.
3. **One topic at a time**, short questions, options labelled suggestions. Use ask tool if available, otherwise plain questions. "I don't know": explain options/consequences; **user chooses**.
4. Continue until **every topic confirmed or explicitly "not needed"**; never stop at enough to start.
5. **Confirm outside facts:** fetch official API/command docs, show relied-on facts, ask confirmation. Existing code: **ask reading permission**, show findings, confirm convention.
6. **No writes before final-plan approval** (Step 4). **Ask before overwriting any file.**

## Step 1 — Read the base

Read all four `reference/` files; `GET /api/model/rules` for `fieldTypes`/`fieldFlags`. Look for existing `.claude/skills/implement-*`, `stack-*.md`; show contents and ask replace/extend/keep. **Change nothing yet.**

## Step 2 — Interview

Cover **every topic**, following up to concrete names/versions/commands/paths; instructions must need no guessing.

| # | Topic | Find out |
|---|---|---|
| 1 | **Scope** | Technology name; one stack or different stacks per slice type. **Backend only/no UI is fixed; do not ask** |
| 2 | **Language and runtime** | Language, version, runtime, package manager, build tool |
| 3 | **Frameworks** | Web/application framework, DI, serialization, wanted/forbidden frameworks |
| 4 | **Event store** | Store/library; Event names/serialization/versioning; stream identity; optimistic concurrency; model Event → code type mapping |
| 5 | **Command handling** | Style (function/aggregate/decider/handler); entry (HTTP/message/other); validation; refusal format mapping to `error` scenarios; idempotency; generated time/user/ids |
| 6 | **Read models** | Storage; inline/async/catch-up/rebuild projections; exposure; keys; whether each query returns one or many items (separate from its field schema) |
| 7 | **Automation and translation** | Processor trigger (subscription/polling/schedule/bus); retry/idempotency; todo-list storage; external arrival (webhook/queue/polling/other); external → internal mapping location |
| 8 | **Project layout** | Existing/new project, root; suggest `<context name>/<chapter name>/<slice name>/`, one folder/slice, model-named Context/Chapter folders; **user confirms/changes**. File names/casing, model → code names/suffixes, shared-code location |
| 9 | **Field types** | Exact stack mapping/handling for **every** model type/flag (`list` for collection-valued attributes, `generated`, `pii`, `object`, ...), including PII treatment |
| 10 | **Tests** | Framework, GWT → test mapping, unit/integration levels, location, scenario example data |
| 11 | **Commands to run** | Exact build/test/lint/run verification commands, or none |
| 12 | **Cross-cutting** | Logging, configuration, authn/authz, time source, other shared rules |
| 13 | **Existing code** (existing project only) | Path, read permission, conventions to follow (**user confirms findings**) |
| 14 | **Output** | **User chooses** skill names (suggest `implement-state-change-<tech>`, `implement-state-read-<tech>`, `implement-automation-<tech>`), location (suggest `.claude/skills/`), replacements, shared decisions file or not (suggest `.claude/skills/stack-<tech>.md`, link `../stack-<tech>.md`) |

Answer opens dependency (e.g. library needs database): add topic, ask. **Order flexible, coverage mandatory.**

## Step 3 — Decision record

Show confirmed answers by topic, "not needed" and open topics. Ask approval/corrections of **whole record**; repeat until confirmed. **Any open topic blocks Step 4.**

## Step 4 — Plan and confirm

Each generated skill has **five steps**. Present per-skill plan, **confirm before writing**:
- Full paths of files created/replaced.
- Steps 1/2/3/5 (identify/fetch/read/report) from `reference/common.md` + type file; adjust only stack-dependent reporting; **Step 1.3 names confirmed stack**.
- Step 4 "Implement": concrete files/locations/names/contents, short templates/examples from confirmed decisions only, commands.

## Step 5 — Write

Generate skills/shared decisions if chosen from `reference/`; follow `reference/common.md` frontmatter: `name` = folder, description includes "Use for ..." / "Not for ...". **Copy needed content; never link generated skill to builder's references.**
- Technology statements trace to confirmed answers/docs; no invented API/option/command. Unknown at implementation time → skill says ask.
- Business rules **only from model/scenarios**; stack decides how, never what.
- Neutral examples (Place Order), user's naming, **never real project data**.
- **No UI or Screen HTML/URL use**; Screen only supplies fields entering Command/leaving Read Model.
- Short skills; shared facts once in decisions file, referenced by each.

## Step 6 — Verify and report

1. Re-read files: valid frontmatter/resolving links, no placeholders/unsourced statements.
2. Show **every technology decision + skill using it**; ask corrections.
3. **Offer only** trial implementation of existing slice. If accepted, use generated skill's fetch step; keep user informed.
4. Report files, decisions, "not needed" topics, open questions.
