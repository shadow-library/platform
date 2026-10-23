import { and, desc, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { nextWritableChapter } from '@server/common';
import { schema, type Story } from '@server/database';

import { type ContentOp, type PromiseCreateOp, type PromiseDropOp, type PromiseKind, type PromiseSetPayoffOp, type PromiseUpdateOp } from '../change-set';
import { type ApplyContext, type ContentOpHandlers } from './apply.types';

// The union of both promise tables' `status` columns — 'closed' is a thread's paid-off value, 'resolved' a mystery's.
type PromiseDbStatus = 'open' | 'closed' | 'resolved' | 'dropped';

// promise.update cannot null a progress chapter, paid-off chapter or label, nor set "dropped"; only a captured inverse needs those, so each rides on its own field.
type PromiseUpdateRestoreOp = PromiseUpdateOp & {
  restoreLabel?: string | null;
  restoreLastAdvancedChapter?: number | null;
  restoreStatus?: PromiseDbStatus;
  restoreChapterColumn?: number | null;
};
// A drop never deletes the row — but the inverse of a promise.create must, since the promise never existed before it.
type PromiseDropRestoreOp = PromiseDropOp & { hardDelete?: true };

interface PromiseRow {
  label: string | null;
  status: PromiseDbStatus;
  /** `closedChapter` for a thread, `resolvedChapter` for a mystery — the chapter it paid off in, if it has. */
  chapterColumn: number | null;
  lastAdvancedChapter: number | null;
  payoffMilestoneKey: string | null;
  payoffVolumeKey: string | null;
  payoffWindow: number | null;
  intentionallyOpen: boolean;
}

async function findPromiseRow(ctx: ApplyContext, kind: PromiseKind, key: string): Promise<PromiseRow | null> {
  if (kind === 'thread') {
    const where = and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, key));
    await ctx.tx.select({ id: schema.plotThreads.id }).from(schema.plotThreads).where(where).for('update');
    const row = await ctx.tx.query.plotThreads.findFirst({ where });
    return row
      ? {
          label: row.summary,
          status: row.status,
          chapterColumn: row.closedChapter,
          lastAdvancedChapter: row.lastAdvancedChapter,
          payoffMilestoneKey: row.payoffMilestoneKey,
          payoffVolumeKey: row.payoffVolumeKey,
          payoffWindow: row.payoffWindow,
          intentionallyOpen: row.intentionallyOpen,
        }
      : null;
  }
  const where = and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, key));
  await ctx.tx.select({ id: schema.mysteries.id }).from(schema.mysteries).where(where).for('update');
  const row = await ctx.tx.query.mysteries.findFirst({ where });
  return row
    ? {
        label: row.question,
        status: row.status,
        chapterColumn: row.resolvedChapter,
        lastAdvancedChapter: row.lastAdvancedChapter,
        payoffMilestoneKey: row.payoffMilestoneKey,
        payoffVolumeKey: row.payoffVolumeKey,
        payoffWindow: row.payoffWindow,
        intentionallyOpen: row.intentionallyOpen,
      }
    : null;
}

/** The highest chapter number that exists at all, drafted or finalized — the bound a promise's `lastAdvancedChapter` may not pass. */
async function latestChapterNumber(ctx: ApplyContext): Promise<number> {
  const chapter = await ctx.tx.query.chapters.findFirst({
    where: eq(schema.chapters.projectId, ctx.projectId),
    orderBy: desc(schema.chapters.number),
    columns: { number: true },
  });
  const draft = await ctx.tx.query.drafts.findFirst({ where: eq(schema.drafts.projectId, ctx.projectId), orderBy: desc(schema.drafts.chapter), columns: { chapter: true } });
  return Math.max(chapter?.number ?? 0, draft?.chapter ?? 0);
}

async function inversePromise(ctx: ApplyContext, op: PromiseCreateOp | PromiseUpdateOp | PromiseSetPayoffOp | PromiseDropOp): Promise<ContentOp | null> {
  const row = await findPromiseRow(ctx, op.kind, op.key);
  if (!row) {
    if (op.op !== 'promise.create') return null;
    const inverse: PromiseDropRestoreOp = { op: 'promise.drop', kind: op.kind, key: op.key, hardDelete: true };
    return inverse;
  }
  if (op.op === 'promise.set_payoff') {
    const inverse: PromiseSetPayoffOp = {
      op: 'promise.set_payoff',
      kind: op.kind,
      key: op.key,
      payoffMilestoneKey: row.payoffMilestoneKey,
      payoffVolumeKey: row.payoffVolumeKey,
      payoffWindow: row.payoffWindow,
      dormant: row.intentionallyOpen,
    };
    return inverse;
  }
  const inverse: PromiseUpdateRestoreOp = {
    op: 'promise.update',
    kind: op.kind,
    key: op.key,
    restoreLabel: row.label,
    restoreLastAdvancedChapter: row.lastAdvancedChapter,
    restoreStatus: row.status,
    restoreChapterColumn: row.chapterColumn,
  };
  return inverse;
}

async function applyPromiseCreate(ctx: ApplyContext, op: PromiseCreateOp): Promise<void> {
  const existing = await findPromiseRow(ctx, op.kind, op.key);
  if (existing) throw AppErrorCode.PMS_002.create({ kind: op.kind });
  const openedChapter = op.openedChapter ?? (await nextWritableChapter(ctx.tx, ctx.projectId));
  if (op.kind === 'thread') {
    await ctx.tx.insert(schema.plotThreads).values({ projectId: ctx.projectId, threadKey: op.key, status: 'open', summary: op.label, openedChapter });
  } else {
    await ctx.tx.insert(schema.mysteries).values({ projectId: ctx.projectId, mysteryKey: op.key, status: 'open', question: op.label, openedChapter });
  }
  ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
}

async function applyPromiseUpdate(ctx: ApplyContext, op: PromiseUpdateRestoreOp): Promise<void> {
  const existing = await findPromiseRow(ctx, op.kind, op.key);
  if (!existing) throw AppErrorCode.PMS_001.create();

  if (op.lastAdvancedChapter !== undefined) {
    const latest = await latestChapterNumber(ctx);
    if (op.lastAdvancedChapter > latest) throw AppErrorCode.PMS_003.create({ lastAdvancedChapter: String(op.lastAdvancedChapter), latest: String(latest) });
  }

  const label = op.restoreLabel !== undefined ? op.restoreLabel : op.label !== undefined ? op.label.trim() || existing.label || op.key : existing.label;
  const lastAdvancedChapter = op.restoreLastAdvancedChapter !== undefined ? op.restoreLastAdvancedChapter : (op.lastAdvancedChapter ?? existing.lastAdvancedChapter);
  const dbStatus: PromiseDbStatus =
    op.restoreStatus ?? (op.status === undefined ? existing.status : op.status === 'paid_off' ? (op.kind === 'thread' ? 'closed' : 'resolved') : op.status);
  // Paying off a promise stamps it with the chapter it happens in; reopening it clears that chapter; leaving status alone keeps it.
  const chapterColumn =
    op.restoreChapterColumn !== undefined
      ? op.restoreChapterColumn
      : op.status === undefined
        ? existing.chapterColumn
        : op.status === 'paid_off'
          ? await latestChapterNumber(ctx)
          : null;

  if (op.kind === 'thread') {
    await ctx.tx
      .update(schema.plotThreads)
      .set({ summary: label, lastAdvancedChapter, status: dbStatus as Story.ThreadStatus, closedChapter: chapterColumn, updatedAt: new Date() })
      .where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
  } else {
    await ctx.tx
      .update(schema.mysteries)
      .set({
        question: (label ?? existing.label ?? op.key) as string,
        lastAdvancedChapter,
        status: dbStatus as Story.MysteryStatus,
        resolvedChapter: chapterColumn,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
  }
  ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
}

async function applyPromiseSetPayoff(ctx: ApplyContext, op: PromiseSetPayoffOp): Promise<void> {
  const existing = await findPromiseRow(ctx, op.kind, op.key);
  if (!existing) throw AppErrorCode.PMS_001.create();
  const merged = op.someday
    ? { payoffMilestoneKey: null, payoffVolumeKey: null, payoffWindow: null, intentionallyOpen: op.dormant ?? existing.intentionallyOpen }
    : {
        payoffMilestoneKey: op.payoffMilestoneKey !== undefined ? op.payoffMilestoneKey : existing.payoffMilestoneKey,
        payoffVolumeKey: op.payoffVolumeKey !== undefined ? op.payoffVolumeKey : existing.payoffVolumeKey,
        payoffWindow: op.payoffWindow !== undefined ? op.payoffWindow : existing.payoffWindow,
        intentionallyOpen: op.dormant ?? existing.intentionallyOpen,
      };
  if (op.kind === 'thread') {
    await ctx.tx
      .update(schema.plotThreads)
      .set({ ...merged, updatedAt: new Date() })
      .where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
  } else {
    await ctx.tx
      .update(schema.mysteries)
      .set({ ...merged, updatedAt: new Date() })
      .where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
  }
  ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
}

async function applyPromiseDrop(ctx: ApplyContext, op: PromiseDropRestoreOp): Promise<void> {
  const existing = await findPromiseRow(ctx, op.kind, op.key);
  if (!existing) throw AppErrorCode.PMS_001.create();
  if (op.hardDelete) {
    if (op.kind === 'thread') await ctx.tx.delete(schema.plotThreads).where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
    else await ctx.tx.delete(schema.mysteries).where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
    ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
    return;
  }
  if (op.kind === 'thread') {
    await ctx.tx
      .update(schema.plotThreads)
      .set({ status: 'dropped', updatedAt: new Date() })
      .where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
  } else {
    await ctx.tx
      .update(schema.mysteries)
      .set({ status: 'dropped', updatedAt: new Date() })
      .where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
  }
  ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
}

export const PROMISE_HANDLERS: ContentOpHandlers<'promise.create' | 'promise.update' | 'promise.set_payoff' | 'promise.drop'> = {
  'promise.create': { apply: applyPromiseCreate, inverse: inversePromise },
  'promise.update': { apply: applyPromiseUpdate, inverse: inversePromise },
  'promise.set_payoff': { apply: applyPromiseSetPayoff, inverse: inversePromise },
  'promise.drop': { apply: applyPromiseDrop, inverse: inversePromise },
};
