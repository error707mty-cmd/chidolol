# 🚀 Guía de Configuración de Yuki IDE

## ✅ Funcionalidades Implementadas

Yuki ahora tiene **TODAS las capacidades** de un agente autónomo como Claude/Emergent:

### 🔧 Herramientas Disponibles

1. **list_files** - Lista archivos de un directorio
2. **read_file** - Lee contenido de archivos
3. **write_file** - Crea o modifica archivos (con hot-reload automático)
4. **search_replace** - Busca y reemplaza texto en archivos
5. **exec_shell** - Ejecuta comandos de shell (npm install, git, etc.)
6. **screenshot** - Toma screenshots para verificar cambios visuales
7. **search_in_files** - Busca texto en todo el proyecto
8. **get_app_stats** - Estadísticas de la app (usuarios, pliegos, uploads)
9. **execute_sql** - Ejecuta consultas SQL en PostgreSQL
10. **read_knowledge** - Lee memoria persistente de Yuki
11. **update_knowledge** - Guarda información en la memoria
12. **install_package** - Instala paquetes npm automáticamente
13. **restart_backend** - Recompila el backend

---

## 📋 Configuración Inicial (Paso a Paso)

### 1️⃣ Configurar Proveedor de IA

1. Abre Yuki IDE (`/yuki`)
2. Click en el botón **Settings** (⚙️) en el header
3. Agrega tu API key de DeepSeek (o cualquier otro proveedor OpenAI-compatible)
   - DeepSeek: https://platform.deepseek.com
   - También puedes usar OpenAI, Anthropic, etc.

### 2️⃣ Configurar GitHub (Automático)

1. Click en el badge de **GitHub** en el header
2. Ingresa tu información:
   - **Repository URL**: `https://github.com/tu-usuario/tu-repo`
   - **Personal Access Token**: Genera uno en GitHub Settings → Developer Settings → Personal Access Tokens
     - Permisos necesarios: `repo` (full control)
3. Click en **Guardar**

**✨ MAGIA AUTOMÁTICA:**
Cuando guardes la configuración de GitHub, Yuki automáticamente:
- ✅ Clonará el repositorio en `/app/yuki-repos/[nombre-repo]`
- ✅ Instalará todas las dependencias (`pnpm install`)
- ✅ Iniciará el dev server en puerto 3001
- ✅ El preview estará listo en ~30 segundos

### 3️⃣ Usar Yuki

Una vez configurado, simplemente:

1. Escribe lo que quieres en el chat
2. Yuki usará sus herramientas automáticamente para:
   - Leer archivos del proyecto
   - Modificar código
   - Instalar dependencias
   - Verificar cambios con screenshots
   - Guardar todo en su memoria

**Ejemplo de comandos:**
- "Agrega un nuevo componente Button en React"
- "Instala axios y crea un servicio de API"
- "Cambia el color primary a azul en Tailwind"
- "Toma un screenshot de la página principal"
- "Muestra la estructura del proyecto"

---

## 🎯 Funcionalidades en Tiempo Real

### Hot Module Replacement (HMR)
- Cuando Yuki modifica archivos del frontend
- **Los cambios aparecen AUTOMÁTICAMENTE** en el preview (< 2 segundos)
- No necesitas refrescar manualmente

### Preview Panel
- Muestra tu aplicación en tiempo real
- Corre en puerto 3001
- Tabs: **Preview** (tu app) y **Terminal** (logs de Yuki)

### Dev Server
- Se inicia automáticamente al configurar GitHub
- Botones en el header:
  - ▶️ **Start**: Inicia el dev server
  - ⏹️ **Stop**: Detiene el dev server
  - 🔄 **Refresh**: Refresca el preview manualmente

---

## 🔐 Persistencia

### Conversaciones
- Todas tus conversaciones con Yuki se guardan automáticamente
- Al refrescar la página, recuperas tu historial
- Botón 🗑️ para limpiar el historial

### Memoria de Yuki
- Yuki guarda información importante en `yuki-brain.md`
- Recuerda decisiones, arquitectura, y preferencias del proyecto
- Usa `update_knowledge` para guardar notas importantes

---

## 💡 Tips para Mejores Resultados

1. **Sé específico**: "Agrega un botón rojo con hover effect" es mejor que "agrega un botón"
2. **Deja que Yuki trabaje**: Tiene tool-calling automático, no necesitas decirle qué herramientas usar
3. **Verifica visualmente**: Pídele screenshots para confirmar cambios UI
4. **Iteración rápida**: Si algo no se ve bien, solo dile "hazlo más grande" o "cambia el color"

---

## ⚠️ Limitaciones Actuales

- Solo puede trabajar en el repo clonado (no puede modificar el entorno de Yuki)
- Screenshots usan Playwright CLI (pueden tardar unos segundos)
- Dev server necesita puerto 3001 disponible
- Token de GitHub debe tener permisos `repo`

---

## 🆘 Troubleshooting

### "Preview no carga"
1. Verifica que el dev server esté corriendo (botón verde en header)
2. Espera 5-10 segundos después de iniciar
3. Check logs: `/tmp/yuki-dev.log`

### "Yuki no responde"
1. Verifica que configuraste un proveedor de IA con API key válida
2. Revisa que el token de GitHub sea correcto
3. Asegúrate de que el repo esté clonado

### "Cambios no se reflejan"
1. Verifica que el HMR esté funcionando (debería ser automático)
2. Intenta refrescar el preview manualmente (botón 🔄)
3. Reinicia el dev server (Stop → Start)

---

## 🎉 Listo!

Ahora tienes un asistente AI completamente autónomo que puede:
- ✅ Clonar y modificar repositorios
- ✅ Instalar dependencias automáticamente
- ✅ Hacer cambios en tiempo real
- ✅ Verificar cambios visualmente
- ✅ Recordar el contexto de tu proyecto
- ✅ Ejecutar comandos de terminal
- ✅ Consultar la base de datos

**Disfruta tu nuevo copiloto de desarrollo! 🚀**
