CREATE TABLE IF NOT EXISTS "student_vip" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "student_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_vip_owner_student_unique" ON "student_vip" ("owner_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_vip_student_idx" ON "student_vip" USING btree ("student_id");
