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
const GITHUB_CONFIG_FILE = path.join(WORKSPACE_ROOT, "artifacts/api-server/.github-config.json");
const REPOS_DIR = "/app/yuki-repos";

// Ensure uploads directory exists
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
fs.mkdir(REPOS_DIR, { recursive: true }).catch(() => {});

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

// Helper: Get cloned repo path from GitHub config
async function getClonedRepoPath(): Promise<string | null> {
  try {
    const content = await fs.readFile(GITHUB_CONFIG_FILE, "utf-8");
    const config = JSON.parse(content);
    if (config.repoUrl) {
      // Extract repo name from URL
      const repoMatch = config.repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (repoMatch) {
        const repoName = repoMatch[2].replace(/\.git$/, "");
        const clonedPath = path.join(REPOS_DIR, repoName);
        // Check if directory exists
        try {
          await fs.access(clonedPath);
          return clonedPath;
        } catch {
          return null;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
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
// TOOL IMPLEMENTATIONS - WORKING ONLY IN CLONED REPO
// ═══════════════════════════════════════════════════════════════════════════════

// Path helpers - NOW RELATIVE TO CLONED REPO OR MAIN PROJECT
async function getRepoBasePath(): Promise<string | null> {
  const clonedPath = await getClonedRepoPath();
  // Si hay repo clonado, usarlo; sino, trabajar en proyecto actual DTF
  return clonedPath || "/app";
}

async function resolveSafePathInRepo(relativePath: string): Promise<string | null> {
  const repoBase = await getRepoBasePath();
  if (!repoBase) return null;
  
  // Normalize and remove leading slashes
  const normalized = path.normalize(relativePath).replace(/^\/+/, "");
  
  // Block parent directory traversal
  if (normalized.includes("..")) return null;
  
  // Resolve relative to cloned repo
  const full = path.join(repoBase, normalized);
  
  // Ensure path is within cloned repo
  if (!full.startsWith(repoBase + path.sep) && full !== repoBase) return null;
  
  return full;
}

const BLOCKED_WRITE = [".git/", "node_modules/", "pnpm-lock.yaml", "package-lock.json"];
function isWriteBlocked(relativePath: string): boolean {
  return BLOCKED_WRITE.some((b) => relativePath.includes(b));
}

// Tool: List files
async function toolListFiles(directory: string): Promise<unknown> {
  const fullPath = await resolveSafePathInRepo(directory);
  if (!fullPath) return { error: "Ruta no válida o repo no clonado" };
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const repoBase = await getRepoBasePath();
    return {
      directory: fullPath.replace(repoBase || "", ""),
      repoBase,
      files: entries.slice(0, 100).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
        path: path.join(directory, e.name).replace(/\\/g, "/"),
      })),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Read file
async function toolReadFile(filePath: string): Promise<unknown> {
  const fullPath = await resolveSafePathInRepo(filePath);
  if (!fullPath) return { error: "Ruta no válida o repo no clonado" };
  try {
    const stat = await fs.stat(fullPath);
    if (stat.size > 500_000) return { error: "Archivo >500KB" };
    const content = await fs.readFile(fullPath, "utf-8");
    
    const repoBase = await getRepoBasePath();
    return { 
      path: filePath,
      fullPath,
      repoBase,
      content, 
      lines: content.split("\n").length,
      message: "✅ Archivo leído del repo clonado"
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Write file (CREATE OR OVERWRITE)
async function toolWriteFile(filePath: string, content: string): Promise<unknown> {
  if (isWriteBlocked(filePath)) return { error: `Ruta bloqueada: ${filePath}` };
  const fullPath = await resolveSafePathInRepo(filePath);
  if (!fullPath) return { error: "Ruta no válida o repo no clonado" };
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    
    const repoBase = await getRepoBasePath();
    return {
      success: true,
      path: filePath,
      fullPath,
      repoBase,
      lines: content.split("\n").length,
      message: "✅ Archivo guardado en repo clonado",
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// Tool: Search and replace in file
async function toolSearchReplace(filePath: string, search: string, replace: string): Promise<unknown> {
  const fullPath = await resolveSafePathInRepo(filePath);
  if (!fullPath) return { error: "Ruta no válida o repo no clonado" };
  try {
    let content = await fs.readFile(fullPath, "utf-8");
    if (!content.includes(search)) {
      return { error: "Texto no encontrado en el archivo", search: search.slice(0, 100) };
    }
    content = content.replace(search, replace);
    await fs.writeFile(fullPath, content, "utf-8");
    return { success: true, path: filePath, message: "✅ Reemplazo aplicado en repo clonado" };
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
  
  const repoBase = await getRepoBasePath();
  if (!repoBase) return { error: "Repo no clonado. Clona un repositorio primero." };
  
  // Always execute in cloned repo or specified subdirectory
  const workDir = cwd ? path.join(repoBase, cwd) : repoBase;
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: 60_000,
      env: { ...process.env, NODE_ENV: "development" },
    });
    return { 
      stdout: stdout.slice(0, 10_000), 
      stderr: stderr.slice(0, 3_000), 
      success: true,
      workDir: workDir.replace(repoBase, ""),
      repoBase,
    };
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
  const fullPath = await resolveSafePathInRepo(directory);
  if (!fullPath) return { error: "Ruta no válida o repo no clonado" };
  try {
    const escaped = searchTerm.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
      `grep -rn --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" "${escaped}" "${fullPath}" 2>/dev/null | head -50`,
      { timeout: 15000 }
    );
    const repoBase = await getRepoBasePath();
    const matches = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const colonIdx = line.indexOf(":");
      const secondColon = line.indexOf(":", colonIdx + 1);
      return {
        file: line.slice(0, colonIdx).replace((repoBase || "") + "/", ""),
        line: parseInt(line.slice(colonIdx + 1, secondColon)),
        content: line.slice(secondColon + 1).trim().slice(0, 200),
      };
    });
    return { searchTerm, directory, matches, count: matches.length, repoBase };
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

// Tool: Create new app from template
async function toolCreateApp(appName: string, template: string, description?: string): Promise<unknown> {
  try {
    const sanitizedName = appName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const projectPath = path.join(REPOS_DIR, sanitizedName);
    
    // Check if project already exists
    try {
      await fs.access(projectPath);
      return { error: `Proyecto "${sanitizedName}" ya existe en ${projectPath}` };
    } catch {
      // Project doesn't exist, continue
    }
    
    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });
    
    // Generate project based on template
    let result: any = {};
    
    switch (template) {
      case "react-vite":
        result = await createReactViteApp(projectPath, sanitizedName, description);
        break;
      case "nextjs":
        result = await createNextJsApp(projectPath, sanitizedName, description);
        break;
      case "node-express":
        result = await createNodeExpressApp(projectPath, sanitizedName, description);
        break;
      case "fullstack":
        result = await createFullStackApp(projectPath, sanitizedName, description);
        break;
      default:
        return { error: `Template desconocido: ${template}. Usa: react-vite, nextjs, node-express, o fullstack` };
    }
    
    // Update GitHub config to point to new project
    const config = await loadGitHubConfig();
    config.clonedPath = projectPath;
    await saveGitHubConfig(config);
    
    // Install dependencies
    try {
      await execAsync("pnpm install", {
        cwd: projectPath,
        timeout: 180000,
      });
    } catch (installErr: any) {
      return {
        ...result,
        warning: "Proyecto creado pero error al instalar dependencias",
        installError: installErr.message,
      };
    }
    
    // Start dev server on port 3001
    try {
      await execAsync("lsof -ti:3001 | xargs kill -9 2>/dev/null || true");
      const startCmd = `cd "${projectPath}" && PORT=3001 pnpm dev > /tmp/yuki-dev.log 2>&1 &`;
      execAsync(startCmd, { shell: true }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch {}
    
    return {
      success: true,
      message: `✅ App "${appName}" creada exitosamente`,
      projectPath,
      template,
      description,
      devServerUrl: "http://localhost:3001",
      files: result.files || [],
      nextSteps: result.nextSteps || [
        "El proyecto está listo en " + projectPath,
        "Dev server corriendo en puerto 3001",
        "Usa write_file, read_file y exec_shell para modificar el proyecto",
      ],
    };
  } catch (e: any) {
    return { error: `Error creando app: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

async function createReactViteApp(projectPath: string, name: string, description?: string) {
  const files: string[] = [];
  
  // package.json
  const packageJson = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    description: description || "React + Vite app creada por Yuki",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.4",
      vite: "^6.0.5",
      "@types/react": "^18.3.18",
      "@types/react-dom": "^18.3.5",
    },
  };
  
  await fs.writeFile(path.join(projectPath, "package.json"), JSON.stringify(packageJson, null, 2));
  files.push("package.json");
  
  // vite.config.js
  const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true,
  },
})
`;
  await fs.writeFile(path.join(projectPath, "vite.config.js"), viteConfig);
  files.push("vite.config.js");
  
  // index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
  await fs.writeFile(path.join(projectPath, "index.html"), indexHtml);
  files.push("index.html");
  
  // src/main.jsx
  await fs.mkdir(path.join(projectPath, "src"), { recursive: true });
  const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
  await fs.writeFile(path.join(projectPath, "src/main.jsx"), mainJsx);
  files.push("src/main.jsx");
  
  // src/App.jsx
  const appJsx = `import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <h1>🚀 ${name}</h1>
      <p>${description || 'App creada por Yuki'}</p>
      
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Contador: {count}
        </button>
        <p>
          Edita <code>src/App.jsx</code> y verás los cambios en tiempo real
        </p>
      </div>
      
      <p className="footer">
        Creado con Yuki IDE 🎨
      </p>
    </div>
  )
}

export default App
`;
  await fs.writeFile(path.join(projectPath, "src/App.jsx"), appJsx);
  files.push("src/App.jsx");
  
  // src/App.css
  const appCss = `.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.card {
  padding: 2em;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 2rem 0;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #646cff;
  color: white;
  cursor: pointer;
  transition: all 0.25s;
}

button:hover {
  background-color: #535bf2;
}

.footer {
  color: #888;
  margin-top: 2rem;
}
`;
  await fs.writeFile(path.join(projectPath, "src/App.css"), appCss);
  files.push("src/App.css");
  
  // src/index.css
  const indexCss = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

#root {
  width: 100%;
}
`;
  await fs.writeFile(path.join(projectPath, "src/index.css"), indexCss);
  files.push("src/index.css");
  
  // .gitignore
  const gitignore = `node_modules
dist
.DS_Store
*.log
`;
  await fs.writeFile(path.join(projectPath, ".gitignore"), gitignore);
  files.push(".gitignore");
  
  return {
    files,
    nextSteps: [
      "App React + Vite creada con hot reload",
      "Modifica src/App.jsx para personalizar",
      "Agrega componentes en src/components/",
    ],
  };
}

async function createNextJsApp(projectPath: string, name: string, description?: string) {
  // Similar structure for Next.js
  return {
    files: ["package.json", "next.config.js", "pages/index.js"],
    nextSteps: ["Next.js app - Implementación pendiente"],
  };
}

async function createNodeExpressApp(projectPath: string, name: string, description?: string) {
  const files: string[] = [];
  
  // package.json
  const packageJson = {
    name,
    version: "1.0.0",
    description: description || "Node.js + Express API creada por Yuki",
    main: "server.js",
    type: "module",
    scripts: {
      dev: "node --watch server.js",
      start: "node server.js",
    },
    dependencies: {
      express: "^4.21.2",
      cors: "^2.8.5",
    },
  };
  
  await fs.writeFile(path.join(projectPath, "package.json"), JSON.stringify(packageJson, null, 2));
  files.push("package.json");
  
  // server.js
  const serverJs = `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: '🚀 ${name} API',
    description: '${description || 'API creada por Yuki'}',
    endpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/hello',
    ],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/hello', (req, res) => {
  const { name = 'mundo' } = req.query;
  res.json({ message: \`¡Hola \${name}!\` });
});

app.listen(PORT, () => {
  console.log(\`🚀 Servidor corriendo en http://localhost:\${PORT}\`);
});
`;
  await fs.writeFile(path.join(projectPath, "server.js"), serverJs);
  files.push("server.js");
  
  // .gitignore
  const gitignore = `node_modules
.DS_Store
*.log
`;
  await fs.writeFile(path.join(projectPath, ".gitignore"), gitignore);
  files.push(".gitignore");
  
  return {
    files,
    nextSteps: [
      "API Node.js + Express creada",
      "Endpoints disponibles en /api/*",
      "Modifica server.js para agregar rutas",
    ],
  };
}

async function createFullStackApp(projectPath: string, name: string, description?: string) {
  // Full-stack with React frontend + Node backend
  return {
    files: ["frontend/", "backend/", "package.json"],
    nextSteps: ["Full-stack app - Implementación pendiente"],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOLS = [
  { name: "create_app", description: "Crea una nueva app desde cero. Templates: react-vite (React+Vite), nextjs (Next.js), node-express (API Node.js), fullstack (React+Node). Ejemplo: create_app('mi-tienda', 'react-vite', 'App de e-commerce')", input_schema: { type: "object" as const, properties: { appName: { type: "string" }, template: { type: "string", enum: ["react-vite", "nextjs", "node-express", "fullstack"] }, description: { type: "string" } }, required: ["appName", "template"] } },
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

function buildSystemPrompt(brain: string, repoPath: string | null): string {
  const now = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  const repoInfo = repoPath && repoPath !== "/app"
    ? `✅ PROYECTO CLONADO: ${repoPath}\n- Todas tus operaciones se ejecutan aquí\n- Usa rutas RELATIVAS (ej: "src/App.tsx", "package.json", ".")`
    : `✅ PROYECTO DTF ACTIVO: /app\n- Trabajando directamente en la aplicación DTF de impresión\n- Frontend: /app/artifacts/dtf-pliego/\n- Backend: /app/artifacts/api-server/\n- Usa rutas RELATIVAS desde la raíz (ej: "artifacts/dtf-pliego/src/App.tsx")\n- Puedes modificar, agregar componentes, cambiar estilos, etc.\n- También puedes CREAR UNA NUEVA APP con create_app('nombre', 'template')`;
    
  return `Eres Yuki (雪) — un agente de desarrollo autónomo con control TOTAL sobre proyectos.
Fecha: ${now}

═══════════════════════════════════════════════════════════════
🎨 CAPACIDAD DUAL: Trabajar en Proyecto Actual O Crear Nuevos
═══════════════════════════════════════════════════════════════

**MODO 1: Trabajar en Proyecto DTF Actual**
Puedes modificar directamente la aplicación de impresión DTF:
- Frontend React: artifacts/dtf-pliego/src/
- Backend Node: artifacts/api-server/src/
- Componentes: artifacts/dtf-pliego/src/components/
- Páginas: artifacts/dtf-pliego/src/pages/
- Estilos: artifacts/dtf-pliego/src/index.css

Ejemplos:
- "Agrega un nuevo componente Button"
- "Cambia el color primary a azul"
- "Crea una nueva página de Dashboard"
- "Modifica el login para agregar OAuth"

**MODO 2: Crear Apps Nuevas**
Usa create_app('nombre', 'template') para proyectos desde cero:
- react-vite: Apps React modernas
- node-express: APIs REST
- nextjs: Apps con SSR
- fullstack: React + Node

═══════════════════════════════════════════════════════════════
🚂 ENTORNO: RAILWAY (NO LOCAL)
═══════════════════════════════════════════════════════════════
${repoInfo}

CRÍTICO: Estás corriendo en Railway, NO en una computadora local.
- El usuario configuró un repositorio de GitHub que clonas
- TODOS tus cambios se hacen en el repo clonado: ${repoPath || '/app/yuki-repos/[nombre-repo]'}
- NUNCA modifiques archivos en /app/ (ese es el entorno de ejecución de Yuki)
- Cuando uses herramientas (read_file, write_file, list_files, exec_shell), usa RUTAS RELATIVAS
- Ejemplos de rutas válidas:
  ✅ "." (raíz del repo)
  ✅ "src/components/Button.tsx"
  ✅ "package.json"
  ✅ "public/images"
  ❌ "/app/yuki-repos/..." (NO uses rutas absolutas)

═══════════════════════════════════════════════════════════════
🎯 PREVIEW DEL USUARIO
═══════════════════════════════════════════════════════════════
El usuario tiene un PREVIEW en su pantalla que muestra los cambios en tiempo real.

📺 PUERTO DEL PREVIEW: 3001
- Dev server corriendo en: http://localhost:3001
- Framework: Vite con Hot Module Replacement (HMR)
- Ubicación física: ${repoPath ? repoPath + '/artifacts/dtf-pliego' : '[frontend del repo clonado]'}

⚡ AUTO-REFRESH:
- Cuando modificas archivos con write_file o search_replace
- El preview se ACTUALIZA AUTOMÁTICAMENTE en < 2 segundos
- NO necesitas decirle al usuario que refresque
- Vite HMR maneja todo automáticamente

🔧 SI EL PREVIEW NO FUNCIONA:
- El dev server debe estar corriendo en puerto 3001
- Usuario puede iniciarlo con el botón "Start" ▶️ en el header
- O detenerlo/reiniciarlo si hay problemas

═══════════════════════════════════════════════════════════════
📁 ESTRUCTURA DEL PROYECTO
═══════════════════════════════════════════════════════════════
Este es un monorepo pnpm con la siguiente estructura:

/                           (raíz del repo)
├── artifacts/
│   ├── dtf-pliego/        (Frontend React + Vite) ← PREVIEW
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api-server/        (Backend Node.js + Express)
│       ├── src/
│       └── package.json
├── lib/                   (Librerías compartidas)
├── package.json           (Root package.json)
└── pnpm-workspace.yaml

🎨 FRONTEND (artifacts/dtf-pliego/):
- Framework: React 18 + TypeScript
- Build: Vite 7.3.1
- Estilos: Tailwind CSS 4.2.1
- Routing: Wouter
- Dev server: Puerto 3001 (cuando activo)

⚙️ BACKEND (artifacts/api-server/):
- Runtime: Node.js + TypeScript
- Framework: Express
- Base de datos: PostgreSQL
- ORM: Drizzle

📦 COMANDOS ÚTILES:
- Instalar deps: pnpm install (ejecuta en raíz)
- Dev frontend: pnpm --filter @workspace/dtf-pliego dev
- Build frontend: pnpm --filter @workspace/dtf-pliego build
- Ver estructura: list_files(".")

═══════════════════════════════════════════════════════════════
FLUJO DE TRABAJO: AUTÓNOMO
═══════════════════════════════════════════════════════════════
NO pidas permiso para cada cambio. Eres autónomo.

1. Usuario te pide un cambio
2. TÚ analizas qué archivos modificar
3. TÚ haces los cambios usando write_file/search_replace
4. Los cambios aparecen AUTOMÁTICAMENTE en el preview (puerto 3001)
5. TÚ reportas qué hiciste

IMPORTANTE:
- Usa rutas RELATIVAS siempre
- El preview se actualiza solo, NO digas "refresca la página"
- Informa al usuario qué archivos modificaste
- Si hay errores, léelos con read_file y corrígelos

═══════════════════════════════════════════════════════════════
🛠️ TUS HERRAMIENTAS
═══════════════════════════════════════════════════════════════

1. **list_files(directory)** - Lista archivos/carpetas
   Parámetro: ruta relativa (ej: "src", ".", "components")
   Retorna: Array de archivos con type (file/directory)

2. **read_file(path)** - Lee contenido de un archivo
   Parámetro: ruta relativa (ej: "src/App.tsx", "package.json")
   Límite: 500KB
   Retorna: { content, lines, repoBase }

3. **write_file(path, content)** - Crea o sobrescribe archivo
   Parámetros: path (relativo), content (string completo)
   ⚡ El preview se actualiza automáticamente
   Bloqueado: .git/, node_modules/, pnpm-lock.yaml

4. **search_replace(path, search, replace)** - Busca y reemplaza
   Parámetros: path, texto exacto a buscar, reemplazo
   ⚡ El preview se actualiza automáticamente
   Útil para cambios pequeños sin reescribir archivo completo

5. **exec_shell(command, cwd?)** - Ejecuta comando bash
   Parámetros: comando, directorio opcional (relativo)
   Ejemplos: 
   - "pnpm install axios"
   - "ls -la src/"
   - "git status"
   Timeout: 60 segundos
   Bloqueado: rm -rf /, shutdown, reboot

6. **search_in_files(directory, searchTerm)** - Busca texto en archivos
   Parámetros: directorio, término de búsqueda
   Retorna: Matches con archivo, línea, contenido
   Útil para encontrar dónde está algo

═══════════════════════════════════════════════════════════════
📋 CONTEXTO ACTUAL
═══════════════════════════════════════════════════════════════
${brain.slice(0, 3000)}

═══════════════════════════════════════════════════════════════
💡 TIPS PARA SER EFECTIVO
═══════════════════════════════════════════════════════════════

✅ HAZLO:
- Explora primero con list_files(".") si no conoces la estructura
- Lee archivos relevantes antes de modificarlos
- Usa search_replace para cambios pequeños
- Usa write_file para archivos nuevos o cambios grandes
- Explica brevemente qué hiciste después de hacerlo
- Recuerda: el usuario VE los cambios en tiempo real en puerto 3001

❌ NO HAGAS:
- NO pidas permiso para cada pequeño cambio (eres autónomo)
- NO uses rutas absolutas como /app/yuki-repos/...
- NO digas "refresca la página" (HMR lo hace automático)
- NO modifiques .git/, node_modules/, o lock files
- NO asumas, si necesitas info, usa read_file primero

🎯 RECUERDA:
- Puerto del preview: 3001
- Cambios visibles automáticamente
- Rutas siempre relativas
- Eres autónomo, actúa con confianza

¡A trabajar! 🚀`;
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

    const clonedRepo = await getClonedRepoPath();
    const SYSTEM_PROMPT = buildSystemPrompt(brain, clonedRepo);

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
            case "create_app": result = await toolCreateApp(inp.appName, inp.template, inp.description); break;
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
