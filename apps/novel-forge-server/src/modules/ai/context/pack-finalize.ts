import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';
import { type ForgeCallPolicy } from '../../plugins/plugin-policy.service';
import { hardLineError, screenTexts, sectionScreens } from '../hard-line';
import { pluginContextSections } from './plugin-sections';
import { type AssembledPack, type ContextPurpose, type ContextSection, joinSections, type OmittedSection, splitSegments } from './sections';
import { applyBudget } from './token-budget';

export interface FinalizePackOptions {
  dryRun?: boolean;
  policy?: ForgeCallPolicy;
  disclosure?: WriterDisclosurePolicy;
  withheldRefs?: string[];
  omitted?: OmittedSection[];
}

export async function finalizePack(
  db: PrimaryDatabase,
  projectId: bigint,
  purpose: ContextPurpose,
  chapter: number | null,
  sections: ContextSection[],
  unresolvedRefs: string[],
  budgetTokens: number,
  opts?: FinalizePackOptions,
): Promise<AssembledPack & { id: bigint | null }> {
  const contributed = [...sections, ...pluginContextSections(opts?.policy, sections, opts?.disclosure)];
  const budgeted = applyBudget(contributed, budgetTokens);
  const fittingSections = budgeted.fitting;
  if (opts?.policy?.writerClass === 'permissive') {
    const hit = screenTexts(sectionScreens(fittingSections));
    if (hit) throw hardLineError(hit);
  }
  const omitted = [...(opts?.omitted ?? []), ...budgeted.omitted];
  // Stable sections render first so the prefix stays byte-identical across calls with unchanged
  // canon (the provider prompt-cache contract); callers list stable sections first, so for the
  // legacy all-volatile purposes this is a no-op.
  const stableSections = fittingSections.filter(s => s.segment === 'stable');
  const volatileSections = fittingSections.filter(s => s.segment !== 'stable');
  const { renderedStable, renderedVolatile } = splitSegments(fittingSections);
  const rendered = joinSections([...stableSections, ...volatileSections]);
  const usedTokens = fittingSections.reduce((sum, s) => sum + s.tokens, 0);
  const hash = createHash('sha256').update(rendered).digest('hex');

  let id: bigint | null = null;
  if (!opts?.dryRun) {
    const [inserted] = await db
      .insert(schema.contextPacks)
      .values({ projectId, purpose, chapter, hash, budgetTokens, usedTokens, sections: fittingSections as never, unresolvedRefs, omitted: omitted as never, rendered })
      .onConflictDoNothing()
      .returning({ id: schema.contextPacks.id });

    if (inserted) {
      id = inserted.id;
    } else {
      // Conflict: pack with this hash already exists — fetch existing id.
      const existing = await db.query.contextPacks.findFirst({ where: and(eq(schema.contextPacks.projectId, projectId), eq(schema.contextPacks.hash, hash)) });
      id = existing?.id ?? null;
    }
  }

  const withheldRefs = opts?.withheldRefs ?? [];
  return {
    projectId,
    purpose,
    chapter,
    budgetTokens,
    usedTokens,
    sections: fittingSections,
    unresolvedRefs,
    withheldRefs,
    omitted,
    renderedStable,
    renderedVolatile,
    rendered,
    id,
  };
}
