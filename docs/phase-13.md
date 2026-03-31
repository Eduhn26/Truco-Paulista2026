# Phase 13 — Matchmaking Foundation

> **Status:** ✅ Complete  
> **Branch:** `feat/phase-13-matchmaking-foundation`

---

## Objective

The previous phase established a playable real-time multiplayer backend with room management, bot fill, readiness flow, and authoritative match progression. This phase built on top of that by introducing a first real matchmaking layer capable of moving players from public queue state into actual playable matches.

Phase 13 was not about advanced ranking science, smart bot AI, or production-scale distributed matchmaking.  
It was about building a defensible and operationally coherent matchmaking foundation.

The goal of this phase was to introduce a complete first matchmaking workflow, focusing on:

- public queue orchestration by mode
- rating-based pairing
- timeout and fallback handling
- automatic queue-to-match transition

---

## What was delivered

### 1) Public queue and pairing foundation

Before this deliverable, players could create or join matches manually, but there was no public waiting flow that could accumulate players and pair them automatically.

Delivered work:

- added public queue handling for `1v1` and `2v2`
- introduced isolated queue state per mode
- implemented an initial rating-based pairing policy

---

### 2) Queue timeout and fallback orchestration

Before this deliverable, players could wait indefinitely in queue, and the system had no operational answer for what should happen after timeout.

Delivered work:

- added deterministic queue expiration by wait time
- introduced pending fallback state after timeout
- added fallback actions to continue queue, start a bot match, or decline fallback

---

### 3) Automatic queue-to-match transition

Before this deliverable, even when enough compatible players existed, there was no full orchestration layer converting queue state into a real assigned match.

Delivered work:

- created matches automatically when compatible players were found
- assigned queued sockets into rooms and emitted `player-assigned`
- emitted `match-found`, room state, and initial match state after assignment

---

### 4) Recovery, readiness, and observability hardening

Before this deliverable, disconnect/reconnect behavior, queue-created readiness flow, and operational visibility around matchmaking were still incomplete.

Delivered work:

- added reconnection recovery that restores the same seat by `playerToken + matchId`
- validated readiness flow for matches created from queue
- exposed consolidated matchmaking snapshot and gateway-level observability access

---

## Architectural decisions reinforced in this phase

### Matchmaking remains outside the Domain

This phase reinforced that matchmaking is orchestration logic, not game-rule logic. Queue state, timeout, fallback, and assignment are transport/application concerns and should not leak into domain entities such as match, hand, or round.

**Gateway / Matchmaking layer** may:

- coordinate queue lifecycle
- decide how players transition into a match

**Domain layer** may:

- enforce game rules once a match exists
- remain unaware of queue, timeout, and fallback mechanics

---

### Public queue snapshots stay separate from internal queue state

This phase reinforced the rule that matchmaking boundaries must expose public snapshots instead of leaking raw internal queue structures everywhere.

This phase reinforced the rule that the queue boundary must expose:

- queue snapshots
- pairing inputs with explicit minimal shape
- observability snapshots for operational inspection

and not:

- raw internal mutation details
- unnecessary coupling between queue storage and gateway payload shape

---

### Reconnection is session recovery, not a new join

This phase reinforced that a reconnecting player must recover the original seat instead of consuming the next available seat. This decision was made now because matchmaking-created rooms would otherwise become inconsistent after disconnects and would break readiness expectations.

---

## What is not included in this phase

| Item | Reason |
|---|---|
| dynamic rating widening over time | Future phase |
| advanced MMR / ranking algorithms | Future phase |
| persistent/distributed queue storage | Future phase |
| sophisticated bot intelligence | Not part of this phase |

---

## Manual and technical validation summary

By the end of the phase, the following was true:

- players could enter queue by mode and be paired automatically
- expired queue entries could move into explicit fallback state
- queue-created matches followed the same readiness expectations as manual matches
- reconnecting players could recover the same seat instead of drifting to a new one

Validation used:

- production code compilation
- `game.gateway.spec.ts`
- `matchmaking-queue-manager.spec.ts`
- `room-manager.spec.ts`

The important result is that future evolution can now focus on matchmaking refinement and product polish instead of still building the basic queue-to-match infrastructure.

---

## Technical debt identified

### DT-HIGH — Gateway orchestration concentration

A significant amount of matchmaking orchestration now lives inside `game.gateway.ts`. This is acceptable for now because the phase goal was to complete the behavior end to end, but future growth may justify extracting a dedicated matchmaking orchestration service to reduce gateway size and improve maintainability.

---

### DT-MEDIUM — Fallback flow is operational but still simple

The fallback system now exists, but its policy is still intentionally basic. This is acceptable for now because the project needed explicit control flow first; smarter fallback strategies and richer UX decisions can be added later without reworking the whole foundation.

---

### DT-LOW — Observability is snapshot-based, not yet a richer operational surface

The matchmaking snapshot is already useful for inspection and debugging, but it is still a lightweight operational view. This is acceptable for now because the system already gained visibility without introducing premature infrastructure complexity.

---

## Final result of Phase 13

Phase 13 transformed the multiplayer orchestration layer from:

- a system where matches could be played but still depended mainly on manual room entry and manual coordination

into:

- a public queue with per-mode waiting flow
- a rating-based first pairing strategy
- timeout and fallback control after waiting too long
- automatic queue-to-match assignment with recovery and observability

This is the phase where the project stopped being only a playable real-time backend and started becoming a real multiplayer system with matchmaking foundation.