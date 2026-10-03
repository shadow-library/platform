import { createHash } from 'node:crypto';

import { type ChapterReviewCompliance, type ChapterReviewFinding, type Review, type ReviewFindingCategory, type ReviewFindingSeverity } from '@server/database';

import { checkDraftMechanics } from '../ai/graphs/mechanical-check';
import { assessReadability, READABILITY_MIN_WORDS, READABILITY_PREFIX } from '../ai/graphs/readability-check';
import { type JudgeOutput } from '../ai/schemas/judge.schema';
import { type ProofreadKindValue } from '../ai/schemas/enums';
import { type ProofreadFinding, type ReviewOutput } from '../ai/schemas/review.schema';
import { type FactLike, KNOWLEDGE_LEAK_PREFIX, type KnowledgeLeakIssue } from '../bible/fact/knowledge-view';
import { countWords, type ResolvedWordTarget } from '../eval/deterministic-metrics';

export interface DraftFinding {
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  text: string;
  evidence?: string | null;
}

export interface ReviewOutcome {
  disposition: Review.Disposition;
  verdict: string | null;
  note: string | null;
  findings: ChapterReviewFinding[];
  checked: string[];
  briefCompliance: ChapterReviewCompliance | null;
  readabilityCompliance: ChapterReviewCompliance | null;
  endingCompliance: ChapterReviewCompliance | null;
  knowledgeCompliance: ChapterReviewCompliance | null;
  metrics: Record<string, number> | null;
}

export interface ReviewedText {
  draftRevision: number | null;
  bodyHash: string;
}

export interface JudgeEvidence {
  output: JudgeOutput | null;
  hasBrief: boolean;
  hasEndingContract: boolean;
  /** Facts the reader must not learn yet: nothing on the page may reveal or imply them. */
  lockedFromReader: FactLike[];
  /** Facts the reader may already know but the point-of-view cast does not: only the cast knowing or acting on them is a leak. */
  hiddenFromCast: FactLike[];
  leaks: KnowledgeLeakIssue[];
}

/** One pass of the generation graph's judge, as its state carries it: findings are prefixed by the check that raised them. */
export interface GraphJudgePass {
  verdict: string | null;
  findings: { severity: 'hard' | 'soft'; text: string }[];
}

type OutcomeBase = Omit<ReviewOutcome, 'disposition' | 'findings'>;

const QUOTED = /["“]([^"“”]{12,}?)["”]/g;
const ELLIPSIS = /^(?:…|\.{3})|(?:…|\.{3})$/g;
const MECHANICAL_PREFIX = /^mechanical:\s*/;
const PROOFREADING_MAX = 20;
const PROOFREAD_LABEL: Record<ProofreadKindValue, string> = {
  grammar: 'Grammar',
  spelling: 'Spelling',
  punctuation: 'Punctuation',
  tense: 'Tense slip',
  pov: 'Point-of-view slip',
  name: 'Name',
  reference: 'Unknown reference',
};

function comparable(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

export function hashReviewedBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

/** A review describes the text it read; any later revision or change to that text makes it stale. */
export function isReviewStale(review: ReviewedText, current: ReviewedText | null): boolean {
  if (!current) return true;
  return review.draftRevision !== current.draftRevision || review.bodyHash !== current.bodyHash;
}

export function findingFingerprint(kind: Review.Kind, category: ReviewFindingCategory, text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return createHash('sha256').update(`${kind}|${category}|${normalized}`).digest('hex').slice(0, 24);
}

/** Only a passage that is really in the prose counts as evidence; a quote the model invented is dropped rather than shown as proof. */
export function verifiedEvidence(body: string, candidates: (string | null | undefined)[]): string | null {
  const haystack = comparable(body);
  for (const candidate of candidates) {
    const quote = candidate?.trim().replace(ELLIPSIS, '').trim();
    if (quote && quote.length >= 3 && haystack.includes(comparable(quote))) return quote;
  }
  return null;
}

function quotesIn(text: string): string[] {
  return [...text.matchAll(QUOTED)].map(match => match[1] ?? '').filter(Boolean);
}

export function settleFindings(kind: Review.Kind, body: string, drafts: DraftFinding[]): ChapterReviewFinding[] {
  return drafts.map((draft, index) => ({
    id: `f${index + 1}`,
    severity: draft.severity,
    category: draft.category,
    text: draft.text,
    evidence: verifiedEvidence(body, [draft.evidence, ...quotesIn(draft.text)]),
    fingerprint: findingFingerprint(kind, draft.category, draft.text),
  }));
}

export function dispositionOf(findings: Pick<ChapterReviewFinding, 'severity'>[], failed = false): Review.Disposition {
  if (failed) return 'failed';
  if (findings.some(finding => finding.severity === 'blocking')) return 'blocking';
  return findings.length > 0 ? 'issues' : 'clear';
}

function outcome(kind: Review.Kind, body: string, base: OutcomeBase, drafts: DraftFinding[], failed = false): ReviewOutcome {
  const findings = settleFindings(kind, body, drafts);
  return { ...base, disposition: dispositionOf(findings, failed), findings };
}

function issuesAs(compliance: ChapterReviewCompliance | null | undefined, category: ReviewFindingCategory): DraftFinding[] {
  if (!compliance || compliance.compliant) return [];
  return compliance.issues.map(text => ({ severity: 'warning', category, text }));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function notAssessed(what: string): DraftFinding {
  return { severity: 'note', category: 'continuity', text: `${what} was not assessed — the judge left it out. Run the review again to check it.` };
}

/**
 * A leak of a secret is blocking, like a contradiction: it gates the next chapter until the author answers it. Plan and ending shortfalls stay
 * warnings, because a hand-writer may leave their plan on purpose.
 */
export function judgeOutcome(body: string, evidence: JudgeEvidence): ReviewOutcome {
  const { output, hasBrief, hasEndingContract, lockedFromReader, hiddenFromCast, leaks } = evidence;
  const secrets = lockedFromReader.length + hiddenFromCast.length;
  const briefCompliance = hasBrief ? (output?.briefCompliance ?? null) : null;
  const endingCompliance = hasEndingContract ? (output?.endingCompliance ?? null) : null;
  const readabilityCompliance = output?.readabilityCompliance ?? null;
  const judgedKnowledge = secrets > 0 ? (output?.knowledgeCompliance ?? null) : null;
  const judgedLeaks = judgedKnowledge && !judgedKnowledge.compliant ? judgedKnowledge.issues : [];
  const scannedLeaks = leaks.map(leak => `"${leak.term}" gives away [${leak.factKey}]`);
  const knowledgeCompliance = secrets > 0 ? { compliant: scannedLeaks.length === 0 && judgedLeaks.length === 0, issues: [...scannedLeaks, ...judgedLeaks] } : null;

  const assessed = {
    brief: hasBrief && Boolean(briefCompliance),
    ending: hasEndingContract && Boolean(endingCompliance),
    knowledge: secrets > 0 && Boolean(judgedKnowledge),
    readability: Boolean(readabilityCompliance),
  };
  const omitted: DraftFinding[] = output
    ? [
        ...(hasBrief && !assessed.brief ? [notAssessed('Plan compliance')] : []),
        ...(hasEndingContract && !assessed.ending ? [notAssessed('The ending contract')] : []),
        ...(secrets > 0 && !assessed.knowledge ? [notAssessed('Secret-keeping beyond give-away words')] : []),
        ...(!assessed.readability ? [notAssessed('Readability')] : []),
      ]
    : [];

  const drafts: DraftFinding[] = [
    ...(output?.findings ?? []).map(finding => ({ severity: finding.severity === 'hard' ? 'blocking' : 'warning', category: 'continuity', text: finding.text }) as const),
    ...(output ? [] : [{ severity: 'blocking', category: 'continuity', text: 'The judge’s answer could not be read, so nothing was checked — run the review again.' } as const]),
    ...issuesAs(endingCompliance, 'ending'),
    ...issuesAs(briefCompliance, 'brief'),
    ...leaks.map(
      leak => ({ severity: 'blocking', category: 'knowledge', text: `"${leak.term}" gives away [${leak.factKey}] before it is revealed`, evidence: leak.excerpt }) as const,
    ),
    ...judgedLeaks.map(text => ({ severity: 'blocking', category: 'knowledge', text }) as const),
    ...issuesAs(readabilityCompliance, 'readability'),
    ...omitted,
  ];

  const checked = output
    ? [
        'continuity with the Story Bible',
        ...(assessed.brief ? ['the chapter plan'] : []),
        ...(assessed.ending ? ['the ending contract'] : []),
        ...(lockedFromReader.length > 0 ? [`${plural(lockedFromReader.length, 'secret')} kept from the reader`] : []),
        ...(hiddenFromCast.length > 0 ? [`${plural(hiddenFromCast.length, 'fact')} the point-of-view cast does not know`] : []),
        ...(assessed.readability ? ['readability'] : []),
      ]
    : [];
  const base: OutcomeBase = {
    verdict: output?.verdict ?? 'evaluation_failed',
    note: null,
    checked,
    briefCompliance,
    readabilityCompliance,
    endingCompliance,
    knowledgeCompliance,
    metrics: null,
  };
  return outcome('judge', body, base, drafts, !output);
}

const GRAPH_CATEGORIES: [string, ReviewFindingCategory][] = [
  ['ending contract: ', 'ending'],
  ['brief: ', 'brief'],
  [KNOWLEDGE_LEAK_PREFIX, 'knowledge'],
  [READABILITY_PREFIX, 'readability'],
  ['mechanical: ', 'mechanics'],
];

function graphFinding(finding: GraphJudgePass['findings'][number]): DraftFinding {
  const [prefix, category] = GRAPH_CATEGORIES.find(([candidate]) => finding.text.startsWith(candidate)) ?? ['', 'continuity'];
  const text = finding.text.slice(prefix.length);
  if (category === 'knowledge') return { severity: 'blocking', category, text };
  if (category === 'continuity') return { severity: finding.severity === 'hard' ? 'blocking' : 'warning', category, text };
  if (category === 'mechanics') return { severity: finding.severity === 'hard' ? 'warning' : 'note', category, text };
  return { severity: 'warning', category, text };
}

/** The generation graph's last judge pass as a review; the graph assesses the plan and readability on every pass. */
export function graphJudgeOutcome(body: string, pass: GraphJudgePass): ReviewOutcome {
  const drafts = pass.findings.map(graphFinding);
  const issuesOf = (category: ReviewFindingCategory): ChapterReviewCompliance => {
    const issues = drafts.filter(draft => draft.category === category).map(draft => draft.text);
    return { compliant: issues.length === 0, issues };
  };
  const failed = pass.verdict === 'evaluation_failed';
  const base: OutcomeBase = {
    verdict: pass.verdict ?? 'evaluation_failed',
    note: null,
    checked: failed ? [] : ['continuity with the Story Bible', 'the chapter plan', 'mechanics', 'readability'],
    briefCompliance: issuesOf('brief'),
    readabilityCompliance: issuesOf('readability'),
    endingCompliance: null,
    knowledgeCompliance: null,
    metrics: null,
  };
  return outcome('judge', body, base, drafts, failed);
}

/** Proofreading only suggests, so a slip is never blocking; one whose quote is not in the prose, whose fix changes nothing, or that repeats is dropped. */
export function proofreadingFindings(body: string, slips: ProofreadFinding[]): DraftFinding[] {
  const seen = new Set<string>();
  const drafts: DraftFinding[] = [];
  for (const slip of slips) {
    const quote = slip.quote.trim();
    const fix = slip.fix.trim();
    const key = `${comparable(quote)}|${comparable(fix)}`;
    if (!fix || comparable(quote) === comparable(fix) || seen.has(key) || !verifiedEvidence(body, [quote])) continue;
    seen.add(key);
    const reason = slip.reason?.trim();
    drafts.push({ severity: 'warning', category: 'proofreading', text: `${PROOFREAD_LABEL[slip.kind]}: “${quote}” → “${fix}”${reason ? ` (${reason})` : ''}`, evidence: quote });
    if (drafts.length === PROOFREADING_MAX) break;
  }
  return drafts;
}

export function editorialOutcome(body: string, output: ReviewOutput, hasBrief: boolean): ReviewOutcome {
  const proofread = output.proofreading !== undefined;
  const drafts: DraftFinding[] = [
    ...(output.findings ?? []).map(
      finding => ({ severity: finding.severity === 'blocking' ? 'blocking' : 'note', category: 'editorial', text: finding.text, evidence: finding.evidence }) as const,
    ),
    ...proofreadingFindings(body, output.proofreading ?? []),
    ...(proofread
      ? []
      : [{ severity: 'note', category: 'proofreading', text: 'Proofreading was not assessed — the editor left it out. Run the review again to check it.' } as const]),
  ];
  const base: OutcomeBase = {
    verdict: output.disposition,
    note: output.note?.trim() || null,
    checked: [
      ...(hasBrief ? ['the chapter plan'] : []),
      'canon',
      'prose against the established style',
      ...(proofread ? ['grammar, spelling, punctuation, tense, point of view, names and references'] : []),
    ],
    briefCompliance: null,
    readabilityCompliance: null,
    endingCompliance: null,
    knowledgeCompliance: null,
    metrics: null,
  };
  return outcome('editorial', body, base, drafts);
}

export function mechanicsOutcome(body: string, priorBodies: string[], target: ResolvedWordTarget): ReviewOutcome {
  const drafts: DraftFinding[] = checkDraftMechanics(body, priorBodies, target).map(finding => ({
    severity: finding.severity === 'hard' ? 'warning' : 'note',
    category: 'mechanics',
    text: finding.text.replace(MECHANICAL_PREFIX, ''),
  }));
  const base: OutcomeBase = {
    verdict: null,
    note: null,
    checked: [
      `length against the ${target.min}–${target.max}-word target`,
      'repeated paragraphs',
      ...(priorBodies.length > 0 ? ['the opening against the previous chapter', `phrases reused from the previous ${priorBodies.length} chapter(s)`] : []),
      'stock phrases',
      'dialogue tags',
    ],
    briefCompliance: null,
    readabilityCompliance: null,
    endingCompliance: null,
    knowledgeCompliance: null,
    metrics: { words: countWords(body) },
  };
  return outcome('mechanics', body, base, drafts);
}

export function readabilityOutcome(body: string): ReviewOutcome {
  const evidence = assessReadability(body);
  const base: OutcomeBase = {
    verdict: null,
    note: null,
    checked: ['sentence length', 'paragraph length', 'reading grade', 'ornate constructions'],
    briefCompliance: null,
    readabilityCompliance: null,
    endingCompliance: null,
    knowledgeCompliance: null,
    metrics: null,
  };
  if (!evidence) {
    const short: DraftFinding = { severity: 'note', category: 'readability', text: `The chapter is under ${READABILITY_MIN_WORDS} words — too short to measure readability.` };
    return outcome('readability', body, base, [short]);
  }

  const { metrics, overLimits, flagged } = evidence;
  const drafts: DraftFinding[] = [
    ...overLimits.map(text => ({ severity: 'note', category: 'readability', text: `Over the default’s limit: ${text}` }) as const),
    ...(overLimits.length > 0
      ? flagged.map(entry => ({ severity: 'note', category: 'readability', text: `Flagged sentence (${entry.reason})`, evidence: entry.sentence }) as const)
      : []),
  ];
  return outcome(
    'readability',
    body,
    {
      ...base,
      readabilityCompliance: { compliant: overLimits.length === 0, issues: overLimits },
      metrics: {
        words: metrics.words,
        averageSentenceWords: metrics.averageSentenceWords,
        longSentenceShare: metrics.longSentenceShare,
        averageParagraphWords: metrics.averageParagraphWords,
        readingGrade: metrics.readingGrade,
        ornateHitsPer1000Words: metrics.ornateHitsPer1000Words,
      },
    },
    drafts,
  );
}

export interface RemedyLike {
  findingId: string;
  action: Review.RemedyAction;
}

/** A finding still asks for the author's attention until it is dismissed or overridden; "I'll fix it myself" leaves it open until the text changes. */
export function openFindings<T extends Pick<ChapterReviewFinding, 'id'>>(findings: T[], remedies: RemedyLike[]): T[] {
  const settled = new Set(remedies.filter(remedy => remedy.action !== 'fixing_myself').map(remedy => remedy.findingId));
  return findings.filter(finding => !settled.has(finding.id));
}
