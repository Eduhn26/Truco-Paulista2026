## 🎯 Context & Goal

This PR closes **Phase 17 — Truco Rules Alignment & Backend Contract Completion**.

By the end of Phase 16, the project was already operationally stronger and architecturally mature, but frontend work exposed a different class of problem: the backend still carried semantic simplifications around the real rules of **Truco Paulista**.

So the goal of this phase was not to make the project prettier or more deployable.

The goal was to make the backend a more faithful and explicit **authoritative engine for the real game**, while preserving the DDD / Clean Architecture boundaries already established in earlier phases.

This phase focused on:
- explicit hand state
- real truco betting flow
- correct hand value progression
- correct cangação / tie handling
- special hand rules
- explicit Application boundaries for hand actions
- explicit Gateway transport contracts for hand actions
- frontend-ready match-state projection

---

## ✨ What was delivered

### 1. Explicit hand betting state in the Domain
- [x] `Hand` now models:
  - current hand value
  - bet state
  - pending bet value
  - requesting side
  - special hand state
  - pending special decision
  - deciding side
  - winner / awarded points
- [x] hand value is no longer informal behavior around the aggregate
- [x] the hand itself became the source of truth for hand negotiation semantics

### 2. Complete truco betting cycle
- [x] support for:
  - `requestTruco`
  - `acceptBet`
  - `declineBet`
  - `raiseToSix`
  - `raiseToNine`
  - `raiseToTwelve`
- [x] invalid transitions now fail explicitly
- [x] card play is blocked while a bet response is pending
- [x] refusal awards the correct currently accepted hand value

### 3. Correct cangação / tie resolution
- [x] first-round winner inherits correctly when the second round ties
- [x] second-round winner inherits correctly when the first round ties
- [x] split-round scenarios with third-round tie now resolve correctly
- [x] split-round scenarios with decisive third round now resolve correctly
- [x] domain tests were expanded to lock these rules down

### 4. Mão de 11 implemented explicitly
- [x] match start can initialize `mao_de_onze`
- [x] pending special decision is explicit in the hand state
- [x] deciding side is explicit
- [x] accept upgrades the hand to 3 points
- [x] decline awards 1 point to the opponent
- [x] card play is blocked while decision is pending
- [x] normal truco escalation is blocked during `mao_de_onze`

### 5. Mão de ferro implemented explicitly
- [x] match start can initialize `mao_de_ferro` on 11x11
- [x] special state is exposed explicitly
- [x] truco escalation is blocked during `mao_de_ferro`
- [x] hand value remains 1
- [x] winning the special hand closes the match naturally at 12

### 6. Explicit Application use cases for hand actions
- [x] request/response DTOs created for hand action flows
- [x] use cases added for:
  - `RequestTruco`
  - `AcceptBet`
  - `DeclineBet`
  - `RaiseToSix`
  - `RaiseToNine`
  - `RaiseToTwelve`
  - `AcceptMaoDeOnze`
  - `DeclineMaoDeOnze`
- [x] application tests added for these flows
- [x] orchestration remains cleanly separated from transport

### 7. Frontend-ready authoritative projection
- [x] `ViewMatchState` now exposes the real hand state explicitly
- [x] projection now includes:
  - `currentValue`
  - `betState`
  - `pendingValue`
  - `requestedBy`
  - `specialState`
  - `specialDecisionPending`
  - `specialDecisionBy`
  - `winner`
  - `awardedPoints`
- [x] `availableActions` added to remove fragile frontend inference
- [x] opponent hand masking behavior preserved

### 8. Gateway transport contracts for hand actions
- [x] WebSocket actions added for:
  - `request-truco`
  - `accept-bet`
  - `decline-bet`
  - `raise-to-six`
  - `raise-to-nine`
  - `raise-to-twelve`
  - `accept-mao-de-onze`
  - `decline-mao-de-onze`
- [x] player identity is resolved from session / socket context
- [x] public and private match-state re-emission preserved after actions
- [x] gateway tests updated to support the expanded constructor and action flow
- [x] module wiring updated for all new use cases

---

## 🧠 Architectural impact

This phase **did intentionally change gameplay semantics**, but it did so in the correct place.

The changes stayed aligned with the project architecture:

- **Domain**
  - now carries the real hand negotiation and special-hand semantics

- **Application**
  - now exposes explicit boundaries for hand actions instead of relying on transport shortcuts

- **Gateway**
  - now transports the corrected semantics through dedicated socket actions

- **Projection**
  - now gives the frontend a much safer contract to consume

This phase did **not** turn the frontend into a source of truth.
It did the opposite: it reduced the need for fragile client-side deduction.

---

## ✅ Validation performed

Validation during the phase included:
- domain tests for:
  - betting flow
  - cangação / tie resolution
  - mão de 11
  - mão de ferro
- application tests for:
  - all new hand action use cases
  - enriched `ViewMatchState`
- gateway tests for:
  - socket hand action flow
  - updated constructor / use case wiring
- lint, build, and full test suite revalidation

Representative checks:
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`

---

## ⚖️ Key decisions and trade-offs

### 1. Backend semantics before frontend polish
Once UI work exposed the semantic gap, the phase deliberately paused frontend refinement and corrected the backend first.

### 2. Explicit state over implicit behavior
Hand negotiation and special-hand information were promoted into explicit authoritative state even though that increases DTO size. The clarity gain was worth it.

### 3. Action flow and projection evolved separately
The phase first stabilized action execution in Domain/Application/Gateway, then enriched `ViewMatchState`. This kept the change safer and easier to validate.

### 4. Frontend integration intentionally deferred
This PR closes the backend side of the problem.
Frontend integration is intentionally left for a new clean chat and a new branch, so the next iteration can focus on UI integration instead of mixing semantic backend correction with visual work.

---

## 🏁 Final result

Phase 17 transformed the project from:

- architecturally mature but semantically simplified in some key game rules

into:

- a much more faithful real Truco Paulista backend
- an explicit hand-action application boundary
- an explicit socket contract for those actions
- a frontend-ready authoritative match-state projection

This is the phase that closes the main backend blocker that had started to surface during UI work.