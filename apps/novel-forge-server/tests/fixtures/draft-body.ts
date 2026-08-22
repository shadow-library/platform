// The mechanical check hard-blocks drafts under WORD_COUNT_HARD_MIN, so any graph fixture whose run is
// expected to reach `accept` must hand the graph a real-length body rather than a one-line stub.
const FILLER = 'She climbed the ridge and did not look back. ';

/** ~1,900 words — inside the 1,800–2,600 target band — and contains the word "prose" exactly once. */
export const FULL_LENGTH_DRAFT_BODY = `The prose body of the chapter. ${FILLER.repeat(210)}`.trim();
