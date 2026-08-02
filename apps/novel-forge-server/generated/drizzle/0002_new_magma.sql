CREATE TYPE "public"."entity_wiki_visibility" AS ENUM('default', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."wiki_publication_state" AS ENUM('pending', 'pushed', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "wiki_publications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entry_key" varchar(128) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"state" "wiki_publication_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"pushed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_publications_project_id_entry_key_unique" UNIQUE("project_id","entry_key")
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "wiki_visibility" "entity_wiki_visibility" DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_publications" ADD CONSTRAINT "wiki_publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_publications_project_id_state_idx" ON "wiki_publications" USING btree ("project_id","state");