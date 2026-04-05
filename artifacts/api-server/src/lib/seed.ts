import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_USERNAME = "error707mty";
const ADMIN_PASSWORD = "buentello0607";

export async function seedAdminUser() {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, ADMIN_USERNAME));

    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.insert(usersTable).values({
      username: ADMIN_USERNAME,
      passwordHash,
      displayName: "Admin ERROR707",
      isAdmin: true,
      isActive: true,
    });

    logger.info({ username: ADMIN_USERNAME }, "Admin user seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
