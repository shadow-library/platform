CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."owner_kind" AS ENUM('user', 'bot');--> statement-breakpoint
CREATE TYPE "public"."content_generator" AS ENUM('standard', 'unrestricted', 'human');--> statement-breakpoint
CREATE TYPE "public"."content_mode" AS ENUM('standard', 'unrestricted');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('new_novel');--> statement-breakpoint
CREATE TYPE "public"."chapter_status" AS ENUM('done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."entity_origin" AS ENUM('extracted', 'seeded', 'generated');--> statement-breakpoint
CREATE TYPE "public"."entity_significance" AS ENUM('major', 'minor');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('character', 'faction', 'location', 'power_rule', 'item', 'concept');--> statement-breakpoint
CREATE TYPE "public"."entity_wiki_visibility" AS ENUM('default', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."fact_source" AS ENUM('brief', 'manual', 'import', 'seed', 'generated');--> statement-breakpoint
CREATE TYPE "public"."mystery_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."bible_section" AS ENUM('project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore');--> statement-breakpoint
CREATE TYPE "public"."brief_write_mode" AS ENUM('standard', 'external');--> statement-breakpoint
CREATE TYPE "public"."continuity_proposal_status" AS ENUM('pending', 'applied', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."draft_review_status" AS ENUM('generating', 'needs_review', 'contradiction', 'approved', 'final');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."judge_verdict" AS ENUM('consistent', 'contradiction', 'evaluation_failed');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."chat_mode" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."chat_scope" AS ENUM('project', 'novel', 'bible_document', 'volume', 'brief');--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."refinement_kind" AS ENUM('chat', 'hub', 'premise_enhance', 'bible_audit', 'chapter_extract', 'plugin');--> statement-breakpoint
CREATE TYPE "public"."refinement_proposal_status" AS ENUM('pending', 'applied', 'discarded', 'superseded', 'conflicted', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."ledger_decided_by" AS ENUM('author', 'system');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_kind" AS ENUM('decision', 'direction', 'rejected', 'backlog', 'system');--> statement-breakpoint
CREATE TYPE "public"."chapter_publication_status" AS ENUM('scheduled', 'published', 'failed', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."publication_grant_state" AS ENUM('resolved', 'pending');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'live', 'retired');--> statement-breakpoint
CREATE TYPE "public"."publication_visibility" AS ENUM('PUBLIC', 'ORGANISATION', 'RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."wiki_publication_state" AS ENUM('pending', 'pushed', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."illustration_status" AS ENUM('active', 'saved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."illustration_subject_type" AS ENUM('entity', 'chapter', 'cover');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('generate', 'finalize', 'backfill', 'publish', 'import');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'in_progress', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."validation_scope" AS ENUM('novel', 'chapter');--> statement-breakpoint
CREATE TYPE "public"."draft_revision_source" AS ENUM('generated', 'patched', 'rewritten', 'revised', 'imported', 'hand_edited', 'chat_edited', 'amended');--> statement-breakpoint
CREATE TYPE "public"."model_call_status" AS ENUM('ok', 'parse_error', 'repaired', 'refused', 'transport_error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."tool_call_status" AS ENUM('ok', 'invalid_args', 'handler_error', 'budget_exceeded');--> statement-breakpoint
CREATE TYPE "public"."user_feedback_artifact_type" AS ENUM('draft', 'continuity_proposal', 'volume', 'bible_document', 'validation_report', 'refinement_proposal');--> statement-breakpoint
CREATE TYPE "public"."user_feedback_disposition" AS ENUM('revision_requested', 'approved', 'rejected', 'comment');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'completed', 'awaiting_review', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_kind" "owner_kind" DEFAULT 'user' NOT NULL,
	"owner_id" bigint,
	"organisation_id" bigint,
	"shared_with_org" boolean DEFAULT false NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "project_kind" NOT NULL,
	"title" varchar(500),
	"cover_image_path" varchar,
	"content_mode" "content_mode" DEFAULT 'standard' NOT NULL,
	"config" jsonb,
	"word_target_min" integer,
	"word_target_max" integer,
	"brief" text,
	"premise" text,
	"themes" jsonb,
	"instructions" text,
	"imported_meta" jsonb,
	"story_current_chapter" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_bot_owner_organisation_check" CHECK ("projects"."owner_kind" <> 'bot' OR "projects"."organisation_id" IS NOT NULL),
	CONSTRAINT "projects_word_target_check" CHECK (("projects"."word_target_min" IS NULL AND "projects"."word_target_max" IS NULL) OR ("projects"."word_target_min" IS NOT NULL AND "projects"."word_target_max" IS NOT NULL AND "projects"."word_target_max" > "projects"."word_target_min"))
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(500),
	"content" text,
	"summary" text,
	"word_count" integer,
	"status" "chapter_status" NOT NULL,
	"generator" "content_generator" DEFAULT 'standard' NOT NULL,
	"isolated" boolean DEFAULT false NOT NULL,
	"content_rating" jsonb,
	"locked" boolean DEFAULT false NOT NULL,
	"needs_revalidation" boolean DEFAULT false NOT NULL,
	"continuity_applied" boolean DEFAULT false NOT NULL,
	"continuity_claimed_at" timestamp,
	"continuity_claimed_by" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_project_id_number_unique" UNIQUE("project_id","number")
);
--> statement-breakpoint
CREATE TABLE "canon_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"fact_key" varchar NOT NULL,
	"text" text NOT NULL,
	"subjects" jsonb,
	"constraint_note" text,
	"writer_note" text,
	"terms" jsonb,
	"reveal_chapter" integer,
	"source" "fact_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canon_facts_project_id_fact_key_unique" UNIQUE("project_id","fact_key")
);
--> statement-breakpoint
CREATE TABLE "character_knowledge" (
	"project_id" bigint NOT NULL,
	"fact_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	"learned_in_chapter" integer NOT NULL,
	"source" "fact_source" DEFAULT 'manual' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_knowledge_fact_id_entity_id_pk" PRIMARY KEY("fact_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "character_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_key" varchar NOT NULL,
	"location" varchar,
	"conditions" jsonb,
	"immediate_goal" text,
	"status_note" text,
	"last_updated_chapter" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_states_project_id_entity_key_unique" UNIQUE("project_id","entity_key")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_key" varchar NOT NULL,
	"type" "entity_type" NOT NULL,
	"name" varchar NOT NULL,
	"attributes" jsonb,
	"significance" "entity_significance",
	"first_seen_chapter" integer,
	"status" varchar,
	"origin" "entity_origin",
	"notes" text,
	"motivation" text,
	"body" text,
	"appearance" text,
	"image_path" varchar,
	"wiki_visibility" "entity_wiki_visibility" DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entities_project_id_entity_key_unique" UNIQUE("project_id","entity_key")
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"entity_id" bigint NOT NULL,
	"alias" varchar NOT NULL,
	CONSTRAINT "entity_aliases_entity_id_alias_pk" PRIMARY KEY("entity_id","alias")
);
--> statement-breakpoint
CREATE TABLE "entity_appearances" (
	"entity_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"first_chapter" integer,
	"last_chapter" integer,
	"seen_chapters" jsonb,
	CONSTRAINT "entity_appearances_entity_id_chapter_pk" PRIMARY KEY("entity_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "entity_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"image_path" varchar NOT NULL,
	"caption" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_relationships" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	"target_key" varchar NOT NULL,
	"kind" varchar NOT NULL,
	"note" text,
	"chapter" integer,
	CONSTRAINT "entity_relationships_project_id_entity_id_target_key_kind_chapter_unique" UNIQUE("project_id","entity_id","target_key","kind","chapter")
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"volume_key" varchar NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"title" varchar(500),
	"objective" text,
	"body" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volumes_project_id_volume_key_unique" UNIQUE("project_id","volume_key")
);
--> statement-breakpoint
CREATE TABLE "mysteries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"mystery_key" varchar NOT NULL,
	"question" text NOT NULL,
	"status" "mystery_status" NOT NULL,
	"opened_chapter" integer,
	"resolved_chapter" integer,
	"known_to" varchar,
	"truth_fact_key" varchar,
	"last_advanced_chapter" integer,
	"payoff_window" integer,
	"intentionally_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mysteries_project_id_mystery_key_unique" UNIQUE("project_id","mystery_key")
);
--> statement-breakpoint
CREATE TABLE "plot_threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"thread_key" varchar NOT NULL,
	"status" "thread_status" NOT NULL,
	"opened_chapter" integer,
	"closed_chapter" integer,
	"summary" text,
	"owner" varchar,
	"payoff" text,
	"last_advanced_chapter" integer,
	"payoff_window" integer,
	"intentionally_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plot_threads_project_id_thread_key_unique" UNIQUE("project_id","thread_key")
);
--> statement-breakpoint
CREATE TABLE "world_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"category" varchar NOT NULL,
	"key" varchar NOT NULL,
	"value" text NOT NULL,
	"chapter" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_facts_project_id_category_key_unique" UNIQUE("project_id","category","key")
);
--> statement-breakpoint
CREATE TABLE "bible_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"section" "bible_section" NOT NULL,
	"slug" varchar NOT NULL,
	"frontmatter" jsonb,
	"body" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bible_documents_project_id_section_slug_unique" UNIQUE("project_id","section","slug")
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"volume_key" varchar,
	"title" varchar,
	"body" text NOT NULL,
	"context_refs" jsonb,
	"pov" varchar,
	"ending_contract" jsonb,
	"knowledge_contract" jsonb,
	"chapter_purpose" text,
	"reader_value" jsonb,
	"repetition_risks" jsonb,
	"density_risk" text,
	"guidance" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar,
	"stale_reason" varchar,
	"hand_edited" boolean DEFAULT false NOT NULL,
	"write_mode" "brief_write_mode" DEFAULT 'standard' NOT NULL,
	"inserted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "briefs_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "chapter_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"image_path" varchar NOT NULL,
	"caption" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuity_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"status" "continuity_proposal_status" DEFAULT 'pending' NOT NULL,
	"proposal" jsonb NOT NULL,
	"model" varchar,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "continuity_proposals_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"title" varchar(500),
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"words" integer,
	"volume_key" varchar,
	"summary" text,
	"body" text NOT NULL,
	"state" jsonb,
	"generator" "content_generator" DEFAULT 'standard' NOT NULL,
	"isolated" boolean DEFAULT false NOT NULL,
	"content_rating" jsonb,
	"judge" "judge_verdict",
	"judge_note" text,
	"review_status" "draft_review_status" DEFAULT 'generating' NOT NULL,
	"stale_reason" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"project_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"proposal_id" bigint,
	"run_id" varchar,
	"model_provider" varchar,
	"model_id" varchar,
	"tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_session_id_ordinal_unique" UNIQUE("session_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"scope_type" "chat_scope" NOT NULL,
	"scope_ref" varchar,
	"title" varchar(500),
	"status" "chat_session_status" DEFAULT 'active' NOT NULL,
	"mode" "chat_mode" DEFAULT 'manual' NOT NULL,
	"model_provider" varchar,
	"model_id" varchar,
	"summary" text,
	"summary_through_ordinal" integer DEFAULT 0 NOT NULL,
	"last_turn_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refinement_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"session_id" uuid,
	"message_id" bigint,
	"scope_type" "chat_scope" NOT NULL,
	"scope_ref" varchar,
	"kind" "refinement_kind" NOT NULL,
	"status" "refinement_proposal_status" DEFAULT 'pending' NOT NULL,
	"summary" text,
	"change_set" jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"auto_applied" boolean DEFAULT false NOT NULL,
	"op_results" jsonb,
	"inverse_ops" jsonb,
	"post_state" jsonb,
	"model" varchar,
	"run_id" varchar,
	"applied_at" timestamp,
	"reverted_at" timestamp,
	"error" jsonb,
	"warnings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"kind" "ledger_entry_kind" NOT NULL,
	"topic" varchar(100) NOT NULL,
	"statement" text NOT NULL,
	"why" text,
	"rejected_alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"writer_line" text,
	"decided_by" "ledger_decided_by" NOT NULL,
	"step_key" varchar(60),
	"payload" jsonb,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supersedes_id" bigint,
	"superseded_at" timestamp,
	"withdrawn_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "decision_ledger_entries_supersedes_id_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "decision_ledger_entries_withdrawn_check" CHECK ("decision_ledger_entries"."withdrawn_reason" IS NULL OR "decision_ledger_entries"."superseded_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "chapter_publications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"published_ordinal" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"author_note" text,
	"content_rating" jsonb,
	"content_hash" varchar(128) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"status" "chapter_publication_status" DEFAULT 'scheduled' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_publications_project_id_published_ordinal_unique" UNIQUE("project_id","published_ordinal")
);
--> statement-breakpoint
CREATE TABLE "publication_grants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publication_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"subject_id" varchar(128),
	"state" "publication_grant_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publication_grants_publication_id_email_unique" UNIQUE("publication_id","email")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"novel_slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"original_author" varchar(256),
	"blurb" text,
	"cover_path" varchar(512),
	"genres" jsonb,
	"tags" jsonb,
	"sexual_content" varchar(16),
	"violence" varchar(16),
	"dark_content" varchar(16),
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"visibility" "publication_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"organisation_id" varchar(64),
	"access_revision" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"publish_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publications_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "publications_novel_slug_unique" UNIQUE("novel_slug")
);
--> statement-breakpoint
CREATE TABLE "wiki_publications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entry_key" varchar(128) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"state" "wiki_publication_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"pushed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_publications_project_id_entry_key_unique" UNIQUE("project_id","entry_key")
);
--> statement-breakpoint
CREATE TABLE "illustrations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"subject_type" "illustration_subject_type" NOT NULL,
	"subject_key" varchar,
	"status" "illustration_status" DEFAULT 'active' NOT NULL,
	"prompt_spec" jsonb NOT NULL,
	"candidates" jsonb NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_ref" varchar,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_kind" "owner_kind" DEFAULT 'user' NOT NULL,
	"owner_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"kind" "job_kind" NOT NULL,
	"target" varchar NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" varchar(2000),
	"payload" jsonb,
	"progress" jsonb,
	"next_attempt_at" timestamp,
	"cancel_requested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_project_id_kind_target_unique" UNIQUE("project_id","kind","target")
);
--> statement-breakpoint
CREATE TABLE "validation_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"scope" "validation_scope" NOT NULL,
	"chapter" integer,
	"issues" integer NOT NULL,
	"summary" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"chunk_idx" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE TABLE "context_packs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"purpose" varchar NOT NULL,
	"chapter" integer,
	"hash" varchar NOT NULL,
	"budget_tokens" integer,
	"used_tokens" integer,
	"sections" jsonb,
	"unresolved_refs" jsonb,
	"omitted" jsonb,
	"rendered" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_packs_project_id_hash_unique" UNIQUE("project_id","hash")
);
--> statement-breakpoint
CREATE TABLE "draft_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"draft_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"source" "draft_revision_source" NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"state" jsonb,
	"run_id" varchar,
	"feedback_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "draft_revisions_draft_id_revision_unique" UNIQUE("draft_id","revision")
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"role" varchar NOT NULL,
	"prompt_key" varchar NOT NULL,
	"prompt_version" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"model" varchar NOT NULL,
	"request_hash" varchar NOT NULL,
	"response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "llm_cache_request_hash_unique" UNIQUE("request_hash")
);
--> statement-breakpoint
CREATE TABLE "lore_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"kind" varchar NOT NULL,
	"ref_key" varchar NOT NULL,
	"source_updated_at" timestamp NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lore_chunks_project_id_kind_ref_key_unique" UNIQUE("project_id","kind","ref_key")
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"run_id" varchar,
	"node" varchar,
	"role" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"model" varchar NOT NULL,
	"prompt_key" varchar NOT NULL,
	"prompt_version" varchar NOT NULL,
	"status" "model_call_status" NOT NULL,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"cost_usd" numeric(12, 6),
	"reasoning_effort" varchar,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"raw_output" text,
	"error" jsonb,
	"plugins" jsonb,
	"policy_digest" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" varchar NOT NULL,
	"model_call_id" bigint,
	"node" varchar NOT NULL,
	"tool" varchar NOT NULL,
	"args" jsonb,
	"result_digest" varchar,
	"status" "tool_call_status" NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"artifact_type" "user_feedback_artifact_type" NOT NULL,
	"artifact_ref" varchar NOT NULL,
	"disposition" "user_feedback_disposition" NOT NULL,
	"reviewer_id" varchar,
	"idempotency_key" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_feedback_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"job_id" varchar,
	"graph" varchar NOT NULL,
	"target" varchar NOT NULL,
	"status" "workflow_run_status" DEFAULT 'running' NOT NULL,
	"outcome" varchar,
	"input" jsonb,
	"error" jsonb,
	"node_trace" jsonb,
	"context_pack_id" bigint,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "plugin_kv" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"plugin_id" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_kv_project_id_plugin_id_key_unique" UNIQUE("project_id","plugin_id","key")
);
--> statement-breakpoint
CREATE TABLE "project_plugins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"plugin_id" varchar(64) NOT NULL,
	"plugin_version" varchar(32) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"enabled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_plugins_project_id_plugin_id_unique" UNIQUE("project_id","plugin_id")
);
--> statement-breakpoint
CREATE TABLE "account_settings" (
	"owner_kind" "owner_kind" DEFAULT 'user' NOT NULL,
	"owner_id" bigint NOT NULL,
	"models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_settings_owner_kind_owner_id_pk" PRIMARY KEY("owner_kind","owner_id")
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_fact_id_canon_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."canon_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_states" ADD CONSTRAINT "character_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_appearances" ADD CONSTRAINT "entity_appearances_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mysteries" ADD CONSTRAINT "mysteries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_threads" ADD CONSTRAINT "plot_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_facts" ADD CONSTRAINT "world_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_documents" ADD CONSTRAINT "bible_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_images" ADD CONSTRAINT "chapter_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_proposals" ADD CONSTRAINT "continuity_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD CONSTRAINT "refinement_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD CONSTRAINT "refinement_proposals_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_ledger_entries" ADD CONSTRAINT "decision_ledger_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_ledger_entries" ADD CONSTRAINT "decision_ledger_entries_supersedes_id_decision_ledger_entries_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."decision_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_publications" ADD CONSTRAINT "chapter_publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_grants" ADD CONSTRAINT "publication_grants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_publications" ADD CONSTRAINT "wiki_publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "illustrations" ADD CONSTRAINT "illustrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_chunks" ADD CONSTRAINT "chapter_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_packs" ADD CONSTRAINT "context_packs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD CONSTRAINT "draft_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD CONSTRAINT "draft_revisions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_cache" ADD CONSTRAINT "llm_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_chunks" ADD CONSTRAINT "lore_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_kv" ADD CONSTRAINT "plugin_kv_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plugins" ADD CONSTRAINT "project_plugins_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_kind_owner_id_idx" ON "projects" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "projects_shared_with_org_organisation_id_idx" ON "projects" USING btree ("organisation_id") WHERE "projects"."shared_with_org";--> statement-breakpoint
CREATE INDEX "chapters_project_id_status_idx" ON "chapters" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "character_knowledge_project_id_idx" ON "character_knowledge" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entities_project_id_type_idx" ON "entities" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "entity_images_entity_id_idx" ON "entity_images" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "volumes_project_id_ordinal_idx" ON "volumes" USING btree ("project_id","ordinal");--> statement-breakpoint
CREATE INDEX "world_facts_project_id_category_idx" ON "world_facts" USING btree ("project_id","category");--> statement-breakpoint
CREATE INDEX "chapter_images_project_id_chapter_idx" ON "chapter_images" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "chat_sessions_project_id_status_idx" ON "chat_sessions" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "chat_sessions_project_id_scope_idx" ON "chat_sessions" USING btree ("project_id","scope_type","scope_ref");--> statement-breakpoint
CREATE INDEX "refinement_proposals_project_id_status_idx" ON "refinement_proposals" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "refinement_proposals_session_id_idx" ON "refinement_proposals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "refinement_proposals_project_id_scope_status_idx" ON "refinement_proposals" USING btree ("project_id","scope_type","scope_ref","status");--> statement-breakpoint
CREATE INDEX "decision_ledger_entries_project_id_active_idx" ON "decision_ledger_entries" USING btree ("project_id","created_at") WHERE "decision_ledger_entries"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "decision_ledger_entries_project_id_topic_idx" ON "decision_ledger_entries" USING btree ("project_id","topic","created_at");--> statement-breakpoint
CREATE INDEX "chapter_publications_project_id_status_idx" ON "chapter_publications" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "chapter_publications_project_id_chapter_idx" ON "chapter_publications" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "publication_grants_publication_id_state_idx" ON "publication_grants" USING btree ("publication_id","state");--> statement-breakpoint
CREATE INDEX "wiki_publications_project_id_state_idx" ON "wiki_publications" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "illustrations_project_id_subject_type_subject_key_idx" ON "illustrations" USING btree ("project_id","subject_type","subject_key");--> statement-breakpoint
CREATE INDEX "illustrations_owner_kind_owner_id_idx" ON "illustrations" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "jobs_project_id_kind_status_idx" ON "jobs" USING btree ("project_id","kind","status");--> statement-breakpoint
CREATE INDEX "validation_reports_project_id_scope_chapter_idx" ON "validation_reports" USING btree ("project_id","scope","chapter");--> statement-breakpoint
CREATE INDEX "chapter_chunks_project_id_chapter_idx" ON "chapter_chunks" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "chapter_chunks_embedding_idx" ON "chapter_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "llm_cache_project_id_role_idx" ON "llm_cache" USING btree ("project_id","role");--> statement-breakpoint
CREATE INDEX "lore_chunks_project_id_kind_idx" ON "lore_chunks" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "lore_chunks_embedding_idx" ON "lore_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "model_calls_project_id_created_at_idx" ON "model_calls" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_run_id_idx" ON "model_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "model_calls_prompt_key_prompt_version_idx" ON "model_calls" USING btree ("prompt_key","prompt_version");--> statement-breakpoint
CREATE INDEX "tool_calls_run_id_idx" ON "tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "user_feedback_project_id_artifact_type_artifact_ref_idx" ON "user_feedback" USING btree ("project_id","artifact_type","artifact_ref");--> statement-breakpoint
CREATE INDEX "workflow_runs_project_id_graph_status_idx" ON "workflow_runs" USING btree ("project_id","graph","status");--> statement-breakpoint
CREATE INDEX "workflow_runs_job_id_idx" ON "workflow_runs" USING btree ("job_id");