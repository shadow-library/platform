ALTER TABLE "accounts" ADD COLUMN "monthly_budget_minor" bigint;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_monthly_budget_minor_check" CHECK ("accounts"."monthly_budget_minor" >= 0);