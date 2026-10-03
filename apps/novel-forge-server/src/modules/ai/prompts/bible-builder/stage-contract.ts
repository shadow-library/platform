import { type BibleStage, chapterForStage } from '@modules/bible/bible-manifest';

const GROUNDING =
  'Build only from the project brief and the sections written before this one. The author gives the world as it stands when the story opens; ' +
  'never add a character, faction, place, rule or event to fill out the section, and never decide the future the author has not given. ' +
  'A short section true to the material beats a long one padded past it.';

export function renderStageContract(stage: BibleStage): string {
  const chapter = chapterForStage(stage);
  const topics = `${GROUNDING}\n\nCover these where the material supports them: ${chapter.topics.join('; ')}. Leave a topic out rather than invent it.`;
  if (chapter.materializes.length === 0) return topics;

  const types = chapter.materializes.join(' / ');
  return (
    `${topics}\n\nEmit \`entities\` for every ${types} the material establishes — this section's canon must exist as structured records, not only as prose inside \`body\`. ` +
    `Give each a snake_case \`entityKey\`, a \`name\`, its \`type\`, a \`significance\`, and a \`body\` card concrete enough to write a chapter from. ` +
    `There is no minimum: emit as many as the material establishes, and none when it establishes none.`
  );
}
