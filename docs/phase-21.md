# docs/phases/phase-21.md

## Context & Goal

This PR closes **Phase 21 — Match Table Productization + HUD / Game-Feel Consolidation**.

Phase 20 ended with a frontend that had already recovered authoritative visible flow, stabilized round/hand progression under real play, closed the visible truco cycle, and restored mão de 11 continuity as real gameplay behavior.

That changed the nature of the next gap. The remaining problem was no longer mainly about whether the authoritative loop survives real play or whether truco request/accept/decline works visibly. Instead, the main gap became product-facing:

- the match table still needed to sell the game as a real product screen
- the HUD still needed stronger and more elegant state communication
- mão de 11 still needed a more intentional visual treatment as a special state
- end-of-match feedback still needed a stronger climax and terminal feeling
- the screen still needed deeper hierarchy between felt, table, hand dock, state columns, result beats, and action focus

So the goal of this phase was not to reopen gameplay core semantics. The goal was to evolve the match screen into a stronger product-facing hero surface without weakening backend authority.

---

## What was delivered

**Match table productization:**
- the match table evolved from a strong functional game screen into a more premium product surface
- felt, table center, HUD, score, state, and hand dock now read as part of a more coherent visual language
- the table became substantially stronger as a hero screen for portfolio usage

**Stronger HUD hierarchy:**
- clearer left/right contextual columns for value, state, score, and rounds
- central gameplay space became less polluted by ad hoc notifications
- state communication became more readable without requiring the player to scan too many competing overlays

**Premium felt and table composition:**
- felt treatment refined into a stronger premium dark table composition
- center glow, starfield/felt texture, arch outline, and bezel treatment consolidated into a more intentional product finish
- the table now sustains more identity even during idle states

**Card and table presence:**
- cards gained stronger material feel and better visual presence
- opponent, vira, played-card, and hand-card presentation feel more cohesive

**Hand dock and player-hand emphasis:**
- the player hand dock became more intentional as a premium control/read surface
- active vs subdued hand states became more deliberate
- the player hand gained stronger protagonism during important decision moments

**Mão de 11 visual product treatment:**
- gained a dedicated visual decision stage — player can clearly inspect their hand before deciding
- the special-hand experience became materially more understandable and more premium
- after acceptance, the table no longer keeps over-promoting the special state in the central play axis

**End-of-match climax:**
- hand/match ending gained stronger visual climax treatment
- the project now has a more convincing emotional beat when the match closes
- a real terminal result modal communicates victory/defeat, final score, and next-step clearly

**Useful game-feel improvements:**
- motion, emphasis, glow, and state transitions improved in ways that help reading
- the table gained more rhythm and presence without pretending that animation alone solves semantics

---

## Architectural impact

This phase did not move authority away from the backend. It improved the frontend product layer so the player can understand and feel the match surface more clearly while the backend remains authoritative.

- **Match surface** — moved from visible-gameplay-stable into product-facing premium table
- **HUD** — became more deliberate in how value, state, score, and round progress are communicated
- **Special-state presentation** — mão de 11 became materially more productized without inventing local authority
- **End-of-match experience** — the match now ends with stronger product-facing closure, not only semantically
- **MatchPage identity** — the page became more defensible as a premium hero screen

---

## Validation performed

- frontend runtime validation
- repeated manual browser validation
- visual review of the match table across multiple states
- mão de 11 decision-state validation
- mão de 11 post-acceptance validation
- end-of-match climax and terminal result-state validation
- premium/idle table readability validation
- HUD/state readability validation in multiple table situations
- portfolio-grade screenshot validation of the hero screen

---

## Key decisions and trade-offs

**Productization after semantic stabilization** — premium visuals over unstable semantics would still produce a weak product. Phase 20 closed gameplay semantics first deliberately.

**Real observed UX refinement over theory-only placement** — mão de 11 treatment, post-acceptance status, and table overlays were refined through observed behavior rather than relying only on initial layout assumptions.

**Premium finish without fake authority** — the frontend improved how the match is presented, but did not invent new rule authority or local state semantics beyond the backend contract.

**Stronger table hierarchy instead of more floating banners** — state communication was integrated into table columns, dock, badges, and terminal surfaces instead of stacking more transient central banners.

**Match-ending closure as a real product state** — the end of the match was treated as a product experience problem, not only as a technical `finished=true` condition.

**Useful game-feel only** — motion and transition work were kept useful to clarity and presence, not used as empty cinematic churn.

---

## Technical debt left open

| | Status |
|-|--------|
| Bot personality and competitive feel — the table is stronger, but the bot still lacks richer strategy | 🔜 Next |
| Home, lobby, and callback can still be elevated to the same premium standard | 🔜 Backlog |
| 2v2 is still not the main validated product loop | 🔜 Backlog |
| Frontend final public deployment closure still needs dedicated phase | 🔜 Backlog |

---

## Final result

Phase 21 transformed the project from a match screen with strong visible gameplay semantics but not fully productized into:

- a materially stronger premium match table
- a clearer HUD/value/state/score hierarchy
- a more intentional felt and table composition
- a productized mão de 11 experience with dedicated decision stage
- a stronger end-of-match climax and result flow
- a much more convincing `MatchPage` hero screen for portfolio and product identity

This phase closed the match-surface productization layer that became necessary after Phase 20 had already made the visible gameplay core trustworthy.