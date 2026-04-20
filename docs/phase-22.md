# docs/phases/phase-22.md

## Context & Goal

This PR closes **Phase 22 — Bot Identity Productization + Match Table Observability / Premium Surface Finalization**.

Phase 21 ended with a match table that had already become materially stronger as a product-facing hero screen. The felt, HUD, special-state treatment, and end-of-match climax had all improved, and the table was no longer just a functional gameplay surface.

That changed the nature of the next gap.

The remaining problems were no longer mainly about whether the match page could look premium at all. Instead, the next real gap became a combination of **table identity, observability, and final compositional refinement**:

- bots still lacked stronger table-facing identity and personality cues
- the player still did not have a sufficiently useful secondary observability surface during live play
- the table still needed final product-grade balance between center-stage gameplay, hand dock, score, vira, and side diagnostics
- some visual elements still competed or failed to communicate with enough hierarchy
- the match surface still needed one more round of refinement to feel intentionally designed rather than iteratively patched

So the goal of this phase was not to reopen authoritative gameplay semantics and not to redesign the whole product again. The goal was to **finish the premium match surface**, add **bot identity as a visible product layer**, and introduce a **useful technical/observability side surface** without weakening the match table as the hero of the experience.

---

## What was delivered

**Bot identity productization:**
- bots now expose stronger visible identity on the table
- bot display names, avatar keys, and profiles became part of the surface language
- the opponent no longer reads as a generic seat placeholder
- bot presentation now contributes materially to the premium feel of the match

**Identity decoupled from seat determinism:**
- bot identity selection stopped feeling implicitly tied to fixed seating patterns
- the visible opponent gained more variety and product personality
- 1v1 matches now feel less repetitive at the presentation layer

**Observability side panel:**
- the match now has a dedicated secondary technical panel
- round history, live match state, bot telemetry, and event logs gained a real home outside the main center-stage play axis
- observability became available without forcing the center of the table to carry every transient state

**Rounds history refinement:**
- round history was reformatted into a structure that fits the side panel more elegantly
- the rounds surface became materially more readable in narrow lateral space
- history no longer feels like a squeezed debug artifact

**Better table hierarchy under live play:**
- center-stage gameplay regained proper protagonism
- played cards became more intentional as the main visual beat during rounds
- peripheral information moved further toward supporting roles instead of competing with the center

**Hand dock / player hand refinement:**
- the player hand area received multiple rounds of compositional adjustment
- hand visibility, dock integration, and vertical fit improved materially
- the hand now reads more as part of the table instead of an isolated block attached underneath

**Vira / score / round-feedback refinement:**
- the Vira gained stronger visual distinction as a special table element
- score treatment became more legible and more premium
- winner / tie feedback became clearer and more deliberate at the card level
- the table now communicates round outcomes with stronger visual literacy

**Final premium table finish:**
- the match surface became more balanced as a whole
- table, center cards, hand dock, side panel, score, and state language now coexist with better hierarchy
- the page is materially stronger as a premium portfolio hero screen

---

## Architectural impact

This phase did not move rule authority away from the backend. It strengthened the **presentation layer** and the **diagnostic surface** around the authoritative match.

- **Bot presentation layer** — identity became a first-class visible product concern without changing gameplay authority
- **Observability surface** — technical/live-state feedback moved into a real secondary surface instead of overloading the center of the table
- **Match composition** — the frontend became more deliberate about separating hero gameplay information from support/debug information
- **Table ergonomics** — the player hand, score, Vira, and center-stage cards were rebalanced as a single visual system
- **MatchPage identity** — the page became more convincing as a polished premium realtime game surface

---

## Validation performed

- frontend runtime validation
- repeated manual browser validation
- table validation at 100% zoom
- hand dock visibility validation
- played-card prominence validation
- winner / tie feedback validation
- Vira distinctiveness validation
- score readability validation
- side-panel readability validation
- round history readability validation
- bot identity visible-variation validation
- repeated live-play validation with panel open and closed
- final visual review of the premium match surface

---

## Key decisions and trade-offs

**Identity as product layer, not fake gameplay depth** — bot identity was introduced as a table-facing presentation asset, not as pretend strategic complexity. Visible personality was improved without inventing authority the backend does not own.

**Secondary observability instead of central pollution** — the technical panel was treated as a supporting surface so the center of the table could stay focused on actual play.

**Systemic table balancing over isolated patching** — multiple late-stage issues were symptoms of the same compositional imbalance between center stage, dock, score, and technical information. The solution required treating the table as a visual system.

**Center-stage cards remain sacred** — whenever hierarchy conflicts appeared, the played cards and moment-to-moment table read were prioritized over peripheral diagnostics.

**Player hand as integrated table component** — the hand dock was refined not just to “fit” technically, but to feel grounded in the same material language as the table.

**Premium distinction without loudness** — Vira, score, and round-result feedback were improved with stronger differentiation, but without turning the table into a noisy arcade UI.

**Observability without sacrificing product polish** — technical visibility was improved in a way that still supports portfolio-grade presentation.

---

## Technical debt left open

| | Status |
|-|--------|
| Bot strategic depth and competitive feel still have room to evolve beyond visible identity | 🔜 Next |
| Home, lobby, and callback can still be elevated even further to match the final premium standard of the table | 🔜 Backlog |
| 2v2 is still not the main validated product loop | 🔜 Backlog |
| Final deploy/public production closure still needs its own dedicated phase | 🔜 Backlog |

---

## Final result

Phase 22 transformed the project from:

- a premium match table with stronger product language but still missing richer opponent identity and a clean observability surface

into:

- a materially stronger premium match surface with visible bot identity
- a usable side-panel observability layer
- a better-balanced relationship between center-stage gameplay and secondary diagnostics
- a more deliberate hand dock, Vira, score, and round-result composition
- a more polished, defensible, and portfolio-grade `MatchPage`

This phase closed the table-facing productization and observability layer that became necessary after Phase 21 had already established the match screen as a serious premium hero surface.