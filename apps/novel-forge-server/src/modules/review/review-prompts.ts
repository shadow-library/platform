import { type Review } from '@server/database';

import { type FactLike } from '../bible/fact/knowledge-view';

export interface SettledFinding {
  fingerprint: string;
  action: Review.RemedyAction;
  reason: string | null;
  text: string;
}

export interface JudgeTask {
  contextPack: string;
  body: string;
  /** The plan as the chapter's writer reads it; null when the chapter was written without one. */
  chapterBrief: string | null;
  endingContract: string;
  lockedFromReader: FactLike[];
  hiddenFromCast: FactLike[];
  readabilityEvidence: string | null;
  settled: SettledFinding[];
}

function renderForbiddenWithClues(facts: FactLike[]): string {
  return facts
    .map(fact => {
      const clues = (fact.allowedClues ?? []).map(clue => clue.trim()).filter(Boolean);
      return `- [${fact.factKey}] ${fact.text}${clues.length > 0 ? `\n  Allowed clues (may be shown without the explanation): ${clues.join('; ')}` : ''}`;
    })
    .join('\n');
}

export function renderSettledFindings(settled: SettledFinding[]): string {
  const lines = settled
    .filter(finding => finding.action !== 'fixing_myself' && finding.text)
    .map(finding => `- ${finding.text}${finding.reason ? ` (the author: ${finding.reason})` : ''}`);
  if (lines.length === 0) return '';
  return `\n\n## ALREADY SETTLED BY THE AUTHOR\nThe author dismissed or overrode these findings on this exact text. Do not raise them again:\n${lines.join('\n')}`;
}

/** The standalone judge's task: the same blocks the generation judge reads, built from the chapter as it stands rather than from a run's state. */
export function renderJudgeTask(task: JudgeTask): string {
  const brief = task.chapterBrief
    ? `\n\n## BRIEF\n${task.chapterBrief}\n\nThis is the plan the chapter was written from — assess whether the draft delivers it and include briefCompliance in your JSON.`
    : '';
  const contract = task.endingContract
    ? `\n\n## ENDING CONTRACT\n${task.endingContract}\n\nAlso assess the draft ending against this contract and include endingCompliance in your JSON.`
    : '';
  const locked =
    task.lockedFromReader.length > 0
      ? `### Locked from the reader\nThe reader must not learn these yet. Flag any passage that states, paraphrases or lets the reader infer one; an allowed clue is not a leak.\n${renderForbiddenWithClues(task.lockedFromReader)}`
      : '';
  const hidden =
    task.hiddenFromCast.length > 0
      ? `### Hidden from the point-of-view cast\nThe reader may already know these, so the page may mention them. Flag only a point-of-view character who knows, says or acts on one.\n${renderForbiddenWithClues(task.hiddenFromCast)}`
      : '';
  const knowledge =
    locked || hidden
      ? `\n\n## FORBIDDEN KNOWLEDGE\n${[locked, hidden].filter(Boolean).join('\n\n')}\n\nInclude knowledgeCompliance in your JSON, each issue citing the fact key.`
      : '';
  const readability = task.readabilityEvidence
    ? `\n\n${task.readabilityEvidence}\n\nWeigh this evidence in readabilityCompliance; the project's writing-style additions win where they allow this prose.`
    : '';
  return [
    `Context:\n${task.contextPack}\n\n---\nDraft prose to evaluate:\n${task.body}${brief}${contract}${knowledge}${readability}${renderSettledFindings(task.settled)}`,
    'Evaluate this chapter draft for continuity and consistency with the established canon. You review only — never rewrite the chapter. Return a JSON object with verdict ("consistent" or "contradiction") and findings array.',
  ].join('\n\n');
}
