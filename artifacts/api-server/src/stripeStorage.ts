import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export class StripeStorage {
  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async listProductsWithPrices() {
    const result = await db.execute(sql`
      WITH paginated AS (
        SELECT id, name, description, metadata, active
        FROM stripe.products
        WHERE active = true
        ORDER BY id
      )
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.active AS product_active,
        p.metadata AS product_metadata,
        pr.id AS price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active AS price_active
      FROM paginated p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      ORDER BY p.id, pr.unit_amount
    `);
    return result.rows;
  }

  async getSubscriptionByUser(userId: number) {
    const [user] = await db
      .select({ stripeSubscriptionId: usersTable.stripeSubscriptionId })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user?.stripeSubscriptionId) return null;

    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${user.stripeSubscriptionId}`
    );
    return result.rows[0] || null;
  }

  async getUserStripeInfo(userId: number) {
    const [user] = await db
      .select({
        stripeCustomerId: usersTable.stripeCustomerId,
        stripeSubscriptionId: usersTable.stripeSubscriptionId,
        plan: usersTable.plan,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    return user;
  }

  async updateUserStripeInfo(userId: number, info: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    plan?: string;
  }) {
    const [updated] = await db
      .update(usersTable)
      .set(info)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });
    return updated;
  }
}

export const stripeStorage = new StripeStorage();
