ALTER TABLE "chat_messages" ADD COLUMN "model_provider" varchar;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "model_id" varchar;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "model_provider" varchar;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "model_id" varchar;