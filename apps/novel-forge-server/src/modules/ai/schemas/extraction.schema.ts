/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { z } from 'zod';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const ExtractionSchema = z.object({
  entities: z.array(
    z.object({
      entityKey: z.string().min(1).describe('unique snake_case identifier, e.g. iron_covenant or li_wei'),
      type: z.enum(['character', 'faction', 'location', 'power_rule', 'item', 'concept']),
      name: z.string().min(1),
      aliases: z.array(z.string()).default([]),
      attributes: z.record(z.string(), z.string()).optional().describe('key-value attributes, e.g. { strength: "exceptional", affiliation: "Iron Covenant" }'),
      notes: z.string().optional(),
      firstSeenChapter: z.number().int().optional().describe('omit if entity was pre-existing before this chapter'),
    }),
  ),
  relationships: z.array(
    z.object({
      entityKey: z.string().min(1),
      targetKey: z.string().min(1).describe('target entity key — may not yet exist in the knowledge base'),
      kind: z.string().min(1).describe('e.g. ally_of, enemy_of, trained_by, member_of, seeks, fears'),
      note: z.string().optional(),
    }),
  ),
  beats: z.array(
    z.object({
      beatKey: z.string().min(1).describe('unique snake_case key for this beat, e.g. ch12_confrontation'),
      chapter: z.number().int(),
      beatType: z.string().optional().describe('e.g. combat, revelation, bonding, loss, mystery_planted'),
      summary: z.string().min(1).describe('1-2 sentences describing what happened'),
      entities: z.array(z.string()).optional().describe('entityKeys of participants'),
      opensThreads: z.array(z.string()).optional().describe('threadKeys opened by this beat'),
      closesThreads: z.array(z.string()).optional().describe('threadKeys closed or resolved by this beat'),
    }),
  ),
  plotThreads: z.array(
    z.object({
      threadKey: z.string().min(1).describe('unique snake_case identifier'),
      status: z.enum(['open', 'closed']),
      openedChapter: z.number().int().optional(),
      closedChapter: z.number().int().optional(),
      summary: z.string().min(1),
      owner: z.string().optional().describe('entityKey of the character who drives this thread'),
      payoff: z.string().optional().describe('how this thread resolves or is expected to resolve'),
    }),
  ),
  worldFacts: z.array(
    z.object({
      category: z.string().min(1).describe('e.g. geography, magic_system, politics, economy, culture'),
      key: z.string().min(1).describe('snake_case fact identifier within the category'),
      value: z.string().min(1).describe('the fact itself, as a declarative statement'),
    }),
  ),
  mysteries: z.array(
    z.object({
      mysteryKey: z.string().min(1),
      question: z.string().min(1).describe('the open question as the reader experiences it'),
      status: z.enum(['open', 'resolved']),
      openedChapter: z.number().int().optional(),
      resolvedChapter: z.number().int().optional(),
      knownTo: z.string().optional().describe('entityKey of who (in-world) knows the answer'),
    }),
  ),
  chapterSummary: z.string().min(1).describe('2-3 sentences: what happened, what changed, what was left unresolved'),
});

export type ExtractionOutput = z.infer<typeof ExtractionSchema>;
