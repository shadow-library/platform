import { type IsolationBridge } from '../finalize-review/isolation-bridge';

export interface ChapterProse {
  isolated: boolean;
  body: string | null;
}

export interface IsolatableDraft extends ChapterProse {
  summary: string | null;
  state?: unknown;
  judgeNote?: string | null;
}

const WALLED_OFF_PROSE = 'Prose: walled off. This is an unrestricted chapter, so its text is not available here; only its approved bridge is.';

export const NO_BRIDGE_SUMMARY = '(unrestricted chapter — walled off, no approved bridge)';

export const NO_APPROVED_BRIDGE = 'Walled off: an unrestricted chapter with no approved bridge for its current text, so nothing from it is available here.';

/**
 * Raw isolated prose is readable only by the author, the unrestricted route and the Amend editor. Anything that feeds a standard-route call
 * reads a chapter through this: the prose itself for a standard chapter, and for an isolated one only the summary its author approved.
 */
export function standardReadableProse(chapter: ChapterProse, bridgeSummary: string | null): string {
  if (!chapter.isolated) return chapter.body ?? '';
  return bridgeSummary?.trim() ? `${WALLED_OFF_PROSE}\nBridge summary: ${bridgeSummary.trim()}` : `${WALLED_OFF_PROSE}\n${NO_APPROVED_BRIDGE}`;
}

/** An isolated chapter's continuation state as a standard call may read it: the positions and conditions its author approved, never what the unrestricted writer carried. */
export function standardReadableState(bridge: Pick<IsolationBridge, 'positions'> | undefined): { characterPositions: IsolationBridge['positions'] } | null {
  return bridge && bridge.positions.length > 0 ? { characterPositions: bridge.positions } : null;
}

export function standardReadableDraft<T extends IsolatableDraft>(draft: T, bridge: IsolationBridge | undefined): T {
  if (!draft.isolated) return draft;
  const summary = bridge?.summary ?? null;
  const withheld = { body: standardReadableProse(draft, summary), summary, state: standardReadableState(bridge), judgeNote: null };
  return { ...draft, ...withheld, ...('title' in draft ? { title: null } : {}) };
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
