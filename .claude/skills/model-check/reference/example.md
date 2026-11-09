# Slice Example

## Contents
- Order management: slices of a Chapter
- Dependencies
- A slice that has to be split
- Checklist

---

## Order management: slices of a Chapter

The elements of the Chapter (one Chapter, slices left to right):

```
Place Order        Command   → produces Order Placed
Confirm Order      Command   → produces Order Confirmed
Authorize Payment  Command   → produces Payment Authorized
Order Details      Read Model ← reads Order Placed, Order Confirmed
Payment Status     Read Model ← reads Payment Authorized
Reserve Inventory  Processor ← todo list opened by Payment Authorized; its Command issues Reserve Inventory
```

One slice per element, never combined, each named like its element:

```
Slice: Place Order          type: state change   (Screen → Command → Event)
Slice: Confirm Order        type: state change
Slice: Authorize Payment    type: state change
Slice: Order Details        type: state read     (Read Model → Screen)
Slice: Payment Status       type: state read
Slice: Reserve Inventory    type: automation     (todo list Read Model → Processor → Command → Event)
```

There is no combined "Order Management" or "Payment Processing" slice.

---

## Dependencies

`node .claude/skills/model-check/check.mjs --chapter Orders --dependencies` prints one line per slice:

```
Dependencies between slices (through Events only):
- Orders > Place Order: produces Order Placed; depends on no other slice
- Orders > Confirm Order: produces Order Confirmed; depends on Order Placed (Orders > Place Order)
- Orders > Order Details: produces nothing; depends on Order Placed (Orders > Place Order), Order Confirmed (Orders > Confirm Order)
- Orders > Payment Status: produces nothing; depends on Payment Authorized (Orders > Authorize Payment)
- Orders > Reserve Inventory: produces Inventory Reserved; depends on Payment Authorized (Orders > Authorize Payment)
```

Reported in chat as: "Order Details depends on the Events of Place Order and Confirm Order." No slice depends on another slice directly, only on the Events it produces. `Confirm Order` appears because its scenarios have Given: Order Placed; without scenarios that dependency is invisible.

---

## A slice that has to be split

`model-check` reports a slice named "Orders" with two Commands:

```
[RULE] Orders > Orders: slice has 2 Commands (Place Order, Confirm Order): a slice has one; propose a split
```

The proposal, before anything moves:

```
Slice "Orders" (Screen Checkout, Commands Place Order and Confirm Order, Events Order Placed and Order Confirmed)
→ Slice "Place Order":   Screen Checkout, Command Place Order, Event Order Placed   (stays; renamed)
→ Slice "Confirm Order": Command Confirm Order, Event Order Confirmed              (new slice after it)
Moving keeps the arrows. Screen Checkout stays with Place Order; the arrow Checkout → Confirm Order then crosses slices.
Do you want me to do this?
```

After a yes: add the slice after "Orders" (`chapter-setup`), rename the first, move Confirm Order and its Event with `PATCH /elements/:id { slice, lane }` (`edit-and-delete`), then run the check again for the Chapter: the new slice must have type `STATE_CHANGE`.

---

## Checklist

```
[ ] Each slice has exactly one Command, one Read Model or one Processor (with its todo-list Read Model and Command)
[ ] A slice has the same name as its element (case and spacing ignored)
[ ] The slice type is what the recipe says (not null)
[ ] Dependencies are stated as "depends on the Events of X", not "depends on slice X"
[ ] A split was proposed and confirmed before any element moved
```
