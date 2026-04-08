---
## Contexto del Proyecto ERROR707 Studio
*Actualizado: 08/04/2026*

### Entorno de Desarrollo y Deployment
- **Plataforma**: Railway (PaaS)
- **Base de datos**: PostgreSQL hospedado en Railway
- **CI/CD**: Automático via git push al repositorio conectado
- **Estructura**: Monorepo pnpm con frontend (React + Vite) y backend (Node.js + Express)

### Información Importante de Railway
- Railway detecta cambios automáticamente cuando se hace push a GitHub
- Las variables de entorno (DATABASE_URL, JWT_SECRET, DEEPSEEK_API_KEY) están configuradas en Railway
- El proyecto usa pnpm workspaces: `/app/artifacts/dtf-pliego` (frontend) y `/app/artifacts/api-server` (backend)
- PostgreSQL corre en Railway, no local
- No uses comandos de docker, nginx o systemd - Railway maneja todo esto

### Stack Tecnológico
- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, Wouter (routing)
- **Backend**: Node.js 20, Express 5, PostgreSQL 15, Drizzle ORM
- **AI Integration**: DeepSeek Coder API (configurada y funcionando)
- **Gestión de paquetes**: pnpm v10.33.0

### Usuario Principal
- **Username**: error707mty
- **Rol**: Admin
- **Acceso exclusivo**: Solo este usuario puede acceder a Yuki IDE

### Rutas Principales
- `/` - Landing page del estudio de impresión DTF
- `/login` - Autenticación
- `/dashboard` - Panel principal (requiere login)
- `/yuki` - IDE de Yuki (acceso exclusivo para error707mty)

### Deployment en Railway
Cuando el usuario mencione "deployar", "subir cambios" o "actualizar producción":
1. Los cambios se sincronizan automáticamente con GitHub Push
2. Railway detecta el push y reconstruye el proyecto
3. El nuevo build se despliega automáticamente

NO se requieren comandos especiales de deployment - Railway lo maneja todo.

---
## Notas Técnicas

### Hot Reload
- Frontend: Cambios en `/app/artifacts/dtf-pliego/src` se reflejan inmediatamente
- Backend: Cambios en `/app/artifacts/api-server/src` requieren rebuild (usa `restart_backend` tool)

### Tools Disponibles
Tienes 13 tools para controlar el proyecto completamente:
- `list_files`, `read_file`, `write_file`, `search_replace` - Manejo de archivos
- `exec_shell` - Ejecutar comandos (usa con precaución)
- `screenshot` - Tomar capturas de pantalla de la app
- `search_in_files` - Buscar en el proyecto
- `get_app_stats` - Estadísticas de la base de datos
- `execute_sql` - Ejecutar queries SQL en PostgreSQL
- `read_knowledge`, `update_knowledge` - Tu propia memoria persistente
- `install_package` - Instalar dependencias pnpm
- `restart_backend` - Recompilar el backend

### GitHub Integration
El repositorio está conectado a: https://github.com/error707mty-cmd/chidolol
Cuando uses el botón "Push", los cambios van directo a GitHub y Railway los detecta.

---
## Prueba del Sistema
*Actualizado: 8/4/2026, 4:37:08 p.m.*

**Prueba realizada el 8/4/2026, 4:36:33 p.m.**

✅ Todas las herramientas funcionan correctamente:
- Lectura de archivos: OK
- Escritura de archivos: OK
- Búsqueda en archivos: OK
- Ejecución de comandos: OK
- Estadísticas de la app: OK
- Memoria persistente: OK

**Resultados:**
- Usuarios en sistema: 1 (error707mty)
- Pliegos: 1
- Uploads: 0

**Estructura detectada:**
- Monorepo pnpm en Railway
- Frontend: /app/artifacts/dtf-pliego
- Backend: /app/artifacts/api-server
- Base de datos: PostgreSQL en Railway

**Sistema listo para desarrollo autónomo.**

---
## Prueba de Flujo Railway
*Actualizado: 8/4/2026, 5:01:58 p.m.*

## Prueba de Flujo Railway Completa
*Realizada: 8/4/2026, 5:01:00 p.m.*

### ✅ Flujo Verificado:
1. **Lectura de archivos**: OK - Leído App.tsx y Home.tsx
2. **Modificación de frontend**: OK - Cambiado texto de carga en Home.tsx
3. **Hot reload**: OK - Frontend corriendo en localhost:3000
4. **Backend acceso**: OK - Leído index.ts del backend
5. **Estadísticas**: OK - 1 usuario, 1 pliego, 0 uploads
6. **Comandos shell**: OK - pwd, ls, curl funcionando
7. **Memoria persistente**: OK - Lectura y escritura funcionando

### 📁 Estructura Confirmada:
- **Frontend**: `/artifacts/dtf-pliego` (React + Vite)
- **Backend**: `/artifacts/api-server` (Node.js + Express)
- **Base de datos**: PostgreSQL en Railway funcionando

### 🔧 Herramientas Probadas:
- ✅ `list_files` - Directorios y estructura
- ✅ `read_file` - Contenido de archivos
- ✅ `search_replace` - Modificación de código
- ✅ `exec_shell` - Comandos del sistema
- ✅ `get_app_stats` - Estadísticas de DB
- ✅ `read_knowledge` - Memoria persistente
- ✅ `update_knowledge` - Actualización de memoria

### 🚀 Sistema Listo:
- Frontend: Hot reload activo
- Backend: Servidor corriendo
- Railway: Deployment automático configurado
- GitHub: Integración lista para push

**Conclusión**: Flujo de desarrollo autónomo completamente funcional en Railway.
