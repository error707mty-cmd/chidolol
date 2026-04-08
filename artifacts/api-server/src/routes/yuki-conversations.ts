import { Router } from "express";
import fs from "fs/promises";
import path from "path";

const router = Router();
const CONVERSATIONS_DIR = "/app/artifacts/api-server/yuki-conversations";

// Ensure conversations directory exists
fs.mkdir(CONVERSATIONS_DIR, { recursive: true }).catch(() => {});

// Middleware to check Yuki access
const requireYukiAccess = (req: any, res: any, next: any) => {
  const user = req.user;
  if (!user || user.username !== "error707mty") {
    return res.status(403).json({ error: "Acceso denegado. Solo error707mty puede acceder a Yuki." });
  }
  next();
};

// ── GET /api/yuki-conversations — Load conversation ─────────────────────────────
router.get("/yuki-conversations", requireYukiAccess, async (req, res) => {
  try {
    const userId = req.user.id;
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
router.post("/yuki-conversations", requireYukiAccess, async (req, res) => {
  try {
    const userId = req.user.id;
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
router.delete("/yuki-conversations", requireYukiAccess, async (req, res) => {
  try {
    const userId = req.user.id;
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
