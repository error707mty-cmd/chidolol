import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendVerificationEmail, emailEnabled } from "../../lib/mailer.js";

const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    req.user = jwt.verify(token, JWT_SECRET!) as { userId: number; username: string; isAdmin: boolean };
    next();
  } catch { res.status(401).json({ error: "Token inválido o expirado" }); }
}

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Usuario y contraseña requeridos" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Credenciales incorrectas" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Cuenta desactivada. Contacta al administrador." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciales incorrectas" });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.isAdmin },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    username: user.username,
    isAdmin: user.isAdmin,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    plan: user.plan ?? "client",
  });
});

router.post("/auth/register", async (req, res) => {
  const { username, password, email, displayName } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    displayName?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Usuario y contraseña requeridos" });
    return;
  }

  if (!email) {
    res.status(400).json({ error: "El correo electrónico es requerido" });
    return;
  }

  if (username.length < 3 || username.length > 30) {
    res.status(400).json({ error: "El usuario debe tener entre 3 y 30 caracteres" });
    return;
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    res.status(400).json({ error: "El usuario solo puede contener letras, números, _ . -" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
  if (existing) {
    res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
    return;
  }

  const [existingEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existingEmail) {
    res.status(409).json({ error: "Ese correo electrónico ya está registrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [created] = await db.insert(usersTable).values({
    username,
    passwordHash,
    email,
    displayName: displayName ?? username,
    isAdmin: false,
    isActive: true,
    emailVerified: !emailEnabled,
    emailVerificationToken: emailEnabled ? verificationToken : null,
    emailVerificationExpiry: emailEnabled ? verificationExpiry : null,
  }).returning();

  if (emailEnabled) {
    await sendVerificationEmail(email, verificationToken).catch(() => null);
    res.status(201).json({
      requiresVerification: true,
      message: "Cuenta creada. Revisa tu correo para verificar tu cuenta.",
    });
    return;
  }

  const token = jwt.sign(
    { userId: created.id, username: created.username, isAdmin: created.isAdmin },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({
    token,
    username: created.username,
    isAdmin: created.isAdmin,
    displayName: created.displayName,
    avatarUrl: created.avatarUrl,
    emailVerified: created.emailVerified,
  });
});

router.get("/auth/verify-email", async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).send("Token inválido");
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.emailVerificationToken, token));

  if (!user || !user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
    res.status(400).send("El enlace de verificación ha expirado o es inválido.");
    return;
  }

  await db.update(usersTable)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null })
    .where(eq(usersTable.id, user.id));

  const appBase = process.env["APP_URL"] ?? "";
  res.redirect(`${appBase}/?verified=1`);
});

router.get("/auth/me", requireAuth, async (req: any, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  res.json({
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    plan: user.plan ?? "client",
  });
});

router.patch("/auth/me", requireAuth, async (req: any, res) => {
  const { displayName, email } = req.body as { displayName?: string; email?: string };
  const userId = req.user.userId;

  if (email) {
    const [existingEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (existingEmail && existingEmail.id !== userId) {
      res.status(409).json({ error: "Ese correo ya está en uso" });
      return;
    }
  }

  const [updated] = await db.update(usersTable)
    .set({
      ...(displayName !== undefined && { displayName }),
      ...(email !== undefined && { email }),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({
    userId: updated.id,
    username: updated.username,
    displayName: updated.displayName,
    email: updated.email,
    avatarUrl: updated.avatarUrl,
    isAdmin: updated.isAdmin,
    emailVerified: updated.emailVerified,
  });
});

router.patch("/auth/me/password", requireAuth, async (req: any, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Se requieren la contraseña actual y la nueva" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "La contraseña actual es incorrecta" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));

  res.json({ ok: true, message: "Contraseña actualizada correctamente" });
});

router.patch("/auth/me/avatar", requireAuth, async (req: any, res) => {
  const { avatarUrl } = req.body as { avatarUrl?: string };
  if (!avatarUrl) {
    res.status(400).json({ error: "URL de avatar requerida" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ avatarUrl })
    .where(eq(usersTable.id, req.user.userId))
    .returning();

  res.json({ avatarUrl: updated.avatarUrl });
});

router.patch("/auth/me/plan", requireAuth, async (req: any, res) => {
  const { plan } = req.body as { plan?: string };
  if (!plan || !["client", "pro"].includes(plan)) {
    res.status(400).json({ error: "Plan inválido. Debe ser 'client' o 'pro'" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ plan })
    .where(eq(usersTable.id, req.user.userId))
    .returning();

  res.json({ plan: updated.plan });
});

router.get("/auth/oauth/:provider", (req, res) => {
  const { provider } = req.params;
  const APP_URL = process.env["APP_URL"] ?? "";
  const base = APP_URL.replace(/\/$/, "");

  if (provider === "google") {
    const clientId = process.env["GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      res.redirect(`${base}/?oauthError=Google OAuth no está configurado. Contacta al administrador.`);
      return;
    }
    const redirectUri = encodeURIComponent(`${base}/api/auth/oauth/google/callback`);
    const scope = encodeURIComponent("openid email profile");
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`);
    return;
  }

  if (provider === "facebook") {
    const appId = process.env["FACEBOOK_APP_ID"];
    const appSecret = process.env["FACEBOOK_APP_SECRET"];
    if (!appId || !appSecret) {
      res.redirect(`${base}/?oauthError=Facebook OAuth no está configurado. Contacta al administrador.`);
      return;
    }
    const redirectUri = encodeURIComponent(`${base}/api/auth/oauth/facebook/callback`);
    res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=email,public_profile`);
    return;
  }

  res.redirect(`${base}/?oauthError=Proveedor OAuth no soportado`);
});

export default router;
