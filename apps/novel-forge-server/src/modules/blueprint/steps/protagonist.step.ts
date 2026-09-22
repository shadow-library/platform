import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import { ENGINE_LINE_MAX, ENGINE_NAME_MAX, ENGINE_WRITER_LINE_MAX, PROTAGONIST_LEADS_MAX } from '../../ai/schemas/blueprint-engine.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { contentKey, lockedLinks, removedContentOps } from './content-keys';
import { ENGINE_STEP_KEY, type EngineOptions, type ProtagonistSliceOptions } from './engine.step';

export const PROTAGONIST_STEP_KEY = 'protagonist';
export const PROTAGONIST_TOPIC = 'protagonist';
export const PROTAGONIST_WHY_MAX = 400;
export const PROTAGONIST_REJECTED_MAX = 8;
export const CAST_PAGE: PageRef = { section: 'project', slug: 'cast' };

const PROTAGONIST_HEADING = 'Protagonist';

@Schema()
export class ProtagonistLeadChoice {
  @Field({ optional: true, pattern: '^pv[0-9]+$', description: 'The version this lead came from; absent once the author has rewritten it.' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  descriptor: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'The lie they believe. It is what separates one version of this character from another.' })
  lie: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  wound: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  want: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  need: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  change: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'What they do in chapter one because of the lie.' })
  chapterOne: string;
}

@Schema()
export class ProtagonistSelection {
  @Field(() => [ProtagonistLeadChoice], { minItems: 1, maxItems: PROTAGONIST_LEADS_MAX, description: 'One lead, or two when the author asked for two.' })
  leads: ProtagonistLeadChoice[];

  @Field({ optional: true, maxLength: PROTAGONIST_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX, description: 'What the lie means for whoever writes chapter one; it rides every chapter pack.' })
  writerLine: string;
}

function leadBody(lead: ProtagonistLeadChoice): string {
  return [
    `**${lead.name.trim()}** — ${lead.descriptor.trim()}`,
    `- Lie: ${lead.lie.trim()}`,
    `- Wound: ${lead.wound.trim()}`,
    `- Want: ${lead.want.trim()}`,
    `- Need: ${lead.need.trim()}`,
    `- Change: ${lead.change.trim()}`,
    `- Chapter one: ${lead.chapterOne.trim()}`,
  ].join('\n');
}

function entityOp(lead: ProtagonistLeadChoice, entityKey: string): ContentOp {
  return {
    op: 'entity.upsert',
    entityKey,
    type: 'character',
    name: lead.name.trim(),
    status: 'Protagonist',
    motivation: lead.want.trim(),
    notes: `Lie: ${lead.lie.trim()}`,
    body: leadBody(lead),
  };
}

function statement(leads: ProtagonistLeadChoice[]): string {
  return leads.map(lead => `${lead.name.trim()} — ${lead.lie.trim()}`).join(' · ');
}

function passedOver(offered: ProtagonistSliceOptions | null, chosen: ProtagonistLeadChoice[]): string[] {
  const taken = new Set(chosen.map(lead => lead.lie.trim().toLowerCase()));
  return (offered?.versions ?? [])
    .map(version => version.lie)
    .filter(lie => !taken.has(lie.trim().toLowerCase()))
    .slice(0, PROTAGONIST_REJECTED_MAX);
}

function assertLeads(leads: ProtagonistLeadChoice[]): void {
  const empty = leads.find(lead => !lead.name.trim() || !lead.lie.trim());
  if (empty) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every lead needs a name and the lie they believe' });
  const names = leads.map(lead => lead.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the two leads have the same name' });
}

export const protagonistStep: SourcedScreenStep<EngineOptions, ProtagonistSliceOptions | null, ProtagonistSelection> = {
  kind: 'screen',
  key: PROTAGONIST_STEP_KEY,
  phase: 'core',
  required: true,
  completionTopics: [PROTAGONIST_TOPIC],
  nudges: ['Funnier', 'Colder', 'More reckless', 'Two leads instead'],
  selectionSchema: ProtagonistSelection,
  source: { step: ENGINE_STEP_KEY, select: options => options.protagonist ?? null },

  describeView(view) {
    return (view?.versions ?? []).map(version => ({ id: version.id, label: version.lie }));
  },

  chosenOptionIds(selection) {
    return selection.leads.flatMap(lead => (lead.optionId ? [lead.optionId] : []));
  },

  /** One decision for the lead or leads, and one character entity each: the supporting cast waits for Volume one. */
  async materialise(selection, { round, ledger, project, tx }) {
    assertLeads(selection.leads);
    const writerLine = selection.writerLine.trim();
    if (!writerLine) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the lie means for whoever writes chapter one' });

    const taken = new Set<string>();
    const entities = selection.leads.map(lead => ({ lead, entityKey: contentKey('', lead.name, taken) }));
    const body = upsertPageSections(await loadPageBody(tx, project.id, CAST_PAGE), 'Cast', null, [
      { heading: PROTAGONIST_HEADING, body: entities.map(({ lead }) => leadBody(lead)).join('\n\n') },
    ]);

    const links: Ledger.Links = { bibleDocuments: [CAST_PAGE], entityKeys: entities.map(entity => entity.entityKey) };
    const changeSet: ContentOp[] = [
      ...entities.map(({ lead, entityKey }) => entityOp(lead, entityKey)),
      { op: 'bible_document.upsert', ...CAST_PAGE, body },
      ...removedContentOps(lockedLinks(ledger, PROTAGONIST_STEP_KEY), links),
    ];

    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: PROTAGONIST_TOPIC,
          statement: statement(selection.leads),
          why: selection.why?.trim() || null,
          writerLine,
          rejectedAlternatives: passedOver(round?.options ?? null, selection.leads),
          payload: { leads: selection.leads.map(lead => ({ ...lead, name: lead.name.trim(), lie: lead.lie.trim() })) },
          links,
        },
      ],
      changeSet,
      summary: 'Blueprint: the protagonist',
    };
    return plan;
  },
};
