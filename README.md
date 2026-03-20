# Truco Paulista — Backend (NestJS)

Authoritative backend for the **Truco Paulista** card game, built with **NestJS**, **TypeScript (strict)**, **DDD**, and **Clean Architecture**.

This project focuses on **scalable architecture**, **pure domain modeling**, and **real operational discipline** — not just feature delivery.

---

## 🎯 Project Goal

This project was created as a practical, incremental study to:

- apply **Domain-Driven Design** in a real project
- use **TypeScript as a design tool**, not just for type-checking
- build a truly **authoritative real-time backend**
- ensure infrastructure changes **never affect the Domain**
- produce code that is defensible in technical interviews and portfolio reviews

---

## 🏁 Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Professional setup (TS strict, ESLint, Jest, scripts) | ✅ Complete |
| Phase 1 | Pure Domain (DDD — entities, value objects, domain service) | ✅ Complete |
| Phase 2 | Application Layer (Use Cases, DTOs, Ports) | ✅ Complete |
| Phase 3 | WebSocket transport (Socket.IO + Gateway) | ✅ Complete |
| Phase 4 | Real persistence (PostgreSQL + Prisma) | ✅ Complete |
| Phase 5 | Real 2v2 multiplayer + Ranking | ✅ Complete |
| Phase 6 | Observability (structured logs, health/readiness, error classification) | ✅ Complete |
| Phase 7 | Containerization (Docker multi-stage + Compose + migration flow) | ✅ Complete |
| Phase 8 | Production deploy | 🔜 Next |
| Phase 9 | Real authentication (Google/GitHub OAuth) | 🔜 |
| Phase 10 | Playable frontend | 🔜 |
| Phase 11 | 1v1 mode + bot seat filling | 🔜 |
| Phase 12 | Bot architecture preparation | 🔜 |
| Phase 13 | Public matchmaking | 🔜 |
| Phase 14 | Match history + replay | 🔜 |
| Phase 15 | Python AI service | 🔜 |
| Phase 16 | Hardening (security + performance) | 🔜 |

---

## 🧠 Architectural Principles

### Domain-first

The Domain has **zero dependency** on frameworks, databases, transport, or infrastructure details.

### Real Clean Architecture

```text
Gateway → Application → Domain
Infrastructure implements Application Ports
