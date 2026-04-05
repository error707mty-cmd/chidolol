import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const pliegosTable = pgTable("pliegos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tipoPapel: text("tipo_papel"),
  widthCm: real("width_cm").notNull().default(58),
  heightCm: real("height_cm").notNull().default(100),
  dpi: integer("dpi").notNull().default(300),
  pricePerMeter: real("price_per_meter").notNull().default(3500),
  thumbnailDataUrl: text("thumbnail_data_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPliegoSchema = createInsertSchema(pliegosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPliego = z.infer<typeof insertPliegoSchema>;
export type Pliego = typeof pliegosTable.$inferSelect;
