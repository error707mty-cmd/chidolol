# ERROR707 Studio - PRD

## Original Problem Statement
1. Integrar Yuki como IA principal con DeepSeek Coder
2. Dar control total de la aplicación a Yuki
3. Acceso exclusivo para error707mty en /yuki
4. Eliminar todas las referencias a Horo

## Architecture
- **Frontend**: React + Vite + TypeScript + Wouter
- **Backend**: Node.js + Express + PostgreSQL (Drizzle ORM)
- **AI**: DeepSeek Coder API (reemplazó OpenAI)

## What's Been Implemented (April 8, 2026)

### Yuki AI - Migración Completa
- ✅ Reemplazada API de OpenAI por DeepSeek Coder en todos los endpoints:
  - `/api/chat` (público)
  - `/api/admin/chat` (admin streaming)
  - `/api/admin/chat-job` (admin background jobs)
  - `/api/admin/chat-casual` (casual streaming)
  - `/api/yuki/chat` (exclusivo)
- ✅ Renombrado todas las referencias de "Horo" a "Yuki"
- ✅ Actualizado ChatAI.tsx - ahora muestra Yuki con DeepSeek Coder
- ✅ Actualizado AdminAsistente.tsx - ahora muestra Yuki
- ✅ Página exclusiva /yuki con UI personalizada (acceso solo error707mty)
- ✅ System prompts actualizados con personalidad de Yuki
- ✅ Brain file cambiado de error-brain.md a yuki-brain.md

### Files Modified
- `/app/artifacts/api-server/src/routes/chat.ts` - DeepSeek + Yuki
- `/app/artifacts/api-server/src/routes/admin/chat.ts` - DeepSeek + Yuki
- `/app/artifacts/api-server/src/routes/yuki.ts` - Endpoint exclusivo
- `/app/artifacts/dtf-pliego/src/pages/ChatAI.tsx` - UI Yuki
- `/app/artifacts/dtf-pliego/src/pages/AdminAsistente.tsx` - UI Yuki
- `/app/artifacts/dtf-pliego/src/pages/Yuki.tsx` - Página exclusiva
- `/app/artifacts/dtf-pliego/src/App.tsx` - Ruta /yuki
- `/app/artifacts/dtf-pliego/src/index.css` - Estilos Yuki

## User Credentials
- **Admin**: error707mty / buentello0607

## DeepSeek API
- **Key**: sk-b26b3f46130348688e5eac9cc3d99513
- **Model**: deepseek-coder
- **Endpoint**: https://api.deepseek.com

## Backlog / Future
- P1: Historial de conversaciones persistente para Yuki
- P2: Dashboard de actividad de Yuki
- P3: Más herramientas especializadas

## Next Tasks
- Probar todas las funcionalidades de Yuki
- Crear memoria inicial (yuki-brain.md)
