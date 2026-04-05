import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed";
import { WebhookHandlers } from "./webhookHandlers";
import { scheduleDailyCleanup } from "./lib/cleanup";

seedAdminUser();
scheduleDailyCleanup();

const app: Express = express();

// ── Stripe webhook MUST be registered before express.json() ──────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) { res.status(400).json({ error: "Missing stripe-signature" }); return; }
    try {
      const sigStr = Array.isArray(sig) ? sig[0]! : sig;
      await WebhookHandlers.processWebhook(req.body as Buffer, sigStr);
      res.status(200).json({ received: true });
    } catch (e: any) {
      console.error("Stripe webhook error:", e.message);
      res.status(400).json({ error: "Webhook error" });
    }
  }
);

// ── Regular middleware ────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Serve compiled frontend (SPA) ────────────────────────────────────────────
const frontendDist = path.resolve(__dirname, "../../dtf-pliego/dist");
app.use(express.static(frontendDist));
app.get("/*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// ── Initialize Stripe on startup ─────────────────────────────────────────────
async function initStripe() {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) throw new Error("DATABASE_URL required for Stripe");

    await runMigrations({ databaseUrl, schema: "stripe" });

    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);

    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe data synced"))
      .catch((err: any) => logger.warn({ err }, "Stripe syncBackfill warning"));

    // Sync plans from existing subscriptions
    const { WebhookHandlers } = await import("./webhookHandlers");
    await WebhookHandlers.syncSubscriptionPlans();

    logger.info("Stripe initialized");
  } catch (e: any) {
    logger.warn({ msg: e.message }, "Stripe init skipped (no credentials yet)");
  }
}

initStripe();

export default app;
