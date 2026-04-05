import { getStripeSync } from "./stripeClient";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // After syncing, update plan in our users table based on subscription status
    await WebhookHandlers.syncSubscriptionPlans();
  }

  static async syncSubscriptionPlans() {
    try {
      // Find all users with a stripe_subscription_id and sync their plan
      await db.execute(sql`
        UPDATE users u
        SET plan = CASE
          WHEN s.status IN ('active', 'trialing') THEN 'pro'
          ELSE 'client'
        END
        FROM stripe.subscriptions s
        WHERE u.stripe_subscription_id = s.id
          AND u.stripe_subscription_id IS NOT NULL
      `);
    } catch (e) {
      console.warn("syncSubscriptionPlans: stripe schema may not exist yet", e);
    }
  }
}
