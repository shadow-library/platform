ALTER TABLE "model_calls" ADD COLUMN "plugins" jsonb;--> statement-breakpoint
ALTER TABLE "model_calls" ADD COLUMN "policy_digest" varchar;