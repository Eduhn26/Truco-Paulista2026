<div align="center">

<br/>

```
♠  ♥  ♣  ♦
```

# Truco Paulista — Backend

**Backend autoritativo para Truco Paulista multiplayer, construído com NestJS, TypeScript strict, DDD e Clean Architecture.**

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?style=flat-square&logo=socket.io)](https://socket.io/)
[![Jest](https://img.shields.io/badge/Jest-55_testes-C21325?style=flat-square&logo=jest)](https://jestjs.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)

<br/>

[🌐 Produção](https://truco-paulista-backend.onrender.com) · [❤️ Liveness](https://truco-paulista-backend.onrender.com/health/live) · [🗄️ Readiness](https://truco-paulista-backend.onrender.com/health/ready)

<br/>

</div>

---

## Sobre o Projeto

Este projeto é um estudo prático e incremental com objetivos técnicos claros:

- Aplicar **Domain-Driven Design** em um domínio de negócio real e com regras não triviais
- Usar **TypeScript como ferramenta de design**, não apenas para checagem de tipos
- Construir um **backend real-time autoritativo** — o servidor é dono da verdade
- Garantir que mudanças de infraestrutura **nunca afetem o Domínio**
- Produzir código defensável em entrevistas técnicas e portfólio

O domínio escolhido (Truco Paulista) é intencionalmente complexo: regras de mão, hierarquia de cartas, lógica de equipes e estados de partida tornam o exercício de modelagem genuinamente desafiador.

---

## Stack

| Aspecto | Escolha |
|---|---|
| Runtime | Node.js 20 |
| Linguagem | TypeScript strict — todos os flags principais habilitados |
| Framework | NestJS |
| Transporte | WebSocket via Socket.IO |
| Persistência | PostgreSQL 16 + Prisma ORM |
| Autenticação | Google OAuth + GitHub OAuth + auth token próprio |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Bots (atual) | Adapter heurístico local |
| Bots (futuro) | Serviço Python / FastAPI |
| Testes | Jest + ts-jest |
| Containerização | Docker + Docker Compose |
| Hospedagem | Render + Render Postgres |
| Observabilidade | Health/readiness + logging estruturado |

---

## Arquitetura

### Princípio domain-first

O Domínio tem **zero dependência** de frameworks, bancos de dados, camadas de transporte, logging, health checks, provedores de autenticação ou qualquer preocupação operacional. Isso não é aspiracional — é uma invariante estrutural do projeto.

```
Gateway → Application → Domain
Infrastructure implementa Application Ports
Domain sem dependências externas
```

O Domínio nunca conhece: NestJS, Prisma, Socket.IO, OAuth providers, validação de transporte ou logging.

### Camadas e responsabilidades

| Camada | Responsabilidade |
|---|---|
| **Domain** | Regras puras do Truco — entidades, value objects, domain services, invariantes |
| **Application** | Use Cases, DTOs, orquestração, ports, mappers |
| **Infrastructure** | Persistência, Prisma, readiness do banco, adaptadores de auth e bots |
| **Gateway** | Transporte WebSocket, estado efêmero de sala/presença/turno, coordenação multiplayer |
| **Auth** | Entrypoints HTTP de autenticação, estratégias OAuth, emissão de auth token |
| **Frontend** | Fluxo de sessão no browser, UI autenticada, coordenação de socket, estado visual |
| **Bootstrap / Health** | Lifecycle de startup, endpoints de health, logging operacional estruturado |

### Testabilidade

As regras do jogo e o boundary do bot são testáveis sem servidor em execução, banco de dados real, infraestrutura de transporte ou mocks complexos de framework.

---

## Status das Fases

| Fase | Descrição | Status |
|---|---|---|
| **0** | Setup profissional (TS strict, ESLint, Jest, scripts) | ✅ Completo |
| **1** | Domínio puro (DDD — entidades, value objects, domain services) | ✅ Completo |
| **2** | Camada de Aplicação (Use Cases, DTOs, Ports) | ✅ Completo |
| **3** | Transporte WebSocket (Socket.IO + Gateway) | ✅ Completo |
| **4** | Persistência real (PostgreSQL + Prisma) | ✅ Completo |
| **5** | Multiplayer 2v2 real + ranking | ✅ Completo |
| **6** | Observabilidade (health, readiness, logs estruturados, classificação de erros) | ✅ Completo |
| **7** | Containerização (Docker multi-stage + Compose) | ✅ Completo |
| **8** | Deploy em produção (Render + Postgres gerenciado + migrations automáticas) | ✅ Completo |
| **9** | Autenticação real (Google/GitHub OAuth + auth token + WebSocket autenticado) | ✅ Completo |
| **10** | Frontend jogável (React + Vite + fluxo OAuth no browser + mesa inicial jogável) | ✅ Completo |
| **11** | Modo 1v1 + bot preenchendo assentos + estado público/privado | ✅ Completo |
| **12** | Preparação arquitetural para bots (boundary, profiles, adapter baseline, input transport-agnostic) | ✅ Completo |
| **13** | Matchmaking público | 🔜 Planejado |
| **14** | Histórico de partidas + replay | 🔜 Planejado |
| **15** | Serviço de IA em Python | 🔜 Planejado |
| **16** | Hardening (segurança + performance) | 🔜 Planejado |

---

## O que Funciona Hoje

### Frontend jogável

- Aplicação frontend real em `frontend-app/` — React + Vite + TypeScript + Tailwind CSS
- Callback OAuth integrado de volta ao frontend
- Persistência de sessão no browser: `authToken`, `backendUrl`, `expiresIn`, identidade do usuário autenticado
- Página de lobby autenticado e página de partida ao vivo com hidratação direta via socket
- Frontend emite ações reais de partida: `get-state`, `start-hand`, `play-card`
- Frontend permanece não-autoritativo — o backend é dono da verdade da partida

### Multiplayer e ranking

- Multiplayer real via WebSocket (Socket.IO) com suporte a 2v2 e 1v1
- 4 assentos por sala: `T1A`, `T2A`, `T1B`, `T2B` com ordem de turno definida
- Sincronização de estado *ready* — a partida só começa quando todos os jogadores estão prontos
- Reconexão por identidade de sessão, preservando o mesmo assento
- Ranking persistido com ELO simplificado: `+25` por vitória · `-25` por derrota · mínimo `100`

### Bots e arquitetura de decisão

- Preenchimento automático de assentos por bot
- Perfis determinísticos por seat: `balanced`, `aggressive`, `cautious`
- `BotDecisionPort` definido como boundary de Application — independente de tecnologia
- `HeuristicBotAdapter` como baseline local oficial
- `BotDecisionContext` reduzido para input transport-agnostic
- Gateway responsável por orquestração; adapter decide apenas a ação
- Wiring preparado para múltiplos adapters futuros, incluindo serviço Python

### Autenticação

- Fluxo real de Google OAuth e GitHub OAuth
- Persistência interna de usuário (`User`) — provedores são adaptadores normalizados
- Auth token emitido pela aplicação após o callback OAuth
- Handshake WebSocket autenticado via `authToken`
- `PlayerProfile` vinculado ao `userId`
- Usuários autenticados distintos podem entrar na mesma partida sem colisão de assento

### Perfil do jogador

- Persistência de `wins`, `losses`, `rating`, `matchesPlayed`

### Observabilidade

```
GET /health/live   → Processo está vivo
GET /health/ready  → Banco de dados está pronto
```

- Logs estruturados de bootstrap: `application_starting`, `application_started`, `application_start_failed`
- Logs estruturados de banco: tentativas de conexão, retries, falhas de readiness
- Logs estruturados de gateway: `create-match`, `join-match`, `set-ready`, `start-hand`, `play-card`, `get-state`, `get-ranking`
- Classificação observável de erros: `validation_error`, `transport_error`, `domain_error`, `unexpected_error`

---

## Rodando Localmente

**Pré-requisitos:** Node.js 20+, Docker + Docker Compose.

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Subir o banco
docker compose up -d postgres

# Rodar migrations
npx prisma migrate dev

# Iniciar em modo desenvolvimento
npm run start:dev
```

**Frontend:**

```bash
cd frontend-app
npm install
npm run dev
# http://localhost:5173
```

**Completamente containerizado:**

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate
docker compose logs --tail=100 backend
```

**Validar health endpoints:**

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

---

## Autenticação

O backend autentica o usuário via OAuth, emite um token interno de aplicação e redireciona para o frontend para persistência de sessão no browser.

```
GET /auth/google
GET /auth/google/callback
GET /auth/github
GET /auth/github/callback
```

**Payload do callback:**

```json
{
  "user": {
    "id": "...",
    "provider": "google | github",
    "providerUserId": "...",
    "email": "...",
    "displayName": "...",
    "avatarUrl": "..."
  },
  "authToken": "...",
  "expiresIn": "7d"
}
```

**Fluxo autenticado pelo frontend:**

```
1. Abrir o frontend
2. Autenticar com Google ou GitHub
3. O browser retorna para /auth/callback
4. Sessão armazenada automaticamente
5. Abrir o lobby e conectar via Socket.IO autenticado
```

**Fluxo WebSocket autenticado via CLI:**

```bash
# Criar uma partida com identidade autenticada
npm run ws:client -- create <AUTH_TOKEN> 1

# Entrar em uma partida existente com outra identidade
npm run ws:client -- join <MATCH_ID> <OUTRO_AUTH_TOKEN>
```

---

## Testes

```bash
npm run test        # Rodar todos os testes
npm run test:watch  # Modo watch
npm run lint        # Lint
npm run build       # Build de produção
```

> ✅ **16 suites de teste · 55 testes · 0 falhas**

Suite cobre Domain, Gateway, RoomManager, boundary do bot e adapter heurístico — todos sem infraestrutura real.

---

## API

### Endpoints HTTP

| Rota | Método | Descrição |
|---|---|---|
| `/` | GET | Rota raiz |
| `/health/live` | GET | Liveness check — processo está no ar |
| `/health/ready` | GET | Readiness check — banco de dados pronto |
| `/auth/google` | GET | Inicia login Google OAuth |
| `/auth/google/callback` | GET | Callback Google OAuth |
| `/auth/github` | GET | Inicia login GitHub OAuth |
| `/auth/github/callback` | GET | Callback GitHub OAuth |

### Eventos WebSocket

| Evento | Direção | Descrição |
|---|---|---|
| `create-match` | Client → Server | Criar uma nova sala |
| `join-match` | Client → Server | Entrar em sala existente |
| `set-ready` | Client → Server | Jogador sinaliza pronto |
| `start-hand` | Client → Server | Iniciar a mão |
| `play-card` | Client → Server | Jogar uma carta |
| `get-state` | Client → Server | Requisitar estado atual |
| `get-ranking` | Client → Server | Requisitar ranking |
| `player-assigned` | Server → Client | Confirma assento atribuído |
| `room-state` | Server → Client | Broadcast do estado da sala |
| `match-state` | Server → Client | Broadcast do estado da partida |
| `match-state:private` | Server → Client | Estado privado da mão do jogador |
| `hand-started` | Server → Client | Broadcast de mão iniciada |
| `card-played` | Server → Client | Broadcast de carta jogada |
| `rating-updated` | Server → Client | Ranking atualizado após partida |
| `error` | Server → Client | Erro de validação, transporte, domínio ou inesperado |

---

## Schema do Banco

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

## Estrutura do Projeto

```
backend/
├── frontend-app/              # Frontend jogável (React + Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── auth/                  # Estratégias OAuth, controller, auth token service
│   ├── domain/                # Regras de negócio puras — sem frameworks
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
│   │   ├── bots/
│   │   └── persistence/
│   ├── gateway/               # Transporte WebSocket
│   │   ├── game.gateway.ts
│   │   └── multiplayer/
│   ├── health/                # Liveness / readiness
│   ├── modules/               # Wiring de DI do NestJS
│   ├── scripts/               # simulate-hand.ts, ws-client.ts
│   └── main.ts
└── test/
    └── unit/
        ├── auth/
        ├── domain/
        ├── application/
        ├── gateway/
        └── infrastructure/
```

---

## Decisões Arquiteturais

As decisões abaixo são documentadas explicitamente para tornar o projeto defensável — cada escolha tem uma razão, não apenas uma preferência.

| ID | Decisão |
|---|---|
| D1 | `PlayerId` no Domínio permanece como `'P1'`, `'P2'` — identidade de domínio, não de transporte |
| D2 | `SeatId` e `TeamId` vivem no Gateway, não como Value Objects do Domínio |
| D3 | Ordem de turno no Gateway é uma adaptação transitória de transporte |
| D4 | Ranking é um Bounded Context separado — Match nunca atualiza `PlayerProfile` diretamente |
| D5 | `toSnapshot()` / `fromSnapshot()` são extensões de serialização e não alteram invariantes do Domínio |
| D6 | Health permanece fora do Domínio e vive em `src/health/*` |
| D7 | Readiness do banco pertence à Infraestrutura via `PrismaService` |
| D8 | Logging estruturado usa Nest Logger + payloads estruturados |
| D9 | Gateway é o boundary correto para observabilidade do multiplayer |
| D10 | `DomainError` deve permanecer distinguível de falhas técnicas |
| D11 | Deploy em produção é preocupação de infraestrutura/bootstrap, nunca do Domínio |
| D12 | Automação de migrations no Render Free é implementada no startup do container como workaround operacional |
| D13 | `User` é um boundary de identidade da Infraestrutura e nunca deve vazar para o Domínio |
| D14 | Provedores OAuth são adaptadores; a aplicação normaliza-os em identidade interna |
| D15 | A aplicação emite seu próprio auth token para boundaries de runtime como o handshake WebSocket |
| D16 | Bots pertencem ao backend boundary, não ao frontend |
| D17 | `BotDecisionPort` vive na Application e é independente de tecnologia |
| D18 | `BotDecisionContext` deve conter apenas input de decisão, não detalhes de transporte |
| D19 | O frontend consome o boundary autenticado do backend em vez de redefini-lo |
| D20 | O frontend permanece não-autoritativo — o backend é dono da verdade da partida |

---

## Dívida Técnica Conhecida

| ID | Descrição | Status |
|---|---|---|
| DT-4 | Ordem de turno ainda vive no Gateway como regra transitória | ⚠️ Aceita |
| DT-7 | Camada de métricas/instrumentação formal não implementada | 🔜 Backlog |
| DT-8 | Nenhuma estratégia de correlation ID para rastreamento a nível de socket | 🔜 Backlog |
| DT-13 | Build do Docker ainda depende de workaround transitório `legacy-peer-deps` | ⚠️ Aceita |
| DT-14 | Migrations do Prisma rodam no startup do container no Render Free em vez de um job de pré-deploy isolado | ⚠️ Aceita |
| DT-15 | Compatibilidade transitória para identidade de socket legado deve ser removida após o frontend consumir o fluxo autenticado | ⚠️ Aceita |
| DT-22 | `HeuristicBotAdapter` é baseline útil, mas simples para competição real | ⚠️ Aceita |

---

## Estado Atual

- 🏛️ Arquiteturalmente organizado em camadas com separação estrita de responsabilidades
- 🎮 Capacitado para multiplayer 2v2 e 1v1 com bots preenchendo assentos
- 🤖 Preparado para evolução de múltiplos adapters de bot, incluindo serviço Python futuro
- 🗄️ Com persistência real e schema versionado via migrations
- 👁️ Observável com health checks e logs estruturados por evento
- 🐳 Containerizado com Docker multi-stage
- 🌐 Deployado em produção com PostgreSQL gerenciado
- 🔐 Autenticado via Google/GitHub OAuth real com auth token próprio
- 💻 Equipado com frontend jogável no browser
- 🚀 Pronto para evoluir para matchmaking público, replay e serviço de IA em Python

---

<div align="center">

<br/>

Feito com ♠️ ♥️ ♣️ ♦️

<br/>

</div>