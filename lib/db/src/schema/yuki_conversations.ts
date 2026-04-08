import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const yukiConversationsTable = pgTable("yuki_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  messages: jsonb("messages").notNull().default('[]'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type YukiConversation = typeof yukiConversationsTable.$inferSelect;
export type NewYukiConversation = typeof yukiConversationsTable.$inferInsert;
