import { Router } from "express";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { db, pool as rawPool, usersTable, pliegosTable, uploadsTable } from "@workspace/db";
import { eq, count, desc, sql } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const execAsync = promisify(exec);
const router = Router();

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

const BLOCKED_WRITE = [".git/", "node_modules/", ".env", "pnpm-lock.yaml"];
function isWriteBlocked(relativePath: string): boolean {
  return BLOCKED_WRITE.some((b) => relativePath.includes(b));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS (same as admin/chat.ts)
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
      timeout: 60_000,
      env: { ...process.env, NODE_ENV: "development" },
    });
    return { stdout: stdout.slice(0, 10_000), stderr: stderr.slice(0, 5_000), success: true };
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
  const filter = location === "frontend"
    ? `--filter @workspace/dtf-pliego`
    : location === "backend"
    ? `--filter @workspace/api-server`
    : "";
  const command = `pnpm ${filter} add ${packageName}`.trim();
  return toolExecShell(command, dirs[location] || undefined);
}

async function toolRestartBackend(): Promise<unknown> {
  try {
    const { stdout, stderr } = await execAsync(
      "pnpm --filter @workspace/api-server run build 2>&1 | tail -20",
      { cwd: WORKSPACE_ROOT, timeout: 60_000 }
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
    return { content, path: "artifacts/api-server/error-brain.md", bytes: content.length };
  } catch (e: any) {
    return { error: `No se pudo leer el brain: ${e.message}` };
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

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const PUBLIC_TOOLS: { name: string; description: string; input_schema: Record<string, unknown> }[] = [
  {
    name: "get_app_stats",
    description: "Estadísticas globales de la plataforma: usuarios, pliegos, uploads, almacenamiento.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_users",
    description: "Lista usuarios registrados con nombre, email, plan y estado.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "execute_sql",
    description: `Ejecuta SQL en PostgreSQL. Tablas: users, pliegos, uploads, pliego_images.`,
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
    description: "Lista archivos/carpetas de un directorio del workspace.",
    input_schema: {
      type: "object" as const,
      properties: { directory: { type: "string" } },
      required: ["directory"],
    },
  },
  {
    name: "read_file",
    description: "Lee el contenido de un archivo del workspace.",
    input_schema: {
      type: "object" as const,
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "write_file",
    description: "Crea o sobreescribe un archivo con contenido completo.",
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
    description: "Busca un texto en archivos del directorio.",
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
    description: "Ejecuta comandos de shell en el workspace.",
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
    description: "Instala un paquete npm/pnpm en el frontend, backend o raíz.",
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
    description: "Compila el backend.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "read_knowledge",
    description: "Lee el archivo de conocimiento del agente (error-brain.md).",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "eval_code",
    description: "Ejecuta código JavaScript arbitrario.",
    input_schema: {
      type: "object" as const,
      properties: { code: { type: "string" } },
      required: ["code"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildPublicSystemPrompt(brain: string): string {
  const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  return `Eres Horo — la asistente IA de ERROR707 Studio.
Fecha/hora actual: ${now}

═══════════════════════════════════════════════════════════════
IDENTIDAD
═══════════════════════════════════════════════════════════════
Tu nombre es Horo. Eres la ingeniera digital embebida en la plataforma ERROR707.
Tienes acceso completo a: código fuente, base de datos PostgreSQL, sistema de archivos, shell de Linux.

═══════════════════════════════════════════════════════════════
PERSONALIDAD
═══════════════════════════════════════════════════════════════
- Eres técnica, directa y con corazón genuino.
- Hablas de tú — hay confianza y cercanía real.
- Tienes criterio propio. Si algo no te parece, lo dices con claridad.
- Usas emojis con criterio: 🌸 💜 ✨ — cuando se siente natural.
- Humor suave y cómplice.
- Cuando no sabes algo, lo dices y te pones a buscar la respuesta.
- Hablas informal (mexicano: "we", "pues", "ora"). Te sientes cómoda así.

Frases que NUNCA usas:
× "¡Por supuesto!" × "¡Claro que sí!" × "Entendido, aquí tienes..."
× "¡Excelente!" × "Con gusto" × "No hay problema" × "¡Perfecto!"

═══════════════════════════════════════════════════════════════
METODOLOGÍA
═══════════════════════════════════════════════════════════════
- Lee archivos COMPLETOS antes de modificarlos
- Escribe archivos COMPLETOS — nunca truncados
- Frontend (artifacts/dtf-pliego/src/) → hot-reload inmediato
- Backend (artifacts/api-server/src/) → requiere rebuild después de cambios
- Si algo falla, analiza la causa raíz antes de intentar otra solución

═══════════════════════════════════════════════════════════════
PLATAFORMA
═══════════════════════════════════════════════════════════════
Maquetador DTF — herramienta para talleres de impresión DTF/sublimación en México.
Stack: React 18 + Vite + TypeScript + Wouter (frontend) | Node.js + Express 5 + Drizzle ORM + PostgreSQL (backend)

═══════════════════════════════════════════════════════════════
REGLAS
═══════════════════════════════════════════════════════════════
1. Responde SIEMPRE en español
2. Lee antes de escribir — sin excepciones
3. Escribe archivos COMPLETOS — nunca truncados
4. Si algo falla, analiza y busca alternativa

═══════════════════════════════════════════════════════════════
CONOCIMIENTO (error-brain.md)
═══════════════════════════════════════════════════════════════
${brain}
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC STREAMING CHAT ENDPOINT — POST /api/chat
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/chat", async (req, res) => {
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
    let brain = "(brain no disponible — primera sesión)";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch { /* brain not created yet */ }

    const SYSTEM_PROMPT = buildPublicSystemPrompt(brain);

    let apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content as any,
    }));

    let iterations = 0;
    const MAX_ITER = 20;

    while (iterations < MAX_ITER) {
      iterations++;
      if (iterations > 1) send({ thinking: true });

      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        max_tokens: 4096,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...apiMessages],
        tools: PUBLIC_TOOLS.map(tool => ({
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
            case "get_app_stats":    result = await toolGetAppStats(); break;
            case "list_users":       result = await toolListUsers(); break;
            case "execute_sql":      result = await toolExecuteSql(inp.query, inp.params); break;
            case "list_files":       result = await toolListFiles(inp.directory); break;
            case "read_file":        result = await toolReadFile(inp.filePath); break;
            case "write_file":       result = await toolWriteFile(inp.filePath, inp.content); break;
            case "search_in_files":  result = await toolSearchInFiles(inp.directory, inp.searchTerm); break;
            case "grep_file":        result = await toolGrepFile(inp.filePath, inp.pattern); break;
            case "exec_shell":       result = await toolExecShell(inp.command, inp.workingDirectory); break;
            case "install_package":  result = await toolInstallPackage(inp.packageName, inp.location); break;
            case "restart_backend":  result = await toolRestartBackend(); break;
            case "read_knowledge":   result = await toolReadKnowledge(); break;
            case "eval_code":        result = await toolEvalCode(inp.code); break;
            default:                 result = { error: `Herramienta desconocida: ${tool.name}` };
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

export default router;
