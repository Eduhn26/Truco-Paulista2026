# Phase 28 — Machine Learning Intelligence Pipeline

> **Status:** ✅ Complete  
> **Branch:** `feat/phase-27-dataset-pandas-analytics`

---

## Objective

Transform the simulation data produced by the Python bot environment into a complete experimental Machine Learning pipeline capable of:

- learning from simulated Truco Paulista matches;
- estimating the probability of winning a hand from the visible pre-decision state;
- validating whether the learned signal generalizes beyond the training matches;
- loading a versioned model artifact at runtime;
- observing live decisions safely through shadow mode;
- optionally using the model as a conservative betting signal;
- comparing the ML-assisted strategy directly against the existing heuristic bot.

The goal of this phase was not simply to train a classifier.

The goal was to build the complete path from gameplay telemetry to a model that can be evaluated and integrated into the bot without removing the existing deterministic strategy or compromising the current decision flow.

---

## Context

The Python bot service already contained:

- deterministic card selection;
- betting strategies;
- aggressive, balanced and cautious profiles;
- partner signal handling;
- mão de onze decisions;
- headless match simulations;
- structured simulation telemetry.

Those simulations made it possible to generate large volumes of controlled gameplay data.

The next problem was to determine whether that data contained enough signal to support a model that could estimate:

```text
P(hand_won = 1 | state_before_decision)
```

The model was intentionally not trained to copy the action selected by the heuristic bot.

Predicting the heuristic action directly would mainly reproduce rules that were already explicitly implemented in code.

Instead, the model was trained to estimate hand outcome probability from information available before a decision.

---

## Dataset

The accumulated simulation dataset used during the experiments contained approximately:

```text
6,000 matches
106,256 hands
495,546 decision rows
```

The primary target was:

```text
hand_won
```

The split group was:

```text
match_id
```

All decisions belonging to the same match remained in the same partition.

This avoided evaluating the model on decisions from matches that were partially present in the training data.

---

## Leakage controls

Several columns were intentionally excluded from the model feature set because they reveal future information, identify simulation runs or directly encode the heuristic action.

Examples include:

- selected action;
- selected card;
- final hand winner;
- points awarded after the hand;
- final hand value;
- future score state;
- simulation identifiers;
- seeds;
- hidden opponent cards.

The initial implementation also exposed an important modeling issue around:

```text
hand_strength
```

This value was not target leakage, but it was already a manually designed heuristic produced by the bot itself.

Ablation experiments showed that a large part of the early model performance depended on this feature.

Instead of keeping that dependency hidden, the final primary model pipeline removed `hand_strength` and introduced features derived directly from the visible cards.

---

## Raw card features

The independent card representation introduced features including:

- card count;
- manilha count;
- strongest card power;
- second strongest card power;
- weakest card power;
- average card power;
- high-card count;
- distinct rank count.

The final candidate therefore learns primarily from the actual cards and game context instead of depending on the existing hand-strength heuristic.

---

## Model benchmarks

The phase evaluated progressively stronger baselines and models:

```text
DummyClassifier
LogisticRegression
DecisionTreeClassifier
RandomForestClassifier
```

The final primary feature pipeline used 21 model features without `hand_strength`.

Random Forest produced the strongest overall benchmark among the evaluated candidates.

Approximate benchmark results:

```text
Balanced Accuracy: 0.744
ROC AUC:           0.830
Brier Score:       0.168
```

The most important Random Forest features were all derived directly from the cards.

The strongest signals included:

1. average card power;
2. second strongest card power;
3. weakest card power;
4. high-card count;
5. strongest card power;
6. manilha count.

---

## Early-state validation

The final candidate is intentionally focused on the first valid decision state of a hand.

This avoids evaluating the same final hand outcome repeatedly across multiple later decisions and makes the runtime contract clearer.

The candidate is therefore only considered eligible when:

- the player still has three cards;
- the hand is in its initial round state;
- no round has already been won or tied;
- no card has already been played in the current round.

Later states continue to use the existing heuristic strategy.

---

## Generalization validation

The model was evaluated under multiple validation strategies.

These included:

- grouped match train/test splits;
- repeated benchmark runs;
- leave-one-simulation-run-out validation;
- leave-one-matchup-pair-out validation;
- fresh-seed final holdout evaluation.

The final fresh holdout generated:

```text
3,000 new matches
6 matchup configurations
101,648 evaluated first-decision states
```

Final holdout metrics:

```text
Accuracy:                  74.35%
Balanced Accuracy:         74.29%
ROC AUC:                   0.8305
Brier Score:               0.1678
Log Loss:                  0.4997
High-confidence coverage:  57.29%
High-confidence accuracy:  85.42%
```

The performance remained close to the previous grouped and cross-matchup experiments.

This supports generalization within the current simulator and bot-profile family.

It does not prove equivalent performance against human players or every possible backend gameplay condition.

---

## Candidate model artifact

The selected model is persisted as a versioned runtime artifact.

Current candidate:

```text
Model:
RandomForestClassifier

Artifact version:
1.0

Training rows:
203,167 first-decision states

Features:
21

hand_strength included:
No
```

Generated artifact:

```text
python-bot-service/
└── ml-artifacts/
    └── candidate-v1/
        ├── truco-hand-win-random-forest.joblib
        └── truco-hand-win-random-forest.metadata.json
```

The generated artifacts are intentionally ignored by Git.

The model metadata stores information required to identify and reproduce the candidate configuration.

---

## Runtime inference

A dedicated runtime inference contract was added so the candidate can evaluate one live state without requiring:

- a full CSV dataset;
- training-only columns;
- target labels;
- simulation identifiers.

The runtime predictor receives the visible state and produces:

```text
winProbability
predictedHandWin
artifactVersion
modelType
```

The runtime input includes information such as:

- player hand;
- vira rank;
- score difference;
- points required to win;
- current and pending bet values;
- bet state;
- special state.

The same raw-card feature derivation used by the model pipeline is reused during inference.

---

## Shadow mode

Before allowing the model to affect gameplay, a shadow prediction boundary was introduced.

The flow became:

```text
Live decision state
        |
        +-------------------+
        |                   |
        v                   v
Heuristic strategy     ML prediction
        |                   |
        v                   v
Executed decision      Observation only
        |                   |
        +---------+---------+
                  |
                  v
              Telemetry
```

In shadow mode:

- the heuristic bot remains authoritative;
- the ML model predicts in parallel;
- predictions are deduplicated in memory;
- prediction failures do not affect gameplay;
- successful observations can be persisted as JSONL telemetry.

This allowed the runtime integration to be tested before giving the model any control over decisions.

---

## Shadow telemetry

Successful shadow predictions can be persisted to:

```text
ml-artifacts/
└── shadow-telemetry/
    └── shadow-observations.jsonl
```

Each observation records information including:

- visible runtime state;
- heuristic decision;
- predicted win probability;
- predicted class;
- model type;
- artifact version;
- observation fingerprint.

The generated telemetry remains outside Git.

A future production evaluation can improve this further by linking stable backend hand identifiers to actual hand outcomes.

---

## ML-assisted strategy

After validating the shadow integration, an optional ML-assisted strategy was introduced.

The strategy is disabled by default.

The model does not replace the entire bot.

It acts only as a conservative additional signal for eligible betting decisions.

The ML-assisted engine may influence actions including:

- request truco;
- accept a bet;
- decline a bet;
- raise to six;
- raise to nine;
- raise to twelve.

The existing heuristic engine remains responsible for:

- card selection;
- later-round decisions;
- unsupported states;
- special hand logic;
- score-sensitive safeguards;
- fallback behavior.

The current candidate is restricted to eligible 1v1 first-decision states.

If model loading or prediction fails, the existing heuristic decision is returned.

---

## Feature flags and fallback

ML-assisted behavior is controlled through configuration.

Default behavior:

```text
ML-assisted disabled
Heuristic strategy active
```

When enabled:

```text
Load candidate model
        |
        +-- success --> ML-assisted strategy
        |
        +-- failure --> heuristic strategy
```

This keeps the experimental intelligence isolated from the stable default bot behavior.

---

## Direct A/B validation

The final experiment compared:

```text
ML-assisted bot
vs
original heuristic bot
```

Both sides used:

- the same strategy profile;
- the same card-selection heuristics;
- alternating P1 and P2 positions.

The experimental difference was limited to eligible ML-assisted betting overrides.

The reduced final A/B run executed:

```text
600 matches
```

Results:

```text
ML-assisted wins: 317
Heuristic wins:   283

ML-assisted win rate: 52.83%
Heuristic win rate:   47.17%

ML overrides: 641
```

The 95% confidence interval for the ML-assisted win rate was:

```text
48.84% – 56.83%
```

Final verdict:

```text
Promising, but statistically inconclusive.
```

The observed result provides an initial positive signal, but the sample is not sufficient to claim with 95% confidence that the ML-assisted strategy is superior.

The feature therefore remains experimental and disabled by default.

---

## Visual runtime validation

A manual visual simulation was also executed to confirm that the trained artifact was actually being called during live simulated matches.

The test produced:

```text
49 model inference calls
8 real ML decision overrides
6 complete matches
```

Observed probabilities varied significantly between states, confirming that predictions were generated from the current game context.

The overrides observed during this smoke test were real actions returned by the ML-assisted strategy and executed by the simulator.

---

## Main implementation areas

### Data and analytics

```text
python-bot-service/data/
```

Includes:

- dataset preparation;
- validation;
- benchmark models;
- repeated experiments;
- stage evaluation;
- ablation studies;
- raw card features;
- primary feature pipeline;
- Random Forest benchmark and tuning;
- generalization experiments;
- model artifact handling;
- runtime inference;
- final holdout evaluation;
- ML-assisted A/B validation.

### Runtime ML integration

```text
python-bot-service/app/strategy/
```

Includes:

- shadow prediction boundary;
- shadow runtime;
- shadow telemetry;
- ML-assisted strategy engine.

### Simulation integration

```text
python-bot-service/simulation/
```

The headless simulator now supports injecting separate strategy engines for each player.

This allows direct strategy-versus-strategy experiments while preserving the previous default behavior when no custom engine is provided.

---

## Tests and validation

The final Python suite completed with:

```text
193 passed
```

The known warnings come from the current joblib / NumPy deserialization path and do not fail the suite.

Additional validation performed throughout the phase included:

- Python compile checks;
- Git diff checks;
- runtime model loading;
- real HTTP shadow-mode smoke tests;
- shadow deduplication verification;
- fresh-seed holdout evaluation;
- direct strategy A/B simulation.

---

## Technical decisions

### Predict hand outcome instead of copying heuristic actions

The target was chosen to represent an outcome rather than reproduce deterministic strategy behavior.

### Keep grouped splits by match

This prevents decisions from the same simulated match from leaking across train and test partitions.

### Remove `hand_strength` from the final primary model

The heuristic value was useful for analysis but made the candidate overly dependent on manually encoded bot knowledge.

### Restrict runtime use to supported states

The final model was trained primarily on first-decision states and should not be treated as a universal evaluator for every point in a match.

### Introduce shadow mode before decision control

The candidate first observed decisions without affecting them.

### Preserve deterministic fallback

The heuristic strategy remains the safe default whenever ML is disabled, unavailable or outside its supported domain.

### Treat the A/B result honestly

A 52.83% observed win rate is a positive signal, but the current confidence interval still includes 50%.

The project therefore records the experiment as promising but inconclusive instead of claiming that the ML bot is definitively better.

---

## Known limitations

### Simulator domain

The model was trained and validated using the project's own simulator and existing bot strategy profiles.

Performance against real human behavior can differ.

### First-decision scope

The candidate is intentionally limited to initial hand states.

A future model could be trained specifically for later rounds and changing information states.

### 2v2 runtime perspective

The current production-safe ML-assisted scope remains 1v1.

Team and seat perspective should be explicitly modeled before enabling the same candidate for arbitrary 2v2 states.

### Model deployment

The generated model artifact is not committed to Git.

A production deployment still needs a defined artifact distribution strategy such as:

- build-time artifact inclusion;
- object storage;
- release artifact;
- model registry.

### A/B sample size

The current 600-match direct comparison is useful as an initial experiment but is not large enough to establish statistical superiority at the selected confidence level.

---

## Result

Phase 28 completed the first full Machine Learning lifecycle inside Truco Paulista:

```text
Simulation
    ↓
Telemetry
    ↓
Dataset
    ↓
Data validation
    ↓
Feature engineering
    ↓
Model benchmarks
    ↓
Ablation analysis
    ↓
Random Forest candidate
    ↓
Generalization validation
    ↓
Versioned model artifact
    ↓
Runtime inference
    ↓
Shadow mode
    ↓
Shadow telemetry
    ↓
ML-assisted decisions
    ↓
Direct A/B validation
```

The project now contains both:

```text
Deterministic bot intelligence
```

and:

```text
Experimental data-driven intelligence
```

without making the second a hard dependency of the first.

---

## Next step

The Machine Learning pipeline is considered complete for this phase.

The next phase moves away from model development and focuses on making the intelligence visible inside the product.

Planned direction:

```text
Phase 29 — AI Lab Visual Experience
```

The new phase will expose the work through a dedicated visual experience containing elements such as:

- model metrics;
- dataset scale;
- experiment history;
- model comparison;
- feature importance;
- shadow-mode explanation;
- A/B results;
- interactive prediction demonstration.

This keeps the ML engineering work and the frontend productization work as separate project milestones.
