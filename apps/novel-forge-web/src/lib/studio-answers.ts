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
