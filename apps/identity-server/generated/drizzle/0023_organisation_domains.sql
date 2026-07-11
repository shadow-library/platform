CREATE TYPE "public"."organisation_domain_status" AS ENUM('PENDING', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TABLE "organisation_domains" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organisation_id" bigint NOT NULL,
	"domain" varchar(253) NOT NULL,
	"verification_token" varchar(64) NOT NULL,
	"status" "organisation_domain_status" DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"matched_record" varchar(512),
	"last_check_error" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation_domains" ADD CONSTRAINT "organisation_domains_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domains_org_domain_unique" ON "organisation_domains" USING btree ("organisation_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domains_verified_unique" ON "organisation_domains" USING btree ("domain") WHERE "organisation_domains"."status" = 'VERIFIED';