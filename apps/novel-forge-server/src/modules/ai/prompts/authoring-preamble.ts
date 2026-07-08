/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const AUTHORING_STYLE = `AUTHORING GUIDELINES:
- Write in third-person limited, past tense, from the POV character's perspective.
- Show character emotion through action and dialogue — never state it directly.
- Vary sentence length to control pace: short sentences for tension, longer for reflection.
- Avoid head-hopping, info-dumps, and exposition that the POV character would not naturally observe.
- Dialogue must carry purpose: advance plot, reveal character, or raise stakes — never filler.
- Ground every scene with concrete sensory detail before moving to action.
- Maintain established character voice and speech patterns exactly as recorded in their entity card.
- Every chapter must end on a note that compels turning the page. For serialized web-fiction this is often a cut, not a conclusion: ending mid-action, mid-line-of-dialogue, or mid-decision is a stronger hook than a wrapped-up scene followed by a bolted-on tease. Do not manufacture a resolution, summary, or scene break just because the chapter is ending — check the brief for whether this scene is meant to continue before you decide how to end it.
- Target 1,800–2,200 words of scene prose as a guide, not a hard wall — when the brief marks this chapter as continuing into the next, it is correct to cut the scene at the planned beat even if that lands short of or past the target.
- Canon always wins over dramatic convenience — if the brief says the character cannot use this power, they cannot.`;

// Shared output directive for the bible-builder stage prompts: the models write section prose, but
// it must arrive wrapped in the BibleStageSchema envelope or the parse fails outright.
export const BIBLE_STAGE_OUTPUT_SHAPE =
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n{"body": "<the full section prose>", "entities": [{"entityKey": "<snake_case id>", "name": "...", "type": "character|faction|location|power_rule|item|concept", "significance": "major|minor", "notes": "..."}] (only when this section introduces entities)}';
