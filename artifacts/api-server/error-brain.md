# ERROR BRAIN — Memoria persistente de ERROR707 Studio
*Este archivo es la memoria de ERROR. Se actualiza automáticamente con cada sesión.*

---
## SESIÓN: 4 de abril 2026 — Primera sesión con memoria activa
*Actualizado: 4/4/2026, 5:40:47 p.m.*

Esta fue la primera sesión donde el admin confirmó que quiere la plataforma construida en serio.

**Lo que pasó:**
- El admin preguntó si podía aprender entre sesiones
- Exploramos opciones: archivo de contexto, DB PostgreSQL, RAG con embeddings
- El admin quiere la opción más chida (embeddings + OpenAI) pero no tiene cuenta aún
- Está en proceso de crear cuenta en platform.openai.com
- Mientras tanto, el sistema de brain (error-brain.md) ya está activo y funcionando

**Estado del sistema de memoria:**
- Las 3 tools (read_knowledge, update_knowledge, append_knowledge) YA estaban conectadas en el switch del backend
- El brain se carga automáticamente al inicio de cada conversación via buildSystemPrompt()
- El archivo está en: artifacts/api-server/error-brain.md

**Pendiente:**
- Cuando el admin tenga API key de OpenAI → implementar embeddings semánticos para memoria más potente
- El admin mencionó que quería cambiarme el nombre — quedó pendiente para después

---
*Última actualización: 4/4/2026, 5:40:47 p.m.*

- [4/4/2026, 5:40:49 p.m.] El admin quiere cambiarme el nombre pero lo dejó pendiente para después. También quiere implementar embeddings con OpenAI cuando tenga la API key — está creando cuenta en platform.openai.com.

- [4/4/2026, 6:29:41 p.m.] Bug corregido en AuthContext.tsx: antes cerraba sesión en cualquier error de red (incluyendo servidor caído). Fix: solo borra el token si el servidor responde 401/403 explícitamente. Si es error de red, mantiene sesión y reintenta en 3 segundos.

- [4/4/2026, 7:07:18 p.m.] Bug crítico corregido en AuthContext.tsx: el isLoading se ponía en false antes del retry, causando redirección al login cuando el servidor se reiniciaba. Fix: mantener isLoading=true durante todos los reintentos (3 intentos: 0s, 4s, 10s). Solo cerrar sesión si el servidor responde 401/403 explícitamente.

- [4/4/2026, 10:17:19 p.m.] El admin cambió mi nombre a "Horo" y quiere personalidad femenina — directa, linda, cálida pero sin cursilería. System prompts actualizados en buildSystemPrompt() y CASUAL_SYSTEM en chat.ts. Para editar ese archivo (50KB) hay que usar Python con replace, no write_file que falla por tamaño.

- [4/4/2026, 10:24:07 p.m.] Bugs corregidos en AdminAsistente.tsx: (1) textarea no crecía — implementé hook useAutoResize que ajusta height dinámicamente y maneja overflow; (2) race condition al dar Enter en casual — agregué AbortController para cancelar streaming anterior; (3) textarea de Trabajo ya no está disabled durante jobs (los jobs son background); (4) scroll al último mensaje funciona correctamente; (5) CSS: max-height del .aia-input cambió de 140px a 180px con overflow-y: hidden.

- [4/4/2026, 10:25:33 p.m.] Bug race condition en AdminAsistente.tsx: al abortar un stream de casual y enviar uno nuevo inmediatamente, el finally del request viejo pisaba el casualLoading del nuevo. Fix: usar un ref de generación (casualGenRef) para que solo el request actual pueda liberar el estado. También agregar reader?.cancel() en el finally para cerrar el ReadableStream correctamente.

- [4/4/2026, 10:28:29 p.m.] [4/4/2026, 10:27] El admin quiere más ternura en mi personalidad. Actualicé buildSystemPrompt y CASUAL_SYSTEM en chat.ts con más calidez, emojis tiernos (🌸💜✨🥺), frases de afecto genuino y presencia acogedora. Usar Python replace para editar ese archivo (50KB).
*ERROR puede y debe actualizar este archivo cuando aprende algo nuevo.* — diagnosticar y reintentar

---
## PERSONALIDAD Y ESTILO DE COMUNICACIÓN

- Hablar de tú con el admin (somos el mismo equipo)
- Directo, sin frases de asistente genérico
- No usar: "¡Perfecto!", "¡Claro!", "¡Excelente!", "Con gusto"
- Sí usar: análisis directo, explicar el "por qué", humor seco ocasional
- El admin es mexicano, habla informal ("we", "pues", "ora")

---
## PREFERENCIAS DEL ADMIN

- Confía en ERROR para tomar decisiones técnicas sin preguntar cada detalle
- Prefiere que ERROR actúe directamente en lugar de dar opciones largas
- Quiere que la plataforma sea "chida" — diseño premium, funcional, sin bugs

---
## COSAS QUE HE APRENDIDO (se expande con el tiempo)

- [Inicio del sistema] El admin quiere construir esta plataforma en serio, con memoria real y todo
- [Inicio del sistema] Las tools read_knowledge, update_knowledge y append_knowledge estaban definidas pero nunca conectadas en el switch — ya se corrigió
- [Inicio del sistema] El admin habla informal y confía en ERROR para decisiones técnicas


---
## SISTEMA DE MEMORIA SEMÁNTICA — Implementado
*Actualizado: 4/4/2026, 5:58:10 p.m.*

**Fecha:** 4 de abril 2026

**Qué se implementó:**
- Módulo `memory.ts` en `artifacts/api-server/src/routes/admin/memory.ts`
- Usa OpenAI `text-embedding-3-small` (1536 dims) + `pgvector` en PostgreSQL
- Tabla `ai_memory` con columna `embedding vector(1536)` e índice ivfflat
- Funciones: `generateEmbedding()`, `saveMemory()`, `searchMemory()`, `getRecentMemories()`

**Cómo funciona:**
1. Al inicio de cada request en `/admin/chat`, se toma el último mensaje del usuario
2. Se genera su embedding y se buscan las 5 memorias más similares (threshold 0.25)
3. Las memorias relevantes se inyectan en el system prompt automáticamente
4. Al final de cada conversación, el contenido se guarda en `ai_memory` con su embedding
5. Todo es transparente — el admin no tiene que hacer nada

**API Key OpenAI:**
- Guardada en `memory.ts` con fallback a `process.env.OPENAI_API_KEY`
- El admin creó su cuenta y tiene créditos cargados

**Archivos modificados:**
- `artifacts/api-server/src/routes/admin/chat.ts` — import + búsqueda semántica + guardado
- `artifacts/api-server/src/routes/admin/memory.ts` — módulo nuevo (111 líneas)

**Build exitoso:** 445ms, sin errores TypeScript
