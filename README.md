# Truco Paulista â€” Backend (NestJS)

Backend autoritativo para Truco Paulista com NestJS, DDD e Clean Architecture.

## Stack
- Node.js + TypeScript (strict)
- NestJS
- WebSocket (Socket.io)
- PersistÃªncia: in-memory (Fase 1) â†’ PostgreSQL + Prisma (Fase 2)

## Scripts
- 
pm run start:dev â€” dev server
- 
pm run test â€” unit tests
- 
pm run lint â€” eslint
- 
pm run format â€” prettier
- 
pm run build â€” build

## Regra de dependÃªncia (Clean Architecture)
Gateway/Transport â†’ Application â†’ Domain  
Infrastructure implementa ports da Application.
