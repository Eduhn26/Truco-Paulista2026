# Phase 10 — Playable Frontend

> **Status:** ✅ Complete (core scope)
> **Branch:** `feat/phase-10-frontend`

---

## Objective

Phase 10 introduced the first real frontend for the Truco Paulista project.

Until this point, the project only had a **Vanilla JS debug UI** used for manual backend validation. That was enough to prove the authenticated multiplayer flow in Phase 9, but it was not a real product-facing client.

The goal of this phase was to move from:

- manual/debug interaction
- token copy/paste flow
- operational socket testing

to:

- a real frontend application
- authenticated session persistence in the browser
- a playable lobby and match shell
- initial match actions connected to the backend boundary
- zero leakage of game rules into the client

The intent was **not** to make the frontend authoritative.  
The intent was to make it a proper consumer of the existing authenticated multiplayer backend.

---

## Stack decision

### Chosen stack

- **React**
- **Vite**
- **TypeScript**
- **Tailwind CSS**

### Why React + Vite instead of Next.js

At this stage, the main problem was:

- OAuth callback consumption
- authenticated Socket.IO connection
- room-state / match-state rendering
- fast iteration on a playable table

The frontend did **not** need SSR, SEO, App Router, or server-rendered pages yet.

Using Next.js at this point would have introduced additional web architecture complexity before the playable multiplayer shell had even been validated.

React + Vite was chosen because it minimized friction while preserving a future migration path if the product later requires a larger web application shell.

### Why Tailwind

The phase required fast iteration in:

- lobby layout
- match shell
- state cards
- responsive UI
- progressive visual refinement

Tailwind accelerated this without forcing architectural changes in the project boundaries.

---

## What was delivered

### 1. Real frontend bootstrap

A new frontend application was introduced in `frontend-app/` with:

- Vite bootstrap
- React Router
- TypeScript strict mode
- Tailwind styling
- modular folder structure for auth, socket, pages, and match state

This replaced the old “single debug file” experience with a maintainable UI shell.

### 2. Browser session persistence

The frontend now persists authenticated session data locally, including:

- `authToken`
- `backendUrl`
- `expiresIn`
- authenticated user identity payload

This means the browser can preserve session context across navigation and reloads without requiring manual re-entry on every flow.

### 3. OAuth callback integrated into the frontend flow

Phase 9 proved that the backend could authenticate a real user and emit:

- `user`
- `authToken`
- `expiresIn`

Phase 10 evolved that into a proper frontend flow.

Instead of stopping at a raw backend callback response, the browser is now redirected back into the frontend callback route, where the session is stored and the user is redirected into the app flow.

This changed authentication from a backend validation artifact into a real browser login experience.

### 4. Authenticated lobby

The new lobby now supports:

- authenticated session awareness
- authenticated Socket.IO connection
- match creation
- match joining by `matchId`
- ready-state toggling
- state refresh
- basic room-state visualization
- basic match-state visualization
- event log visibility for debugging and flow inspection

The lobby is now the first real operational page of the playable frontend.

### 5. Socket contract typing and normalization

The frontend no longer treats socket payloads as loose `unknown` values scattered through the UI.

This phase introduced explicit frontend-side types and normalization for events such as:

- `room-state`
- `match-state`
- `player-assigned`
- `ranking`
- server-side error payloads
- `hand-started`
- `card-played`

This reduced integration fragility and prepared the client for richer match rendering.

### 6. Match snapshot support

The frontend now stores the last known match snapshot in browser storage so the match page can open with meaningful context instead of starting from a blank shell.

This includes persisted:

- `roomState`
- `matchState`
- `playerAssigned`

This was an intermediate step to avoid coupling the match page too early to the lobby tab’s live lifecycle.

### 7. Live match page hydration

The match page evolved from a static shell into a live socket-connected page.

It now:

- connects directly using the authenticated session
- emits `get-state` automatically
- receives live `room-state`
- receives live `match-state`
- keeps its own event log
- no longer depends on the lobby staying open

This was the point where the frontend stopped being “navigation over a debug client” and became a real page in the multiplayer flow.

### 8. Initial playable match table

The match page now exposes initial match actions connected to the backend boundary:

- `get-state`
- `start-hand`
- `play-card`

A lightweight local hand simulation was introduced only for early UI ergonomics, so the user can see cards and interact with a minimal playable table shell while the backend remains the source of truth for match progression.

The client still does **not** own the game rules.  
It only coordinates UI interaction and visual feedback around backend events.

---

## Architecture notes

### The frontend remains non-authoritative

This phase respected the phase constraint:

- the frontend may hold UI state
- the frontend may coordinate socket events
- the frontend may derive visual state
- the frontend may **not** own game rules
- the frontend may **not** recompute authoritative match truth

The backend remains responsible for:

- match flow
- room progression
- validation of actions
- multiplayer authority

### Auth boundary remained clean

The introduction of frontend auth handling did **not** leak OAuth concepts into the domain.

All auth changes remained at the browser / controller / boundary layer.

The frontend consumes:

- session payloads
- callback redirect parameters
- authenticated socket handshake

It does not introduce provider identity into the domain model.

### Debug UI value was preserved conceptually

The legacy debug UI was not treated as final architecture.

Instead, it was used as a reference for:

- which socket events mattered
- how to validate the flow manually
- how to progressively replace manual interactions with real UI screens

That made the migration to React incremental instead of speculative.

---

## Delivered frontend capabilities

At the end of Phase 10, the frontend can now:

- authenticate through real OAuth flow
- persist session in the browser
- connect to the backend through authenticated Socket.IO
- create a match
- join a match by ID
- toggle ready state
- request match state
- open a dedicated match page
- hydrate the match page with live socket state
- emit `start-hand`
- emit `play-card`
- render initial playable table controls

This is the first phase where the project clearly has a **real playable web client**, not just backend validation tooling.

---

## What was intentionally not done

### No game rule duplication in the client

The client does not attempt to:

- validate Truco rules locally
- decide whether a move is legal
- compute authoritative turn flow
- reconstruct the match domain internally

### No SSR / app-shell overengineering

The frontend was intentionally kept lean.

This phase did not introduce:

- Next.js
- SSR
- server components
- public profile pages
- history/replay routing
- larger product shell concerns

Those decisions would have increased complexity before the core playable flow was stable.

### No full table fidelity yet

The table is still an initial playable shell.

It is not yet a fully polished production game surface with:

- mature animations
- rich trick visualization
- full round/hand history
- complete player identity overlays
- refined seat ownership recovery across all reconnection patterns

That is acceptable for this phase because the architectural objective was to establish the frontend boundary and operational flow first.

---

## Key trade-offs

### React + Vite over Next.js

**Decision:** prioritize fast authenticated multiplayer iteration over full web app concerns.

**Trade-off:** a future migration to a more structured web shell may still happen, but the current phase avoided unnecessary complexity.

### Local hand simulation as progressive enhancement

**Decision:** add minimal local hand visualization for UX.

**Trade-off:** this is not authoritative game state, and it must remain clearly subordinate to backend events.

### Dedicated socket connection in the match page

**Decision:** let the match page hydrate itself independently.

**Trade-off:** this avoids coupling to the lobby lifecycle but postpones a more centralized shared socket architecture.

### Keep manual token fallback as a dev aid

**Decision:** retain a manual token fallback in the frontend bootstrap during development.

**Trade-off:** production-like behavior already uses OAuth-first flow, but keeping the fallback improves diagnostics during rapid iteration.

---

## Validation achieved

### Successfully validated

- frontend application bootstraps correctly
- browser session persistence works
- OAuth flow returns into the frontend
- authenticated session is stored automatically
- lobby connects with authenticated socket handshake
- match creation works
- match joining works
- ready-state toggle works
- room-state and match-state are received and rendered
- match page hydrates from live socket state
- `start-hand` and `play-card` are connected in the frontend flow
- the frontend now behaves as a real consumer of the authenticated backend

### Partially validated / constrained

`start-hand` could not be fully validated in the real authenticated 2v2 flow without additional identities because the current backend still expects real 2v2 room composition before `canStart` becomes `true`.

This is not a frontend bug.  
It is a limitation of local multiplayer test ergonomics under the current backend phase state.

---

## High technical debt identified

### DT-HIGH — Local multiplayer testability is poor in authenticated 2v2 flow

Current local validation of `canStart` in authenticated multiplayer is expensive because the system still operates as real **2v2**.

That means a full end-to-end local validation of `start-hand` requires:

- multiple distinct authenticated identities
- multiple browser sessions
- repeated OAuth flows
- full room composition before the match becomes startable

This does **not** invalidate the architectural success of Phase 10.  
However, it significantly slows:

- frontend QA
- local iteration
- manual multiplayer validation
- developer ergonomics

This debt should be revisited through one of these strategies in a later phase:

- Phase 11 `1v1` mode
- bot seat filling
- local development identities / dev auth
- dedicated multiplayer test harness

This debt is considered **HIGH** because it directly affects the speed and practicality of validating future multiplayer UI work.

---

## Architectural decisions reinforced

- The frontend consumes the existing authenticated backend boundary instead of redefining it.
- OAuth stays outside the domain.
- Socket coordination belongs to the frontend boundary, not to the domain.
- Visual state may exist in the client, but game rules do not move there.
- Debug tooling may inspire the frontend, but it must not become the architecture itself.

---

## Final outcome

Phase 10 successfully completed the transition from:

- backend-first validation tooling
- manual session handling
- debug-only browser interaction

to:

- a real authenticated frontend
- a playable multiplayer shell
- a live match page
- the first version of a usable game table interface

The result is not a final polished product UI yet, but it is a correct architectural foundation for future frontend evolution.

That makes Phase 10 complete in its core scope.

---

## Next phase direction

Phase 11 should focus on reducing multiplayer test friction and evolving room composition behavior through:

- `1v1` mode support
- automatic seat filling by bot
- room start conditions adapted by mode
- better local validation ergonomics for match start flow

That is the natural continuation point after the frontend foundation established in Phase 10.