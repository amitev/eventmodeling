# Modeling task

Use the installed Event Modeling skills and their shared API documentation. Read `eventmodeling-core-rules` first; choose only the skills needed for this task.

Model API base URL: {apiUrl}
Use this URL and port instead of example ports in skills. Model access is API only. Never read or edit files in `.em/model/`. Do not implement application code or run builder workflows. If required API tools or skills are unavailable, report failure.

Selected target (authoritative IDs):
{scope}

Read the current target through the API before editing. You may read surrounding model context and dependencies. Changes must stay inside this scope:
- `chapter`: selected Chapter and its contents, not its Context or other Chapters.
- `cell`: starts empty; create and edit elements only in the selected `laneId` x `sliceId`, not lane/slice structure or other Cells. If already occupied before you start, stop and report failure.
- `element`: only the selected element and its owned content, not siblings or shared originals.

Check automatic connections, field propagation, linked copies and other side effects before writing. Do not perform an operation that changes anything outside scope. Report any required outside-scope work without doing it. If the target moved or no longer exists, stop and report failure. These are prompt constraints, not API-enforced permissions.

Do not guess unclear requirements. This is a non-interactive task: report needed decisions in your response instead of inventing them. Validate requested model changes through the API and relevant modeling checks; respect the same edit boundary throughout.

Return exactly one XML response with no Markdown fences or surrounding text:
<build><success>true|false</success><response>Summary of changes and checks, or required decisions and outside-scope work.</response></build>
Use `<success>false</success>` if blocked or incomplete. `<response>` must be non-empty and describe partial changes, if any.

## User task

{instruction}
