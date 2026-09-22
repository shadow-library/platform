import { and, asc, eq, inArray } from 'drizzle-orm';
import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { renderChapterBrief } from '@server/common';
import { type DbExecutor, type Ledger, schema } from '@server/database';

import { renderBibleDigest } from '../../ai/context/bible-docs';
import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintVoicePrompt } from '../../ai/prompts/blueprint-voice.prompt';
import { type BlueprintVoiceOutput, VOICE_LABEL_MAX, VOICE_LINE_MAX, VOICE_NOTES_MAX, VOICE_SAMPLE_MAX, VOICE_SAMPLES_MAX } from '../../ai/schemas/blueprint-voice.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type ScreenStep, type StepInputContext, type StepOption } from '../engine/blueprint-step.types';
import { promiseDrivers, promiseTone } from '../stage/promise-tailoring';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { renderLockedCrucible } from './locked-cast';

export const VOICE_STEP_KEY = 'voice';
export const VOICE_TOPIC = 'voice';
export const VOICE_BUDGET_TOKENS = 12_000;
/** The slug carries both words import coverage looks for, so an imported plan's tone page is recognised as this one. */
export const VOICE_PAGE: PageRef = { section: 'project', slug: 'pacing-and-tone' };

interface Instrument {
  driver: string | null;
  description: string;
}

/** Ordered: the first whose driver this novel promised wins, and the last is the fallback for a novel that promised neither. */
const INSTRUMENTS: readonly Instrument[] = [
  { driver: 'mystery', description: 'Close third that withholds — the narrator sees everything and says less than they know, so the reader leans in rather than being told.' },
  { driver: 'progression', description: 'Close third pushed into the body — effort, cost and the price of power felt on the page rather than described.' },
  { driver: 'slice_of_life', description: 'Unhurried third in the present tense, which lets an ordinary hour be the whole scene and finds the change inside it.' },
  { driver: 'romance', description: 'Close third that reads the other person — attention, distance and what goes unsaid between them carry the scene.' },
  { driver: null, description: 'Lyrical third at a step back, which lets the place breathe and the prose carry what the plot has not said yet.' },
];

const VOICE_PAGES_BUDGET = 4_000;
const VOICE_PAGE_TOKENS = 1_500;

@Schema()
export class VoiceSampleOption {
  @Field({ pattern: '^vs[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOICE_LABEL_MAX })
  label: string;

  @Field({ minLength: 1, maxLength: VOICE_LINE_MAX })
  tradeoff: string;

  @Field({ minLength: 1, maxLength: VOICE_SAMPLE_MAX })
  opening: string;
}

@Schema()
export class VoiceOptions {
  @Field(() => [VoiceSampleOption], { maxItems: VOICE_SAMPLES_MAX })
  samples: VoiceSampleOption[];
}

@Schema()
export class VoiceSelection {
  @Field({ optional: true, pattern: '^vs[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOICE_LABEL_MAX, description: 'The voice in a few words, as the novel will be described to whoever writes it.' })
  label: string;

  @Field({ minLength: 1, maxLength: VOICE_NOTES_MAX, description: 'What this voice means for whoever writes the chapters — it rides every chapter pack.' })
  notes: string;

  @Field({ minLength: 1, maxLength: VOICE_SAMPLE_MAX, description: 'A paragraph in that voice, as the author left it. It is an example of the voice, never chapter one.' })
  paragraph: string;

  @Field({ optional: true, maxLength: VOICE_LINE_MAX })
  why?: string;
}

interface OpeningChapter {
  chapter: number;
  title: string;
  brief: string;
  refs: string[];
}

/** The first chapter arc one briefs: the samples open the real chapter one, which is what makes them worth listening to. */
async function openingChapter(db: Pick<DbExecutor, 'query'>, projectId: bigint): Promise<OpeningChapter | null> {
  const brief = await db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
  if (!brief) return null;
  return {
    chapter: brief.chapter,
    title: brief.title ?? '',
    brief: renderChapterBrief(brief),
    refs: (Array.isArray(brief.contextRefs) ? (brief.contextRefs as string[]) : []).filter(ref => ref.startsWith('bible_doc:')),
  };
}

async function citedPagesSection(db: Pick<DbExecutor, 'query'>, projectId: bigint, refs: string[]): Promise<BlueprintInputSection | null> {
  const slugs = refs.map(ref => ref.slice('bible_doc:'.length).split('/')[1] ?? '').filter(Boolean);
  if (slugs.length === 0) return null;
  const documents = await db.query.bibleDocuments.findMany({
    columns: { section: true, slug: true, frontmatter: true, body: true },
    where: and(eq(schema.bibleDocuments.projectId, projectId), inArray(schema.bibleDocuments.slug, slugs)),
  });
  const digest = renderBibleDigest(documents, { totalTokens: VOICE_PAGES_BUDGET, perDocTokens: VOICE_PAGE_TOKENS, coreOnly: false });
  return digest.text ? { key: 'voice_pages', content: digest.text } : null;
}

/**
 * The three instruments, chosen by what the novel promised rather than fixed for every book: a mystery is worth hearing withheld, a
 * progression worth hearing from inside the cost, a slice of life worth hearing unhurried. Two always face each other — the closest
 * the reader can get to the POV, and the coolest distance the book can hold — and the driver picks the third.
 */
function renderInstruments(ledger: Ledger.Entry[]): string {
  const drivers = promiseDrivers(ledger);
  const third = INSTRUMENTS.find(instrument => instrument.driver !== null && drivers.includes(instrument.driver)) ?? (INSTRUMENTS.at(-1) as Instrument);
  return [
    'Write these three, in this order:',
    '1. Close third, past, dry and concrete — the book at its most readable, and the one to beat.',
    '2. First person, present — the closest the reader can get to the POV, and the hardest place to hide what they know.',
    `3. ${third.description}`,
  ].join('\n');
}

function renderScope(opening: OpeningChapter | null, ledger: Ledger.Entry[]): string {
  const tone = promiseTone(ledger);
  return [
    opening
      ? `Open chapter ${opening.chapter}${opening.title ? `, "${opening.title}"` : ''}. Its brief, which all three samples dramatise the first scene of:\n${opening.brief}`
      : 'Arc one has not been briefed yet, so open the novel from the premise and the protagonist alone, and keep each sample short.',
    `Whose head the reader is in:\n${renderLockedCrucible(ledger)}`,
    tone ? `The tone the reader was promised: ${tone}` : 'No tone was promised; take it from the premise.',
    renderInstruments(ledger),
  ].join('\n');
}

function voiceBody(selection: VoiceSelection, current: string | null): string {
  return upsertPageSections(current, 'Pacing and tone', selection.why?.trim() || null, [
    { heading: 'Voice', body: [`**${selection.label.trim()}**`, selection.notes.trim()].join('\n\n') },
    { heading: 'A paragraph in that voice', body: `${selection.paragraph.trim()}\n\n*An example of the voice, written to be thrown away — it is not chapter one.*` },
  ]);
}

export const voiceStep: ScreenStep<BlueprintVoiceOutput, VoiceOptions, never, VoiceSelection> = {
  kind: 'screen',
  key: VOICE_STEP_KEY,
  phase: 'opening',
  // The one Opening decision an author can only really make by writing, and the platform already treats a voice sample as
  // recommended rather than required for an imported plan; holding the gate on it would be a different rule for the same thing.
  required: false,
  completionTopics: [VOICE_TOPIC],
  nudges: ['Sounds like a book I love…', 'Shorter sentences', 'More inner voice', 'Colder narrator'],
  prompt: blueprintVoicePrompt,
  optionsSchema: VoiceOptions,
  selectionSchema: VoiceSelection,
  budgetTokens: VOICE_BUDGET_TOKENS,

  async inputs(context: StepInputContext<VoiceOptions, never>) {
    const opening = await openingChapter(context.db, context.projectId);
    const sections: BlueprintInputSection[] = [{ key: 'voice_scope', content: renderScope(opening, context.ledger), required: true }];
    const pages = opening ? await citedPagesSection(context.db, context.projectId, opening.refs) : null;
    if (pages) sections.push(pages);
    return sections;
  },

  toRound(output) {
    const samples = output.samples.map((sample, index) => ({
      id: `vs${index + 1}`,
      label: sample.label.trim(),
      tradeoff: sample.tradeoff.trim(),
      opening: sample.opening.trim(),
    }));
    if (samples.length === 0) throw AppErrorCode.AI_001.create();
    return { options: { samples }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    return options.samples.map((sample): StepOption => ({ id: sample.id, label: `${sample.label} — ${sample.tradeoff}` }));
  },

  chosenOptionIds(selection) {
    return selection.optionId ? [selection.optionId] : [];
  },

  /**
   * The voice as notes and one paragraph. The samples themselves are never stored: they are prose written to be thrown away, and a
   * draft row for chapter one would make the author's first real chapter something a model wrote before the design was finished.
   */
  async materialise(selection, { round, project, tx }) {
    if (!selection.notes.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what this voice means for whoever writes the chapters' });
    if (!selection.paragraph.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'keep a paragraph in the voice you chose — it is what the notes are about' });

    const chosen = round?.options.samples.find(sample => sample.id === selection.optionId);
    const page = await loadPageBody(tx, project.id, VOICE_PAGE);
    const changeSet: ContentOp[] = [{ op: 'bible_document.upsert', ...VOICE_PAGE, body: voiceBody(selection, page) }];

    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: VOICE_TOPIC,
          statement: selection.label.trim(),
          why: selection.why?.trim() || null,
          writerLine: selection.notes.trim(),
          rejectedAlternatives: (round?.options.samples ?? []).filter(sample => sample.id !== selection.optionId).map(sample => sample.label),
          // No optionId: "which voice" is one standing question whose answer chain runs across rounds, and a sample id names a
          // different voice in every round — pairing on it would rewrite one answer as another.
          payload: { label: selection.label.trim(), paragraph: selection.paragraph.trim(), ...(chosen ? { tradeoff: chosen.tradeoff } : {}) },
          links: { bibleDocuments: [VOICE_PAGE] },
        },
      ],
      changeSet,
      summary: 'Blueprint: the novel’s voice',
    };
    return plan;
  },
};
