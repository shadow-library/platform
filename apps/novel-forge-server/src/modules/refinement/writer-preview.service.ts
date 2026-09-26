import { and, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  describeUnlockTerm,
  evaluateUnlock,
  humaniseSlug,
  loadPlanState,
  nearestVolumeKey,
  type PlanClaims,
  planUnlockContext,
  revealRequirements,
  secretTitle,
  type UnlockContext,
} from '@server/common';
import { type Bible, type DbExecutor, type PrimaryDatabase, schema } from '@server/database';

import { bibleDocLabel, bibleDocRef } from '../ai/context/bible-docs';
import { chapterWriterRefs, ContextAssembler } from '../ai/context/context-assembler.service';
import { loadWriterDisclosureSources, writerDisclosurePolicy, type WriterDisclosurePolicy, type WriterDisclosureSources } from '../bible/fact/writer-disclosure-policy';
import { type BriefUpdateOp, type ChangeOp } from './change-set';
import { loadStagedPlan, type StagedPlan } from './staged-plan';

export const WRITER_KEPT_KINDS = ['secret', 'ending', 'ending_question', 'volume', 'planner_page', 'ref'] as const;

export type WriterKeptKind = (typeof WRITER_KEPT_KINDS)[number];

export interface WriterPreviewRef {
  ref: string;
  label: string;
  /** A locked secret the plan cites: the writer reads its cover note as a writing constraint, never its truth. */
  constraint?: boolean;
}

export interface WriterKept {
  kind: WriterKeptKind;
  key: string;
  label: string;
  coverNote?: string | null;
}

export interface WriterUnlockChange {
  factKey: string;
  label: string;
  conditions: string[];
  /** Whether the reveal rule lets this chapter reveal the secret once the card stands; the writer receives it only if the plan also has it learned. */
  revealRuleAllows: boolean;
}

export interface WriterPreview {
  proposalId: bigint;
  chapter: number;
  included: WriterPreviewRef[];
  unresolved: WriterPreviewRef[];
  kept: WriterKept[];
  unlocks: WriterUnlockChange[];
  relocks: WriterUnlockChange[];
}

type Reader = Pick<DbExecutor, 'query'>;

function refParts(ref: string): [string, string] {
  const colon = ref.indexOf(':');
  return colon === -1 ? ['', ref] : [ref.slice(0, colon), ref.slice(colon + 1)];
}

function valuesFor(refs: readonly string[], prefix: string): string[] {
  return refs.flatMap(ref => {
    const [kind, value] = refParts(ref);
    return kind === prefix ? [value] : [];
  });
}

/** Names for refs, read from the records they point at; a secret, thread or mystery is named by its key, never by its text. */
async function loadRefLabels(db: Reader, projectId: bigint, refs: readonly string[]): Promise<Map<string, string>> {
  const entityKeys = valuesFor(refs, 'entity');
  const volumeKeys = valuesFor(refs, 'volume');
  const chapters = valuesFor(refs, 'chapter').map(Number).filter(Number.isInteger);
  const pages = valuesFor(refs, 'bible_doc');
  const [entities, volumes, chapterRows, docs] = await Promise.all([
    entityKeys.length > 0
      ? db.query.entities.findMany({
          columns: { entityKey: true, name: true },
          where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)),
        })
      : [],
    volumeKeys.length > 0
      ? db.query.volumes.findMany({ columns: { volumeKey: true, title: true }, where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.volumeKey, volumeKeys)) })
      : [],
    chapters.length > 0
      ? db.query.chapters.findMany({
          columns: { number: true, title: true, isolated: true },
          where: and(eq(schema.chapters.projectId, projectId), inArray(schema.chapters.number, chapters)),
        })
      : [],
    pages.length > 0
      ? db.query.bibleDocuments.findMany({
          columns: { section: true, slug: true, frontmatter: true, body: true },
          where: and(
            eq(schema.bibleDocuments.projectId, projectId),
            inArray(
              schema.bibleDocuments.slug,
              pages.map(page => page.slice(page.indexOf('/') + 1)),
            ),
          ),
        })
      : [],
  ]);
  const labels = new Map<string, string>([
    ...entities.map(entity => [`entity:${entity.entityKey}`, entity.name] as const),
    ...volumes.map(volume => [`volume:${volume.volumeKey}`, volume.title ?? humaniseSlug(volume.volumeKey)] as const),
    ...chapterRows.map(
      chapter => [`chapter:${chapter.number}`, chapter.title && !chapter.isolated ? `Chapter ${chapter.number}: ${chapter.title}` : `Chapter ${chapter.number}`] as const,
    ),
    ...docs.map(doc => [bibleDocRef(doc), bibleDocLabel(doc)] as const),
  ]);
  for (const ref of refs) {
    const [kind, value] = refParts(ref);
    if (!labels.has(ref)) labels.set(ref, kind === 'chapter' ? `Chapter ${value}` : humaniseSlug(value.slice(value.lastIndexOf('/') + 1)));
  }
  return labels;
}

/** Secrets are named by title alone; every other name is scrubbed as the writer's headings are, so a give-away term in a title stays out. */
function keptFrom(sources: WriterDisclosureSources, disclosure: WriterDisclosurePolicy, constraints: ReadonlySet<string>): WriterKept[] {
  const heading = (label: string): string => disclosure.scrub(label, 'heading');
  const page = (doc: Pick<Bible.Document, 'section' | 'slug' | 'frontmatter' | 'body'>): WriterKept => ({
    kind: 'planner_page',
    key: bibleDocRef(doc),
    label: heading(bibleDocLabel(doc)),
  });
  return [
    ...sources.lockedFacts
      .filter(fact => !constraints.has(`fact:${fact.factKey}`))
      .map((fact): WriterKept => ({
        kind: 'secret',
        key: `fact:${fact.factKey}`,
        label: secretTitle(fact),
        coverNote: fact.writerNote?.trim() ? disclosure.scrub(fact.writerNote.trim(), 'knowledge') : null,
      })),
    ...(sources.ending ? [{ kind: 'ending', key: 'ending', label: 'The ending' } as const] : []),
    ...(sources.endingQuestion ? [{ kind: 'ending_question', key: 'ending_question', label: 'The ending question' } as const] : []),
    ...sources.laterVolumes.map((volume): WriterKept => ({ kind: 'volume', key: `volume:${volume.volumeKey}`, label: heading(volume.title ?? humaniseSlug(volume.volumeKey)) })),
    ...sources.plannerPages.map(page),
  ];
}

/**
 * What the card changes about which secrets' unlock conditions hold at its chapter, against the plan stored there now: a claimed
 * milestone, the ending mark or a move to another volume can unlock a secret, and dropping one can lock it again.
 */
async function loadUnlockChanges(db: Reader, projectId: bigint, plan: StagedPlan): Promise<Pick<WriterPreview, 'unlocks' | 'relocks'>> {
  const state = await loadPlanState(db, projectId);
  const stored: PlanClaims = state.plans.find(candidate => candidate.chapter === plan.chapter) ?? {
    chapter: plan.chapter,
    volumeKey: await nearestVolumeKey(db, projectId, plan.chapter),
    isEnding: false,
    claimedMilestones: [],
  };
  const before = planUnlockContext(stored, state);
  const after = planUnlockContext(plan, state);
  const change = (fact: (typeof state.facts)[number] & { unlock: NonNullable<(typeof state.facts)[number]['unlock']> }, ctx: UnlockContext): WriterUnlockChange => ({
    factKey: fact.factKey,
    label: secretTitle(fact),
    conditions: fact.unlock.all.map(describeUnlockTerm),
    revealRuleAllows: revealRequirements(fact, ctx).length === 0,
  });
  const conditioned = state.facts.flatMap(fact => (fact.unlock ? [{ ...fact, unlock: fact.unlock }] : []));
  const holds = (fact: (typeof conditioned)[number], ctx: UnlockContext): boolean => evaluateUnlock(fact.unlock, ctx).holds;
  return {
    unlocks: conditioned.filter(fact => !holds(fact, before) && holds(fact, after)).map(fact => change(fact, after)),
    relocks: conditioned.filter(fact => holds(fact, before) && !holds(fact, after)).map(fact => change(fact, after)),
  };
}

/**
 * What the chapter writer would receive if a pending plan card were applied as it stands: the card's plan is merged over the stored one in
 * memory and judged by the writer's own disclosure policy and ref resolution. Only names and keys leave here, never withheld text.
 */
@Injectable()
export class WriterPreviewService {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async preview(projectId: bigint, proposalId: bigint): Promise<WriterPreview> {
    const proposal = await this.db.query.refinementProposals.findFirst({
      columns: { id: true, kind: true, status: true, changeSet: true },
      where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)),
    });
    if (!proposal) throw AppErrorCode.RFN_001.create();
    const op = (proposal.changeSet as ChangeOp[]).find((candidate): candidate is BriefUpdateOp & ChangeOp => candidate.op === 'brief.update');
    if (proposal.kind !== 'chapter_plan' || proposal.status !== 'pending' || !op) throw AppErrorCode.RFN_013.create();

    const plan = await loadStagedPlan(this.db, projectId, op);
    const sources = await loadWriterDisclosureSources(this.db, projectId, op.chapter, plan);
    const disclosure = writerDisclosurePolicy(sources);
    const refs = [...new Set([...(plan.pov ? [`entity:${plan.pov}`] : []), ...chapterWriterRefs(plan)])];
    const [resolution, changes, labels] = await Promise.all([
      this.contextAssembler.writerRefs(projectId, refs, op.chapter, disclosure, plan),
      loadUnlockChanges(this.db, projectId, plan),
      loadRefLabels(this.db, projectId, refs),
    ]);
    const constraints = new Set(resolution.constraints);
    const label = (ref: string): string => (ref.startsWith('fact:') ? secretTitle({ factKey: ref.slice('fact:'.length) }) : disclosure.scrub(labels.get(ref) ?? ref, 'heading'));

    const kept = keptFrom(sources, disclosure, constraints);
    const keptKeys = new Set(kept.map(item => item.key));
    const refused = resolution.withheld.filter(ref => !keptKeys.has(ref)).map((ref): WriterKept => ({ kind: 'ref', key: ref, label: label(ref) }));
    return {
      proposalId: proposal.id,
      chapter: op.chapter,
      included: resolution.included.map(ref => ({ ref, label: label(ref), ...(constraints.has(ref) ? { constraint: true } : {}) })),
      unresolved: resolution.unresolved.map(ref => ({ ref, label: label(ref) })),
      kept: [...kept, ...refused],
      ...changes,
    };
  }
}
