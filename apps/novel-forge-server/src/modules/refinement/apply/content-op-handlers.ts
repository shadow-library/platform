import { AppErrorCode } from '@server/classes';

import { type ChangeOp, type ContentOp, OP_METADATA_FIELDS } from '../change-set';
import { type ApplyContext, type ArtifactHandler, type ContentOpHandlers } from './apply.types';
import { BIBLE_DOCUMENT_HANDLERS } from './bible-document.handler';
import { BRIEF_HANDLERS } from './brief.handler';
import { DRAFT_HANDLERS } from './draft.handler';
import { ENTITY_HANDLERS } from './entity.handler';
import { FACT_HANDLERS } from './fact.handler';
import { MILESTONE_HANDLERS } from './milestone.handler';
import { PREMISE_HANDLERS } from './premise.handler';
import { PROMISE_HANDLERS } from './promise.handler';
import { VOLUME_HANDLERS } from './volume.handler';

const CONTENT_OP_HANDLERS: ContentOpHandlers = {
  ...PREMISE_HANDLERS,
  ...BIBLE_DOCUMENT_HANDLERS,
  ...VOLUME_HANDLERS,
  ...BRIEF_HANDLERS,
  ...DRAFT_HANDLERS,
  ...ENTITY_HANDLERS,
  ...FACT_HANDLERS,
  ...MILESTONE_HANDLERS,
  ...PROMISE_HANDLERS,
  'organise.rule': { apply: () => Promise.resolve(), inverse: () => Promise.resolve(null) },
};

function handlerFor(op: string): ArtifactHandler | undefined {
  return Object.hasOwn(CONTENT_OP_HANDLERS, op) ? (CONTENT_OP_HANDLERS[op as ContentOp['op']] as ArtifactHandler) : undefined;
}

/** The one gate between an op and the artifact it edits: its rationale and quote explain the change to the author and are never stored beside the content they describe. */
function withoutMetadata<T extends ChangeOp>(op: T): T {
  if (!OP_METADATA_FIELDS.some(field => field in op)) return op;
  const rest = { ...op } as Record<string, unknown>;
  for (const field of OP_METADATA_FIELDS) delete rest[field];
  return rest as T;
}

/** Actions never reach here: they are filtered out before apply and executed post-commit, so an op without a handler is a programming error. */
export function applyContentOp(ctx: ApplyContext, incoming: ChangeOp): Promise<void> {
  const op = withoutMetadata(incoming);
  const handler = handlerFor(op.op);
  if (!handler) throw AppErrorCode.RFN_004.create();
  return handler.apply(ctx, op as ContentOp);
}

export function captureInverse(ctx: ApplyContext, op: ContentOp): Promise<ContentOp | null> {
  return handlerFor(op.op)?.inverse(ctx, op) ?? Promise.resolve(null);
}

export async function captureAndApply(ctx: ApplyContext, op: ContentOp): Promise<ContentOp | null> {
  const inverse = await captureInverse(ctx, op);
  await applyContentOp(ctx, op);
  return inverse;
}
