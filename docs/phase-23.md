# docs/phases/phase-23.md

## 🎯 Context & Goal

This PR closes **Phase 23 — Meta Layer / Retention Foundation**.

Phase 22 had already strengthened the premium match surface and improved the table-facing product experience. That changed the nature of the next meaningful gap.

The project no longer needed only more table polish. It needed a stronger **product continuity layer** around the match itself.

Real usage exposed a broader product problem:

- the **Home** still carried some artificial or marketing-shaped signals that did not fully reflect the real product
- the **Lobby** still had inconsistent state presentation between reconnect, first-session, recent-session, and active-room flows
- the space between **landing → lobby → match** was not yet cohesive enough as a single product journey
- the product had the beginnings of retention and continuity, but not yet a convincing **meta layer**
- some surfaces were individually strong, but the product still did not fully read as one deliberate, portfolio-grade experience

So the goal of this phase was not to reopen gameplay rules and not to redesign the whole product from scratch.

The goal was to establish a stronger **retention foundation**, improve the **meta/product layer**, and make the user-facing flow between **Home, Lobby, and Match** feel like one coherent product.

---

## ✅ What was delivered

### 1) Home truthfulness pass

The Home was upgraded from a visually strong but partially artificial landing surface into a more truthful product-facing entry point.

Delivered work:

- fake or marketing-placeholder style signals were removed
- the hero was aligned more closely with the real current product capabilities
- the supporting strip below the hero now communicates real product characteristics instead of inflated pseudo-metrics
- CTA hierarchy was clarified so the page now points more directly toward the actual product loop

This made the Home more defensible as a real surface instead of a beautiful but semantically inflated landing page.

---

### 2) Lobby continuity model became clearer

The Lobby stopped behaving like a generic waiting room and became a stronger continuity surface for the user session.

Delivered work:

- reconnect, first-session, recent-session, active-room-waiting-ready, and active-room-ready states were clarified
- the hero became the single main continuity guide instead of competing with repeated lower CTAs
- continuation logic became easier to read as a product layer rather than a loose collection of controls
- “recent session” and “return to room” flows now feel more intentional and less improvised

This materially improved the sense that the Lobby remembers context and helps the player continue, instead of just exposing low-level actions.

---

### 3) Meta-layer retention surfaces were established

The Lobby gained a more explicit retention-oriented layer, centered around recent play and player progression cues.

Delivered work:

- `Seu Momento` became a real player-facing meta card instead of a loose informational block
- recent-result framing became part of the product language
- `Última Partida` gained clearer purpose as a continuity and recall surface
- ranking and recent match information started to work together as retention cues rather than isolated widgets
- the lobby now better communicates “what happened recently” and “what should you do next”

This phase did not try to build a full live-service meta system. It established the **foundation** of one.

---

### 4) Reconnect and idle-state redundancy were reduced

One of the strongest UX problems in the Lobby was repeated intent: the hero said one thing, and a lower card repeated the same thing.

Delivered work:

- the reconnect state stopped repeating the same action through multiple equally loud surfaces
- the lower operational area was made conditional so it appears only when it adds real context
- reconnect states now communicate with less noise
- empty / no-room / no-history situations became cleaner and less dashboard-like

This improved hierarchy and reduced friction, especially in offline or reconnect flows.

---

### 5) Lobby visual system became more product-coherent

The Lobby became materially closer to the same product family as the Home.

Delivered work:

- gold / green / dark tones were better unified
- state surfaces gained more intentional visual roles
- sidebar information became more legible and less inflated
- compacting and spacing passes reduced unnecessary scrolling pressure
- the page became easier to read at standard browser zoom without losing premium presence

This was not a superficial recolor. It was a product-coherence pass.

---

### 6) MatchPage was harmonized with Home and Lobby

Although Phase 23 was centered on meta layer and retention, the product still needed one final coherence pass so the MatchPage did not visually feel like a separate application.

Delivered work:

- match surface colors were harmonized with the newer Home/Lobby direction
- premium gold / green / dark language became more consistent across the product
- the table-facing surface preserved gameplay protagonism while still feeling part of the same product family
- supporting panels were adjusted so they aligned better with the refined product identity

This was not a structural gameplay redesign. It was a **visual/product harmonization pass**.

---

### 7) Secondary match surfaces were refined as part of product continuity

To support the broader feeling of a finished product, supporting match UI sections were also refined.

Delivered work:

- header and secondary sections became more coherent with the updated premium visual language
- live-state and round-history support panels were refined to sit more naturally inside the full product identity
- match-side support surfaces now feel more intentional and less like isolated debug-era remnants

This mattered because the match screen is still part of the same user journey the Home and Lobby are preparing.

---

## 🧱 Architectural impact

This phase did not move rule authority away from the backend and did not alter the fundamental authoritative match contract.

Its impact was centered on the **product layer** and **continuity layer**:

- **Meta layer foundation** — the frontend now exposes a clearer product-facing continuity and retention surface
- **Lobby as product continuity surface** — the Lobby became more than a transport waiting page; it now acts as a real bridge between past and next play
- **Truthful entry surface** — the Home became more honest about what the product currently is
- **Cross-surface coherence** — Home, Lobby, and Match now communicate more like one application
- **State hierarchy hardening** — reconnect and active-room flows became more disciplined and less redundant

This phase strengthened the way the product is **entered, resumed, and remembered**, without changing the backend’s role as gameplay authority.

---

## 🧪 Validation performed

- Home runtime validation
- Lobby runtime validation
- MatchPage runtime validation
- repeated browser validation at 100% zoom
- Home truthfulness review
- Lobby reconnect/offline validation
- first-session / no-room validation
- recent-session validation
- active-room-waiting-ready validation
- active-room-ready validation
- `Seu Momento` compact/filled-state validation
- `Última Partida` rendering validation
- ranking rendering validation
- sidebar compactness validation
- continuity flow validation across Home → Lobby → Match
- visual coherence review across all three surfaces
- final manual product review of the phase-23 flow

---

## ⚖️ Key decisions and trade-offs

**Truthfulness over fake product theater** — the Home stopped relying on inflated pseudo-signals and instead described the actual product. This makes the project more defensible as a portfolio artifact.

**Hero as primary continuity guide** — the Lobby hero became the authoritative place for “what should I do now?” This prevented duplicated CTA noise and strengthened hierarchy.

**Retention foundation, not full meta-system simulation** — the phase intentionally stopped at continuity and retention cues. It did not try to invent a larger live-service progression model that the backend does not yet support.

**Conditional operational surfaces over always-on widgets** — lower status sections now appear when they add real value, instead of occupying space mechanically in every state.

**Cross-surface coherence without flattening roles** — MatchPage was visually harmonized with Home and Lobby, but it was not turned into a landing-page extension. Gameplay still remains the protagonist there.

**Product continuity over isolated page optimization** — the phase treated Home, Lobby, and Match as one journey instead of polishing each surface in isolation.

---

## 🧾 Technical debt left open

### 1. Bot betting behavior is still incomplete
- the bot loop is already playable, but betting escalation still remains shallow
- bot requests and reactions around truco / 6 / 9 / 12 still deserve a dedicated backend/gameplay phase
- this is now one of the most important remaining gameplay debts

### 2. MatchPage still carries concentration debt
- `matchPage` and related match composition files still hold a lot of orchestration responsibility
- visual/product coherence improved, but maintainability pressure remains
- future iteration should continue extracting responsibilities safely

### 3. Meta layer is still foundational, not complete
- the lobby now has a stronger continuity layer
- but this is still not a full persistence / progression / replay / career system
- richer retention systems remain future work

### 4. 2v2 is still not the main validated premium loop
- 1v1 remains the strongest validated product path
- broader premium validation for 2v2 remains backlog

### 5. Final deploy / public release closure remains open
- the product is materially stronger and more portfolio-ready
- but final release-hardening and public production closure still deserve their own dedicated phase

---

## 🏁 Final result

Phase 23 transformed the project from:

- a product with a strong premium match surface and an improving lobby, but still lacking a stronger continuity layer and full cross-surface coherence

into:

- a more truthful and defensible Home
- a materially stronger retention-oriented Lobby
- a clearer continuity model between reconnect, recent session, and active room states
- a stronger meta-layer foundation for player recall and return
- a more coherent visual language across Home, Lobby, and Match
- a more unified, premium, and portfolio-grade product journey

This phase closed the **meta layer / retention foundation** that became necessary after the match surface had already matured enough to stop being the only protagonist of the product.