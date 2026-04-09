import { Router } from "express";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";

const router = Router();
const CONVERSATIONS_DIR = "/app/artifacts/api-server/yuki-conversations";
const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

// Ensure conversations directory exists
fs.mkdir(CONVERSATIONS_DIR, { recursive: true }).catch(() => {});

// Middleware to check Yuki access
const requireYukiAccess = (req: any, res: any, next: any) => {
  const token = req.headers["authorization"]?.slice(7) ?? null;
  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }
  try {
    const p = jwt.verify(token, JWT_SECRET!) as { userId: number; username: string; isAdmin: boolean };
    if (p.username !== "error707mty") {
      return res.status(403).json({ error: "Acceso denegado. Solo error707mty puede acceder a Yuki." });
    }
    req.yukiUser = p;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
};

// ── GET /api/yuki-conversations — Load conversation ─────────────────────────────
router.get("/yuki-conversations", requireYukiAccess, async (req: any, res) => {
  try {
    const userId = req.yukiUser.userId;
    const conversationFile = path.join(CONVERSATIONS_DIR, `user_${userId}.json`);
    
    try {
      const data = await fs.readFile(conversationFile, "utf-8");
      const conversation = JSON.parse(data);
      res.json({ messages: conversation.messages, updatedAt: conversation.updatedAt });
    } catch {
      // No conversation found, return empty
      res.json({ messages: [], updatedAt: null });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/yuki-conversations — Save conversation ────────────────────────────
router.post("/yuki-conversations", requireYukiAccess, async (req: any, res) => {
  try {
    const userId = req.yukiUser.userId;
    const { messages } = req.body;
    
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages must be an array" });
    }
    
    const conversation = {
      userId,
      messages,
      updatedAt: new Date().toISOString(),
    };
    
    const conversationFile = path.join(CONVERSATIONS_DIR, `user_${userId}.json`);
    await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2), "utf-8");
    
    res.json({ success: true, updatedAt: conversation.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /api/yuki-conversations — Clear conversation ─────────────────────────
router.delete("/yuki-conversations", requireYukiAccess, async (req: any, res) => {
  try {
    const userId = req.yukiUser.userId;
    const conversationFile = path.join(CONVERSATIONS_DIR, `user_${userId}.json`);
    
    try {
      await fs.unlink(conversationFile);
    } catch {}
    
    res.json({ success: true, message: "Conversación eliminada" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
