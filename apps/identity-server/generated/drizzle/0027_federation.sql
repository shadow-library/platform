ALTER TYPE "public"."user_auth_provider" ADD VALUE 'FEDERATED' BEFORE 'GOOGLE';--> statement-breakpoint
CREATE TABLE "federated_identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"subject" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "federated_identities_provider_subject_unique" UNIQUE("identity_provider_id","subject"),
	CONSTRAINT "federated_identities_provider_user_unique" UNIQUE("identity_provider_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "identity_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ciphertext" text NOT NULL,
	"client_secret_iv" text NOT NULL,
	"client_secret_auth_tag" text NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL,
	"scopes" varchar(255) DEFAULT 'openid email profile' NOT NULL,
	"authorization_endpoint" text NOT NULL,
	"token_endpoint" text NOT NULL,
	"jwks_uri" text NOT NULL,
	"enforced" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_providers_organisation_id_unique" UNIQUE("organisation_id")
);
--> statement-breakpoint
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_identity_provider_id_identity_providers_id_fk" FOREIGN KEY ("identity_provider_id") REFERENCES "public"."identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "federated_identities_user_idx" ON "federated_identities" USING btree ("user_id");