-- Mark the CEFR A2-C2 courses created in this batch as VIP (private).
--
-- New rows already pick this up from the course markdown frontmatter (see
-- lib/content/course-parser.ts and lib/db/seed-content.ts). This backfill
-- fixes the rows that were seeded as "public" before visibility was wired
-- through the parser, so an already-deployed database converges on the same
-- state. Both statements are idempotent and no-op on a fresh empty database
-- (there seed inserts the markdown value directly).
UPDATE "course"
SET "visibility" = 'private', "updated_at" = now()
WHERE "id" IN (
  'a2-multiple-choice-course',
  'b1-multiple-choice-course',
  'b2-multiple-choice-course',
  'c1-multiple-choice-course',
  'c2-multiple-choice-course',
  'a2-fill-in-the-blank-course',
  'b1-fill-in-the-blank-course',
  'b2-fill-in-the-blank-course',
  'c1-fill-in-the-blank-course',
  'c2-fill-in-the-blank-course',
  'a2-listening-course',
  'b1-listening-course',
  'b2-listening-course',
  'c1-listening-course',
  'c2-listening-course'
);
--> statement-breakpoint
UPDATE "unit"
SET "visibility" = 'private', "updated_at" = now()
WHERE "course_id" IN (
  'a2-multiple-choice-course',
  'b1-multiple-choice-course',
  'b2-multiple-choice-course',
  'c1-multiple-choice-course',
  'c2-multiple-choice-course',
  'a2-fill-in-the-blank-course',
  'b1-fill-in-the-blank-course',
  'b2-fill-in-the-blank-course',
  'c1-fill-in-the-blank-course',
  'c2-fill-in-the-blank-course',
  'a2-listening-course',
  'b1-listening-course',
  'b2-listening-course',
  'c1-listening-course',
  'c2-listening-course'
);
