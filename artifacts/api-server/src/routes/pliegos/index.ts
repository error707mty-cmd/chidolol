import { Router, type IRouter, type Request } from "express";
import { db, pliegosTable, pliegoImagesTable, uploadsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

type AuthReq = Request & { user: { userId: number; username: string; isAdmin: boolean } };
import {
  CreatePliegoBody,
  UpdatePliegoBody,
  GetPliegoParams,
  UpdatePliegoParams,
  DeletePliegoParams,
  ListPliegoImagesParams,
  AddImageToPliegoParams,
  AddImageToPliegoBody,
  UpdatePliegoImageParams,
  UpdatePliegoImageBody,
  RemovePliegoImageParams,
  AutoNestPliegoParams,
  GetPliegoPriceParams,
  ExportPliegoParams,
  ExportPliegoBody,
  GetPliegoStatsParams,
} from "@workspace/api-zod";
import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { PDFDocument, PDFName, PDFString, PDFNumber } from "pdf-lib";
import { deflateSync } from "zlib";
import { FOGRA39_ICC } from "../../icc/profiles";

const execFileAsync = promisify(execFile);
// process.cwd() is always artifacts/api-server/ regardless of compiled output dir
const ICC_DIR = path.join(process.cwd(), "src", "icc");
const CONVERT_CMYK_PY  = path.join(ICC_DIR, "convert_cmyk.py");
const FOGRA39_ICC_PATH = path.join(ICC_DIR, "FOGRA39.icc");

const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads_storage");

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function getPublicUrl(filename: string): string {
  return `/api/uploads/files/${filename}`;
}

async function getPliegoWithImages(id: number) {
  const [pliego] = await db.select().from(pliegosTable).where(eq(pliegosTable.id, id));
  return pliego;
}

async function getPliegoImages(pliegoId: number) {
  const rows = await db
    .select({
      id: pliegoImagesTable.id,
      pliegoId: pliegoImagesTable.pliegoId,
      uploadId: pliegoImagesTable.uploadId,
      xCm: pliegoImagesTable.xCm,
      yCm: pliegoImagesTable.yCm,
      widthCm: pliegoImagesTable.widthCm,
      heightCm: pliegoImagesTable.heightCm,
      rotation: pliegoImagesTable.rotation,
      zIndex: pliegoImagesTable.zIndex,
      quantity: pliegoImagesTable.quantity,
      imageUrl: uploadsTable.imageUrl,
      originalWidthPx: uploadsTable.widthPx,
      originalHeightPx: uploadsTable.heightPx,
      createdAt: pliegoImagesTable.createdAt,
    })
    .from(pliegoImagesTable)
    .innerJoin(uploadsTable, eq(pliegoImagesTable.uploadId, uploadsTable.id))
    .where(eq(pliegoImagesTable.pliegoId, pliegoId))
    .orderBy(pliegoImagesTable.zIndex, pliegoImagesTable.createdAt);

  return rows;
}

router.get("/pliegos", requireAuth, async (req, res): Promise<void> => {
  const { userId } = (req as AuthReq).user;
  const rows = await db.select().from(pliegosTable)
    .where(eq(pliegosTable.userId, userId))
    .orderBy(desc(pliegosTable.updatedAt));
  res.json(rows);
});

router.post("/pliegos", requireAuth, async (req, res): Promise<void> => {
  const { userId } = (req as AuthReq).user;
  const parsed = CreatePliegoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data: Record<string, unknown> = { userId, name: parsed.data.name };
  if (parsed.data.tipoPapel != null) data.tipoPapel = parsed.data.tipoPapel;
  if (parsed.data.widthCm != null) data.widthCm = parsed.data.widthCm;
  if (parsed.data.heightCm != null) data.heightCm = parsed.data.heightCm;
  if (parsed.data.dpi != null) data.dpi = parsed.data.dpi;
  if (parsed.data.pricePerMeter != null) data.pricePerMeter = parsed.data.pricePerMeter;

  const [pliego] = await db.insert(pliegosTable).values(data as Parameters<typeof db.insert>[0] extends infer T ? T : never).returning();
  res.status(201).json(pliego);
});

router.get("/pliegos/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPliegoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = (req as AuthReq).user;
  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego || (pliego.userId !== null && pliego.userId !== userId)) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  res.json(pliego);
});

router.patch("/pliegos/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePliegoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePliegoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = (req as AuthReq).user;
  const [pliego] = await db.update(pliegosTable)
    .set(parsed.data)
    .where(and(eq(pliegosTable.id, params.data.id), eq(pliegosTable.userId, userId)))
    .returning();

  if (!pliego) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  res.json(pliego);
});

router.patch("/pliegos/:id/thumbnail", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt((req.params as any)["id"], 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { thumbnailDataUrl } = req.body as { thumbnailDataUrl?: string };
  if (!thumbnailDataUrl || !thumbnailDataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "thumbnailDataUrl inválido" });
    return;
  }

  const { userId } = (req as AuthReq).user;
  const [updated] = await db.update(pliegosTable)
    .set({ thumbnailDataUrl })
    .where(and(eq(pliegosTable.id, id), eq(pliegosTable.userId, userId)))
    .returning({ id: pliegosTable.id });

  if (!updated) { res.status(404).json({ error: "Pliego not found" }); return; }
  res.json({ ok: true });
});

router.delete("/pliegos/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePliegoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = (req as AuthReq).user;
  const [pliego] = await db.delete(pliegosTable)
    .where(and(eq(pliegosTable.id, params.data.id), eq(pliegosTable.userId, userId)))
    .returning();
  if (!pliego) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/pliegos/:id/images", requireAuth, async (req, res): Promise<void> => {
  const params = ListPliegoImagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = (req as AuthReq).user;
  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego || (pliego.userId !== null && pliego.userId !== userId)) {
    res.status(404).json({ error: "Pliego not found" }); return;
  }

  const images = await getPliegoImages(params.data.id);
  res.json(images);
});

router.post("/pliegos/:id/images", requireAuth, async (req, res): Promise<void> => {
  const params = AddImageToPliegoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddImageToPliegoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = (req as AuthReq).user;
  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego || (pliego.userId !== null && pliego.userId !== userId)) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  const [upload] = await db.select().from(uploadsTable).where(eq(uploadsTable.id, parsed.data.uploadId));
  if (!upload) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  const defaultWidthCm = (upload.widthPx / pliego.dpi) * 2.54;
  const defaultHeightCm = (upload.heightPx / pliego.dpi) * 2.54;

  const [row] = await db.insert(pliegoImagesTable).values({
    pliegoId: params.data.id,
    uploadId: parsed.data.uploadId,
    xCm: parsed.data.xCm ?? 0,
    yCm: parsed.data.yCm ?? 0,
    widthCm: parsed.data.widthCm ?? defaultWidthCm,
    heightCm: parsed.data.heightCm ?? defaultHeightCm,
    rotation: parsed.data.rotation ?? 0,
    zIndex: parsed.data.zIndex ?? 0,
    quantity: parsed.data.quantity ?? 1,
  }).returning();

  const [imageData] = await db
    .select({
      id: pliegoImagesTable.id,
      pliegoId: pliegoImagesTable.pliegoId,
      uploadId: pliegoImagesTable.uploadId,
      xCm: pliegoImagesTable.xCm,
      yCm: pliegoImagesTable.yCm,
      widthCm: pliegoImagesTable.widthCm,
      heightCm: pliegoImagesTable.heightCm,
      rotation: pliegoImagesTable.rotation,
      zIndex: pliegoImagesTable.zIndex,
      quantity: pliegoImagesTable.quantity,
      imageUrl: uploadsTable.imageUrl,
      originalWidthPx: uploadsTable.widthPx,
      originalHeightPx: uploadsTable.heightPx,
      createdAt: pliegoImagesTable.createdAt,
    })
    .from(pliegoImagesTable)
    .innerJoin(uploadsTable, eq(pliegoImagesTable.uploadId, uploadsTable.id))
    .where(eq(pliegoImagesTable.id, row.id));

  res.status(201).json(imageData);
});

router.patch("/pliegos/:id/images/:imageId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePliegoImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePliegoImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db.update(pliegoImagesTable)
    .set(parsed.data)
    .where(and(
      eq(pliegoImagesTable.id, params.data.imageId),
      eq(pliegoImagesTable.pliegoId, params.data.id),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Image not found in pliego" });
    return;
  }

  const [imageData] = await db
    .select({
      id: pliegoImagesTable.id,
      pliegoId: pliegoImagesTable.pliegoId,
      uploadId: pliegoImagesTable.uploadId,
      xCm: pliegoImagesTable.xCm,
      yCm: pliegoImagesTable.yCm,
      widthCm: pliegoImagesTable.widthCm,
      heightCm: pliegoImagesTable.heightCm,
      rotation: pliegoImagesTable.rotation,
      zIndex: pliegoImagesTable.zIndex,
      quantity: pliegoImagesTable.quantity,
      imageUrl: uploadsTable.imageUrl,
      originalWidthPx: uploadsTable.widthPx,
      originalHeightPx: uploadsTable.heightPx,
      createdAt: pliegoImagesTable.createdAt,
    })
    .from(pliegoImagesTable)
    .innerJoin(uploadsTable, eq(pliegoImagesTable.uploadId, uploadsTable.id))
    .where(eq(pliegoImagesTable.id, updated.id));

  res.json(imageData);
});

router.delete("/pliegos/:id/images/:imageId", requireAuth, async (req, res): Promise<void> => {
  const params = RemovePliegoImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(pliegoImagesTable)
    .where(and(
      eq(pliegoImagesTable.id, params.data.imageId),
      eq(pliegoImagesTable.pliegoId, params.data.id),
    ))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Image not found in pliego" });
    return;
  }

  res.sendStatus(204);
});

router.post("/pliegos/:id/auto-nest", requireAuth, async (req, res): Promise<void> => {
  const params = AutoNestPliegoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  const images = await getPliegoImages(params.data.id);

  const sheetW = pliego.widthCm;
  const GAP = 0.3; // 3mm entre imágenes

  interface PlacedRect { id: number; x: number; y: number; w: number; h: number; }

  // Axis-Aligned Bounding Box of a rotated rectangle
  function aabb(w: number, h: number, rotDeg: number): { w: number; h: number } {
    if (rotDeg === 0) return { w, h };
    if (rotDeg === 90 || rotDeg === -90) return { w: h, h: w };
    const θ = (rotDeg * Math.PI) / 180;
    const c = Math.abs(Math.cos(θ));
    const s = Math.abs(Math.sin(θ));
    return { w: w * c + h * s, h: w * s + h * c };
  }

  // Verify two axis-aligned rects don't overlap (including gap)
  function overlaps(a: PlacedRect, bx: number, by: number, bw: number, bh: number): boolean {
    return (
      bx < a.x + a.w + GAP &&
      bx + bw + GAP > a.x &&
      by < a.y + a.h + GAP &&
      by + bh + GAP > a.y
    );
  }

  /**
   * Candidate generation — combines all X and Y boundaries of placed rects.
   * This produces far more candidate positions than the simple corner approach,
   * allowing the packer to exploit interior gaps left by large items.
   */
  function getCandidates(placedList: PlacedRect[]): { x: number; y: number }[] {
    const xs = new Set<number>([0]);
    const ys = new Set<number>([0]);
    for (const p of placedList) {
      xs.add(p.x + p.w + GAP);
      ys.add(p.y + p.h + GAP);
    }
    const result: { x: number; y: number }[] = [];
    for (const x of xs) {
      for (const y of ys) {
        result.push({ x, y });
      }
    }
    return result;
  }

  // Score a placement: lower is better — prioritise minimum bottom edge, then left
  function placementScore(x: number, y: number, _w: number, h: number): number {
    return (y + h) * 100000 + x;
  }

  // Try to place a rect (aw×ah); return the lowest-score valid position
  function bestSpot(
    placed: PlacedRect[],
    aw: number,
    ah: number,
  ): { x: number; y: number; score: number } | null {
    const candidates = getCandidates(placed)
      .sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
    let best: { x: number; y: number; score: number } | null = null;
    for (const { x, y } of candidates) {
      if (x < 0 || y < 0 || x + aw > sheetW + 1e-9) continue;
      if (!placed.some((p) => overlaps(p, x, y, aw, ah))) {
        const score = placementScore(x, y, aw, ah);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    return best;
  }

  interface ItemToPack {
    id: number;
    uploadId: number;
    widthCm: number;
    heightCm: number;
    zIndex: number;
    quantity: number;
  }

  interface PlacedItem {
    id: number;
    widthCm: number;
    heightCm: number;
    xCm: number;
    yCm: number;
    rotation: number;
    zIndex: number;
    quantity: number;
  }

  // One item per image (quantity is a print-count multiplier, NOT layout copies)
  const itemsToPack: ItemToPack[] = [];
  let tooWideCount = 0;

  for (const img of images) {
    const fits0  = img.widthCm  <= sheetW + 1e-9;
    const fits90 = img.heightCm <= sheetW + 1e-9;
    if (!fits0 && !fits90) { tooWideCount++; continue; }
    itemsToPack.push({
      id: img.id, uploadId: img.uploadId,
      widthCm: img.widthCm, heightCm: img.heightCm,
      zIndex: img.zIndex, quantity: img.quantity ?? 1,
    });
  }

  /**
   * Run a greedy bottom-left packing pass with the given item order.
   * For each item, both 0° and 90° orientations are evaluated; the one
   * that yields the lowest score (smallest bottom edge, then leftmost) wins.
   */
  function pack(order: ItemToPack[]): { placedRects: PlacedRect[]; items: PlacedItem[]; unplaced: number } {
    const placedRects: PlacedRect[] = [];
    const items: PlacedItem[] = [];
    let unplaced = 0;

    for (let idx = 0; idx < order.length; idx++) {
      const img = order[idx];
      const isSquare = Math.abs(img.widthCm - img.heightCm) < 0.01;
      const rotCandidates = isSquare ? [0] : [0, 90];

      let best: { x: number; y: number; rot: number; aw: number; ah: number; score: number } | null = null;

      for (const rot of rotCandidates) {
        const { w: aw, h: ah } = aabb(img.widthCm, img.heightCm, rot);
        if (aw > sheetW + 1e-9) continue;
        const spot = bestSpot(placedRects, aw, ah);
        if (!spot) continue;
        if (!best || spot.score < best.score) {
          best = { x: spot.x, y: spot.y, rot, aw, ah, score: spot.score };
        }
      }

      if (!best) { unplaced++; continue; }

      placedRects.push({ id: idx, x: best.x, y: best.y, w: best.aw, h: best.ah });
      // xCm/yCm is the unrotated top-left; the canvas rotates around the image center.
      items.push({
        id: img.id,
        widthCm: img.widthCm, heightCm: img.heightCm,
        xCm: best.x + (best.aw - img.widthCm) / 2,
        yCm: best.y + (best.ah - img.heightCm) / 2,
        rotation: best.rot,
        zIndex: idx,
        quantity: img.quantity,
      });
    }
    return { placedRects, items, unplaced };
  }

  /**
   * Try multiple sort strategies and keep the one that places the most items.
   * Ties are broken by total bottom edge (smallest sheet length wins).
   */
  const sortStrategies: Array<(a: ItemToPack, b: ItemToPack) => number> = [
    // Largest area first (anchor big items early)
    (a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm,
    // Longest side first (tall/wide items are hardest to fit)
    (a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm),
    // Tallest first
    (a, b) => b.heightCm - a.heightCm,
    // Widest first
    (a, b) => b.widthCm - a.widthCm,
    // Largest perimeter first
    (a, b) => (b.widthCm + b.heightCm) - (a.widthCm + a.heightCm),
    // Shortest side first (small items fill gaps)
    (a, b) => Math.min(a.widthCm, a.heightCm) - Math.min(b.widthCm, b.heightCm),
  ];

  let bestResult: { placedRects: PlacedRect[]; items: PlacedItem[]; unplaced: number } | null = null;
  let bestBottomEdge = Infinity;

  for (const cmp of sortStrategies) {
    const order = [...itemsToPack].sort(cmp);
    const result = pack(order);
    const placed = result.items.length;
    const bottomEdge = result.placedRects.length > 0
      ? Math.max(...result.placedRects.map(r => r.y + r.h))
      : 0;
    const bestPlaced = bestResult ? bestResult.items.length : -1;
    if (placed > bestPlaced || (placed === bestPlaced && bottomEdge < bestBottomEdge)) {
      bestResult = result;
      bestBottomEdge = bottomEdge;
    }
  }

  const { placedRects, items, unplaced } = bestResult!;

  const neededH = placedRects.length > 0
    ? Math.ceil((Math.max(...placedRects.map(p => p.y + p.h)) + GAP) * 10) / 10
    : 1;

  const finalH = Math.max(neededH, 1);

  // Only auto-expand height for DTF format (≈58 cm wide). Fixed-size pliegos
  // (A4, Carta, Tabloide, custom) keep their original dimensions.
  const isDtfFormat = Math.abs(pliego.widthCm - 58) < 2;
  if (isDtfFormat) {
    await db.update(pliegosTable)
      .set({ heightCm: finalH })
      .where(eq(pliegosTable.id, params.data.id));
  }

  // UPDATE each placed image's position in-place (preserves IDs, quantity, etc.)
  for (const item of items) {
    await db.update(pliegoImagesTable)
      .set({ xCm: item.xCm, yCm: item.yCm, rotation: item.rotation, zIndex: item.zIndex })
      .where(eq(pliegoImagesTable.id, item.id));
  }

  const updatedImages = await getPliegoImages(params.data.id);

  // Coverage: each image's area × its quantity (print copies) vs total pliego area
  const usedArea = items.reduce((sum, item) => sum + item.widthCm * item.heightCm * item.quantity, 0);
  const totalArea = sheetW * finalH;
  const coveragePercent = (usedArea / totalArea) * 100;

  res.json({
    images: updatedImages,
    coveragePercent: Math.round(coveragePercent * 10) / 10,
    placedCount: items.length,
    unplacedCount: unplaced + tooWideCount,
    newHeightCm: finalH,
  });
});

router.get("/pliegos/:id/price", requireAuth, async (req, res): Promise<void> => {
  const params = GetPliegoPriceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  // Measure from start of pliego to the bottom edge of the last image
  const images = await getPliegoImages(params.data.id);
  const maxBottomCm = images.length > 0
    ? Math.max(...images.map((img) => img.yCm + img.heightCm))
    : 0;
  const metersUsed = maxBottomCm / 100;

  // Tiered pricing (per meter):
  //   ≤ 3m  → 250/m
  //   ≤ 5m  → 230/m
  //   > 5m  → 200/m
  // Always floor the final cost
  let pricePerMeter: number;
  if (metersUsed > 5) {
    pricePerMeter = 200;
  } else if (metersUsed > 3) {
    pricePerMeter = 230;
  } else {
    pricePerMeter = 250;
  }
  const totalPrice = Math.floor(metersUsed * pricePerMeter);

  res.json({
    pliegoId: pliego.id,
    widthCm: pliego.widthCm,
    heightCm: pliego.heightCm,
    metersUsed,
    pricePerMeter,
    totalPrice,
    currency: "CLP",
  });
});

router.get("/pliegos/:id/stats", requireAuth, async (req, res): Promise<void> => {
  const params = GetPliegoStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  const images = await getPliegoImages(params.data.id);

  const totalAreaCm2 = pliego.widthCm * pliego.heightCm;
  const usedAreaCm2 = images.reduce((sum, img) => sum + img.widthCm * img.heightCm * (img.quantity ?? 1), 0);
  const wastedAreaCm2 = totalAreaCm2 - usedAreaCm2;
  const coveragePercent = totalAreaCm2 > 0 ? (usedAreaCm2 / totalAreaCm2) * 100 : 0;

  res.json({
    pliegoId: pliego.id,
    totalAreaCm2: Math.round(totalAreaCm2 * 10) / 10,
    usedAreaCm2: Math.round(usedAreaCm2 * 10) / 10,
    wastedAreaCm2: Math.round(wastedAreaCm2 * 10) / 10,
    coveragePercent: Math.round(coveragePercent * 10) / 10,
    imageCount: images.length,
  });
});

router.post("/pliegos/:id/export", requireAuth, async (req, res): Promise<void> => {
  const params = ExportPliegoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ExportPliegoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego) {
    res.status(404).json({ error: "Pliego not found" });
    return;
  }

  const images = await getPliegoImages(params.data.id);
  const format = parsed.data.format as "pdf" | "png";
  const dpi = parsed.data.dpi ?? pliego.dpi;

  const CM_TO_INCH = 1 / 2.54;
  const sheetWidthPx = Math.round(pliego.widthCm * CM_TO_INCH * dpi);
  const sheetHeightPx = Math.round(pliego.heightCm * CM_TO_INCH * dpi);

  await ensureUploadsDir();

  let compositeOps: sharp.OverlayOptions[] = [];

  for (const img of images) {
    const srcFilename = path.basename(img.imageUrl);
    const srcPath = path.join(UPLOADS_DIR, srcFilename);

    const xPx = img.xCm * CM_TO_INCH * dpi;
    const yPx = img.yCm * CM_TO_INCH * dpi;
    const wPx = Math.round(img.widthCm  * CM_TO_INCH * dpi);
    const hPx = Math.round(img.heightCm * CM_TO_INCH * dpi);

    try {
      let imgBuf = await sharp(srcPath).resize(wPx, hPx, { fit: "fill" }).png().toBuffer();

      let finalLeft = xPx;
      let finalTop  = yPx;

      if (img.rotation !== 0) {
        imgBuf = await sharp(imgBuf)
          .rotate(img.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        const { width: rW = wPx, height: rH = hPx } = await sharp(imgBuf).metadata();
        finalLeft = xPx + (wPx - rW) / 2;
        finalTop  = yPx + (hPx - rH) / 2;
      }

      const { width: curW = wPx, height: curH = hPx } = await sharp(imgBuf).metadata();
      const cropLeft = Math.max(0, Math.round(-finalLeft));
      const cropTop  = Math.max(0, Math.round(-finalTop));
      const cropW    = Math.round(Math.min(curW - cropLeft, sheetWidthPx  - Math.max(0, finalLeft)));
      const cropH    = Math.round(Math.min(curH - cropTop,  sheetHeightPx - Math.max(0, finalTop)));

      if (cropW <= 0 || cropH <= 0) continue;

      if (cropLeft > 0 || cropTop > 0 || cropW < curW || cropH < curH) {
        imgBuf = await sharp(imgBuf)
          .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
          .toBuffer();
      }

      compositeOps.push({
        input: imgBuf,
        left: Math.round(Math.max(0, finalLeft)),
        top:  Math.round(Math.max(0, finalTop)),
      });
    } catch (err) {
      req.log.warn({ imageId: img.id, err }, "Could not composite image, skipping");
    }
  }

  const exportFilename = `pliego_${pliego.id}_${uuidv4()}.${format === "pdf" ? "png" : "png"}`;
  const exportPath = path.join(UPLOADS_DIR, exportFilename);

  let sharpInst = sharp({
    create: {
      width: sheetWidthPx,
      height: sheetHeightPx,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: format === "png" ? 0 : 1 },
    },
  });

  if (compositeOps.length > 0) {
    sharpInst = sharpInst.composite(compositeOps);
  }

  const outBuffer = await sharpInst.png().toBuffer();
  await fs.writeFile(exportPath, outBuffer);

  const fileSizeBytes = outBuffer.length;
  const downloadUrl = getPublicUrl(exportFilename);

  res.json({
    pliegoId: pliego.id,
    format: "png",
    downloadUrl,
    filename: exportFilename,
    fileSizeBytes,
  });
});

// ── Helper: composite all pliego images into a sharp canvas ──────────────────
async function buildComposite(
  pliego: { widthCm: number; heightCm: number; dpi: number },
  images: Awaited<ReturnType<typeof getPliegoImages>>,
  transparentBg: boolean,
  log: { warn: (obj: object, msg: string) => void },
) {
  const CM_TO_INCH = 1 / 2.54;
  const dpi = pliego.dpi;
  const sheetWidthPx  = Math.round(pliego.widthCm  * CM_TO_INCH * dpi);
  const sheetHeightPx = Math.round(pliego.heightCm * CM_TO_INCH * dpi);

  let compositeOps: sharp.OverlayOptions[] = [];

  for (const img of images) {
    const srcPath = path.join(UPLOADS_DIR, path.basename(img.imageUrl));
    const xPx = img.xCm     * CM_TO_INCH * dpi;
    const yPx = img.yCm     * CM_TO_INCH * dpi;
    const wPx = Math.round(img.widthCm  * CM_TO_INCH * dpi);
    const hPx = Math.round(img.heightCm * CM_TO_INCH * dpi);

    try {
      let imgBuf = await sharp(srcPath).resize(wPx, hPx, { fit: "fill" }).png().toBuffer();

      let finalLeft = xPx;
      let finalTop  = yPx;

      if (img.rotation !== 0) {
        // Rotate with transparent background so expanded canvas is transparent
        imgBuf = await sharp(imgBuf)
          .rotate(img.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        // sharp.rotate() expands the canvas to fit rotated content.
        // Re-center placement so the visual center of the image stays at the same spot
        // (matches the CSS transform-origin:center behavior in the frontend).
        const { width: rW = wPx, height: rH = hPx } = await sharp(imgBuf).metadata();
        finalLeft = xPx + (wPx - rW) / 2;
        finalTop  = yPx + (hPx - rH) / 2;
      }

      // Crop the portion that falls outside the sheet (handles negative / overflowing coords)
      const { width: curW = wPx, height: curH = hPx } = await sharp(imgBuf).metadata();
      const cropLeft = Math.max(0, Math.round(-finalLeft));
      const cropTop  = Math.max(0, Math.round(-finalTop));
      const cropW    = Math.round(Math.min(curW - cropLeft, sheetWidthPx  - Math.max(0, finalLeft)));
      const cropH    = Math.round(Math.min(curH - cropTop,  sheetHeightPx - Math.max(0, finalTop)));

      if (cropW <= 0 || cropH <= 0) continue; // entirely outside sheet

      if (cropLeft > 0 || cropTop > 0 || cropW < curW || cropH < curH) {
        imgBuf = await sharp(imgBuf)
          .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
          .toBuffer();
      }

      compositeOps.push({
        input: imgBuf,
        left: Math.round(Math.max(0, finalLeft)),
        top:  Math.round(Math.max(0, finalTop)),
      });
    } catch (err) {
      log.warn({ imageId: img.id, err }, "Could not composite image, skipping");
    }
  }

  let sharpInst = sharp({
    create: {
      width:  sheetWidthPx,
      height: sheetHeightPx,
      channels: 4,
      background: transparentBg
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  if (compositeOps.length > 0) sharpInst = sharpInst.composite(compositeOps);
  return { sharpInst, sheetWidthPx, sheetHeightPx, dpi };
}

// ── POST /pliegos/:id/export-rgb  ──  PNG · Adobe RGB 1998 · 300 DPI · transparent
router.post("/pliegos/:id/export-rgb", requireAuth, async (req, res): Promise<void> => {
  const params = ExportPliegoParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego) { res.status(404).json({ error: "Pliego not found" }); return; }

  const images = await getPliegoImages(params.data.id);
  const { sharpInst, sheetWidthPx, sheetHeightPx } =
    await buildComposite(pliego, images, true, req.log);

  // Output as sRGB — the pixel values are sRGB (from the browser canvas).
  // Previously tagged as AdobeRGB (wider gamut) which made the same numeric
  // values look darker/desaturated in color-managed viewers. No conversion
  // needed: just set DPI and save; sharp defaults to sRGB for PNG output.
  const outBuf = await sharpInst
    .withMetadata({ density: pliego.dpi })
    .png({ compressionLevel: 6 })
    .toBuffer();

  const filename = `pliego_${pliego.id}_RGB_${uuidv4()}.png`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), outBuf);

  res.json({
    pliegoId: pliego.id,
    format: "png",
    colorProfile: "AdobeRGB1998",
    dpi: pliego.dpi,
    widthPx: sheetWidthPx,
    heightPx: sheetHeightPx,
    downloadUrl: getPublicUrl(filename),
    filename,
    fileSizeBytes: outBuf.length,
  });
});

// ── POST /pliegos/:id/export-cmyk  ──  PDF · FOGRA39 · 300 DPI · transparent
router.post("/pliegos/:id/export-cmyk", requireAuth, async (req, res): Promise<void> => {
  const params = ExportPliegoParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const pliego = await getPliegoWithImages(params.data.id);
  if (!pliego) { res.status(404).json({ error: "Pliego not found" }); return; }

  const images = await getPliegoImages(params.data.id);
  // Build with transparent background so we can carry alpha into the PDF SMask
  const { sharpInst, sheetWidthPx, sheetHeightPx, dpi } =
    await buildComposite(pliego, images, true, req.log);

  // Get the full RGBA composite as PNG
  const rgbaPng = await sharpInst.png().toBuffer();

  // ─ CMYK raw pixels via Python/LCMS2 (sRGB → FOGRA39 ICC conversion) ───────
  // We use raw pixel output (not JPEG) to avoid CMYK JPEG inversion ambiguity:
  //   Pillow CMYK:  255 = full ink, 0 = no ink
  //   PDF default:  byte/255 → component → 1.0 = full ink ✓  (no Decode needed)
  // Python script writes: 4-byte BE width + 4-byte BE height + raw CMYK bytes
  const tmpId      = uuidv4();
  const tmpPngPath = path.join(UPLOADS_DIR, `_tmp_${tmpId}.png`);
  const tmpRawPath = path.join(UPLOADS_DIR, `_tmp_${tmpId}.raw`);
  try {
    await fs.writeFile(tmpPngPath, rgbaPng);
    await execFileAsync(
      "python3",
      [CONVERT_CMYK_PY, tmpPngPath, tmpRawPath, FOGRA39_ICC_PATH],
    );
  } finally {
    fs.unlink(tmpPngPath).catch(() => {});
  }
  const rawFile = await fs.readFile(tmpRawPath);
  fs.unlink(tmpRawPath).catch(() => {});

  // Parse header: first 8 bytes = width (u32 BE) + height (u32 BE)
  const cmykW = rawFile.readUInt32BE(0);
  const cmykH = rawFile.readUInt32BE(4);
  const cmykRaw = rawFile.slice(8);          // raw CMYK pixels
  const cmykDeflated = deflateSync(cmykRaw); // compress for PDF stream

  // ─ Alpha channel → raw grayscale → deflate-compress ────────────────────
  const alphaRaw = await sharp(rgbaPng)
    .extractChannel(3)          // alpha channel
    .raw()
    .toBuffer();
  const alphaDeflated = deflateSync(alphaRaw);

  // ─ Build PDF ─────────────────────────────────────────────────────────────
  const CM_TO_PT = 72 / 2.54;
  const widthPt  = pliego.widthCm  * CM_TO_PT;
  const heightPt = pliego.heightCm * CM_TO_PT;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([widthPt, heightPt]);
  const ctx    = pdfDoc.context;

  // FOGRA39 ICC stream (raw bytes — no FlateDecode)
  const iccRef = ctx.register(ctx.stream(FOGRA39_ICC, {
    N:         PDFNumber.of(4),
    Alternate: PDFName.of("DeviceCMYK"),
  }));

  // Soft mask: alpha channel (FlateDecode-compressed raw grayscale)
  const sMaskRef = ctx.register(ctx.stream(alphaDeflated, {
    Type:             PDFName.of("XObject"),
    Subtype:          PDFName.of("Image"),
    Width:            PDFNumber.of(sheetWidthPx),
    Height:           PDFNumber.of(sheetHeightPx),
    ColorSpace:       PDFName.of("DeviceGray"),
    BitsPerComponent: PDFNumber.of(8),
    Filter:           PDFName.of("FlateDecode"),
  }));

  // Main image: raw CMYK (FlateDecode) + ICCBased colour space + SMask
  // No Decode array needed — Pillow's 255=full ink matches PDF's default mapping.
  const imgRef = ctx.register(ctx.stream(cmykDeflated, {
    Type:             PDFName.of("XObject"),
    Subtype:          PDFName.of("Image"),
    Width:            PDFNumber.of(cmykW),
    Height:           PDFNumber.of(cmykH),
    ColorSpace:       ctx.obj([PDFName.of("ICCBased"), iccRef]),
    BitsPerComponent: PDFNumber.of(8),
    Filter:           PDFName.of("FlateDecode"),
    SMask:            sMaskRef,
  }));

  // Page resources + content stream
  const resDict = ctx.obj({ XObject: ctx.obj({ Img: imgRef }) });
  page.node.set(PDFName.of("Resources"), resDict);

  const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Img Do Q`;
  page.node.set(PDFName.of("Contents"), ctx.register(
    ctx.stream(Buffer.from(content, "latin1")),
  ));

  // OutputIntent referencing FOGRA39
  const oiRef = ctx.register(ctx.obj({
    Type:                       PDFName.of("OutputIntent"),
    S:                          PDFName.of("GTS_PDFX"),
    OutputConditionIdentifier:  PDFString.of("FOGRA39"),
    OutputCondition:            PDFString.of("ISO Coated v2 300% (FOGRA39)"),
    DestOutputProfile:          iccRef,
  }));
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([oiRef]));

  const pdfBuf = Buffer.from(await pdfDoc.save());
  const filename = `pliego_${pliego.id}_CMYK_${uuidv4()}.pdf`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), pdfBuf);

  res.json({
    pliegoId: pliego.id,
    format: "pdf",
    colorProfile: "FOGRA39",
    dpi,
    widthPx: sheetWidthPx,
    heightPx: sheetHeightPx,
    downloadUrl: getPublicUrl(filename),
    filename,
    fileSizeBytes: pdfBuf.length,
  });
});

export default router;
