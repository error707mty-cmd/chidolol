import { Router } from "express";
import { db, usersTable, uploadsTable } from "@workspace/db";
import { eq, ne, sql } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import chatRouter from "./chat";
import claudePageRouter from "./claude-page";
import posRouter from "./pos";

const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8765";

const router = Router();
router.use(claudePageRouter);
router.use(chatRouter);
router.use("/admin/pos", posRouter);

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

function requireAdmin(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; isAdmin: boolean };
    if (!payload.isAdmin) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    (req as typeof req & { adminUser: typeof payload }).adminUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

router.get("/admin/users", requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      displayName: usersTable.displayName,
      isAdmin: usersTable.isAdmin,
      isActive: usersTable.isActive,
      plan: usersTable.plan,
      emailVerified: usersTable.emailVerified,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json(users);
});

router.get("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    plan: user.plan,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  });
});

router.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const adminReq = req as typeof req & { adminUser: { userId: number } };

  const { isAdmin, isActive, plan, displayName, email, password } = req.body as {
    isAdmin?: boolean;
    isActive?: boolean;
    plan?: string;
    displayName?: string;
    email?: string;
    password?: string;
  };

  const patch: Record<string, unknown> = {};
  if (isAdmin !== undefined) {
    if (id === adminReq.adminUser.userId && isAdmin === false) {
      res.status(400).json({ error: "No puedes quitarte el rol de administrador" });
      return;
    }
    patch.isAdmin = isAdmin;
  }
  if (isActive !== undefined) {
    if (id === adminReq.adminUser.userId && isActive === false) {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
      return;
    }
    patch.isActive = isActive;
  }
  if (plan !== undefined) {
    if (!["client", "pro"].includes(plan)) {
      res.status(400).json({ error: "Plan inválido. Debe ser 'client' o 'pro'" });
      return;
    }
    patch.plan = plan;
  }
  if (displayName !== undefined) patch.displayName = displayName;
  if (email !== undefined) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existing && existing.id !== id) {
      res.status(409).json({ error: "Ese correo ya está en uso" });
      return;
    }
    patch.email = email;
  }
  if (password !== undefined && password.length >= 6) {
    patch.passwordHash = await bcrypt.hash(password, 12);
  }

  const [updated] = await db
    .update(usersTable)
    .set(patch as Parameters<typeof db.update>[0])
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      displayName: usersTable.displayName,
      isAdmin: usersTable.isAdmin,
      isActive: usersTable.isActive,
      plan: usersTable.plan,
      emailVerified: usersTable.emailVerified,
    });

  if (!updated) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  res.json(updated);
});

router.get("/admin/memberships", requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      displayName: usersTable.displayName,
      plan: usersTable.plan,
      isActive: usersTable.isActive,
      stripeCustomerId: usersTable.stripeCustomerId,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  let subscriptions: unknown[] = [];
  try {
    const result = await db.execute(sql`
      SELECT
        s.id,
        s.customer,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.cancel_at_period_end,
        si.price AS price_id,
        si.quantity,
        pr.unit_amount,
        pr.currency,
        pr.recurring
      FROM stripe.subscriptions s
      LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
      LEFT JOIN stripe.prices pr ON pr.id = si.price
      ORDER BY s.current_period_end DESC
    `);
    subscriptions = result.rows;
  } catch {
    subscriptions = [];
  }

  res.json({ users, subscriptions });
});

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const adminReq = req as typeof req & { adminUser: { userId: number } };

  if (id === adminReq.adminUser.userId) {
    res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    return;
  }

  const [target] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  if (target.isAdmin) {
    const [otherAdmin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(ne(usersTable.id, id));
    if (!otherAdmin) {
      res.status(400).json({ error: "No puedes eliminar al único administrador" });
      return;
    }
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

// ── GET /admin/storage — stats de almacenamiento ─────────────────────────────
router.get("/admin/storage", requireAdmin, async (_req, res) => {
  const UPLOADS_DIR = path.resolve(process.cwd(), "uploads_storage");

  const [dbRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(file_size_bytes),0)`, qty: sql<string>`COUNT(*)` })
    .from(uploadsTable);

  let diskFiles = 0;
  let diskBytes = 0;
  try {
    const files = await fs.readdir(UPLOADS_DIR);
    diskFiles = files.length;
    for (const f of files) {
      const stat = await fs.stat(path.join(UPLOADS_DIR, f)).catch(() => null);
      if (stat) diskBytes += stat.size;
    }
  } catch {}

  res.json({
    dbRecords: Number(dbRow.qty),
    dbBytes: Number(dbRow.total),
    diskFiles,
    diskBytes,
  });
});

// ── POST /admin/storage/purge — elimina archivos huérfanos ───────────────────
// Huérfano = archivo en disco sin registro en DB, o DB record sin archivo en disco
router.post("/admin/storage/purge", requireAdmin, async (_req, res) => {
  const UPLOADS_DIR = path.resolve(process.cwd(), "uploads_storage");

  // Get all filenames from DB
  const dbRows = await db.select({ filename: uploadsTable.filename }).from(uploadsTable);
  const dbFilenames = new Set(dbRows.map((r) => r.filename));

  let removedFiles = 0;
  let removedBytes = 0;
  let removedDbRecords = 0;

  // 1. Remove disk files not in DB
  try {
    const diskFiles = await fs.readdir(UPLOADS_DIR);
    for (const f of diskFiles) {
      // Skip temp files used during processing (prefixed with _)
      if (f.startsWith("_")) continue;
      if (!dbFilenames.has(f)) {
        const fpath = path.join(UPLOADS_DIR, f);
        const stat = await fs.stat(fpath).catch(() => null);
        if (stat) {
          removedBytes += stat.size;
          await fs.unlink(fpath).catch(() => {});
          removedFiles++;
        }
      }
    }
  } catch {}

  // 2. Remove DB records whose file doesn't exist on disk
  for (const row of dbRows) {
    try {
      await fs.access(path.join(UPLOADS_DIR, row.filename));
    } catch {
      // File not on disk — remove DB record
      await db.delete(uploadsTable).where(eq(uploadsTable.filename, row.filename));
      removedDbRecords++;
    }
  }

  res.json({ removedFiles, removedBytes, removedDbRecords });
});

// ── AI Config proxy (admin-only) ─────────────────────────────────────────────

router.get("/admin/ai-config", requireAdmin, async (_req, res) => {
  try {
    const r = await fetch(`${AI_SERVER_URL}/config`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "AI server no disponible", detail: String(err) });
  }
});

router.patch("/admin/ai-config", requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`${AI_SERVER_URL}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "AI server no disponible", detail: String(err) });
  }
});


// ── Conversations endpoints ──────────────────────────────────────────────────

// GET /admin/conversations?mode=trabajo|casual — listar conversaciones
router.get("/admin/conversations", requireAdmin, async (req, res) => {
  try {
    const mode = (req.query["mode"] as string) || "trabajo";
    const result = await db.execute(
      sql`SELECT id, title, mode, created_at, updated_at FROM conversations WHERE mode = ${mode} ORDER BY updated_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/conversations — crear nueva conversación
router.post("/admin/conversations", requireAdmin, async (req, res) => {
  try {
    const { title, mode } = req.body as { title?: string; mode?: string };
    const result = await db.execute(
      sql`INSERT INTO conversations (title, mode) VALUES (${title || "Nueva conversación"}, ${mode || "trabajo"}) RETURNING id, title, mode, created_at, updated_at`
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/conversations/:id/messages — cargar mensajes de una conversación
router.get("/admin/conversations/:id/messages", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const result = await db.execute(
      sql`SELECT id, role, content, tool_calls, created_at FROM messages WHERE conversation_id = ${id} ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/conversations/:id/messages — guardar mensaje
router.post("/admin/conversations/:id/messages", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const { role, content, tool_calls } = req.body as { role: string; content: string; tool_calls?: unknown };
    await db.execute(
      sql`INSERT INTO messages (conversation_id, role, content, tool_calls) VALUES (${id}, ${role}, ${content}, ${tool_calls ? JSON.stringify(tool_calls) : null})`
    );
    // Actualizar updated_at de la conversación
    await db.execute(sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /admin/conversations/:id — renombrar conversación
router.patch("/admin/conversations/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const { title } = req.body as { title: string };
    await db.execute(sql`UPDATE conversations SET title = ${title}, updated_at = NOW() WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /admin/conversations/:id — eliminar conversación
router.delete("/admin/conversations/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "", 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    await db.execute(sql`DELETE FROM conversations WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

