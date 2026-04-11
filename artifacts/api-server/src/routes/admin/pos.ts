import express from "express";
import { db } from "@workspace/db";
import {
  posCustomersTable,
  posPriceTiersTable,
  posSalesTable,
  posInventoryTable,
  posInventoryMovementsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, or } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

const router = express.Router();

// Require authentication for all POS routes
router.use(requireAuth);

// ── Middleware: Solo admins ───────────────────────────────────────────────────
function requireAdmin(req: any, res: any, next: any) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Acceso denegado. Solo administradores." });
  }
  next();
}

router.use(requireAdmin);

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/pos/customers - Listar todos los clientes
router.get("/customers", async (req, res) => {
  try {
    const customers = await db
      .select()
      .from(posCustomersTable)
      .orderBy(desc(posCustomersTable.createdAt));
    
    res.json({ customers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/pos/customers - Crear cliente
router.post("/customers", async (req, res) => {
  try {
    const { name, email, phone, priceType, customPricePerMeter, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    const [customer] = await db
      .insert(posCustomersTable)
      .values({
        name,
        email: email || null,
        phone: phone || null,
        priceType: priceType || "normal",
        customPricePerMeter: customPricePerMeter || null,
        notes: notes || null,
      })
      .returning();

    res.json({ customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/pos/customers/:id - Actualizar cliente
router.put("/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, priceType, customPricePerMeter, notes } = req.body;

    const [customer] = await db
      .update(posCustomersTable)
      .set({
        name,
        email: email || null,
        phone: phone || null,
        priceType: priceType || "normal",
        customPricePerMeter: customPricePerMeter || null,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(posCustomersTable.id, Number(id)))
      .returning();

    if (!customer) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    res.json({ customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/pos/customers/:id - Eliminar cliente
router.delete("/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    await db
      .delete(posCustomersTable)
      .where(eq(posCustomersTable.id, Number(id)));

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ESCALAS DE PRECIOS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/pos/price-tiers - Listar todas las escalas de precios
router.get("/price-tiers", async (req, res) => {
  try {
    const tiers = await db
      .select()
      .from(posPriceTiersTable)
      .where(eq(posPriceTiersTable.isActive, true))
      .orderBy(posPriceTiersTable.minMeters);
    
    res.json({ tiers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/pos/price-tiers - Crear escala de precio
router.post("/price-tiers", async (req, res) => {
  try {
    const { name, minMeters, maxMeters, pricePerMeter } = req.body;
    
    const [tier] = await db
      .insert(posPriceTiersTable)
      .values({
        name,
        minMeters,
        maxMeters: maxMeters || null,
        pricePerMeter,
      })
      .returning();

    res.json({ tier });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/pos/price-tiers/:id - Actualizar escala
router.put("/price-tiers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, minMeters, maxMeters, pricePerMeter, isActive } = req.body;

    const [tier] = await db
      .update(posPriceTiersTable)
      .set({ name, minMeters, maxMeters, pricePerMeter, isActive })
      .where(eq(posPriceTiersTable.id, Number(id)))
      .returning();

    res.json({ tier });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CÁLCULO DE PRECIO
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/admin/pos/calculate-price - Calcular precio para X metros y tipo de cliente
router.post("/calculate-price", async (req, res) => {
  try {
    const { meters, customerId, priceType: requestPriceType } = req.body;
    
    if (!meters || meters <= 0) {
      return res.status(400).json({ error: "Los metros deben ser mayores a 0" });
    }

    let priceType = requestPriceType || "normal";
    let customPrice: number | null = null;

    // Si hay cliente, obtener su configuración
    if (customerId) {
      const [customer] = await db
        .select()
        .from(posCustomersTable)
        .where(eq(posCustomersTable.id, customerId));
      
      if (customer) {
        priceType = customer.priceType;
        customPrice = customer.customPricePerMeter ? Number(customer.customPricePerMeter) : null;
      }
    }

    // Si tiene precio custom, usarlo directamente
    if (customPrice) {
      const total = customPrice * Number(meters);
      return res.json({
        meters: Number(meters),
        pricePerMeter: customPrice,
        subtotal: total,
        total,
        priceType: "custom",
      });
    }

    // Buscar el tier apropiado según metros y tipo de precio
    const tiers = await db
      .select()
      .from(posPriceTiersTable)
      .where(
        and(
          eq(posPriceTiersTable.isActive, true),
          sql`${posPriceTiersTable.name} ILIKE ${`%${priceType}%`}`,
          sql`${posPriceTiersTable.minMeters} <= ${meters}`
        )
      )
      .orderBy(desc(posPriceTiersTable.minMeters));

    let selectedTier = tiers.find(tier => {
      if (tier.maxMeters === null) return true;
      return Number(meters) <= Number(tier.maxMeters);
    });

    if (!selectedTier && tiers.length > 0) {
      selectedTier = tiers[tiers.length - 1];
    }

    if (!selectedTier) {
      return res.status(400).json({ 
        error: "No se encontró precio para esta cantidad de metros" 
      });
    }

    const pricePerMeter = Number(selectedTier.pricePerMeter);
    const total = pricePerMeter * Number(meters);

    res.json({
      meters: Number(meters),
      pricePerMeter,
      subtotal: total,
      total,
      priceType,
      tierUsed: selectedTier.name,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VENTAS
// ══════════════════════════════════════════════════════════════════════════════

// Generar folio único
function generateFolio(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `DTF${year}${month}${day}${random}`;
}

// GET /api/admin/pos/sales - Listar ventas
router.get("/sales", async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const sales = await db
      .select()
      .from(posSalesTable)
      .orderBy(desc(posSalesTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(posSalesTable);

    res.json({ sales, total: Number(count) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/pos/sales/:id - Obtener venta por ID
router.get("/sales/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [sale] = await db
      .select()
      .from(posSalesTable)
      .where(eq(posSalesTable.id, Number(id)));

    if (!sale) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    res.json({ sale });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/pos/sales - Crear nueva venta
router.post("/sales", async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      totalMeters,
      pricePerMeter,
      subtotal,
      discount,
      total,
      paymentMethod,
      notes,
    } = req.body;

    if (!totalMeters || !pricePerMeter || !total) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const folio = generateFolio();
    const userId = req.user.id;

    const [sale] = await db
      .insert(posSalesTable)
      .values({
        folio,
        customerId: customerId || null,
        customerName: customerName || "Cliente General",
        totalMeters,
        pricePerMeter,
        subtotal,
        discount: discount || "0",
        total,
        paymentMethod: paymentMethod || "efectivo",
        notes: notes || null,
        createdBy: userId,
      })
      .returning();

    res.json({ sale });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/pos/inventory - Listar inventario
router.get("/inventory", async (req, res) => {
  try {
    const items = await db
      .select()
      .from(posInventoryTable)
      .where(eq(posInventoryTable.isActive, true))
      .orderBy(posInventoryTable.productName);
    
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/pos/inventory - Agregar producto
router.post("/inventory", async (req, res) => {
  try {
    const { productName, description, stock, unit, cost, lowStockAlert } = req.body;
    
    if (!productName) {
      return res.status(400).json({ error: "El nombre del producto es requerido" });
    }

    const [item] = await db
      .insert(posInventoryTable)
      .values({
        productName,
        description: description || null,
        stock: stock || "0",
        unit: unit || "metros",
        cost: cost || "0",
        lowStockAlert: lowStockAlert || null,
      })
      .returning();

    res.json({ item });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/pos/inventory/:id - Actualizar producto
router.put("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, description, stock, unit, cost, lowStockAlert, isActive } = req.body;

    const [item] = await db
      .update(posInventoryTable)
      .set({
        productName,
        description,
        stock,
        unit,
        cost,
        lowStockAlert,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(posInventoryTable.id, Number(id)))
      .returning();

    res.json({ item });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/pos/reports/daily - Reporte del día
router.get("/reports/daily", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sales = await db
      .select()
      .from(posSalesTable)
      .where(
        and(
          gte(posSalesTable.createdAt, today),
          lte(posSalesTable.createdAt, tomorrow)
        )
      );

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalMeters = sales.reduce((sum, sale) => sum + Number(sale.totalMeters), 0);

    res.json({
      date: today.toISOString(),
      totalSales,
      totalRevenue,
      totalMeters,
      sales,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/pos/reports/range - Reporte por rango de fechas
router.get("/reports/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Fechas requeridas" });
    }

    const sales = await db
      .select()
      .from(posSalesTable)
      .where(
        and(
          gte(posSalesTable.createdAt, new Date(startDate as string)),
          lte(posSalesTable.createdAt, new Date(endDate as string))
        )
      );

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalMeters = sales.reduce((sum, sale) => sum + Number(sale.totalMeters), 0);

    res.json({
      startDate,
      endDate,
      totalSales,
      totalRevenue,
      totalMeters,
      sales,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
