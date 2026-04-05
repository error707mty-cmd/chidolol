import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { spawn } from "child_process";
import { db, uploadsTable, pliegoImagesTable } from "@workspace/db";
import { desc, eq, count, sum, and, isNotNull } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { requireAuth } from "../../middlewares/requireAuth";

type AuthReq = Request & { user: { userId: number; username: string; isAdmin: boolean } };

const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB per regular user

async function getUserStorageUsed(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: sum(uploadsTable.fileSizeBytes) })
    .from(uploadsTable)
    .where(eq(uploadsTable.userId, userId));
  return Number(row?.total ?? 0);
}

async function checkQuota(userId: number, incomingBytes: number): Promise<{ ok: boolean; usedBytes: number }> {
  const usedBytes = await getUserStorageUsed(userId);
  return { ok: usedBytes + incomingBytes <= STORAGE_QUOTA_BYTES, usedBytes };
}

const MODELS_DIR    = path.resolve(process.cwd(), "models");
const INPAINT_PY    = path.resolve(process.cwd(), "inpaint.py");
const PYTHON_BIN    = process.env.PYTHON_BIN ?? "python3";
const PYTHON_ENV    = { ...process.env, NUMBA_DISABLE_JIT: "1" };

const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8765";
const AI_TIMEOUT_MS = 120_000; // 2 min max per request

/** Call the persistent AI server with a base64-encoded image. */
async function callAiServer(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ result_b64: string; width: number; height: number; elapsed_ms: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch(`${AI_SERVER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`AI server ${endpoint} → ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.json() as Promise<{ result_b64: string; width: number; height: number; elapsed_ms: number }>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * AI background removal via persistent Python server (rembg U2Net).
 * Much faster than spawning a new process — model stays in memory.
 */
async function runAiRemoveBg(inputPath: string, outputPath: string, tolerance = 30): Promise<void> {
  const srcBuffer = await fs.readFile(inputPath);
  const image_b64 = srcBuffer.toString("base64");
  const result = await callAiServer("/remove-bg", { image_b64, tolerance });
  const outBuffer = Buffer.from(result.result_b64, "base64");
  await fs.writeFile(outputPath, outBuffer);
}

/**
 * AI super-resolution via persistent Python server (EDSR).
 * Much faster than FSRCNN — EDSR model stays in memory after first load.
 */
async function runAiSuperRes(inputPath: string, outputPath: string, scale: number): Promise<void> {
  const srcBuffer = await fs.readFile(inputPath);
  const image_b64 = srcBuffer.toString("base64");
  const result = await callAiServer("/enhance", { image_b64, scale });
  const outBuffer = Buffer.from(result.result_b64, "base64");
  await fs.writeFile(outputPath, outBuffer);
}

function runInpaint(
  originalPath: string,
  maskPath: string,
  outputPath: string,
  radius = 5,
  method: "telea" | "ns" = "telea",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [
      INPAINT_PY, originalPath, maskPath, outputPath, String(radius), method,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`inpaint.py exited ${code}: ${stderr.trim()}`));
    });
    proc.on("error", reject);
  });
}

const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads_storage");

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/heic", "image/heif", "image/avif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no válido. Se permiten PNG, JPG, WEBP y SVG."));
    }
  },
});

async function processImage(
  buffer: Buffer,
  mimetype: string,
  trimTransparency: boolean,
  removeSemiTransparency: boolean,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  if (mimetype === "image/svg+xml") {
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 100, height: meta.height ?? 100 };
  }

  // ── Fast path: no pixel manipulation needed ───────────────────────
  if (!removeSemiTransparency) {
    // Always convert to PNG (handles WEBP, HEIC, AVIF, JPEG → PNG)
    let pipeline = sharp(buffer).ensureAlpha().png({ compressionLevel: 6 });
    if (trimTransparency) {
      pipeline = pipeline.trim({ threshold: 10 }) as typeof pipeline;
    }
    const result = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: result.data, width: result.info.width, height: result.info.height };
  }

  // ── Semi-transparency removal (requires raw pixel pass) ──────────
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelData = data;
  for (let i = 3; i < pixelData.length; i += 4) {
    const alpha = pixelData[i];
    if (alpha > 0 && alpha < 255) pixelData[i] = alpha > 127 ? 255 : 0;
  }

  let pipeline = sharp(pixelData, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png({ compressionLevel: 6 });

  if (trimTransparency) {
    pipeline = pipeline.trim({ threshold: 10 }) as typeof pipeline;
  }

  const result = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: result.data, width: result.info.width, height: result.info.height };
}

function getPublicUrl(filename: string): string {
  return `/api/uploads/files/${filename}`;
}

/**
 * BFS flood-fill background removal.
 * Detects background color from corners, then marks all connected
 * background pixels as transparent. Works great for DTF designs.
 */
async function removeBackgroundFloodFill(srcBuffer: Buffer, tolerance = 18): Promise<Buffer> {
  const { data, info } = await sharp(srcBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const channels = 4;
  const pixels = Buffer.from(data);
  const idx = (x: number, y: number) => (y * width + x) * channels;

  // ── Step 1: Sample background color using median of corner/edge points ────
  // More sample points → more robust detection (handles gradients/shadows)
  const samplePoints: [number, number][] = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0],           [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],          [width - 1, Math.floor(height / 2)],
    [Math.floor(width / 4), 0],           [Math.floor(3 * width / 4), 0],
    [Math.floor(width / 4), height - 1],  [Math.floor(3 * width / 4), height - 1],
    [0, Math.floor(height / 4)],          [0, Math.floor(3 * height / 4)],
    [width - 1, Math.floor(height / 4)],  [width - 1, Math.floor(3 * height / 4)],
  ];

  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const [cx, cy] of samplePoints) {
    const i = idx(cx, cy);
    if (pixels[i + 3] > 128) {
      rs.push(pixels[i]); gs.push(pixels[i + 1]); bs.push(pixels[i + 2]);
    }
  }

  if (rs.length === 0) {
    return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
  }

  // Use median (more robust than mean against outlier dark/light corners)
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
  const mid = Math.floor(rs.length / 2);
  const bgR = rs[mid], bgG = gs[mid], bgB = bs[mid];

  const colorDist = (r: number, g: number, b: number): number =>
    Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

  // BFS color distance tolerance (caller-configurable).
  // sqrt(ΔR²+ΔG²+ΔB²) < THRESHOLD — pixel is considered background.
  // Lower = safer (less of the design removed); higher = cleaner background removal.
  const THRESHOLD_OUTER = Math.max(5, Math.min(120, tolerance));

  const isBgAt = (x: number, y: number): boolean => {
    const i = idx(x, y);
    if (pixels[i + 3] < 20) return true; // already transparent
    return colorDist(pixels[i], pixels[i + 1], pixels[i + 2]) < THRESHOLD_OUTER;
  };

  // ── Step 2: Exterior BFS (4-directional) from all edges ──────────────────
  // 4-connectivity is more conservative than 8-dir: won't sneak through
  // diagonal gaps between design elements, avoiding cuts into the art.
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const seed = (x: number, y: number) => {
    const vi = y * width + x;
    if (visited[vi] || !isBgAt(x, y)) return;
    visited[vi] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seed(0, y); seed(width - 1, y); }

  const dirs4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi++], y = queue[qi++];
    for (const [dx, dy] of dirs4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const vi = ny * width + nx;
      if (visited[vi] || !isBgAt(nx, ny)) continue;
      visited[vi] = 1;
      queue.push(nx, ny);
    }
  }

  // ── Step 3: Erase confirmed background pixels ─────────────────────────────
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited[y * width + x] === 1) {
        pixels[idx(x, y) + 3] = 0;
      }
    }
  }

  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Safely delete an upload from disk + DB, but only if no pliego images reference it.
 */
async function safeDeleteUpload(uploadId: number): Promise<void> {
  try {
    // Check references
    const [{ refs }] = await db
      .select({ refs: count() })
      .from(pliegoImagesTable)
      .where(eq(pliegoImagesTable.uploadId, uploadId));

    if (Number(refs) > 0) return; // still in use

    const [upload] = await db.select().from(uploadsTable).where(eq(uploadsTable.id, uploadId));
    if (!upload) return;

    // Delete file from disk
    const filePath = path.join(UPLOADS_DIR, upload.filename);
    await fs.unlink(filePath).catch(() => {});

    // Delete trimmed file if exists
    if (upload.trimmedImageUrl) {
      const trimmedFilename = upload.trimmedImageUrl.split("/").pop();
      if (trimmedFilename) {
        await fs.unlink(path.join(UPLOADS_DIR, trimmedFilename)).catch(() => {});
      }
    }

    // Delete DB record
    await db.delete(uploadsTable).where(eq(uploadsTable.id, uploadId));
    logger.info({ uploadId }, "Old upload cleaned up");
  } catch (err) {
    logger.warn({ err, uploadId }, "Failed to clean up old upload");
  }
}

router.post("/uploads", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const { userId } = (req as AuthReq).user;
  await ensureUploadsDir();

  const trimTransparency = req.body.trimTransparency === "true" || req.body.trimTransparency === true;
  const removeSemiTransparency = req.body.removeSemiTransparency === "true" || req.body.removeSemiTransparency === true;

  try {
    const { buffer, width, height } = await processImage(
      req.file.buffer,
      req.file.mimetype,
      trimTransparency,
      removeSemiTransparency,
    );

    // ── Quota check (10 GB per regular user; admins have no limit) ───────
    const { isAdmin } = (req as AuthReq).user;
    if (!isAdmin) {
      const { ok, usedBytes } = await checkQuota(userId, buffer.length);
      if (!ok) {
        res.status(507).json({
          error: "Almacenamiento lleno",
          detail: `Has alcanzado tu límite de 10 GB. Elimina archivos para liberar espacio.`,
          usedBytes,
          quotaBytes: STORAGE_QUOTA_BYTES,
        });
        return;
      }
    }

    const ext = req.file.mimetype === "image/svg+xml" ? ".svg" : ".png";
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    await fs.writeFile(filepath, buffer);

    const [row] = await db.insert(uploadsTable).values({
      userId,
      filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      widthPx: width,
      heightPx: height,
      fileSizeBytes: buffer.length,
      imageUrl: getPublicUrl(filename),
      trimmedImageUrl: null,
    }).returning();

    req.log.info({ uploadId: row.id }, "Image uploaded");
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to process uploaded image");
    res.status(500).json({ error: "Failed to process image" });
  }
});

router.get("/uploads/recent", requireAuth, async (req, res): Promise<void> => {
  const { userId } = (req as AuthReq).user;
  const rows = await db
    .select()
    .from(uploadsTable)
    .where(eq(uploadsTable.userId, userId))
    .orderBy(desc(uploadsTable.createdAt))
    .limit(50);
  res.json(rows);
});

router.get("/uploads/quota", requireAuth, async (req, res): Promise<void> => {
  const { userId } = (req as AuthReq).user;
  const usedBytes = await getUserStorageUsed(userId);
  res.json({
    usedBytes,
    quotaBytes: STORAGE_QUOTA_BYTES,
    usedPercent: Math.round((usedBytes / STORAGE_QUOTA_BYTES) * 1000) / 10,
  });
});

router.get("/uploads/files/:filename", async (req, res): Promise<void> => {
  const raw = req.params.filename;
  const filename = Array.isArray(raw) ? raw[0] : raw;
  const filepath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.access(filepath);
    // Immutable files (UUID filenames never change content) — cache for 1 year
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(filepath);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// ── Thumbnail: serve a small resized preview (for sidebar list) ───────────────
router.get("/uploads/files/:filename/thumb", async (req, res): Promise<void> => {
  const raw = req.params.filename;
  const filename = Array.isArray(raw) ? raw[0] : raw;
  const filepath = path.join(UPLOADS_DIR, filename);
  const w = Math.min(parseInt(String(req.query.w ?? "100"), 10) || 100, 400);

  try {
    await fs.access(filepath);
    // SVG/PNG/JPG: resize directly (sharp handles all formats)
    const srcBuffer = await fs.readFile(filepath);
    const thumb = await sharp(srcBuffer)
      .resize(w, w, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 6, effort: 1 })
      .toBuffer();

    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", "image/png");
    res.send(thumb);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.post("/uploads/:uploadId/duplicate", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId } = (req as AuthReq).user;

  const countRaw = req.body?.count;
  const count2 = typeof countRaw === "number" ? countRaw : parseInt(String(countRaw), 10);

  if (isNaN(uploadId)) {
    res.status(400).json({ error: "Invalid upload ID" });
    return;
  }

  if (isNaN(count2) || count2 < 1 || count2 > 50) {
    res.status(400).json({ error: "count must be between 1 and 50" });
    return;
  }

  const [original] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.id, uploadId), eq(uploadsTable.userId, userId)));
  if (!original) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  // Quota: count2 copies of the same size (admins are exempt)
  const { isAdmin: isAdminDup } = (req as AuthReq).user;
  if (!isAdminDup) {
    const { ok, usedBytes } = await checkQuota(userId, original.fileSizeBytes * count2);
    if (!ok) {
      res.status(507).json({ error: "Almacenamiento lleno", usedBytes, quotaBytes: STORAGE_QUOTA_BYTES });
      return;
    }
  }

  await ensureUploadsDir();
  const duplicates: typeof original[] = [];

  for (let i = 0; i < count2; i++) {
    const ext = path.extname(original.filename);
    const newFilename = `${uuidv4()}${ext}`;
    const srcPath = path.join(UPLOADS_DIR, original.filename);
    const destPath = path.join(UPLOADS_DIR, newFilename);

    try {
      await fs.copyFile(srcPath, destPath);
    } catch (err) {
      logger.warn({ err }, "Could not copy file for duplicate, reusing original URL");
    }

    let newTrimmedUrl: string | null = null;
    if (original.trimmedImageUrl) {
      const trimFilename = `trimmed_${newFilename.replace(/\.svg$/, ".png")}`;
      const trimSrc = path.join(UPLOADS_DIR, `trimmed_${original.filename.replace(/\.svg$/, ".png")}`);
      const trimDest = path.join(UPLOADS_DIR, trimFilename);
      try {
        await fs.copyFile(trimSrc, trimDest);
        newTrimmedUrl = getPublicUrl(trimFilename);
      } catch {
        newTrimmedUrl = original.trimmedImageUrl;
      }
    }

    const [dup] = await db.insert(uploadsTable).values({
      userId,
      filename: newFilename,
      originalName: original.originalName,
      mimeType: original.mimeType,
      widthPx: original.widthPx,
      heightPx: original.heightPx,
      fileSizeBytes: original.fileSizeBytes,
      imageUrl: getPublicUrl(newFilename),
      trimmedImageUrl: newTrimmedUrl,
    }).returning();

    duplicates.push(dup);
  }

  res.status(201).json(duplicates);
});

// ─── Background Removal (server-side, no external API) ────────────────────────
router.post("/uploads/:uploadId/remove-bg", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId } = (req as AuthReq).user;
  if (isNaN(uploadId)) {
    res.status(400).json({ error: "Invalid upload ID" });
    return;
  }

  const [original] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.id, uploadId), eq(uploadsTable.userId, userId)));
  if (!original) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  await ensureUploadsDir();
  const srcPath = path.join(UPLOADS_DIR, original.filename);

  const newFilename = `${uuidv4()}.png`;
  const destPath    = path.join(UPLOADS_DIR, newFilename);
  const tmpSrc      = path.join(UPLOADS_DIR, `_rmbg_src_${newFilename}`);

  try {
    const srcBuffer = await fs.readFile(srcPath);

    // Write source as PNG for Python script
    await sharp(srcBuffer).png().toFile(tmpSrc);

    const aiTolerance = typeof req.body?.tolerance === "number" ? req.body.tolerance : 30;
    try {
      // ── AI background removal via rembg U2Net ────────────────────────────
      await runAiRemoveBg(tmpSrc, destPath, aiTolerance);
    } finally {
      await fs.unlink(tmpSrc).catch(() => {});
    }

    const resultBuffer = await fs.readFile(destPath);
    const meta = await sharp(resultBuffer).metadata();

    const { isAdmin: isAdminBg } = (req as AuthReq).user;
    if (!isAdminBg) {
      const { ok, usedBytes } = await checkQuota(userId, resultBuffer.length);
      if (!ok) {
        await fs.unlink(destPath).catch(() => {});
        res.status(507).json({ error: "Almacenamiento lleno", usedBytes, quotaBytes: STORAGE_QUOTA_BYTES });
        return;
      }
    }

    const [row] = await db.insert(uploadsTable).values({
      userId,
      filename: newFilename,
      originalName: `${original.originalName}_nobg.png`,
      mimeType: "image/png",
      widthPx: meta.width ?? original.widthPx,
      heightPx: meta.height ?? original.heightPx,
      fileSizeBytes: resultBuffer.length,
      imageUrl: getPublicUrl(newFilename),
      trimmedImageUrl: null,
    }).returning();

    req.log.info({ uploadId: row.id, originalId: uploadId }, "Background removed (AI)");
    res.status(201).json(row);
  } catch (err) {
    await fs.unlink(destPath).catch(() => {});
    req.log.error({ err }, "Failed to remove background");
    res.status(500).json({ error: "Failed to remove background" });
  }
});

// ─── Upscale ─────────────────────────────────────────────────────────────────
router.post("/uploads/:uploadId/upscale", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId } = (req as AuthReq).user;
  if (isNaN(uploadId)) {
    res.status(400).json({ error: "Invalid upload ID" });
    return;
  }

  const scale = parseInt(String(req.body?.scale ?? req.query?.scale ?? "2"), 10);
  if (![2, 3, 4].includes(scale)) {
    res.status(400).json({ error: "scale must be 2, 3 or 4" });
    return;
  }

  const [original] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.id, uploadId), eq(uploadsTable.userId, userId)));
  if (!original) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  await ensureUploadsDir();
  const srcPath = path.join(UPLOADS_DIR, original.filename);

  try {
    const srcBuffer = await fs.readFile(srcPath);
    const meta = await sharp(srcBuffer).metadata();
    const newW = (meta.width ?? 100) * scale;
    const newH = (meta.height ?? 100) * scale;

    // ── AI Super-Resolution via waifu2x cunet (ONNX) ─────────────────────
    const newFilename = `${uuidv4()}.png`;
    const destPath    = path.join(UPLOADS_DIR, newFilename);
    const tmpSrc      = path.join(UPLOADS_DIR, `_sr_src_${newFilename}`);

    // Write source as PNG for the Python script
    await sharp(srcBuffer).png().toFile(tmpSrc);

    try {
      await runAiSuperRes(tmpSrc, destPath, scale);
    } catch (aiErr) {
      // Fallback: basic sharp upscale if Python fails
      req.log.warn({ err: aiErr }, "AI SR failed, falling back to sharp");
      const fallback = await sharp(srcBuffer)
        .resize(newW, newH, { kernel: sharp.kernel.lanczos3 })
        .sharpen({ sigma: 1.2, m1: 2.5, m2: 0.7 })
        .normalize()
        .png()
        .toBuffer();
      await fs.writeFile(destPath, fallback);
    } finally {
      await fs.unlink(tmpSrc).catch(() => {});
    }

    const upscaledBuffer = await fs.readFile(destPath);
    const outMeta = await sharp(upscaledBuffer).metadata();

    const { isAdmin: isAdminUp } = (req as AuthReq).user;
    if (!isAdminUp) {
      const { ok, usedBytes } = await checkQuota(userId, upscaledBuffer.length);
      if (!ok) {
        await fs.unlink(destPath).catch(() => {});
        res.status(507).json({ error: "Almacenamiento lleno", usedBytes, quotaBytes: STORAGE_QUOTA_BYTES });
        return;
      }
    }

    const [row] = await db.insert(uploadsTable).values({
      userId,
      filename: newFilename,
      originalName: `${original.originalName}_${scale}x_AI.png`,
      mimeType: "image/png",
      widthPx:  outMeta.width  ?? newW,
      heightPx: outMeta.height ?? newH,
      fileSizeBytes: upscaledBuffer.length,
      imageUrl: getPublicUrl(newFilename),
      trimmedImageUrl: null,
    }).returning();

    req.log.info({ uploadId: row.id, scale }, "Image AI-upscaled via waifu2x cunet");
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to upscale image");
    res.status(500).json({ error: "Failed to upscale image" });
  }
});

// ── POST /uploads/:uploadId/inpaint ─────────────────────────────────────────
// Accepts a binary mask (white = fill this region) and runs cv2.inpaint.
// Returns a new upload row with the inpainted image.
const uploadMask = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/uploads/:uploadId/inpaint", requireAuth, uploadMask.single("mask"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId, isAdmin: isAdminInp } = (req as AuthReq).user;
  if (isNaN(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }
  if (!req.file) { res.status(400).json({ error: "mask file is required" }); return; }

  const radius = Math.max(1, Math.min(30, parseInt(String(req.body?.radius ?? "5"), 10) || 5));
  const method: "telea" | "ns" = req.body?.method === "ns" ? "ns" : "telea";

  const [original] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.id, uploadId), eq(uploadsTable.userId, userId)));
  if (!original) { res.status(404).json({ error: "Upload not found" }); return; }

  await ensureUploadsDir();

  const newFilename = `${uuidv4()}.png`;
  const srcPath     = path.join(UPLOADS_DIR, original.filename);
  const maskPath    = path.join(UPLOADS_DIR, `_mask_${newFilename}`);
  const destPath    = path.join(UPLOADS_DIR, newFilename);

  try {
    // Write the mask to disk
    const maskPng = await sharp(req.file.buffer).png().toBuffer();
    await fs.writeFile(maskPath, maskPng);

    // Convert source to PNG for Python (handles JPEGs too)
    const srcBuffer = await fs.readFile(srcPath);
    const tmpSrc    = path.join(UPLOADS_DIR, `_inp_src_${newFilename}`);
    await sharp(srcBuffer).png().toFile(tmpSrc);

    try {
      await runInpaint(tmpSrc, maskPath, destPath, radius, method);
    } finally {
      await fs.unlink(tmpSrc).catch(() => {});
      await fs.unlink(maskPath).catch(() => {});
    }

    const resultBuffer = await fs.readFile(destPath);
    const outMeta = await sharp(resultBuffer).metadata();

    if (!isAdminInp) {
      const { ok, usedBytes } = await checkQuota(userId, resultBuffer.length);
      if (!ok) {
        await fs.unlink(destPath).catch(() => {});
        res.status(507).json({ error: "Almacenamiento lleno", usedBytes, quotaBytes: STORAGE_QUOTA_BYTES });
        return;
      }
    }

    const [row] = await db.insert(uploadsTable).values({
      userId,
      filename:      newFilename,
      originalName:  `${original.originalName}_inpainted.png`,
      mimeType:      "image/png",
      widthPx:       outMeta.width  ?? original.widthPx,
      heightPx:      outMeta.height ?? original.heightPx,
      fileSizeBytes: resultBuffer.length,
      imageUrl:      getPublicUrl(newFilename),
      trimmedImageUrl: null,
    }).returning();

    req.log.info({ uploadId: row.id, method, radius }, "Image inpainted via OpenCV");
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to inpaint image");
    await fs.unlink(destPath).catch(() => {});
    res.status(500).json({ error: "Failed to inpaint image" });
  }
});

// ─── DTF Halftone ─────────────────────────────────────────────────────────────
router.post("/uploads/:uploadId/halftone", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId, isAdmin } = (req as AuthReq).user;
  if (isNaN(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }

  const bgColor    = String(req.body?.bgColor ?? "#000000").trim();
  const reqLPI     = Number(req.body?.lpi)      || 30;
  const reqAngle   = Number(req.body?.angleDeg) ??  7;
  const userLPI    = Math.min(Math.max(reqLPI,   5), 120);
  const userAngle  = Math.min(Math.max(reqAngle, 0),  90);
  const dotShape   = (["round","ellipse","square","diamond","line"].includes(String(req.body?.dotShape)) ? String(req.body.dotShape) : "round") as "round"|"ellipse"|"square"|"diamond"|"line";
  const hardness   = Math.min(Math.max(Number(req.body?.hardness ?? 0.5), 0), 1);
  const tolerance  = Math.min(Math.max(Number(req.body?.tolerance ?? 30), 0), 200);

  const [original] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.id, uploadId), eq(uploadsTable.userId, userId)));
  if (!original) { res.status(404).json({ error: "Upload not found" }); return; }

  await ensureUploadsDir();
  const srcPath = path.join(UPLOADS_DIR, original.filename);

  try {
    const srcBuffer = await fs.readFile(srcPath);

    // Process at up to 3000px so halftone dots are fine enough to look clean.
    const meta = await sharp(srcBuffer).metadata();
    const origW = meta.width ?? 800;
    const origH = meta.height ?? 800;
    const maxDim = 3000;
    const scaleFactor = Math.min(1, maxDim / Math.max(origW, origH));
    const procW = Math.round(origW * scaleFactor);
    const procH = Math.round(origH * scaleFactor);

    const { data, info } = await sharp(srcBuffer)
      .resize(procW, procH)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;

    // Pre-process: hard alpha threshold BEFORE halftone.
    // DTF RIP printers need binary alpha. Semi-transparent pixels from remove-bg
    // or feathered edges cause artifacts in the halftone pattern, so we
    // eliminate them here (in addition to the final pass below).
    for (let i = 3; i < data.length; i += 4) {
      data[i] = data[i] < 128 ? 0 : 255;
    }

    // Parse target/garment color (bgColor = shirt color to perforate)
    const parseHex = (hex: string): [number, number, number] => {
      const h = hex.replace("#", "").padEnd(6, "0");
      return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
    };
    const [tR, tG, tB] = parseHex(bgColor.startsWith("#") ? bgColor : "#000000");

    // ── DTF Perforating Halftone ────────────────────────────────────────────
    //
    //  Algorithm ported from professional DTF halftone studio:
    //
    //  • Starts from the original full-color image (preserves all RGB values).
    //  • Punches holes (alpha = 0) based on color proximity to the target/
    //    garment color. Pixels close to the garment color get large holes;
    //    pixels far from it (the actual design) are nearly untouched.
    //  • The result lets fabric breathe through the ink at gradients/edges.
    //  • Hard alpha threshold at the end ensures clean RIP output.
    //
    //  Parameters:
    //    bgColor   → garment/shirt color (target to perforate)
    //    lpi       → lines per inch (controls cell size)
    //    angleDeg  → halftone grid rotation
    //    dotShape  → round / ellipse / square / diamond / line
    //    hardness  → controls how aggressively distant colors are perforated
    //                (0 = very aggressive, 1 = only pixels near target)
    //    tolerance → base sensitivity (mirrors UI slider, default 30)

    const effDPI   = 200;
    const cellSize = Math.max(4, Math.round((effDPI / userLPI) * scaleFactor));

    // euclidean color distance from garment color
    const colorDist = (r1: number, g1: number, b1: number): number =>
      Math.sqrt((r1 - tR) ** 2 + (g1 - tG) ** 2 + (b1 - tB) ** 2);

    // Max possible distance from this garment color to any point in RGB space
    // (farthest corner of the color cube from the garment color)
    const maxDistFromGarment = Math.sqrt(
      Math.max(tR, 255 - tR) ** 2 +
      Math.max(tG, 255 - tG) ** 2 +
      Math.max(tB, 255 - tB) ** 2
    );

    // sensitivity: how far from garment color we still punch holes.
    //
    //   hardness=1.0 → only pixels truly close to garment get perforated.
    //                  design colors far from the garment survive intact.
    //   hardness=0.0 → more uniform perforation across the entire image.
    //   tolerance    → extra reach (UI slider).
    //
    // OLD formula (too aggressive — perforated ALL colors including the design):
    //   sensitivity = maxDistFromGarment * (1 + (1 - hardness) * 0.6) + tolerance * 1.5
    //   → For black garment + hardness=1: sensitivity ≈ 485 (captures full RGB space!)
    //
    // NEW formula: only perforates the nearest ~55% of the color range from the garment.
    //   → For black garment + hardness=1: sensitivity ≈ 257
    //   → Vivid design colors (Pikachu yellow distance ≈ 335) → NOT perforated → no burning.
    //   → Shadow/dark areas (distance ≈ 60) → perforated correctly.
    const sensitivity = maxDistFromGarment * (0.55 + (1 - hardness) * 0.45) + tolerance * 0.5;

    // ── Pass 0: Direct solid elimination for pixels very close to garment color ─
    //
    // Pixels extremely close to the garment (closeness >= ELIM_THRESHOLD) are made
    // fully transparent WITHOUT halftone — the fabric itself provides this color.
    // This ensures near-zero garment-color ink on the corresponding fabric zone.
    //
    // ELIM_THRESHOLD = 0.72 means: any pixel within 28% of sensitivity distance
    // from the garment gets wiped out completely.
    //   e.g. Black garment, sensitivity≈257 → pixels within distance ~72 of black
    //        (very dark tones, RGB ≤ ~51) → fully transparent.
    const ELIM_THRESHOLD = 0.72;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const cDistE = colorDist(data[i], data[i + 1], data[i + 2]);
      const closenessE = 1 - Math.min(cDistE / sensitivity, 1);
      if (closenessE >= ELIM_THRESHOLD) {
        data[i + 3] = 0;
      }
    }

    // ── Halftone perforating pass ────────────────────────────────────────────
    // Pixels that survived Pass 0 (mid-range dark to vivid) get halftone treatment.
    // maxHoleSize raised to 88% (was 65%) and power lowered to 1.5 (was 2.2) so
    // the transition zone (dark-gray to medium) gets much larger holes → more
    // garment-color fabric breathes through.
    function applyHalftonePass(src: Buffer, angleDeg: number): Buffer {
      const out = Buffer.from(src);
      const angle = (angleDeg * Math.PI) / 180;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (out[idx + 3] === 0) continue; // skip already-transparent (Pass 0 + original alpha)

          // Rotate pixel into halftone grid space
          const u  = x * cos + y * sin;
          const v  = y * cos - x * sin;
          // Nearest cell centre in rotated space
          const cx = (Math.floor(u / cellSize) + 0.5) * cellSize;
          const cy = (Math.floor(v / cellSize) + 0.5) * cellSize;
          const dx = u - cx;
          const dy = v - cy;

          // Distance from cell centre for the chosen dot shape
          let distToCenter: number;
          if (dotShape === "line") {
            distToCenter = Math.abs(dy);
          } else if (dotShape === "diamond") {
            distToCenter = (Math.abs(dx) + Math.abs(dy)) / Math.SQRT2;
          } else if (dotShape === "square") {
            distToCenter = Math.max(Math.abs(dx), Math.abs(dy));
          } else if (dotShape === "ellipse") {
            distToCenter = Math.sqrt(dx * dx * 0.7 + dy * dy * 1.3);
          } else {
            distToCenter = Math.sqrt(dx * dx + dy * dy); // round
          }

          // How close is this pixel to the target garment color?
          // closeness=1 → identical to garment → full hole
          // closeness=0 → opposite to garment  → no hole
          const cDist    = colorDist(out[idx], out[idx + 1], out[idx + 2]);
          const closeness = 1 - Math.min(cDist / sensitivity, 1);
          // maxHoleSize 0.88 (was 0.65) → holes up to 88% of cell width (much more garment removed).
          // Power 1.5 (was 2.2) → softer curve: mid-range darks now get significantly larger holes.
          const maxHoleSize = cellSize * 0.88;
          const holeRadius  = maxHoleSize * Math.pow(closeness, 1.5);

          // Punch hole if pixel falls inside the halftone dot
          if (holeRadius > 0.5 && distToCenter < holeRadius) {
            out[idx + 3] = 0;
          }
        }
      }
      return out;
    }

    // 1. Start from source image (with Pass 0 already applied)
    const outData = applyHalftonePass(Buffer.from(data), userAngle);

    // 2. Hard alpha threshold — critical for DTF RIP printers
    for (let i = 3; i < outData.length; i += 4) {
      outData[i] = outData[i] < 128 ? 0 : 255;
    }

    // Output PNG with transparency preserved
    const resultBuffer = await sharp(outData, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();

    const newFilename = `${uuidv4()}.png`;

    if (!isAdmin) {
      const { ok, usedBytes } = await checkQuota(userId, resultBuffer.length);
      if (!ok) {
        res.status(507).json({ error: "Almacenamiento lleno", usedBytes, quotaBytes: STORAGE_QUOTA_BYTES });
        return;
      }
    }

    await fs.writeFile(path.join(UPLOADS_DIR, newFilename), resultBuffer);

    const [row] = await db.insert(uploadsTable).values({
      userId,
      filename: newFilename,
      originalName: `${original.originalName}_halftone.png`,
      mimeType: "image/png",
      widthPx: width,
      heightPx: height,
      fileSizeBytes: resultBuffer.length,
      imageUrl: getPublicUrl(newFilename),
      trimmedImageUrl: null,
    }).returning();

    req.log.info({ uploadId: row.id, originalId: uploadId, cellSize, angleDeg: userAngle, LPI: userLPI, dotShape, hardness, tolerance, sensitivity }, "Halftone applied");
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to apply halftone");
    res.status(500).json({ error: "Failed to apply halftone" });
  }
});

// ─── Replace upload file in-place (used by inline text editor) ───────────────
router.post("/uploads/:uploadId/replace", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId } = (req as AuthReq).user;
  if (isNaN(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

  const [original] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.id, uploadId), eq(uploadsTable.userId, userId)));
  if (!original) { res.status(404).json({ error: "Upload not found" }); return; }

  await ensureUploadsDir();

  try {
    const { buffer, width, height } = await processImage(req.file.buffer, req.file.mimetype, true, true);

    const newFilename = `${uuidv4()}.png`;
    const newPath = path.join(UPLOADS_DIR, newFilename);
    await fs.writeFile(newPath, buffer);

    const trimmedFilename = `trimmed_${newFilename}`;
    const trimmedPath = path.join(UPLOADS_DIR, trimmedFilename);
    await fs.writeFile(trimmedPath, buffer);

    const [updated] = await db
      .update(uploadsTable)
      .set({
        filename: newFilename,
        imageUrl: getPublicUrl(newFilename),
        trimmedImageUrl: getPublicUrl(trimmedFilename),
        widthPx: width,
        heightPx: height,
        fileSizeBytes: buffer.length,
      })
      .where(eq(uploadsTable.id, uploadId))
      .returning();

    try {
      await fs.unlink(path.join(UPLOADS_DIR, original.filename));
    } catch { /* best-effort */ }

    req.log.info({ uploadId }, "Upload replaced in-place");
    res.status(200).json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to replace upload");
    res.status(500).json({ error: "Failed to replace upload" });
  }
});

// ─── Safe cleanup of an upload (only deletes if unreferenced) ────────────────
router.delete("/uploads/:uploadId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = parseInt(rawId, 10);
  const { userId } = (req as AuthReq).user;
  if (isNaN(uploadId)) {
    res.status(400).json({ error: "Invalid upload ID" });
    return;
  }

  // Only allow deleting own uploads (admins bypass this)
  const [upload] = await db.select().from(uploadsTable).where(eq(uploadsTable.id, uploadId));
  if (!upload) { res.sendStatus(204); return; }
  if (upload.userId !== null && upload.userId !== userId) {
    res.status(403).json({ error: "No tienes permiso para eliminar este archivo" });
    return;
  }

  await safeDeleteUpload(uploadId);
  res.sendStatus(204);
});

export default router;
