import { createHash } from 'node:crypto';

export type SpanAction = 'keep' | 'condense' | 'merge' | 'drop';

/** The span shape the validator works on — DB rows, model output, and edit payloads all satisfy it. */
export interface PlanSpanLike {
  ordinal: number;
  fromChapter: number;
  toChapter: number;
  action: SpanAction;
  targetChapters: number;
  continuityNotes?: string | null;
  keptBeats?: string[] | null;
}

export interface PlanValidationOptions {
  /** When given, the spans must cover exactly `1..sourceChapterCount`; omitted for a model's draft, which cannot know it. */
  sourceChapterCount?: number;
  /** Source chapters one output chapter may be written from — rule 7's spirit, and the per-chapter cost bound. */
  maxSpanSourceChapters?: number;
  /** Shortest span the author wants to review; a plan of 800 one-chapter spans is not reviewable. */
  minSpanChapters?: number;
}

export interface DerivedSpan {
  ordinal: number;
  spanKey: string;
  /** First output chapter this span produces, or null for a `drop`. */
  firstOutputChapter: number | null;
  lastOutputChapter: number | null;
}

export const DEFAULT_MAX_SPAN_SOURCE_CHAPTERS = 6;
export const DEFAULT_MIN_SPAN_CHAPTERS = 1;

function spanLength(span: PlanSpanLike): number {
  return span.toChapter - span.fromChapter + 1;
}

/**
 * Derived from the span's own bounds and intent, never authored: a revision that leaves a span's
 * bounds, action, and target untouched reproduces the same key, which is precisely what lets already
 * written outputs carry forward instead of one edit at span 3 of 300 invalidating a whole book.
 */
export function spanKeyFor(span: Pick<PlanSpanLike, 'fromChapter' | 'toChapter' | 'action' | 'targetChapters'>): string {
  return createHash('sha256').update(`${span.fromChapter}:${span.toChapter}:${span.action}:${span.targetChapters}`).digest('hex').slice(0, 32);
}

function targetIssue(span: PlanSpanLike): string | null {
  const length = spanLength(span);
  if (span.action === 'keep' && span.targetChapters !== length) return `keep span ${span.ordinal} must produce exactly its ${length} source chapters`;
  if (span.action === 'merge' && span.targetChapters !== 1) return `merge span ${span.ordinal} must produce exactly 1 output chapter`;
  if (span.action === 'drop' && span.targetChapters !== 0) return `drop span ${span.ordinal} must produce no output chapters`;
  if (span.action === 'condense' && (span.targetChapters < 1 || span.targetChapters >= length)) {
    return `condense span ${span.ordinal} must produce between 1 and ${length - 1} output chapters`;
  }
  return null;
}

/**
 * The plan is the sole structural authority, so it is checked before it is stored and again before it
 * is approved (transform design §4). Spans must partition the source: a chapter is never silently
 * forgotten — if it is going away, some span says `drop`.
 */
export function validateTransformPlan(spans: PlanSpanLike[], options: PlanValidationOptions = {}): string[] {
  if (spans.length === 0) return ['a plan must contain at least one span'];

  const issues: string[] = [];
  const maxSourceChapters = options.maxSpanSourceChapters ?? DEFAULT_MAX_SPAN_SOURCE_CHAPTERS;
  const minSpanChapters = options.minSpanChapters ?? DEFAULT_MIN_SPAN_CHAPTERS;
  const ordered = [...spans].sort((a, b) => a.ordinal - b.ordinal);

  ordered.forEach((span, index) => {
    if (span.ordinal !== index + 1) issues.push(`span ordinals must run 1..${ordered.length} without gaps`);
  });

  if (ordered[0]?.fromChapter !== 1) issues.push('the first span must start at source chapter 1');
  if (ordered[0]?.action === 'drop') issues.push('the first span cannot be dropped — a novel needs an opening');
  if (options.sourceChapterCount !== undefined && ordered[ordered.length - 1]?.toChapter !== options.sourceChapterCount) {
    issues.push(`the last span must end at source chapter ${options.sourceChapterCount}`);
  }

  for (const [index, span] of ordered.entries()) {
    const previous = ordered[index - 1];
    if (span.toChapter < span.fromChapter) issues.push(`span ${span.ordinal} ends before it starts`);
    if (previous && span.fromChapter !== previous.toChapter + 1) {
      issues.push(`spans must partition the source: span ${span.ordinal} starts at ${span.fromChapter}, but span ${previous.ordinal} ends at ${previous.toChapter}`);
    }
    if (spanLength(span) < minSpanChapters) issues.push(`span ${span.ordinal} is shorter than the ${minSpanChapters}-chapter minimum`);

    const issue = targetIssue(span);
    if (issue) issues.push(issue);

    if (span.action !== 'drop' && span.targetChapters > 0) {
      const sourcePerOutput = Math.ceil(spanLength(span) / span.targetChapters);
      if (sourcePerOutput > maxSourceChapters) {
        issues.push(`span ${span.ordinal} would write one output chapter from ${sourcePerOutput} source chapters, over the ceiling of ${maxSourceChapters}`);
      }
    }

    // The bridge is mandatory where the seam is: after a drop, the source no longer explains the output.
    if (previous?.action === 'drop' && !span.continuityNotes?.trim()) {
      issues.push(`span ${span.ordinal} follows a dropped span and needs continuity notes to bridge the seam`);
    }
    if (span.action !== 'drop' && (span.keptBeats?.length ?? 0) === 0) issues.push(`span ${span.ordinal} must name the beats it keeps — they are the judge's contract`);
  }

  return [...new Set(issues)];
}

/** Output chapter numbers are the running sum of `targetChapters` in ordinal order — derived, never authored. */
export function deriveOutputNumbering(spans: PlanSpanLike[]): { spans: DerivedSpan[]; outputChapterCount: number } {
  const ordered = [...spans].sort((a, b) => a.ordinal - b.ordinal);
  const derived: DerivedSpan[] = [];
  let cursor = 0;

  for (const span of ordered) {
    const first = span.targetChapters > 0 ? cursor + 1 : null;
    cursor += span.targetChapters;
    derived.push({ ordinal: span.ordinal, spanKey: spanKeyFor(span), firstOutputChapter: first, lastOutputChapter: first === null ? null : cursor });
  }

  return { spans: derived, outputChapterCount: cursor };
}

/**
 * Which span owns an output chapter, resolved from the plan's own running target sum — the writer and
 * the executor both ask the plan rather than trusting a caller-supplied ordinal.
 */
export function locateOutputChapter<T extends PlanSpanLike>(spans: T[], outputChapter: number): { span: T; indexInSpan: number } | null {
  const ordered = [...spans].sort((a, b) => a.ordinal - b.ordinal);
  let cursor = 0;

  for (const span of ordered) {
    const first = cursor + 1;
    cursor += span.targetChapters;
    if (span.targetChapters > 0 && outputChapter >= first && outputChapter <= cursor) return { span, indexInSpan: outputChapter - first };
  }

  return null;
}
