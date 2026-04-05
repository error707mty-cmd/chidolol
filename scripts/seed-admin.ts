import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const USERNAME = "error707mty";
  const PASSWORD = "buentello0607";

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, USERNAME));

  if (existing.length > 0) {
    console.log(`Usuario '${USERNAME}' ya existe — actualizando contraseña y rol...`);
    const hash = await bcrypt.hash(PASSWORD, 12);
    await db.update(usersTable)
      .set({ passwordHash: hash, isAdmin: true })
      .where(eq(usersTable.username, USERNAME));
    console.log("✅ Usuario admin actualizado.");
  } else {
    const hash = await bcrypt.hash(PASSWORD, 12);
    await db.insert(usersTable).values({
      username: USERNAME,
      passwordHash: hash,
      isAdmin: true,
    });
    console.log(`✅ Usuario admin '${USERNAME}' creado exitosamente.`);
  }

  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Error al crear usuario admin:", err);
  process.exit(1);
});
