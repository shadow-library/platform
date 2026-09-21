const CONTEXT_LINE = /^\[context:[^\]]*\]\s*$/gim;
const PROSE_NOUN =
  /\b(?:prose|wording|sentences?|paragraphs?|dialogue|passages?|narration|chapter(?:\s+\d+)?(?:'s|’s)?\s+text|(?:the|this|that|its)\s+draft|chapter\s*\d*(?:'s|’s)\s+draft)\b/i;
const PROSE_VERB_ON_TEXT =
  /\b(?:rewrite|re-write|redraft|re-draft|reword|rephrase|revise|polish|line-?edit|copy-?edit|proofread)\s+(?:the\s+|this\s+|that\s+)?(?:chapter(?:\s+\d+)?|scene|opening|ending|draft|text)\b/i;

/**
 * Whether a message reads like a request to change a chapter's text. It only ever suggests turning Edit prose on:
 * the permission itself is the author's toggle, never a guess from their wording.
 */
export function looksLikeProseEdit(message: string): boolean {
  const words = message.replace(CONTEXT_LINE, '');
  return PROSE_NOUN.test(words) || PROSE_VERB_ON_TEXT.test(words);
}
