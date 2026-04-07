# docs/phases/phase-18.md

## 🎯 Context & Goal

This PR closes **Phase 18 — Frontend Contract Hardening & MatchPage Structural Cleanup**.

By the end of Phase 17, the backend had already become a much more faithful and explicit authoritative engine for the real rules of **Truco Paulista**. The match-state projection was already frontend-ready, but real UI integration exposed a new class of problem: the frontend still carried boundary fragility, excessive local concentration, and visual/state orchestration issues around the main match screen.

So the goal of this phase was not to redesign the game table or to deliver final product polish.

The goal was to make the frontend a safer and more maintainable consumer of the authoritative backend contract, while reducing the architectural concentration inside `MatchPage` and preserving the backend-first / DDD / Clean Architecture direction already established in previous phases.

This phase focused on:
- frontend environment and OAuth boundary hardening
- safer consumption of authoritative match-state
- reduction of fragile inline semantics in the match screen
- extraction of presentation selectors
- extraction of table transition state orchestration
- decomposition of `MatchPage` into stable presentation sections
- structural cleanup before future visual refinement

---

## ✨ What was delivered

### 1. Frontend environment boundary hardening
- [x] backend URL resolution was hardened for frontend usage
- [x] OAuth callback flow stopped depending on fragile origin assumptions
- [x] local vs production backend boundary handling became clearer
- [x] frontend session setup became safer for real integration flow

### 2. Authoritative round/turn flow validation through frontend integration
- [x] frontend integration exposed an incorrect round-opening flow
- [x] the fixed-seat reopening issue was investigated through the real UI flow
- [x] gateway / room turn authority was corrected so the next round opener stopped being incorrectly reused
- [x] frontend validation confirmed that the problem moved away from core game logic and into visual/table orchestration

### 3. Presentation selectors extracted from `MatchPage`
- [x] contract-oriented presentation semantics were extracted from the page
- [x] match HUD / status / action-related state stopped living only as inline page logic
- [x] `MatchPage` became less dependent on scattered local semantic derivation
- [x] authoritative fields such as:
  - `currentValue`
  - `betState`
  - `pendingValue`
  - `requestedBy`
  - `specialState`
  - `specialDecisionPending`
  - `specialDecisionBy`
  - `winner`
  - `awardedPoints`
  - `availableActions`
  were consolidated into presentation selectors

### 4. Table transition state extracted to a dedicated hook
- [x] transient match-table state stopped being fully inline inside the page
- [x] extraction covered:
  - launching card state
  - pending played card
  - closing table cards
  - reveal keys
  - round intro / round resolution keys
  - resolving-round state
- [x] `useMatchTableTransition` became the dedicated boundary for visual table transition orchestration

### 5. Stable presentation sections extracted from `MatchPage`
- [x] stable screen sections were extracted into dedicated components
- [x] extracted sections include:
  - `MatchLiveStatePanel`
  - `MatchRoundsHistoryPanel`
  - `MatchPlayerHandPanel`
- [x] page composition became clearer and less monolithic

### 6. Header and action surface extracted
- [x] top status/header band was moved out of the page core
- [x] action surface was extracted into a dedicated component
- [x] the match page became more focused on orchestration and composition instead of mixing every presentation block inline

### 7. Central table shell extracted
- [x] the main visual table center was moved into `MatchTableShell`
- [x] the page stopped carrying the full center-table JSX inline
- [x] central match-screen composition became more defensible structurally

### 8. Structural stabilization cleanup
- [x] extraction drift across the phase was cleaned up
- [x] component boundaries were stabilized
- [x] imports, props, and composition were revalidated
- [x] frontend passed:
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run dev`

---

## 🧠 Architectural impact

This phase did not try to make the frontend a new source of truth.

It moved the system in the opposite direction.

The impact of the phase was:

- **Backend / Gateway**
  - remained authoritative for match and turn semantics
  - received the necessary round-opening correction exposed by real frontend integration

- **Frontend contract consumption**
  - became more explicit and less dependent on fragile inline deduction

- **MatchPage**
  - moved closer to a true orchestration page
  - reduced concentration of presentation semantics and transition concerns

- **Presentation**
  - became more modular without mixing that extraction with final visual polish

This phase did **not** finish the visual/game-feel layer of the table.
It intentionally prioritized contract hardening and structural cleanup first.

---

## ✅ Validation performed

Validation during the phase included:
- frontend type validation
- production build validation
- local runtime validation
- authenticated flow validation
- real playable match validation
- round/turn flow validation through live play

Representative checks:
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [x] `npm run dev`

Functional validation included:
- home flow
- lobby flow
- match creation / join flow
- hand start
- card play
- round progression
- next-round opener validation
- extracted component rendering validation

---

## ⚖️ Key decisions and trade-offs

### 1. Contract hardening before polish
Once the backend had become frontend-ready in Phase 17, the next correct move was not visual refinement first. The phase deliberately prioritized contract consumption and structural cleanup before table polish.

### 2. Real integration exposed cross-layer issues
The incorrect next-round opener was not treated as a “frontend bug”. The phase used frontend integration as evidence, then corrected the turn authority in the proper backend/gateway layer.

### 3. Extraction before redesign
The phase extracted selectors, hooks, and stable presentation sections before trying to “beautify” the table. This kept the work defensible and reduced the risk of hiding architectural issues behind visual changes.

### 4. Visual debt was kept explicit
The phase did not pretend the table transition UX was already solved. Instead of masking the issue, the remaining transition/game-feel problem was registered as explicit technical debt for a future iteration.

### 5. Structural closure over perfect finish
The goal of the phase was to leave the frontend structurally stronger and technically safer, even if some visual orchestration problems remain open.

---

## 🧾 Technical debt left open

### 1. Round transition readability / table state orchestration
- the card that closes a round still does not remain readable for long enough
- visual transition between round end and next-round start still needs dedicated polish
- the remaining issue is now clearly in visual/table orchestration, not in core match rules

### 2. Noisy event flow
- a single gameplay transition can still emit:
  - `card-played`
  - `room-state`
  - `public match-state`
  - `private match-state`
- this creates visual pressure and makes the UX less readable than the underlying logic

### 3. Aggressive pacing of bot response
- bot-driven transitions can still occur too quickly for good UI readability
- the match can be logically correct while still feeling visually abrupt

### 4. Reconnection / socket reattach noise
- reconnect flows can still create operational noise
- socket/session behavior deserves additional hardening later

### 5. `hand-started` noise
- the event can still appear duplicated or visually inconsistent in some frontend traces

### 6. Frontend bundle size
- build output still warns about a large bundle chunk
- future optimization should evaluate code splitting / manual chunking

---

## 🏁 Final result

Phase 18 transformed the frontend from:

- a match screen that was already playable but still concentrated, semantically fragile, and difficult to evolve safely

into:

- a much safer consumer of the authoritative backend contract
- a structurally cleaner match screen
- a frontend with clearer boundaries between:
  - contract semantics
  - table transition state
  - stable presentation sections
  - main page orchestration

This phase does **not** close the product polish layer.

It closes the structural frontend hardening layer that became necessary after Phase 17 exposed the gap between “backend-ready contract” and “frontend-safe integration”.