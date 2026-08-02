CREATE TYPE "public"."publication_grant_state" AS ENUM('resolved', 'pending');--> statement-breakpoint
CREATE TYPE "public"."publication_visibility" AS ENUM('PUBLIC', 'ORGANISATION', 'RESTRICTED');--> statement-breakpoint
CREATE TABLE "publication_grants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publication_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"subject_id" varchar(128),
	"state" "publication_grant_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publication_grants_publication_id_email_unique" UNIQUE("publication_id","email")
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "visibility" "publication_visibility" DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "organisation_id" varchar(64);--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "access_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_grants" ADD CONSTRAINT "publication_grants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_grants_publication_id_state_idx" ON "publication_grants" USING btree ("publication_id","state");