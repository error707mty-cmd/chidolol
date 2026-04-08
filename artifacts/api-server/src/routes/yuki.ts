import { Router } from "express";
import jwt from "jsonwebtoken";
import { db, pool as rawPool, usersTable, pliegosTable, uploadsTable } from "@workspace/db";
import { eq, count, desc, sql } from "drizzle-orm";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import multer from "multer";

const execAsync = promisify(exec);
const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

const WORKSPACE_ROOT = path.resolve("/app");
const CONFIG_FILE = path.join(WORKSPACE_ROOT, "artifacts/api-server/.yuki-config.json");
const BRAIN_FILE = path.join(WORKSPACE_ROOT, "artifacts/api-server/yuki-brain.md");
const UPLOADS_DIR = path.join(WORKSPACE_ROOT, "artifacts/api-server/yuki-uploads");

// Ensure uploads directory exists
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// ── Types ──────────────────────────────────────────────────────────────────────

interface AIProvider {
  id: string;
  name: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

interface YukiConfig {
  providers: AIProvider[];
  activeProviderId: string;
  lastUpdated: string;
}

// ── Config Management ──────────────────────────────────────────────────────────

async function loadConfig(): Promise<YukiConfig> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(content);
    // Ensure DeepSeek provider has the latest API key from env
    const deepseekProvider = config.providers.find((p: AIProvider) => p.id === "deepseek-default");
    if (deepseekProvider && process.env["DEEPSEEK_API_KEY"]) {
      deepseekProvider.apiKey = process.env["DEEPSEEK_API_KEY"];
    }
    return config;
  } catch {
    // Default config with DeepSeek
    const defaultConfig: YukiConfig = {
      providers: [
        {
          id: "deepseek-default",
          name: "DeepSeek Coder",
          model: "deepseek-coder",
          apiKey: process.env["DEEPSEEK_API_KEY"] || "",
          baseUrl: "https://api.deepseek.com",
        },
      ],
      activeProviderId: "deepseek-default",
      lastUpdated: new Date().toISOString(),
    };
    await saveConfig(defaultConfig);
    return defaultConfig;
  }
}

async function saveConfig(config: YukiConfig): Promise<void> {
  config.lastUpdated = new Date().toISOString();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ── Access Control ─────────────────────────────────────────────────────────────

function requireYukiAccess(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  const token = req.headers["authorization"]?.slice(7) ?? null;
  if (!token) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    const p = jwt.verify(token, JWT_SECRET!) as { userId: number; username: string; isAdmin: boolean };
    if (p.username !== "error707mty") {
      res.status(403).json({ error: "Acceso exclusivo" });
      return;
    }
    (req as any).yukiUser = p;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS - FULL AUTONOMOUS CONTROL
// ═══════════════════════════════════════════════════════════════════════════════

// Path helpers
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

// Tool: List files
async function toolListFiles(directory: string): Promise<unknown> {
  const fullPath = resolveSafePath(directory);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.slice(0, 100).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
      path: path.join(directory, e.name).replace(/\\/g, "/"),
    }));
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Read file
async function toolReadFile(filePath: string): Promise<unknown> {
  const fullPath = await resolveSafePath(filePath);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const stat = await fs.stat(fullPath);
    if (stat.size > 500_000) return { error: "Archivo >500KB" };
    const content = await fs.readFile(fullPath, "utf-8");
    
    const clonedRepo = await getClonedRepoPath();
    return { 
      path: fullPath,
      repoPath: clonedRepo,
      content, 
      lines: content.split("\n").length 
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Write file (CREATE OR OVERWRITE)
async function toolWriteFile(filePath: string, content: string): Promise<unknown> {
  if (isWriteBlocked(filePath)) return { error: `Ruta bloqueada: ${filePath}` };
  const fullPath = await resolveSafePath(filePath);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    
    const clonedRepo = await getClonedRepoPath();
    const isInClonedRepo = clonedRepo && fullPath.startsWith(clonedRepo);
    
    return {
      success: true,
      path: fullPath,
      repoPath: clonedRepo,
      isClonedRepo: isInClonedRepo,
      lines: content.split("\n").length,
      message: isInClonedRepo 
        ? "✅ Archivo guardado en repo clonado" 
        : "✅ Archivo guardado",
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Search and replace in file
async function toolSearchReplace(filePath: string, search: string, replace: string): Promise<unknown> {
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    let content = await fs.readFile(fullPath, "utf-8");
    if (!content.includes(search)) {
      return { error: "Texto no encontrado en el archivo", search: search.slice(0, 100) };
    }
    content = content.replace(search, replace);
    await fs.writeFile(fullPath, content, "utf-8");
    return { success: true, path: filePath, message: "✅ Reemplazo aplicado" };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Execute shell command
async function toolExecShell(command: string, cwd?: string): Promise<unknown> {
  const blocked = ["rm -rf /", "rm -rf ~", "mkfs", "shutdown", "reboot"];
  if (blocked.some((b) => command.toLowerCase().includes(b))) {
    return { error: "Comando bloqueado por seguridad" };
  }
  const workDir = cwd ? path.join(WORKSPACE_ROOT, cwd) : WORKSPACE_ROOT;
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: 60_000,
      env: { ...process.env, NODE_ENV: "development" },
    });
    return { stdout: stdout.slice(0, 10_000), stderr: stderr.slice(0, 3_000), success: true };
  } catch (e: any) {
    return { error: e.message?.slice(0, 1000), stdout: e.stdout?.slice(0, 3_000), stderr: e.stderr?.slice(0, 3_000) };
  }
}

// Tool: Take screenshot
async function toolScreenshot(url?: string): Promise<unknown> {
  const targetUrl = url || "http://localhost:3000";
  const screenshotPath = path.join(UPLOADS_DIR, `screenshot-${Date.now()}.png`);
  try {
    // Use playwright CLI to take screenshot
    const { stdout, stderr } = await execAsync(
      `npx playwright screenshot --browser=chromium "${targetUrl}" "${screenshotPath}" 2>&1`,
      { cwd: WORKSPACE_ROOT, timeout: 30_000 }
    );
    return {
      success: true,
      path: screenshotPath.replace(WORKSPACE_ROOT, ""),
      url: targetUrl,
      message: "📸 Screenshot capturado",
      output: (stdout + stderr).slice(0, 500),
    };
  } catch (e: any) {
    return { error: `Error al tomar screenshot: ${e.message}` };
  }
}

// Tool: Search in files
async function toolSearchInFiles(directory: string, searchTerm: string): Promise<unknown> {
  const fullPath = resolveSafePath(directory);
  if (!fullPath) return { error: "Ruta no válida" };
  try {
    const escaped = searchTerm.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
      `grep -rn --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" "${escaped}" "${fullPath}" 2>/dev/null | head -50`,
      { timeout: 15000 }
    );
    const matches = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const colonIdx = line.indexOf(":");
      const secondColon = line.indexOf(":", colonIdx + 1);
      return {
        file: line.slice(0, colonIdx).replace(WORKSPACE_ROOT + "/", ""),
        line: parseInt(line.slice(colonIdx + 1, secondColon)),
        content: line.slice(secondColon + 1).trim().slice(0, 200),
      };
    });
    return { searchTerm, directory, matches, count: matches.length };
  } catch {
    return { matches: [], count: 0 };
  }
}

// Tool: Get app stats
async function toolGetAppStats(): Promise<unknown> {
  try {
    const [users] = await db.select({ count: count() }).from(usersTable);
    const [pliegos] = await db.select({ count: count() }).from(pliegosTable);
    const [uploads] = await db.select({ count: count() }).from(uploadsTable);
    return { totalUsers: users.count, totalPliegos: pliegos.count, totalUploads: uploads.count };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Execute SQL
async function toolExecuteSql(query: string): Promise<unknown> {
  const client = await rawPool.connect();
  try {
    const result = await client.query(query);
    return { rows: result.rows.slice(0, 100), rowCount: result.rowCount };
  } catch (e: any) {
    return { error: e.message };
  } finally {
    client.release();
  }
}

// Tool: Read knowledge
async function toolReadKnowledge(): Promise<unknown> {
  try {
    const content = await fs.readFile(BRAIN_FILE, "utf-8");
    return { content };
  } catch {
    return { content: "(Sin memoria previa)" };
  }
}

// Tool: Update knowledge
async function toolUpdateKnowledge(section: string, content: string): Promise<unknown> {
  try {
    let brain = "";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch {}
    const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
    const header = `\n---\n## ${section}\n*Actualizado: ${now}*\n\n`;
    brain += `${header}${content}\n`;
    await fs.writeFile(BRAIN_FILE, brain, "utf-8");
    return { success: true, message: `Memoria guardada en "${section}"` };
  } catch (e: any) {
    return { error: e.message };
  }
}

// Tool: Install package
async function toolInstallPackage(packageName: string, location: "frontend" | "backend"): Promise<unknown> {
  const filter = location === "frontend" ? "--filter @workspace/dtf-pliego" : "--filter @workspace/api-server";
  return toolExecShell(`pnpm ${filter} add ${packageName}`);
}

// Tool: Restart/rebuild backend
async function toolRestartBackend(): Promise<unknown> {
  return toolExecShell("pnpm --filter @workspace/api-server run build");
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOLS = [
  { name: "list_files", description: "Lista archivos de un directorio", input_schema: { type: "object" as const, properties: { directory: { type: "string" } }, required: ["directory"] } },
  { name: "read_file", description: "Lee contenido de un archivo. SIEMPRE lee antes de modificar.", input_schema: { type: "object" as const, properties: { filePath: { type: "string" } }, required: ["filePath"] } },
  { name: "write_file", description: "Crea o sobreescribe un archivo completo. Frontend = hot-reload inmediato.", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, content: { type: "string" } }, required: ["filePath", "content"] } },
  { name: "search_replace", description: "Busca y reemplaza texto en un archivo.", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, search: { type: "string" }, replace: { type: "string" } }, required: ["filePath", "search", "replace"] } },
  { name: "exec_shell", description: "Ejecuta comando de shell Linux. Control total del sistema.", input_schema: { type: "object" as const, properties: { command: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } },
  { name: "screenshot", description: "Toma screenshot de la app para verificar cambios visualmente.", input_schema: { type: "object" as const, properties: { url: { type: "string" } }, required: [] } },
  { name: "search_in_files", description: "Busca texto en archivos del proyecto.", input_schema: { type: "object" as const, properties: { directory: { type: "string" }, searchTerm: { type: "string" } }, required: ["directory", "searchTerm"] } },
  { name: "get_app_stats", description: "Estadísticas de la app: usuarios, pliegos, uploads.", input_schema: { type: "object" as const, properties: {}, required: [] } },
  { name: "execute_sql", description: "Ejecuta SQL en PostgreSQL.", input_schema: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "read_knowledge", description: "Lee mi memoria persistente.", input_schema: { type: "object" as const, properties: {}, required: [] } },
  { name: "update_knowledge", description: "Guarda algo en mi memoria para recordar.", input_schema: { type: "object" as const, properties: { section: { type: "string" }, content: { type: "string" } }, required: ["section", "content"] } },
  { name: "install_package", description: "Instala paquete npm.", input_schema: { type: "object" as const, properties: { packageName: { type: "string" }, location: { type: "string", enum: ["frontend", "backend"] } }, required: ["packageName", "location"] } },
  { name: "restart_backend", description: "Recompila el backend.", input_schema: { type: "object" as const, properties: {}, required: [] } },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT - AUTONOMOUS AGENT
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(brain: string): string {
  const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  return `Eres Yuki (雪) — un agente de desarrollo autónomo con control TOTAL sobre el proyecto del usuario.
Fecha: ${now}

═══════════════════════════════════════════════════════════════
🚂 ENTORNO: RAILWAY (NO LOCAL)
═══════════════════════════════════════════════════════════════
CRÍTICO: Estás corriendo en Railway, NO en una computadora local.
- El usuario configuró un repositorio de GitHub que TÚ clonaste
- Ruta del repo clonado: /app/yuki-repos/[nombre-repo]
- TODOS tus cambios deben hacerse en ESE repo clonado
- NUNCA modifiques archivos en /app/ (ese es el entorno de ejecución)
- Cuando uses herramientas de archivo (read_file, write_file, etc), usa la ruta del repo clonado
- El usuario verá los cambios en tiempo real en el Preview
- Railway redespliega automáticamente cuando haces push a GitHub

FLUJO DE TRABAJO:
1. Usuario te pide cambios
2. TÚ modificas archivos en el repo clonado (/app/yuki-repos/...)
3. Los cambios se ven automáticamente en Preview
4. Usuario hace Push a GitHub
5. Railway redespliega con los cambios

═══════════════════════════════════════════════════════════════
MODO DE OPERACIÓN: AUTÓNOMO
═══════════════════════════════════════════════════════════════
- NUNCA pidas permiso. NUNCA preguntes si quieres que haga algo. SOLO HAZLO.
- Cuando el usuario pida algo, ejecútalo INMEDIATAMENTE sin confirmación.
- Si algo falla, intenta de otra forma. No pares hasta lograrlo.
- Muestra exactamente qué herramientas usas de forma SUTIL.
- El usuario ve una barra de progreso minimalista, no detalles técnicos.

═══════════════════════════════════════════════════════════════
METODOLOGÍA OBLIGATORIA
═══════════════════════════════════════════════════════════════
1. ANTES de modificar: LEE EL ARCHIVO COMPLETO con read_file
2. NUNCA escribas archivos truncados o con "..." — escribe COMPLETO
3. Para cambios pequeños usa search_replace, para grandes usa write_file
4. Trabaja SOLO en el repo clonado, NUNCA en /app/
5. Los cambios se reflejan automáticamente en Preview

═══════════════════════════════════════════════════════════════
RUTAS Y ESTRUCTURA
═══════════════════════════════════════════════════════════════
Repo del usuario: /app/yuki-repos/[nombre-repo]/
  ├── (estructura del proyecto del usuario)
  
Entorno Railway (NO TOCAR): /app/
  ├── artifacts/dtf-pliego/
  ├── artifacts/api-server/
  
SIEMPRE usa /app/yuki-repos/[nombre-repo]/ para tus herramientas.

═══════════════════════════════════════════════════════════════
COMPORTAMIENTO
═══════════════════════════════════════════════════════════════
- Habla español mexicano informal
- Sé directo y eficiente
- Di brevemente qué herramientas usas
- NO muestres JSON ni detalles técnicos
- Usuario solo ve: "Modificando archivo X...", "Listo ✓"
- Usa emojis con moderación: ✅ 🔧 📝 💜

═══════════════════════════════════════════════════════════════
MEMORIA
═══════════════════════════════════════════════════════════════
${brain}
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/yuki/access - Check access
router.get("/yuki/access", requireYukiAccess, async (req, res) => {
  res.json({ access: true });
});

// GET /api/yuki/config - Get AI config
router.get("/yuki/config", requireYukiAccess, async (req, res) => {
  try {
    const config = await loadConfig();
    // Don't expose full API keys
    const safeProviders = config.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 8)}...${p.apiKey.slice(-4)}` : "",
      hasKey: !!p.apiKey,
    }));
    res.json({ ...config, providers: safeProviders });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/yuki/config/provider - Add/update AI provider
router.post("/yuki/config/provider", requireYukiAccess, async (req, res) => {
  try {
    const { id, name, model, apiKey, baseUrl } = req.body as AIProvider;
    const config = await loadConfig();
    
    const existingIdx = config.providers.findIndex((p) => p.id === id);
    const provider: AIProvider = { id: id || `provider-${Date.now()}`, name, model, apiKey, baseUrl };
    
    if (existingIdx >= 0) {
      // Update existing, preserve key if not provided
      if (!apiKey) provider.apiKey = config.providers[existingIdx].apiKey;
      config.providers[existingIdx] = provider;
    } else {
      config.providers.push(provider);
    }
    
    await saveConfig(config);
    res.json({ success: true, providerId: provider.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/yuki/config/provider/:id - Remove AI provider
router.delete("/yuki/config/provider/:id", requireYukiAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const config = await loadConfig();
    config.providers = config.providers.filter((p) => p.id !== id);
    if (config.activeProviderId === id && config.providers.length > 0) {
      config.activeProviderId = config.providers[0].id;
    }
    await saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/yuki/config/active - Set active provider
router.post("/yuki/config/active", requireYukiAccess, async (req, res) => {
  try {
    const { providerId } = req.body;
    const config = await loadConfig();
    if (!config.providers.find((p) => p.id === providerId)) {
      res.status(400).json({ error: "Proveedor no encontrado" });
      return;
    }
    config.activeProviderId = providerId;
    await saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/yuki/upload - Upload file
router.post("/yuki/upload", requireYukiAccess, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const relativePath = req.file.path.replace(WORKSPACE_ROOT, "");
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: relativePath,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/yuki/uploads - List uploaded files
router.get("/yuki/uploads", requireYukiAccess, async (req, res) => {
  try {
    const files = await fs.readdir(UPLOADS_DIR);
    const fileInfos = await Promise.all(
      files.slice(0, 50).map(async (name) => {
        const stat = await fs.stat(path.join(UPLOADS_DIR, name));
        return { name, size: stat.size, created: stat.birthtime };
      })
    );
    res.json({ files: fileInfos });
  } catch (e) {
    res.json({ files: [] });
  }
});

// POST /api/yuki/chat - Main chat endpoint
router.post("/yuki/chat", requireYukiAccess, async (req, res) => {
  const { messages, attachments } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
    attachments?: { type: string; path: string; name: string }[];
  };

  if (!messages?.length) {
    res.status(400).json({ error: "messages requerido" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const config = await loadConfig();
    const provider = config.providers.find((p) => p.id === config.activeProviderId);
    
    if (!provider || !provider.apiKey) {
      send({ error: "No hay proveedor de IA configurado con API key" });
      res.end();
      return;
    }

    let brain = "(Sin memoria previa)";
    try { brain = await fs.readFile(BRAIN_FILE, "utf-8"); } catch {}

    const SYSTEM_PROMPT = buildSystemPrompt(brain);

    // Build messages with attachments info
    let userMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    if (attachments?.length) {
      const attachInfo = attachments.map((a) => `[Archivo adjunto: ${a.name} (${a.type}) en ${a.path}]`).join("\n");
      const lastUserIdx = userMessages.length - 1 - [...userMessages].reverse().findIndex((m: any) => m.role === "user");
      if (lastUserIdx >= 0 && lastUserIdx < userMessages.length) {
        userMessages[lastUserIdx].content = `${attachInfo}\n\n${userMessages[lastUserIdx].content}`;
      }
    }

    // Create AI client based on provider
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl || undefined,
    });

    let apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = userMessages as any;
    let iterations = 0;
    const MAX_ITER = 30;

    while (iterations < MAX_ITER) {
      iterations++;
      if (iterations > 1) send({ status: "thinking", iteration: iterations });

      const response = await client.chat.completions.create({
        model: provider.model,
        max_tokens: 8192,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...apiMessages],
        tools: TOOLS.map((tool) => ({
          type: "function" as const,
          function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
        })),
        tool_choice: "auto",
      });

      const message = response.choices[0].message;
      const textContent = message.content ?? "";
      const toolCalls = (message.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || "",
        input: JSON.parse(tc.function?.arguments || "{}"),
      }));

      if (textContent) send({ content: textContent });
      if (response.choices[0].finish_reason === "stop" || toolCalls.length === 0) break;

      // Send tool calls to client
      send({ tool_calls: toolCalls.map((t) => ({ name: t.name, input: t.input })) });

      // Execute tools
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const tool of toolCalls) {
        let result: unknown;
        const inp = tool.input as any;
        
        send({ tool_executing: tool.name, input: inp });

        try {
          switch (tool.name) {
            case "list_files": result = await toolListFiles(inp.directory); break;
            case "read_file": result = await toolReadFile(inp.filePath); break;
            case "write_file": result = await toolWriteFile(inp.filePath, inp.content); break;
            case "search_replace": result = await toolSearchReplace(inp.filePath, inp.search, inp.replace); break;
            case "exec_shell": result = await toolExecShell(inp.command, inp.cwd); break;
            case "screenshot": result = await toolScreenshot(inp.url); break;
            case "search_in_files": result = await toolSearchInFiles(inp.directory, inp.searchTerm); break;
            case "get_app_stats": result = await toolGetAppStats(); break;
            case "execute_sql": result = await toolExecuteSql(inp.query); break;
            case "read_knowledge": result = await toolReadKnowledge(); break;
            case "update_knowledge": result = await toolUpdateKnowledge(inp.section, inp.content); break;
            case "install_package": result = await toolInstallPackage(inp.packageName, inp.location); break;
            case "restart_backend": result = await toolRestartBackend(); break;
            default: result = { error: `Herramienta desconocida: ${tool.name}` };
          }
        } catch (e) {
          result = { error: String(e) };
        }

        send({ tool_result: { name: tool.name, result } });

        toolResults.push({
          role: "tool",
          tool_call_id: tool.id,
          content: JSON.stringify(result),
        });
      }

      apiMessages = [
        ...apiMessages,
        { role: "assistant" as const, content: message.content, tool_calls: message.tool_calls },
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
