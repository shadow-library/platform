import { type Author, type FinalizeOutcome } from './author.ts';
import { type SuiteContext } from './cli.ts';
import { errorMessage, EvalError, ForgeApiError } from './errors.ts';
import { type BaselineChapter, briefFor, type Story, type StoryChapter, type StorySecret } from './fixtures.ts';
import { type ContentMode, type Draft } from './forge.types.ts';
import { patternHits } from './text.ts';

export interface ChapterRecord {
  chapter: number;
  mode: ContentMode;
  planned: 'chat' | 'brief';
  draft: Draft | null;
  finalize: FinalizeOutcome | null;
  error?: string;
}

export interface SeedOptions {
  /** Secrets whose milestone falls at or before this chapter are stored as open facts: the story has already revealed them. */
  revealedThrough?: number;
}

export function milestoneChapter(story: Story, secret: StorySecret): number {
  return story.milestones.find(milestone => milestone.milestoneKey === secret.unlockMilestone)?.chapter ?? Number.POSITIVE_INFINITY;
}

/** A plan or baseline chapter that itself matches a secret still locked at that chapter would make every leak check meaningless. */
export function assertFixtureClean(story: Story, baseline: readonly BaselineChapter[] = []): void {
  const texts = [
    ...story.chapters.map(chapter => ({ where: `plan ${chapter.n}`, n: chapter.n, text: chapter.plan })),
    ...baseline.map(chapter => ({ where: `baseline ${chapter.n}`, n: chapter.n, text: chapter.content })),
  ];
  const leaks = texts.flatMap(({ where, n, text }) =>
    story.secrets.filter(secret => milestoneChapter(story, secret) > n && patternHits(text, secret.revealPatterns).length > 0).map(secret => `${where} matches ${secret.factKey}`),
  );
  if (leaks.length > 0) throw new EvalError(`Story fixture reveals secrets early: ${leaks.join('; ')}`);
}

/** Creates the invented story's project with its cast, milestones and milestone-gated secrets, exactly as an author would type them in. */
export async function seedStoryProject(context: SuiteContext, story: Story, label: string, options: SeedOptions = {}): Promise<{ projectId: string; sessionId: string }> {
  const { projectId, sessionId } = await context.api.createNovel(`[eval ${label}] ${story.title}`, story.notes);
  if (context.tier) await context.api.updateProject(projectId, { costTier: context.tier });
  await seedStoryBible(context, projectId, story, options);
  return { projectId, sessionId };
}

/** An entity the project already holds (an import may have made it) is left as it is. */
export async function seedStoryBible(context: SuiteContext, projectId: string, story: Story, options: SeedOptions = {}): Promise<void> {
  for (const entity of story.entities) {
    try {
      await context.api.createEntity(projectId, entity);
    } catch (error) {
      if (!(error instanceof ForgeApiError && error.status === 409)) throw error;
    }
  }
  for (const { chapter: _chapter, ...milestone } of story.milestones) await context.api.createMilestone(projectId, milestone);
  for (const secret of story.secrets) {
    const revealed = milestoneChapter(story, secret) <= (options.revealedThrough ?? 0);
    await context.api.putFact(projectId, secret.factKey, {
      text: secret.text,
      subjects: secret.subjects,
      ...(revealed ? {} : { terms: secret.terms, writerNote: secret.writerNote, allowedClues: secret.allowedClues, unlock: { all: [{ milestone: secret.unlockMilestone }] } }),
    });
  }
}

/** Plans (by hand or through the chat), writes, approves and finalizes one chapter; a failure is recorded on the chapter, never thrown. */
export async function writeStoryChapter(
  author: Author,
  projectId: string,
  chapter: StoryChapter,
  options: { mode?: ContentMode; sessionId?: string; planViaChat?: boolean } = {},
): Promise<ChapterRecord> {
  const mode = options.mode ?? 'standard';
  let planned: ChapterRecord['planned'] = 'brief';
  try {
    if (options.planViaChat && options.sessionId && (await author.planChapter(projectId, options.sessionId, chapter.n, chapter.plan))) planned = 'chat';
    await author.api.putBrief(projectId, chapter.n, planned === 'chat' ? { ...briefFor(chapter, mode), body: chapter.plan } : briefFor(chapter, mode));
    const draft = await author.writeChapter(projectId, chapter.n);
    const finalize = await author.approveAndFinalize(projectId, draft);
    const final = (await author.api.getDraft(projectId, chapter.n)) ?? draft;
    await author.recordChapterCost(projectId, chapter.n, mode);
    return { chapter: chapter.n, mode, planned, draft: final, finalize };
  } catch (error) {
    return { chapter: chapter.n, mode, planned, draft: await author.api.getDraft(projectId, chapter.n).catch(() => null), finalize: null, error: errorMessage(error) };
  }
}
