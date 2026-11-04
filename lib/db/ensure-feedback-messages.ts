import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

let ensured: Promise<void> | null = null;

export function ensureFeedbackMessagesTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "feedback_message" (
          "id" text PRIMARY KEY NOT NULL,
          "user_id" text,
          "user_email" text NOT NULL,
          "user_name" text,
          "auth_method" text,
          "message" text NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "feedback_message_created_at_idx"
        ON "feedback_message" ("created_at" DESC)
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}
