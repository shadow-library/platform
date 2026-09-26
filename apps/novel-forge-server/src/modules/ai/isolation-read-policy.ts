import { findHardLine } from './hard-line';

export interface ChapterProse {
  isolated: boolean;
  body: string | null;
  summary: string | null;
}

export interface IsolatableDraft extends ChapterProse {
  state?: unknown;
  judgeNote?: string | null;
}

const WALLED_OFF_PROSE = 'Prose: walled off. This is an unrestricted chapter, so its text is not available here; its approved summary stands in for it.';

export interface StandardPosition {
  entityKey: string;
  location: string;
}

const MAX_LOCATION_LENGTH = 60;

/**
 * Raw isolated prose is readable only by the author, the unrestricted route and the Amend editor. Anything that feeds a standard-route call
 * reads a chapter through this: the prose itself for a standard chapter, and for an isolated one only its summary, the bridge that exists today.
 */
export function standardReadableProse(chapter: ChapterProse): string {
  if (!chapter.isolated) return chapter.body ?? '';
  return chapter.summary?.trim() ? `${WALLED_OFF_PROSE}\nSummary: ${chapter.summary.trim()}` : WALLED_OFF_PROSE;
}

function isPosition(value: unknown, roster: ReadonlySet<string>): value is StandardPosition {
  if (value === null || typeof value !== 'object') return false;
  const { entityKey, location } = value as Record<string, unknown>;
  if (typeof entityKey !== 'string' || !roster.has(entityKey)) return false;
  return typeof location === 'string' && location.trim().length > 0 && location.length <= MAX_LOCATION_LENGTH && !findHardLine([location]);
}

/** An isolated chapter's continuation state as a standard call may read it: roster keys and short places only, never what the unrestricted writer described. */
export function standardReadableState(state: unknown, roster: ReadonlySet<string>): { characterPositions: StandardPosition[] } | null {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null;
  const positions = (state as Record<string, unknown>)['characterPositions'];
  if (!Array.isArray(positions)) return null;
  const kept = positions.filter(position => isPosition(position, roster)).map(({ entityKey, location }) => ({ entityKey, location: location.trim() }));
  return kept.length > 0 ? { characterPositions: kept } : null;
}

export function standardReadableDraft<T extends IsolatableDraft>(draft: T, roster: ReadonlySet<string>): T {
  if (!draft.isolated) return draft;
  return { ...draft, body: standardReadableProse(draft), state: standardReadableState(draft.state, roster), judgeNote: null };
}

export const WALLED_OFF_EXCERPT = '[excerpt withheld: unrestricted chapter]';

/** Leads the context of every extraction read from an isolated chapter; what it yields is staged for the author and may become canon. */
export const ISOLATED_EXTRACTION_NOTE =
  '## HOW TO DESCRIBE THIS CHAPTER\nThis chapter is walled off from the rest of the book. Describe every entry plainly and non-graphically: record what happened, who knows what and where things stand, never how an intimate or violent scene read. Quote nothing from the prose.';

/** Marks a staged extraction read from an isolated chapter, so its origin travels with it to the author's review. */
export const ISOLATED_SOURCE_WARNING = 'Read from an unrestricted chapter: excerpts are withheld; review every entry before it becomes canon.';
const EXCERPT_FIELDS: ReadonlySet<string> = new Set(['evidence', 'excerpt', 'quote']);

export function isolatedExtractionContext(contextPack: string): string {
  return `${ISOLATED_EXTRACTION_NOTE}\n\n${contextPack}`;
}

/** A continuity extraction from an isolated chapter as it is staged: excerpts withheld and its origin stamped on the payload. */
export function isolatedContinuityProposal<T extends object>(extracted: T): T & { sourceIsolated: true } {
  return { ...standardReadableExtraction(extracted), sourceIsolated: true };
}

/** What the unrestricted extractor read out of an isolated chapter with every quoted excerpt replaced, so it can be staged for the author and later become canon. */
export function standardReadableExtraction<T>(extracted: T): T {
  if (Array.isArray(extracted)) return extracted.map(item => standardReadableExtraction(item as unknown)) as T;
  if (extracted === null || typeof extracted !== 'object') return extracted;
  const entries = Object.entries(extracted).map(([key, value]) => [
    key,
    EXCERPT_FIELDS.has(key) && typeof value === 'string' ? WALLED_OFF_EXCERPT : standardReadableExtraction(value),
  ]);
  return Object.fromEntries(entries) as T;
}

const WALLED_OFF_REVIEW = "Findings: walled off. This chapter is isolated, so this review's finding text and evidence are not available here.";

/** Decision P4-39: an isolated chapter's evidence never reaches the chat, on any route — same rule `get_draft` already applies to its prose. */
const WITHHELD_FINDING = '[withheld: isolated chapter]';

export interface IsolatableFinding {
  text: string;
  evidence: string | null;
}

export interface IsolatableRemedy {
  reason: string | null;
}

export interface IsolatableCompliance {
  compliant: boolean;
  issues: string[];
}

export interface IsolatableReview<F extends IsolatableFinding = IsolatableFinding, R extends IsolatableRemedy = IsolatableRemedy> {
  isolated: boolean;
  note: string | null;
  findings: readonly F[];
  remedies: readonly R[];
  briefCompliance?: IsolatableCompliance | null;
  readabilityCompliance?: IsolatableCompliance | null;
  endingCompliance?: IsolatableCompliance | null;
  knowledgeCompliance?: IsolatableCompliance | null;
}

function redactedCompliance(compliance: IsolatableCompliance | null | undefined): IsolatableCompliance | null | undefined {
  return compliance ? { ...compliance, issues: [] } : compliance;
}

/** Whether a chat lookup must read this review walled off: its own `isolated` flag, or the chapter's current text being isolated now — the only two facts that decide it, kept here so nothing recomputes the `or`. */
export function isReviewRedacted(review: Pick<IsolatableReview, 'isolated'>, currentlyIsolated: boolean): boolean {
  return review.isolated || currentlyIsolated;
}

/**
 * A chapter review as a chat lookup may read it: findings, evidence, remedy reasons, note and compliance issues walled off when redacted
 * (see `isReviewRedacted`) — a review recorded before the chapter's isolation changed must not carry stale isolated prose either way. There
 * is no unrestricted-route exception: P4-39 holds evidence to the same rule `get_draft` already applies to isolated prose.
 */
export function standardReadableReview<F extends IsolatableFinding, R extends IsolatableRemedy, T extends IsolatableReview<F, R>>(review: T, currentlyIsolated = false): T {
  if (!isReviewRedacted(review, currentlyIsolated)) return review;
  return {
    ...review,
    note: WALLED_OFF_REVIEW,
    findings: review.findings.map(finding => ({ ...finding, text: WITHHELD_FINDING, evidence: finding.evidence !== null ? WITHHELD_FINDING : null })),
    remedies: review.remedies.map(remedy => ({ ...remedy, reason: null })),
    briefCompliance: redactedCompliance(review.briefCompliance),
    readabilityCompliance: redactedCompliance(review.readabilityCompliance),
    endingCompliance: redactedCompliance(review.endingCompliance),
    knowledgeCompliance: redactedCompliance(review.knowledgeCompliance),
  };
}
