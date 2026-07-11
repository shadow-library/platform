CREATE TYPE "public"."mfa_method" AS ENUM('TOTP', 'WEBAUTHN', 'EMAIL_OTP');--> statement-breakpoint
ALTER TYPE "public"."user_auth_provider" ADD VALUE 'WEBAUTHN' BEFORE 'GOOGLE';--> statement-breakpoint
ALTER TYPE "public"."user_auth_provider" ADD VALUE 'RECOVERY_CODE' BEFORE 'GOOGLE';--> statement-breakpoint
CREATE TABLE "mfa_enrollments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" "mfa_method" NOT NULL,
	"secret_ciphertext" text,
	"kek_version" integer,
	"label" varchar(64) DEFAULT 'default' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_used_counter" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_enrollments_user_type_label_unique" UNIQUE("user_id","type","label")
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"code_hash" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");