CREATE TYPE "public"."novel_visibility" AS ENUM('PUBLIC', 'ORGANISATION', 'RESTRICTED');--> statement-breakpoint
CREATE TABLE "novel_grants" (
	"novel_id" bigint NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	CONSTRAINT "novel_grants_novel_id_subject_id_pk" PRIMARY KEY("novel_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "novels" ADD COLUMN "visibility" "novel_visibility" DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "novels" ADD COLUMN "organisation_id" varchar(64);--> statement-breakpoint
ALTER TABLE "novels" ADD COLUMN "access_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "novel_grants" ADD CONSTRAINT "novel_grants_novel_id_novels_id_fk" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "novel_grants_subject_id_idx" ON "novel_grants" USING btree ("subject_id");