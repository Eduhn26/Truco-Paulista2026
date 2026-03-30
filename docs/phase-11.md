# Phase 11 — 1v1 Playability, Bot Fill, and Public/Private Match State

> **Status:** ✅ Complete  
> **Branch:** `feat/phase-11-1v1-bot-fill`

---

## Objective

Turn the project from an authenticated frontend shell plus multiplayer debug flow into a **real locally playable game loop**.

The main goal of this phase was to remove the biggest practical bottleneck left by the previous phase: the need for multiple authenticated human sessions just to validate room readiness, start a hand, and play through the lifecycle.

This was achieved by introducing:

- real **`1v1` mode**
- **automatic bot seat filling**
- a backend-driven **bot decision adapter**
- **gateway bot turn processing**
- safer **public/private match state projection**
- frontend consumption of **private player hand state**
- clearer browser UX for **hand progression** and **hand completion**

The project now supports a genuine authenticated browser flow where a single player can:

1. authenticate
2. create or join a room
3. receive a bot opponent automatically
4. start a hand
5. play cards
6. receive bot responses in real time
7. finish the hand
8. continue into the next hand

without violating the architectural boundaries established in earlier phases.

---

## What was delivered

### 1) `1v1` mode in room orchestration

The room layer evolved from a fixed 2v2 assumption into a **mode-aware coordinator**.

Delivered behavior:

- support for `1v1` and `2v2`
- mode-aware seat order
- mode-aware room capacity
- mode-aware readiness validation
- mode-aware turn rotation

This means the transport layer no longer assumes four real humans are required to make the game operational.

---

### 2) Automatic bot seat filling

Missing seats can now be filled automatically by bots.

Delivered behavior:

- in `1v1`, the missing opponent seat is bot-filled
- in partial `2v2`, remaining seats can also be bot-filled
- bot sessions behave like real room occupants for readiness and turn orchestration
- humans can later replace bot seats cleanly

This was the key playability unlock for local browser testing.

---

### 3) Deterministic bot profiles

Bots are no longer just anonymous placeholders.

Delivered behavior:

- bots receive deterministic profiles by seat
- room state can resolve a bot profile for the current seat
- the gateway forwards that real profile into the bot decision boundary
- tests now lock down the seat → profile mapping

This created a stable foundation for future bot evolution without coupling strategy to the frontend or to the gateway itself.

---

### 4) Heuristic bot adapter

A real bot decision adapter was introduced.

Delivered behavior:

- dedicated bot decision boundary
- heuristic adapter implementation
- support for multiple behavior profiles:
  - `balanced`
  - `aggressive`
  - `cautious`
- decision logic for:
  - opening moves
  - winning responses
  - discard behavior when no winning move exists

The bot is now a genuine infrastructure/application component rather than an improvised frontend crutch.

---

### 5) Gateway-driven bot turn processing

The gateway now continues the hand flow after human actions.

Delivered behavior:

- after `start-hand`, the gateway can process bot turns when appropriate
- after human `play-card`, the gateway advances the turn and triggers bot response
- bot moves emit the same relevant room/match updates the UI expects
- a single authenticated human can complete full gameplay loops in the browser

This is where the system stopped being “frontend shell + debug tools” and became an actual playable application.

---

### 6) Domain and hand lifecycle hardening

To support the new gameplay loop safely, the match and hand model were tightened.

Delivered work included:

- deck-related support extracted into a proper domain service
- corrections around hand progression and round creation
- fixes in play-card paths where tests exposed mismatches
- match completion and round lifecycle behavior made consistent with real play

This phase did not merely add features around the Domain. It also strengthened the Domain to survive the new runtime pressure.

---

### 7) Viewer-aware match state projection

The project now distinguishes between **authoritative internal truth**, **public room state**, and **private player state**.

Delivered behavior:

- `ViewMatchStateUseCase` now supports `viewerPlayerId`
- public state no longer exposes full hands to everyone
- private state provides the correct hand view for the requesting player
- backend can produce different projections for different consumers while preserving one authoritative game state

This is one of the biggest architectural improvements of the phase.

---

### 8) Public/private state emission in the gateway

The gateway evolved from broadcasting one broad state shape into a more deliberate state distribution model.

Delivered behavior:

- public room-facing match state remains available
- private player-facing match state is emitted automatically
- private state is re-emitted after meaningful gameplay transitions
- manual `get-state` is no longer the only way to keep the player hand current

This made the browser flow much more natural and reduced UI friction significantly.

---

### 9) Frontend socket contract hardening

The frontend socket layer was expanded to consume the new backend contract safely.

Delivered behavior:

- typed normalization for richer room and match payloads
- support for `match-state:private`
- support for richer round/hand payload shapes
- safer contract handling under payload evolution

This continued the boundary-hardening direction from the previous phase, but now with real gameplay significance.

---

### 10) Match page became truly playable

The match page was pushed beyond shell-level interactivity into real browser gameplay.

Delivered behavior:

- joins the room on connect
- hydrates from live backend state
- renders private hand from backend truth
- highlights current turn
- supports `start-hand`
- supports `play-card`
- reflects bot responses in real time
- works in a real single-user browser loop

The browser is now acting as a proper client of backend truth, not as a local rule engine.

---

### 11) 1v1 table rendering improvements

The original frontend view still carried assumptions from broader multiplayer/debug visuals.

Delivered improvements:

- `1v1` rendering no longer displays irrelevant phantom seats
- public table view became easier to read
- side ownership and turn flow became clearer
- table readability now better matches the actual mode in play

This reduced UX confusion without changing any authoritative gameplay logic.

---

### 12) Hand completion clarity

A major source of confusion during validation was that a hand can end before the third card is used.

Delivered improvements:

- explicit hand completion feedback
- rounds played summary
- clearer indication that the next correct action is `Start next hand`
- better explanation for why the remaining card can disappear when the winner is already determined
- hand winner / hand summary feedback in the UI

This did not change the rules. It made the UI explain the rules more clearly.

---

### 13) Frontend state consolidation around backend truth

Snapshot persistence and match state storage were clarified.

Delivered behavior:

- separate snapshot handling for:
  - `publicMatchState`
  - `privateMatchState`
  - `roomState`
- match hydration is now more explicit about which state is public vs private
- legacy local hand simulation remains only as non-authoritative/debug support
- the real browser flow depends on socket-driven backend state

This reduced frontend ambiguity and made the client boundary more defensible.

---

## Architectural decisions

### The Domain remains authoritative

This phase added real browser playability and bot-driven flow, but the Domain still owns:

- card legality
- hand progression
- round results
- scoring
- match lifecycle

The gateway coordinates. The frontend renders. The Domain still decides truth.

---

### Bots belong behind the backend boundary

Bots were deliberately implemented as backend-side participants.

They are **not**:

- frontend simulations
- UI conveniences
- fake socket hacks pretending to be players in the browser

This preserves the integrity of the architecture and makes future bot sophistication possible.

---

### Room orchestration and game rules remain separate concerns

Bot fill, room occupancy, readiness, and seat replacement belong to room orchestration.

They do not belong inside the pure game model.

This is important because it keeps Domain logic focused on Truco itself instead of transport/runtime concerns.

---

### Public/private state separation is a hardening step, not a convenience layer

Moving away from globally exposing every hand to every client was not just a UI enhancement.

It is a structural correction toward how a real multiplayer card game should expose information across the boundary.

---

### The frontend now consumes backend truth instead of inventing it

Earlier iterations still tolerated more local frontend guesswork for speed of development.

By the end of this phase, the important gameplay path is backend-driven:

- room state
- match state
- private hand state
- bot progression

This is the right direction for long-term maintainability.

---

## What is not included in this phase

| Item | Reason |
|---|---|
| Final production-grade game table UX | Out of scope |
| Advanced animations for rounds and card flow | Deferred |
| Large-scale component refactor of `matchPage` | Deferred to avoid phase drag |
| Advanced bot intelligence / AI-native bot system | Future phase |
| Shared/global frontend socket provider architecture | Deferred |
| Explicit backend hand-summary event contract | Deferred; frontend derives summary from existing state |
| Final polished spectator/replay experience | Not part of this phase |

---

## Manual validation summary

By the end of the phase, the following flow was validated:

1. authenticate in browser
2. open lobby
3. connect socket
4. create a `1v1` match
5. confirm bot seat fill
6. open match page
7. confirm room join on connect
8. confirm public match state and private match state both arrive
9. start a hand
10. see the real private hand automatically
11. play a card
12. observe bot response automatically
13. continue until the hand ends
14. confirm UI explains the hand ending
15. start the next hand

This flow is the practical proof that the phase succeeded.

---

## High technical debt identified

### DT-HIGH — `matchPage` accumulated too many responsibilities

Because this phase required validating many evolving boundaries at once, `matchPage` became the convergence point for:

- room lifecycle
- public/private state handling
- gameplay actions
- hand summary UX
- snapshot hydration

This does not invalidate the phase, but it leaves a maintainability debt:

- the file is larger than ideal
- UI sections and derived state live together too tightly
- future UX changes could become slower if not refactored later

The important nuance is that this debt is now **safe to defer**, because the gameplay contract itself is working.

---

### DT-HIGH — Hand-ending feedback is still derived in the frontend

The UI currently infers hand outcomes from existing state instead of consuming a dedicated backend-level hand summary contract.

This is acceptable for now, but a future richer backend event/DTO could make the UI simpler and safer.

---

### DT-HIGH — Bot sophistication remains intentionally simple

The heuristic bot is good enough to unlock real playability and validate architecture.

It is not yet meant to represent a sophisticated competitive Truco bot.

This is a conscious debt, not an oversight.

---

## Final result of Phase 11

Phase 11 transformed the project from:

- an authenticated frontend shell
- a backend-centric multiplayer debug experience
- a flow blocked by multi-user test friction

into:

- a real authenticated **human-vs-bot browser game loop**
- a **mode-aware** room system
- a **public/private state-aware** transport boundary
- a safer and more defensible frontend contract
- a much more practical local development and validation experience

This is the phase where the project stopped being “frontend attached to backend progress” and started becoming a **playable game application**.