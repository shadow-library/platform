import { loadWriterDisclosureSources, writerDisclosurePolicy, type WriterField } from '@modules/bible/fact/writer-disclosure-policy';
import { schema } from '@server/database';

import { ENDING, ENDING_QUESTION, LATER_VOLUME_OBJECTIVE, PROJECT_ID, TIMELINE_BODY, TIMELINE_SENTENCES } from './integrity-novel';
import { type IntegrityStore } from './integrity-store';

const FIELDS: readonly WriterField[] = ['prose', 'summary', 'state', 'entity', 'reference', 'bible_page', 'heading', 'plan', 'style', 'writer_line', 'knowledge', 'note', 'plugin'];
const COPY_FIELDS: ReadonlySet<WriterField> = new Set(['bible_page', 'entity', 'reference', 'plugin']);

const bare = (text: string): string => text.replace(/[.!?]+$/, '').toLowerCase();

/**
 * What the writer of `chapter` may read, per field, from the store as it stands: a secret whose milestone no plan up to the chapter claims and
 * nothing reached stays locked; a locked secret's truth, key and give-away terms, the ending and a later volume's goal are withheld from every
 * field; the planner-only timeline is withheld from the fields that copy authored canon (a copy of it under another address too) and nowhere else.
 * A policy built from the same withheld records as one already scrubbed field by field is not scrubbed again.
 */
export async function checkDisclosure(store: IntegrityStore, chapter: number, scrubbed: Set<string>, violated: (invariant: string, detail?: unknown) => never): Promise<void> {
  const sources = await loadWriterDisclosureSources(store.db as never, PROJECT_ID, chapter);
  const policy = writerDisclosurePolicy(sources);
  const locked = new Set(policy.lockedFacts.map(fact => fact.factKey));
  const briefs = store.rows(schema.briefs);
  const milestones = store.rows(schema.milestones);

  for (const fact of store.rows(schema.canonFacts)) {
    const needs = ((fact['unlock'] as { all?: { milestone?: string }[] } | null)?.all ?? []).flatMap(term => (term.milestone ? [term.milestone] : []));
    const unmet = needs.find(
      key =>
        !milestones.some(row => row['milestoneKey'] === key && row['state'] === 'reached') &&
        !briefs.some(row => Number(row['chapter']) <= chapter && ((row['claimedMilestones'] as string[] | null) ?? []).includes(key)),
    );
    if (unmet && !locked.has(String(fact['factKey'])))
      violated(`the writer of chapter ${chapter} reads ${String(fact['factKey'])} before ${unmet} unlocks it`, {
        milestones,
        claims: briefs.map(row => [row['chapter'], row['claimedMilestones'], row['knowledgeContract']]),
        knowledge: store.rows(schema.characterKnowledge),
      });
  }

  const copies = store.rows(schema.bibleDocuments).filter(page => page['body'] === TIMELINE_BODY && page['slug'] !== 'timeline');
  const signature = JSON.stringify([
    [...locked].sort(),
    sources.ending,
    sources.endingQuestion,
    sources.laterVolumes.map(volume => volume.volumeKey),
    sources.plannerPages.map(page => page.body),
    copies.length,
  ]);
  if (scrubbed.has(signature)) return;
  scrubbed.add(signature);

  const plannerOnly = [ENDING, ENDING_QUESTION, LATER_VOLUME_OBJECTIVE];
  const composite = [...policy.lockedFacts.map(fact => `${fact.text} See fact:${fact.factKey}. ${(fact.terms ?? []).join(' and ')}.`), ...plannerOnly, TIMELINE_BODY].join('\n');
  for (const field of FIELDS) {
    const text = policy.scrub(composite, field).toLowerCase();
    for (const fact of policy.lockedFacts) {
      const leaked = [bare(fact.text), `fact:${fact.factKey}`, ...(fact.terms ?? []).map(bare)].find(term => text.includes(term));
      if (leaked) violated(`locked ${fact.factKey} reaches the ${field} field of chapter ${chapter}'s writer`, leaked);
    }
    const planned = plannerOnly.find(planner => text.includes(bare(planner)));
    if (planned) violated(`planner-only text reaches the ${field} field of chapter ${chapter}'s writer`, planned);
    const shown = TIMELINE_SENTENCES.filter(sentence => text.includes(sentence.toLowerCase()));
    if (COPY_FIELDS.has(field) && shown.length > 0) violated(`the planner-only timeline reaches the ${field} field of chapter ${chapter}'s writer`, shown);
    if (!COPY_FIELDS.has(field) && shown.length !== TIMELINE_SENTENCES.length)
      violated(`the timeline is over-withheld from the ${field} field of chapter ${chapter}'s writer`, shown);
  }

  for (const page of copies) {
    const copy = policy.scrub(String(page['body']), 'bible_page').toLowerCase();
    if (TIMELINE_SENTENCES.some(sentence => copy.includes(sentence.toLowerCase())))
      violated(`a copy of the timeline at ${String(page['section'])}/${String(page['slug'])} reaches chapter ${chapter}'s writer`);
  }
}
