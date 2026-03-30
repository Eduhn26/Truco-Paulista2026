# Phase 12 — Bot Architecture Hardening

> **Status:** ✅ Complete  
> **Branch:** `feat/phase-12-bot-architecture`

---

## Objective

Phase 11 proved that the project could support a real authenticated **human-vs-bot browser loop**.

Phase 12 was not about making the bot “smarter.”  
It was about making the **bot architecture defensible**.

The goal of this phase was to harden the bot boundary so the current local heuristic adapter could remain useful now while also preparing the project for a future external Python-based decision service.

This phase focused on:

- stabilizing the bot decision contract
- formalizing bot profile policy
- clarifying gateway orchestration responsibilities
- strengthening the local heuristic adapter as an official baseline
- expanding unit test confidence
- making bot input more transport-agnostic
- preparing infrastructure wiring for multiple adapters

---

## What was delivered

### 1) Bot decision contract hardening

The original bot flow was still carrying traces of the broader room-oriented phase 11 design.

Delivered work:

- a hardened `BotDecisionPort`
- `BotDecisionContext` established as the decision boundary
- explicit `BotDecision` output contract
- reduction of bot-side knowledge to decision-relevant state only

This moved the system away from “bot adapter that understands room orchestration” toward “adapter that receives a proper decision input.”

---

### 2) Formal bot profile contract

Bot profiles stopped being just an implicit agreement between room code and heuristic behavior.

Delivered work:

- explicit `BotProfile` type
- deterministic seat → profile mapping formalized in the application contract
- room logic consuming the formalized default profile policy instead of hiding it as an unnamed local rule

This made profile policy easier to reason about, easier to test, and easier to reuse.

---

### 3) Gateway orchestration clarified

The gateway was already responsible for bot turn continuation, but the internal flow was still too concentrated in a single method.

Delivered work:

- clearer split between:
  - bot turn loop orchestration
  - execution of a single bot turn
- improved readability around:
  - authoritative state fetch
  - bot context resolution
  - bot decision execution
  - state emission
  - post-turn finalization

This did not move any rule into the Domain. It simply made the orchestration boundary cleaner.

---

### 4) Heuristic bot adapter became the official local baseline

The project already had a heuristic bot, but the behavioral differences between profiles were still too implicit.

Delivered work:

- profile strategies made explicit
- clear distinctions between:
  - `aggressive`
  - `balanced`
  - `cautious`
- behavior made more intentional for:
  - opening plays
  - winning responses
  - losing discards

This phase did not try to create a strong competitive AI.  
It created a clear **baseline local adapter** that is stable enough to defend architecturally.

---

### 5) Expanded unit coverage for the heuristic adapter

The adapter moved from “good enough to play” toward “well-defined and test-backed.”

Delivered work:

- stronger profile coverage
- tests for:
  - opening move behavior by profile
  - winning response behavior by profile
  - discard behavior by profile
  - single-card and small-hand cases
  - player-one / player-two opponent card interpretation
- tests kept fully local and framework-independent

This was important because the adapter is now a real baseline component, not a temporary shortcut.

---

### 6) Transport-agnostic bot input

The bot decision input was reduced to decision-relevant state.

Delivered work:

- removal of orchestration-specific details from `BotPlayerView`
- bot input no longer depends on room seat metadata to make a decision
- `seatId` and `teamId` remain available in gateway orchestration where they belong, but no longer pollute the decision contract

This is one of the most important future-facing improvements of the phase.

It means the question “should this adapter be local TypeScript or remote Python?” becomes an infrastructure concern rather than a contract redesign problem.

---

### 7) Infrastructure prepared for multiple adapters

The bot decision wiring remained interface-first, but the module setup was made more explicit about adapter selection.

Delivered work:

- `BOT_DECISION_PORT` remains the injected boundary
- module wiring made clearer around the current default adapter
- infrastructure is now more obviously ready for a future `PythonBotAdapter`

This means a future migration to another adapter should primarily affect infrastructure wiring and adapter implementation, not the gateway contract or the application boundary.

---

## Architectural decisions reinforced in this phase

### Decision belongs to the bot adapter, orchestration belongs to the gateway

The gateway may:

- detect bot turn
- resolve the seat and room context
- build the bot decision input
- continue the gameplay loop

The bot adapter may:

- inspect the decision context
- choose the next action

This keeps orchestration and strategy separate.

---

### Bot input should not mirror room internals

A future Python adapter should not need to understand socket-oriented room internals just to choose a card.

This phase reinforced the rule that the bot boundary must expose:

- what the bot needs to decide

and not:

- everything the gateway happens to know

---

### Profile policy is a contract, not a hidden helper rule

If the project wants stable profile semantics, the mapping between profile policy and bot behavior cannot remain hidden in arbitrary room code.

This phase made profile policy part of the architecture rather than part of implementation folklore.

---

### The heuristic adapter is a baseline, not a dead end

The current local adapter is intentionally simple, but that simplicity is now organized and test-backed.

That matters because the future Python service should replace or extend a stable baseline, not rescue a loose prototype.

---

## What is not included in this phase

| Item | Reason |
|---|---|
| Remote Python bot adapter | Future phase |
| FastAPI integration | Future phase |
| Network retries / timeout policy for remote bot calls | Future phase |
| Advanced bot memory or match history context | Future phase |
| Competitive-strength Truco AI | Future phase |
| Matchmaking logic | Not part of this phase |
| Replay / match history | Not part of this phase |

---

## Manual and technical validation summary

By the end of the phase, the following was true:

- bot decision contract is explicit
- bot profile policy is formalized
- gateway bot flow is cleaner internally
- heuristic bot strategies are explicit
- heuristic adapter coverage is stronger
- bot input is more transport-agnostic
- infrastructure wiring is ready for multiple adapters

Validation used:

- production code compilation
- gateway bot flow tests
- room manager tests
- heuristic bot adapter tests

The important result is that future bot evolution now looks like **adapter evolution**, not **cross-cutting architecture rework**.

---

## High technical debt identified

### DT-HIGH — local heuristic remains intentionally shallow

The heuristic adapter is now a stable baseline, but it is still intentionally simple.

This is acceptable because the purpose of this phase was architecture hardening, not competitive AI quality.

---

### DT-HIGH — adapter selection is still static

The module wiring is now clearer, but the project does not yet expose a more dynamic selection mechanism between local and future remote adapters.

That is acceptable for now because phase 15 will be the first real consumer of that flexibility.

---

### DT-HIGH — richer bot context is intentionally deferred

The current decision input is intentionally compact.

Future adapters may benefit from richer history-aware inputs, but phase 12 deliberately stopped before expanding the contract prematurely.

This avoids overfitting the boundary to assumptions that belong to a later AI phase.

---

## Final result of Phase 12

Phase 12 transformed the bot architecture from:

- a playable but still phase-11-shaped local bot flow

into:

- a hardened decision boundary
- explicit profile policy
- clearer gateway orchestration
- a formal local heuristic baseline
- stronger adapter test coverage
- a transport-agnostic decision input
- infrastructure wiring that is ready for future adapter replacement

This is the phase where the project stopped merely **having a bot** and started **having a bot architecture**.