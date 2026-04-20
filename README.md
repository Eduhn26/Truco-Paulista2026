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
[![Jest](https://img.shields.io/badge/174_testes-passing-2ea44f?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)

<br/>

[🌐 Produção](https://truco-paulista-backend.onrender.com) · [❤️ Liveness](https://truco-paulista-backend.onrender.com/health/live) · [🗄️ Readiness](https://truco-paulista-backend.onrender.com/health/ready)

<br/>

</div>

---

Estudo prático de engenharia de software construído em **22 fases incrementais**. O objetivo não é só fazer funcionar — é fazer da forma certa: domínio isolado, boundaries explícitas, backend autoritativo, decisões defensáveis e evolução de produto real sobre base arquitetural sólida.

O Truco Paulista foi escolhido por ser genuinamente difícil de modelar — regras de mão, hierarquia de cartas, lógica de equipes, transições de estado, aposta progressiva, mão de 11 e mão de ferro tornam o exercício de DDD não trivial. Nas fases finais, o projeto também passou a tratar o frontend como produto de verdade: mesa premium, HUD legível, observabilidade lateral, identidade de bots e match surface defensável como hero screen de portfólio.

---

## Stack

| | |
|-|---|
| **Backend** | Node.js 20 · NestJS · TypeScript strict |
| **Transporte** | Socket.IO |
| **Persistência** | PostgreSQL 16 · Prisma ORM |
| **Autenticação** | Google OAuth · GitHub OAuth · auth token próprio |
| **Frontend** | React · Vite · TypeScript · Tailwind CSS |
| **Bots** | Adapter heurístico local + Python Bot Service (FastAPI) |
| **Testes** | Jest · ts-jest — 32 suites · 174 testes · 0 falhas |
| **Deploy** | Render · Docker multi-stage · GitHub Actions |

---

## Arquitetura

```
Gateway → Application → Domain
Infrastructure implementa Application Ports
```

O Domínio não conhece NestJS, Prisma, Socket.IO, OAuth ou FastAPI. Isso não é aspiracional — é uma invariante estrutural verificável nos testes. As regras do Truco (`truco-rules.ts`, `hand.ts`, `match.ts`) são testáveis sem servidor, banco ou mocks de framework.

Os bots seguem o mesmo princípio: `BotDecisionPort` vive na Application, `HeuristicBotAdapter` e `PythonBotAdapter` vivem na Infrastructure. O Gateway nunca conhece o adapter concreto.

→ [`docs/architecture.md`](docs/architecture.md)

---

## Fases

| # | Descrição | |
|---|-----------|--|
| 0 | Setup — TS strict, ESLint, Jest | ✅ |
| 1 | Domínio puro — entidades, value objects, domain services | ✅ |
| 2 | Camada de Aplicação — Use Cases, DTOs, Ports | ✅ |
| 3 | Transporte WebSocket — Socket.IO + Gateway | ✅ |
| 4 | Persistência — PostgreSQL + Prisma | ✅ |
| 5 | Multiplayer 2v2 + ranking | ✅ |
| 6 | Observabilidade — health, readiness, logs estruturados | ✅ |
| 7 | Containerização — Docker multi-stage + Compose | ✅ |
| 8 | Deploy em produção — Render + Postgres + migrations | ✅ |
| 9 | Autenticação — Google/GitHub OAuth + WebSocket autenticado | ✅ |
| 10 | Frontend jogável — React + Vite + lobby autenticado | ✅ |
| 11 | Modo 1v1 + bots + estado público/privado | ✅ |
| 12 | Arquitetura de bots — boundary, profiles, adapter | ✅ |
| 13 | Matchmaking — fila, pairing, timeout, fallback | ✅ |
| 14 | Histórico de partidas + replay | ✅ |
| 15 | Python AI Service — FastAPI, contrato HTTP, adapter, wiring | ✅ |
| 16 | Hardening — rate limiting, métricas, correlation ID, env validation | ✅ |
| 17 | Adequação às regras reais do Truco Paulista + contrato frontend-ready | ✅ |
| 18 | Frontend contract hardening + MatchPage structural cleanup | ✅ |
| 19 | Frontend environment / OAuth / runtime hardening + product consistency | ✅ |
| 20 | Frontend gameplay surface closure + truco core visible hardening | ✅ |
| 21 | Match table productization + HUD / game-feel consolidation | ✅ |
| 22 | Bot identity productization + match observability / premium surface finalization | ✅ |

---

## Fase 22 — O que mudou

A Fase 22 fechou a **identidade visual dos bots, a observabilidade lateral e o refinamento final da mesa premium**. Depois de a Fase 21 transformar a `MatchPage` em uma hero screen muito mais forte, o próximo gap passou a ser refinamento sistêmico: identidade do oponente, leitura lateral de estado, equilíbrio entre centro da jogada e hand dock, diferenciação de Vira, placar, feedback de vitória/empate e composição final da mesa.

**Bot identity productization:**
- Bots ganharam identidade visível de mesa — nome, avatar e perfil compõem a leitura do oponente
- Oponente deixou de parecer apenas um seat placeholder genérico
- A partida 1v1 ganhou mais variedade e mais presença de produto

**Observability side panel:**
- A partida agora possui uma superfície lateral secundária para leitura técnica
- Rounds history, live state, bot telemetry e event log ganharam espaço próprio
- O centro da mesa deixou de precisar carregar toda a observabilidade

**Rounds / side-history refinement:**
- Histórico de rodadas adaptado ao espaço lateral, mais legível e compatível com a dock técnica
- A leitura deixou de parecer debug espremido

**Final premium table balancing:**
- Centro da jogada, Vira, score, hand dock e side panel reequilibrados
- Played cards recuperaram protagonismo como principal beat visual da rodada
- A mesa ficou mais consistente como sistema visual e não como soma de componentes

**Player-hand / dock refinement:**
- Hand dock recebeu ajustes finos de presença, grounding e visibilidade
- A mão passou a ler melhor como parte da mesa e não como bloco desconectado

**Vira / score / round feedback refinement:**
- A Vira ganhou tratamento visual próprio e mais distinguível
- Placar ficou mais premium e mais legível
- Badge de vitória e feedback de empate comunicam melhor o resultado de rodada

**Portfolio-grade match surface finalization:**
- `MatchPage` mais defensável como hero screen premium
- Identidade visual, leitura de estado, observabilidade e ergonomia convivem melhor
- O projeto fecha esta fase com uma mesa mais coesa, legível e madura como produto

→ [`docs/phases/phase-22.md`](docs/phases/phase-22.md)

---

## Rodando localmente

**Pré-requisitos:** Node.js 20+ · Docker + Docker Compose

```bash
# Backend
npm install && cp .env.example .env
docker compose up -d postgres
npx prisma migrate dev
npm run start:dev
```

```bash
# Frontend
cd frontend-app && npm install && npm run dev
# → http://localhost:5173
```

```bash
# Python Bot Service
cd python-bot-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# Validar
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/metrics
curl http://localhost:8000/health/live
```

---

## Documentação

| | |
|-|---|
| [`docs/architecture.md`](docs/architecture.md) | Domain-first, camadas, ADRs |
| [`docs/api.md`](docs/api.md) | Eventos WebSocket Client↔Server |
| [`docs/technical-debt.md`](docs/technical-debt.md) | DTs rastreadas com status |
| [`docs/phases/phase-22.md`](docs/phases/phase-22.md) | Bot identity productization + match observability / premium surface finalization |
| [`docs/phases/phase-21.md`](docs/phases/phase-21.md) | Match table productization + HUD / game-feel consolidation |
| [`docs/frontend-deploy.md`](docs/frontend-deploy.md) | Contrato de env e frontend deploy |
| [`python-bot-service/README.md`](python-bot-service/README.md) | Contrato HTTP, exemplos, health |

---

<div align="center">

<br/>

♠ ♥ ♣ ♦

<br/>

</div>
