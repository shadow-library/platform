CREATE TYPE "public"."session_status" AS ENUM('ACTIVE', 'REVOKED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."sign_in_status" AS ENUM('SUCCESS', 'INVALID_CREDENTIALS', 'MFA_FAILED', 'ACCOUNT_LOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."organisation_member_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."public_key_algorithm" AS ENUM('ECDSA', 'ECDHE', 'EdDSA', 'RSA_3072', 'RSA_4096');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');--> statement-breakpoint
CREATE TYPE "public"."password_algorithm" AS ENUM('BCRYPT', 'ARGON2ID');--> statement-breakpoint
CREATE TYPE "public"."user_auth_provider" AS ENUM('PASSWORD', 'OTP', 'TOTP', 'GOOGLE', 'MICROSOFT');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "user_session_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" bigint NOT NULL,
	"application_id" bigint NOT NULL,
	"token_hash" varchar(512) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"ip_address" varchar(45),
	"ip_country" varchar(2),
	"previous_token_id" bigint,
	CONSTRAINT "user_session_tokens_session_id_application_id_unique" UNIQUE("session_id","application_id"),
	CONSTRAINT "user_session_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"user_sign_in_event_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"terminated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"elevated_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_sign_in_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"identifier" varchar(255) NOT NULL,
	"status" "sign_in_status" NOT NULL,
	"auth_mode_used" "user_auth_provider" NOT NULL,
	"mfa_mode_used" "user_auth_provider",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"device_id" varchar(255),
	"ip_address" varchar(45),
	"ip_country" varchar(2),
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "organisation_members" (
	"organisation_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"role" "organisation_member_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_members_organisation_id_user_id_pk" PRIMARY KEY("organisation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_configurations" (
	"application_id" integer NOT NULL,
	"config_name" varchar(255) NOT NULL,
	"config_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_configurations_application_id_config_name_pk" PRIMARY KEY("application_id","config_name")
);
--> statement-breakpoint
CREATE TABLE "application_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"application_id" integer NOT NULL,
	"public_key" text NOT NULL,
	"algorithm" "public_key_algorithm" NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"role_name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_roles_application_role_unique" UNIQUE("application_id","role_name")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sub_domain" varchar(255) NOT NULL,
	"home_page_url" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_auth_identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"provider" "user_auth_provider" NOT NULL,
	"provider_key" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_auth_identities_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "user_auth_identities_provider_key_unique" UNIQUE("provider","provider_key")
);
--> statement-breakpoint
CREATE TABLE "user_emails" (
	"user_id" bigint NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_emails_user_id_email_id_pk" PRIMARY KEY("user_id","email_id"),
	CONSTRAINT "user_emails_email_id_unique" UNIQUE("email_id")
);
--> statement-breakpoint
CREATE TABLE "user_passwords" (
	"user_auth_identity_id" bigint PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"algorithm" "password_algorithm" DEFAULT 'BCRYPT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_phones" (
	"user_id" bigint NOT NULL,
	"phone_number" varchar(15) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_phones_user_id_phone_number_pk" PRIMARY KEY("user_id","phone_number"),
	CONSTRAINT "user_phones_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"first_name" varchar(64),
	"last_name" varchar(64),
	"display_name" varchar(64),
	"gender" "gender" DEFAULT 'UNSPECIFIED' NOT NULL,
	"date_of_birth" date,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" varchar(32),
	"status" "user_status" DEFAULT 'INACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "user_session_tokens" ADD CONSTRAINT "user_session_tokens_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session_tokens" ADD CONSTRAINT "user_session_tokens_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_sign_in_event_id_user_sign_in_events_id_fk" FOREIGN KEY ("user_sign_in_event_id") REFERENCES "public"."user_sign_in_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_configurations" ADD CONSTRAINT "application_configurations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_keys" ADD CONSTRAINT "application_keys_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_roles" ADD CONSTRAINT "application_roles_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_auth_identities" ADD CONSTRAINT "user_auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_passwords" ADD CONSTRAINT "user_passwords_user_auth_identity_id_user_auth_identities_id_fk" FOREIGN KEY ("user_auth_identity_id") REFERENCES "public"."user_auth_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_phones" ADD CONSTRAINT "user_phones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_status_idx" ON "user_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_sign_in_events_user_id_created_at_idx" ON "user_sign_in_events" USING btree ("user_id","created_at","status");--> statement-breakpoint
CREATE INDEX "user_sign_in_events_identifier_created_at_idx" ON "user_sign_in_events" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "user_sign_in_events_ip_address_created_at_idx" ON "user_sign_in_events" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "application_keys_application_id_idx" ON "application_keys" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_roles_application_id_idx" ON "application_roles" USING btree ("application_id");