<div align="center">

<br/>

# ♠ Truco Paulista

**Backend autoritativo para Truco Paulista multiplayer**

**NestJS · TypeScript strict · DDD · Clean Architecture**

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Jest](https://img.shields.io/badge/116_testes-passing-2ea44f?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)

<br/>

[🌐 Produção](https://truco-paulista-backend.onrender.com) · [❤️ Liveness](https://truco-paulista-backend.onrender.com/health/live) · [🗄️ Readiness](https://truco-paulista-backend.onrender.com/health/ready)

<br/>

</div>

---

## Sobre o projeto

Estudo prático e incremental de engenharia de software com objetivos técnicos claros: aplicar DDD em um domínio com regras não triviais, usar TypeScript como ferramenta de design e construir um backend autoritativo onde o servidor é dono da verdade.

O Truco Paulista foi escolhido por ser intencionalmente desafiador — regras de mão, hierarquia de cartas, lógica de equipes e estados de partida tornam a modelagem genuinamente difícil.

---

## Fases

| # | Descrição | |
|---|-----------|--|
| 0 | Setup profissional — TS strict, ESLint, Jest, scripts | ✅ |
| 1 | Domínio puro — entidades, value objects, domain services | ✅ |
| 2 | Camada de Aplicação — Use Cases, DTOs, Ports | ✅ |
| 3 | Transporte WebSocket — Socket.IO + Gateway | ✅ |
| 4 | Persistência real — PostgreSQL + Prisma | ✅ |
| 5 | Multiplayer 2v2 + ranking | ✅ |
| 6 | Observabilidade — health, readiness, logs estruturados | ✅ |
| 7 | Containerização — Docker multi-stage + Compose | ✅ |
| 8 | Deploy em produção — Render + Postgres + migrations | ✅ |
| 9 | Autenticação real — Google/GitHub OAuth + WebSocket autenticado | ✅ |
| 10 | Frontend jogável — React + Vite + lobby autenticado | ✅ |
| 11 | Modo 1v1 + bots preenchendo assentos + estado público/privado | ✅ |
| 12 | Arquitetura de bots — boundary, profiles, adapter, input transport-agnostic | ✅ |
| 13 | Matchmaking — fila pública, pairing, timeout, fallback, reconexão | ✅ |
| 14 | Histórico de partidas + replay | 🔜 |
| 15 | Serviço de IA em Python | 🔜 |
| 16 | Hardening — segurança + performance | 🔜 |

---

## Arquitetura

### Domain-first

O Domínio tem **zero dependência** de frameworks, bancos, transporte ou autenticação. Isso não é aspiracional — é uma invariante estrutural.

```
Gateway → Application → Domain
Infrastructure implementa Application Ports
```

O Domínio nunca conhece: `NestJS` · `Prisma` · `Socket.IO` · `OAuth` · logging · validação de transporte

### Camadas

| Camada | Responsabilidade |
|--------|-----------------|
| **Domain** | Regras puras do Truco — entidades, value objects, invariantes |
| **Application** | Use Cases, DTOs, orquestração, ports, mappers |
| **Infrastructure** | Persistência, Prisma, adaptadores de auth e bots |
| **Gateway** | WebSocket, estado efêmero de sala/turno, matchmaking |
| **Auth** | Estratégias OAuth, emissão de auth token |
| **Frontend** | Sessão no browser, UI autenticada, coordenação de socket |
| **Health** | Lifecycle de startup, endpoints operacionais, logging estruturado |

### Testabilidade

Domínio, Gateway, RoomManager, boundary do bot e matchmaking são testáveis sem servidor, banco ou mocks de framework.

> ✅ **20 suites · 116 testes · 0 falhas**

---

## O que funciona hoje

<details>
<summary><strong>Multiplayer e ranking</strong></summary>
<br/>

- Multiplayer real via WebSocket — 2v2 e 1v1
- 4 assentos por sala: `T1A` · `T2A` · `T1B` · `T2B`
- Sincronização de estado `ready` — partida inicia apenas quando todos estão prontos
- Reconexão por identidade de sessão preservando o mesmo assento
- Ranking persistido com ELO simplificado: `+25` vitória · `-25` derrota · mínimo `100`

</details>

<details>
<summary><strong>Matchmaking público</strong></summary>
<br/>

- Fila pública por modo: 1v1 e 2v2
- Pairing por rating
- Timeout determinístico de fila
- Fallback pós-timeout: continuar na fila · iniciar com bot · recusar
- Transição automática de fila para partida
- Snapshot consolidado de observabilidade

</details>

<details>
<summary><strong>Bots</strong></summary>
<br/>

- Preenchimento automático de assentos
- Perfis determinísticos: `balanced` · `aggressive` · `cautious`
- `BotDecisionPort` na Application — independente de tecnologia
- `HeuristicBotAdapter` como baseline local
- `BotDecisionContext` transport-agnostic
- Wiring preparado para adapter Python futuro

</details>

<details>
<summary><strong>Autenticação</strong></summary>
<br/>

- Google OAuth + GitHub OAuth reais
- Provedores normalizados em identidade interna (`User`)
- Auth token emitido pela aplicação após callback
- Handshake WebSocket autenticado via `authToken`
- `PlayerProfile` vinculado ao `userId`
- Múltiplos usuários autenticados sem colisão de assento

</details>

<details>
<summary><strong>Frontend</strong></summary>
<br/>

- React + Vite + TypeScript + Tailwind CSS em `frontend-app/`
- Callback OAuth integrado ao frontend
- Persistência de sessão no browser: `authToken` · `backendUrl` · identidade do usuário
- Lobby autenticado + página de partida com hidratação direta via socket
- Emite ações reais: `get-state` · `start-hand` · `play-card`
- Não-autoritativo — o backend é dono da verdade

</details>

<details>
<summary><strong>Observabilidade</strong></summary>
<br/>

- `GET /health/live` · `GET /health/ready`
- Logs estruturados de bootstrap, banco e gateway
- Classificação de erros: `validation_error` · `transport_error` · `domain_error` · `unexpected_error`
- Snapshot observável do matchmaking exposto no gateway

</details>

---

## Stack

| | |
|-|---|
| **Runtime** | Node.js 20 |
| **Linguagem** | TypeScript strict |
| **Framework** | NestJS |
| **Transporte** | Socket.IO |
| **Persistência** | PostgreSQL 16 + Prisma ORM |
| **Autenticação** | Google OAuth · GitHub OAuth · auth token próprio |
| **Frontend** | React + Vite + TypeScript + Tailwind CSS |
| **Bots** | Adapter heurístico local — boundary preparado para Python |
| **Testes** | Jest + ts-jest |
| **Deploy** | Render + Render Postgres + Docker multi-stage |

---

## Rodando localmente

**Pré-requisitos:** Node.js 20+ · Docker + Docker Compose

```bash
# 1. Instalar e configurar
npm install
cp .env.example .env

# 2. Banco de dados
docker compose up -d postgres
npx prisma migrate dev

# 3. Iniciar
npm run start:dev
```

```bash
# Frontend
cd frontend-app
npm install
npm run dev
# → http://localhost:5173
```

```bash
# Validar
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

**Completamente containerizado:**

```bash
docker compose up -d --build
docker compose logs --tail=100 backend
```

---

## Autenticação

```
GET /auth/google           →  Inicia login Google
GET /auth/google/callback  →  Callback Google
GET /auth/github           →  Inicia login GitHub
GET /auth/github/callback  →  Callback GitHub
```

O backend autentica via OAuth, emite um token próprio e redireciona o browser para persistir a sessão no frontend.

```json
{
  "user": {
    "id": "...",
    "provider": "google | github",
    "email": "...",
    "displayName": "...",
    "avatarUrl": "..."
  },
  "authToken": "...",
  "expiresIn": "7d"
}
```

---

## API

### Endpoints HTTP

| Rota | Método | Descrição |
|------|--------|-----------|
| `/health/live` | `GET` | Liveness — processo no ar |
| `/health/ready` | `GET` | Readiness — banco pronto |
| `/auth/google` | `GET` | Login Google OAuth |
| `/auth/github` | `GET` | Login GitHub OAuth |

### Eventos WebSocket

**Client → Server**

| Evento | Descrição |
|--------|-----------|
| `create-match` | Criar sala |
| `join-match` | Entrar em sala existente |
| `join-queue` | Entrar na fila pública |
| `leave-queue` | Sair da fila |
| `continue-queue` | Voltar à fila após timeout |
| `start-bot-match` | Iniciar partida com bot |
| `decline-fallback` | Recusar fallback pendente |
| `set-ready` | Sinalizar pronto |
| `start-hand` | Iniciar mão |
| `play-card` | Jogar carta |
| `get-state` | Estado atual |
| `get-ranking` | Ranking |
| `get-matchmaking-snapshot` | Snapshot do matchmaking |

**Server → Client**

| Evento | Descrição |
|--------|-----------|
| `player-assigned` | Assento atribuído |
| `queue-joined` | Entrada na fila confirmada |
| `queue-timeout` | Timeout com opções de fallback |
| `queue-resumed` | Retorno à fila confirmado |
| `match-found` | Partida encontrada |
| `bot-match-created` | Partida com bot criada |
| `fallback-declined` | Fallback recusado |
| `room-state` | Estado da sala |
| `match-state` | Estado da partida |
| `match-state:private` | Mão privada do jogador |
| `hand-started` | Mão iniciada |
| `card-played` | Carta jogada |
| `rating-updated` | Ranking atualizado |
| `matchmaking-snapshot` | Snapshot do matchmaking |
| `error` | Erro classificado |

---

## Estrutura do projeto

```
truco-paulista/
├── frontend-app/              # React + Vite + TypeScript + Tailwind
│   └── src/
│       ├── app/
│       ├── features/
│       ├── pages/
│       └── services/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── auth/                  # OAuth, auth token service
│   ├── domain/                # Regras puras — sem frameworks
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── exceptions/
│   ├── application/           # Use Cases, DTOs, Ports, Mappers
│   │   ├── use-cases/
│   │   ├── dtos/
│   │   ├── ports/
│   │   └── mappers/
│   ├── infrastructure/
│   │   ├── bots/              # HeuristicBotAdapter
│   │   └── persistence/       # Prisma + in-memory
│   ├── gateway/               # WebSocket + matchmaking + multiplayer
│   │   ├── game.gateway.ts
│   │   ├── matchmaking/
│   │   └── multiplayer/
│   ├── health/
│   ├── modules/
│   └── main.ts
└── test/
    └── unit/
        ├── domain/
        ├── application/
        ├── gateway/
        └── infrastructure/
```

---

## Schema do banco

```prisma
model MatchSnapshot {
  id          String   @id @default(cuid())
  matchId     String   @unique
  pointsToWin Int
  state       String
  score       Json
  data        Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model User {
  id             String   @id @default(cuid())
  provider       String
  providerUserId String
  email          String?
  displayName    String?
  avatarUrl      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  playerProfile  PlayerProfile?
  @@unique([provider, providerUserId])
}

model PlayerProfile {
  id            String   @id @default(cuid())
  userId        String   @unique
  rating        Int      @default(1000)
  wins          Int      @default(0)
  losses        Int      @default(0)
  matchesPlayed Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id])
}
```

---

## Decisões arquiteturais

Cada decisão tem uma razão documentada — não apenas uma preferência.

| ID | Decisão |
|----|---------|
| D1 | `PlayerId` no Domínio é `'P1'`, `'P2'` — identidade de domínio, não de transporte |
| D2 | `SeatId` e `TeamId` vivem no Gateway, não como Value Objects do Domínio |
| D3 | Ordem de turno no Gateway é adaptação transitória de transporte |
| D4 | Ranking é Bounded Context separado — `Match` nunca atualiza `PlayerProfile` |
| D5 | `toSnapshot()` / `fromSnapshot()` são extensões de serialização, não alteram invariantes |
| D6 | Health vive fora do Domínio, em `src/health/*` |
| D7 | Readiness do banco pertence à Infraestrutura via `PrismaService` |
| D8 | `DomainError` deve permanecer distinguível de falhas técnicas |
| D9 | `User` é boundary de identidade da Infraestrutura — nunca vaza para o Domínio |
| D10 | OAuth providers são adaptadores; a aplicação os normaliza em identidade interna |
| D11 | A aplicação emite seu próprio auth token para o handshake WebSocket |
| D12 | Migrations no Render Free rodam no startup do container como workaround operacional |
| D13 | Bots pertencem ao backend boundary, não ao frontend |
| D14 | `BotDecisionPort` vive na Application — independente de tecnologia |
| D15 | `BotDecisionContext` contém apenas input de decisão, sem detalhes de transporte |
| D16 | Frontend é não-autoritativo — o backend é dono da verdade da partida |
| D17 | Matchmaking vive fora do Domain, como orchestration no Gateway/Application boundary |
| D18 | Reconexão recupera o mesmo seat por `playerToken + matchId`, não o próximo livre |
| D19 | Fallback pós-timeout é estado operacional de matchmaking, não regra do jogo |
| D20 | Observabilidade do matchmaking expõe snapshots, não estruturas internas mutáveis |

---

## Dívida técnica

| ID | Descrição | Status |
|----|-----------|--------|
| DT-4 | Ordem de turno ainda no Gateway como regra transitória | ⚠️ Aceita |
| DT-7 | Camada de métricas formal não implementada | 🔜 Backlog |
| DT-8 | Sem correlation ID para rastreamento a nível de socket | 🔜 Backlog |
| DT-13 | Build Docker depende de `legacy-peer-deps` | ⚠️ Aceita |
| DT-14 | Migrations rodam no startup do container no Render Free | ⚠️ Aceita |
| DT-15 | Compatibilidade com identidade de socket legado deve ser removida após migração do frontend | ⚠️ Aceita |
| DT-22 | `HeuristicBotAdapter` é baseline simples para competição real | ⚠️ Aceita |
| DT-23 | `game.gateway.ts` concentra orquestração de matchmaking — pode merecer extração | ⚠️ Aceita |
| DT-24 | Matchmaking usa estado efêmero em memória — sem persistência durável | 🔜 Backlog |

---

<div align="center">

<br/>

♠ ♥ ♣ ♦

<br/>

</div>