import { type BibleStage, chapterForStage } from '@modules/bible/bible-manifest';

import { type BibleStageOutput } from '../../schemas/new-novel.schema';

export function renderStageContract(stage: BibleStage): string {
  const chapter = chapterForStage(stage);
  const topics = `Cover every one of these topics explicitly, because the bible audit checks for each by name: ${chapter.requiredTopics.join('; ')}.`;
  if (chapter.materializes.length === 0) return topics;

  const types = chapter.materializes.join(' / ');
  return (
    `${topics}\n\nMANDATORY — emit \`entities\`. This section's canon must exist as structured records, not only as prose inside \`body\`. ` +
    `Stage at least ${chapter.minEntities} entities of type ${types}, each with a snake_case \`entityKey\`, a \`name\`, its \`type\`, a \`significance\`, and a \`body\` card concrete enough to write a chapter from. ` +
    `A body that only narrates the ${types} is not a substitute for the records — the reply is rejected and retried when the records are missing.`
  );
}

export function validateStageCoverage(stage: BibleStage, data: BibleStageOutput): string[] {
  const chapter = chapterForStage(stage);
  if (chapter.materializes.length === 0) return [];

  const declared = new Set<string>(chapter.materializes);
  const matching = (data.entities ?? []).filter(entity => declared.has(entity.type));
  if (matching.length >= chapter.minEntities) return [];

  return [
    `entities: ${chapter.section}/${chapter.slug} must materialize at least ${chapter.minEntities} entities of type ${chapter.materializes.join(', ')} — received ${matching.length}. ` +
      `Re-emit the reply with the records filled in; prose in "body" alone does not satisfy this section.`,
  ];
}
