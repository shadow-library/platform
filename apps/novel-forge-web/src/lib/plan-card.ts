import { type ApiError, type ChangeOpItem, type ContentMode, type JobEnqueueResponse, type MilestoneResponse, type ProposalResponse } from './apis';
import { secretTitle } from './bible-secrets';
import { type EndingDraft, endingDraftOf } from './chapter-brief';
import { batchStopNotice } from './chapter-workspace';

export type PlanOp = ChangeOpItem & { op: 'brief.update'; chapter: number };

export interface PlanScene {
  /** Local identity for list rendering and focus; never sent. */
  id: string;
  summary: string;
  pov: string;
  goal: string;
  obstacle: string;
  turn: string;
  beats: string;
  estimatedWords?: number;
}

export interface PlanLearn {
  entityKey: string;
  factKey: string;
}

export interface PlanDraft {
  title: string;
  purpose: string;
  pov: string;
  scenes: PlanScene[];
  ending: EndingDraft;
  claimedMilestones: string[];
  contextRefs: string[];
  /** What the chapter learns on the page; carried as the planner set it unless the author drops a reveal the server refused. */
  learns: PlanLearn[] | null;
  /** Undefined leaves the chapter's own mode as it is, null follows the novel's, a mode is the author's pick on the card. */
  contentMode: ContentMode | null | undefined;
  /** The planner's density warning; a hand edit to the scenes or length clears it, as a hand edit to a stored plan does. */
  densityRisk: string | null;
}

export interface PlanOpRef {
  index: number;
  op: PlanOp;
}

export type PlanWarningKind = 'pooling' | 'giveaway' | 'pov' | 'density' | 'other';

export type PlanWarnings = Record<PlanWarningKind, string[]>;

export type PlanMilestone = Pick<MilestoneResponse, 'milestoneKey' | 'label' | 'state' | 'plannedChapter'>;

export interface PlanPage {
  ref: string;
  label: string;
  /** A page the writer never reads, such as the organised timeline; never offered on the card. */
  writerExcluded?: boolean;
}

export interface PlanErrorView {
  title: string;
  message: string;
  /** The story moved past this chapter: only a new plan helps. */
  replan: boolean;
  /** Reveals the server refused; dropping them from the plan lets it apply. */
  dropReveals?: string[];
}

export interface WriteErrorView {
  message: string;
  retry: boolean;
}

export const LENGTH_CHOICES: readonly number[] = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];

/** Mirrors the server's writer-excluded pages (`bible-docs.ts`) until the Story Bible list says so itself. */
export const WRITER_EXCLUDED_PAGES: readonly string[] = ['project/timeline', 'project/open-questions', 'story_state/volume-plan', 'story_state/volumes', 'plot/escalation-map'];

export const ALWAYS_SENT =
  'Always: this plan, how the last chapter ended, the characters on stage and what their points of view know, the book’s rules, the volume’s goal and your style. If it can’t all fit, you’ll be told what was cut.';

const SCENE_TEXT_FIELDS = ['goal', 'obstacle', 'turn'] as const;
const WORD_STEP = 10;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
}

function isMode(value: unknown): value is ContentMode {
  return value === 'standard' || value === 'unrestricted';
}

export function findPlanOp(proposal: Pick<ProposalResponse, 'changeSet'>): PlanOpRef | null {
  const index = proposal.changeSet.findIndex(op => op.op === 'brief.update' && typeof op.chapter === 'number');
  const op = proposal.changeSet[index];
  return op ? { index, op: op as PlanOp } : null;
}

/** An empty plan card never carries the planner's reader-value list, which every planned card does. */
export function startedEmpty(op: PlanOp): boolean {
  return !Array.isArray(op.readerValue);
}

export function nextSceneId(scenes: readonly PlanScene[]): string {
  const taken = scenes.map(scene => Number(scene.id.replace('scene-', ''))).filter(Number.isInteger);
  return `scene-${taken.length > 0 ? Math.max(...taken) + 1 : 0}`;
}

function sceneOf(value: unknown, index: number): PlanScene {
  const scene = record(value);
  const words = scene.estimatedWords;
  return {
    id: `scene-${index}`,
    summary: str(scene.summary),
    pov: str(scene.pov),
    goal: str(scene.goal),
    obstacle: str(scene.obstacle),
    turn: str(scene.turn),
    beats: strings(scene.beats).join('\n'),
    estimatedWords: typeof words === 'number' && Number.isInteger(words) && words > 0 ? words : undefined,
  };
}

function learnsOf(op: PlanOp): PlanLearn[] | null {
  const learns = record(op.knowledgeContract).learns;
  if (!Array.isArray(learns)) return null;
  return learns.map(learn => ({ entityKey: str(record(learn).entityKey), factKey: str(record(learn).factKey) })).filter(learn => learn.entityKey && learn.factKey);
}

export function planDraftOf(op: PlanOp): PlanDraft {
  return {
    title: str(op.title),
    purpose: str(op.chapterPurpose),
    pov: str(op.pov),
    scenes: Array.isArray(op.scenes) ? op.scenes.map(sceneOf) : [],
    ending: endingDraftOf(op.endingContract),
    claimedMilestones: strings(op.claimedMilestones),
    contextRefs: strings(op.contextRefs),
    learns: learnsOf(op),
    contentMode: 'contentMode' in op ? (isMode(op.contentMode) ? op.contentMode : null) : undefined,
    densityRisk: typeof op.densityRisk === 'string' && op.densityRisk.trim() ? op.densityRisk : null,
  };
}

function sceneOut(scene: PlanScene): Record<string, unknown> {
  const out: Record<string, unknown> = { summary: scene.summary.trim(), pov: scene.pov || null };
  for (const field of SCENE_TEXT_FIELDS) {
    const text = scene[field].trim();
    if (text) out[field] = text;
  }
  const beats = scene.beats
    .split('\n')
    .map(beat => beat.trim())
    .filter(Boolean);
  if (beats.length > 0) out.beats = beats;
  if (scene.estimatedWords) out.estimatedWords = scene.estimatedWords;
  return out;
}

export function savedScenes(scenes: readonly PlanScene[]): PlanScene[] {
  return scenes.filter(scene => scene.summary.trim() !== '');
}

export function endingComplete(ending: EndingDraft): boolean {
  return ending.hookType !== '' && [ending.emotionalBeat, ending.openQuestion, ending.handoffState].every(part => part.trim() !== '');
}

function endingBlank(ending: EndingDraft): boolean {
  return ending.hookType === '' && [ending.emotionalBeat, ending.openQuestion, ending.handoffState].every(part => part.trim() === '');
}

/** The server takes an ending only whole, so a half-filled one is held back and the last whole one stays on the card. */
export function endingProblem(ending: EndingDraft): string | null {
  if (endingComplete(ending) || endingBlank(ending)) return null;
  const missing = [
    ending.handoffState.trim() ? null : 'where it ends',
    ending.hookType ? null : 'the kind of ending',
    ending.emotionalBeat.trim() ? null : 'what the reader feels',
    ending.openQuestion.trim() ? null : 'the question left open',
  ].filter((part): part is string => part !== null);
  return `The ending is saved once it has all four parts — still missing: ${missing.join(', ')}.`;
}

function uniquePovs(scenes: readonly PlanScene[]): string[] {
  return [...new Set(scenes.map(scene => scene.pov).filter(Boolean))];
}

/** The card's op with the draft written over it; fields the card does not edit are carried as they were. */
export function planOpOf(base: PlanOp, draft: PlanDraft): PlanOp {
  const out: Record<string, unknown> = { ...base };
  const setText = (key: string, value: string): void => {
    if (value.trim()) out[key] = value.trim();
    else if (key in base) out[key] = '';
  };
  setText('title', draft.title);
  setText('chapterPurpose', draft.purpose);
  out.pov = draft.pov || null;

  const scenes = savedScenes(draft.scenes);
  out.scenes = scenes.map(sceneOut);
  out.claimedMilestones = draft.claimedMilestones;
  if (draft.contextRefs.length > 0 || base.contextRefs !== undefined) out.contextRefs = draft.contextRefs;
  out.densityRisk = draft.densityRisk;
  if (draft.contentMode !== undefined) out.contentMode = draft.contentMode;

  if (endingComplete(draft.ending)) {
    const { hookType, emotionalBeat, openQuestion, handoffState, mustNotResolve } = draft.ending;
    out.endingContract = { hookType, emotionalBeat: emotionalBeat.trim(), openQuestion: openQuestion.trim(), handoffState: handoffState.trim(), mustNotResolve };
  }

  const scenePovs = uniquePovs(scenes);
  const povs = scenePovs.length > 0 ? scenePovs : draft.pov ? [draft.pov] : [];
  const baseContract = record(base.knowledgeContract);
  if (povs.length > 0) out.knowledgeContract = draft.learns ? { pov: povs, learns: draft.learns } : { pov: povs };
  else if (draft.learns && Array.isArray(baseContract.pov)) out.knowledgeContract = { ...baseContract, learns: draft.learns };
  return out as PlanOp;
}

export function changeSetWith(changeSet: readonly ChangeOpItem[], ref: PlanOpRef, draft: PlanDraft): ChangeOpItem[] {
  return changeSet.map((op, index) => (index === ref.index ? planOpOf(ref.op, draft) : op));
}

export function withScene(draft: PlanDraft, id: string, patch: Partial<Omit<PlanScene, 'id'>>): PlanDraft {
  const scenes = draft.scenes.map(scene => (scene.id === id ? { ...scene, ...patch } : scene));
  const reshaped = patch.summary !== undefined || patch.estimatedWords !== undefined;
  return { ...draft, scenes, densityRisk: reshaped ? null : draft.densityRisk };
}

export function withNewScene(draft: PlanDraft, pov: string): PlanDraft {
  const scene: PlanScene = { id: nextSceneId(draft.scenes), summary: '', pov, goal: '', obstacle: '', turn: '', beats: '' };
  return { ...draft, scenes: [...draft.scenes, scene] };
}

export function withoutScene(draft: PlanDraft, id: string): PlanDraft {
  return { ...draft, scenes: draft.scenes.filter(scene => scene.id !== id), densityRisk: null };
}

/** The scene that takes focus once one is removed: the next, else the previous, else none. */
export function sceneAfterRemoving(scenes: readonly PlanScene[], id: string): string | null {
  const index = scenes.findIndex(scene => scene.id === id);
  return scenes[index + 1]?.id ?? scenes[index - 1]?.id ?? null;
}

export function everySceneFrom(draft: PlanDraft, pov: string): PlanDraft {
  return { ...draft, scenes: draft.scenes.map(scene => ({ ...scene, pov })) };
}

export function withoutReveals(draft: PlanDraft, factKeys: readonly string[]): PlanDraft {
  if (!draft.learns || factKeys.length === 0) return draft;
  return { ...draft, learns: draft.learns.filter(learn => !factKeys.includes(learn.factKey)) };
}

export function planWords(scenes: readonly PlanScene[]): number | null {
  const saved = savedScenes(scenes);
  if (saved.length === 0 || saved.some(scene => !scene.estimatedWords)) return null;
  return saved.reduce((sum, scene) => sum + (scene.estimatedWords ?? 0), 0);
}

function roundWords(words: number): number {
  return Math.max(WORD_STEP, Math.round(words / WORD_STEP) * WORD_STEP);
}

/** Spreads a chapter length over the scenes: in proportion when every scene has a share, evenly when any lacks one. */
export function withLength(draft: PlanDraft, total: number): PlanDraft {
  const saved = savedScenes(draft.scenes);
  if (saved.length === 0) return draft;
  const current = planWords(draft.scenes);
  const share = (scene: PlanScene): number => (current ? ((scene.estimatedWords ?? 0) * total) / current : total / saved.length);
  const scenes = draft.scenes.map(scene => (scene.summary.trim() ? { ...scene, estimatedWords: roundWords(share(scene)) } : scene));
  return { ...draft, scenes, densityRisk: null };
}

export function lengthLabel(words: number): string {
  return `About ${words.toLocaleString('en-US')} words`;
}

export function lengthChoices(current: number | null): number[] {
  const rounded = current === null ? null : Math.round(current / 100) * 100;
  if (rounded === null || LENGTH_CHOICES.includes(rounded)) return [...LENGTH_CHOICES];
  return [...LENGTH_CHOICES, rounded].sort((a, b) => a - b);
}

/** Reads the server's diagnostics by their wording until they arrive typed; the one place that does. */
export function planWarningKind(warning: string): PlanWarningKind {
  if (warning.startsWith('Give-away:')) return 'giveaway';
  if (warning.startsWith('Density:')) return 'density';
  if (/^Scene \d+(?: names no point of view|'s point of view ".*" is not a character)/.test(warning)) return 'pov';
  if (warning.includes('the writer will have it for the whole chapter') || warning.includes('the writer has it for the whole chapter')) return 'pooling';
  return 'other';
}

/** A fact the chapter reveals to a character no scene is told by any more: the server pools knowledge over the scenes' points of view. */
export function learnsWithoutPov(draft: PlanDraft, names: ReadonlyMap<string, string>): string[] {
  const povs = uniquePovs(savedScenes(draft.scenes));
  if (povs.length === 0) return [];
  return (draft.learns ?? [])
    .filter(learn => !povs.includes(learn.entityKey))
    .map(
      learn =>
        `${names.get(learn.entityKey) ?? learn.entityKey} learns "${secretTitle(learn.factKey)}" on the page, but no scene is told by them now — give them a scene, or drop the reveal.`,
    );
}

export function planWarningsOf(warnings: readonly string[], draft: PlanDraft, names: ReadonlyMap<string, string>): PlanWarnings {
  const grouped: PlanWarnings = { pooling: [], giveaway: [], pov: [], density: [], other: [] };
  for (const warning of new Set(warnings)) grouped[planWarningKind(warning)].push(warning);
  grouped.pov.push(...learnsWithoutPov(draft, names).filter(warning => !grouped.pov.includes(warning)));
  return grouped;
}

function detailOf(message: string): string {
  const at = message.indexOf(': ');
  return at < 0 ? message : message.slice(at + 2);
}

/** Reads the refused fact keys out of a PLN_001 message; the one place to swap for the server's typed violations. */
export function refusedFactKeys(error: ApiError): string[] {
  return detailOf(error.message)
    .split('; ')
    .map(part => /^([\w.:-]+) \(needs /.exec(part.trim())?.[1] ?? '')
    .filter(Boolean);
}

/** Only reveals the plan really makes: an unreadable refusal offers nothing to drop rather than dropping them all. */
export function droppableReveals(error: ApiError, learns: readonly PlanLearn[] | null): string[] {
  const planned = new Set((learns ?? []).map(learn => learn.factKey));
  return refusedFactKeys(error).filter(key => planned.has(key));
}

export function planErrorView(error: ApiError, learns: readonly PlanLearn[] | null = null): PlanErrorView {
  switch (error.code) {
    case 'PLN_001': {
      const dropReveals = droppableReveals(error, learns);
      return {
        title: 'A reveal in this plan isn’t unlocked here',
        message: `${detailOf(error.message)}. ${dropReveals.length > 0 ? 'Drop the reveal, or claim' : 'Claim'} the milestone it waits for.`,
        replan: false,
        ...(dropReveals.length > 0 ? { dropReveals } : {}),
      };
    }
    case 'PLN_003':
      return { title: 'A milestone can’t be claimed here', message: `${detailOf(error.message)}. Remove it from “This chapter reaches”.`, replan: false };
    case 'PLN_008':
      return { title: 'The story has moved on', message: 'This plan is for a chapter that is no longer next. Plan the next chapter again.', replan: true };
    case 'RFN_002':
      return { title: 'This plan was already used or discarded', message: 'It can no longer change. Ask for a new plan if you need one.', replan: false };
    default:
      return { title: 'Couldn’t save the plan', message: error.message, replan: false };
  }
}

export function writeErrorView(error: ApiError): WriteErrorView {
  switch (error.code) {
    case 'DRF_016':
      return { message: error.message, retry: false };
    case 'DRF_011':
    case 'DRF_018':
      return { message: `Chapters are written in order: ${error.message}`, retry: false };
    case 'DRF_012':
      return { message: `An earlier chapter is written outside the AI: ${error.message}`, retry: false };
    default:
      return { message: error.message, retry: true };
  }
}

/** Why a started write did not reach this chapter, if it did not. */
export function writeStopNotice(job: JobEnqueueResponse, chapter: number | undefined): WriteErrorView | null {
  const notice = batchStopNotice(job);
  if (notice) return { message: notice, retry: false };
  if (chapter !== undefined && job.target !== String(chapter)) return { message: 'Another chapter is being written. Try again once it finishes.', retry: true };
  return null;
}

/** Null follows the novel; `chapterMode` is the mode the chapter already has, which a card that leaves the mode alone keeps. */
export function resolvedContentMode(draft: Pick<PlanDraft, 'contentMode'>, chapterMode: ContentMode | null): ContentMode | null {
  return draft.contentMode === undefined ? chapterMode : draft.contentMode;
}

export function isBlankPlan(draft: PlanDraft): boolean {
  return !draft.title.trim() || savedScenes(draft.scenes).length === 0;
}

export function keptBackStructure(isEnding: boolean): string[] {
  return [...(isEnding ? [] : ['how the book ends']), 'later volumes and their goals', 'planner-only pages (the organised timeline and open questions)'];
}

const REF_KINDS: Record<string, string> = { thread: 'Thread', mystery: 'Mystery', volume: 'Volume', world_fact: 'World' };

export function refLabel(ref: string, pages: readonly PlanPage[], names: ReadonlyMap<string, string>): string {
  const page = pages.find(candidate => candidate.ref === ref);
  if (page) return page.label;
  const split = ref.indexOf(':');
  if (split < 0) return secretTitle(ref);
  const kind = ref.slice(0, split);
  const value = ref.slice(split + 1);
  if (kind === 'entity') return names.get(value) ?? secretTitle(value);
  if (kind === 'chapter') return `Chapter ${value}`;
  if (kind === 'bible_doc') return secretTitle(value.split('/').at(-1) ?? value);
  const prefix = REF_KINDS[kind];
  return prefix ? `${prefix}: ${secretTitle(value)}` : secretTitle(value);
}

export function isWriterExcludedDoc(section: string, slug: string): boolean {
  return WRITER_EXCLUDED_PAGES.includes(`${section}/${slug}`);
}

export function addablePages(pages: readonly PlanPage[], chosen: readonly string[]): PlanPage[] {
  return pages.filter(page => !chosen.includes(page.ref) && !page.writerExcluded);
}

export function claimableMilestones(milestones: readonly PlanMilestone[], chapter: number, claimed: readonly string[]): PlanMilestone[] {
  return milestones.filter(
    milestone => !claimed.includes(milestone.milestoneKey) && (milestone.state === 'open' || (milestone.state === 'planned' && milestone.plannedChapter === chapter)),
  );
}

export function milestoneLabel(key: string, milestones: readonly PlanMilestone[]): string {
  return milestones.find(milestone => milestone.milestoneKey === key)?.label ?? secretTitle(key);
}

/** Runs one save at a time, and of the edits made meanwhile only the latest: each carries the whole card. */
export interface LatestQueue<T> {
  push: (value: T) => void;
  /** Sends the latest value again after a failed save. */
  retry: () => void;
  /** Resolves once nothing is left to send: true when the last send went through. */
  settled: () => Promise<boolean>;
}

export function createLatestQueue<T>(run: (value: T) => Promise<unknown>): LatestQueue<T> {
  let pending: { value: T } | null = null;
  let latest: { value: T } | null = null;
  let running: Promise<void> | null = null;
  let lastOk = true;

  const drain = async (): Promise<void> => {
    while (pending) {
      const { value } = pending;
      pending = null;
      lastOk = await run(value).then(
        () => true,
        () => false,
      );
    }
    running = null;
  };

  const push = (value: T): void => {
    pending = { value };
    latest = pending;
    running ??= drain();
  };

  return {
    push,
    retry: () => {
      if (latest && !lastOk) push(latest.value);
    },
    settled: async () => {
      await running;
      return lastOk;
    },
  };
}

export type WriteOutcome<J> =
  { kind: 'written'; job: J } | { kind: 'busy' } | { kind: 'save-failed' } | { kind: 'apply-failed'; error: unknown } | { kind: 'write-failed'; error: unknown };

export interface PlanFlowSteps<T, J> {
  send: (changeSet: T) => Promise<unknown>;
  apply: () => Promise<unknown>;
  write: () => Promise<J>;
}

export interface PlanFlow<T, J> {
  change: (changeSet: T) => void;
  retrySave: () => void;
  /** Waits for the last edit, sending it again once if it had failed. */
  settled: () => Promise<boolean>;
  /** Saves, applies and starts writing; a second call while one runs is refused. */
  applyAndWrite: () => Promise<WriteOutcome<J>>;
  /** Starts writing again for a plan that was already applied. */
  writeAgain: () => Promise<WriteOutcome<J>>;
}

export function createPlanFlow<T, J>(steps: PlanFlowSteps<T, J>): PlanFlow<T, J> {
  const saves = createLatestQueue(steps.send);
  let busy = false;

  const settled = async (): Promise<boolean> => {
    if (await saves.settled()) return true;
    saves.retry();
    return saves.settled();
  };

  const guarded = async (run: () => Promise<WriteOutcome<J>>): Promise<WriteOutcome<J>> => {
    if (busy) return { kind: 'busy' };
    busy = true;
    try {
      return await run();
    } finally {
      busy = false;
    }
  };

  const write = async (): Promise<WriteOutcome<J>> => {
    try {
      return { kind: 'written', job: await steps.write() };
    } catch (error) {
      return { kind: 'write-failed', error };
    }
  };

  return {
    change: saves.push,
    retrySave: saves.retry,
    settled,
    applyAndWrite: () =>
      guarded(async () => {
        if (!(await settled())) return { kind: 'save-failed' };
        try {
          await steps.apply();
        } catch (error) {
          return { kind: 'apply-failed', error };
        }
        return write();
      }),
    writeAgain: () => guarded(write),
  };
}
