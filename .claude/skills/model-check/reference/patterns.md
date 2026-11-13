# Slice Patterns

A slice is one Command, one Read Model, or one Processor with the Events, Read Model and Command around it (the four slice types are in `eventmodeling-core-rules`). Slices depend on each other only through Events.

## Contents
- Slice description template
- Cross-slice patterns
- Splitting patterns
- Tips

---

## Slice description template

Use it to describe a slice when proposing a split or reporting dependencies. Names are the elements' names.

```
Slice: <Command | Read Model | Processor name> (the slice has the same name)
Type: state change | state read | automation | translation

Screen:   <name> (state change and state read)
Command:  <name> — what it does              (state change, automation, translation)
Read Model: <name> — what it shows or lists    (state read; the todo list of an automation)
Processor:<name> — what it reacts to         (automation, translation)

Events produced:   <Event>: when it occurs
Events consumed:   <Event of another slice>: why it is needed
Depends on:        <Slice X>, because it produces <Event>
Depended on by:    <Slice Y>, which consumes <Event> this slice produces
```

---

## Cross-slice patterns

The board expresses a dependency in one of two ways: an arrow from an Event to a Read Model, or the Given Events of a Command's scenarios. There is never an arrow or a call between two slices' Commands.

### 1. Command slice → Event → Command slice

```
Slice: Place Order (state change)         produces Order Placed
        ↓ (no arrow)
Slice: Confirm Order (state change)       its scenarios have Given: Order Placed
```

The second Command is checked against the first one's Event. The dependency is visible only in the scenarios' Given entries, which is why a Command without scenarios hides its dependencies.

### 2. Command slice → Event → Read Model slice

```
Slice: Place Order (state change)         produces Order Placed
        ↓ arrow Order Placed → Order Details
Slice: Order Details (state read)         projects Order Placed
```

The most common dependency: nearly every state read slice depends on the Events of one or more state change slices. The server adds the arrow automatically from the right-most Event of the previous slice; any other Event is connected explicitly, except the optional distant-copy arrow in `eventmodeling-core-rules`. Omitting that arrow does not remove the dependency.

### 3. Read Model → Processor → Command (automation)

```
Slice: Reserve Inventory (automation)
  todo list Read Model  ← opened by Payment Authorized (another slice's Event)
  Processor → Command Reserve Inventory → Event Inventory Reserved (closes the item)
```

The slice depends on the Events that open its todo list; the Event its own Command produces closes it. This back arrow to the TODO Read Model used by the Processor is allowed within the same Automation slice (`eventmodeling-core-rules`).

### 4. External Event → translation

An external party's Event (in an Integration lane) feeds a todo-list Read Model; the Processor and Command turn it into an internal Event. The slice depends on the external Event only. No other Read Model is fed by the external Event: read models are fed by the internal Event (replay stays reproducible; external streams are kept only for a limited time). Flag an arrow from an Integration-lane Event to any other Read Model as a finding.

---

## Alternative business-failure flow

A Command may record a business-failure Event such as `Payment Capture Failed` when a whole alternative flow follows. Model the producing Command's scenario with that Then Event and `error: null`; a precondition rejection still records no Event.

The alternative flow may start a new Chapter with a linked copy of that Event, then model the reaction. The original Command remains the producer; use `connections` for copy placement and explicit arrows. Never replace the copy with a second independent Event definition.

## Splitting patterns

| Found | Proposal |
|---|---|
| A slice with two Commands | one state change slice per Command; each takes its Screen, Command and Events |
| A Command and a Read Model without a Processor | a state change slice for the Command and a state read slice for the Read Model |
| Two Read Models without a Processor | one state read slice per Read Model |
| Two Processors | one automation slice per Processor with its todo list and Command |

- A Screen belongs to the slice of the Command it issues, or of the Read Model it shows. A Screen that does both (a list with a Delete button) goes with the state read slice; the arrow Screen → Command then crosses slices.
- Moving an element to another slice keeps its arrows and adds none. A Cell of a Spec lane holds one element: scenarios move with their Command's slice.
- Propose first, ask, then move (`chapter-setup`, `edit-and-delete`). Never split on your own.

---

## Tips

1. **One element per slice.** Never combine a Command and a Read Model into one slice under a broader "feature" name.
2. **Name the slice after its element.** The slice has the same name as its Command, Read Model or Processor (`Place Order`); an automation slice may carry the Processor's or its Command's name.
3. **Dependencies are Events, never shared state.** Slice B needs something from slice A because B's Read Model reads, or B's Command is checked against, an Event that A produces.
4. **A linked copy is an element like any other.** It counts for the slice it sits in.
5. **Estimation and team allocation are a separate concern.** Defining slices does not need sizes, sprints or teams.
