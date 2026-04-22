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

Estudo prático de engenharia de software construído em **23 fases incrementais**. O objetivo não é só fazer funcionar — é fazer da forma certa: domínio isolado, boundaries explícitas, backend autoritativo, decisões defensáveis e evolução de produto real sobre base arquitetural sólida.

O Truco Paulista foi escolhido por ser genuinamente difícil de modelar — regras de mão, hierarquia de cartas, lógica de equipes, transições de estado, aposta progressiva, mão de 11 e mão de ferro tornam o exercício de DDD não trivial. Nas fases finais, o projeto também passou a tratar o frontend como produto de verdade: Home mais honesta, Lobby com camada de continuidade, mesa premium, HUD legível, observabilidade lateral, identidade de bots e match surface defensável como hero screen de portfólio.

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
| 23 | Meta layer / retention foundation + Home / Lobby / Match coherence pass | ✅ |

---

## Fase 23 — O que mudou

A Fase 23 fechou a **meta layer / retention foundation** do produto. Depois de a Fase 22 consolidar a identidade dos bots, a observabilidade lateral e a match surface premium, o próximo gap deixou de ser apenas mesa e passou a ser **continuidade de produto**: a entrada pela Home ainda era parcialmente artificial, o Lobby ainda precisava comunicar melhor reconnect / recent-session / active-room, e o fluxo **Home → Lobby → Match** ainda não se sustentava com a mesma coerência de uma aplicação realmente fechada.

**Home truthfulness pass:**
- A Home deixou de depender de sinais artificiais ou pseudo-métricas
- O hero e a supporting strip passaram a refletir capacidades reais do produto
- A landing ficou mais honesta, mais defensável e mais coerente com o estágio atual do projeto

**Lobby continuity foundation:**
- O Lobby deixou de se comportar como waiting room genérica e passou a atuar como superfície real de continuidade
- Estados de reconnect, first-session, recent-session e active-room ficaram mais claros
- O hero passou a assumir o papel de guia principal da próxima ação

**Retention-oriented meta layer:**
- `Seu Momento`, `Última Partida` e ranking passaram a funcionar melhor como camada de retenção leve
- O produto começou a comunicar com mais clareza o que aconteceu recentemente e o que o jogador deve fazer em seguida
- A fundação da camada meta foi estabelecida sem simular um sistema maior do que o backend realmente suporta hoje

**Reconnect / idle-state cleanup:**
- Redundâncias de CTA foram removidas
- O reconnect ficou mais limpo e menos ruidoso
- Superfícies operacionais passaram a aparecer quando agregam contexto real, e não só por estarem sempre ligadas

**Cross-surface coherence pass:**
- Home, Lobby e Match foram harmonizados visualmente como partes do mesmo produto
- O sistema de ouro / verde / dark premium ficou mais consistente
- A MatchPage foi refinada para conversar melhor com Home e Lobby sem perder protagonismo da mesa

**Portfolio-grade product continuity:**
- O projeto agora apresenta uma entrada mais honesta, uma continuidade melhor no Lobby e uma MatchPage mais alinhada ao restante da experiência
- A fase não mudou a autoridade do backend, mas fortaleceu a forma como o produto é entrado, retomado e percebido
- O resultado é um fluxo mais coeso, mais maduro e mais defensável como produto real de portfólio

→ [`docs/phases/phase-23.md`](docs/phases/phase-23.md)

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
| [`docs/phases/phase-23.md`](docs/phases/phase-23.md) | Meta layer / retention foundation + Home / Lobby / Match coherence pass |
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
