import { Router } from "express";
import jwt from "jsonwebtoken";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);
const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

const WORKSPACE_ROOT = path.resolve("/app");

// ── Yuki exclusive access middleware ───────────────────────────────────────────
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
      res.status(403).json({ error: "Acceso exclusivo — solo el creador puede usar esta función" });
      return;
    }
    (req as any).yukiUser = p;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// ── GitHub config file path ────────────────────────────────────────────────────
const GITHUB_CONFIG_FILE = path.join(WORKSPACE_ROOT, "artifacts/api-server/.github-config.json");

interface GitHubConfig {
  repoUrl: string;
  token: string;
  lastPush?: string;
}

async function loadGitHubConfig(): Promise<GitHubConfig | null> {
  try {
    const content = await fs.readFile(GITHUB_CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveGitHubConfig(config: GitHubConfig): Promise<void> {
  await fs.writeFile(GITHUB_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ── GET /api/github/config — Get current GitHub config ─────────────────────────
router.get("/github/config", requireYukiAccess, async (req, res) => {
  try {
    const config = await loadGitHubConfig();
    if (!config) {
      res.json({ configured: false });
      return;
    }
    // Don't expose full token, just indicate it's set
    res.json({
      configured: true,
      repoUrl: config.repoUrl,
      tokenSet: !!config.token,
      tokenPreview: config.token ? `${config.token.slice(0, 10)}...${config.token.slice(-4)}` : null,
      lastPush: config.lastPush,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/github/config — Save GitHub config ───────────────────────────────
router.post("/github/config", requireYukiAccess, async (req, res) => {
  try {
    const { repoUrl, token } = req.body as { repoUrl?: string; token?: string };
    
    const existingConfig = await loadGitHubConfig();
    const newConfig: GitHubConfig = {
      repoUrl: repoUrl || existingConfig?.repoUrl || "",
      token: token || existingConfig?.token || "",
      lastPush: existingConfig?.lastPush,
    };
    
    await saveGitHubConfig(newConfig);
    
    res.json({
      success: true,
      message: "Configuración guardada",
      repoUrl: newConfig.repoUrl,
      tokenSet: !!newConfig.token,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/github/push — Push changes to GitHub ─────────────────────────────
router.post("/github/push", requireYukiAccess, async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    const config = await loadGitHubConfig();
    
    if (!config || !config.repoUrl || !config.token) {
      res.status(400).json({ error: "GitHub no configurado. Configura el repositorio y token primero." });
      return;
    }
    
    const commitMessage = message || `Actualización desde Yuki - ${new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`;
    
    // Parse repo URL to get owner/repo
    const repoMatch = config.repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!repoMatch) {
      res.status(400).json({ error: "URL de repositorio inválida" });
      return;
    }
    
    const [, owner, repo] = repoMatch;
    const authUrl = `https://${config.token}@github.com/${owner}/${repo}.git`;
    
    // Execute git commands
    const commands = [
      `cd ${WORKSPACE_ROOT}`,
      // Configure git if not configured
      `git config user.email "yuki@error707.studio" 2>/dev/null || true`,
      `git config user.name "Yuki AI" 2>/dev/null || true`,
      // Set remote with auth
      `git remote set-url origin "${authUrl}" 2>/dev/null || git remote add origin "${authUrl}" 2>/dev/null || true`,
      // Add all changes
      `git add -A`,
      // Commit
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}" 2>/dev/null || echo "No changes to commit"`,
      // Push
      `git push origin HEAD --force 2>&1`,
    ];
    
    const { stdout, stderr } = await execAsync(commands.join(" && "), {
      cwd: WORKSPACE_ROOT,
      timeout: 60000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    
    // Update last push time
    config.lastPush = new Date().toISOString();
    await saveGitHubConfig(config);
    
    // Check if push was successful
    const output = stdout + stderr;
    const success = !output.includes("fatal:") && !output.includes("error:");
    
    if (success) {
      res.json({
        success: true,
        message: "Cambios subidos a GitHub exitosamente 🎉",
        output: output.slice(0, 1000),
        commitMessage,
        timestamp: config.lastPush,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Error al subir cambios",
        output: output.slice(0, 1000),
      });
    }
  } catch (err: any) {
    res.status(500).json({
      error: "Error ejecutando git push",
      details: err.message,
      stdout: err.stdout?.slice(0, 500),
      stderr: err.stderr?.slice(0, 500),
    });
  }
});

// ── GET /api/github/status — Get git status ────────────────────────────────────
router.get("/github/status", requireYukiAccess, async (req, res) => {
  try {
    const { stdout: status } = await execAsync("git status --porcelain", {
      cwd: WORKSPACE_ROOT,
      timeout: 10000,
    });
    
    const { stdout: branch } = await execAsync("git branch --show-current 2>/dev/null || echo 'main'", {
      cwd: WORKSPACE_ROOT,
      timeout: 5000,
    });
    
    const { stdout: lastCommit } = await execAsync("git log -1 --format='%h - %s (%ar)' 2>/dev/null || echo 'No commits'", {
      cwd: WORKSPACE_ROOT,
      timeout: 5000,
    });
    
    const changes = status.trim().split("\n").filter(Boolean);
    
    res.json({
      branch: branch.trim(),
      lastCommit: lastCommit.trim(),
      changesCount: changes.length,
      changes: changes.slice(0, 50).map(line => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(3),
      })),
      hasChanges: changes.length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
