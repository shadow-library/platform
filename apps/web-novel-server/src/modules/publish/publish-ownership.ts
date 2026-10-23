import { eq } from 'drizzle-orm';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

export interface PublishCaller {
  callerSub?: string;
  callerClientId: string;
}

/** `InternalServiceGuard` admits only service principals, so a missing client id is a broken invariant; a placeholder fallback would become a row's owner. */
export function publishCaller(context: ContextService): PublishCaller {
  const principal = context.getAuthPrincipalOrNull();
  if (!principal?.clientId) throw AppError.internal('internal publish call carries no client id');
  return { callerSub: principal.sub, callerClientId: principal.clientId };
}

export function assertNovelOwnership(novel: Novel, caller: PublishCaller): void {
  if (!isOwnedBy(novel, caller)) throw AppErrorCode.WBN_010.create();
}

/** Foreign ownership reads as "does not exist", or 409-vs-404 becomes an oracle over other publishers' slugs. */
function assertNovelReadable(novel: Novel, caller: PublishCaller): void {
  if (!isOwnedBy(novel, caller)) throw AppErrorCode.WBN_001.create();
}

export async function loadOwnedNovel(db: PrimaryDatabase, slug: string, caller: PublishCaller): Promise<Novel> {
  const novel = await loadNovel(db, slug);
  assertNovelOwnership(novel, caller);
  return novel;
}

export async function loadReadableNovel(db: PrimaryDatabase, slug: string, caller: PublishCaller): Promise<Novel> {
  const novel = await loadNovel(db, slug);
  assertNovelReadable(novel, caller);
  return novel;
}

async function loadNovel(db: PrimaryDatabase, slug: string): Promise<Novel> {
  const [novel] = await db.select().from(schema.novels).where(eq(schema.novels.slug, slug));
  return novel ?? AppErrorCode.WBN_001.throw();
}

function isOwnedBy(novel: Novel, caller: PublishCaller): boolean {
  return novel.sourceClientId === caller.callerClientId;
}
