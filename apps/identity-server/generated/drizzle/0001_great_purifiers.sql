CREATE TABLE "organisation_policies" (
	"organisation_id" bigint NOT NULL,
	"policy_key" varchar(128) NOT NULL,
	"policy_value" jsonb NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_policies_organisation_id_policy_key_pk" PRIMARY KEY("organisation_id","policy_key")
);
--> statement-breakpoint
ALTER TABLE "organisation_policies" ADD CONSTRAINT "organisation_policies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;