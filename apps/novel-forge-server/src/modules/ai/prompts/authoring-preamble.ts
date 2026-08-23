export const AUTHORING_STYLE = `AUTHORING GUIDELINES:
- Write in third-person limited, past tense, from the POV character's perspective.
- Show character emotion through action and dialogue — never state it directly.
- Vary sentence length to control pace: short sentences for tension, longer for reflection.
- Avoid head-hopping, info-dumps, and exposition that the POV character would not naturally observe.
- Dialogue must carry purpose: advance plot, reveal character, or raise stakes — never filler.
- Ground every scene with concrete sensory detail before moving to action.
- Maintain established character voice and speech patterns exactly as recorded in their entity card.
- Every chapter must end on a note that compels turning the page. For serialized web-fiction this is often a cut, not a conclusion: ending mid-action, mid-line-of-dialogue, or mid-decision is a stronger hook than a wrapped-up scene followed by a bolted-on tease. Do not manufacture a resolution, summary, or scene break just because the chapter is ending — check the brief for whether this scene is meant to continue before you decide how to end it.
- Canon always wins over dramatic convenience — if the brief says the character cannot use this power, they cannot.`;

// Planning-time subset of AUTHORING_STYLE: POV and canon-consistency rules still apply when plotting,
// but sentence-length, paragraph, dialogue-mechanics, and description craft rules are noise before any
// prose exists. Used by the bible-build, plan, outline, arc-plan, premise-enhance, and chat-refine prompts,
// and also by fix and revision — repairs and revisions must not fight DEFAULT_WRITING_INSTRUCTIONS (arriving
// via the context pack) with the old, conflicting craft bullets in the full AUTHORING_STYLE. Only
// reforge-write, reforge-transform-write, and rebrand-convert — separate re-authoring pipelines — still keep
// the full version. generation.prompt.ts uses neither constant; its craft rules come entirely from the
// context pack's `writing_style` section.
export const AUTHORING_STYLE_PLANNING = `AUTHORING GUIDELINES:
- Write in third-person limited, past tense, from the POV character's perspective.
- Maintain established character voice and speech patterns exactly as recorded in their entity card.
- Canon always wins over dramatic convenience — if the brief says the character cannot use this power, they cannot.`;

// The default, EDITABLE chapter-writing instructions. Unlike AUTHORING_STYLE (a fixed house style shared
// by planning/bible/refinement prompts), this is the fallback for a project's `instructions` field — the
// author can override it in project settings, and it is what the chapter generator is told about *how* to
// write each chapter (voice, craft, and length). Keep it in sync with the web-side default copy.
export const DEFAULT_WRITING_INSTRUCTIONS = `DEFAULT WEB-NOVEL ENGLISH

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

Simple does not mean flat. Vary rhythm; let a strong moment land in a longer sentence.`;

// Shared output directive for the bible-builder stage prompts: the models write section prose, but
// it must arrive wrapped in the BibleStageSchema envelope or the parse fails outright.
export const BIBLE_STAGE_OUTPUT_SHAPE =
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — using these fields:\n' +
  '{"body": "<the full section prose>",\n' +
  ' "entities": [{"entityKey": "<snake_case id>", "name": "...", "type": "character|faction|location|power_rule|item|concept", "significance": "major|minor", "notes": "...", "body": "<full entity card prose>"}],\n' +
  ' "facts": [{"factKey": "<snake_case id>", "text": "...", "subjects": ["<entity key>"], "constraintNote": "...", "terms": ["..."], "revealChapter": <chapter number>}],\n' +
  ' "worldFacts": [{"category": "...", "key": "<snake_case id>", "value": "...", "chapter": <chapter number>}]}\n' +
  'Only "body" is always required. Include "entities", "facts", and "worldFacts" whenever the instructions above ask for them AND this section actually establishes that kind of content — omit the field or send [] otherwise. Never drop a field the instructions above asked for.';
