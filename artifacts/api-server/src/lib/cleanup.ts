/**
 * Daily cleanup job — runs automatically at midnight (00:00 server time).
 *
 * Tasks:
 *  1. FREE USER PURGE: delete all uploads + pliegos for non-paid, non-admin users.
 *  2. ORPHAN FILE SWEEP: delete disk files that have no matching DB record.
 *  3. ORPHAN RECORD SWEEP: delete DB records whose file no longer exists on disk.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db, uploadsTable, pliegoImagesTable, pliegosTable, usersTable } from "@workspace/db";
import { eq, and, isNull, inArray, notInArray } from "drizzle-orm";
import { logger } from "./logger";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads_storage");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

/** Delete a file from disk silently (ignore missing). */
async function unlinkSafe(filename: string) {
  try {
    await fs.unlink(path.join(UPLOADS_DIR, filename));
  } catch {
    // file already gone — ok
  }
}

// ── Task 1: Purge free users' data ───────────────────────────────────────────

async function purgeFreeUsers(): Promise<{ users: number; uploads: number; pliegos: number }> {
  // Free = no active Stripe subscription, not an admin
  const freeUsers = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isAdmin, false),
        isNull(usersTable.stripeSubscriptionId),
      )
    );

  if (freeUsers.length === 0) return { users: 0, uploads: 0, pliegos: 0 };

  const freeUserIds = freeUsers.map((u) => u.id);

  // 1a. Get uploads to delete (need filenames to remove from disk)
  const uploadsToDelete = await db
    .select({ id: uploadsTable.id, filename: uploadsTable.filename, trimmedImageUrl: uploadsTable.trimmedImageUrl })
    .from(uploadsTable)
    .where(inArray(uploadsTable.userId, freeUserIds));

  // 1b. Delete disk files for those uploads
  for (const u of uploadsToDelete) {
    await unlinkSafe(u.filename);
    if (u.trimmedImageUrl) {
      const trimFilename = u.trimmedImageUrl.split("/").pop();
      if (trimFilename) await unlinkSafe(trimFilename);
    }
  }

  // 1c. Delete pliego_images rows (cascade from pliegos, but safer to do explicitly)
  const freeUserPliegos = await db
    .select({ id: pliegosTable.id })
    .from(pliegosTable)
    .where(inArray(pliegosTable.userId, freeUserIds));

  if (freeUserPliegos.length > 0) {
    const pliegoIds = freeUserPliegos.map((p) => p.id);
    await db.delete(pliegoImagesTable).where(inArray(pliegoImagesTable.pliegoId, pliegoIds));
  }

  // 1d. Delete pliegos
  const { rowCount: deletedPliegos } = await db
    .delete(pliegosTable)
    .where(inArray(pliegosTable.userId, freeUserIds));

  // 1e. Delete upload records
  const { rowCount: deletedUploads } = await db
    .delete(uploadsTable)
    .where(inArray(uploadsTable.userId, freeUserIds));

  return {
    users: freeUsers.length,
    uploads: deletedUploads ?? 0,
    pliegos: deletedPliegos ?? 0,
  };
}

// ── Task 2: Orphan file sweep ─────────────────────────────────────────────────

async function sweepOrphanFiles(): Promise<{ removed: number }> {
  await ensureDir();
  const diskFiles = await fs.readdir(UPLOADS_DIR);

  if (diskFiles.length === 0) return { removed: 0 };

  // Get all known filenames from DB (uploads table)
  const dbUploads = await db.select({ filename: uploadsTable.filename }).from(uploadsTable);
  const knownSet = new Set(dbUploads.map((u) => u.filename));

  let removed = 0;
  for (const file of diskFiles) {
    // Skip temp files (start with _) — active processing
    if (file.startsWith("_")) continue;
    if (!knownSet.has(file)) {
      await unlinkSafe(file);
      removed++;
    }
  }

  return { removed };
}

// ── Task 3: Orphan DB record sweep ────────────────────────────────────────────

async function sweepOrphanRecords(): Promise<{ removed: number }> {
  await ensureDir();
  const diskFiles = new Set(await fs.readdir(UPLOADS_DIR));

  const allRecords = await db.select({ id: uploadsTable.id, filename: uploadsTable.filename }).from(uploadsTable);

  const orphanIds: number[] = [];
  for (const record of allRecords) {
    if (!diskFiles.has(record.filename)) {
      orphanIds.push(record.id);
    }
  }

  if (orphanIds.length === 0) return { removed: 0 };

  // Remove pliego_images references first
  await db.delete(pliegoImagesTable).where(inArray(pliegoImagesTable.uploadId, orphanIds));
  await db.delete(uploadsTable).where(inArray(uploadsTable.id, orphanIds));

  return { removed: orphanIds.length };
}

// ── Main cleanup runner ───────────────────────────────────────────────────────

export async function runCleanup() {
  logger.info("🧹 Daily cleanup started");
  const t = Date.now();

  try {
    const freeResult = await purgeFreeUsers();
    logger.info(
      { freeUsers: freeResult.users, uploads: freeResult.uploads, pliegos: freeResult.pliegos },
      "Free-user purge complete"
    );
  } catch (err) {
    logger.error({ err }, "Free-user purge failed");
  }

  try {
    const orphanFiles = await sweepOrphanFiles();
    logger.info({ removed: orphanFiles.removed }, "Orphan file sweep complete");
  } catch (err) {
    logger.error({ err }, "Orphan file sweep failed");
  }

  try {
    const orphanRecords = await sweepOrphanRecords();
    logger.info({ removed: orphanRecords.removed }, "Orphan DB record sweep complete");
  } catch (err) {
    logger.error({ err }, "Orphan DB record sweep failed");
  }

  logger.info({ elapsedMs: Date.now() - t }, "🧹 Daily cleanup finished");
}

// ── Scheduler — fires at next midnight, then every 24h ───────────────────────

export function scheduleDailyCleanup() {
  function msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // next midnight
    return midnight.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntilMidnight();
    const nextRun = new Date(Date.now() + delay);
    logger.info({ nextRun: nextRun.toISOString() }, "Daily cleanup scheduled");

    setTimeout(async () => {
      await runCleanup();
      scheduleNext(); // reschedule for the following midnight
    }, delay);
  }

  scheduleNext();
}
