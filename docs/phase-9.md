# Phase 9 — Real Authentication (Google/GitHub OAuth)

> **Status:** ✅ Complete (core scope)
> **Branch:** `feat/phase-9-auth`

---

## Objective

Introduce real authenticated identity into the system without violating the architectural boundaries established in earlier phases.

The goal was not just to "add login." It was to establish a proper **User boundary in Infrastructure**, integrate **real OAuth providers**, issue an **application-owned auth token**, and make the WebSocket multiplayer flow understand authenticated identity — all while keeping the Domain Layer completely untouched.

This phase closes the gap between a multiplayer backend that already works operationally and a backend that can now associate real users with player profiles, ranking, and authenticated game sessions.

---

## What was delivered

### Real user identity boundary

- `User` introduced as an **Infrastructure-level identity**
- `User` remains outside the Domain
- game rules continue to use Domain concepts such as `PlayerId = 'P1' | 'P2'`
- real-world authenticated identity no longer depends on transport-level `playerToken`

### Player profile migration from token identity to user identity

- `PlayerProfile` now belongs to `userId`
- ranking and persistent player statistics are now tied to authenticated application identity
- legacy `playerToken` flow was removed as the primary persistence key
- persisted identity boundary now aligns with the architectural goal of the phase

### Google OAuth integration

- real Google OAuth flow implemented
- `/auth/google` and `/auth/google/callback` added
- authenticated Google users are created or reused in the application database
- provider identity is normalized into internal `User`

### GitHub OAuth integration

- real GitHub OAuth flow implemented
- `/auth/github` and `/auth/github/callback` added
- authenticated GitHub users are created or reused in the application database
- provider identity is normalized into internal `User`

### Application-owned auth token

- OAuth callbacks now issue an **application auth token**
- token payload includes:
  - `sub`
  - `provider`
  - `providerUserId`
- the backend no longer depends on provider callbacks after initial authentication
- the application now owns a transportable authenticated session token for later boundaries such as WebSocket handshake

### Authenticated WebSocket handshake

- WebSocket handshake now accepts `authToken`
- `authToken` is verified through `AuthTokenService`
- authenticated user identity is resolved before game flow starts
- `create-match` and `join-match` now work with authenticated users
- authenticated sessions are normalized internally as:
  - `auth:<userId>`

### Authenticated multiplayer identity flow

- authenticated users now occupy multiplayer seats through resolved `userId`
- distinct authenticated users join the same match without seat collision
- reconnection continues to work through transport-level session identity
- Gateway now treats:
  - `userId` as business identity
  - `playerToken` as technical reconnection/session identity

### Transitional compatibility

- authenticated flow is now the primary path
- transition behavior remains explicit and bounded
- the architecture now clearly separates:
  - provider identity
  - internal user identity
  - transport/session identity

### Test coverage for the phase

Validated successfully with automated tests:

- auth token issuance and verification
- player profile retrieval/creation by `userId`
- ranking retrieval with current output contract
- rating update by `winnerUserIds` / `loserUserIds`
- RoomManager behavior aligned with authenticated identity storage
- full test suite passing:
  - **16 test suites**
  - **55 tests**
  - **0 failures**

---

## Build/runtime issues uncovered and corrected

Phase 9 exposed real integration issues that were corrected during implementation:

- initial migration from `playerToken` to `userId` broke repository/test contracts
- existing local database state blocked migration because `userId` became required on `PlayerProfile`
- local development database had to be reset and rebuilt against the new schema
- Prisma client generation needed to be aligned with the generated path used by the project
- `jsonwebtoken` typing under strict TypeScript required explicit handling for `expiresIn`
- `passport-github2` typings required adjustment because its callback/profile types differ from Google
- WebSocket client initially sent JWT through the legacy handshake field:
  - `auth.token`
- handshake had to be aligned to:
  - `auth.authToken`
- legacy test doubles and old use case tests still referenced:
  - `playerToken`
  - `winnerTokens`
  - `loserTokens`
- automated tests had to be migrated to the new `userId`-based contracts

---

## Architectural decisions

### D1 — `User` belongs to Infrastructure, not Domain

Authentication providers, OAuth identities, and real user records are not game rules.

Reason: the Domain must continue modeling Truco, not external identity providers.

Result: Domain remained untouched during the entire phase.

### D2 — `PlayerProfile` persists business identity through `userId`

Persistent ranking/statistics now belong to an internal user identity, not to a transport token.

Reason: transport tokens are volatile and belong to session boundaries, not durable identity.

Result: ranking and profile persistence now have a proper ownership boundary.

### D3 — OAuth providers are adapters, not core concepts

Google and GitHub exist only as authentication adapters.

Reason: providers can change, but the application must keep a stable internal identity model.

Result: provider-specific concerns remain in the auth boundary.

### D4 — The application must issue its own auth token

Provider callback success is not enough to support later application boundaries such as WebSocket handshake.

Reason: the system needs an internal session token independent from provider redirects.

Result: the backend now owns an auth token contract for authenticated application sessions.

### D5 — WebSocket multiplayer must resolve authenticated identity before entering game flow

Socket connection cannot treat transport tokens as business identity once real auth exists.

Reason: game flow, profile lookup, and ranking updates need real internal user identity.

Result: Gateway now resolves `userId` through `authToken` before calling the Application layer.

### D6 — `playerToken` remains technical even after authentication

Transport/session identity still exists, but no longer defines durable persistence identity.

Reason: reconnection needs a stable technical key, but persistence/ranking should not depend on it.

Result: session identity and business identity are now explicitly separated.

### D7 — Transitional compatibility is acceptable when it preserves architectural direction

Phase 9 required coexistence between the new authenticated path and older token-based multiplayer assumptions during implementation and tests.

Reason: replacing identity boundaries in one step would make integration debugging harder.

Result: compatibility remained explicit and temporary, without polluting Domain concepts.

### D8 — Test migration is part of architectural completion

Refactoring persistent identity from `playerToken` to `userId` is incomplete if tests still validate obsolete contracts.

Reason: the test suite is part of the system’s source of truth.

Result: tests were updated to validate the new identity model and full suite returned to green.

---

## Authentication validation

### Google OAuth validation

Validated successfully in local runtime:

- `/auth/google` redirects correctly to Google
- Google login completes successfully
- callback reaches the backend
- authenticated Google user is persisted or reused
- application auth token is returned successfully

### GitHub OAuth validation

Validated successfully in local runtime:

- `/auth/github` redirects correctly to GitHub
- GitHub login completes successfully
- callback reaches the backend
- authenticated GitHub user is persisted or reused
- application auth token is returned successfully

### Auth token validation

Validated successfully:

- auth token can be issued after OAuth callback
- auth token can be verified internally
- auth token payload resolves:
  - `sub`
  - `provider`
  - `providerUserId`

### WebSocket authenticated flow validation

Validated successfully:

- authenticated match creation through `authToken`
- authenticated join through a second user
- distinct authenticated users are mapped to distinct seats
- ready-state synchronization continues to work after authenticated join
- room state remains consistent with authenticated identity

---

## Validation commands

### Local auth/runtime validation

```bash
npm run build
npm run start:dev
OAuth callback validation
GET /auth/google
GET /auth/github

Expected behavior:

provider login screen opens
callback returns authenticated user payload
callback returns:
user
authToken
expiresIn
Health validation
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
WebSocket authenticated flow validation

Create match with authenticated token:

npm run ws:client -- create <AUTH_TOKEN> 1

Join match with another authenticated token:

npm run ws:client -- join <MATCH_ID> <ANOTHER_AUTH_TOKEN>

Expected behavior:

match creator receives T1A
second authenticated user receives T2A
room state shows both players
ready updates propagate correctly
Automated validation
npm run test
npm run lint
npm run build

Expected final test state:

16 test suites passed
55 tests passed
0 failures
Files added / modified
src/
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── auth-token.service.ts
│   ├── guards/
│   │   ├── dev-auth.guard.ts
│   │   ├── github-auth.guard.ts
│   │   └── google-auth.guard.ts
│   └── strategies/
│       ├── dev-auth.strategy.ts
│       ├── github-auth.strategy.ts
│       └── google-auth.strategy.ts
├── application/
│   ├── ports/
│   │   └── user.repository.ts
│   └── use-cases/
│       ├── get-or-create-user.use-case.ts
│       └── get-or-create-player-profile-for-user.use-case.ts
├── infrastructure/
│   └── persistence/
│       ├── prisma-user.repository.ts
│       ├── prisma-player-profile.repository.ts
│       └── prisma/
│           └── prisma.service.ts
├── gateway/
│   ├── game.gateway.ts
│   └── multiplayer/
│       └── room-manager.ts
├── modules/
│   ├── auth.module.ts
│   └── game.module.ts
└── scripts/
    └── ws-client.ts

prisma/
├── schema.prisma
└── migrations/

test/
└── unit/
    ├── auth/
    │   └── auth-token.service.spec.ts
    ├── application/
    │   ├── get-or-create-player-profile.use-case.spec.ts
    │   ├── get-ranking.use-case.spec.ts
    │   └── update-rating.use-case.spec.ts
    └── gateway/
        └── room-manager.spec.ts
Technical debt
Still open
ID	Description	Impact
DT-4	Turn order still lives in the Gateway as a transitional rule	Low for now; revisit later
DT-7	Metrics are still not implemented as a formal instrumentation layer	Medium
DT-8	No correlation ID strategy yet for socket-level tracing	Medium
DT-13	Docker build still depends on a transitional legacy-peer-deps workaround due to old Nest ecosystem dependency compatibility	Medium
DT-14	On Render Free, Prisma migrations run inside container startup instead of an isolated pre-deploy/job flow	Medium
DT-15	Legacy token compatibility remains transitional and should eventually be removed in favor of authenticated-only session entry	Medium
DT-16	Frontend session consumption of OAuth callback auth token is not implemented yet because the playable frontend belongs to Phase 10	Medium
Success criteria — final assessment
Criterion	Status
User introduced as Infrastructure identity only	✅
PlayerProfile migrated to userId ownership	✅
Google OAuth flow implemented and validated	✅
GitHub OAuth flow implemented and validated	✅
Application-owned auth token issued successfully	✅
Gateway accepts authenticated handshake	✅
Authenticated users create/join matches successfully	✅
Distinct authenticated users occupy distinct seats	✅
Domain remains free of auth/provider concerns	✅
Full automated test suite passing	✅
Final result

Phase 9 successfully introduced real authentication into the system without violating the project’s architectural rules.

The backend now supports:

real Google/GitHub OAuth login
persisted internal user identity
player profiles owned by authenticated users
application-issued auth token
authenticated WebSocket multiplayer entry
user-aware seat assignment and reconnection flow

The project is now ready to evolve into a real playable frontend in Phase 10 with a stable authenticated backend boundary already in place.