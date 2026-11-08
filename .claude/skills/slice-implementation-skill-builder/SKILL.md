---
name: slice-implementation-skill-builder
description: Interview the user to find out which technologies slices are to be implemented with, then build the three slice-implementation skills (state change, state read, automation + translation) for exactly that technology. Never assumes anything and asks for confirmation of every answer and before every write. Use for "set up slice implementation for <technology>", "build the implement skills for Kotlin / .NET / TypeScript ...", "make the implement skills concrete", "change the stack of the implement skills". Not for implementing a slice (use the skills this one builds).
---

# Slice Implementation Skill Builder

**Model access:** the model is read and changed only through the API ([../api.md](../api.md)). Never read, create, edit or delete files in `.event-modeling/`. Every skill this builder generates states this rule.

Builds the three slice-implementation skills for one technology: **state change**, **state read** and **automation** (automation and translation share one skill). The technology-neutral knowledge of what each slice type means and how to read it from the server lives in this skill's `reference/` folder; the builder adds the technology. Read `eventmodeling-core-rules` first. Endpoints: [../api.md](../api.md).

| File | Holds |
|---|---|
| [reference/common.md](reference/common.md) | frontmatter rules, find the slice, fetch it (`GET /chapters/:id?slice=`, S4.21), report |
| [reference/state-change.md](reference/state-change.md) | Screen → Command → Event: what to read, what to implement |
| [reference/state-read.md](reference/state-read.md) | Event(s) → Query → Screen: what to read, what to implement |
| [reference/automation.md](reference/automation.md) | Event → Query → Processor → Command → Event, and translation: what to read, what to implement |

## Rules (no exceptions)

1. **Never assume.** Not a technology, version, library, folder, name, command or convention. Not "the usual choice", not what the user said earlier about another topic, not what you find in the code. If it is not an answer the user gave and confirmed, it is a question.
2. **Confirm everything.** After each answer, repeat it in one line and ask the user to confirm or correct it (yes / no / change). Only a confirmed answer goes into the decision record. A silent, empty or declined reply is not a confirmation: ask again or mark the topic open.
3. **One topic at a time**, short questions, with the options you know as suggestions marked as suggestions. Use the ask tool when available, otherwise plain questions. "I don't know" is an answer: offer the options with their consequences, the user decides; do not pick for them.
4. **Keep interviewing until every topic below is confirmed or explicitly marked "not needed" by the user.** Do not stop at "enough to start".
5. **Facts from outside need the user's eye.** Library APIs and commands: read the official documentation (fetch it), show what you will rely on, and have the user confirm it. Existing code: ask permission to read it, show what you found, have the user confirm it is the convention to follow.
6. **Write nothing until the user has confirmed the final plan** (Step 4). Never overwrite a file without asking.

## Step 1 — Read the base

Read the four files in `reference/`. Also `GET /api/model/rules` (`fieldTypes`, `fieldFlags`) for the field mapping topic. Check whether skills for a technology already exist in `.claude/skills/` (names `implement-*`, `stack-*.md`): if so show the user what they say and ask whether they are to be replaced, extended or kept. Do not change anything yet.

## Step 2 — Interview

Cover every topic. Ask what is needed to write instructions an agent can follow without guessing. Follow up until the answer is concrete (names, versions, commands, paths).

| # | Topic | Find out |
|---|---|---|
| 1 | **Scope** | Technology name for the skills; one stack for all three slice types, or different ones; backend only, or also UI |
| 2 | **Language and runtime** | Language, version, runtime, package manager, build tool |
| 3 | **Frameworks** | Web/application framework, dependency injection, serialization, any framework the user wants or forbids |
| 4 | **Event store** | Which store or library; how events are named, serialized and versioned; stream per what (id of what); optimistic concurrency; how Events of the model map to event types |
| 5 | **Command handling** | Style (e.g. function, aggregate, decider, handler class); how a Command arrives (HTTP, message, other); validation; error/refusal representation (maps to the `error` scenarios); idempotency; how `generated` fields (time, acting user, ids) are produced |
| 6 | **Read models** | Where they are stored; how projections run (inline, async, catch-up/rebuild); how a Query is exposed; keys and `list` fields |
| 7 | **Automation and translation** | How Processors are triggered (subscription, polling, schedule, message bus); retry and idempotency; how the todo list is kept; for translation: how external Events arrive (webhook, queue, polling, other) and where the mapping to internal Events lives |
| 8 | **Screens / UI** | Whether the skills build UI at all; technology; how the Screen mockup (`html`) is used (reference, converted, ignored) |
| 9 | **Project layout** | Existing project or new; root folder; one folder per slice or layers; file names and casing; how model names map to code names (casing, suffixes); where shared code goes |
| 10 | **Field types** | For each model field type and flag (`list`, `generated`, `pii`, `object`, ...) the exact type or handling in this stack; how `pii` fields are treated |
| 11 | **Tests** | Framework; how a Given/When/Then scenario becomes a test; test levels (unit, integration); where tests live; example data from the scenario |
| 12 | **Commands to run** | Exact build, test, lint and run commands the skills must execute to verify their work (or: none) |
| 13 | **Cross-cutting** | Logging, configuration, authentication/authorisation, time source, anything else every slice must follow |
| 14 | **Existing code** (only if there is a project) | Path; permission to read it; which parts are the convention to follow (the user confirms what you found) |
| 15 | **Output** | Names of the three skills (suggest `implement-state-change-<tech>`, `implement-state-read-<tech>`, `implement-automation-<tech>`, but the user chooses), where they are written (suggest `.claude/skills/`), whether an existing skill of the same name is replaced, and whether the shared decisions go into one file next to them (suggest `.claude/skills/stack-<tech>.md`, referenced as `../stack-<tech>.md`) |

When an answer opens a new question (e.g. a chosen library needs a database), add that topic and ask it. Order may change; coverage may not.

## Step 3 — Decision record

Show all confirmed answers, grouped by topic, as one list, with the topics the user marked "not needed" and any still open. Ask the user to confirm the whole record or name what to change. Repeat until confirmed. An open topic blocks Step 4.

## Step 4 — Plan and confirm

Each generated skill has five steps. Say, per skill, what it will contain, then ask for confirmation before writing:

- the files to be created or replaced (full paths);
- Steps 1, 2, 3 and 5 (which slice, fetch it, read it, report) come from `reference/common.md` and the type file, adjusted only where the stack changes what is reported; Step 1.3 names the confirmed stack;
- Step 4 "Implement" is the type file's neutral part made concrete: files to create and where, names, what each file contains (as a short template or example built only from confirmed decisions), the commands to run.

## Step 5 — Write

Write the skills (and the shared decisions file if chosen) from the `reference/` files, following the frontmatter rules in `reference/common.md` (`name` equal to the folder, a `description` with "Use for ..." and "Not for ..."). A generated skill never links to this builder's `reference/` files: copy what it needs. Rules for the content:

- Every technology statement traces to a confirmed answer or to documentation the user confirmed. No invented API, option or command. Where something is still unknown at implementation time, the skill says to ask the user.
- Keep the rule of the type files that business rules come only from the scenarios and the model; the stack decides how, never what.
- Examples use the user's naming rules and a neutral business example (e.g. Place Order), never real project data.
- Keep each skill short; shared facts go in the decisions file once, referenced from each skill.

## Step 6 — Verify and report

1. Re-read each written file: frontmatter valid, links resolve, no placeholder left, no statement without a confirmed source.
2. Show the user a list of every technology decision used and the skill it appears in; ask whether anything is wrong.
3. Offer (do not start) a trial run: implement one existing slice with the new skill. If accepted, use the slice-fetch step of the new skill and keep the user in the loop.
4. Report: files written, decisions recorded, topics marked "not needed", open questions.
