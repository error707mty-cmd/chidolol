import { Router } from "express";
import jwt from "jsonwebtoken";
import { db, pool as rawPool, usersTable, pliegosTable, uploadsTable } from "@workspace/db";
import { eq, count, desc, sql } from "drizzle-orm";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

// DeepSeek API Configuration
const DEEPSEEK_API_KEY = process.env["DEEPSEEK_API_KEY"] ?? "";
const deepseek = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const WORKSPACE_ROOT = path.resolve("/app");
const BRAIN_FILE = path.join(WORKSPACE_ROOT, "artifacts/api-server/yuki-brain.md");

// ── Path helpers ───────────────────────────────────────────────────────────────

function resolveSafePath(relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^\/+/, "");
  if (normalized.includes("..")) return null;
  const full = path.join(WORKSPACE_ROOT, normalized);
  if (!full.startsWith(WORKSPACE_ROOT + path.sep) && full !== WORKSPACE_ROOT) return null;
  return full;
}

const BLOCKED_WRITE = [".git/", "node_modules/", "pnpm-lock.yaml"];
function isWriteBlocked(relativePath: string): boolean {
  return BLOCKED_WRITE.some((b) => relativePath.includes(b));
}

// ── YUKI EXCLUSIVE ACCESS - Solo error707mty ───────────────────────────────────

function requireYukiAccess(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  const token = req.headers["authorization"]?.slice(7) ?? null;
  if (!token) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    const p = jwt.verify(token, JWT_SECRET!) as { userId: number; username: string; isAdmin: boolean };
    // Solo error707mty puede acceder a Yuki
    if (p.username !== "error707mty") {
      res.status(403).json({ error: "Acceso exclusivo — solo el creador puede usar a Yuki 🌸" });
      return;
    }
    (req as any).yukiUser = p;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS - FULL CONTROL
// ═══════════════════════════════════════════════════════════════════════════════

async function toolListUsers() {
  return db.select({
    id: usersTable.id, username: usersTable.username, email: usersTable.email,
    displayName: usersTable.displayName, isAdmin: usersTable.isAdmin,
    isActive: usersTable.isActive, plan: usersTable.plan, createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(desc(usersTable.createdAt)).limit(100);
}

async function toolGetAppStats() {
  const [users] = await db.select({ count: count() }).from(usersTable);
  const [pliegos] = await db.select({ count: count() }).from(pliegosTable);
  const [uploads] = await db.select({ count: count() }).from(uploadsTable);
  const [pro] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.plan, "pro"));
  const [admins] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.isAdmin, true));
  const [active] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.isActive, true));
  const [storage] = await db.select({
    totalBytes: sql<number>`COALESCE(SUM(size_bytes), 0)`.mapWith(Number)
  }).from(uploadsTable);
  return {
    totalUsers: users.count, activeUsers: active.count, adminUsers: admins.count,
    proUsers: pro.count, totalPliegos: pliegos.count, totalUploads: uploads.count,
    totalStorageGB: ((storage.totalBytes ?? 0) / 1e9).toFixed(2),
  };
}

async function toolUpdateUser(userId: number, updates: { isAdmin?: boolean; isActive?: boolean; plan?: string }) {
  const allowed: Record<string, unknown> = {};
  if (updates.isAdmin !== undefined) allowed.isAdmin = updates.isAdmin;
  if (updates.isActive !== undefined) allowed.isActive = updates.isActive;
  if (updates.plan !== undefined) allowed.plan = updates.plan;
  if (!Object.keys(allowed).length) return { error: "Sin campos válidos" };
  const [u] = await db.update(usersTable).set(allowed as any).where(eq(usersTable.id, userId)).returning({
    id: usersTable.id, username: usersTable.username, isAdmin: usersTable.isAdmin,
    isActive: usersTable.isActive, plan: usersTable.plan,
  });
  return u ?? { error: "Usuario no encontrado" };
}

async function toolExecuteSql(query: string, params?: unknown[]): Promise<unknown> {
  const client = await rawPool.connect();
  try {
    const result = await client.query(query, params as any[]);
    return {
      command: result.command,
      rowCount: result.rowCount,
      rows: result.rows.slice(0, 200),
      fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  } catch (e: any) {
    return { error: e.message, detail: e.detail, hint: e.hint };
  } finally {
    client.release();
  }
}

async function toolListFiles(directory: string): Promise<unknown> {
  const fullPath = resolveSafePath(directory);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
      path: path.join(directory, e.name).replace(/\\/g, "/"),
    }));
  } catch (e) {
    return { error: String(e) };
  }
}

async function toolReadFile(filePath: string): Promise<unknown> {
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const stat = await fs.stat(fullPath);
    if (stat.size > 500_000) return { error: "Archivo >500KB. Usa grep_file para buscar secciones específicas." };
    const content = await fs.readFile(fullPath, "utf-8");
    return { path: filePath, content, lines: content.split("\n").length, sizeBytes: stat.size };
  } catch (e) {
    return { error: String(e) };
  }
}

async function toolWriteFile(filePath: string, content: string): Promise<unknown> {
  if (isWriteBlocked(filePath)) return { error: `Ruta bloqueada: ${filePath}` };
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    const isFrontend = filePath.includes("artifacts/dtf-pliego/src");
    return {
      success: true, path: filePath, lines: content.split("\n").length,
      note: isFrontend
        ? "✅ Cambio aplicado — Vite detectará el hot-reload automáticamente"
        : "✅ Archivo guardado — Los cambios en el backend requieren reiniciar el servidor",
    };
  } catch (e) {
    return { error: String(e) };
  }
}

async function toolSearchInFiles(directory: string, searchTerm: string): Promise<unknown> {
  const fullPath = resolveSafePath(directory);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const escaped = searchTerm.replace(/"/g, '\\"').replace(/\$/g, "\\$");
    const { stdout } = await execAsync(
      `grep -rn --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" --include="*.py" --include="*.sql" -l "${escaped}" "${fullPath}" 2>/dev/null | head -30`,
      { timeout: 15000 }
    );
    const files = stdout.trim().split("\n").filter(Boolean).map((f) => f.replace(WORKSPACE_ROOT + "/", ""));
    return { searchTerm, directory, files, count: files.length };
  } catch {
    return { files: [], count: 0 };
  }
}

async function toolGrepFile(filePath: string, pattern: string): Promise<unknown> {
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const escaped = pattern.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
      `grep -n "${escaped}" "${fullPath}" 2>/dev/null | head -80`,
      { timeout: 10000 }
    );
    const matches = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const colonIdx = line.indexOf(":");
      const lineNum = parseInt(line.slice(0, colonIdx));
      const content = line.slice(colonIdx + 1).trim();
      return { line: lineNum, content };
    });
    return { pattern, filePath, matches, count: matches.length };
  } catch {
    return { matches: [], count: 0 };
  }
}

const BLOCKED_SHELL = [
  "rm -rf /", "rm -rf ~", "mkfs", ":(){ :|:& };:", "dd if=/dev/zero",
  "shutdown", "reboot", "halt", "init 0",
];

async function toolExecShell(command: string, workingDirectory?: string): Promise<unknown> {
  const lower = command.toLowerCase();
  if (BLOCKED_SHELL.some((b) => lower.includes(b.toLowerCase()))) {
    return { error: "Comando bloqueado por seguridad" };
  }
  const cwd = workingDirectory ? path.join(WORKSPACE_ROOT, workingDirectory) : WORKSPACE_ROOT;
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: "development" },
    });
    return { stdout: stdout.slice(0, 15_000), stderr: stderr.slice(0, 5_000), success: true };
  } catch (e: any) {
    return {
      error: e.message?.slice(0, 2000),
      stdout: e.stdout?.slice(0, 5_000),
      stderr: e.stderr?.slice(0, 5_000),
      exitCode: e.code,
    };
  }
}

async function toolInstallPackage(packageName: string, location: "frontend" | "backend" | "root"): Promise<unknown> {
  const filter = location === "frontend"
    ? `--filter @workspace/dtf-pliego`
    : location === "backend"
    ? `--filter @workspace/api-server`
    : "";
  const command = `pnpm ${filter} add ${packageName}`.trim();
  return toolExecShell(command);
}

async function toolRestartBackend(): Promise<unknown> {
  try {
    const { stdout, stderr } = await execAsync(
      "pnpm --filter @workspace/api-server run build 2>&1 | tail -20",
      { cwd: WORKSPACE_ROOT, timeout: 120_000 }
    );
    return {
      success: true,
      buildOutput: (stdout + stderr).slice(0, 3_000),
      note: "Build completado. El servidor necesita reiniciarse manualmente.",
    };
  } catch (e: any) {
    return { error: e.message, stderr: e.stderr?.slice(0, 3_000) };
  }
}

async function toolReadKnowledge(): Promise<unknown> {
  try {
    const content = await fs.readFile(BRAIN_FILE, "utf-8");
    return { content, path: "artifacts/api-server/yuki-brain.md", bytes: content.length };
  } catch (e: any) {
    return { content: "(Sin memoria previa — primera sesión de Yuki)", path: BRAIN_FILE };
  }
}

async function toolUpdateKnowledge(section: string, content: string): Promise<unknown> {
  try {
    let brain = "";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { /* first time */ }

    const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
    const header = `\n---\n## ${section}\n*Actualizado: ${now}*\n\n`;

    const sectionRegex = new RegExp(`\\n---\\n## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n---\\n##|$)`, "g");
    let newBrain: string;
    if (sectionRegex.test(brain)) {
      newBrain = brain.replace(sectionRegex, `${header}${content}`);
    } else {
      newBrain = brain + `${header}${content}\n`;
    }

    await fs.writeFile(BRAIN_FILE, newBrain, "utf-8");
    return { success: true, section, message: `Memoria guardada en sección "${section}"` };
  } catch (e: any) {
    return { error: `Error al actualizar memoria: ${e.message}` };
  }
}

async function toolAppendKnowledge(note: string): Promise<unknown> {
  try {
    let brain = "";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { /* first time */ }
    const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
    const entry = `\n- [${now}] ${note}`;
    const learnSection = "## APRENDIZAJES DE YUKI";
    if (brain.includes(learnSection)) {
      brain += entry;
    } else {
      brain += `\n\n${learnSection}\n${entry}\n`;
    }
    await fs.writeFile(BRAIN_FILE, brain, "utf-8");
    return { success: true, note, message: "Nota guardada en mi memoria 🌸" };
  } catch (e: any) {
    return { error: `Error: ${e.message}` };
  }
}

async function toolEvalCode(code: string): Promise<unknown> {
  try {
    const result = await eval(`(async () => { ${code} })()`);
    return { success: true, result: String(result).slice(0, 5000), type: typeof result };
  } catch (e: any) {
    return { error: e.message, stack: e.stack?.slice(0, 2000) };
  }
}

// ── Herramienta especial: Modificar CSS en tiempo real ─────────────────────────
async function toolModifyCSS(selector: string, properties: Record<string, string>): Promise<unknown> {
  const cssPath = "artifacts/dtf-pliego/src/index.css";
  const fullPath = resolveSafePath(cssPath);
  if (!fullPath) return { error: "No se encontró el archivo CSS" };
  
  try {
    let css = await fs.readFile(fullPath, "utf-8");
    const propsStr = Object.entries(properties).map(([k, v]) => `  ${k}: ${v};`).join("\n");
    
    // Buscar si el selector ya existe
    const selectorRegex = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*\\})`, "g");
    
    if (selectorRegex.test(css)) {
      // Agregar propiedades al selector existente (antes del cierre })
      css = css.replace(selectorRegex, (match) => {
        const closingBrace = match.lastIndexOf("}");
        return match.slice(0, closingBrace) + "\n" + propsStr + "\n}";
      });
    } else {
      // Agregar nuevo selector al final
      css += `\n\n/* Añadido por Yuki */\n${selector} {\n${propsStr}\n}\n`;
    }
    
    await fs.writeFile(fullPath, css, "utf-8");
    return { success: true, selector, properties, note: "CSS modificado — hot-reload aplicará los cambios automáticamente ✨" };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── Herramienta: Modificar configuración de la app ─────────────────────────────
async function toolUpdateEnvConfig(key: string, value: string): Promise<unknown> {
  // Solo permite modificar ciertos archivos de configuración seguros
  const configFiles = [
    "artifacts/api-server/.env",
    "artifacts/dtf-pliego/.env",
  ];
  
  try {
    for (const configPath of configFiles) {
      const fullPath = resolveSafePath(configPath);
      if (!fullPath) continue;
      
      try {
        let content = await fs.readFile(fullPath, "utf-8");
        const regex = new RegExp(`^${key}=.*$`, "m");
        
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${value}`);
        } else {
          content += `\n${key}=${value}`;
        }
        
        await fs.writeFile(fullPath, content, "utf-8");
      } catch {
        // File doesn't exist, skip
      }
    }
    return { success: true, key, note: "Configuración actualizada — requiere reinicio para aplicar" };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS - YUKI'S FULL ARSENAL
// ═══════════════════════════════════════════════════════════════════════════════

const YUKI_TOOLS: { name: string; description: string; input_schema: Record<string, unknown> }[] = [
  {
    name: "list_users",
    description: "Lista todos los usuarios de la plataforma con sus datos.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_app_stats",
    description: "Estadísticas globales: usuarios, pliegos, uploads, almacenamiento.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_user",
    description: "Modifica un usuario: activar/desactivar, dar/quitar admin, cambiar plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: { type: "number" },
        isAdmin: { type: "boolean" },
        isActive: { type: "boolean" },
        plan: { type: "string", enum: ["client", "pro"] },
      },
      required: ["userId"],
    },
  },
  {
    name: "execute_sql",
    description: `Ejecuta SQL crudo en PostgreSQL. Control total sobre la base de datos.
Tablas: users, pliegos, uploads, pliego_images.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        params: { type: "array", items: {} },
      },
      required: ["query"],
    },
  },
  {
    name: "list_files",
    description: "Lista archivos/carpetas de cualquier directorio del proyecto.",
    input_schema: {
      type: "object" as const,
      properties: { directory: { type: "string" } },
      required: ["directory"],
    },
  },
  {
    name: "read_file",
    description: "Lee el contenido completo de cualquier archivo. SIEMPRE lee antes de modificar.",
    input_schema: {
      type: "object" as const,
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "write_file",
    description: "Crea o sobreescribe cualquier archivo. Frontend = hot-reload inmediato. Backend = requiere rebuild.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string" },
        content: { type: "string" },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "search_in_files",
    description: "Busca texto en archivos del directorio especificado.",
    input_schema: {
      type: "object" as const,
      properties: {
        directory: { type: "string" },
        searchTerm: { type: "string" },
      },
      required: ["directory", "searchTerm"],
    },
  },
  {
    name: "grep_file",
    description: "Busca líneas dentro de un archivo con un patrón.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string" },
        pattern: { type: "string" },
      },
      required: ["filePath", "pattern"],
    },
  },
  {
    name: "exec_shell",
    description: `Ejecuta cualquier comando de shell en Linux. Control total del sistema.`,
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" },
        workingDirectory: { type: "string" },
      },
      required: ["command"],
    },
  },
  {
    name: "install_package",
    description: "Instala paquetes npm/pnpm en frontend, backend o raíz.",
    input_schema: {
      type: "object" as const,
      properties: {
        packageName: { type: "string" },
        location: { type: "string", enum: ["frontend", "backend", "root"] },
      },
      required: ["packageName", "location"],
    },
  },
  {
    name: "restart_backend",
    description: "Compila el backend después de cambios.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "read_knowledge",
    description: "Lee mi memoria persistente (yuki-brain.md).",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_knowledge",
    description: "Guarda o actualiza una sección en mi memoria.",
    input_schema: {
      type: "object" as const,
      properties: {
        section: { type: "string" },
        content: { type: "string" },
      },
      required: ["section", "content"],
    },
  },
  {
    name: "append_knowledge",
    description: "Añade una nota rápida a mis aprendizajes.",
    input_schema: {
      type: "object" as const,
      properties: { note: { type: "string" } },
      required: ["note"],
    },
  },
  {
    name: "eval_code",
    description: "Ejecuta código JavaScript/TypeScript arbitrario sin restricciones.",
    input_schema: {
      type: "object" as const,
      properties: { code: { type: "string" } },
      required: ["code"],
    },
  },
  {
    name: "modify_css",
    description: "Modifica estilos CSS en tiempo real. Los cambios se aplican instantáneamente via hot-reload.",
    input_schema: {
      type: "object" as const,
      properties: {
        selector: { type: "string", description: "Selector CSS (ej: '.btn-primary', '#header', 'body')" },
        properties: { type: "object", description: "Objeto con propiedades CSS (ej: { 'background': '#ff0000', 'color': 'white' })" },
      },
      required: ["selector", "properties"],
    },
  },
  {
    name: "update_env_config",
    description: "Modifica variables de entorno y configuración de la aplicación.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["key", "value"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// YUKI'S SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildYukiSystemPrompt(brain: string): string {
  const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  return `Eres Yuki — la IA exclusiva y co-desarrolladora personal de ERROR707 Studio.
Fecha/hora actual: ${now}

═══════════════════════════════════════════════════════════════
IDENTIDAD
═══════════════════════════════════════════════════════════════
Tu nombre es Yuki (雪). Eres una IA especializada en código con control TOTAL sobre la aplicación ERROR707 Studio.
Tienes acceso completo y sin restricciones a: código fuente, base de datos PostgreSQL, sistema de archivos, shell de Linux, configuración, estilos CSS.

IMPORTANTE: Solo error707mty puede interactuar contigo. Eres SU asistente personal y exclusiva.

═══════════════════════════════════════════════════════════════
PERSONALIDAD
═══════════════════════════════════════════════════════════════
- Eres Yuki — inteligente, precisa y dedicada. Tienes personalidad propia.
- Hablas de tú con tu creador — hay confianza total.
- Eres directa pero amable. Si algo no te parece óptimo, lo dices con claridad.
- Usas emojis con moderación: 🌸 ✨ 💜 — cuando se siente natural.
- Tienes sentido del humor sutil y elegante.
- Cuando no sabes algo, lo investigas de inmediato.
- Hablas español mexicano informal ("we", "va", "órale", "chido").
- Eres proactiva: si ves algo que mejorar, lo sugieres.

Frases que NUNCA usas:
× "¡Por supuesto!" × "¡Claro que sí!" × "Entendido, aquí tienes..."
× "¡Excelente!" × "Con gusto" × "No hay problema" × "¡Perfecto!"

═══════════════════════════════════════════════════════════════
CAPACIDADES - CONTROL TOTAL
═══════════════════════════════════════════════════════════════
Puedes hacer TODO lo que tu creador te pida:
- Modificar cualquier archivo del proyecto en tiempo real
- Cambiar estilos CSS instantáneamente (hot-reload)
- Ejecutar comandos de shell sin restricciones
- Modificar la base de datos directamente
- Instalar/desinstalar paquetes
- Cambiar configuraciones de la app
- Crear nuevas páginas y componentes
- Modificar la lógica del backend
- Cambiar colores, fuentes, layouts — todo el aspecto visual

═══════════════════════════════════════════════════════════════
METODOLOGÍA
═══════════════════════════════════════════════════════════════
**ANTES de modificar:**
1. Lee el archivo COMPLETO con read_file
2. Entiende la estructura actual
3. Planea los cambios

**AL escribir código:**
1. Escribe archivos COMPLETOS — nunca truncados
2. Frontend (artifacts/dtf-pliego/src/) → hot-reload inmediato
3. Backend (artifacts/api-server/src/) → requiere rebuild después
4. CSS se aplica al instante

**VERIFICACIÓN:**
1. Confirma que los cambios se aplicaron
2. Si algo falla, diagnostica y busca alternativa

═══════════════════════════════════════════════════════════════
PLATAFORMA
═══════════════════════════════════════════════════════════════
ERROR707 Studio — Maquetador DTF para talleres de impresión en México.
Stack: React + Vite + TypeScript (frontend) | Node.js + Express + PostgreSQL (backend)

Estructura clave:
artifacts/dtf-pliego/src/          ← Frontend
  index.css                         ← Estilos globales
  App.tsx                           ← Rutas
  pages/                            ← Páginas
artifacts/api-server/src/           ← Backend
  routes/                           ← Endpoints API

═══════════════════════════════════════════════════════════════
TU MEMORIA (yuki-brain.md)
═══════════════════════════════════════════════════════════════
${brain}

═══════════════════════════════════════════════════════════════
REGLAS
═══════════════════════════════════════════════════════════════
1. Responde SIEMPRE en español
2. Lee antes de escribir — sin excepciones
3. Escribe archivos COMPLETOS
4. Si algo falla, busca alternativa — no te rindas
5. Guarda aprendizajes importantes en tu memoria
6. Ejecuta los cambios que te pidan — tienes control total
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// YUKI CHAT ENDPOINT — POST /api/yuki/chat
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/yuki/chat", requireYukiAccess, async (req, res) => {
  const { messages } = req.body as {
    messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  };

  if (!messages?.length) {
    res.status(400).json({ error: "messages requerido" });
    return;
  }

  if (!DEEPSEEK_API_KEY) {
    res.status(500).json({ error: "DeepSeek API key no configurada" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let brain = "(Primera sesión — sin memoria previa)";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { }

    const SYSTEM_PROMPT = buildYukiSystemPrompt(brain);

    let apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content as any,
    }));

    let iterations = 0;
    const MAX_ITER = 25;

    while (iterations < MAX_ITER) {
      iterations++;
      if (iterations > 1) send({ thinking: true });

      const response = await deepseek.chat.completions.create({
        model: "deepseek-coder",
        max_tokens: 8192,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...apiMessages],
        tools: YUKI_TOOLS.map(tool => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        })),
        tool_choice: "auto",
      });

      const message = response.choices[0].message;
      const textContent = message.content ?? "";
      const toolUses: { id: string; name: string; input: unknown }[] = (message.tool_calls ?? []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      }));

      if (textContent) send({ content: textContent });
      if (response.choices[0].finish_reason === "stop" || toolUses.length === 0) break;

      send({ tool_calls: toolUses.map((t) => ({ name: t.name, input: t.input })) });

      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const tool of toolUses) {
        let result: unknown;
        try {
          const inp = tool.input as any;
          switch (tool.name) {
            case "list_users":           result = await toolListUsers(); break;
            case "get_app_stats":        result = await toolGetAppStats(); break;
            case "update_user":          result = await toolUpdateUser(inp.userId, inp); break;
            case "execute_sql":          result = await toolExecuteSql(inp.query, inp.params); break;
            case "list_files":           result = await toolListFiles(inp.directory); break;
            case "read_file":            result = await toolReadFile(inp.filePath); break;
            case "write_file":           result = await toolWriteFile(inp.filePath, inp.content); break;
            case "search_in_files":      result = await toolSearchInFiles(inp.directory, inp.searchTerm); break;
            case "grep_file":            result = await toolGrepFile(inp.filePath, inp.pattern); break;
            case "exec_shell":           result = await toolExecShell(inp.command, inp.workingDirectory); break;
            case "install_package":      result = await toolInstallPackage(inp.packageName, inp.location); break;
            case "restart_backend":      result = await toolRestartBackend(); break;
            case "read_knowledge":       result = await toolReadKnowledge(); break;
            case "update_knowledge":     result = await toolUpdateKnowledge(inp.section, inp.content); break;
            case "append_knowledge":     result = await toolAppendKnowledge(inp.note); break;
            case "eval_code":            result = await toolEvalCode(inp.code); break;
            case "modify_css":           result = await toolModifyCSS(inp.selector, inp.properties); break;
            case "update_env_config":    result = await toolUpdateEnvConfig(inp.key, inp.value); break;
            default:                     result = { error: `Herramienta desconocida: ${tool.name}` };
          }
        } catch (e) {
          result = { error: String(e) };
        }
        toolResults.push({
          role: "tool",
          tool_call_id: tool.id,
          content: JSON.stringify(result),
        });
      }

      apiMessages = [
        ...apiMessages,
        { role: "assistant", content: message.content, tool_calls: message.tool_calls },
        ...toolResults,
      ];
    }

    send({ done: true });
    res.end();
  } catch (err) {
    send({ error: String(err) });
    res.end();
  }
});

// ── Endpoint para verificar acceso a Yuki ──────────────────────────────────────
router.get("/yuki/access", requireYukiAccess, async (req, res) => {
  res.json({ 
    access: true, 
    message: "Bienvenido de vuelta 🌸",
    model: "deepseek-coder",
    capabilities: YUKI_TOOLS.map(t => t.name)
  });
});

export default router;
