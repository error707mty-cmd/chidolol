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
