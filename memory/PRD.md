# ERROR707 Studio - PRD

## Original Problem Statement
1. Crear Yuki IDE con preview en tiempo real
2. Push a GitHub con un click
3. Poder modificar repo y token cuando quiera
4. Interfaz simple siguiendo la línea de diseño

## Architecture
- **Frontend**: React + Vite + TypeScript + Wouter
- **Backend**: Node.js + Express + PostgreSQL (Drizzle ORM)
- **AI**: DeepSeek Coder API
- **VCS**: Git + GitHub API

## What's Been Implemented (April 8, 2026)

### Yuki IDE - Interfaz Completa
- ✅ Layout estilo IDE: Chat izquierda + Preview derecha
- ✅ Preview en tiempo real con iframe de la app
- ✅ Botón Push para subir cambios a GitHub
- ✅ Modal de configuración GitHub (repo URL + token)
- ✅ Indicadores de git: branch actual, número de cambios
- ✅ Botón refrescar preview
- ✅ Auto-refresh del preview después de cambios de Yuki
- ✅ Diseño consistente con tema purple/violet

### GitHub Integration
- ✅ Endpoint GET /api/github/config - Obtener configuración
- ✅ Endpoint POST /api/github/config - Guardar configuración
- ✅ Endpoint POST /api/github/push - Push a GitHub
- ✅ Endpoint GET /api/github/status - Estado de git
- ✅ Configuración persistente en .github-config.json
- ✅ Acceso exclusivo para error707mty

### Files Created/Modified
- `/app/artifacts/api-server/src/routes/github.ts` - Backend GitHub
- `/app/artifacts/dtf-pliego/src/pages/Yuki.tsx` - Nueva interfaz IDE
- `/app/artifacts/dtf-pliego/src/index.css` - Estilos IDE
- `/app/artifacts/api-server/.github-config.json` - Config GitHub

## User Credentials
- **Admin**: error707mty / buentello0607

## GitHub Config
- **Repo**: https://github.com/error707mty-cmd/chidolol
- **Token**: Configurado (github_pat_...Fv3A)

## Next Tasks
- Probar push a GitHub
- Probar modificaciones en tiempo real con Yuki

## Backlog
- P1: Historial de commits en el IDE
- P2: Diff viewer antes de push
- P3: Branch selector
