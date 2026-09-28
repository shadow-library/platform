import { and, eq, inArray, lt } from 'drizzle-orm';

import { evaluateUnlock, isOpenCanon, loadPlanState, parseKnowledgeContract, planUnlockContext, secretTitle } from '@server/common';
import { type BriefScene, type DbExecutor, type Knowledge, type Refinement, schema } from '@server/database';

import { findBriefRevealViolations, isRevealLocked, type RevealViolation, scheduledReveals } from '../ai/context/canon-guard';
import { minScenesFor } from '../ai/schemas/outline.schema';
import { type ResolvedWordTarget, resolveWordTarget } from '../eval/deterministic-metrics';
import { type BriefUpdateOp, type ChangeOp } from './change-set';
import { loadStagedPlan } from './staged-plan';

type DiagnosticScene = Pick<BriefScene, 'pov' | 'estimatedWords'>;

interface Learn {
  entityKey: string;
  factKey: string;
}

export interface PoolingInput {
  scenes: readonly DiagnosticScene[];
  /** What each scene point of view knows entering the chapter. */
  knownByPov: ReadonlyMap<string, ReadonlySet<string>>;
  learns: readonly Learn[];
  /** Only these facts are still secrets the pooled writer could leak; a rule or a fact the reader was already shown is not. */
  secrets: ReadonlySet<string>;
  names: ReadonlyMap<string, string>;
}

type SecretFact = Pick<Knowledge.CanonFact, 'factKey' | 'revealChapter' | 'unlock' | 'source' | 'disclosedInChapter'>;

export type PlanDiagnostic = Refinement.Diagnostic;
type DiagnosticPov = Refinement.DiagnosticPov;
type DiagnosticFact = Refinement.DiagnosticFact;

const LISTED_SECRETS = 5;
const POOLING_ADVICE = 'the writer will have it for the whole chapter — split into two chapters, or keep it (a clue check will run)';
const KEEP = 'keep it if that is what you intend';

function sceneList(indexes: readonly number[]): string {
  const numbers = indexes.map(index => String(index + 1));
  if (numbers.length === 1) return `scene ${numbers[0]}`;
  return `scenes ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A finding names a secret by its title alone: its truth never reaches a message the card shows beside the plan. */
function titled(factKey: string): string {
  return `"${secretTitle({ factKey })}"`;
}

function listSecrets(factKeys: readonly string[]): string {
  const listed = factKeys.slice(0, LISTED_SECRETS).map(titled);
  const more = factKeys.length - listed.length;
  return more > 0 ? `${listed.join(', ')} (+${more} more)` : listed.join(', ');
}

/** A secret the reader has not been shown yet, and not a rule the whole book obeys openly. */
export function isPlanSecret(fact: SecretFact, chapter: number): boolean {
  if (!fact.unlock && (fact.source === 'seed' || isOpenCanon(fact.revealChapter))) return false;
  return fact.disclosedInChapter === null || fact.disclosedInChapter >= chapter;
}

/**
 * The writer's knowledge is pooled across the chapter's points of view (§4.4): a secret one scene's point of view knows, or learns on the
 * page, and another's does not reaches every scene. Diagnostics for the author, never a block.
 */
export function findPoolingDiagnostics(input: PoolingInput): PlanDiagnostic[] {
  const { scenes } = input;
  const povs = [...new Set(scenes.flatMap(scene => (scene.pov ? [scene.pov] : [])))];
  const firstScene = (pov: string): number => scenes.findIndex(scene => scene.pov === pov);
  const povLearns = input.learns.filter(learn => povs.includes(learn.entityKey) && input.secrets.has(learn.factKey));
  const knows = new Map(povs.map(pov => [pov, new Set([...(input.knownByPov.get(pov) ?? []), ...povLearns.filter(l => l.entityKey === pov).map(l => l.factKey)])]));

  const grouped = new Map<string, string[]>();
  const pooled = povs.length < 2 ? [] : [...new Set(povs.flatMap(pov => [...(knows.get(pov) ?? [])]))].filter(key => input.secrets.has(key)).sort();
  for (const factKey of pooled) {
    const knowers = povs.filter(pov => knows.get(pov)?.has(factKey));
    if (knowers.length === povs.length) continue;
    grouped.set(knowers.join('|'), [...(grouped.get(knowers.join('|')) ?? []), factKey]);
  }
  const label = (pov: string): string => input.names.get(pov) ?? pov;
  const pov = (entityKey: string): DiagnosticPov => ({ entityKey, name: label(entityKey) });
  const fact = (factKey: string): DiagnosticFact => ({ factKey, label: secretTitle({ factKey }) });
  const pooling = [...grouped].map(([signature, factKeys]): PlanDiagnostic => {
    const knowers = new Set(signature.split('|'));
    const knowing = scenes.flatMap((scene, index) => (scene.pov && knowers.has(scene.pov) ? [index] : []));
    const unaware = scenes.flatMap((scene, index) => (scene.pov && !knowers.has(scene.pov) ? [index] : []));
    const unawareKeys = [...new Set(unaware.map(index => scenes[index]?.pov as string))];
    const verb = unaware.length > 1 ? 'do not' : 'does not';
    const knowerNames = [...knowers].map(label).join(', ');
    const message = `${capitalise(sceneList(knowing))}'s point of view (${knowerNames}) knows ${listSecrets(factKeys)}, which ${sceneList(unaware)} (${unawareKeys.map(label).join(', ')}) ${verb}; ${POOLING_ADVICE}.`;
    const data = { knowing: [...knowers].map(pov), unaware: unawareKeys.map(pov), facts: factKeys.map(fact), knowingScenes: knowing, unawareScenes: unaware };
    return { kind: 'pooling', message, data };
  });
  const learned = povLearns
    .filter(learn => firstScene(learn.entityKey) > 0)
    .map((learn): PlanDiagnostic => {
      const scene = firstScene(learn.entityKey);
      const secret = fact(learn.factKey);
      const message = `${titled(learn.factKey)} is learned in scene ${scene + 1} — it must not colour earlier scenes; the writer has it for the whole chapter (a clue check will run).`;
      const earlier = scenes.slice(0, scene).map((_, index) => index);
      const unawareKeys = [...new Set(scenes.slice(0, scene).flatMap(candidate => (candidate.pov ? [candidate.pov] : [])))];
      const data = { knowing: [pov(learn.entityKey)], unaware: unawareKeys.map(pov), facts: [secret], knowingScenes: [scene], unawareScenes: earlier, learnedInScene: scene };
      return { kind: 'pooling', message, data };
    });
  return [...pooling, ...learned];
}

/** Density is the author's call: these read as advice beside the card, and the plan stages whatever they say. */
export function densityFindings(scenes: readonly DiagnosticScene[], densityRisk: string | null | undefined, target: ResolvedWordTarget): PlanDiagnostic[] {
  return densityMessages(scenes, densityRisk, target).map(message => ({ kind: 'density', message }));
}

function densityMessages(scenes: readonly DiagnosticScene[], densityRisk: string | null | undefined, target: ResolvedWordTarget): string[] {
  if (densityRisk?.trim()) return [`Density: ${densityRisk.trim()} — ${KEEP}.`];
  const findings: string[] = [];
  const minScenes = minScenesFor(target);
  if (scenes.length < minScenes) findings.push(`Density: ${scenes.length} scene(s) for a ${target.min}–${target.max} word chapter, which usually takes ${minScenes} — ${KEEP}.`);
  if (scenes.some(scene => !scene.estimatedWords)) return findings;
  const words = scenes.reduce((sum, scene) => sum + (scene.estimatedWords ?? 0), 0);
  if (words < target.min) findings.push(`Density: the scenes come to about ${words} words, under the ${target.min}-word target — ${KEEP}.`);
  if (words > target.max) findings.push(`Density: the scenes come to about ${words} words, over the ${target.max}-word target — ${KEEP}.`);
  return findings;
}

export function scenePovFindings(scenes: readonly DiagnosticScene[], characterKeys: ReadonlySet<string>): PlanDiagnostic[] {
  return scenes.flatMap((scene, index): PlanDiagnostic[] => {
    const data = { sceneIndex: index, pov: scene.pov ?? null };
    if (!scene.pov) return [{ kind: 'pov', message: `Scene ${index + 1} names no point of view — pick one on the card.`, data }];
    if (characterKeys.has(scene.pov)) return [];
    return [{ kind: 'pov', message: `Scene ${index + 1}'s point of view "${scene.pov}" is not a character in the Story Bible — pick one on the card.`, data }];
  });
}

interface SceneField {
  sceneIndex: number;
  field: string;
  beatIndex?: number;
}

const SCENE_FIELD = /^scenes\[(\d+)\]\.(\w+)(?:\[(\d+)\])?$/;

function parseSceneField(path: string): SceneField | null {
  const match = SCENE_FIELD.exec(path);
  if (!match) return null;
  const sceneField = { sceneIndex: Number(match[1]), field: match[2] as string };
  return match[3] === undefined ? sceneField : { ...sceneField, beatIndex: Number(match[3]) };
}

function describeSceneField(path: string, parsed: SceneField | null): string {
  if (!parsed) return path;
  const part = parsed.beatIndex === undefined ? parsed.field : `beat ${parsed.beatIndex + 1}`;
  return `scene ${parsed.sceneIndex + 1}'s ${part}`;
}

export function giveAwayFindings(violations: readonly RevealViolation[]): PlanDiagnostic[] {
  return violations.map(violation => {
    const parsed = parseSceneField(violation.field);
    const message = `Give-away: ${describeSceneField(violation.field, parsed)} names a term of ${titled(violation.factKey)}, which is still locked here — reword it before the writer reads it.`;
    const data = { factKey: violation.factKey, label: secretTitle(violation), ...(parsed ?? { sceneIndex: null, field: violation.field }) };
    return { kind: 'give_away', message, data };
  });
}

type RevealFactRow = Parameters<typeof scheduledReveals>[0][number];

/** A scene edited on the card may name a secret the chapter cannot reveal yet, judged with the claims the card itself makes. */
async function sceneGiveAways(db: Pick<DbExecutor, 'query'>, projectId: bigint, op: BriefUpdateOp, facts: readonly RevealFactRow[]): Promise<RevealViolation[]> {
  const state = await loadPlanState(db, projectId);
  const plan = await loadStagedPlan(db, projectId, op);
  const ctx = planUnlockContext(plan, state);
  const reveals = scheduledReveals(facts, unlock => evaluateUnlock(unlock, ctx).holds).filter(reveal => isRevealLocked(reveal, op.chapter));
  return findBriefRevealViolations([{ chapter: op.chapter, scenes: op.scenes ?? [] }], reveals);
}

/** The plan card's diagnostics, read from the card as it stands, so an edit to its scenes is judged again. An empty plan has none. */
export async function loadPlanDiagnostics(db: Pick<DbExecutor, 'query'>, projectId: bigint, op: BriefUpdateOp): Promise<PlanDiagnostic[]> {
  const scenes = op.scenes ?? [];
  if (scenes.length === 0) return [];
  const povs = [...new Set(scenes.flatMap(scene => (scene.pov ? [scene.pov] : [])))];
  const characters = await db.query.entities.findMany({
    columns: { id: true, entityKey: true, name: true },
    where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.type, 'character')),
  });
  const facts = await db.query.canonFacts.findMany({
    columns: { id: true, factKey: true, text: true, revealChapter: true, unlock: true, source: true, disclosedInChapter: true, terms: true, writerNote: true },
    where: eq(schema.canonFacts.projectId, projectId),
  });
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  const povEntities = characters.filter(character => povs.includes(character.entityKey));
  const ledger =
    povEntities.length < 2
      ? []
      : await db.query.characterKnowledge.findMany({
          columns: { factId: true, entityId: true },
          where: and(
            eq(schema.characterKnowledge.projectId, projectId),
            inArray(
              schema.characterKnowledge.entityId,
              povEntities.map(entity => entity.id),
            ),
            lt(schema.characterKnowledge.learnedInChapter, op.chapter),
          ),
        });
  const keyByFactId = new Map(facts.map(fact => [fact.id, fact.factKey]));
  const knownByPov = new Map(
    povEntities.map(entity => [entity.entityKey, new Set(ledger.flatMap(row => (row.entityId === entity.id ? [keyByFactId.get(row.factId) ?? ''] : [])).filter(Boolean))]),
  );
  const pooling = findPoolingDiagnostics({
    scenes,
    knownByPov,
    learns: parseKnowledgeContract(op.knowledgeContract)?.learns ?? [],
    secrets: new Set(facts.filter(fact => isPlanSecret(fact, op.chapter)).map(fact => fact.factKey)),
    names: new Map(characters.map(character => [character.entityKey, character.name])),
  });
  const characterKeys = new Set(characters.map(character => character.entityKey));
  const giveAways = giveAwayFindings(await sceneGiveAways(db, projectId, op, facts as RevealFactRow[]));
  return [...giveAways, ...scenePovFindings(scenes, characterKeys), ...pooling, ...densityFindings(scenes, op.densityRisk, resolveWordTarget(project))];
}

export async function planCardDiagnostics(db: Pick<DbExecutor, 'query'>, projectId: bigint, ops: readonly ChangeOp[]): Promise<PlanDiagnostic[]> {
  const plans = ops.filter((op): op is BriefUpdateOp & ChangeOp => op.op === 'brief.update');
  const diagnostics: PlanDiagnostic[] = [];
  for (const op of plans) diagnostics.push(...(await loadPlanDiagnostics(db, projectId, op)));
  return diagnostics;
}

/** The proposal's diagnostics in warning order: the warnings no plan check typed, as `other`, then the plan card's own findings. */
export function proposalDiagnostics(others: readonly string[], plan: readonly PlanDiagnostic[]): PlanDiagnostic[] {
  return [...others.map((message): PlanDiagnostic => ({ kind: 'other', message })), ...plan];
}
