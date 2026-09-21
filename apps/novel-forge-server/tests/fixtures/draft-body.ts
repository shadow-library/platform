// The mechanical check hard-blocks drafts under WORD_COUNT_HARD_MIN, so any graph fixture whose run is expected to reach
// `accept` needs a real-length body. Short paragraphs keep it clear of the readability limits, so the judge note stays empty.
const FILLER = 'She climbed the ridge and did not look back.\n\n';

/** ~1,900 words — inside the 1,800–2,600 target band — and contains the word "prose" exactly once. */
export const FULL_LENGTH_DRAFT_BODY = `The prose body of the chapter. ${FILLER.repeat(210)}`.trim();
