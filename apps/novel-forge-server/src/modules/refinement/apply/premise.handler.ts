import { eq } from 'drizzle-orm';

import { schema } from '@server/database';

import { writingInstructionAdditions } from '../../ai/prompts/writing-instructions';
import { type ContentOp, type PremiseUpdateOp } from '../change-set';
import { type ApplyContext, type ContentOpHandlers, type Restorable } from './apply.types';

const STORY_TEXT_FIELDS = ['theme', 'readerPromise', 'protagonistKey', 'opposition', 'endingQuestion', 'ending'] as const;

type PremiseRestoreOp = Restorable<PremiseUpdateOp, 'premise' | 'brief' | 'themes' | 'instructions' | (typeof STORY_TEXT_FIELDS)[number]>;

async function inversePremiseUpdate(ctx: ApplyContext, op: PremiseUpdateOp): Promise<ContentOp | null> {
  const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
  if (!project) return null;
  const inverse: PremiseRestoreOp = { op: 'premise.update' };
  if (op.premise !== undefined) inverse.premise = project.premise;
  if (op.brief !== undefined) inverse.brief = project.brief;
  if (op.themes !== undefined) inverse.themes = project.themes as string[] | null;
  if (op.instructions !== undefined) inverse.instructions = project.instructions;
  for (const field of STORY_TEXT_FIELDS) if (op[field] !== undefined) inverse[field] = project[field];
  return inverse as ContentOp;
}

async function applyPremiseUpdate(ctx: ApplyContext, op: PremiseRestoreOp): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (op.premise !== undefined) update['premise'] = op.premise;
  if (op.brief !== undefined) update['brief'] = op.brief;
  if (op.themes !== undefined) update['themes'] = op.themes;
  if (op.instructions !== undefined) update['instructions'] = writingInstructionAdditions(op.instructions);
  for (const field of STORY_TEXT_FIELDS) if (op[field] !== undefined) update[field] = op[field]?.trim() || null;

  await ctx.tx.update(schema.projects).set(update).where(eq(schema.projects.id, ctx.projectId));
  ctx.applied.push({ artifactRef: 'premise', newRevision: null });
}

export const PREMISE_HANDLERS: ContentOpHandlers<'premise.update'> = {
  'premise.update': { apply: applyPremiseUpdate, inverse: inversePremiseUpdate },
};
