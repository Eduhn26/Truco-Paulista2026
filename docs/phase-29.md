# Phase 29 — AI Lab Visual Experience

> **Status:** ✅ Complete  
> **Branch:** `feat/phase-29-ai-lab-visual-experience`

---

## Objective

Transform the Machine Learning work completed in Phase 28 into a product-facing experience that can explain, configure and demonstrate the bot intelligence inside Truco Paulista.

The objective was not to create a static dashboard with model numbers.

The phase needed to make the complete intelligence journey understandable:

```text
Heuristic bots
    ↓
Headless simulation
    ↓
Telemetry and dataset
    ↓
Model experiments
    ↓
Random Forest candidate
    ↓
Runtime inference
    ↓
Shadow Mode
    ↓
ML-assisted decisions
    ↓
Direct A/B validation
    ↓
Interactive AI Lab experience
```

The final experience had to preserve the visual identity of the game, use real project data, reuse the actual Match presentation where appropriate and keep the experimental ML runtime isolated from the stable gameplay path.

---

## Context

Phase 28 completed the first full Machine Learning lifecycle inside the project.

That phase produced:

- simulation telemetry;
- dataset preparation and quality analysis;
- independent raw-card features;
- grouped model validation;
- Logistic Regression, Decision Tree and Random Forest benchmarks;
- a final Random Forest candidate;
- fresh-seed holdout validation;
- runtime inference;
- Shadow Mode;
- ML-assisted betting decisions;
- deterministic heuristic fallback;
- direct ML-assisted versus heuristic A/B validation.

The next problem was presentation.

The engineering work existed, but most of it was only visible through:

- source code;
- terminal output;
- generated datasets;
- model artifacts;
- telemetry;
- experiment files.

Phase 29 converted that technical evolution into an interactive product experience without fabricating live predictions, model metrics or experiment results.

---

## AI Lab product experience

The new AI Lab is available through the dedicated product route:

```text
/ai-lab
```

The experience is divided into four connected workspaces:

```text
01 — Overview
02 — Bot Studio
03 — Simulation
04 — ML Lab
```

Each workspace has a different responsibility.

---

## Overview

The Overview introduces the scale and technical scope of the intelligence work.

It presents real project metrics including:

```text
6,000 simulated matches
106,256 hands
495,546 decision rows
203,167 training rows
101,648 fresh holdout states
```

The final candidate metrics shown in the experience are the real Phase 28 evaluation results:

```text
Accuracy:                  74.35%
Balanced Accuracy:         74.29%
ROC AUC:                   0.8305
Brier Score:               0.1678
Log Loss:                  0.4997
High-confidence coverage:  57.29%
High-confidence accuracy:  85.42%
```

The page also introduces the model artifact and the progression from simulation data to runtime intelligence.

---

## Bot Studio

Bot Studio allows an experiment to be configured before starting the simulation.

Each bot can select:

- aggressive profile;
- balanced profile;
- cautious profile.

Each bot can also select its intelligence engine:

- heuristic;
- Shadow Mode;
- ML-assisted.

The workspace exposes the active experiment configuration before execution, including:

- Bot A profile and intelligence mode;
- Bot B profile and intelligence mode;
- deterministic simulation seed;
- observability options;
- active ML-assisted thresholds for the inspected bot.

The Studio intentionally distinguishes:

```text
BOT A · LAB
```

from:

```text
BOT B · OPPONENT
```

Bot A remains the primary object of inspection while Bot B defines the matchup context.

The experience also makes the isolation boundary explicit:

```text
Experimental environment
Does not alter the main game
```

---

## Real simulation integration

The AI Lab does not generate a fake match in the frontend.

The simulation flow is:

```text
AI Lab frontend
    ↓
NestJS AI Lab endpoint
    ↓
Python Bot Service
    ↓
HeadlessMatchSimulator
    ↓
Instrumented strategy engines
    ↓
Structured simulation result
    ↓
Deterministic frontend replay
```

The frontend sends the real experiment configuration to the backend.

NestJS exposes the AI Lab simulation boundary and delegates execution to the Python Bot Service.

The Python simulation layer executes a real headless match using the configured bot profiles and intelligence modes.

The result contains:

- match information;
- hands;
- actions;
- decisions;
- model observations;
- overrides;
- fallback state;
- architecture trace;
- structured replay events.

This keeps the frontend responsible for presentation while the simulation remains owned by the existing Python intelligence environment.

---

## Intelligence Spectator

The Simulation workspace became an Intelligence Spectator instead of a generic event viewer.

The goal is to show two things at the same time:

```text
What is happening in the match
+
How the bot is making the current decision
```

The experience reuses the actual Match presentation through an adapter instead of recreating a second fake game table.

The architecture follows this direction:

```text
LIVE MATCH
    └─ MatchTableShell / presentation
         ↑
       Socket runtime

AI LAB
    └─ MatchTableShell / presentation
         ↑
       Replay adapter
```

This keeps the visual language of the real game while allowing the AI Lab to replay deterministic simulation data.

---

## Replay controls

The simulation can be inspected through dedicated replay controls.

The experience supports navigation by:

- previous moment;
- next moment;
- next decision;
- next ML event;
- next override;
- next hand.

Playback speeds include:

```text
0.5×
1×
2×
4×
```

The replay can also be paused so an individual decision can be inspected without losing the current match state.

The Decision Trace remains the compact historical view of the execution.

The Bot Intelligence panel is intentionally focused on the current decision instead of keeping stale historical decision cards inside the live runtime panel.

---

## Runtime telemetry

The simulation header exposes compact runtime telemetry such as:

- total decisions;
- ML-eligible states;
- inference count;
- override count;
- fallback count;
- Shadow observations;
- Decision Trace.

The runtime also keeps the final model context visible:

```text
Artifact v1.0
74.29% Balanced Accuracy
0.8305 ROC AUC
85.42% high-confidence accuracy
```

The displayed metrics come from the actual Phase 28 model evaluation and are not generated from the current replay.

---

## Bot Intelligence states

The side panel was designed as a runtime explanation layer.

It supports the main decision states below.

### Heuristic

The baseline strategy remains visible for normal deterministic decisions.

Card selection continues to belong to the heuristic strategy.

### ML not eligible

States outside the supported model contract are explicitly identified.

Examples include:

- card selection;
- unsupported gameplay states;
- score-sensitive safeguards;
- states outside the current override policy.

The interface explains why the model is not participating instead of presenting a fake prediction.

### ML-assisted cascade

Eligible decisions can expose the full decision path:

```text
01 — Heuristic
        ↓
02 — Random Forest
        ↓
03 — Policy threshold
        ↓
Final decision
```

The panel distinguishes:

```text
Baseline preserved
```

from:

```text
ML Override
```

The Random Forest remains an additional conservative signal instead of replacing the complete bot strategy.

### Shadow Mode

Shadow Mode is presented as:

```text
One decision
Two paths
```

The interface shows:

```text
Heuristic
    ↓
Executed decision
```

in parallel with:

```text
Random Forest
    ↓
Observation only
```

The final message makes the runtime contract explicit:

```text
Match unchanged
```

The visual validation confirmed that:

- the heuristic remained authoritative;
- the Random Forest prediction was displayed in parallel;
- no override was applied;
- the Decision Trace registered Shadow observations separately.

### Fallback

Fallback was validated with the Python service running while the configured model path was intentionally unavailable.

The simulation continued normally.

The final behavior is:

```text
ML-assisted state
    ↓
Model unavailable
    ↓
Fallback heuristic
    ↓
Safe baseline decision preserved
```

The Decision Trace classifies `FB` only when all of the following are true:

- the bot is using ML-assisted mode;
- the decision is actually ML-eligible;
- the model is unavailable or prediction fails.

Non-eligible decisions remain classified as normal heuristic decisions.

This prevents fallback telemetry from being inflated by card-selection states or other decisions that never required the model.

---

## ML Lab

The ML Lab explains the engineering path behind the runtime experience.

It includes the main experiment progression:

```text
Dummy Classifier
    ↓
Logistic Regression
    ↓
Decision Tree
    ↓
Random Forest
```

The final Random Forest candidate is presented with the real benchmark metrics from Phase 28.

---

## Feature engineering story

The ML Lab also documents one of the most important technical decisions from the previous phase.

Early experiments showed that the model depended heavily on:

```text
hand_strength
```

That feature was not target leakage, but it was already a manually designed heuristic produced by the bot.

The final primary model removed that dependency and introduced features derived directly from:

- visible cards;
- card power;
- manilha count;
- rank diversity;
- current game context.

The visual experience presents that evolution as part of the model story instead of hiding the ablation result.

---

## Shadow to ML-assisted progression

The runtime architecture is explained as a safe progression:

```text
First observe
    ↓
Then influence with guardrails
```

Shadow Mode validates inference without affecting gameplay.

ML-assisted mode allows the model to influence only conservative eligible betting decisions.

The supported runtime influence remains limited to actions such as:

- request truco;
- accept a bet;
- decline a bet;
- raise to six;
- raise to nine;
- raise to twelve.

The heuristic strategy remains responsible for:

- card selection;
- unsupported states;
- later-round decisions outside the candidate scope;
- special-hand logic;
- score-sensitive safeguards;
- fallback behavior.

---

## Interactive decision laboratory

The ML Lab includes a didactic decision-policy laboratory.

The user can inspect how:

- bot profile;
- betting scenario;
- win probability;

interact with the configured ML-assisted thresholds.

The laboratory explains the policy boundary.

It does not pretend to execute a new Random Forest inference from the manually selected probability.

This distinction keeps the interactive visualization honest:

```text
Model probability
    +
Profile policy threshold
    ↓
Possible assisted action
```

---

## Direct A/B result

The final Phase 28 A/B experiment is represented with its real result:

```text
600 matches

ML-assisted wins: 317
Heuristic wins:   283

ML-assisted win rate: 52.83%
Heuristic win rate:   47.17%

ML overrides: 641
```

The 95% confidence interval was:

```text
48.84% – 56.83%
```

The AI Lab preserves the original statistical conclusion:

```text
Promising, but statistically inconclusive.
```

The experience does not present the observed 52.83% win rate as proof that the ML-assisted strategy is definitively superior.

---

## Main implementation areas

### Frontend AI Lab

```text
frontend-app/src/features/aiLab/
frontend-app/src/pages/aiLabPage.tsx
frontend-app/src/styles/ai-lab.css
```

Responsibilities include:

- AI Lab data and model facts;
- simulation API contract;
- deterministic replay direction;
- Match presentation adapter;
- Intelligence Spectator;
- Decision Trace;
- replay controls;
- runtime telemetry;
- ML Lab visual storytelling.

### Product integration

```text
frontend-app/src/app/app.tsx
frontend-app/src/app/router.tsx
frontend-app/src/main.tsx
```

Responsibilities include:

- `/ai-lab` route;
- application navigation;
- AI Lab stylesheet integration;
- page loading boundary.

### Match presentation reuse

```text
frontend-app/src/features/match/matchTableShell.tsx
frontend-app/src/features/match/matchPlayerHandPanel.tsx
```

The AI Lab reuses the real match presentation while preserving live-match behavior.

Changes introduced for the spectator experience remain presentation-oriented and do not move simulation rules into the frontend.

### NestJS simulation boundary

```text
src/ai-lab/
src/app.module.ts
```

Responsibilities include:

- AI Lab simulation HTTP boundary;
- request forwarding to the Python Bot Service;
- timeout and infrastructure error handling;
- isolation from the main gameplay runtime.

### Python simulation instrumentation

```text
python-bot-service/app/ai_lab_simulation.py
python-bot-service/app/main.py
python-bot-service/app/strategy/ml_assisted.py
python-bot-service/tests/test_ai_lab_simulation.py
```

Responsibilities include:

- real headless simulation execution;
- configurable intelligence engines per bot;
- decision instrumentation;
- structured AI Lab events;
- Shadow observations;
- ML-assisted overrides;
- model-unavailable fallback metadata;
- simulation contract tests.

---

## Visual strategy

The AI Lab uses the same premium visual direction established by the rest of Truco Paulista:

- dark navy and green surfaces;
- restrained gold accents;
- serif display typography;
- physical playing-card language;
- cinematic match states;
- controlled motion;
- clear separation between gameplay and technical observability.

The visual hierarchy was refined around one main rule:

```text
The match remains the protagonist.
The intelligence explains what the match is doing.
```

The Intelligence Spectator therefore keeps:

- the actual table visible;
- Bot Intelligence visible;
- runtime telemetry visible;
- replay controls visible;

inside the desktop theater experience without requiring browser zoom reduction.

The final layout was validated at 100% browser zoom.

---

## Important visual decisions

### Reuse the real Match presentation

The AI Lab does not maintain a second independent representation of the game table.

### Keep historical events outside the live intelligence panel

The Decision Trace owns history.

The Bot Intelligence panel owns the current decision.

Persistent “last analysis” cards, execution receipts and synchronization toasts were removed because they created temporal ambiguity between the decision runtime and the visual pacing of the match.

### Keep the complete decision cascade visible

When an eligible ML-assisted decision is being analyzed, the complete flow remains readable without scrolling the side panel.

### Preserve the complete theater frame

The final desktop composition keeps:

```text
Telemetry
Match table
Bot Intelligence
Replay controls
```

visible together.

### Keep the VAZAS tracker aligned with the scoreboard

The round tracker was adjusted so the label, counter and three round markers share the same visual width and alignment.

---

## Validation

Phase 29 was validated through repeated local simulations, screenshots and recorded video reviews.

Manual validation covered:

- AI Lab route and navigation;
- Overview metrics and model story;
- Bot Studio profile switching;
- Heuristic, Shadow and ML-assisted mode switching;
- deterministic seed configuration;
- observability options;
- real simulation execution through NestJS and Python;
- replay navigation;
- speed controls;
- MatchTableShell reuse;
- real ML inference display;
- baseline-preserved decisions;
- real ML override visualization;
- Truco / betting presentation;
- ML guardrails;
- Shadow Mode;
- model-unavailable fallback;
- fallback Decision Trace semantics;
- ML Lab model comparison;
- feature-engineering explanation;
- interactive decision-policy laboratory;
- direct A/B result presentation;
- known-limitations section;
- desktop theater at 100% browser zoom;
- panel overflow and clipping;
- card and hand spacing;
- replay controls remaining visible;
- VAZAS tracker alignment.

The fallback test specifically confirmed:

```text
Python service available
+
Model unavailable
+
0 model inferences
+
0 ML overrides
+
Simulation continues
+
Heuristic decision preserved
```

The Shadow test confirmed:

```text
Heuristic decision executed
+
Random Forest prediction observed
+
No gameplay override
```

No model metric or live probability is fabricated by the frontend.

---

## Technical decisions

### Keep the AI Lab isolated from the live match runtime

The AI Lab uses a dedicated simulation boundary and deterministic replay.

It does not replace the Socket.IO live-match controller.

### Reuse presentation instead of duplicating gameplay UI

The existing Match presentation is reused through an adapter.

This reduces visual drift between the real game and the laboratory experience.

### Use real simulation data

The match, decisions, predictions, overrides and fallback states come from the simulation result returned by the Python service.

### Keep static model metrics separate from runtime telemetry

Holdout metrics describe the candidate artifact.

Runtime counters describe only the current simulation.

The UI does not mix those two sources.

### Keep the live intelligence panel focused on the present

The side panel explains the active decision.

The Decision Trace provides historical navigation.

This avoids presenting stale events as if they were still happening live.

### Preserve safe heuristic authority

The model remains optional.

Unsupported states, model failures and disabled ML all preserve deterministic heuristic behavior.

### Keep the statistical conclusion honest

The A/B experiment is presented as promising but inconclusive.

The visual experience does not convert an experimental signal into a production claim.

---

## Known limitations

### Simulator domain

The model was trained and validated using simulated matches and the project's current bot-profile family.

The current evidence does not establish equivalent performance against human players.

### First-decision model scope

The current Random Forest candidate is focused on eligible first-decision states.

It is not a universal evaluator for every state of a Truco match.

### 1v1 ML-assisted scope

The production-safe ML-assisted candidate remains restricted to the currently supported 1v1 decision contract.

### Model artifact distribution

The generated model artifact remains outside Git.

A future production deployment still needs an explicit artifact distribution strategy.

### Experimental environment

The AI Lab is an isolated experimentation and visualization surface.

It does not make ML a hard dependency of the main game.

### Replay semantics

The Intelligence Spectator replays a completed deterministic simulation.

It is not a live production match stream.

---

## Result

Phase 29 completed the productization of the project's intelligence work.

The project can now show the complete evolution:

```text
Heuristic bots
    ↓
Real headless simulations
    ↓
Structured telemetry
    ↓
Dataset and analytics
    ↓
Model benchmarks
    ↓
Feature engineering
    ↓
Random Forest candidate
    ↓
Generalization validation
    ↓
Runtime inference
    ↓
Shadow Mode
    ↓
ML-assisted decisions
    ↓
Fallback safety
    ↓
A/B validation
    ↓
Interactive AI Lab
```

The final experience connects three layers that were previously separated:

```text
Engineering
+
Machine Learning
+
Gameplay presentation
```

The AI Lab now provides:

- a technical overview of the intelligence pipeline;
- a configurable Bot Studio;
- a real simulation and deterministic replay experience;
- an observable runtime decision panel;
- a visual ML laboratory;
- honest experiment results and limitations.

The Machine Learning work is therefore no longer visible only through code and experiment files.

It became an integrated, interactive part of the Truco Paulista product while preserving the existing heuristic strategy as the stable gameplay foundation.

---

## Next step

Phase 29 closes the current AI Lab Visual Experience milestone.

Future work may expand:

- human gameplay telemetry;
- model evaluation outside the current simulator domain;
- later-round models;
- explicit 2v2 ML features;
- model artifact distribution and registry;
- new controlled experiments.

None of those items are required for the current Phase 29 scope.
