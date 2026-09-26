import { and, eq, inArray, lt } from 'drizzle-orm';

import { evaluateUnlock, isOpenCanon, loadPlanState, nearestVolumeKey, parseKnowledgeContract, planUnlockContext } from '@server/common';
import { type BriefScene, type DbExecutor, type Knowledge, schema } from '@server/database';

import { clipAtBoundary } from '../ai/context/bible-docs';
import { findBriefRevealViolations, isRevealLocked, type RevealViolation, scheduledReveals } from '../ai/context/canon-guard';
import { minScenesFor } from '../ai/schemas/outline.schema';
import { type ResolvedWordTarget, resolveWordTarget } from '../eval/deterministic-metrics';
import { type BriefUpdateOp, type ChangeOp } from './change-set';

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
  labels: ReadonlyMap<string, string>;
  names: ReadonlyMap<string, string>;
}

type SecretFact = Pick<Knowledge.CanonFact, 'factKey' | 'revealChapter' | 'unlock' | 'source' | 'disclosedInChapter'>;

const LISTED_SECRETS = 5;
const LABEL_CHARS = 60;
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

function listSecrets(factKeys: readonly string[], labels: ReadonlyMap<string, string>): string {
  const listed = factKeys.slice(0, LISTED_SECRETS).map(key => `"${labels.get(key) ?? key}"`);
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
export function findPoolingWarnings(input: PoolingInput): string[] {
  const { scenes, labels } = input;
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
  const pooling = [...grouped].map(([signature, factKeys]) => {
    const knowers = new Set(signature.split('|'));
    const knowing = scenes.flatMap((scene, index) => (scene.pov && knowers.has(scene.pov) ? [index] : []));
    const unaware = scenes.flatMap((scene, index) => (scene.pov && !knowers.has(scene.pov) ? [index] : []));
    const unawareNames = [...new Set(unaware.map(index => scenes[index]?.pov as string))].map(label).join(', ');
    const verb = unaware.length > 1 ? 'do not' : 'does not';
    const knowerNames = [...knowers].map(label).join(', ');
    return `${capitalise(sceneList(knowing))}'s point of view (${knowerNames}) knows ${listSecrets(factKeys, labels)}, which ${sceneList(unaware)} (${unawareNames}) ${verb}; ${POOLING_ADVICE}.`;
  });
  const learned = povLearns
    .filter(learn => firstScene(learn.entityKey) > 0)
    .map(learn => {
      const secret = `"${labels.get(learn.factKey) ?? learn.factKey}"`;
      return `${secret} is learned in scene ${firstScene(learn.entityKey) + 1} — it must not colour earlier scenes; the writer has it for the whole chapter (a clue check will run).`;
    });
  return [...pooling, ...learned];
}

/** Density is the author's call: these read as advice beside the card, and the plan stages whatever they say. */
export function densityFindings(scenes: readonly DiagnosticScene[], densityRisk: string | null | undefined, target: ResolvedWordTarget): string[] {
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

export function scenePovFindings(scenes: readonly DiagnosticScene[], characterKeys: ReadonlySet<string>): string[] {
  return scenes.flatMap((scene, index) => {
    if (!scene.pov) return [`Scene ${index + 1} names no point of view — pick one on the card.`];
    return characterKeys.has(scene.pov) ? [] : [`Scene ${index + 1}'s point of view "${scene.pov}" is not a character in the Story Bible — pick one on the card.`];
  });
}

function sceneField(field: string): string {
  const match = /^scenes\[(\d+)\]\.(\w+)(?:\[(\d+)\])?$/.exec(field);
  if (!match) return field;
  const part = match[3] === undefined ? match[2] : `beat ${Number(match[3]) + 1}`;
  return `scene ${Number(match[1]) + 1}'s ${part}`;
}

export function giveAwayFindings(violations: readonly RevealViolation[], labels: ReadonlyMap<string, string>): string[] {
  return violations.map(
    violation =>
      `Give-away: ${sceneField(violation.field)} names a term of "${labels.get(violation.factKey) ?? violation.factKey}", which is still locked here — reword it before the writer reads it.`,
  );
}

type RevealFactRow = Parameters<typeof scheduledReveals>[0][number];

/** A scene edited on the card may name a secret the chapter cannot reveal yet, judged with the claims the card itself makes. */
async function sceneGiveAways(db: Pick<DbExecutor, 'query'>, projectId: bigint, op: BriefUpdateOp, facts: readonly RevealFactRow[]): Promise<RevealViolation[]> {
  const [state, existing] = await Promise.all([
    loadPlanState(db, projectId),
    db.query.briefs.findFirst({
      columns: { volumeKey: true, isEnding: true, claimedMilestones: true },
      where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, op.chapter)),
    }),
  ]);
  const volumeKey = op.volumeKey !== undefined ? op.volumeKey : (existing?.volumeKey ?? (await nearestVolumeKey(db, projectId, op.chapter)));
  const claimedMilestones = op.claimedMilestones !== undefined ? op.claimedMilestones : (existing?.claimedMilestones ?? []);
  const ctx = planUnlockContext({ chapter: op.chapter, volumeKey, isEnding: op.isEnding ?? existing?.isEnding ?? false, claimedMilestones }, state);
  const reveals = scheduledReveals(facts, unlock => evaluateUnlock(unlock, ctx).holds).filter(reveal => isRevealLocked(reveal, op.chapter));
  return findBriefRevealViolations([{ chapter: op.chapter, scenes: op.scenes ?? [] }], reveals);
}

/** The plan card's diagnostics, read from the card as it stands, so an edit to its scenes is judged again. An empty plan has none. */
export async function loadPlanDiagnostics(db: Pick<DbExecutor, 'query'>, projectId: bigint, op: BriefUpdateOp): Promise<string[]> {
  const scenes = op.scenes ?? [];
  if (scenes.length === 0) return [];
  const povs = [...new Set(scenes.flatMap(scene => (scene.pov ? [scene.pov] : [])))];
  const [characters, facts, project] = await Promise.all([
    db.query.entities.findMany({
      columns: { id: true, entityKey: true, name: true },
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.type, 'character')),
    }),
    db.query.canonFacts.findMany({
      columns: { id: true, factKey: true, text: true, revealChapter: true, unlock: true, source: true, disclosedInChapter: true, terms: true, writerNote: true },
      where: eq(schema.canonFacts.projectId, projectId),
    }),
    db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
  ]);
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
  const labels = new Map(facts.map(fact => [fact.factKey, clipAtBoundary(fact.text, LABEL_CHARS)]));
  const pooling = findPoolingWarnings({
    scenes,
    knownByPov,
    learns: parseKnowledgeContract(op.knowledgeContract)?.learns ?? [],
    secrets: new Set(facts.filter(fact => isPlanSecret(fact, op.chapter)).map(fact => fact.factKey)),
    labels,
    names: new Map(characters.map(character => [character.entityKey, character.name])),
  });
  const characterKeys = new Set(characters.map(character => character.entityKey));
  const giveAways = giveAwayFindings(await sceneGiveAways(db, projectId, op, facts as RevealFactRow[]), labels);
  return [...giveAways, ...scenePovFindings(scenes, characterKeys), ...pooling, ...densityFindings(scenes, op.densityRisk, resolveWordTarget(project))];
}

export async function planCardDiagnostics(db: Pick<DbExecutor, 'query'>, projectId: bigint, ops: readonly ChangeOp[]): Promise<string[]> {
  const plans = ops.filter((op): op is BriefUpdateOp & ChangeOp => op.op === 'brief.update');
  return (await Promise.all(plans.map(op => loadPlanDiagnostics(db, projectId, op)))).flat();
}
