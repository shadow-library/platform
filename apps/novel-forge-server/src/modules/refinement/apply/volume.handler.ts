import { and, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { autoActivateVolume, volumeContentHash } from '@server/common';
import { schema } from '@server/database';

import { type ContentOp, type VolumeRemoveOp, type VolumeUpsertOp } from '../change-set';
import { keptOr } from './apply-rules';
import { type ApplyContext, type ContentOpHandlers, type Restorable } from './apply.types';

type VolumeRestoreOp = Restorable<VolumeUpsertOp, 'title' | 'objective' | 'body'>;

async function inverseVolume(ctx: ApplyContext, op: VolumeUpsertOp | VolumeRemoveOp): Promise<ContentOp | null> {
  const volume = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
  if (!volume) return op.op === 'volume.upsert' ? { op: 'volume.remove', volumeKey: op.volumeKey } : null;
  const inverse: VolumeRestoreOp = { op: 'volume.upsert', volumeKey: op.volumeKey, ordinal: volume.ordinal, title: volume.title, objective: volume.objective, body: volume.body };
  return inverse as ContentOp;
}

async function applyVolumeUpsert(ctx: ApplyContext, op: VolumeRestoreOp): Promise<void> {
  const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });

  const merged = {
    ordinal: op.ordinal ?? existing?.ordinal ?? 0,
    title: keptOr(op.title, existing?.title),
    objective: keptOr(op.objective, existing?.objective),
    body: keptOr(op.body, existing?.body),
    // Never from `op`: state moves only through action.advance_volume, so an upsert keeps an existing volume's state and starts a new one not_started.
    state: existing?.state ?? 'not_started',
  };
  const contentHash = volumeContentHash({ volumeKey: op.volumeKey, ...merged });

  let revision: number;
  if (existing) {
    revision = existing.revision + 1;
    await ctx.tx
      .update(schema.volumes)
      .set({ ...merged, revision, contentHash, updatedAt: new Date() })
      .where(eq(schema.volumes.id, existing.id));
  } else {
    revision = 1;
    await ctx.tx.insert(schema.volumes).values({ projectId: ctx.projectId, volumeKey: op.volumeKey, ...merged, revision, contentHash });
    await autoActivateVolume(ctx.tx, ctx.projectId);
  }
  ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: revision });
}

async function applyVolumeRemove(ctx: ApplyContext, op: VolumeRemoveOp): Promise<void> {
  const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
  if (!existing) throw AppErrorCode.VOL_001.create();
  const planned = await ctx.tx.query.briefs.findFirst({
    where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.volumeKey, op.volumeKey)),
    columns: { chapter: true },
  });
  if (planned) throw AppErrorCode.VOL_002.create({ chapter: String(planned.chapter) });

  await ctx.tx.delete(schema.volumes).where(eq(schema.volumes.id, existing.id));
  ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: null });
}

export const VOLUME_HANDLERS: ContentOpHandlers<'volume.upsert' | 'volume.remove'> = {
  'volume.upsert': { apply: applyVolumeUpsert, inverse: inverseVolume },
  'volume.remove': { apply: applyVolumeRemove, inverse: inverseVolume },
};
