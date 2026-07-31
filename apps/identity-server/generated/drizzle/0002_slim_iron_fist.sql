CREATE TYPE "public"."organisation_app_access_mode" AS ENUM('ALL_APPS', 'ASSIGNED_ONLY');--> statement-breakpoint
CREATE TYPE "public"."application_visibility" AS ENUM('PUBLIC', 'RESTRICTED', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."organisation_application_source" AS ENUM('PLATFORM_RELEASE', 'ORG_ASSIGNMENT');--> statement-breakpoint
ALTER TYPE "public"."principal_type" ADD VALUE 'ORGANISATION';--> statement-breakpoint
CREATE TABLE "organisation_applications" (
	"organisation_id" bigint NOT NULL,
	"application_id" integer NOT NULL,
	"source" "organisation_application_source" NOT NULL,
	"assigned_by" varchar(64),
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_applications_organisation_id_application_id_source_pk" PRIMARY KEY("organisation_id","application_id","source")
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "app_access_mode" "organisation_app_access_mode" DEFAULT 'ALL_APPS' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_roles" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "visibility" "application_visibility" DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation_applications" ADD CONSTRAINT "organisation_applications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_applications" ADD CONSTRAINT "organisation_applications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organisation_applications_application_id_idx" ON "organisation_applications" USING btree ("application_id");