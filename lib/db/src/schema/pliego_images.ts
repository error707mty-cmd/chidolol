import { pgTable, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pliegosTable } from "./pliegos";
import { uploadsTable } from "./uploads";

export const pliegoImagesTable = pgTable("pliego_images", {
  id: serial("id").primaryKey(),
  pliegoId: integer("pliego_id").notNull().references(() => pliegosTable.id, { onDelete: "cascade" }),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id, { onDelete: "cascade" }),
  xCm: real("x_cm").notNull().default(0),
  yCm: real("y_cm").notNull().default(0),
  widthCm: real("width_cm").notNull(),
  heightCm: real("height_cm").notNull(),
  rotation: real("rotation").notNull().default(0),
  zIndex: integer("z_index").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPliegoImageSchema = createInsertSchema(pliegoImagesTable).omit({ id: true, createdAt: true });
export type InsertPliegoImage = z.infer<typeof insertPliegoImageSchema>;
export type PliegoImage = typeof pliegoImagesTable.$inferSelect;
