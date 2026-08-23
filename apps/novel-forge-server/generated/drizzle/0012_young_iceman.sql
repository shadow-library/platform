CREATE TYPE "public"."illustration_status" AS ENUM('active', 'saved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."illustration_subject_type" AS ENUM('entity', 'chapter', 'cover');--> statement-breakpoint
CREATE TABLE "illustrations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"subject_type" "illustration_subject_type" NOT NULL,
	"subject_key" varchar,
	"status" "illustration_status" DEFAULT 'active' NOT NULL,
	"prompt_spec" jsonb NOT NULL,
	"candidates" jsonb NOT NULL,
	"selected_ref" varchar,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "appearance" text;--> statement-breakpoint
ALTER TABLE "illustrations" ADD CONSTRAINT "illustrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "illustrations_project_id_subject_type_subject_key_idx" ON "illustrations" USING btree ("project_id","subject_type","subject_key");