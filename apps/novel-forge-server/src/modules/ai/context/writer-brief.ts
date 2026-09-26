import { type ChapterBriefInput, renderChapterBrief } from '@server/common';
import { type PrimaryDatabase } from '@server/database';

import { loadFactWriterNotes } from '../../bible/fact/knowledge-view';
import { loadWriterDisclosurePolicy, type WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';
import { renderEndingContract } from '../schemas/ending-contract.schema';

export interface WriterBrief {
  chapterBrief: string;
  endingContract: string;
}

type WriterBriefRow = ChapterBriefInput & { endingContract?: unknown };

/**
 * The brief as the chapter writer reads it. The save-time reveal guard only covers the plan's own reveals, so a hand-written, imported or
 * re-scheduled brief is scrubbed here by the chapter's disclosure policy.
 */
export async function loadWriterBrief(
  db: Pick<PrimaryDatabase, 'query' | 'insert'>,
  projectId: bigint,
  chapter: number,
  brief: WriterBriefRow | null | undefined,
  disclosure?: WriterDisclosurePolicy,
): Promise<WriterBrief> {
  const [policy, factWriterNotes] = await Promise.all([
    disclosure ?? loadWriterDisclosurePolicy(db, projectId, chapter),
    loadFactWriterNotes(db, projectId, brief?.endingContract),
  ]);
  return {
    chapterBrief: policy.scrub(renderChapterBrief(brief), 'plan'),
    endingContract: policy.scrub(renderEndingContract(brief?.endingContract, factWriterNotes), 'plan'),
  };
}
