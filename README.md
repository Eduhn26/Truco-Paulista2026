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