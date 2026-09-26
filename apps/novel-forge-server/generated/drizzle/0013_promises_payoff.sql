ALTER TYPE "public"."mystery_status" ADD VALUE 'dropped';--> statement-breakpoint
ALTER TYPE "public"."thread_status" ADD VALUE 'dropped';--> statement-breakpoint
ALTER TABLE "mysteries" ADD COLUMN "payoff_milestone_key" varchar;--> statement-breakpoint
ALTER TABLE "mysteries" ADD COLUMN "payoff_volume_key" varchar;--> statement-breakpoint
ALTER TABLE "plot_threads" ADD COLUMN "payoff_milestone_key" varchar;--> statement-breakpoint
ALTER TABLE "plot_threads" ADD COLUMN "payoff_volume_key" varchar;