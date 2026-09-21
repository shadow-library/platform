import { type ChapterBriefInput, renderChapterBrief } from '@server/common';
import { type PrimaryDatabase } from '@server/database';

import { type FactLike, loadFactWriterNotes, loadWriterForbiddenFacts, scrubPlanForWriter } from '../../bible/fact/knowledge-view';
import { renderEndingContract } from '../schemas/ending-contract.schema';

export interface WriterBrief {
  chapterBrief: string;
  endingContract: string;
}

type WriterBriefRow = ChapterBriefInput & { endingContract?: unknown };

/**
 * The brief as the chapter writer reads it. The save-time reveal guard only covers AI-planned briefs and scheduled reveals,
 * so a hand-written, imported or re-scheduled brief is scrubbed here against the chapter's own forbidden facts.
 */
export async function loadWriterBrief(
  db: Pick<PrimaryDatabase, 'query' | 'insert'>,
  projectId: bigint,
  chapter: number,
  brief: WriterBriefRow | null | undefined,
  forbidden?: FactLike[],
): Promise<WriterBrief> {
  const [hidden, factWriterNotes] = await Promise.all([forbidden ?? loadWriterForbiddenFacts(db, projectId, chapter), loadFactWriterNotes(db, projectId, brief?.endingContract)]);
  return {
    chapterBrief: scrubPlanForWriter(renderChapterBrief(brief), hidden),
    endingContract: scrubPlanForWriter(renderEndingContract(brief?.endingContract, factWriterNotes), hidden),
  };
}
