---
name: naming
description: Quick reference for naming things in the model — Events, Commands, Queries, Screens, Processors, scenarios, slices, lanes, Chapters and Contexts — with valid and invalid examples and the file-safe name rules. Use whenever you are about to name or rename something, or to check a name.
---

# Naming

Short reference. The definitions behind the element rules are in `eventmodeling-core-rules` (Elements, Anti-Patterns); this skill only collects the naming rules so you do not have to load all of it. Names are business language: what a domain expert would say, never the machinery. When unsure about a name, ask the user.

## Elements

| Type | Form | Valid | Invalid |
|---|---|---|---|
| `EVENT` | Past tense, a business fact | `OrderPlaced`, `PaymentAuthorized`, `UserRegistered` | `SidebarOpened`, `RequestCompleted`, `ApiCalled` (machinery or UI state) |
| `COMMAND` | Imperative, business intent | `PlaceOrder`, `ConfirmPayment`, `CancelSubscription` | `LoadOrders`, `FetchData`, `OpenDialog` (queries or UI actions) |
| `QUERY` | Noun phrase, named for the data | `OrderSummary`, `InvoiceList` | `OrderSummaryProjector`, `InvoiceListRepository` (implementation) |
| `SCREEN` | What a user would call it | `Dashboard`, `OrderOverviewPage` | `OrderOverviewComponent`, `ProjectorView` |
| `PROCESSOR` | What it does, as a business actor | `BillingScheduler`, `InventoryReserver` | `OrderServiceHandler` |

- Be concrete: `Record Blood Pressure` → `Blood Pressure Recorded`, not `Commit Composition`.
- Usually a Command and its Event share the subject: `Place Order` → `Order Placed`.
- A linked copy has no name of its own: it shows its original's. Rename the original.
- An element name may be empty on the board, but an unnamed element is a gap: name every element you create.
- Do not model UI events (`ButtonClicked`) or technical events unless the business cares.
- An Event that holds a computed value is a Query.

## Everything else

| Thing | Rule |
|---|---|
| Slice | Named for the behaviour it models, not its type: "Place order", "Order overview". Not left as "New Slice" |
| Scenario | A short business sentence for one case: "Place order with a valid payment", "Reject order when stock is empty". Not empty. The reason goes in the description |
| Lane | By role or system actor on an Actor lane (Customer, Seller, Payment Gateway), never a generic "User"; other lanes keep their type name unless the user wants one |
| Chapter | By the business process it covers ("Orders", "Registration"); ask when unclear. Not left as "Chapter 1" |
| Context | By the bounded context ("Registration", "Orders"). It is a file name: see below |
| Field | Exactly as the Screen shows it or the Command carries it; the same name all along the flow (fields are copied by name) |

## File-safe names

A **Context** name becomes a file name, so the server refuses (400) one that:
- contains `\ / : * ? " < > |` or a control character;
- ends with a dot, is empty, or is `contexts`;
- is a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`, also with an extension);
- equals another Context's name when compared case-insensitively (409).

Chapter and slice names are not file names and the server does not check them, but the board filters the same characters: avoid them everywhere. A name is never empty. Never change a name to make it fit: ask the user.

## Checking names

`model-check` finds empty names, the default "New Slice" and Commands that read like queries. It does not judge tense or business language: read the names against the table above.
