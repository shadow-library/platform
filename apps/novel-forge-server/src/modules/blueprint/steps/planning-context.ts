import { and, eq, inArray } from 'drizzle-orm';

import { type Bible, type DbExecutor, schema } from '@server/database';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { renderBibleDigest } from '../../ai/context/bible-docs';
import { type StepInputContext } from '../engine/blueprint-step.types';

/** The pages a planning pass reads: the premise and cast it must stay true to, and the world, power and plot it plans inside. */
export const PLANNING_PAGE_SECTIONS: readonly Bible.Section[] = ['project', 'plot', 'world', 'power'];
export const PLANNING_PAGES_BUDGET = 8_000;
export const PLANNING_PAGE_TOKENS = 2_500;
export const PLANNING_CATALOG_BUDGET = 6_000;

/**
 * The Story Bible as the arc planner reads it. A Blueprint pass plans the same material the Workspace planners do, so it is given the
 * same two sections rather than a prose summary of them: the pages carry what was decided, the catalog carries what may be cited.
 */
async function planningPagesSection(db: Pick<DbExecutor, 'query'>, projectId: bigint): Promise<BlueprintInputSection | null> {
  const documents = await db.query.bibleDocuments.findMany({
    columns: { section: true, slug: true, frontmatter: true, body: true },
    where: and(eq(schema.bibleDocuments.projectId, projectId), inArray(schema.bibleDocuments.section, [...PLANNING_PAGE_SECTIONS])),
  });
  const digest = renderBibleDigest(documents, { totalTokens: PLANNING_PAGES_BUDGET, perDocTokens: PLANNING_PAGE_TOKENS, coreOnly: false });
  return digest.text ? { key: 'bible_pages', content: digest.text } : null;
}

async function planningCatalogSection(context: Pick<StepInputContext, 'catalog'>): Promise<BlueprintInputSection | null> {
  const catalog = await context.catalog({ descriptors: 'compact', documents: true, maxTokens: PLANNING_CATALOG_BUDGET });
  return catalog ? { key: 'catalog', content: catalog } : null;
}

export async function planningSections(context: Pick<StepInputContext, 'catalog' | 'db' | 'projectId'>): Promise<BlueprintInputSection[]> {
  const [pages, catalog] = await Promise.all([planningPagesSection(context.db, context.projectId), planningCatalogSection(context)]);
  return [pages, catalog].filter((section): section is BlueprintInputSection => section !== null);
}
