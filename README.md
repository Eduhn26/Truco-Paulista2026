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
[![Jest](https://img.shields.io/badge/231_testes-passing-2ea44f?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)

<br/>

[🌐 Produção](https://truco-paulista-backend.onrender.com) · [❤️ Liveness](https://truco-paulista-backend.onrender.com/health/live) · [🗄️ Readiness](https://truco-paulista-backend.onrender.com/health/ready)

<br/>

</div>

---

Estudo prático de engenharia de software construído em **24 fases incrementais**. O objetivo não é só fazer funcionar — é fazer da forma certa: domínio isolado, boundaries explícitas, backend autoritativo, decisões defensáveis e evolução de produto real sobre base arquitetural sólida.

O Truco Paulista foi escolhido por ser genuinamente difícil de modelar — regras de mão, hierarquia de cartas, lógica de equipes, transições de estado, aposta progressiva, mão de 11 e mão de ferro tornam o exercício de DDD não trivial. Nas fases finais, o projeto também passou a tratar o frontend como produto de verdade: Home mais honesta, Lobby com camada de continuidade, mesa premium, HUD legível, observabilidade lateral, identidade de bots, match surface defensável como hero screen de portfólio e uma camada 2v2 mais madura de sinais, conselho e proposta de aposta da dupla.

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
| **Testes** | Jest · ts-jest — 32 suites · 231 testes · 0 falhas |
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
| 24 | 2v2 partner intelligence + betting flow hardening | ✅ |

---

## Fase 24 — O que mudou

A Fase 24 fortaleceu a **inteligência da dupla 2v2 e o fluxo de aposta com parceiro bot**. Depois de a Fase 23 fechar a camada de produto/meta em Home, Lobby e Match, o próximo gap voltou para o núcleo da mesa: sinais de dupla, conselho de aposta, proposta de Truco / 6 / 9 / 12, autoridade humana e leitura de ameaça pública.

**Partner bet proposal flow:**
- O bot parceiro agora pode propor Truco ou aumento sem executar sozinho a decisão da dupla
- O humano recebe a proposta na mesa e pode aprovar ou rejeitar
- O backend valida a autorização e só executa a aposta quando a decisão humana permite

**Sinais de dupla mais táticos:**
- Sinais como `Tô forte`, `Tô fraco`, `Mata essa`, `Joga baixo`, `Pressiona` e `Não compra` passaram a ter consequência real na leitura do bot parceiro
- O ciclo de memória, resolução e consumo dos sinais ficou mais claro
- Sinais inválidos continuam sendo bloqueados quando não condizem com a mão real do jogador

**Conselho de aposta semântico:**
- `Pressiona` para pedido de Truco
- `Eu pago` para aceitar aposta
- `Não compra` para correr
- `Dá para aumentar` para escalada
- A UI agora comunica melhor o que o bot realmente queria fazer

**Fallback tático após aposta bloqueada:**
- Quando o bot queria apostar mas a decisão pertencia ao humano, o gateway passou a pedir uma decisão card-only
- Isso evita que o parceiro queime carta forte de forma burra depois de uma aposta bloqueada

**Bot com leitura de ameaça pública:**
- O bot heurístico agora considera manilhas públicas e cartas ameaçadoras já reveladas
- Situações decisivas com Zap ou manilha forte reduzem raise/bluff indevido
- A telemetria do bot ganhou campos de ameaça pública para tornar a decisão mais auditável

**Clareza visual do 2v2:**
- A mesa diferencia melhor quando você pediu Truco, quando o parceiro iniciou o movimento e quando os rivais pressionaram
- O fluxo visual de proposta do parceiro ficou integrado à MatchPage
- O watermark de valor aceito em 3 / 6 / 9 / 12 recebeu ajuste fino de legibilidade

**Validação:**
- 32 suites de teste passando
- 231 testes passando
- build backend passando
- build frontend passando
- validação manual do fluxo 2v2, sinais, proposta de parceiro e mesa 3 / 6 / 9 / 12

→ [`docs/phases/phase-24.md`](docs/phases/phase-24.md)

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
| [`docs/phases/phase-24.md`](docs/phases/phase-24.md) | 2v2 partner intelligence + betting flow hardening |
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
