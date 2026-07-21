ALTER TABLE "oauth_clients" DROP CONSTRAINT "oauth_clients_workload_subject_unique";--> statement-breakpoint
ALTER TABLE "oauth_clients" DROP COLUMN "workload_subject";