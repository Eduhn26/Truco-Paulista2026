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

Estudo prático de engenharia de software construído em fases incrementais. O objetivo não é só fazer funcionar — é fazer da forma certa: domínio isolado, boundaries explícitas, backend autoritativo, decisões defensáveis.

O Truco Paulista foi escolhido por ser genuinamente difícil de modelar — regras de mão, hierarquia de cartas, lógica de equipes, transições de estado, aposta progressiva e regras especiais tornam o exercício de DDD não trivial.

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
| **Testes** | Jest · ts-jest — 31 suites · 174 testes · 0 falhas |
| **Deploy** | Render · Docker multi-stage |

---

## Arquitetura

```
Gateway → Application → Domain
Infrastructure implementa Application Ports
```

O Domínio não conhece NestJS, Prisma, Socket.IO, OAuth ou FastAPI. Isso não é aspiracional — é uma invariante estrutural verificável nos testes.

Os bots seguem o mesmo princípio: `BotDecisionPort` vive na Application, `HeuristicBotAdapter` e `PythonBotAdapter` vivem na Infrastructure. O Gateway nunca conhece o adapter concreto.

→ Decisões arquiteturais detalhadas em [`docs/architecture.md`](docs/architecture.md)

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

---

## Fase 17 — O que mudou

A Fase 17 deixou o backend semanticamente fiel ao jogo real e seguro para integração visual.

O `match-state` agora expõe:

- valor atual da mão e estado da aposta
- estado especial da mão (`mao-de-onze`, `mao-de-ferro`)
- vencedor e pontuação da mão encerrada
- `availableActions` — ações válidas para o turno atual

Novos eventos de ação da mão:

| Evento | Descrição |
|--------|-----------|
| `request-truco` | Solicitar truco |
| `accept-bet` | Aceitar aposta |
| `decline-bet` | Recusar aposta (correr) |
| `raise-to-six` | Pedir 6 |
| `raise-to-nine` | Pedir 9 |
| `raise-to-twelve` | Pedir 12 |
| `accept-mao-de-onze` | Aceitar mão de 11 |
| `decline-mao-de-onze` | Recusar mão de 11 |

O frontend agora pode disparar intenções válidas e consumir estado autoritativo — sem inventar regra local.

→ Detalhes completos em [`docs/phases/phase-17.md`](docs/phases/phase-17.md)

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
| [`docs/api.md`](docs/api.md) | Todos os eventos WebSocket Client↔Server |
| [`docs/technical-debt.md`](docs/technical-debt.md) | DTs rastreadas com status |
| [`python-bot-service/README.md`](python-bot-service/README.md) | Contrato HTTP, exemplos, health |

---

<div align="center">

<br/>

♠ ♥ ♣ ♦

<br/>

</div>