CREATE TABLE "organisation_invitations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organisation_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "organisation_member_role" DEFAULT 'MEMBER' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "slug" varchar(64);--> statement-breakpoint
UPDATE "organisations" SET "slug" = 'org-' || "id" WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "organisations" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_invitations_pending_unique" ON "organisation_invitations" USING btree ("organisation_id","email") WHERE "organisation_invitations"."accepted_at" IS NULL AND "organisation_invitations"."declined_at" IS NULL AND "organisation_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organisation_invitations_email_idx" ON "organisation_invitations" USING btree ("email");--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_slug_unique" UNIQUE("slug");