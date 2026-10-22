ALTER TABLE "student_access" DROP CONSTRAINT "student_access_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "student_access" DROP CONSTRAINT "student_access_student_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "student_access" DROP CONSTRAINT "student_access_course_id_course_id_fk";
--> statement-breakpoint
ALTER TABLE "student_access" DROP CONSTRAINT "student_access_unit_id_unit_id_fk";
--> statement-breakpoint
CREATE INDEX "student_access_owner_idx" ON "student_access" USING btree ("owner_id");