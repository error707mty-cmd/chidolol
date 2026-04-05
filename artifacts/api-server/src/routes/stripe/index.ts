import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient, getStripePublishableKey } from "../../stripeClient";
import { stripeStorage } from "../../stripeStorage";
import { requireAuth } from "../../middlewares/requireAuth";

const router = Router();

router.get("/stripe/publishable-key", async (_req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch {
    res.status(503).json({ error: "Stripe no configurado" });
  }
});

router.get("/stripe/plans", async (_req, res) => {
  try {
    const rows = await stripeStorage.listProductsWithPrices();
    const map = new Map<string, any>();
    for (const row of rows) {
      const r = row as Record<string, any>;
      if (!map.has(r["product_id"] as string)) {
        map.set(r["product_id"] as string, {
          id: r["product_id"],
          name: r["product_name"],
          description: r["product_description"],
          prices: [],
        });
      }
      if (r["price_id"]) {
        map.get(r["product_id"] as string).prices.push({
          id: r["price_id"],
          unitAmount: r["unit_amount"],
          currency: r["currency"],
          recurring: r["recurring"],
        });
      }
    }
    res.json({ plans: Array.from(map.values()) });
  } catch {
    res.json({ plans: [] });
  }
});

router.post("/stripe/checkout", requireAuth, async (req: any, res) => {
  const { priceId } = req.body as { priceId: string };
  const userId = req.user.userId as number;

  if (!priceId) { res.status(400).json({ error: "priceId requerido" }); return; }

  try {
    const stripe = await getUncachableStripeClient();
    const info = await stripeStorage.getUserStripeInfo(userId);
    const baseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
    const appBase = process.env["VITE_BASE_URL"] ?? "";

    let customerId = info?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: info?.email ?? undefined,
        metadata: { userId: String(userId) },
      });
      await stripeStorage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${baseUrl}${appBase}/pliegos?subscribed=1`,
      cancel_url: `${baseUrl}${appBase}/pliegos`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error", e);
    res.status(500).json({ error: e.message ?? "Error al crear sesión de pago" });
  }
});

router.post("/stripe/portal", requireAuth, async (req: any, res) => {
  const userId = req.user.userId as number;
  try {
    const stripe = await getUncachableStripeClient();
    const info = await stripeStorage.getUserStripeInfo(userId);
    if (!info?.stripeCustomerId) {
      res.status(400).json({ error: "No tienes suscripción activa" });
      return;
    }

    const baseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
    const appBase = process.env["VITE_BASE_URL"] ?? "";
    const session = await stripe.billingPortal.sessions.create({
      customer: info.stripeCustomerId,
      return_url: `${baseUrl}${appBase}/perfil`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Error al abrir portal" });
  }
});

router.get("/stripe/subscription", requireAuth, async (req: any, res) => {
  const userId = req.user.userId as number;
  try {
    const sub = await stripeStorage.getSubscriptionByUser(userId);
    res.json({ subscription: sub });
  } catch {
    res.json({ subscription: null });
  }
});

export default router;
