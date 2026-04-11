import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// ── Configuración del Negocio ─────────────────────────────────────────────────
export const businessConfigTable = pgTable("business_config", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull().default("DTF Pliego"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  rfc: text("rfc"),
  // Para tickets
  ticketHeader: text("ticket_header"),
  ticketFooter: text("ticket_footer"),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessConfig = typeof businessConfigTable.$inferSelect;
export type InsertBusinessConfig = typeof businessConfigTable.$inferInsert;
