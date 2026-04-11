import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";

// ── Clientes del POS ──────────────────────────────────────────────────────────
export const posCustomersTable = pgTable("pos_customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  // Tipo de precio: 'normal', 'revendedor', 'especial', 'custom'
  priceType: text("price_type").notNull().default("normal"),
  // Precio personalizado por metro (null = usar precio por tier)
  customPricePerMeter: numeric("custom_price_per_meter", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Escalas de precios ────────────────────────────────────────────────────────
export const posPriceTiersTable = pgTable("pos_price_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // 'normal', 'revendedor', 'especial'
  minMeters: numeric("min_meters", { precision: 10, scale: 2 }).notNull(),
  maxMeters: numeric("max_meters", { precision: 10, scale: 2 }), // null = sin límite
  pricePerMeter: numeric("price_per_meter", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Ventas ────────────────────────────────────────────────────────────────────
export const posSalesTable = pgTable("pos_sales", {
  id: serial("id").primaryKey(),
  // Folio único para la venta
  folio: text("folio").notNull().unique(),
  customerId: integer("customer_id").references(() => posCustomersTable.id),
  customerName: text("customer_name"), // Guardado por si se borra el cliente
  totalMeters: numeric("total_meters", { precision: 10, scale: 2 }).notNull(),
  pricePerMeter: numeric("price_per_meter", { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("efectivo"), // efectivo, tarjeta, transferencia
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Inventario ────────────────────────────────────────────────────────────────
export const posInventoryTable = pgTable("pos_inventory", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  description: text("description"),
  stock: numeric("stock", { precision: 10, scale: 2 }).notNull().default("0"),
  unit: text("unit").notNull().default("metros"), // metros, piezas, rollos, etc.
  cost: numeric("cost", { precision: 10, scale: 2 }).notNull().default("0"),
  lowStockAlert: numeric("low_stock_alert", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Movimientos de inventario ─────────────────────────────────────────────────
export const posInventoryMovementsTable = pgTable("pos_inventory_movements", {
  id: serial("id").primaryKey(),
  inventoryId: integer("inventory_id").notNull().references(() => posInventoryTable.id),
  type: text("type").notNull(), // 'entrada', 'salida', 'ajuste'
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  saleId: integer("sale_id").references(() => posSalesTable.id),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Tipos ─────────────────────────────────────────────────────────────────────
// Necesitamos importar usersTable
import { usersTable } from "./users";

export type POSCustomer = typeof posCustomersTable.$inferSelect;
export type InsertPOSCustomer = typeof posCustomersTable.$inferInsert;

export type POSPriceTier = typeof posPriceTiersTable.$inferSelect;
export type InsertPOSPriceTier = typeof posPriceTiersTable.$inferInsert;

export type POSSale = typeof posSalesTable.$inferSelect;
export type InsertPOSSale = typeof posSalesTable.$inferInsert;

export type POSInventory = typeof posInventoryTable.$inferSelect;
export type InsertPOSInventory = typeof posInventoryTable.$inferInsert;

export type POSInventoryMovement = typeof posInventoryMovementsTable.$inferSelect;
export type InsertPOSInventoryMovement = typeof posInventoryMovementsTable.$inferInsert;
