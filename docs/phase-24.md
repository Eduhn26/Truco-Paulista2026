# docs/phases/phase-24.md

## 🎯 Context & Goal

This PR closes **Phase 24 — 2v2 Partner Intelligence and Betting Flow Hardening**.

Phase 23 had already strengthened the product/meta layer around Home, Lobby, Match continuity, reconnect states, recent-session recall, and the broader retention foundation. That phase made the application feel more coherent as a product journey, but it intentionally did not reopen the match rules or the deeper 2v2 gameplay loop.

After that product pass, the next meaningful gap moved back into the table itself: the 2v2 surface was visually stronger, but the partnership experience still needed to feel more like real Truco.

Real play exposed a set of gameplay/product problems:

- partner signals existed visually, but they still needed stronger tactical consequence
- the bot partner could evaluate the hand, but betting escalation still needed a more believable team flow
- when the bot wanted to pressure, accept, decline, or raise, the human player still needed final authority
- the opponent bot still needed to respect public threats, especially revealed manilhas in decisive moments
- the frontend needed clearer copy and visual feedback for who initiated Truco / 6 / 9 / 12
- the accepted-value atmosphere needed final polish so 3 / 6 / 9 / 12 felt clean on the match table

So the goal of this phase was not to redesign the game or move authority into the frontend.

The goal was to harden the **2v2 partnership layer**: signals, partner advice, bot betting initiative, public-threat awareness, human authorization, and the visual clarity around Truco / 6 / 9 / 12.

---

## ✅ What was delivered

### 1) Partner bot betting initiative became human-authorized

The partner bot can now express betting initiative without executing team betting decisions alone.

Delivered behavior:

- the bot partner may identify a good moment to request Truco or raise
- instead of acting autonomously, it creates a partner bet proposal
- the human player receives the proposal on the match surface
- the human can approve or reject the proposal
- the backend resolves the proposal and executes only when authorized

This preserves a critical 2v2 rule of product feel: the bot can behave like a partner, but the human keeps final control over the team’s betting risk.

---

### 2) Partner bet proposal flow was added end-to-end

A dedicated socket flow was added for partner betting proposals.

Delivered events:

- `partner-bet-proposal`
- `partner-bet-proposal-resolved`
- `approve-partner-bet-proposal`
- `reject-partner-bet-proposal`

The backend validates the proposal context and rejects invalid authorization attempts. The frontend consumes the proposal, renders it in the match surface, and sends the player’s decision back through the typed socket client.

This makes the flow explicit instead of hiding it inside generic bot play or generic signal behavior.

---

### 3) Partner signals became a real tactical layer

Signals now behave more like a partnership communication system instead of only a visual badge.

Delivered behavior:

- hand-memory signals can influence the bot partner across the hand
- round-tactic signals can influence the next compatible play
- bet-intent signals communicate pressure, acceptance, avoidance, or raise intention
- signals are resolved for the correct bot partner
- consumed signals are cleared after compatible decisions
- invalid signals are rejected when they do not match the player’s actual hand context

Examples of improved signal meaning:

- `Tô forte`
- `Tô fraco`
- `Mata essa`
- `Joga baixo`
- `Pressiona`
- `Não compra`
- specific manilha signals

The result is a more believable 2v2 table where partner communication matters mechanically and visually.

---

### 4) Betting advice became semantically clearer

The bot partner no longer emits generic pressure language for every blocked betting intent.

Delivered advice language:

- request Truco → `Pressiona`
- accept bet → `Eu pago`
- decline bet → `Não compra`
- raise → `Dá para aumentar`

This fixed the mismatch between what the bot wanted to do and what the UI communicated to the player.

The player-facing advice now better represents the bot’s actual betting intention.

---

### 5) Tactical fallback after blocked betting was hardened

When the partner bot wanted to bet but the action was blocked because the human partner owns the decision, the gateway now asks for a card-only fallback decision.

This prevents a bad sequence where the bot:

1. wants to request or raise
2. gets blocked by human authority
3. then burns a strong card with poor tactical context

The fallback keeps betting authority separate from card choice while still letting the bot continue the turn intelligently.

---

### 6) Public-threat-aware betting behavior was introduced

The heuristic bot now considers visible public threats before betting or bluffing.

This matters especially when an opponent has already revealed a decisive manilha.

Delivered public-threat concepts include:

- public threat level
- public threat card
- public threat suit
- whether the threat is decisive
- whether the bot can beat the public card
- betting penalty against dangerous public threats
- bluff multiplier reduction under public pressure

This directly addresses reckless betting cases such as raising after an opponent has already revealed Zap in a decisive context.

---

### 7) 2v2 betting UI became clearer

The frontend now communicates the origin of betting moments more accurately.

Delivered improvements:

- distinguishes when the human player asked for Truco
- distinguishes when the partner initiated the betting movement
- avoids collapsing both human and partner into the same “Sua dupla pediu” copy
- renders partner bet proposals with approve/reject affordances
- keeps the match surface aligned with the backend proposal state

This improved the emotional clarity of the 2v2 table: the player can now understand whether the action came from them, the partner, or the rivals.

---

### 8) Accepted-value atmosphere was visually polished

The match table received a final spacing pass for accepted values.

Delivered improvements:

- value watermark spacing for 3 / 6 / 9 / 12
- better separation between number and label
- clearer accepted-value atmosphere without covering important table elements
- refined visual readability at 100% browser zoom

This was a product polish step, not a gameplay rule change.

---

### 9) Test expectations were updated for the public identity contract

The public player identity contract now includes additional identity fields in room/ranking state.

Test updates included:

- `displayName`
- `publicName`
- `publicSlug`

Room manager and ranking specs were updated to match the current runtime contract.

Final validation passed with:

- 32 test suites
- 231 tests
- 0 failures
- backend build passing
- frontend build passing

---

## 🧱 Architectural impact

This phase did not move game authority into the frontend.

The backend still owns:

- match state
- hand state
- betting legality
- partner proposal validation
- bot decision execution
- signal validation
- card play legality
- scoring and hand progression

The frontend owns only:

- rendering proposal state
- rendering partner signals
- sending human approval/rejection
- rendering clearer table copy and value atmosphere

The bot boundary also remains clean:

- `BotDecisionPort` remains the application contract
- heuristic and Python adapters remain infrastructure concerns
- the gateway coordinates runtime flow
- the domain remains isolated from Socket.IO, frontend state, OAuth, and bot infrastructure

The important architectural gain is that the 2v2 partnership loop became richer without breaking the project’s existing authority model.

---

## 🧪 Validation performed

- full Jest suite validation
- backend production build validation
- frontend production build validation
- manual 2v2 gameplay validation
- partner signal runtime validation
- partner proposal runtime validation
- approve/reject proposal validation
- blocked partner betting validation
- semantic betting advice validation
- tactical fallback validation after blocked betting
- public manilha threat behavior validation
- Truco / 6 / 9 / 12 copy validation
- accepted-value watermark visual review
- 100% zoom match table review

Final automated validation:

```txt
Test Suites: 32 passed, 32 total
Tests: 231 passed, 231 total
Snapshots: 0 total
```

---

## ⚖️ Key decisions and trade-offs

**Human authority over autonomous bot betting** — the partner bot can suggest or propose escalation, but the human player keeps the final betting decision in a mixed human + bot team.

**Signals as bounded tactical memory** — signals are not permanent global buffs. They are scoped by intent, timing, and compatible consumption.

**Advice language follows bot intent** — the UI does not reuse one generic message for different betting meanings. It now communicates pressure, acceptance, avoidance, and raise intention separately.

**Public threat awareness without overfitting the bot** — the bot became more careful around visible manilhas, especially decisive threats, without trying to become a perfect competitive Truco AI in this phase.

**Frontend clarity without frontend authority** — the match UI became more expressive, but it still does not decide rules or execute hidden game logic.

**Small visual polish instead of redesign** — accepted-value watermark fixes were intentionally scoped to readability and game feel, not a broader table redesign.

---

## 🧾 Technical debt left open

### 1. Bot intelligence can still become deeper

The partner and rival bots now behave much better around signals and betting, but this is still heuristic intelligence.

Future work could improve:

- long-term bluff memory
- opponent style tracking
- partner trust model
- richer risk modeling across match score
- more varied bot personality expression

### 2. MatchPage still carries orchestration pressure

The match page and match table components remain large and carry many visual/runtime responsibilities.

This phase improved behavior and polish, but did not attempt a structural frontend refactor.

### 3. Socket/client abstraction debt still exists outside this scope

Some older Phase 23 review comments remain valid and were intentionally not closed here, including broader cleanup around socket abstraction and SPA navigation patterns.

### 4. Accepted-value visual system may need future extraction

The 3 / 6 / 9 / 12 atmosphere is now more readable, but the visual tier system could later be extracted into a smaller dedicated visual component.

### 5. 2v2 still needs broader long-session validation

The 2v2 loop is significantly stronger, but longer play sessions should still be used to validate repeated betting, signal cadence, and edge cases under more varied score states.

---

## 🏁 Final result

Phase 24 transformed the 2v2 experience from:

- visually strong but still shallow partner communication
- bot betting behavior that could feel disconnected from team authority
- generic betting advice
- weak distinction between human and partner betting origins
- incomplete public-threat awareness

into:

- a stronger 2v2 partnership loop
- tactical partner signals with real decision impact
- bot betting initiative mediated by human authorization
- clearer betting advice language
- safer fallback after blocked betting
- public-threat-aware bot betting behavior
- improved Truco / 6 / 9 / 12 visual clarity
- a more believable human + bot team experience

This phase directly attacks one of the most important debts left by Phase 23: making 2v2 feel less like an extended 1v1 bot loop and more like a real Truco partnership.
