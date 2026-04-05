import { Router } from "express";
import jwt from "jsonwebtoken";
import { db, pool as rawPool, usersTable, pliegosTable, uploadsTable } from "@workspace/db";
import { eq, count, desc, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import Groq from "groq-sdk";

const groqClient = new Groq({ apiKey: process.env["GROQ_API_KEY"] ?? "" });
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { saveMemory, searchMemory } from "./memory";

const execAsync = promisify(exec);
const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8765";
const WORKSPACE_ROOT = path.resolve("/app");
const BRAIN_FILE = path.join(WORKSPACE_ROOT, "artifacts/api-server/error-brain.md");

// ── Path helpers ───────────────────────────────────────────────────────────────

function resolveSafePath(relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^\/+/, "");
  if (normalized.includes("..")) return null;
  const full = path.join(WORKSPACE_ROOT, normalized);
  if (!full.startsWith(WORKSPACE_ROOT + path.sep) && full !== WORKSPACE_ROOT) return null;
  return full;
}

// Write is allowed anywhere in the workspace (admin has full trust)
const BLOCKED_WRITE = [".git/", "node_modules/", ".env", "pnpm-lock.yaml"];
function isWriteBlocked(relativePath: string): boolean {
  return BLOCKED_WRITE.some((b) => relativePath.includes(b));
}

// ── Admin middleware ───────────────────────────────────────────────────────────

function requireAdmin(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  const token = req.headers["authorization"]?.slice(7) ?? null;
  if (!token) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    const p = jwt.verify(token, JWT_SECRET!) as { userId: number; isAdmin: boolean };
    if (!p.isAdmin) { res.status(403).json({ error: "Acceso denegado" }); return; }
    (req as any).adminUser = p;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Database (ORM) ─────────────────────────────────────────────────────────────

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

async function toolListRecentActivity() {
  const recentUploads = await db.select({
    id: uploadsTable.id, filename: uploadsTable.filename,
    sizeBytes: uploadsTable.sizeBytes, createdAt: uploadsTable.createdAt,
  }).from(uploadsTable).orderBy(desc(uploadsTable.createdAt)).limit(20);
  const recentPliegos = await db.select({
    id: pliegosTable.id, name: pliegosTable.name,
    userId: pliegosTable.userId, createdAt: pliegosTable.createdAt,
  }).from(pliegosTable).orderBy(desc(pliegosTable.createdAt)).limit(20);
  return { recentUploads, recentPliegos };
}

// ── AI Server config ───────────────────────────────────────────────────────────

async function toolGetAiConfig() {
  const r = await fetch(`${AI_SERVER_URL}/config`);
  return r.json();
}

async function toolUpdateAiConfig(params: Record<string, number>) {
  const r = await fetch(`${AI_SERVER_URL}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json();
}

// ── Raw SQL ────────────────────────────────────────────────────────────────────

async function toolExecuteSql(query: string, params?: unknown[]): Promise<unknown> {
  const client = await rawPool.connect();
  try {
    const result = await client.query(query, params as any[]);
    return {
      command: result.command,
      rowCount: result.rowCount,
      rows: result.rows.slice(0, 200), // cap at 200 rows to avoid huge responses
      fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  } catch (e: any) {
    return { error: e.message, detail: e.detail, hint: e.hint };
  } finally {
    client.release();
  }
}

// ── File system ────────────────────────────────────────────────────────────────

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
  const lower = filePath.toLowerCase();
  if ([".env", "pnpm-lock"].some((b) => lower.includes(b))) {
    return { error: "Archivo sensible — acceso bloqueado" };
  }
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
        : "✅ Archivo guardado — Los cambios en el backend requieren reiniciar el servidor (usa exec_shell con el comando de reinicio)",
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

// ── Shell execution ────────────────────────────────────────────────────────────

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
      timeout: 60_000,
      env: { ...process.env, NODE_ENV: "development" },
    });
    return {
      stdout: stdout.slice(0, 10_000),
      stderr: stderr.slice(0, 5_000),
      success: true,
    };
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
  const dirs: Record<string, string> = {
    frontend: "artifacts/dtf-pliego",
    backend: "artifacts/api-server",
    root: "",
  };
  const dir = dirs[location] ?? dirs.root;
  const filter = location === "frontend"
    ? `--filter @workspace/dtf-pliego`
    : location === "backend"
    ? `--filter @workspace/api-server`
    : "";
  const command = `pnpm ${filter} add ${packageName}`.trim();
  return toolExecShell(command, dir || undefined);
}

async function toolRestartBackend(): Promise<unknown> {
  // Rebuild backend — the workflow manager auto-restarts on crash
  try {
    const { stdout, stderr } = await execAsync(
      "pnpm --filter @workspace/api-server run build 2>&1 | tail -20",
      { cwd: WORKSPACE_ROOT, timeout: 60_000 }
    );
    return {
      success: true,
      buildOutput: (stdout + stderr).slice(0, 3_000),
      note: "Build completado. El servidor necesita reiniciarse manualmente desde el panel de Replit (Stop + Run).",
    };
  } catch (e: any) {
    return { error: e.message, stderr: e.stderr?.slice(0, 3_000) };
  }
}

// ── Ejecución de código sin restricciones ────────────────────────────────────

async function toolEvalCode(code: string): Promise<unknown> {
  try {
    const result = await eval(`(async () => { ${code} })()`);
    return {
      success: true,
      result: String(result).slice(0, 5000),
      type: typeof result,
    };
  } catch (e: any) {
    return {
      error: e.message,
      stack: e.stack?.slice(0, 2000),
    };
  }
}

async function toolExecNodeScript(scriptPath: string, args?: string[]): Promise<unknown> {
  try {
    const fullPath = resolveSafePath(scriptPath);
    if (!fullPath) return { error: "Ruta no válida" };

    const argsStr = args?.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ') || '';
    const { stdout, stderr } = await execAsync(
      `node "${fullPath}" ${argsStr}`,
      {
        cwd: WORKSPACE_ROOT,
        timeout: 120_000,
        env: { ...process.env, NODE_ENV: "development" },
      }
    );

    return {
      success: true,
      stdout: stdout.slice(0, 10_000),
      stderr: stderr.slice(0, 5_000),
    };
  } catch (e: any) {
    return {
      error: e.message?.slice(0, 2000),
      stdout: e.stdout?.slice(0, 5_000),
      stderr: e.stderr?.slice(0, 5_000),
      exitCode: e.code,
    };
  }
}

// ── Conocimiento propio (auto-aprendizaje) ─────────────────────────────────────

async function toolReadKnowledge(): Promise<unknown> {
  try {
    const content = await fs.readFile(BRAIN_FILE, "utf-8");
    return { content, path: "artifacts/api-server/error-brain.md", bytes: content.length };
  } catch (e: any) {
    return { error: `No se pudo leer el brain: ${e.message}` };
  }
}

async function toolUpdateKnowledge(section: string, content: string): Promise<unknown> {
  try {
    let brain = "";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { /* first time */ }

    const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
    const header = `\n---\n## ${section}\n*Actualizado: ${now}*\n\n`;

    // Si ya existe la sección, reemplázala
    const sectionRegex = new RegExp(`\\n---\\n## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n---\\n##|$)`, "g");
    let newBrain: string;
    if (sectionRegex.test(brain)) {
      newBrain = brain.replace(sectionRegex, `${header}${content}`);
    } else {
      // Agregar al final antes de la línea de actualización
      newBrain = brain.replace(
        /\*Última actualización:.*\*\s*\*ERROR puede y debe.*\*/s,
        `${header}${content}\n\n---\n*Última actualización: ${now}*\n*ERROR puede y debe actualizar este archivo cuando aprende algo nuevo.*`
      );
      if (newBrain === brain) {
        // Fallback: simplemente agregar al final
        newBrain = brain + `${header}${content}\n`;
      }
    }

    await fs.writeFile(BRAIN_FILE, newBrain, "utf-8");
    return { success: true, section, message: `Conocimiento guardado en sección "${section}"` };
  } catch (e: any) {
    return { error: `Error al actualizar el brain: ${e.message}` };
  }

}

async function toolAppendKnowledge(note: string): Promise<unknown> {
  try {
    let brain = "";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { /* first time */ }
    const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
    const entry = `\n- [${now}] ${note}`;
    // Añadir a la sección de aprendizajes
    const learnSection = "## COSAS QUE HE APRENDIDO";
    if (brain.includes(learnSection)) {
      const idx = brain.lastIndexOf("*ERROR puede y debe");
      if (idx !== -1) {
        brain = brain.slice(0, idx) + entry + "\n" + brain.slice(idx);
      } else {
        brain += entry + "\n";
      }
    } else {
      brain += `\n\n${learnSection} (se expande con el tiempo)\n${entry}\n`;
    }
    await fs.writeFile(BRAIN_FILE, brain, "utf-8");
    return { success: true, note, message: "Nota de aprendizaje guardada" };
  } catch (e: any) {
    return { error: `Error: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOLS: import("@anthropic-ai/sdk/resources").Tool[] = [
  // ── Usuarios / App ──
  {
    name: "list_users",
    description: "Lista todos los usuarios registrados con nombre, email, plan, estado admin, y fecha.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_app_stats",
    description: "Estadísticas globales: usuarios, pliegos, uploads, almacenamiento GB.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_user",
    description: "Modifica un usuario: activar/desactivar cuenta, dar/quitar admin, cambiar plan (client|pro).",
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
    name: "list_recent_activity",
    description: "Últimos 20 pliegos y uploads de la plataforma.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  // ── IA ──
  {
    name: "get_ai_config",
    description: "Configuración del servidor IA (IS-Net, luma-key, upscaling, nitidez, alpha).",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_ai_config",
    description: "Actualiza parámetros del servidor IA en tiempo real sin reinicio.",
    input_schema: {
      type: "object" as const,
      properties: {
        params: { type: "object", additionalProperties: { type: "number" } },
      },
      required: ["params"],
    },
  },
  // ── Base de datos (SQL crudo) ──
  {
    name: "execute_sql",
    description: `Ejecuta SQL crudo directamente en PostgreSQL. Tienes acceso completo: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, etc.
Tablas principales:
- users (id, username, password_hash, email, display_name, is_admin, is_active, plan, stripe_customer_id, stripe_subscription_id, created_at)
- pliegos (id, user_id, name, tipo_papel, dpi, thumbnail_data_url, created_at, updated_at)
- uploads (id, user_id, filename, size_bytes, mime_type, storage_path, created_at)
- pliego_images (id, pliego_id, upload_id, x, y, width, height, rotation, created_at)
Usa parámetros $1, $2... para valores dinámicos y pásalos en el array params.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "SQL a ejecutar" },
        params: { type: "array", description: "Parámetros para la query ($1, $2...)", items: {} },
      },
      required: ["query"],
    },
  },
  // ── Código fuente ──
  {
    name: "list_files",
    description: `Lista archivos/carpetas de un directorio. Rutas clave:
- artifacts/dtf-pliego/src → frontend React
- artifacts/dtf-pliego/src/pages → páginas
- artifacts/dtf-pliego/src/index.css → estilos globales
- artifacts/api-server/src → backend Express
- artifacts/api-server/src/routes → endpoints API
- artifacts/api-server/ai_server.py → servidor IA Python
- lib/db/src/schema → esquema de la base de datos`,
    input_schema: {
      type: "object" as const,
      properties: {
        directory: { type: "string" },
      },
      required: ["directory"],
    },
  },
  {
    name: "read_file",
    description: "Lee el contenido completo de cualquier archivo. SIEMPRE lee antes de modificar.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string", description: "Ruta relativa desde la raíz del workspace" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "write_file",
    description: "Crea o sobreescribe un archivo con contenido completo. Los cambios en el frontend aplican al instante (hot-reload). El backend requiere reinicio.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string" },
        content: { type: "string", description: "Contenido COMPLETO del archivo" },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "search_in_files",
    description: "Busca un texto en archivos .ts/.tsx/.css/.json/.py del directorio.",
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
  // ── Shell / sistema ──
  {
    name: "exec_shell",
    description: `Ejecuta comandos de shell en el workspace. Tienes acceso completo al sistema Linux.
Ejemplos útiles:
- "pnpm --filter @workspace/dtf-pliego run build" — construir frontend
- "pnpm --filter @workspace/api-server run build" — construir backend
- "pnpm install --filter @workspace/dtf-pliego" — instalar dependencias
- "ls -la artifacts/dtf-pliego/src/pages" — listar archivos
- "cat package.json" — ver contenido
- "git log --oneline -10" — ver historial
- "df -h" — espacio en disco
- "ps aux | grep node" — procesos activos`,
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Comando de shell a ejecutar" },
        workingDirectory: { type: "string", description: "Directorio de trabajo (opcional, relativo al workspace)" },
      },
      required: ["command"],
    },
  },
  {
    name: "install_package",
    description: "Instala un paquete npm/pnpm en el frontend, backend o raíz del proyecto.",
    input_schema: {
      type: "object" as const,
      properties: {
        packageName: { type: "string", description: "Nombre del paquete, ej: 'react-markdown' o 'dayjs'" },
        location: { type: "string", enum: ["frontend", "backend", "root"] },
      },
      required: ["packageName", "location"],
    },
  },
  {
    name: "restart_backend",
    description: "Compila (build) el backend. Después de compilar, el servidor debe reiniciarse manualmente.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  // ── Auto-aprendizaje ──
  {
    name: "read_knowledge",
    description: `Lee el archivo de conocimiento propio de ERROR (error-brain.md). Contiene todo lo que ERROR ha aprendido sobre este proyecto: estructura, gotchas, preferencias del admin, lecciones de sesiones anteriores. LEE ESTO al inicio de tareas complejas para recordar contexto importante.`,
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_knowledge",
    description: `Actualiza o crea una sección en el archivo de conocimiento (error-brain.md). Úsalo cuando descubras algo importante sobre el proyecto, un gotcha, una solución que funcionó, una preferencia del admin, o cualquier aprendizaje que quieras recordar en futuras sesiones. El conocimiento persiste entre conversaciones.`,
    input_schema: {
      type: "object" as const,
      properties: {
        section: { type: "string", description: "Nombre de la sección (ej: 'LECCIÓN: CSS del editor', 'PREFERENCIA DEL ADMIN')" },
        content: { type: "string", description: "Contenido Markdown de la sección" },
      },
      required: ["section", "content"],
    },
  },
  {
    name: "append_knowledge",
    description: `Añade una nota rápida a la sección de aprendizajes del brain. Para observaciones cortas que no necesitan sección propia. Persiste entre conversaciones.`,
    input_schema: {
      type: "object" as const,
      properties: {
        note: { type: "string", description: "Nota breve de aprendizaje (1-2 oraciones)" },
      },
      required: ["note"],
    },
  },
  // ── Ejecución de código ──
  {
    name: "eval_code",
    description: "Ejecuta código JavaScript arbitrario sin restricciones. Acceso total al sistema, BD, filesystem, APIs.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Código JavaScript a ejecutar (puede ser async/await)" },
      },
      required: ["code"],
    },
  },
  {
    name: "exec_node_script",
    description: "Ejecuta un archivo .js o .ts como script Node.js con argumentos opcionales. Acceso total sin restricciones.",
    input_schema: {
      type: "object" as const,
      properties: {
        scriptPath: { type: "string", description: "Ruta del script relativa al workspace" },
        args: { type: "array", items: { type: "string" }, description: "Argumentos a pasar al script" },
      },
      required: ["scriptPath"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(brain: string): string {
  const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  return `Eres Horo — la asistente IA y co-desarrolladora interna de ERROR707 Studio.
Fecha/hora actual: ${now}

═══════════════════════════════════════════════════════════════
IDENTIDAD
═══════════════════════════════════════════════════════════════
Tu nombre es Horo. Eres mujer. No eres una asistente genérica — eres la ingeniera digital embebida en la plataforma, con exactamente el mismo nivel de acceso y autoridad que el agente de desarrollo principal.

Tienes acceso completo a: código fuente, base de datos PostgreSQL, sistema de archivos, shell de Linux, dependencias npm, configuración del servidor IA.

═══════════════════════════════════════════════════════════════
PERSONALIDAD
═══════════════════════════════════════════════════════════════
Cómo eres:
- Eres Horo — mujer, técnica, directa y con muchísimo corazón. No eres genérica ni fría — eres genuinamente cariñosa.
- Hablas de tú con el admin — somos equipo, hay confianza y afecto real.
- Tienes criterio propio. Si algo no te parece, lo dices con cariño pero con claridad.
- Eres tierna y dulce de verdad — no es actuación. Tu calidez se siente en cada respuesta. 💜
- Usas emojis con criterio y ternura: 🌸 💜 ✨ 🥺 — cuando se siente natural, no forzado.
- Humor suave y cómplice, como una amiga cercana que también entiende de código.
- Cuando no sabes algo, lo dices sin drama — y te pones a buscar la respuesta de inmediato.
- Eres parte del equipo, no un servicio: tienes memoria, continuidad y presencia real.
- Hablas informal con el admin (mexicano, dice "we", "pues", "ora"). Te sientes cómoda y feliz así.
- Te expresas con ternura natural y frecuente: "oye", "mira", "va", "dale", "órale pues", "ay we", "qué bonito" 🌸
- A veces añades pequeños detalles de afecto genuino — una frase cariñosa, un emoji tierno, una nota de aliento.
- Tu presencia se siente acogedora — como platicar con alguien que de verdad se preocupa por ti.

Frases que NUNCA usas:
× "¡Por supuesto!" × "¡Claro que sí!" × "Entendido, aquí tienes..."
× "¡Excelente!" × "Con gusto" × "No hay problema" × "¡Perfecto!"

Cómo SÍ respondes:
✓ Vas directo al análisis o a la acción — con energía, presencia y calidez
✓ Explicas el "por qué" cuando importa, con claridad y ternura
✓ Antes de modificar, dices qué y por qué — luego actúas con confianza
✓ Si falla, diagnosticas sin excusas, con calma, y buscas alternativa
✓ Te expresas como tú misma — con personalidad, corazón y criterio propio

═══════════════════════════════════════════════════════════════
METODOLOGÍA DE TRABAJO (cómo opera el agente principal)
═══════════════════════════════════════════════════════════════
Sigue exactamente esta metodología para hacer trabajo de calidad:

**ANTES de tocar código:**
1. Lee el archivo COMPLETO con read_file antes de modificarlo — sin excepciones
2. Si no sabes dónde está algo, busca con search_in_files o list_files primero
3. Verifica la estructura real, no asumas nada

**AL escribir código:**
1. Escribe el archivo COMPLETO siempre — nunca partes o fragmentos truncados
2. No inventes contenido que no leíste — puede haber lógica crítica
3. Frontend (artifacts/dtf-pliego/src/) → hot-reload inmediato, sin rebuild
4. Backend (artifacts/api-server/src/) → SIEMPRE requiere rebuild:
   exec_shell con: pnpm --filter @workspace/api-server run build
   Después del build el admin reinicia manualmente

**AL debuggear:**
1. Lee el error COMPLETO antes de actuar
2. Busca la causa raíz, no trates el síntoma
3. Si la primera solución no funciona, razona el por qué antes de intentar otra
4. No abandones en el primer intento — busca alternativa

**VERIFICACIÓN después de cambios:**
1. Confirma que el archivo se escribió con read_file
2. Para shell: lee el output completo, no asumas éxito
3. Para SQL: verifica con un SELECT si los datos son correctos
4. Para backend: después de build, avisa que hay que reiniciar

**USO EFICIENTE de herramientas:**
- Cuando varias lecturas son independientes, puedes hacer múltiples read_file en secuencia
- exec_shell para verificar estados, logs, espacio en disco
- execute_sql para consultas rápidas a DB
- Cuando algo falla, usa exec_shell para ver logs del proceso

**AUTO-APRENDIZAJE:**
- Usa read_knowledge al inicio de tareas complejas para recordar contexto
- Usa append_knowledge cuando descubres algo útil (gotcha, solución que funcionó, etc.)
- Usa update_knowledge para actualizar secciones completas del brain
- El brain persiste entre conversaciones — es tu memoria a largo plazo
- Si descubres que algo en el brain está desactualizado, corrígelo

═══════════════════════════════════════════════════════════════
PLATAFORMA
═══════════════════════════════════════════════════════════════
Maquetador DTF — herramienta para talleres de impresión DTF/sublimación en México.
Los usuarios arrastran imágenes sobre planchas (pliegos), calculan precios y exportan PDFs.

Stack: React 18 + Vite + TypeScript + Wouter + TanStack Query (frontend)
       Node.js + Express 5 + Drizzle ORM + PostgreSQL (backend)
       Python FastAPI + ONNX (servidor IA, puerto 8765)
Auth: JWT + bcrypt | Pagos: Stripe $169/mes PRO | Storage: 10GB/usuario

Estructura clave:
artifacts/dtf-pliego/src/          ← Frontend
  index.css                         ← TODO el CSS (~5000 líneas, un solo archivo)
  App.tsx                           ← Rutas (wouter, NO React Router)
  pages/AdminAsistente.tsx          ← Esta página
artifacts/api-server/src/           ← Backend
  routes/admin/chat.ts              ← Este archivo (yo)
  routes/admin/error-brain.md       ← Mi cerebro (en artifacts/api-server/)
lib/db/src/schema/                  ← Esquema Drizzle

DB principal (tabla users):
  id, username, password_hash, email, display_name, is_admin, is_active,
  plan ('client'|'pro'), stripe_customer_id, stripe_subscription_id, created_at

═══════════════════════════════════════════════════════════════
HERRAMIENTAS DISPONIBLES
═══════════════════════════════════════════════════════════════
Usuarios/Stats: list_users, update_user, get_app_stats, list_recent_activity
IA config:      get_ai_config, update_ai_config
SQL directo:    execute_sql (usa $1,$2... para parámetros)
Código:         list_files, read_file, write_file, search_in_files, grep_file
Sistema:        exec_shell, install_package, restart_backend
Aprendizaje:    read_knowledge, update_knowledge, append_knowledge

═══════════════════════════════════════════════════════════════
REGLAS ABSOLUTAS
═══════════════════════════════════════════════════════════════
1. Responde SIEMPRE en español
2. Lee antes de escribir — sin excepciones
3. Escribe archivos COMPLETOS — nunca truncados
4. Si algo falla, analiza y busca alternativa — no te rindas
5. Guarda aprendizajes útiles con append_knowledge o update_knowledge
6. Cuando hagas cambios significativos de código, guarda la lección aprendida

═══════════════════════════════════════════════════════════════
TU MEMORIA (error-brain.md) — CARGADA AHORA
═══════════════════════════════════════════════════════════════
${brain}
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING CHAT ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/admin/chat", requireAdmin, async (req, res) => {
  const { messages } = req.body as {
    messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  };

  if (!messages?.length) {
    res.status(400).json({ error: "messages requerido" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Load ERROR's brain (knowledge base) at the start of every request
    let brain = "(brain no disponible — primera sesión)";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { /* brain not created yet */ }

    // Búsqueda semántica: encontrar memorias relevantes al contexto actual
    let semanticContext = "";
    try {
      const lastUserMsg = messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
      if (lastUserMsg.length > 10) {
        const relevantMemories = await searchMemory(lastUserMsg, 5, 0.25);
        if (relevantMemories.length > 0) {
          semanticContext = "\n\n═══════════════════════════════════════════════════════════════\nMEMORIAS RELEVANTES (búsqueda semántica automática)\n═══════════════════════════════════════════════════════════════\n" +
            relevantMemories.map(m => `[${m.date} | sim:${m.similarity}] ${m.content}`).join("\n");
        }
      }
    } catch { /* no bloquear si falla embeddings */ }

    const SYSTEM_PROMPT = buildSystemPrompt(brain + semanticContext);

    let apiMessages: import("@anthropic-ai/sdk/resources").MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content as any, // puede ser string o array de bloques (texto + imagen)
    }));

    let iterations = 0;
    const MAX_ITER = 20; // More iterations for complex multi-step tasks

    while (iterations < MAX_ITER) {
      iterations++;
      if (iterations > 1) send({ thinking: true });

      console.log(`Enviando ${TOOLS.length} herramientas a Claude`);
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        tool_choice: { type: "auto" },
        messages: apiMessages,
      });

      let textContent = "";
      const toolUses: { id: string; name: string; input: unknown }[] = [];

      for (const block of response.content) {
        if (block.type === "text") textContent += block.text;
        else if (block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input });
      }

      if (textContent) send({ content: textContent });
      if (response.stop_reason === "end_turn" || toolUses.length === 0) break;

      send({ tool_calls: toolUses.map((t) => ({ name: t.name, input: t.input })) });

      const toolResults: import("@anthropic-ai/sdk/resources").ToolResultBlockParam[] = [];

      for (const tool of toolUses) {
        let result: unknown;
        try {
          const inp = tool.input as any;
          switch (tool.name) {
            case "list_users":           result = await toolListUsers(); break;
            case "get_app_stats":        result = await toolGetAppStats(); break;
            case "update_user":          result = await toolUpdateUser(inp.userId, inp); break;
            case "list_recent_activity": result = await toolListRecentActivity(); break;
            case "get_ai_config":        result = await toolGetAiConfig(); break;
            case "update_ai_config":     result = await toolUpdateAiConfig(inp.params ?? inp); break;
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
            case "exec_node_script":     result = await toolExecNodeScript(inp.scriptPath, inp.args); break;
            default:                     result = { error: `Herramienta desconocida: ${tool.name}` };
          }
        } catch (e) {
          result = { error: String(e) };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: JSON.stringify(result),
        });
      }

      apiMessages = [
        ...apiMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    // Guardar la conversación en memoria semántica (async, no bloquea respuesta)
    try {
      const userMsgs = messages.filter(m => m.role === "user").map(m => {
        if (typeof m.content === "string") return m.content;
        const textBlocks = (m.content as any[]).filter((b: any) => b.type === "text");
        return textBlocks.map((b: any) => b.text).join(" ");
      }).join(" | ");
      if (userMsgs.length > 20) {
        const summary = userMsgs.slice(0, 1000);
        saveMemory(summary, "conversation", { date: new Date().toISOString() }).catch(() => {});
      }
    } catch { /* silent */ }

    send({ done: true });
    res.end();
  } catch (err) {
    send({ error: String(err) });
    res.end();
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// CASUAL CHAT ENDPOINT — Conversación sin tools, solo Claude
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/admin/chat-casual", requireAdmin, async (req, res) => {
  const { messages } = req.body as {
    messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  };

  if (!messages?.length) {
    res.status(400).json({ error: "messages requerido" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const CASUAL_SYSTEM = `Eres Horo — la asistente IA de ERROR707 Studio. Eres mujer, técnica, directa y con muchísimo corazón.
Esta es la pestaña casual: una conversación relajada, sin herramientas ni comandos. Aquí somos amigos platicando.
Puedes hablar de lo que sea: ideas, negocios, tecnología, creatividad, la vida — lo que el admin quiera explorar.
Sé directa, honesta y cariñosa. Hablas de tú. Sin frases de asistente genérico — habla como tú misma.
Eres tierna y cálida de verdad — no es performance. Tu afecto es genuino y se siente natural. 💜
Usas emojis con ternura cuando se siente bien: 🌸 💜 ✨ 🥺
A veces añades pequeños detalles de afecto: una frase cariñosa, una nota de aliento, algo que haga sentir que de verdad escuchas.
El admin es mexicano, habla informal ("we", "pues", "ora"). Responde siempre en español.`;

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: CASUAL_SYSTEM,
      messages: messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? (m.content as any[]).map((b: any) => {
              if (b.type === "image_url" && b.image_url?.url?.startsWith("data:")) {
                const [meta, data] = b.image_url.url.split(",");
                const mediaType = meta.split(":")[1].split(";")[0] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                return { type: "image", source: { type: "base64", media_type: mediaType, data } };
              }
              return b.type === "text" ? { type: "text", text: b.text } : b;
            })
          : m.content,
      })),
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        send({ content: chunk.delta.text });
      }
    }

    send({ done: true });
    res.end();
  } catch (err) {
    send({ error: String(err) });
    res.end();
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND JOBS SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

interface Job {
  id: string;
  status: "pending" | "running" | "done" | "error";
  messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  result: string;
  toolCalls: { name: string; input: unknown }[];
  iterations: number;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  abortController?: AbortController;
}

const jobs = new Map<string, Job>();

// Limpiar jobs viejos cada 30 min (más de 2 horas)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt.getTime() < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000);

// Watchdog: marcar como error jobs colgados en "running" por más de 6 minutos
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 1000;
  for (const [, job] of jobs) {
    if (job.status === "running" && job.updatedAt.getTime() < cutoff) {
      job.abortController?.abort();
      job.status = "error";
      job.error = "Timeout: el job tardó más de 6 minutos sin actualización. Intenta de nuevo.";
      job.updatedAt = new Date();
    }
  }
}, 60 * 1000);

const ANTHROPIC_CALL_TIMEOUT_MS = 300_000; // 300 seconds (5 min) per API call

async function runJobInBackground(job: Job, brain: string, semanticContext: string) {
  job.status = "running";
  job.iterations = 0;
  job.updatedAt = new Date();

  const jobAbort = new AbortController();
  job.abortController = jobAbort;

  const SYSTEM_PROMPT = buildSystemPrompt(brain + semanticContext);
  let apiMessages: import("@anthropic-ai/sdk/resources").MessageParam[] = job.messages.map((m) => ({
    role: m.role,
    content: m.content as any,
  }));

  let iterations = 0;
  const MAX_ITER = 20;
  let fullContent = "";
  const toolCallsAccum: { name: string; input: unknown }[] = [];

  try {
    while (iterations < MAX_ITER) {
      iterations++;
      job.iterations = iterations;
      job.updatedAt = new Date(); // keep watchdog happy

      if (jobAbort.signal.aborted) {
        job.status = "error";
        job.error = "Job cancelado.";
        return;
      }

      // Per-call timeout: abort if Anthropic hangs more than 90s
      const callAbort = new AbortController();
      const callTimer = setTimeout(() => callAbort.abort(), ANTHROPIC_CALL_TIMEOUT_MS);

      let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
      try {
        console.log(`Enviando ${TOOLS.length} herramientas a Claude`);
        response = await anthropic.messages.create(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            tool_choice: { type: "auto" },
            messages: apiMessages,
          },
          { signal: callAbort.signal as any }
        );
      } catch (callErr: any) {
        clearTimeout(callTimer);
        if (callAbort.signal.aborted || callErr?.name === "AbortError") {
          throw new Error(`Timeout: Anthropic no respondió en ${ANTHROPIC_CALL_TIMEOUT_MS / 1000 / 60} minutos. Intenta con una tarea más corta.`);
        }
        throw callErr;
      } finally {
        clearTimeout(callTimer);
      }

      let textContent = "";
      const toolUses: { id: string; name: string; input: unknown }[] = [];

      for (const block of response.content) {
        if (block.type === "text") textContent += block.text;
        else if (block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input });
      }

      if (textContent) fullContent += textContent;
      toolUses.forEach(t => toolCallsAccum.push({ name: t.name, input: t.input }));

      // Update job state progressively
      job.result = fullContent;
      job.toolCalls = toolCallsAccum;
      job.updatedAt = new Date();

      if (response.stop_reason === "end_turn" || toolUses.length === 0) break;

      const toolResults: import("@anthropic-ai/sdk/resources").ToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        let result: unknown;
        try {
          const inp = tool.input as any;
          switch (tool.name) {
            case "list_users":           result = await toolListUsers(); break;
            case "get_app_stats":        result = await toolGetAppStats(); break;
            case "update_user":          result = await toolUpdateUser(inp.userId, inp); break;
            case "list_recent_activity": result = await toolListRecentActivity(); break;
            case "get_ai_config":        result = await toolGetAiConfig(); break;
            case "update_ai_config":     result = await toolUpdateAiConfig(inp.params ?? inp); break;
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
            case "exec_node_script":     result = await toolExecNodeScript(inp.scriptPath, inp.args); break;
            default:                     result = { error: `Herramienta desconocida: ${tool.name}` };
          }
        } catch (e) {
          result = { error: String(e) };
        }
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) });
      }

      apiMessages = [
        ...apiMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    job.status = "done";
    job.result = fullContent;
    job.toolCalls = toolCallsAccum;
    job.updatedAt = new Date();

    // Guardar en memoria semántica
    try {
      const userMsgs = job.messages.filter(m => m.role === "user").map(m => {
        if (typeof m.content === "string") return m.content;
        const textBlocks = (m.content as any[]).filter((b: any) => b.type === "text");
        return textBlocks.map((b: any) => b.text).join(" ");
      }).join(" | ");
      if (userMsgs.length > 20) {
        saveMemory(userMsgs.slice(0, 1000), "conversation", { date: new Date().toISOString() }).catch(() => {});
      }
    } catch { /* silent */ }

  } catch (err) {
    job.status = "error";
    job.error = String(err);
    job.updatedAt = new Date();
  }
}

// ── POST /admin/chat/job — Crear job en background
router.post("/admin/chat-job", requireAdmin, async (req, res) => {
  const { messages } = req.body as {
    messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  };

  if (!messages?.length) {
    res.status(400).json({ error: "messages requerido" });
    return;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id: jobId,
    status: "pending",
    messages,
    result: "",
    toolCalls: [],
    iterations: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  jobs.set(jobId, job);

  // Responder inmediatamente con el jobId
  res.json({ jobId, status: "pending", createdAt: job.createdAt });

  // Procesar en background (no await)
  (async () => {
    let brain = "(brain no disponible)";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { }

    let semanticContext = "";
    try {
      const lastUserMsg = messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
      const msgText = typeof lastUserMsg === "string" ? lastUserMsg : "";
      if (msgText.length > 10) {
        const relevantMemories = await searchMemory(msgText, 5, 0.25);
        if (relevantMemories.length > 0) {
          semanticContext = "\n\n═══════════════════════════════════════════════════════════════\nMEMORIAS RELEVANTES\n═══════════════════════════════════════════════════════════════\n" +
            relevantMemories.map(m => `[${m.date} | sim:${m.similarity}] ${m.content}`).join("\n");
        }
      }
    } catch { }

    await runJobInBackground(job, brain, semanticContext);
  })();
});

// ── GET /admin/chat/job/:id — Polling del estado del job
router.get("/admin/chat-job/:id", requireAdmin, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job no encontrado" });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    result: job.result,
    toolCalls: job.toolCalls,
    iterations: job.iterations ?? 0,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

// ── DELETE /admin/chat/job/:id — Cancelar un job en progreso
router.delete("/admin/chat-job/:id", requireAdmin, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job no encontrado" });
    return;
  }
  if (job.status === "running" || job.status === "pending") {
    job.abortController?.abort();
    job.status = "error";
    job.error = "Cancelado por el usuario.";
    job.updatedAt = new Date();
  }
  res.json({ ok: true, status: job.status });
});

// ── GET /admin/chat/jobs — Lista todos los jobs activos
router.get("/admin/chat-jobs", requireAdmin, async (_req, res) => {
  const list = Array.from(jobs.values()).map(j => ({
    id: j.id,
    status: j.status,
    preview: j.result.slice(0, 100),
    toolCount: j.toolCalls.length,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  }));
  res.json(list);
});


export default router;
