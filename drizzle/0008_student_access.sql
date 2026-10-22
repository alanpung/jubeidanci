CREATE TABLE "student_access" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text,
	"unit_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_access" ADD CONSTRAINT "student_access_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_access" ADD CONSTRAINT "student_access_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_access" ADD CONSTRAINT "student_access_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_access" ADD CONSTRAINT "student_access_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_access_course_unique" ON "student_access" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_access_unit_unique" ON "student_access" USING btree ("student_id","unit_id");