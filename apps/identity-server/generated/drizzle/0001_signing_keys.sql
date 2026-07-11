CREATE TYPE "public"."signing_key_algorithm" AS ENUM('EdDSA');--> statement-breakpoint
CREATE TYPE "public"."signing_key_status" AS ENUM('PENDING', 'ACTIVE', 'RETIRING', 'RETIRED');--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"kid" uuid PRIMARY KEY NOT NULL,
	"algorithm" "signing_key_algorithm" DEFAULT 'EdDSA' NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_key_ciphertext" text NOT NULL,
	"private_key_iv" text NOT NULL,
	"private_key_auth_tag" text NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL,
	"status" "signing_key_status" DEFAULT 'PENDING' NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signing_keys_single_active_idx" ON "signing_keys" USING btree ("status") WHERE status = 'ACTIVE';