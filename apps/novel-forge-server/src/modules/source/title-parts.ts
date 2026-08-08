export interface TitleParts {
  /** Title with the chapter prefix and part tokens stripped — display casing preserved. */
  base: string;
  /** The original (source-novel) chapter number when the title carries one. */
  sourceChapter: number | null;
  part: number | null;
  partTotal: number | null;
}

export interface ChapterLike {
  number: number;
  title: string | null;
  words: number;
}

export interface RecombineGroup {
  members: ChapterLike[];
  /** Display title for the merged chapter — the first member's stripped base. */
  title: string | null;
  flags: string[];
}

export interface AmbiguousBoundary {
  /** The boundary sits between this chapter number and the next one. */
  afterNumber: number;
  reason: 'bare_repeat' | 'part_gap' | 'total_unmet' | 'untitled_short';
}

export interface RecombinePlan {
  groups: RecombineGroup[];
  ambiguous: AmbiguousBoundary[];
  before: number;
  after: number;
}

interface GroupDraft {
  members: ChapterLike[];
  parsed: TitleParts[];
  sourceChapter: number | null;
  normalizedBase: string;
  lastPart: number | null;
  partTotal: number | null;
}

// A translator part is rarely a full chapter; below this an untitled chapter is suspicious enough
// to flag for the AI boundary check instead of silently staying split.
const SHORT_PART_WORDS = 1_500;
const MAX_GROUP_SIZE = 5;

const PART_OF_TOTAL = /[([]\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*[)\]]\s*$/;
const PART_WORD = /\b(?:part|pt\.?)\s*(\d{1,2})\b/i;
const TRAILING_PAREN = /\(\s*(\d{1,2})\s*\)\s*$/;
const TRAILING_DASH = /\s+[-–—]\s*(\d{1,2})\s*$/;
const CHAPTER_PREFIX = /^\s*(?:chapter|ch\.?|c)\s*#?(\d{1,5})(?:\s*[.\-–—]\s*(\d{1,2}))?\b\s*[:.\-–—]?\s*/i;
const BARE_NUMBER_PREFIX = /^\s*(\d{1,5})\s*[:.\-–—]\s*/;

export function normalizeBase(base: string): string {
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseTitleParts(title: string | null): TitleParts {
  if (!title) return { base: '', sourceChapter: null, part: null, partTotal: null };

  let rest = title.trim();
  let part: number | null = null;
  let partTotal: number | null = null;
  let sourceChapter: number | null = null;

  const ofTotal = PART_OF_TOTAL.exec(rest);
  if (ofTotal) {
    part = Number(ofTotal[1]);
    partTotal = Number(ofTotal[2]);
    rest = rest.slice(0, ofTotal.index);
  }

  const partWord = PART_WORD.exec(rest);
  if (partWord) {
    part ??= Number(partWord[1]);
    rest = `${rest.slice(0, partWord.index)} ${rest.slice(partWord.index + partWord[0].length)}`;
  }

  if (part === null) {
    const paren = TRAILING_PAREN.exec(rest);
    if (paren) {
      part = Number(paren[1]);
      rest = rest.slice(0, paren.index);
    }
  }

  const prefix = CHAPTER_PREFIX.exec(rest);
  if (prefix) {
    sourceChapter = Number(prefix[1]);
    if (prefix[2]) part ??= Number(prefix[2]);
    rest = rest.slice(prefix[0].length);
  } else {
    const bare = BARE_NUMBER_PREFIX.exec(rest);
    if (bare) {
      sourceChapter = Number(bare[1]);
      rest = rest.slice(bare[0].length);
    }
  }

  // The trailing-dash form ("The Gate - 2") is checked last: chapter prefixes like "700 - 2" already
  // consumed their numbers above, so whatever remains here is a genuine part marker.
  if (part === null) {
    const dash = TRAILING_DASH.exec(rest);
    if (dash) {
      part = Number(dash[1]);
      rest = rest.slice(0, dash.index);
    }
  }

  const base = rest.replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '');
  return { base, sourceChapter, part, partTotal };
}

/** True when the chapter should extend the current group (recombine design §2 detection ladder). */
function continuesGroup(group: GroupDraft, parsed: TitleParts): boolean {
  if (parsed.sourceChapter !== null && group.sourceChapter !== null) return parsed.sourceChapter === group.sourceChapter;

  const basesMatch = parsed.base !== '' && normalizeBase(parsed.base) === group.normalizedBase;
  if (!basesMatch) return false;
  // "The Gate" followed by "The Gate (2)": an unmarked first part counts as part 1.
  if (parsed.part !== null) return parsed.part === (group.lastPart ?? 1) + 1;
  // Same base, part-of-total on the previous member, none here — the total says more parts exist.
  return group.partTotal !== null && group.members.length < group.partTotal;
}

export function buildGroupingPlan(chapters: ChapterLike[]): RecombinePlan {
  const ordered = [...chapters].sort((a, b) => a.number - b.number);
  const groups: GroupDraft[] = [];
  const ambiguous: AmbiguousBoundary[] = [];

  for (const chapter of ordered) {
    const parsed = parseTitleParts(chapter.title);
    const current = groups[groups.length - 1];

    if (current && continuesGroup(current, parsed)) {
      current.members.push(chapter);
      current.parsed.push(parsed);
      current.sourceChapter ??= parsed.sourceChapter;
      current.lastPart = parsed.part ?? (current.lastPart ?? 1) + 1;
      if (parsed.partTotal !== null) current.partTotal = Math.max(current.partTotal ?? 0, parsed.partTotal);
      continue;
    }

    if (current) {
      const prev = current.members[current.members.length - 1] as ChapterLike;
      const boundary = { afterNumber: prev.number };
      const basesMatch = parsed.base !== '' && normalizeBase(parsed.base) === current.normalizedBase;
      const differentSource = parsed.sourceChapter !== null && current.sourceChapter !== null && parsed.sourceChapter !== current.sourceChapter;

      if (basesMatch && !differentSource && parsed.part === null && current.lastPart === null) {
        // Identical adjacent titles with no part token on either side — a real split OR a reused title.
        ambiguous.push({ ...boundary, reason: 'bare_repeat' });
      } else if (basesMatch && !differentSource && parsed.part !== null && parsed.part > (current.lastPart ?? 1) + 1) {
        ambiguous.push({ ...boundary, reason: 'part_gap' });
      } else if (current.partTotal !== null && current.members.length < current.partTotal && !differentSource) {
        ambiguous.push({ ...boundary, reason: 'total_unmet' });
      } else if ((parsed.base === '' || prev.title === null) && (chapter.words < SHORT_PART_WORDS || prev.words < SHORT_PART_WORDS)) {
        ambiguous.push({ ...boundary, reason: 'untitled_short' });
      }
    }

    groups.push({
      members: [chapter],
      parsed: [parsed],
      sourceChapter: parsed.sourceChapter,
      normalizedBase: normalizeBase(parsed.base),
      lastPart: parsed.part,
      partTotal: parsed.partTotal,
    });
  }

  const finalGroups: RecombineGroup[] = groups.map(g => {
    const flags: string[] = [];
    if (g.members.length > MAX_GROUP_SIZE) flags.push('oversized');
    if (g.partTotal !== null && g.members.length !== g.partTotal) flags.push('total_mismatch');
    const base = g.parsed[0]?.base ?? '';
    return { members: g.members, title: base || (g.members[0]?.title ?? null), flags };
  });

  return { groups: finalGroups, ambiguous, before: ordered.length, after: finalGroups.length };
}

/**
 * Folds AI merge verdicts into a deterministic plan: for every boundary the model said to merge, the
 * group ending at that chapter absorbs the following group. Deterministic groupings are never split
 * apart — the model only ever joins what the ladder left separate (recombine design §2).
 */
export function applyBoundaryMerges(plan: RecombinePlan, mergeAfter: number[]): RecombinePlan {
  if (mergeAfter.length === 0) return plan;
  const mergeSet = new Set(mergeAfter);

  const groups: RecombineGroup[] = [];
  for (const group of plan.groups) {
    const previous = groups[groups.length - 1];
    const previousTail = previous?.members[previous.members.length - 1];
    if (previous && previousTail && mergeSet.has(previousTail.number)) {
      previous.members = [...previous.members, ...group.members];
      previous.flags = [...new Set([...previous.flags, ...group.flags, 'ai_merged'])];
      continue;
    }
    groups.push({ ...group, members: [...group.members], flags: [...group.flags] });
  }

  const ambiguous = plan.ambiguous.filter(a => !mergeSet.has(a.afterNumber));
  return { groups, ambiguous, before: plan.before, after: groups.length };
}
