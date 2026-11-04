---
name: prototype
description: Build a clickable, event-sourced prototype of one context (a MODEL_CONTEXT or a timeline's effective context) as a single HTML page the platform serves — React standalone, no build step, no server logic. Built slice by slice — one block per slice, each with a hash of its slice — so a re-run regenerates only the slices that changed on the board. Screens become tabs (one per screen name) rebuilt 1:1 from the board's HTML screens or sketches; each read model is one component, each command the inputs and button that fire it; events are recorded in an in-browser event store and can be browsed; logic and todo lists follow the GWT scenarios, which also run as an in-page check; automations appear in their own tab when their todo list has items. Read-only on the board. Use for "build a prototype of X", "make the Registration context clickable", "update the prototype".
---

Clarification: Posting the questions means reporting.

---

## Step 1 — Gather inputs

1. **Context name** — the bounded context to focus on (e.g. `Registration`, `Orders`) — ask if not provided.

If the user already provided context name in their message, use it directly.

---

## Step 2 — Load the model

Find the relevant context in .event-modeling/model/contexts.yaml and using its name, locate the corresponding chapters (they're in a folder with the context name with whitespaces replaced with _).

Then get Chapter information by calling http://localhost:5173/api/model/contexts/<context id>/chapters?screenContent=true

Each response contains screens, commands, events, read models, specs, scenarios, actors, automations, and the edges between them.

Keep track of:
- All slice titles and their element types
- Which slices have GWT (Given/When/Then) scenarios (specs) and which don't
- The names of all EVENTs, COMMANDs, READMODELs, and SCREENs
- Edges/relationships between elements

---

## Step 3 — Build clickable prototype

Use the html content of the screens to build a clickable prototype. Put it in the /prototype folder.

Screen HTML is a full document with global styles (`body`, `*`, `form`, ...). Render each screen in an `<iframe srcdoc>` so its styles and the prototype's styles don't leak into each other.

- Wire the screens from the parent page: attach listeners and re-render via `frame.contentDocument` after the frame's `load`.
- Do NOT set the `sandbox` attribute on the iframe. Without `allow-scripts` the browser blocks the parent's listeners ("Blocked script execution in 'about:srcdoc'"). `allow-scripts` + `allow-same-origin` cancels the sandbox anyway, and the content is the user's own board HTML.
