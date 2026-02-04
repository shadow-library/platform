DROP INDEX "notification_messages_created_at_channel_idx";--> statement-breakpoint
CREATE INDEX "notification_messages_created_at_channel_idx" ON "notification_messages" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "notification_messages" DROP COLUMN "channel";--> statement-breakpoint
ALTER TABLE "notification_messages" DROP COLUMN "payload";