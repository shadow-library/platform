import { type StudioQuestionResponse } from './apis/api-types.gen';

export type StudioAnswer = { kind: 'option'; index: number } | { kind: 'decide' } | { kind: 'own'; text: string };

export type StudioAnswers = Readonly<Record<string, StudioAnswer | undefined>>;

const LABEL_BREAK = ' — ';

export function questionLabel(wording: string): string {
  const cut = wording.indexOf(LABEL_BREAK);
  const label = (cut > 0 ? wording.slice(0, cut) : wording).trim();
  return label.endsWith('?') ? label : `${label}?`;
}

function rawAnswer(question: StudioQuestionResponse, answer: StudioAnswer): string | undefined {
  switch (answer.kind) {
    case 'option':
      return question.options[answer.index];
    case 'decide':
      return question.youDecide;
    case 'own':
      return answer.text;
  }
}

export function answerText(question: StudioQuestionResponse, answer: StudioAnswer | undefined): string | undefined {
  if (!answer) return undefined;
  return rawAnswer(question, answer)?.trim() || undefined;
}

export function answeredCount(questions: readonly StudioQuestionResponse[], answers: StudioAnswers): number {
  return questions.filter(question => answerText(question, answers[question.id]) !== undefined).length;
}

export function composeAnswers(questions: readonly StudioQuestionResponse[], answers: StudioAnswers, note = ''): string {
  const blocks = questions.flatMap(question => {
    const text = answerText(question, answers[question.id]);
    return text ? [`${questionLabel(question.wording)}\n${text}`] : [];
  });
  const trimmedNote = note.trim();
  if (trimmedNote) blocks.push(trimmedNote);
  return blocks.join('\n\n');
}

/** The first question after `from` still without an answer; an earlier gap is left for the author to go back to. */
export function nextUnanswered(questions: readonly StudioQuestionResponse[], answers: StudioAnswers, from: number): number | undefined {
  const index = questions.findIndex((question, candidate) => candidate > from && answerText(question, answers[question.id]) === undefined);
  return index < 0 ? undefined : index;
}

function matchAnswer(question: StudioQuestionResponse, text: string): StudioAnswer {
  const lead = text.split('\n\n')[0]?.trim() ?? text;
  const index = question.options.findIndex(option => option.trim() === lead);
  if (index >= 0) return { kind: 'option', index };
  if (question.youDecide.trim() === lead) return { kind: 'decide' };
  return { kind: 'own', text };
}

/**
 * Reads a round's answers back out of the reply `composeAnswers` wrote for it, keyed on the question labels it starts
 * each block with. A reply with no such label was written freely, so it yields nothing rather than a round of blanks.
 */
export function recoverAnswers(questions: readonly StudioQuestionResponse[], reply: string): StudioAnswers | undefined {
  const unclaimed = new Map<string, StudioQuestionResponse[]>();
  for (const question of questions) {
    const label = questionLabel(question.wording);
    unclaimed.set(label, [...(unclaimed.get(label) ?? []), question]);
  }

  const blocks = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of reply.split('\n')) {
    const question = unclaimed.get(line.trim())?.shift();
    if (!question) {
      current?.push(line);
      continue;
    }
    current = [];
    blocks.set(question.id, current);
  }
  if (blocks.size === 0) return undefined;

  const answers: Record<string, StudioAnswer> = {};
  for (const question of questions) {
    const text = blocks.get(question.id)?.join('\n').trim();
    if (text) answers[question.id] = matchAnswer(question, text);
  }
  return answers;
}
