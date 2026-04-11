# 🚂 Railway Deployment Guide - ERROR707 DTF Studio

## ⚡ Quick Deploy

1. **Conecta tu repositorio a Railway**
   - Ve a [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Selecciona tu repositorio

2. **Configura las variables de entorno** (Settings → Variables)
   ```bash
   # Base de datos (Railway te da una PostgreSQL gratis)
   DATABASE_URL=<Railway PostgreSQL URL>
   
   # JWT Secret (genera uno seguro)
   JWT_SECRET=tu-super-secreto-aleatorio-aqui
   
   # Puerto (Railway lo configura automáticamente, pero podemos definirlo)
   PORT=8001
   
   # Opcional: APIs para Yuki AI
   DEEPSEEK_API_KEY=<tu-key-de-deepseek>
   GROQ_API_KEY=<tu-key-de-groq>
   
   # Opcional: Stripe para pagos
   STRIPE_SECRET_KEY=<tu-key-de-stripe>
   STRIPE_WEBHOOK_SECRET=<tu-webhook-secret>
   ```

3. **Configura PostgreSQL**
   - En Railway: Click "+ New" → "Database" → "Add PostgreSQL"
   - Railway automáticamente creará la variable `DATABASE_URL`
   - Las migraciones se ejecutarán automáticamente en el primer deploy

4. **Configura Volume (Opcional pero recomendado)**
   - Para persistir repos clonados de GitHub
   - Settings → Volumes → Add Volume
   - Mount Path: `/app/yuki-repos`
   - Size: 1GB mínimo

5. **Deploy**
   - Railway detectará automáticamente `railway.toml` y `nixpacks.toml`
   - El build process:
     1. Instala dependencias (yarn install)
     2. Construye frontend (React + Vite)
     3. Construye backend (Node.js + esbuild)
     4. Inicia el servidor (backend sirve frontend + API)

## 📋 Estructura del Deployment

```
Build Process:
  ├─ Install: yarn install --frozen-lockfile
  ├─ Build Frontend: yarn workspace @workspace/dtf-pliego build
  └─ Build Backend: yarn workspace @workspace/api-server build

Runtime:
  └─ Start: bash /app/railway-start.sh
      └─ Backend (port 8001)
          ├─ Sirve Frontend estático (/)
          ├─ API endpoints (/api/*)
          └─ Health check (/api/health)
```

## 🔍 Health Check

Railway automáticamente verificará que la app esté funcionando:
- **Path**: `/api/health`
- **Timeout**: 100s
- **Restart Policy**: on_failure (máx 10 reintentos)

## ⚙️ Archivos de Configuración

- `railway.toml` - Configuración principal de Railway
- `nixpacks.toml` - Build configuration (Nixpacks)
- `Procfile` - Comando de inicio alternativo
- `railway-start.sh` - Script de inicio del servidor
- `package.json` (root) - Monorepo workspace configuration

## 🐛 Troubleshooting

### Error: "supervisorctl not found"
✅ **RESUELTO**: Ya no usamos supervisor en Railway. El nuevo `railway.toml` solo inicia el backend Node.js.

### Error: "DATABASE_URL not set"
→ Agrega PostgreSQL database en Railway y verifica que la variable `DATABASE_URL` esté configurada.

### Error: Frontend 404
→ Verifica que el build del frontend se ejecutó correctamente:
```bash
# En Railway logs, busca:
"yarn workspace @workspace/dtf-pliego build"
# Debe mostrar: "dist/index.html ... created"
```

### Error: API endpoints no responden
→ Verifica que el backend esté escuchando en el puerto correcto:
```bash
# Railway logs deben mostrar:
"Server listening" { "port": 8001 }
```

## 🎯 Verificación Post-Deploy

1. Abre tu URL de Railway: `https://tu-app.railway.app`
2. Deberías ver la página de login de DTF Studio
3. Verifica el health endpoint: `https://tu-app.railway.app/api/health`
4. Login con credenciales admin: `error707mty` / `buentello0607`

## 📚 Más Información

- [Railway Docs](https://docs.railway.app)
- [Nixpacks Docs](https://nixpacks.com)
- [Monorepo Deployment](https://docs.railway.app/guides/monorepo)
