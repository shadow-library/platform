import { and, desc, eq, lte } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode, DraftConflictError } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { CHAPTER_ROUTE_TABLE, chapterContainment, chapterContentMode, routeChapterCall } from '../ai/chapter-route';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { loadWriterBrief } from '../ai/context/writer-brief';
import { bibleHashOf, keptBackOf } from '../ai/graphs/writer-snapshot-capture';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { PASSAGE_END, PASSAGE_START } from '../ai/prompts/passage-rewrite.prompt';
import { type PassageRewriteOutput } from '../ai/schemas/passage-rewrite.schema';
import { type TelemetryContext } from '../ai/telemetry.handler';
import { WriterSnapshotService } from '../ai/writer-snapshot.service';
import { loadWriterDisclosurePolicy } from '../bible/fact/writer-disclosure-policy';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { asRetryableSave, assertDraftBase, baseOfDraft, type DraftBase, lockDraft, saveHandWrittenDraft } from './draft-save';
import { anchorContext, isWithinBody, locatePassage, MAX_PASSAGE_CHARS, passageHash, type PassageLocation, replacePassage } from './passage-anchor';

/** Suggestions carry their own passage text, so older ones are only clutter; a draft keeps its newest twenty. */
export const PASSAGE_SUGGESTIONS_KEPT = 20;

export interface PassageRequest {
  base: DraftBase;
  start: number;
  end: number;
  passageHash: string;
  request: string;
}

export interface PassageSuggestionView {
  id: bigint;
  chapter: number;
  baseRevision: number;
  baseSaveSeq: number;
  anchorStart: number;
  anchorEnd: number;
  passage: string;
  replacement: string;
  request: string;
  leakLines: string[];
  status: Generation.PassageSuggestionStatus;
  appliedRevision: number | null;
  location: PassageLocation;
  createdAt: Date;
}

export interface AppliedPassage {
  draft: Generation.Draft;
  suggestion: PassageSuggestionView;
}

function anchorOf(suggestion: Generation.PassageSuggestion): Parameters<typeof locatePassage>[1] {
  const { anchorStart: start, anchorEnd: end, passageHash, passage, contextBefore, contextAfter } = suggestion;
  return { start, end, passageHash, passage, contextBefore, contextAfter };
}

function presentSuggestion(suggestion: Generation.PassageSuggestion, body: string): PassageSuggestionView {
  const { projectId: _projectId, draftId: _draftId, passageHash: _hash, contextBefore: _before, contextAfter: _after, updatedAt: _updatedAt, leakLines, ...rest } = suggestion;
  return { ...rest, leakLines: leakLines ?? [], location: locatePassage(body, anchorOf(suggestion)) };
}

/** The model returns the passage's words; the selection's own leading and trailing whitespace stays, so paragraph breaks around it survive. */
function fitReplacement(passage: string, replacement: string): string {
  const leading = /^\s*/.exec(passage)?.[0] ?? '';
  const trailing = /\s*$/.exec(passage)?.[0] ?? '';
  return `${leading}${replacement.trim()}${trailing}`;
}

@Injectable()
export class PassageRewriteService {
  private readonly logger = Logger.getLogger(APP_NAME, PassageRewriteService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly writerSnapshots: WriterSnapshotService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Runs on the chapter's writer route with the revise role's model, disclosure policy and context pack; nothing is written to the draft until the author applies it. */
  async request(projectId: bigint, chapter: number, input: PassageRequest): Promise<PassageSuggestionView> {
    const draft = await this.findDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.PSG_006.create({ chapter: String(chapter) });
    if (draft.reviewStatus === 'generating') throw AppErrorCode.DRF_019.create({ chapter: String(chapter) });
    assertDraftBase(draft, input.base);
    if (!isWithinBody(draft.body, input.start, input.end)) throw AppErrorCode.PSG_002.create({ max: String(MAX_PASSAGE_CHARS) });
    const passage = draft.body.slice(input.start, input.end);
    if (passageHash(passage) !== input.passageHash) throw AppErrorCode.PSG_003.create();

    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const mode = chapterContentMode({ brief, isolated: draft.isolated });
    const { policy, project: routedProject } = await routeChapterCall(
      { pluginPolicy: this.pluginPolicy, modelRouter: this.modelRouter },
      projectId,
      { role: 'revise', chapter, mode },
      project as ProjectConfig | undefined,
    );
    const disclosure = await loadWriterDisclosurePolicy(this.db, projectId, chapter);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy, disclosure, enforceWriterReservations: true });
    const prompt = PROMPT_REGISTRY['passage-rewrite'];
    const isolated = Boolean(draft.isolated || chapterContainment(mode, policy).isolated);
    const ctx: TelemetryContext = {
      projectId,
      chapter,
      promptKey: prompt.key,
      promptVersion: prompt.version,
      role: CHAPTER_ROUTE_TABLE.revise,
      onMessages: this.writerSnapshots.onMessages({
        projectId,
        chapter,
        draftRevision: draft.revision,
        attempt: 1,
        role: 'passage',
        contextPackId: pack.id,
        keptBack: keptBackOf(disclosure, pack.omitted),
        planRevision: brief?.revision ?? null,
        bibleHash: bibleHashOf(pack.rendered),
        promptKey: prompt.key,
        promptVersion: prompt.version,
        isolated,
        runId: null,
      }),
    };
    const marked = `${draft.body.slice(0, input.start)}${PASSAGE_START}${passage}${PASSAGE_END}${draft.body.slice(input.end)}`;
    const output = (await this.modelRouter.structured(
      prompt,
      {
        contextPack: pack.rendered,
        chapterBrief: (await loadWriterBrief(this.db, projectId, chapter, brief, disclosure)).chapterBrief,
        draftBody: marked,
        passage,
        feedback: [disclosure.scrub(input.request, 'note'), ...disclosure.leakLines(passage)].join('\n'),
      },
      ctx,
      routedProject,
      disclosure.scrubPolicy(policy),
    )) as PassageRewriteOutput;
    const replacement = fitReplacement(passage, output.replacement);

    const suggestion = await this.db.transaction(async tx => {
      const current = await this.findDraft(projectId, chapter, tx);
      if (current.id !== draft.id) throw new DraftConflictError(current);
      if (current.status === 'final') throw AppErrorCode.PSG_006.create({ chapter: String(chapter) });
      const [row] = await tx
        .insert(schema.passageSuggestions)
        .values({
          projectId,
          draftId: draft.id,
          chapter,
          baseRevision: draft.revision,
          baseSaveSeq: draft.saveSeq,
          anchorStart: input.start,
          anchorEnd: input.end,
          passageHash: input.passageHash,
          passage,
          ...anchorContext(draft.body, input.start, input.end),
          isolated,
          request: input.request,
          replacement,
          leakLines: disclosure.leakLines(replacement),
        })
        .returning();
      if (!row) throw AppErrorCode.DRF_001.create();
      await pruneSuggestions(tx, draft.id);
      return presentSuggestion(row, current.body);
    });
    this.logger.info('passage suggestion made', { projectId, chapter, suggestionId: suggestion.id, baseRevision: draft.revision, freshness: suggestion.location.freshness });
    return suggestion;
  }

  async list(projectId: bigint, chapter: number): Promise<PassageSuggestionView[]> {
    const draft = await this.findDraft(projectId, chapter);
    const rows = await this.db.query.passageSuggestions.findMany({
      where: and(eq(schema.passageSuggestions.draftId, draft.id), eq(schema.passageSuggestions.status, 'open')),
      orderBy: desc(schema.passageSuggestions.id),
    });
    return rows.map(row => presentSuggestion(row, draft.body));
  }

  /** Decided under the draft's row lock: a suggestion applies only where its passage still stands, as a new revision through the hand-save path. */
  async apply(projectId: bigint, chapter: number, suggestionId: bigint, base: DraftBase | undefined): Promise<AppliedPassage> {
    const applied = await this.db
      .transaction(async tx => {
        const current = await lockDraft(tx, projectId, chapter);
        if (current.status === 'final') throw AppErrorCode.PSG_006.create({ chapter: String(chapter) });
        assertDraftBase(current, base);
        const suggestion = await findOpenSuggestion(tx, current, suggestionId);
        const location = locatePassage(current.body, anchorOf(suggestion));
        if (location.freshness === 'stale') throw AppErrorCode.PSG_004.create();

        const saved = await saveHandWrittenDraft(tx, {
          projectId,
          chapter,
          source: 'passage_rewritten',
          base: baseOfDraft(current),
          fields: {
            body: replacePassage(current.body, location, suggestion.replacement),
            ...(suggestion.isolated ? { generator: 'unrestricted' as const, isolated: true } : {}),
          },
        });
        const draft = await holdNewLeaks(tx, saved, suggestion);
        const [row] = await tx
          .update(schema.passageSuggestions)
          .set({ status: 'applied', appliedRevision: draft.revision, updatedAt: new Date() })
          .where(and(eq(schema.passageSuggestions.id, suggestion.id), eq(schema.passageSuggestions.status, 'open')))
          .returning();
        if (!row) throw AppErrorCode.PSG_005.create({ status: 'applied' });
        return { draft, suggestion: presentSuggestion(row, draft.body), freshness: location.freshness };
      })
      .catch(asRetryableSave);
    this.logger.info('passage suggestion applied', { projectId, chapter, suggestionId, revision: applied.draft.revision, freshness: applied.freshness });
    return { draft: applied.draft, suggestion: applied.suggestion };
  }

  async dismiss(projectId: bigint, chapter: number, suggestionId: bigint): Promise<PassageSuggestionView> {
    const draft = await this.findDraft(projectId, chapter);
    const suggestion = await findOpenSuggestion(this.db, draft, suggestionId);
    const [row] = await this.db
      .update(schema.passageSuggestions)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(and(eq(schema.passageSuggestions.id, suggestion.id), eq(schema.passageSuggestions.status, 'open')))
      .returning();
    if (!row) throw AppErrorCode.PSG_005.create({ status: 'closed' });
    return presentSuggestion(row, draft.body);
  }

  private async findDraft(projectId: bigint, chapter: number, db: Pick<PrimaryDatabase, 'query'> = this.db): Promise<Generation.Draft> {
    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
  }
}

/** Like a revise: a rewrite that brings in a locked secret the passage did not already give away is held as a contradiction, judged by the policy as it stands now. */
async function holdNewLeaks(tx: PrimaryTransaction, draft: Generation.Draft, suggestion: Generation.PassageSuggestion): Promise<Generation.Draft> {
  const disclosure = await loadWriterDisclosurePolicy(tx, draft.projectId, draft.chapter);
  const before = new Set(disclosure.leakLines(suggestion.passage));
  if (disclosure.leakLines(suggestion.replacement).every(line => before.has(line))) return draft;
  const [held] = await tx
    .update(schema.drafts)
    .set({ reviewStatus: 'contradiction' })
    .where(and(eq(schema.drafts.id, draft.id), eq(schema.drafts.revision, draft.revision)))
    .returning();
  return held ?? draft;
}

async function findOpenSuggestion(db: Pick<PrimaryDatabase, 'query'>, draft: Generation.Draft, suggestionId: bigint): Promise<Generation.PassageSuggestion> {
  const suggestion = await db.query.passageSuggestions.findFirst({
    where: and(eq(schema.passageSuggestions.id, suggestionId), eq(schema.passageSuggestions.draftId, draft.id)),
  });
  if (!suggestion) throw AppErrorCode.PSG_001.create();
  if (suggestion.status !== 'open') throw AppErrorCode.PSG_005.create({ status: suggestion.status });
  return suggestion;
}

async function pruneSuggestions(tx: PrimaryTransaction, draftId: bigint): Promise<void> {
  const suggestions = schema.passageSuggestions;
  const kept = await tx
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(eq(suggestions.draftId, draftId))
    .orderBy(desc(suggestions.id))
    .limit(PASSAGE_SUGGESTIONS_KEPT + 1);
  const oldest = kept[PASSAGE_SUGGESTIONS_KEPT];
  if (oldest) await tx.delete(suggestions).where(and(eq(suggestions.draftId, draftId), lte(suggestions.id, oldest.id)));
}
