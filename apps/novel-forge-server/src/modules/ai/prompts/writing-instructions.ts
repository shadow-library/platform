import { countTokens, truncateAtParagraph } from '../context/token-budget';
import { DEFAULT_WRITING_INSTRUCTIONS } from './authoring-preamble';

// Earlier built-in defaults, verbatim. Before project instructions became additions, the settings form
// showed the default as editable text, so a project that saved it holds one of these copies.
export const LEGACY_DEFAULT_WRITING_INSTRUCTIONS = [
  `HOW TO WRITE EACH CHAPTER:
- Write in clear, simple, easy-to-follow language that any reader can enjoy — favour plain, direct wording over ornate or flowery prose.
- Each chapter should be between 2000 and 3000 words of scene prose. Treat this as a guide, not a hard wall: when the brief marks the chapter as continuing into the next, cut the scene at the planned beat even if that lands a little short of or past the range.
- Write in third-person limited, past tense, from the POV character's perspective.
- Show character emotion through action and dialogue — never state it directly.
- Vary sentence length to control pace: short sentences for tension, longer for reflection.
- Avoid head-hopping, info-dumps, and exposition the POV character would not naturally observe.
- Dialogue must carry purpose: advance plot, reveal character, or raise stakes — never filler.
- Ground every scene with concrete sensory detail before moving to action.
- Maintain established character voice and speech patterns exactly as recorded in their entity card.
- End on a note that compels turning the page — for serialized web-fiction a cut (mid-action, mid-line, mid-decision) is often a stronger hook than a wrapped-up scene; check the brief for whether this scene continues before deciding how to end it.
- Canon always wins over dramatic convenience — if the brief says a character cannot use a power, they cannot.`,
  `DEFAULT WEB-NOVEL ENGLISH

Clarity
- Use common, modern vocabulary.
- Prefer concrete nouns and direct verbs.
- Keep most sentences between roughly 6 and 22 words.
- Put the important action or fact early in the sentence.
- Use one clear image instead of several decorative comparisons.

Paragraphs
- Keep action and dialogue paragraphs short.
- Start a new paragraph when the speaker, action focus, or thought changes.
- Avoid walls of exposition.
- Avoid making every paragraph a one-line dramatic fragment.

Scenes
- Give the POV character an immediate want.
- Introduce resistance quickly.
- Let actions cause reactions and consequences.
- Make the situation meaningfully different by the end.
- Show crucial events on-page instead of reporting them afterward.

Description
- Select details that affect action, mood, judgment, or danger.
- Do not inventory every sense.
- Use figurative language only when it clarifies.
- Do not describe ordinary actions as grand or mystical unless the moment earns it.

Emotion
- Use decisions, mistakes, silence, movement, and dialogue.
- Brief direct emotional statements are allowed.
- Avoid rotating through stock body-language reactions.
- Do not explain the emotion again after it has been shown clearly.

Dialogue
- Let people answer directly when they would.
- Let them evade, interrupt, refuse, or misunderstand when motivated.
- Use contractions unless the character is deliberately formal.
- Keep most turns concise.
- Avoid information both speakers already know.
- Avoid repeated names and ornate dialogue tags.
- Give each conversation a goal, pressure point, or change.

Exposition
- Deliver only what the current decision requires.
- Break explanations with questions, objections, consequences, or action.
- Do not repeat lore merely because several chapters have passed.
- Trust readers to remember major recent developments.

Pacing and endings
- Every chapter should deliver a meaningful development.
- Not every chapter needs danger or a cliffhanger.
- Valid endings include earned closure with a new direction, a decision,
  revelation, reversal, promise, danger, or continuing action.
- Once the ending lands, stop. Do not add a summary or extra ominous line.

Originality
- Do not imitate any named novel, author, character, terminology, or scene.
- Use web-novel structural strengths—clarity, progression, anticipation,
  escalation, and payoff—while creating original material.

Simple does not mean flat. Vary rhythm; let a strong moment land in a longer sentence.`,
];

function normalizeLines(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

const EMBEDDED_DEFAULTS = [DEFAULT_WRITING_INSTRUCTIONS, ...LEGACY_DEFAULT_WRITING_INSTRUCTIONS].map(normalizeLines).sort((a, b) => b.length - a.length);

// A stored text holding this share of a default's lines is an edited copy of it, not rules that happen to agree:
// the settings form once showed the default as editable text, and authors changed a line or two before saving.
const NEAR_COPY_LINE_SHARE = 0.6;

function lineKey(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

const DEFAULT_LINE_SETS = EMBEDDED_DEFAULTS.map(text => new Set(text.split('\n').map(lineKey).filter(Boolean)));

// Defaults share many lines with each other, so each is measured against the whole text before any is stripped.
function withoutNearCopies(text: string): string {
  const lines = text.split('\n');
  const keys = new Set(lines.map(lineKey));
  const copied = DEFAULT_LINE_SETS.filter(defaultLines => [...defaultLines].filter(key => keys.has(key)).length / defaultLines.size >= NEAR_COPY_LINE_SHARE);
  if (copied.length === 0) return text;
  return lines.filter(line => !copied.some(defaultLines => defaultLines.has(lineKey(line)))).join('\n');
}

export const PROJECT_ADDITIONS_HEADING = `PROJECT ADDITIONS
The author of this novel added the rules below. Where they conflict with the default above, follow these.`;

const ADDITIONS_PREFIX = `\n\n${PROJECT_ADDITIONS_HEADING}\n\n`;

export interface ResolvedWritingInstructions {
  additions: string | null;
  /** True when a copy, or an edited copy, of a built-in default was removed from the stored text. */
  removedDefaultCopy: boolean;
}

/**
 * The author's own writing rules, with any copy of a current or earlier built-in default removed so the default
 * never reaches the writer twice: a verbatim copy wherever it sits, and every default line of an edited copy.
 */
export function resolveWritingInstructions(stored: string | null | undefined): ResolvedWritingInstructions {
  if (!stored) return { additions: null, removedDefaultCopy: false };
  const normalized = normalizeLines(stored);
  let additions = normalized;
  for (const embedded of EMBEDDED_DEFAULTS) additions = additions.split(embedded).join('\n\n');
  additions = withoutNearCopies(additions);
  const collapsed = additions.replace(/\n{3,}/g, '\n\n').trim();
  return { additions: collapsed || null, removedDefaultCopy: collapsed !== normalized.replace(/\n{3,}/g, '\n\n') };
}

export function writingInstructionAdditions(stored: string | null | undefined): string | null {
  return resolveWritingInstructions(stored).additions;
}

export interface EffectiveWritingInstructions {
  text: string;
  truncated: boolean;
}

/**
 * The default followed by the project's additions. The default is never cut: when `maxTokens` is given, the
 * additions give up their tail paragraphs to fit what the default leaves.
 */
export function effectiveWritingInstructions(additions: string | null, maxTokens?: number): EffectiveWritingInstructions {
  if (!additions) return { text: DEFAULT_WRITING_INSTRUCTIONS, truncated: false };
  if (maxTokens === undefined) return { text: `${DEFAULT_WRITING_INSTRUCTIONS}${ADDITIONS_PREFIX}${additions}`, truncated: false };
  const room = Math.max(0, maxTokens - countTokens(`${DEFAULT_WRITING_INSTRUCTIONS}${ADDITIONS_PREFIX}`));
  const fitted = truncateAtParagraph(additions, room);
  if (!fitted.text) return { text: DEFAULT_WRITING_INSTRUCTIONS, truncated: true };
  return { text: `${DEFAULT_WRITING_INSTRUCTIONS}${ADDITIONS_PREFIX}${fitted.text}`, truncated: fitted.truncated };
}
