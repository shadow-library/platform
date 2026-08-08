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

// The default, EDITABLE chapter-writing instructions. Unlike AUTHORING_STYLE (a fixed house style shared
// by planning/bible/refinement prompts), this is the fallback for a project's `instructions` field — the
// author can override it in project settings, and it is what the chapter generator is told about *how* to
// write each chapter (voice, craft, and length). Keep it in sync with the web-side default copy.
export const DEFAULT_WRITING_INSTRUCTIONS = `HOW TO WRITE EACH CHAPTER:
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
- Canon always wins over dramatic convenience — if the brief says a character cannot use a power, they cannot.`;

// Shared output directive for the bible-builder stage prompts: the models write section prose, but
// it must arrive wrapped in the BibleStageSchema envelope or the parse fails outright.
export const BIBLE_STAGE_OUTPUT_SHAPE =
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n{"body": "<the full section prose>", "entities": [{"entityKey": "<snake_case id>", "name": "...", "type": "character|faction|location|power_rule|item|concept", "significance": "major|minor", "notes": "..."}] (only when this section introduces entities)}';
