# Phase 14 — Match History and Replay Foundation

> **Status:** ✅ Complete  
> **Branch:** `feat/phase-14-match-history-replay`

---

## Objective

The previous phase established the first real matchmaking foundation, with public queue flow, timeout and fallback handling, queue-to-match transition, and reconnection recovery.

Phase 14 built on top of that by introducing the first historical persistence layer for completed matches and a replay-oriented read surface.

Phase 14 was not about frontend history screens, advanced analytics, or rich replay visualization.  
It was about creating a defensible backend foundation for storing match history, exposing replay data, and keeping that concern outside the authoritative game Domain.

The goal of this phase was to introduce a complete first historical persistence workflow, focusing on:

- explicit match record contracts
- historical persistence modeling
- replay event storage
- history and replay read access

---

## What was delivered

### 1) Match record and replay contracts

Before this deliverable, the system had live authoritative match state and runtime snapshots, but there was no explicit contract for persisted historical match data or replay-oriented event history.

Delivered work:

- introduced explicit `MatchRecord` DTO contracts in Application
- formalized replay event DTO contracts
- defined `MatchRecordRepository` as the persistence/read boundary for history and replay

---

### 2) Historical persistence modeling

Before this deliverable, the persistence layer contained live-oriented snapshot data, but there was no dedicated schema for completed match history and replay events.

Delivered work:

- added `MatchRecord` persistence model
- added `MatchRecordParticipant` persistence model
- added `MatchReplayEvent` persistence model
- kept historical persistence separate from live `MatchSnapshot` persistence

---

### 3) Prisma repository and infrastructure wiring

Before this deliverable, the project had no infrastructure adapter capable of saving historical records or reading replay/history data through the new Application boundary.

Delivered work:

- implemented `PrismaMatchRecordRepository`
- mapped Application DTOs to persistence rows and back
- wired `MATCH_RECORD_REPOSITORY` into `GameModule`
- preserved the same token/provider pattern already used by the project

---

### 4) Application use cases for history and replay

Before this deliverable, historical persistence and replay reads were not exposed through dedicated use cases.

Delivered work:

- added `SaveMatchRecordUseCase`
- added `GetMatchHistoryUseCase`
- added `GetMatchReplayUseCase`
- validated contract normalization at Application level without leaking Prisma into use cases

---

### 5) Unit coverage for history and replay Application flow

Before this deliverable, the new historical/replay use cases had no isolated verification layer.

Delivered work:

- added unit tests for `SaveMatchRecordUseCase`
- added unit tests for `GetMatchHistoryUseCase`
- added unit tests for `GetMatchReplayUseCase`
- validated success paths and rejection paths without depending on Gateway or browser flow

---

### 6) Gateway read surface for history and replay

Before this deliverable, the backend had historical persistence internally, but there was no transport-level read access for clients.

Delivered work:

- exposed `get-match-history` in `GameGateway`
- exposed `get-match-replay` in `GameGateway`
- emitted `match-history` and `match-replay` payloads through the existing gateway pattern
- added gateway-level tests for history/replay reads

---

## Architectural decisions reinforced in this phase

### Match history remains outside the Domain

This phase reinforced that historical persistence and replay are not game-rule concerns. The Domain remains responsible for authoritative game rules during live match execution, while history/replay are application and infrastructure concerns derived from completed play.

**Application / Infrastructure / Gateway layers** may:

- persist historical match records
- expose replay-oriented read models
- map live outcomes into historical storage

**Domain layer** may:

- enforce authoritative rules of match, hand, and round
- remain unaware of persistence schema, replay transport, and history queries

---

### Live snapshots and historical records must stay separate

This phase reinforced that `MatchSnapshot` and `MatchRecord` solve different problems and must not be merged into a single persistence abstraction.

This phase reinforced the rule that the backend must keep separate:

- live runtime snapshot state
- completed historical record state
- replay event history for ordered reconstruction

and not:

- treat historical persistence as just another mutable live snapshot
- overload a single persistence model with both runtime and archival responsibilities

---

### Replay is a historical projection, not transport leakage

This phase reinforced that replay should be modeled as an ordered historical event projection instead of reusing raw socket payloads or leaking transport mechanics into persistence.

This phase reinforced the rule that replay boundaries must expose:

- ordered replay events
- explicit event type
- payloads shaped for historical reconstruction

and not:

- raw websocket mutation payloads
- gateway-specific incidental details
- implicit replay behavior tied to frontend assumptions

---

## What is not included in this phase

| Item | Reason |
|---|---|
| frontend history UI | Future phase |
| replay visualization / timeline UX | Future phase |
| advanced analytics / statistics dashboards | Future phase |
| automatic historical persistence integrated into full match completion flow | Future phase |
| long-term archival strategy / storage optimization | Future phase |

---

## Manual and technical validation summary

By the end of the phase, the following was true:

- historical match records could be modeled through explicit Application contracts
- dedicated persistence models existed for match record, participants, and replay events
- Prisma infrastructure could save and read history/replay through `MatchRecordRepository`
- Application use cases could save history, list history, and fetch replay
- Gateway transport could expose history and replay reads without touching the Domain

Validation used:

- production code compilation
- ESLint + Prettier validation
- Prisma migration and schema generation
- unit tests for history/replay use cases
- gateway tests for history/replay reads

The important result is that future evolution can now focus on historical integration, replay consumption, and product-facing history features instead of still building the backend foundation for persisted match history.

---

## Technical debt identified

### DT-HIGH — Historical persistence is available, but write integration into full match lifecycle is still pending

The project now has the contracts, persistence models, repository, and use cases for history/replay, but the authoritative match completion flow is not yet fully orchestrating final historical persistence end to end. This is acceptable for now because the goal of the phase was to establish the foundation first, not to couple persistence prematurely into every live path.

---

### DT-MEDIUM — Replay payloads are explicit but still basic

Replay events are now modeled and stored in an ordered way, but the replay representation is still intentionally simple. This is acceptable for now because the system needed a stable historical projection first; richer replay semantics can be added later without redesigning the core persistence boundary.

---

### DT-MEDIUM — Gateway now exposes read access, but product-facing consumption is still minimal

The backend can already serve history and replay through the existing gateway pattern, but the frontend/product layer does not yet fully consume these capabilities. This is acceptable for now because backend foundation had to exist before UX evolution.

---

### DT-LOW — Match record validation is contract-focused, not yet enriched by broader product policy

The Application layer now validates historical record input shape and normalization, but broader product policies such as pagination strategy, query filters, or retention behavior are still intentionally out of scope. This is acceptable for now because the phase goal was historical correctness and defensible separation of concerns first.

---

## Final result of Phase 14

Phase 14 transformed the backend from:

- a system with authoritative live play and runtime snapshots, but without a real historical persistence boundary for completed matches

into:

- an explicit `MatchRecord` contract layer
- dedicated persistence models for historical records, participants, and replay events
- a Prisma-backed history/replay repository
- Application use cases for save/list/replay flows
- gateway read access for history and replay

This is the phase where the project stopped treating completed matches as only live runtime aftermath and started becoming a system with a real historical persistence and replay foundation.