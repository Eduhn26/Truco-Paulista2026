# docs/phases/phase-19.md

## 🎯 Context & Goal

This PR closes **Phase 19 — Frontend Environment / OAuth / Runtime Hardening & Product Consistency Pass**.

Phase 18 ended with a frontend that was already structurally safer and much more aligned with the authoritative backend contract. The next gap was no longer only inside `MatchPage` composition.

Real usage still exposed a broader class of frontend concerns:

- environment and OAuth boundary fragility between local and production
- route entry states that still relied too much on late runtime discovery
- excessive realtime orchestration living directly inside pages
- private-hand rendering drift against the real typed contract
- suit rendering inconsistencies between contract and UI
- visual inconsistency between home, callback, lobby, and match surfaces
- unnecessary frontend bundle concentration in the initial load

So the goal of this phase was not to redesign the product from scratch or to deliver final animation polish.

The goal was to make the frontend safer for real publication and safer for real authenticated runtime usage, while improving visual consistency and reducing unnecessary bundle concentration without violating backend authority.

This phase focused on:
- frontend environment and OAuth boundary hardening
- route/session entry protection
- clearer session-aware entry states
- extraction of realtime orchestration from lobby and match flows
- extraction of match action/emitter bridge logic
- alignment of private-hand rendering with the real typed contract
- alignment of suit display semantics with the real card contract
- visual consistency pass across product entry surfaces
- route-level and secondary code splitting
- production-oriented validation through repeated build/runtime checks

---

## ✨ What was delivered

### 1. Frontend environment / OAuth boundary hardening
- [x] backend URL handling became safer for local and production flows
- [x] OAuth start flow started persisting the backend boundary explicitly before redirect
- [x] callback handling stopped depending on fragile origin guessing
- [x] frontend session persistence became more reliable for real published usage

### 2. Route access boundary hardening
- [x] authenticated lobby access gained explicit route protection
- [x] match route access gained explicit session validation
- [x] match route also started validating minimum match context before entry
- [x] invalid entry states stopped being discovered only after runtime/socket actions

### 3. Session-aware entry states
- [x] `LobbyPage` gained clearer entry-state communication for:
  - missing session
  - socket offline
  - missing match context
  - match context ready
- [x] `MatchPage` gained explicit fallback states for:
  - missing session
  - missing match context
  - waiting for hydration
- [x] the UI became more semantically honest during intermediate states instead of looking broken

### 4. Lobby realtime extraction
- [x] socket orchestration was extracted from `LobbyPage` into `useLobbyRealtimeSession`
- [x] lobby page stopped concentrating:
  - socket connection lifecycle
  - transport handlers
  - snapshot persistence
  - derived match context
  - event log management
- [x] lobby composition became more focused on product surface and actions

### 5. Match realtime extraction
- [x] match realtime session handling was extracted into `useMatchRealtimeSession`
- [x] `MatchPage` stopped directly concentrating:
  - socket connect/disconnect lifecycle
  - initial join/get-state flow
  - match transport handlers
  - snapshot persistence
  - event log setup
- [x] the page moved further toward orchestration + rendering instead of transport ownership

### 6. Match action bridge extraction
- [x] action/emitter guard logic was extracted into `useMatchActionBridge`
- [x] `MatchPage` stopped carrying the full inline action controller logic
- [x] match actions remained backend-authoritative through `availableActions`
- [x] the page became easier to defend structurally

### 7. Private-hand contract alignment
- [x] private hand rendering stopped assuming a non-existent `viewerHand` field
- [x] frontend alignment was corrected to use:
  - `viewerPlayerId`
  - `playerOneHand`
  - `playerTwoHand`
- [x] player hand rendering was restored using the real typed contract
- [x] no fake fallback hand was introduced

### 8. Suit rendering alignment
- [x] suit display was aligned with the real card contract used by the frontend
- [x] symbol and color interpretation stopped drifting between old suit conventions and real payload semantics
- [x] suit display helpers became centralized and reusable inside the match screen

### 9. Product consistency pass across entry surfaces
- [x] `HomePage` received a product-consistency visual pass
- [x] `AuthCallbackPage` received a product-consistency visual pass
- [x] `LobbyPage` received a product-consistency visual pass
- [x] border language, hierarchy, surfaces, and premium dark presentation became more coherent across the frontend

### 10. Bundle concentration reduction through code splitting
- [x] route-level lazy loading was introduced for:
  - `HomePage`
  - `AuthCallbackPage`
  - `LobbyPage`
  - `MatchPage`
- [x] secondary lazy loading was introduced for:
  - `MatchLiveStatePanel`
  - `MatchRoundsHistoryPanel`
- [x] the main frontend chunk stopped triggering the large-chunk warning
- [x] the bundle became materially healthier without requiring premature manual chunking

### 11. Validation closure
- [x] the frontend repeatedly passed:
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run dev`
- [x] runtime and build validation were repeated after each major hardening slice
- [x] the final bundle state no longer emitted the previous >500 kB warning

---

## 🧠 Architectural impact

This phase did not relax backend authority.

It reinforced the frontend as a better consumer of that authority.

The impact of the phase was:

- **Environment / Auth boundary**
  - became safer for real published usage
  - reduced hidden browser-only configuration dependency

- **Route entry**
  - moved from implicit late discovery to explicit route/session protection

- **Lobby**
  - became less transport-concentrated
  - moved closer to a real product surface backed by a dedicated realtime hook

- **MatchPage**
  - became less monolithic
  - reduced direct concentration of transport and action-emitter orchestration
  - stayed aligned with authoritative backend semantics

- **Private state rendering**
  - became faithful to the real typed private-hand contract

- **Product surfaces**
  - moved toward a more coherent premium dark visual language

- **Bundle**
  - improved materially through semantic code splitting instead of premature low-level optimization

This phase intentionally prioritized:
- correctness of environment/runtime boundaries
- safer realtime orchestration
- contract fidelity
- coherence of major frontend surfaces
- practical production readiness signals

before any final hero-level polish cycle.

---

## ✅ Validation performed

Validation during the phase included:
- frontend type validation
- production build validation
- local runtime validation
- OAuth flow validation
- route-entry validation
- session persistence validation
- lobby runtime validation
- match runtime validation
- private-hand rendering validation
- suit display validation
- bundle output validation after code splitting

Representative checks:
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [x] `npm run dev`

Representative functional validation included:
- home entry flow
- OAuth start flow
- callback flow
- authenticated lobby entry
- protected lobby route behavior
- protected match route behavior
- match hydration fallback behavior
- realtime lobby interaction
- realtime match interaction
- player hand rendering from private state
- route-level bundle split output
- secondary match panel split output

---

## ⚖️ Key decisions and trade-offs

### 1. Environment/auth hardening before deeper visual polish
The phase deliberately fixed environment and OAuth boundaries first because production readiness problems are more dangerous than unfinished polish.

### 2. Route/session protection before more runtime complexity
Instead of letting pages discover broken entry states too late, the phase moved protection to explicit route boundaries and UI entry states.

### 3. Extraction before new feature layering
Realtime and action orchestration were extracted from pages before adding more presentation refinement. This reduced concentration and preserved architectural defensibility.

### 4. Contract fidelity over convenient assumptions
The frontend did not invent a `viewerHand` shape when the typed contract did not expose one. The phase aligned rendering to the real private-hand contract instead.

### 5. Semantic bundle optimization before manual chunk micromanagement
The phase used route-level and secondary lazy loading first. This delivered clear bundle gains without introducing premature manual chunk complexity.

### 6. Stop point chosen intentionally
Once the bundle warning disappeared and the chunk graph became healthy enough, the phase intentionally stopped short of extra optimization churn.

---

## 🧾 Technical debt left open

### 1. Final product polish of the match hero screen
- the table is much stronger structurally and visually than before
- but the match screen still has room for final product-level refinement
- animation/game-feel still deserves a dedicated polish cycle

### 2. Secondary bundle optimization remains optional, not urgent
- route-level and secondary split already solved the warning
- `manualChunks` can be revisited later only if new evidence justifies it

### 3. Runtime event pacing can still improve
- realtime flow is cleaner structurally
- but pacing and visual rhythm can still be improved in future UX-focused work

### 4. Product consistency can still deepen
- home, callback, lobby, and match are now more coherent
- but a later pass can still improve branding, transitions, and final visual finish

---

## 🏁 Final result

Phase 19 transformed the frontend from:

- a structurally improved but still runtime-fragile and unevenly consistent frontend surface

into:

- a safer environment/auth consumer for real deployment
- a frontend with explicit route/session entry protection
- cleaner lobby and match realtime boundaries
- a match screen with reduced action/runtime concentration
- a correct private-hand consumer of the real typed contract
- a more coherent product surface across home, callback, lobby, and match
- a materially healthier frontend bundle through practical code splitting

This phase does **not** close the final hero-polish layer of the product.

It closes the environment/runtime/contract/consistency hardening layer that became necessary after Phase 18 made the frontend structurally ready for deeper real-world usage.