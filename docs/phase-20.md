# docs/phases/phase-20.md

## 🎯 Context & Goal

This PR closes **Phase 20 — Frontend Gameplay Surface Closure + Truco Core Visible Hardening**.

Phase 19 ended with a frontend that was already much safer at the environment, OAuth, routing, runtime, and product-surface levels. The next gap was no longer only about route protection, session boundaries, or transport extraction.

Real gameplay usage exposed a different class of problems:

- the match surface still needed a stronger product-facing table/HUD hierarchy
- the visible hand flow still had readability and pacing issues during live play
- authoritative match progression still had fragile points around round transitions and next-hand flow
- the truco lifecycle was not yet closed as a semantically complete visible system
- bet feedback was still inconsistent across request / accept / decline branches
- special-hand flow still had integration gaps, especially around **mão de 11**
- the bot could already support the core loop, but its bet-decision participation still needed a stable minimum foundation

So the goal of this phase was not to perform generic polish or cosmetic redesign.

The goal was to evolve the frontend match surface into a stronger product-facing game screen **while also closing the remaining visible gameplay core**, especially:

- authoritative visible match flow
- round/hand progression stability
- truco request / response / escalation visibility
- bot bet-response participation
- mão de 11 acceptance / refusal continuity
- clearer, more defensible match-surface architecture

This phase focused on:

- match surface and HUD evolution
- player hand presentation and match interaction refinement
- incremental view-model consolidation for the match screen
- router/support alignment for the evolving frontend runtime
- authoritative match progression fixes
- hand-start and next-hand progression recovery
- round transition stabilization
- visible match flow stabilization in the frontend
- preservation of realtime table cards during round resolution cleanup
- truco flow closure as part of the visible core
- minimum bot bet-decision foundation
- mão de 11 runtime continuity fixes

---

## ✨ What was delivered

### 1. Match surface evolution
- [x] the match screen received a stronger product-facing visual structure
- [x] table, HUD, header, hand dock, and action surface moved closer to a cohesive game UI
- [x] the screen stopped reading as only a functional transport shell and became more legible as a real product surface
- [x] the match hero area, controls, and player-hand zone became more intentional in hierarchy and presentation

### 2. Player hand and interaction refinement
- [x] player hand presentation was refined to feel more anchored to the table
- [x] hand dock and hand interaction became clearer in active vs inactive states
- [x] hover/readiness cues became more aligned with actual playability
- [x] interaction framing improved without moving authority away from backend-driven actions

### 3. Match view-model progression
- [x] the match screen gained a stronger view-model building layer
- [x] match header, table shell, technical panel, rounds history, and event log composition became easier to reason about
- [x] part of the page moved away from broad inline composition into a more explicit match-screen view model
- [x] the match page became more defensible as an orchestration layer instead of only a large rendering/controller surface

### 4. Router and support alignment
- [x] router/loading behavior was aligned with the phase-20 frontend direction
- [x] support files and frontend runtime edges were adjusted to keep the evolving screen structure coherent
- [x] the route/loading experience was kept compatible with the growing product surface without reintroducing older bundle/runtime problems

### 5. Authoritative match progression hardening
- [x] backend/frontend coordination around live match progression was strengthened
- [x] fragile progression points in authoritative hand advancement were corrected
- [x] next-hand continuation and hand-start recovery stopped depending on unstable intermediate behavior
- [x] visible progression moved closer to the real backend lifecycle instead of being vulnerable to frontend drift

### 6. Hand start and next-hand flow recovery
- [x] hand start flow was restored in scenarios where progression had become unstable
- [x] next-hand progression became more consistent
- [x] post-hand continuation stopped getting stuck in previously observed broken states
- [x] the player could move from finished hand to next hand with more reliable behavior

### 7. Round transition stabilization
- [x] round transition integration was stabilized
- [x] visible round closing/opening behavior stopped depending on brittle timing assumptions
- [x] the relationship between round resolution, next round opening, and visible table cleanup became safer
- [x] the gameplay flow became easier to follow in real tests

### 8. Visible match flow stabilization
- [x] frontend handling of live match flow was stabilized further
- [x] round transitions stopped breaking the visible play loop in previously problematic scenarios
- [x] the screen preserved more trustworthy continuity between authoritative events and what the player actually sees
- [x] the visible flow became substantially more reliable in manual gameplay validation

### 9. Realtime card preservation during resolution cleanup
- [x] realtime cards stopped disappearing too early during round cleanup
- [x] table-card continuity improved during resolution windows
- [x] the frontend became less likely to erase meaningful visual information before the player had time to read it
- [x] visible table state stayed more coherent while rounds were resolving

### 10. Truco flow closure
- [x] truco request flow became visibly legible
- [x] the player can now see when truco was requested
- [x] bot response became visible in accepted / declined outcomes
- [x] hand value now updates coherently after accepted truco
- [x] truco now behaves correctly in real gameplay across the validated round scenarios
- [x] request / respond / continue flow became semantically much stronger as part of the visible gameplay core

### 11. Bet feedback and state coherence
- [x] the frontend now preserves a coherent bet cycle through request, accept, and decline outcomes
- [x] UI feedback became materially more reliable instead of depending on lucky intermediate frames
- [x] the match surface became better at reflecting pending bet, accepted bet, and declined bet outcomes
- [x] bet-state communication stopped drifting as often between available actions, banner semantics, and visible feedback

### 12. Bot bet-decision foundation
- [x] the bot received a clearer minimum foundation for bet participation
- [x] bot decisions now support the visible core flow of truco more reliably
- [x] the project now has a better baseline for accept / decline behavior without pretending the bot system is already final
- [x] this phase closed the minimum support needed for bet-response participation in the current product loop

### 13. Mão de 11 runtime continuity
- [x] acceptance of mão de 11 was fixed in the real gameplay loop
- [x] refusal of mão de 11 was validated in the real gameplay loop
- [x] after accepting mão de 11, the hand correctly returned to a playable card-flow state
- [x] room-state/current turn restoration stopped blocking card play after accepted mão de 11
- [x] the special-hand lifecycle became meaningfully better integrated into the visible match flow

### 14. Real validation closure
- [x] real matches were manually validated through repeated gameplay logs and observed behavior
- [x] truco request / accept / decline behavior was validated in real flow
- [x] mão de 11 accept / refuse behavior was validated in real flow
- [x] hand progression and match completion were validated in real flow
- [x] the phase closed with evidence from actual play rather than compilation-only confidence

---

## 🧠 Architectural impact

This phase did not weaken backend authority.

It extended the frontend and gateway/runtime behavior so the visible game loop could finally reflect that authority more coherently.

The impact of the phase was:

- **Match surface**
  - moved from a structurally improved screen into a stronger gameplay-facing product surface
  - gained clearer hierarchy between HUD, table, hand, and contextual actions

- **MatchPage architecture**
  - advanced toward a more explicit orchestration/view-model role
  - reduced some remaining concentration through clearer screen-building boundaries
  - became easier to defend as a product screen rather than a large mixed controller

- **Authoritative progression**
  - hand start, next-hand continuation, and round transitions became safer
  - live progression now survives more real gameplay paths without visual/runtime collapse

- **Visible gameplay semantics**
  - truco became materially more legible to the player
  - request / accept / decline now communicate better as part of the actual play surface
  - hand value updates became more trustworthy visually

- **Special-hand continuity**
  - mão de 11 no longer breaks the flow after acceptance
  - the frontend/gateway handshake now restores playable continuity instead of leaving the player in a dead state

- **Bot participation**
  - the bot now supports the visible betting loop more correctly at the minimum viable level
  - the architecture remains ready for future richer personality/strategy work without pretending that phase is already complete

This phase intentionally prioritized:
- closure of visible gameplay semantics
- authoritative progression stability
- stronger player-facing match readability
- minimum viable bet/special-hand runtime correctness
- real observed behavior over cosmetic-only refinement

before any broader future polish cycle.

---

## ✅ Validation performed

Validation during the phase included:
- frontend type validation
- frontend build/runtime validation
- repeated manual gameplay validation
- truco request/response validation
- hand progression validation
- round transition validation
- next-hand progression validation
- mão de 11 acceptance validation
- mão de 11 refusal validation
- bot response visibility validation
- end-of-match validation through real play

Representative checks:
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [x] `npm run dev`

Representative functional validation included:
- phase-20 match surface checkpoints
- player hand interaction refinement
- live match progression after start-hand
- round resolution and next-round opening
- next-hand progression after hand finish
- truco request in real play
- visible bot response to truco
- accepted truco with correct visible hand value
- declined truco with immediate hand closure
- accepted mão de 11 with return to playable turn state
- refused mão de 11 with correct scoring consequence
- full match completion in real browser flow

---

## ⚖️ Key decisions and trade-offs

### 1. Visible gameplay closure before wider polish
The phase deliberately prioritized visible gameplay correctness and continuity before broader aesthetic polish because broken semântics inside a premium-looking table would still be product failure.

### 2. Real-flow validation over green compilation
The phase did not treat build/lint success as proof of correctness. Repeated real match logs and observed behavior were used to validate truco, round progression, and mão de 11 continuity.

### 3. Incremental view-model evolution instead of rewriting the screen from scratch
The match screen was improved through progressive extraction and clearer view-model composition, avoiding a full restart of the frontend architecture.

### 4. Frontend fixes only where backend truth already supported them
The frontend did not invent local game authority. Where visible interaction was broken, the phase corrected projection, orchestration, or runtime continuity around the existing authoritative backend flow.

### 5. Gateway/runtime hardening when frontend alone was insufficient
Some problems were not purely presentational. When accepted mão de 11 returned the hand to `play-card` semantically but not operationally, gateway/runtime coordination was corrected instead of hiding the problem in UI.

### 6. Bot foundation intentionally kept minimum viable
The phase gave the bot enough foundation to participate correctly in the visible bet loop, but stopped short of pretending this already closes the future personality/strategy roadmap.

### 7. Stop point chosen intentionally
Once truco, hand progression, and mão de 11 were functioning correctly in real gameplay, the phase stopped short of reopening the entire UI/UX stack for larger redesign or cinematic polish churn.

---

## 🧾 Technical debt left open

### 1. Opponent mão de 11 lacks strong visual communication
- the special-hand flow now works functionally
- but when the **opponent** enters mão de 11, the player still lacks a clearer visual warning/communication layer
- this is now a residual UX/product debt, not a core gameplay blocker

### 2. MatchPage is more defensible, but not yet at the final ideal stop point
- the screen is better structured than before
- view-model composition advanced
- but the match hero screen still carries concentrated responsibilities that may justify future cleanup

### 3. Product polish can still deepen after core closure
- the match surface is stronger and more coherent
- but final game-feel, motion hierarchy, and premium finish can still improve in a future dedicated polish cycle

### 4. Bot strategy depth remains intentionally limited
- the bot now supports visible bet flow correctly at the minimum viable level
- but stronger personality, richer escalation strategy, and future adaptive behavior remain intentionally open for later phases

---

## 🏁 Final result

Phase 20 transformed the project from:

- a frontend that was already safer structurally and visually stronger than before, but still missing closure in visible gameplay semantics

into:

- a stronger gameplay-facing match surface
- a clearer HUD/table/hand/action hierarchy
- a more defensible match-screen orchestration layer
- a substantially more reliable authoritative hand/round progression flow
- a visibly coherent truco lifecycle in real play
- a minimum viable bot bet-response foundation
- a working accepted/refused mão de 11 flow that no longer breaks playable continuity

This phase does **not** finish the final hero-polish layer of the product.

It closes the **visible gameplay core hardening layer** that became necessary after Phase 19 had already stabilized environment, runtime, and frontend contract boundaries.

Phase 20 is the point where the project stopped merely looking more like a game screen and started behaving much more like a coherent real match surface under real gameplay pressure.