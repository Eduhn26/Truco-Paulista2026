# Truco Paulista — Backend (NestJS)

Backend autoritativo para o jogo Truco Paulista, desenvolvido com **NestJS**, **TypeScript (strict)**, **DDD** e **Clean Architecture**.

O foco do projeto é **arquitetura escalável**, **domínio puro** e **testabilidade real**, não apenas funcionalidade.

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
Gateway → Application → Domain
Infrastructure implementa portas da Application


- **Zero dependência externa no Domain**
- ❌ NestJS
- ❌ Prisma
- ❌ WebSocket
- ❌ validações de transporte

- **Testabilidade**
Toda regra de negócio pode ser testada sem servidor, banco ou mocks complexos.

---

## 🧱 Estrutura do Projeto

```txt
src/
├── domain/          # Regras de negócio puras (DDD)
│   ├── entities
│   ├── value-objects
│   └── exceptions
├── application/     # Casos de uso, DTOs e ports
├── infrastructure/  # Persistência, eventos, integrações
├── gateway/         # WebSocket / HTTP (transporte)
└── main.ts          # Bootstrap da aplicação
🧩 Estado Atual (Fases)
✅ Fase 0 — Fundação
NestJS mínimo

TypeScript ultra-strict

ESLint type-aware

Prettier estável

Jest configurado

Build, lint e test passando

✅ Fase 1 — Domain (em andamento)
Aggregate Root: Match

Value Objects (Score, MatchState)

Invariantes explícitas

Testes unitários puros

Pontuação final: 12 pontos

🧪 Scripts Disponíveis
npm run start:dev   # inicia servidor em modo desenvolvimento
npm run test        # executa testes unitários
npm run lint        # executa lint type-aware
npm run format      # formata código com Prettier
npm run build       # build do projeto
🧠 Tecnologias Utilizadas
Node.js

TypeScript (strict)

NestJS

Jest

ESLint (type-aware)

Prettier

Planejado:

WebSocket (Socket.IO)

PostgreSQL + Prisma

Multiplayer 2v2

Ranking

🚀 Como Rodar Localmente
npm install
npm run test
npm run lint
npm run build
npm run start:dev
📌 Observações Importantes
Este projeto não utiliza E2E tests prematuramente

O domínio não será refatorado para mudanças de infraestrutura

A arquitetura foi pensada para crescimento incremental

📄 Licença
Projeto de estudo e portfólio.

