<div align="center">

# ♠️ Truco Paulista — Backend

**Backend autoritativo para o jogo Truco Paulista, construído com NestJS, TypeScript strict, DDD e Clean Architecture.**

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-framework-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?style=flat-square&logo=socket.io)](https://socket.io/)
[![Docker](https://img.shields.io/badge/Docker-containerized-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![Jest](https://img.shields.io/badge/Jest-55%20tests-C21325?style=flat-square&logo=jest)](https://jestjs.io/)

[🌐 Produção](https://truco-paulista-backend.onrender.com) · [❤️ Health](https://truco-paulista-backend.onrender.com/health/live) · [🗄️ Readiness](https://truco-paulista-backend.onrender.com/health/ready)

</div>

---

## 🎯 Objetivo do Projeto

Este projeto foi criado como um estudo prático e incremental para:

- Aplicar **Domain-Driven Design** em um projeto real
- Usar **TypeScript como ferramenta de design**, não apenas para checagem de tipos
- Construir um **backend real-time autoritativo**
- Garantir que mudanças de infraestrutura **nunca afetem o Domínio**
- Produzir código defensável em entrevistas técnicas e portfólio

---

## 🗺️ Status das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
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
| **10** | Frontend jogável (React/Next.js) | 🔜 Próximo |
| **11** | Modo 1v1 + bot preenchendo assentos | 🔜 Planejado |
| **12** | Preparação da arquitetura de bots | 🔜 Planejado |
| **13** | Matchmaking público | 🔜 Planejado |
| **14** | Histórico de partidas + replay | 🔜 Planejado |
| **15** | Serviço de IA em Python | 🔜 Planejado |
| **16** | Hardening (segurança + performance) | 🔜 Planejado |

---

## 🧠 Arquitetura

### Princípio Domain-First

O Domínio tem **zero dependência** de frameworks, bancos de dados, camadas de transporte, logging, health checks, provedores de autenticação ou qualquer preocupação operacional.

```
Gateway → Application → Domain
Infrastructure implementa Application Ports
Domain sem dependências externas
```

> O Domínio nunca depende de: NestJS, Prisma, Socket.IO, OAuth providers, validação de transporte ou logging.

### Camadas e Responsabilidades

| Camada | Responsabilidade |
|--------|-----------------|
| **Domain** | Regras puras do Truco — entidades, value objects, services, invariantes |
| **Application** | Use Cases, DTOs, orquestração, ports, mappers |
| **Infrastructure** | Persistência, Prisma, readiness do banco, adaptadores de auth |
| **Gateway** | Transporte WebSocket, estado efêmero de sala/presença/turno, coordenação multiplayer |
| **Auth** | Entrypoints HTTP de autenticação, estratégias OAuth, emissão de auth token |
| **Bootstrap / Health** | Lifecycle de startup, endpoints de health, logging operacional estruturado |

### Testabilidade

As regras do jogo são testáveis **sem**:
- Um servidor em execução
- Um banco de dados real
- Infraestrutura de transporte
- Mocks complexos

---

## 🎮 O que Funciona Hoje

### Multiplayer e Ranking

- Multiplayer 2v2 real via WebSocket (Socket.IO)
- 4 jogadores por sala com assentos: `T1A`, `T2A`, `T1B`, `T2B`
- Ordem de turno: `T1A → T2A → T1B → T2B`
- Sincronização de estado *ready* — a partida só começa quando todos os 4 jogadores estão prontos
- Reconexão por identidade de sessão técnica, preservando o mesmo assento
- Ranking persistido com ELO simplificado:
  - `+25` por vitória · `-25` por derrota · `mínimo 100`

### Autenticação

- Fluxo real de Google OAuth
- Fluxo real de GitHub OAuth
- Persistência interna de usuário (`User`)
- Auth token emitido pela aplicação após o callback OAuth
- Handshake WebSocket autenticado via `authToken`
- `PlayerProfile` vinculado ao `userId`
- Usuários autenticados distintos podem entrar na mesma partida sem colisão de assento

### Perfil do Jogador

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

## 🏗️ Estrutura do Projeto

```
backend/
├── frontend/                  # Debug UI (Vanilla JS, sem framework)
│   ├── index.html
│   ├── styles.css
│   └── app.js
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
│   │   └── persistence/
│   │       ├── prisma/
│   │       └── in-memory/
│   ├── gateway/               # Transporte WebSocket
│   │   ├── game.gateway.ts
│   │   └── multiplayer/
│   ├── health/                # Superficie de liveness / readiness
│   ├── modules/               # Wiring de DI do NestJS
│   ├── scripts/               # simulate-hand.ts, ws-client.ts
│   └── main.ts
└── test/
    └── unit/
        ├── auth/
        ├── domain/
        ├── application/
        └── gateway/
```

---

## 🚀 Iniciando

### Pré-requisitos

- Node.js 20+
- Docker + Docker Compose

### Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env

# 3. Subir o banco de dados
docker compose up -d postgres

# 4. Rodar migrations
npx prisma migrate dev

# 5. Iniciar o backend
npm run start:dev
```

### Validar Health Endpoints

```bash
# Processo está vivo
curl http://localhost:3000/health/live

# Banco de dados está pronto
curl http://localhost:3000/health/ready
```

### Rodar Completamente Containerizado

```bash
# 1. Build e subir tudo
docker compose up -d --build

# 2. Inspecionar serviços
docker compose ps

# 3. Inspecionar o fluxo de migration
docker compose logs --tail=100 migrate

# 4. Inspecionar logs do backend
docker compose logs --tail=100 backend
```

---

## 🔐 Autenticação

### Endpoints OAuth

```
GET /auth/google
GET /auth/google/callback
GET /auth/github
GET /auth/github/callback
```

**Formato da resposta do callback:**

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

### Fluxo WebSocket Autenticado

```bash
# Criar uma partida com identidade autenticada
npm run ws:client -- create <AUTH_TOKEN> 1

# Entrar em uma partida existente com outra identidade autenticada
npm run ws:client -- join <MATCH_ID> <OUTRO_AUTH_TOKEN>
```

---

## 🧪 Testes

```bash
npm run test        # Rodar todos os testes
npm run test:watch  # Rodar em modo watch
npm run lint        # Lint
npm run build       # Build de produção
```

> ✅ **16 suites de teste · 55 testes · 0 falhas**

---

## 📡 Endpoints HTTP

| Rota | Método | Descrição |
|------|--------|-----------|
| `/` | `GET` | Rota raiz |
| `/health/live` | `GET` | Liveness check — processo está no ar |
| `/health/ready` | `GET` | Readiness check — banco de dados pronto |
| `/auth/google` | `GET` | Inicia login Google OAuth |
| `/auth/google/callback` | `GET` | Callback Google OAuth |
| `/auth/github` | `GET` | Inicia login GitHub OAuth |
| `/auth/github/callback` | `GET` | Callback GitHub OAuth |

---

## 📡 Eventos WebSocket

| Evento | Direção | Descrição |
|--------|---------|-----------|
| `create-match` | Client → Server | Criar uma nova sala |
| `join-match` | Client → Server | Entrar em uma sala existente |
| `set-ready` | Client → Server | Jogador sinaliza pronto |
| `start-hand` | Client → Server | Iniciar a mão |
| `play-card` | Client → Server | Jogar uma carta |
| `get-state` | Client → Server | Requisitar estado atual |
| `get-ranking` | Client → Server | Requisitar ranking |
| `player-assigned` | Server → Client | Confirma assento atribuído |
| `room-state` | Server → Client | Broadcast do estado da sala |
| `match-state` | Server → Client | Broadcast do estado da partida |
| `hand-started` | Server → Client | Broadcast de mão iniciada |
| `card-played` | Server → Client | Broadcast de carta jogada |
| `rating-updated` | Server → Client | Ranking atualizado após partida |
| `error` | Server → Client | Erro de validação, transporte, domínio ou inesperado |

---

## 🗃️ Schema do Banco

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

## 📐 Decisões Arquiteturais

| ID | Decisão |
|----|---------|
| D1 | `PlayerId` no Domínio permanece como `'P1'`, `'P2'`, etc. |
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
| D14 | Provedores OAuth são adaptadores; a aplicação deve normalizá-los em identidade interna |
| D15 | A aplicação emite seu próprio auth token para boundaries de runtime como o handshake WebSocket |
| D16 | Entrada autenticada no multiplayer resolve `userId` primeiro e mantém identidade de sessão técnica separada |

---

## ⚠️ Dívida Técnica

| ID | Descrição | Status |
|----|-----------|--------|
| DT-4 | Ordem de turno ainda vive no Gateway como regra transitória | ⚠️ Aceita |
| DT-7 | Camada de métricas/instrumentação formal ainda não implementada | 🔜 Backlog |
| DT-8 | Nenhuma estratégia de correlation ID para rastreamento a nível de socket | 🔜 Backlog |
| DT-13 | Build do Docker ainda depende de workaround transitório `legacy-peer-deps` | ⚠️ Aceita |
| DT-14 | No Render Free, migrations do Prisma rodam no startup do container em vez de um job de pré-deploy isolado | ⚠️ Aceita |
| DT-15 | Compatibilidade transitória para identidade de socket legado deve ser removida após o frontend consumir o fluxo autenticado | ⚠️ Aceita |
| DT-16 | Auth token do callback OAuth está pronto no backend, mas consumo de sessão real pelo frontend pertence à Fase 10 | 🔜 Backlog |

---

## 🛠️ Stack

| Aspecto | Escolha |
|---------|---------|
| **Runtime** | Node.js 20 |
| **Linguagem** | TypeScript (strict — todos os flags principais habilitados) |
| **Framework** | NestJS |
| **Transporte** | WebSocket via Socket.IO |
| **Persistência** | PostgreSQL 16 + Prisma ORM |
| **Autenticação** | Google OAuth + GitHub OAuth + auth token próprio |
| **Testes** | Jest + ts-jest |
| **Frontend (debug)** | Vanilla JS |
| **Runtime containerizado** | Docker + Docker Compose |
| **Hospedagem de produção** | Render |
| **Banco de produção** | Render Postgres |
| **Observabilidade** | Health/readiness + logging estruturado |

---

## ✅ Estado Atual

O backend está atualmente:

- 🏛️ Arquiteturalmente organizado em camadas
- 🎮 Capacitado para multiplayer
- 🗄️ Com persistência real
- 👁️ Observável
- 🐳 Containerizado
- 🌐 Deployado em produção
- 🔗 Conectado a um PostgreSQL gerenciado
- ⚙️ Rodando migrations automáticas em produção
- 🔐 Autenticado via Google/GitHub OAuth real
- 🎫 Emitindo seu próprio auth token de aplicação
- 🤝 Capaz de entrada autenticada em sessão multiplayer
- 🚀 Pronto para evoluir para frontend jogável, bots e matchmaking público

---

<div align="center">

Feito com ♠️ ♥️ ♣️ ♦️

</div>
