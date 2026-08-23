CREATE TYPE "public"."expense_source" AS ENUM('manual', 'ocr');--> statement-breakpoint
CREATE TYPE "public"."reminder_lead" AS ENUM('on_day', '1_day', '2_day', '3_day', '1_week');--> statement-breakpoint
CREATE TYPE "public"."subscription_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly', 'custom');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"key" varchar(32) NOT NULL,
	"label" varchar(64) NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_account_id_key_unique" UNIQUE("account_id","key")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"amount_text" varchar(40) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(18, 8),
	"home_amount_minor" bigint,
	"fx_rate_date" date,
	"category_id" varchar(32) NOT NULL,
	"merchant" varchar(200),
	"note" text,
	"receipt_ref" varchar(200),
	"line_items" jsonb,
	"occurred_on" date NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"linked_quest_id" bigint,
	"linked_subscription_id" bigint,
	"billing_cycle_date" date,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"date" date NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"rate" numeric(18, 8),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_date_base_quote_pk" PRIMARY KEY("date","base","quote")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(200) NOT NULL,
	"note" text,
	"amount_minor" bigint NOT NULL,
	"amount_text" varchar(40) NOT NULL,
	"currency" char(3) NOT NULL,
	"frequency" "subscription_frequency" NOT NULL,
	"custom_interval_days" smallint,
	"billing_day" smallint NOT NULL,
	"next_due_date" date NOT NULL,
	"last_confirmed_date" date,
	"category_id" varchar(32) NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_lead" "reminder_lead" DEFAULT 'on_day' NOT NULL,
	"monthly_equivalent_minor" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_billing_day_check" CHECK ("subscriptions"."billing_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_linked_subscription_id_subscriptions_id_fk" FOREIGN KEY ("linked_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_account_id_linked_subscription_id_billing_cycle_date_unique" ON "expenses" USING btree ("account_id","linked_subscription_id","billing_cycle_date") WHERE "expenses"."linked_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "expenses_account_id_occurred_on_idx" ON "expenses" USING btree ("account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "expenses_account_id_category_id_occurred_on_idx" ON "expenses" USING btree ("account_id","category_id","occurred_on");--> statement-breakpoint
CREATE INDEX "expenses_account_id_sync_seq_idx" ON "expenses" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_sync_seq_idx" ON "subscriptions" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_active_idx" ON "subscriptions" USING btree ("account_id","active");