UPDATE "bible_documents" AS d SET "section" = 'project', "slug" = 'premise'
 WHERE d."section" = 'project' AND d."slug" = 'foundation'
   AND NOT EXISTS (SELECT 1 FROM "bible_documents" t WHERE t."project_id" = d."project_id" AND t."section" = 'project' AND t."slug" = 'premise');--> statement-breakpoint
UPDATE "bible_documents" AS d SET "section" = 'world', "slug" = 'setting-overview'
 WHERE d."section" = 'world' AND d."slug" = 'world-power'
   AND NOT EXISTS (SELECT 1 FROM "bible_documents" t WHERE t."project_id" = d."project_id" AND t."section" = 'world' AND t."slug" = 'setting-overview');--> statement-breakpoint
UPDATE "bible_documents" AS d SET "section" = 'world', "slug" = 'factions-and-locations'
 WHERE d."section" = 'world' AND d."slug" = 'factions-locations'
   AND NOT EXISTS (SELECT 1 FROM "bible_documents" t WHERE t."project_id" = d."project_id" AND t."section" = 'world' AND t."slug" = 'factions-and-locations');--> statement-breakpoint
UPDATE "bible_documents" AS d SET "section" = 'project', "slug" = 'cast'
 WHERE d."section" = 'ai' AND d."slug" = 'characters'
   AND NOT EXISTS (SELECT 1 FROM "bible_documents" t WHERE t."project_id" = d."project_id" AND t."section" = 'project' AND t."slug" = 'cast');--> statement-breakpoint
UPDATE "bible_documents" AS d SET "section" = 'plot', "slug" = 'escalation-map'
 WHERE d."section" = 'plot' AND d."slug" = 'plot'
   AND NOT EXISTS (SELECT 1 FROM "bible_documents" t WHERE t."project_id" = d."project_id" AND t."section" = 'plot' AND t."slug" = 'escalation-map');--> statement-breakpoint
UPDATE "bible_documents" AS d SET "section" = 'story_state', "slug" = 'volume-plan'
 WHERE d."section" = 'story_state' AND d."slug" = 'volumes'
   AND NOT EXISTS (SELECT 1 FROM "bible_documents" t WHERE t."project_id" = d."project_id" AND t."section" = 'story_state' AND t."slug" = 'volume-plan');
