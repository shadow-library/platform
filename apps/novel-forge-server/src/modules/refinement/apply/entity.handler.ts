import { and, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { schema } from '@server/database';

import { type ContentOp, type EntityRemoveOp, type EntityUpsertOp } from '../change-set';
import { keptOr } from './apply-rules';
import { type ApplyContext, type ContentOpHandlers, type Restorable } from './apply.types';

type EntityRestoreOp = Restorable<EntityUpsertOp, 'status' | 'motivation' | 'notes' | 'body'>;

async function inverseEntity(ctx: ApplyContext, op: EntityUpsertOp | EntityRemoveOp): Promise<ContentOp | null> {
  const entity = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
  if (!entity) return op.op === 'entity.upsert' ? { op: 'entity.remove', entityKey: op.entityKey } : null;
  const inverse: EntityRestoreOp = {
    op: 'entity.upsert',
    entityKey: op.entityKey,
    type: entity.type as EntityUpsertOp['type'],
    name: entity.name,
    status: entity.status,
    motivation: entity.motivation,
    notes: entity.notes,
    body: entity.body,
  };
  return inverse as ContentOp;
}

async function applyEntityUpsert(ctx: ApplyContext, op: EntityRestoreOp): Promise<void> {
  const existing = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
  if (!existing && !op.name) throw AppErrorCode.RFN_004.create();

  const merged = {
    type: op.type,
    name: op.name ?? existing?.name ?? op.entityKey,
    status: keptOr(op.status, existing?.status),
    motivation: keptOr(op.motivation, existing?.motivation),
    notes: keptOr(op.notes, existing?.notes),
    body: keptOr(op.body, existing?.body),
  };

  if (existing) {
    await ctx.tx
      .update(schema.entities)
      .set({ ...merged, updatedAt: new Date() })
      .where(eq(schema.entities.id, existing.id));
  } else {
    await ctx.tx.insert(schema.entities).values({ projectId: ctx.projectId, entityKey: op.entityKey, ...merged, origin: 'generated' });
  }
  ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
}

async function applyEntityRemove(ctx: ApplyContext, op: EntityRemoveOp): Promise<void> {
  const deleted = await ctx.tx
    .delete(schema.entities)
    .where(and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)))
    .returning();
  if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
  ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
}

export const ENTITY_HANDLERS: ContentOpHandlers<'entity.upsert' | 'entity.remove'> = {
  'entity.upsert': { apply: applyEntityUpsert, inverse: inverseEntity },
  'entity.remove': { apply: applyEntityRemove, inverse: inverseEntity },
};
