# Truco Paulista — Backend (NestJS)

Backend autoritativo para o jogo **Truco Paulista**, desenvolvido com **NestJS**, **TypeScript (strict)**, **DDD** e **Clean Architecture**.

O foco do projeto é **arquitetura escalável**, **domínio puro** e **testabilidade real** — não apenas funcionalidade.

---

## 🎯 Objetivo do Projeto

Este projeto foi criado como um estudo prático e incremental para:

- Aplicar **Domain-Driven Design** na prática
- Usar **TypeScript como ferramenta de design**
- Construir um backend **autoritativo**
- Garantir que mudanças de infraestrutura **não afetem o domínio**
- Criar um código defensável para entrevistas técnicas e portfólio

---

## 🧠 Princípios Arquiteturais

- **Domain-first**
  O domínio não depende de framework, banco ou transporte.

- **Clean Architecture real**
  `Gateway → Application → Domain`  
  `Infrastructure implementa Ports da Application`

- **Domain com zero dependência externa**
  - ❌ NestJS
  - ❌ Prisma
  - ❌ Socket.IO
  - ❌ validações de transporte

- **Testabilidade**
  Regras do jogo testáveis sem servidor, sem DB e sem mocks complexos.

---

## 🧱 Estrutura do Projeto

```txt
src/
├── domain/                         # Regras de negócio puras (DDD)
│   ├── entities
│   ├── value-objects
│   └── exceptions
├── application/                    # Use Cases, DTOs e Ports
├── infrastructure/
│   └── persistence/
│       ├── in-memory/              # Repo legado (fase 2)
│       └── prisma/                 # Persistência real (fase 4)
├── gateway/                        # WebSocket / transporte
├── modules/                        # Wiring de DI (Nest Modules)
├── scripts/                        # Scripts locais (ex: ws-client)
└── main.ts                         # Bootstrap da aplicação
🧩 Estado Atual (Fases)
✅ Fase 0 — Fundação

NestJS mínimo

TypeScript ultra-strict

ESLint type-aware

Prettier estável

Jest configurado

Build/Lint/Test passando

✅ Fase 1 — Domain (DDD puro)

Aggregate Root: Match

Value Objects (Card/Rank/Suit/Score/PlayerId etc.)

Invariantes explícitas

Testes unitários puros

✅ Fase 2 — Application Layer

Use Cases (CreateMatch, JoinMatch, StartHand, PlayCard, ViewState)

Port MatchRepository

InMemoryMatchRepository como adapter inicial

✅ Fase 3 — Transporte (WebSocket / Socket.IO)

GameGateway com eventos do jogo (real-time)

Gateway stateless (sem Domain direto)

DI via GameModule

✅ Fase 4 — Persistência Real (PostgreSQL + Prisma)

Postgres via Docker

Prisma com migrations + schema

PrismaService + PrismaModule isolados em Infrastructure

PrismaMatchRepository implementando MatchRepository

Persistência por snapshot + hidratação do estado (state sobrevive restart)

Script ws-client.ts validando o fluxo completo via WebSocket

➡️ Próxima fase: Fase 5 — Multiplayer completo (2v2 + Ranking)

🧪 Scripts Disponíveis
npm run start:dev        # inicia servidor em modo desenvolvimento
npm run test             # testes unitários
npm run lint             # eslint type-aware
npm run format           # prettier
npm run build            # build do projeto

npm run db:up            # sobe Postgres via docker-compose
npm run db:down          # derruba containers (se existir)
npm run prisma:generate  # gera Prisma Client
npm run prisma:deploy    # aplica migrations (deploy)
🚀 Como Rodar Localmente (com DB)
1) Instalar dependências
npm install
2) Subir Postgres (Docker)
npm run db:up
docker ps
3) Configurar .env
Exemplo:

NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:51214/postgres?schema=public"
4) Rodar migrations e gerar client
npm run prisma:deploy
npm run prisma:generate
5) Subir backend
npm run start:dev
🔌 Teste do fluxo via WebSocket (script)
Após subir o backend, rode:

node -r tsconfig-paths/register -r ts-node/register src/scripts/ws-client.ts
Esse script valida um fluxo completo (exemplo):

create-match

join-match

start-hand

play-card

get-state

🧰 Tecnologias Utilizadas
Node.js

TypeScript (strict)

NestJS

Jest

ESLint (type-aware)

Prettier

Socket.IO

PostgreSQL

Prisma ORM

Planejado (fases futuras):

Multiplayer 2v2 + Ranking

Observabilidade (logs, health checks)

Containerização completa

Deploy

Hardening (segurança/performance)

📌 Observações Importantes
Este projeto evita E2E prematuro: Domain/Application precisam estar sólidos primeiro.

O domínio não é “refatorado para caber no banco” — Prisma é detalhe de Infrastructure.

A arquitetura foi pensada para crescer por fases, com histórico didático via PRs.

