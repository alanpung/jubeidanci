ALTER TABLE "dictionary_word" ADD COLUMN IF NOT EXISTS "cse_level" text;--> statement-breakpoint
ALTER TABLE "srs_card" ADD COLUMN IF NOT EXISTS "cse_level" text;--> statement-breakpoint
ALTER TABLE "word_cache" ADD COLUMN IF NOT EXISTS "cse_level" text;
