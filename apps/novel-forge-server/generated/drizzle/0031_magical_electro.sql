CREATE TABLE "account_settings" (
	"owner_id" bigint PRIMARY KEY NOT NULL,
	"models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
