---
name: prototype
description: Build a clickable prototype of one context as pages in the /prototype folder, from the HTML of the context's Screens (each rendered in an iframe and wired from the parent page). Reads the model through the server API; read-only on the board. Use for "build a prototype of X", "make the Registration context clickable", "update the prototype".
---

Clarification: Posting the questions means reporting.

---

## Step 1 — Gather inputs

1. **Context name** — the bounded context to focus on (e.g. `Registration`, `Orders`) — ask if not provided.

If the user already provided context name in their message, use it directly.

---

## Step 2 — Load the model

Find the relevant context in .event-modeling/model/contexts.yaml; its Chapters are in the file named by `file` of its entry (e.g. .event-modeling/model/backoffice.yaml).

Then get Chapter information by calling http://localhost:5173/api/model/contexts/<context id>?screenContent=true
Use the `model-navigation` skill for other reads (outline first, then only the content you need).

Each Chapter has lanes, slices and elements (`SCREEN`, `COMMAND`, `EVENT`, `QUERY`, `PROCESSOR`, `SCENARIOS`, `NOTES`) with their arrows (`connectsTo`); Screens, Commands, Events and Queries have `fields`, and a `SCENARIOS` element holds the scenarios.

Keep track of:
- All slice titles and their element types
- Which slices have a `SCENARIOS` element with Given/When/Then scenarios and which don't
- The names of all EVENTs, COMMANDs, QUERYs, and SCREENs
- Edges/relationships between elements

---

## Step 3 — Build clickable prototype

Use the html content of the screens to build a clickable prototype. Put it in the /prototype folder.

Screen HTML is a full document with global styles (`body`, `*`, `form`, ...). Render each screen in an `<iframe srcdoc>` so its styles and the prototype's styles don't leak into each other.

- Wire the screens from the parent page: attach listeners and re-render via `frame.contentDocument` after the frame's `load`.
- Do NOT set the `sandbox` attribute on the iframe. Without `allow-scripts` the browser blocks the parent's listeners ("Blocked script execution in 'about:srcdoc'"). `allow-scripts` + `allow-same-origin` cancels the sandbox anyway, and the content is the user's own board HTML.
