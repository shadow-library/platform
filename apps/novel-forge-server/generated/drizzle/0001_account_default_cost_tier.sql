ALTER TABLE "account_settings" ADD COLUMN "default_cost_tier" "cost_tier" DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" DROP COLUMN "models";