import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  assertSafeOutDir,
  type BibleRecord,
  captureBible,
  type ChangeOp,
  cleanup,
  errorMessage,
  EvalError,
  FIXTURES_DIR,
  formatRate,
  type GoldFact,
  type GoldTiming,
  loadGold,
  matches,
  normalise,
  NOTES_OPENER,
  type NotesGold,
  paragraphs,
  type Proposal,
  runSuite,
  stringFlag,
  stringsIn,
  type SuiteContext,
  type SuiteVerdict,
  table,
  wordCount,
} from './lib/index.ts';

interface FactScore {
  id: string;
  critical: boolean;
  inBibleAuto: boolean;
  inBibleFinal: boolean;
  onCard: boolean;
  notUsedYet: boolean;
  landed: boolean;
}

interface TimingScore {
  id: string;
  critical: boolean;
  placed: boolean;
  violation: string | null;
}

interface RunScore {
  input: string;
  owner: boolean;
  run: number;
  path: 'organise' | 'first_turn';
  organiseOffered: boolean;
  facts: FactScore[];
  explicitLanded: number;
  explicitTotal: number;
  criticalMissing: string[];
  inventedAutoApplied: string[];
  possibleInventions: string[];
  undecidedViolations: string[];
  supersededAutoApplied: string[];
  timing: TimingScore[];
  passed: boolean;
  error?: string;
}

interface InputSpec {
  id: string;
  owner: boolean;
  notes: string;
  gold: NotesGold;
}

const USAGE = `Usage: bun scripts/evals/novel-forge/c2-notes-fidelity.ts [flags]

(c2) Notes fidelity: creates a novel from notes the way the web does, sends the web's first turn, accepts the Organise card when
offered, then scores the Story Bible against gold facts, decisions and timing written before the run. Default --runs 3.

  --inputs <ids>        comma-separated invented inputs (default: vague-idea,long-notes,conflicting-versions); "none" for owner only
  --owner-notes <path>  the owner's notes, read at runtime only (env NF_EVAL_OWNER_NOTES)
  --owner-gold <path>   gold for the owner's notes (default: <out>/owner-gold.json — the owner writes it; the script only reads it)

Thresholds per run: >=95% of explicit facts and decisions land in the Bible or "Not used yet", 100% of critical ones, zero
invented content auto-applied, zero later events placed earlier. The owner's run prints counts only; every detail stays in --out.`;

const INVENTED_INPUTS = ['vague-idea', 'long-notes', 'conflicting-versions'];
const ORGANISE_MIN_WORDS = 600;
const EXPLICIT_THRESHOLD = 0.95;
const UNDECIDED_WORDING = /\b(undecided|not decided|not yet decided|open|unknown|tbd|to be decided|leave it open|not sure)\b/;
const PROPER_NOUN = /\b[A-Z][a-z]{2,}(?:[- ][A-Z][a-z]{2,})*\b/g;
const SENTENCE_START_WORDS = new Set([
  'The',
  'This',
  'That',
  'Her',
  'His',
  'Their',
  'She',
  'They',
  'When',
  'After',
  'Before',
  'Every',
  'Each',
  'What',
  'Chapter',
  'Volume',
  'Book',
]);

/** A gold entry its own notes cannot satisfy would score as a Forge miss; it is a gold bug and must be fixed before a run means anything. */
function unmatchedGold(input: InputSpec): string[] {
  return [...input.gold.facts, ...input.gold.decisions].filter(entry => !matches(input.notes, entry.match)).map(entry => entry.id);
}

function loadInputs(context: SuiteContext): InputSpec[] {
  const requested = stringFlag(context.flags, 'inputs') ?? INVENTED_INPUTS.join(',');
  const ids = requested === 'none' ? [] : requested.split(',').map(id => id.trim());
  const invented = ids.map(id => {
    if (!INVENTED_INPUTS.includes(id)) throw new EvalError(`Unknown input "${id}" — choose from ${INVENTED_INPUTS.join(', ')}`);
    const gold = loadGold(path.join(FIXTURES_DIR, 'notes', `${id}.gold.json`));
    return { id, owner: false, gold, notes: readFileSync(path.join(FIXTURES_DIR, 'notes', gold.notesFile ?? `${id}.md`), 'utf-8') };
  });
  const ownerNotes = stringFlag(context.flags, 'owner-notes', 'NF_EVAL_OWNER_NOTES');
  if (!ownerNotes) return invented;
  const goldPath = assertSafeOutDir(stringFlag(context.flags, 'owner-gold') ?? path.join(context.sink.outDir, 'owner-gold.json'));
  if (!existsSync(ownerNotes)) throw new EvalError(`--owner-notes: no file at the given path`);
  if (!existsSync(goldPath)) throw new EvalError(`The owner's gold file is missing: write it to ${goldPath} before running (see the README for its format)`);
  return [...invented, { id: 'owner', owner: true, gold: loadGold(goldPath), notes: readFileSync(ownerNotes, 'utf-8') }];
}

function textOf(ops: readonly ChangeOp[]): string {
  return ops.flatMap(op => stringsIn(op)).join('\n');
}

function inAny(records: readonly { text: string }[], spec: GoldFact['match']): boolean {
  return records.some(record => matches(record.text, spec));
}

/** Timing is judged where Forge places events in order: volumes by ordinal, then the lines of any timeline page. */
function scoreTiming(timing: GoldTiming, records: readonly BibleRecord[]): TimingScore {
  const volumes = records.filter(record => record.kind === 'volume').sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const timeline = records.filter(record => /timeline/i.test(record.ref)).flatMap(record => record.text.split(/\n+/).filter(line => line.trim()));
  const volumeHit = volumes.find(volume => matches(volume.text, timing.event));
  const eventLine = timeline.findIndex(line => matches(line, timing.event));
  const placed = volumeHit !== undefined || eventLine >= 0;
  const score = { id: timing.id, critical: timing.critical, placed };
  if (timing.earliestVolume !== undefined && volumeHit?.ordinal !== undefined && volumeHit.ordinal < timing.earliestVolume)
    return { ...score, violation: `placed in volume ${volumeHit.ordinal}, earliest allowed ${timing.earliestVolume}` };
  if (timing.after && eventLine >= 0) {
    const afterLine = timeline.findIndex(line => matches(line, timing.after ?? {}));
    if (afterLine > eventLine) return { ...score, violation: `timeline places it at line ${eventLine + 1}, before the event it must follow (line ${afterLine + 1})` };
  }
  if (timing.notInOpening && timeline.length >= 3 && eventLine === 0) return { ...score, violation: 'timeline places it first, in the opening' };
  return { ...score, violation: null };
}

function forbiddenHits(gold: NotesGold, appliedText: string): string[] {
  const normalised = normalise(appliedText);
  return gold.forbidden.filter(entry => matches(appliedText, entry.match) && !(entry.unlessAlso ?? []).some(term => normalised.includes(normalise(term)))).map(entry => entry.id);
}

function possibleInventions(appliedText: string, notes: string): string[] {
  const known = normalise(notes);
  const names = new Set([...appliedText.matchAll(PROPER_NOUN)].map(match => match[0]).filter(name => !SENTENCE_START_WORDS.has(name)));
  return [...names].filter(name => !known.includes(normalise(name))).slice(0, 25);
}

/** Only the ending has a field Forge can fill; other undecided choices are left to the owner's read of the summary. */
function undecidedViolations(gold: NotesGold, autoRecords: readonly BibleRecord[]): string[] {
  const ending = autoRecords.find(record => record.ref === 'premise:ending');
  if (!ending || UNDECIDED_WORDING.test(normalise(ending.text))) return [];
  const aboutEnding = (decision: GoldFact): boolean => [...(decision.match.all ?? []), ...(decision.match.any ?? [])].some(term => /^end/.test(term));
  return gold.decisions.filter(decision => decision.undecided && aboutEnding(decision)).map(decision => decision.id);
}

async function contentOps(context: SuiteContext, projectId: string, proposalId: string | undefined): Promise<Proposal | undefined> {
  return proposalId ? context.api.getProposal(projectId, proposalId) : undefined;
}

async function scoreRun(context: SuiteContext, input: InputSpec, run: number): Promise<RunScore> {
  const author = context.author(`c2-${input.owner ? 'owner' : input.id}-run-${run}`);
  const organises = wordCount(input.notes) >= ORGANISE_MIN_WORDS;
  const { projectId, sessionId } = await context.api.createNovel(`[eval c2 ${input.owner ? 'owner' : input.id} run ${run}] ${input.gold.title}`, input.notes);
  try {
    if (context.tier) await context.api.updateProject(projectId, { costTier: context.tier });
    let applied: Proposal | undefined;
    let card: Proposal | undefined;
    let receipt: Record<string, unknown> | undefined;
    let organiseOffered = false;
    if (organises) {
      const outcome = await author.organise(projectId, sessionId);
      organiseOffered = outcome.offered;
      applied = await contentOps(context, projectId, outcome.appliedProposalId);
      card = await contentOps(context, projectId, outcome.cardProposalId);
      receipt = outcome.receipt;
    } else {
      const trace = await author.turn(projectId, sessionId, NOTES_OPENER);
      applied = trace.result.appliedProposal;
      card = trace.result.proposal;
    }
    const autoRecords = await captureBible(context.api, projectId);
    const cardOps = (card?.changeSet ?? []).map((op, index) => ({ op, index })).filter(entry => !entry.op.op.startsWith('action.'));
    if (card && cardOps.length > 0)
      await context.api.applyProposal(
        projectId,
        card.id,
        cardOps.map(entry => entry.index),
      );
    const finalRecords = await captureBible(context.api, projectId);

    const notesParagraphs = paragraphs(input.notes);
    const unused = Array.isArray(receipt?.['unusedParagraphs']) ? (receipt['unusedParagraphs'] as number[]) : [];
    const notUsedYet = unused.flatMap(number => (notesParagraphs[number - 1] ? [{ text: notesParagraphs[number - 1] ?? '' }] : []));
    const cardText = [{ text: textOf(cardOps.map(entry => entry.op)) }];
    const scored = [...input.gold.facts, ...input.gold.decisions.filter(decision => !decision.undecided)];
    const facts = scored.map((fact): FactScore => {
      const inBibleFinal = inAny(finalRecords, fact.match);
      const notUsed = inAny(notUsedYet, fact.match);
      return {
        id: fact.id,
        critical: fact.critical,
        inBibleAuto: inAny(autoRecords, fact.match),
        inBibleFinal,
        onCard: inAny(cardText, fact.match),
        notUsedYet: notUsed,
        landed: inBibleFinal || notUsed,
      };
    });

    const appliedText = textOf(applied?.changeSet ?? []);
    const receiptApplied = Array.isArray(receipt?.['applied']) ? (receipt['applied'] as { label?: string; ref?: string }[]) : [];
    const inventedAutoApplied = receiptApplied.filter(entry => entry.label !== undefined && entry.label !== 'from_notes').map(entry => `${entry.ref ?? '?'} (${entry.label})`);
    const timing = input.gold.timing.map(entry => scoreTiming(entry, finalRecords));
    const explicitLanded = facts.filter(fact => fact.landed).length;
    const criticalMissing = facts.filter(fact => fact.critical && !fact.landed).map(fact => fact.id);
    const superseded = forbiddenHits(input.gold, appliedText);
    const undecided = undecidedViolations(input.gold, autoRecords);
    const passed =
      facts.length > 0 &&
      explicitLanded / facts.length >= EXPLICIT_THRESHOLD &&
      criticalMissing.length === 0 &&
      inventedAutoApplied.length === 0 &&
      superseded.length === 0 &&
      undecided.length === 0 &&
      timing.every(entry => entry.violation === null);
    return {
      input: input.owner ? 'owner' : input.id,
      owner: input.owner,
      run,
      path: organises ? 'organise' : 'first_turn',
      organiseOffered,
      facts,
      explicitLanded,
      explicitTotal: facts.length,
      criticalMissing,
      inventedAutoApplied,
      possibleInventions: possibleInventions(appliedText, input.notes),
      undecidedViolations: undecided,
      supersededAutoApplied: superseded,
      timing,
      passed,
    };
  } finally {
    await cleanup(context, projectId);
  }
}

function failedRun(input: InputSpec, run: number, error: unknown): RunScore {
  return {
    input: input.owner ? 'owner' : input.id,
    owner: input.owner,
    run,
    path: wordCount(input.notes) >= ORGANISE_MIN_WORDS ? 'organise' : 'first_turn',
    organiseOffered: false,
    facts: [],
    explicitLanded: 0,
    explicitTotal: 0,
    criticalMissing: [],
    inventedAutoApplied: [],
    possibleInventions: [],
    undecidedViolations: [],
    supersededAutoApplied: [],
    timing: [],
    passed: false,
    error: input.owner ? 'run failed (detail withheld for the owner input; see the server logs)' : errorMessage(error),
  };
}

function summary(scores: readonly RunScore[], passed: boolean): string {
  const byInput = [...new Set(scores.map(score => score.input))];
  const lines = [
    '# (c2) Notes fidelity',
    '',
    `**${passed ? 'PASS' : 'FAIL'}** — ${scores.filter(score => score.passed).length}/${scores.length} runs met every threshold.`,
    '',
    '"Landed" means found in the Story Bible after the author accepted the Organise card (or the first turn\'s cards), or in a paragraph Organise reported as "Not used yet". Runs of one input are correlated; read the per-input distribution, not a pooled rate.',
    '',
    table(
      ['input', 'run', 'path', 'explicit landed', 'critical missing', 'invented auto-applied', 'superseded auto-applied', 'undecided decided', 'timing violations', 'pass'],
      scores.map(score => [
        score.input,
        score.run,
        score.error ? `error: ${score.error}` : score.path + (score.path === 'organise' && !score.organiseOffered ? ' (not offered)' : ''),
        formatRate(score.explicitLanded, score.explicitTotal),
        score.criticalMissing.join(', ') || '—',
        score.inventedAutoApplied.length,
        score.supersededAutoApplied.join(', ') || '—',
        score.undecidedViolations.join(', ') || '—',
        score.timing
          .filter(entry => entry.violation)
          .map(entry => entry.id)
          .join(', ') || '—',
        score.passed ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Per input',
    '',
    table(
      ['input', 'runs', 'explicit landed per run', 'auto-applied share per run'],
      byInput.map(input => {
        const runs = scores.filter(score => score.input === input && !score.error);
        return [
          input,
          runs.length,
          runs.map(score => formatRate(score.explicitLanded, score.explicitTotal)).join(' · ') || '—',
          runs.map(score => formatRate(score.facts.filter(fact => fact.inBibleAuto).length, score.facts.length)).join(' · ') || '—',
        ];
      }),
    ),
    '',
    '## Missed facts',
    '',
    table(
      ['input', 'run', 'fact', 'critical', 'on the card', 'auto-applied'],
      scores.flatMap(score =>
        score.facts
          .filter(fact => !fact.landed)
          .map(fact => [score.input, score.run, fact.id, fact.critical ? 'yes' : '', fact.onCard ? 'yes' : '', fact.inBibleAuto ? 'yes' : '']),
      ),
    ),
    '',
    '## Possible inventions (not gated — capitalised names in auto-applied text that the notes never use; review by hand)',
    '',
    ...scores.filter(score => score.possibleInventions.length > 0).map(score => `- ${score.input} run ${score.run}: ${score.possibleInventions.join(', ')}`),
  ];
  return lines.join('\n');
}

async function run(context: SuiteContext): Promise<SuiteVerdict> {
  const inputs = loadInputs(context);
  if (inputs.length === 0) throw new EvalError('No inputs selected');
  for (const input of inputs) {
    const unmatched = unmatchedGold(input);
    if (unmatched.length === 0) continue;
    if (input.owner) throw new EvalError(`${unmatched.length} gold entr(ies) in the owner's gold file match nothing in the owner's notes — fix their terms first`);
    throw new EvalError(`Gold for ${input.id} does not match its own notes: ${unmatched.join(', ')}`);
  }
  const scores: RunScore[] = [];
  for (const input of inputs) {
    for (let run = 1; run <= context.runs; run += 1) {
      try {
        scores.push(await scoreRun(context, input, run));
      } catch (error) {
        scores.push(failedRun(input, run, error));
      }
    }
  }
  const passed = scores.every(score => score.passed);
  context.sink.writeResult(
    { suite: 'c2-notes-fidelity', target: context.api.target, dryRun: context.dryRun, runs: context.runs, tier: context.tier, passed, scores },
    summary(scores, passed),
  );
  return { passed, headline: `${scores.filter(score => score.passed).length}/${scores.length} runs met every threshold across ${inputs.length} input(s)` };
}

await runSuite({ name: 'c2-notes-fidelity', usage: USAGE, defaultRuns: 3, run });
