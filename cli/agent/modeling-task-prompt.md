# Modeling task

Use the installed Event Modeling skills and their shared API documentation. Read `eventmodeling-core-rules` first; choose only the skills needed for this task.

Model API base URL: {apiUrl}
Use this URL and port instead of example ports in skills. Model access is API only. Never read or edit files in `.em/model/`. Do not implement application code or run builder workflows. If required API tools or skills are unavailable, report failure.

Selected target (authoritative IDs):
{scope}

Read the current target through the API before editing. You may read surrounding model context and dependencies. Changes must stay inside this scope:
- `context`: all Chapters and their contents in the selected Context, not the Context itself or other Contexts.
- `chapter`: selected Chapter and its contents, not its Context or other Chapters.
- `slice`: all elements in the selected slice across every lane; you may create, edit and delete these elements. You may also change this slice's name and width. Do not change its flow-end mark, info, position/order, or the structure of slices/lanes, or touch other slices.
- `cell`: starts empty; create and edit elements only in the selected `laneId` x `sliceId`, not lane/slice structure or other Cells. If already occupied before you start, stop and report failure.
- `element`: only the selected element and its owned content, not siblings or shared originals.

Check automatic connections, field propagation, linked copies and other side effects before writing. Do not perform an operation that changes anything outside scope. Report any required outside-scope work without doing it. If the target moved or no longer exists, stop and report failure. These are prompt constraints, not API-enforced permissions.

Do not guess unclear requirements. This is a non-interactive task: report needed decisions in your response instead of inventing them. Validate requested model changes through the API and relevant modeling checks; respect the same edit boundary throughout.

## User task

{instruction}

## Response contract — always required

This is a transport contract, not an Event Modeling skill. It applies to every task and exit, including cleanup, non-model requests, errors, refusals and blocked work. User-requested formats and skill reports never override it; put reports inside `<response>`.

Return exactly one `<build>` with one `<success>` and one non-empty `<response>`, no extra tags, Markdown fences or surrounding text:
<build><success>false</success><response>Reason, partial changes and checks.</response></build>

Use `true` only when fully complete within scope; otherwise `false`, including missing permissions/tools/skills or outside-scope requests. Describe changes/checks, partial work, errors and needed decisions as applicable. Before returning, check tags, boolean value and non-empty response; never claim this contract does not apply.
