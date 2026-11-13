---
name: naming
description: Naming rules and valid/invalid examples for elements, scenarios, slices, lanes, Chapters, Contexts and fields, including file-safe names. Use when naming, renaming or checking names.
---

# Naming

Standalone naming reference; definitions: `eventmodeling-core-rules` (Elements, Anti-Patterns). Use domain experts' business language, never machinery. Unsure: ask.

## Elements

| Type | Form | Valid | Invalid |
|---|---|---|---|
| `EVENT` | Past tense, a business fact | `OrderPlaced`, `PaymentAuthorized`, `UserRegistered` | `SidebarOpened`, `RequestCompleted`, `ApiCalled` (machinery or UI state) |
| `COMMAND` | Imperative, business intent | `PlaceOrder`, `ConfirmPayment`, `CancelSubscription` | `LoadOrders`, `FetchData`, `OpenDialog` (read models or UI actions) |
| `READ_MODEL` | Noun phrase, named for the data | `OrderSummary`, `InvoiceList` | `OrderSummaryProjector`, `InvoiceListRepository` (implementation) |
| `SCREEN` | What a user would call it | `Dashboard`, `OrderOverviewPage` | `OrderOverviewComponent`, `ProjectorView` |
| `PROCESSOR` | What it does, as a business actor | `BillingScheduler`, `InventoryReserver` | `OrderServiceHandler` |

- Concrete: `Record Blood Pressure` → `Blood Pressure Recorded`, not `Commit Composition`.
- Command/Event usually share subject: `Place Order` → `Order Placed`.
- Linked copy shows original's name; rename original.
- Board permits unnamed elements, but these are gaps: name every element created.
- No UI (`ButtonClicked`) or technical events unless business-relevant.
- Computed value belongs in a Read Model, not an Event.

## Everything else

| Thing | Rule |
|---|---|
| Slice | **Exact Command, Read Model or Processor name**, including case/spacing (`Place Order`, `Order Summary`). Automation: Processor or Command name. Never "New Slice" |
| Scenario | Nonempty, short business sentence for one case: "Place order with a valid payment", "Reject order when stock is empty". Reason in description |
| Lane | Actor: specific role/system actor (Customer, Seller, Payment Gateway), never generic "User". Others: type name unless user requests otherwise |
| Chapter | Business process ("Orders", "Registration"); ask if unclear. Never leave "Chapter 1" |
| Context | Bounded context ("Registration", "Orders"); file-safe (below) |
| Field | Exact Screen/Command field name, unchanged along flow: copying uses names |

## File-safe names

**Context** names become file names. Server rejects:
- 400: `\ / : * ? " < > |`, control characters, trailing dot, empty name, `contexts`, Windows device names (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, including extensions).
- 409: case-insensitive collision with another Context name.

Chapter/slice names are not file names or server-checked, but board filters the same characters: avoid them everywhere. Names never empty. **Ask; never alter a name to make it fit.**

## Checking names

`model-check` finds empty names, "New Slice" and query-like Commands; it cannot judge tense/business language. Check those against the table yourself.
