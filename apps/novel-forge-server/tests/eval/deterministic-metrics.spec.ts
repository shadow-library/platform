import { describe, expect, it } from 'bun:test';

import {
  computeChapterMetrics,
  computeCrossChapterRepeatedNgrams,
  computeDeterministicMetricsReport,
  computeDialogueContractionRate,
  computeDialogueTagMetrics,
  computeEndingModeDistribution,
  computeReadabilityMetrics,
  computeSentenceLengthMetrics,
  computeStockPhraseCounts,
  computeWithinChapterRepeatedNgrams,
  computeWordCountDistribution,
  countSyllables,
  countWords,
  LONG_SENTENCE_WORDS,
  ngrams,
  resolveWordTarget,
  splitSentences,
  tokenizeWords,
  WORD_TARGET_AIM,
  WORD_TARGET_MAX,
  WORD_TARGET_MIN,
} from '@modules/eval/deterministic-metrics';

describe('resolveWordTarget', () => {
  it('should fall back to the application default when the project has no override', () => {
    expect(resolveWordTarget()).toEqual({ min: WORD_TARGET_MIN, max: WORD_TARGET_MAX, aim: WORD_TARGET_AIM });
    expect(resolveWordTarget(null)).toEqual({ min: WORD_TARGET_MIN, max: WORD_TARGET_MAX, aim: WORD_TARGET_AIM });
    expect(resolveWordTarget({ wordTargetMin: null, wordTargetMax: null })).toEqual({ min: WORD_TARGET_MIN, max: WORD_TARGET_MAX, aim: WORD_TARGET_AIM });
  });

  it('should use the project’s overridden band and derive its midpoint as the aim', () => {
    expect(resolveWordTarget({ wordTargetMin: 2000, wordTargetMax: 3500 })).toEqual({ min: 2000, max: 3500, aim: 2750 });
  });
});

describe('countWords', () => {
  it('should count whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('should return 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t  ')).toBe(0);
  });
});

describe('splitSentences', () => {
  it('should split on sentence-ending punctuation', () => {
    expect(splitSentences('One sentence. Another one! A question?')).toEqual(['One sentence.', 'Another one!', 'A question?']);
  });

  it('should return an empty array for empty text', () => {
    expect(splitSentences('')).toEqual([]);
  });

  it('should keep a trailing sentence with no terminator', () => {
    expect(splitSentences('Ends abruptly')).toEqual(['Ends abruptly']);
  });
});

describe('computeWordCountDistribution', () => {
  it('should classify chapters against the 1,800–2,600 target band', () => {
    const short = 'word '.repeat(1000);
    const inTarget = 'word '.repeat(2000);
    const long = 'word '.repeat(3000);
    const summary = computeWordCountDistribution([
      { chapter: 1, body: short },
      { chapter: 2, body: inTarget },
      { chapter: 3, body: long },
    ]);
    expect(summary.count).toBe(3);
    expect(summary.inTargetCount).toBe(1);
    expect(summary.inTargetRate).toBeCloseTo(1 / 3);
    expect(summary.chapters[1]?.inTarget).toBe(true);
  });

  it('should return zeroed stats for an empty chapter list', () => {
    const summary = computeWordCountDistribution([]);
    expect(summary).toMatchObject({ count: 0, inTargetCount: 0, inTargetRate: 0, min: 0, max: 0, mean: 0, median: 0 });
  });

  it('should classify chapters against a passed-in target instead of the application default', () => {
    const target = resolveWordTarget({ wordTargetMin: 2000, wordTargetMax: 3500 });
    const summary = computeWordCountDistribution(
      [
        { chapter: 1, body: 'word '.repeat(1900) }, // inside the default band, outside this override
        { chapter: 2, body: 'word '.repeat(2800) }, // inside the override
      ],
      target,
    );
    expect(summary.chapters[0]?.inTarget).toBe(false);
    expect(summary.chapters[1]?.inTarget).toBe(true);
    expect(summary.inTargetCount).toBe(1);
  });
});

describe('computeSentenceLengthMetrics', () => {
  it('should measure the share of sentences inside the 6–22-word band', () => {
    const inBand = 'This sentence has exactly eight simple words here.';
    const tooShort = 'Too short.';
    const metrics = computeSentenceLengthMetrics(`${inBand} ${inBand} ${tooShort}`);
    expect(metrics.sentenceCount).toBe(3);
    expect(metrics.bandCount).toBe(2);
    expect(metrics.bandRate).toBeCloseTo(2 / 3);
  });

  it('should find the longest run of consecutive out-of-band sentences', () => {
    const short = 'Too short.';
    const inBand = 'This sentence has exactly eight simple words here.';
    const metrics = computeSentenceLengthMetrics(`${short} ${short} ${short} ${inBand} ${short}`);
    expect(metrics.longestMonotonyRun).toBe(3);
  });

  it('should report a longest run of 0 when every sentence is in-band', () => {
    const inBand = 'This sentence has exactly eight simple words here.';
    const metrics = computeSentenceLengthMetrics(`${inBand} ${inBand}`);
    expect(metrics.longestMonotonyRun).toBe(0);
  });

  it('should handle empty text', () => {
    const metrics = computeSentenceLengthMetrics('');
    expect(metrics).toMatchObject({ sentenceCount: 0, bandCount: 0, bandRate: 0, longestMonotonyRun: 0, lengths: [] });
  });
});

describe('tokenizeWords', () => {
  it('should lowercase and strip punctuation-only tokens', () => {
    expect(tokenizeWords("It's a test — really!")).toEqual(["it's", 'a', 'test', 'really']);
  });

  it('should return an empty array for punctuation-only text', () => {
    expect(tokenizeWords('— ... !!')).toEqual([]);
  });
});

describe('ngrams', () => {
  it('should build overlapping n-grams', () => {
    expect(ngrams(['a', 'b', 'c', 'd'], 2)).toEqual(['a b', 'b c', 'c d']);
  });

  it('should return an empty array when there are fewer tokens than n', () => {
    expect(ngrams(['a', 'b'], 5)).toEqual([]);
  });
});

describe('computeWithinChapterRepeatedNgrams', () => {
  it('should detect a repeated 5-gram within one chapter', () => {
    const body = 'the quick brown fox jumped over the lazy dog. later the quick brown fox jumped again.';
    const report = computeWithinChapterRepeatedNgrams(body, [5]);
    expect(report.sizes[0]?.repeatedOccurrences).toBeGreaterThan(0);
    expect(report.overallRepeatedRate).toBeGreaterThan(0);
  });

  it('should report a zero rate for text with no repeated n-grams', () => {
    const body = 'every single word in this short chapter is completely unique across the whole thing';
    const report = computeWithinChapterRepeatedNgrams(body, [5]);
    expect(report.overallRepeatedRate).toBe(0);
  });
});

describe('computeCrossChapterRepeatedNgrams', () => {
  it('should detect n-grams shared with the prior-chapters window', () => {
    const prior = ['the hero drew his sword and charged forward bravely into the fray'];
    const current = 'the hero drew his sword and charged forward once more';
    const report = computeCrossChapterRepeatedNgrams(current, prior, [5]);
    expect(report.overallRepeatedRate).toBeGreaterThan(0);
  });

  it('should report a zero rate when there are no prior chapters', () => {
    const report = computeCrossChapterRepeatedNgrams('some brand new original prose right here', [], [5]);
    expect(report.overallRepeatedRate).toBe(0);
  });
});

describe('computeStockPhraseCounts', () => {
  it('should count occurrences of stock reaction phrases', () => {
    const body = 'Her eyes narrowed. His breath hitched. She felt a mixture of joy and fear.';
    const report = computeStockPhraseCounts(body);
    expect(report.total).toBeGreaterThanOrEqual(3);
    expect(report.hits.find(h => h.label === 'breath hitched')?.count).toBe(1);
  });

  it('should return a zero total for clean prose', () => {
    const report = computeStockPhraseCounts('The market square was busy at noon, full of ordinary traders.');
    expect(report.total).toBe(0);
  });
});

describe('computeDialogueTagMetrics', () => {
  it('should split tags between said/asked and alternatives', () => {
    const body = '"Stop," she said. "Why?" he asked. "Because I said so," she growled.';
    const metrics = computeDialogueTagMetrics(body);
    expect(metrics.totalTags).toBe(3);
    expect(metrics.saidAskedCount).toBe(2);
    expect(metrics.alternativeCount).toBe(1);
    expect(metrics.saidAlternativeRate).toBeCloseTo(1 / 3);
  });

  it('should report zero tags for text with no dialogue', () => {
    const metrics = computeDialogueTagMetrics('The forest was quiet and the path wound uphill for miles.');
    expect(metrics.totalTags).toBe(0);
    expect(metrics.saidAlternativeRate).toBe(0);
  });
});

describe('computeDialogueContractionRate', () => {
  it('should compare contracted and expanded forms inside quoted dialogue only', () => {
    const body = '"I don\'t know," she said, though narration says I do not know either.';
    const rate = computeDialogueContractionRate(body);
    expect(rate.contracted).toBe(1);
    expect(rate.expanded).toBe(0);
    expect(rate.rate).toBe(1);
  });

  it('should report a rate of 0 when there is no dialogue at all', () => {
    const rate = computeDialogueContractionRate('Narration only, no quotes anywhere in this passage.');
    expect(rate).toEqual({ contracted: 0, expanded: 0, rate: 0 });
  });
});

describe('computeEndingModeDistribution', () => {
  it('should tally hook-type counts and distinct types', () => {
    const distribution = computeEndingModeDistribution([
      { chapter: 1, hookType: 'cliffhanger' },
      { chapter: 2, hookType: 'cliffhanger' },
      { chapter: 3, hookType: 'closure_with_momentum' },
      { chapter: 4, hookType: null },
    ]);
    expect(distribution.counts).toEqual({ cliffhanger: 2, closure_with_momentum: 1 });
    expect(distribution.distinctCount).toBe(2);
    expect(distribution.total).toBe(3);
  });

  it('should return an empty distribution for no entries', () => {
    expect(computeEndingModeDistribution([])).toEqual({ counts: {}, distinctCount: 0, total: 0 });
  });
});

describe('computeChapterMetrics', () => {
  it('should combine every metric for one chapter', () => {
    const body = 'This sentence has exactly eight simple words here. "Stop," she said.';
    const report = computeChapterMetrics({ chapter: 5, body, hookType: 'turn' }, []);
    expect(report.chapter).toBe(5);
    expect(report.hookType).toBe('turn');
    expect(report.words).toBe(countWords(body));
  });
});

describe('computeDeterministicMetricsReport', () => {
  it('should aggregate per-chapter reports plus the word-count and ending-mode rollups', () => {
    const chapters = [
      { chapter: 1, body: 'word '.repeat(2000), hookType: 'cliffhanger' },
      { chapter: 2, body: 'word '.repeat(2100), hookType: 'promise' },
    ];
    const report = computeDeterministicMetricsReport(chapters, new Map());
    expect(report.chapters).toHaveLength(2);
    expect(report.wordCountSummary.count).toBe(2);
    expect(report.endingModeDistribution.distinctCount).toBe(2);
  });
});

describe('countSyllables', () => {
  it('should count vowel groups and drop a silent ending', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('harbor')).toBe(2);
    expect(countSyllables('stone')).toBe(1);
    expect(countSyllables('window')).toBe(2);
  });

  it('should count nothing for a token with no letters', () => {
    expect(countSyllables('1,200')).toBe(0);
  });
});

describe('computeReadabilityMetrics', () => {
  it('should end a sentence at a closing quote so dialogue is not glued to the narration after it', () => {
    const metrics = computeReadabilityMetrics('"Stop." She turned around.\n\n"Why?" he asked.');
    expect(metrics.sentenceCount).toBe(4);
    expect(metrics.paragraphCount).toBe(2);
    expect(metrics.averageParagraphWords).toBe(3.5);
  });

  it('should measure long sentences against the long-sentence limit, longest first', () => {
    const long = `${'word '.repeat(LONG_SENTENCE_WORDS + 5).trim()}.`;
    const longer = `${'word '.repeat(LONG_SENTENCE_WORDS + 10).trim()}.`;
    const metrics = computeReadabilityMetrics(`Short one. ${long} ${longer} Another short one.`);
    expect(metrics.longSentenceShare).toBe(0.5);
    expect(metrics.longSentences).toEqual([longer, long]);
  });

  it('should keep abbreviations, initials and decimals inside their sentence', () => {
    const metrics = computeReadabilityMetrics('Dr. Hale met J. Ortiz at 3.30 p.m. on the pier. They talked for 2.5 hours. Mr. Vance left early.');
    expect(metrics.sentenceCount).toBe(3);
    expect(metrics.words).toBe(20);
  });

  it('should record one ornate hit per matching sentence with its label', () => {
    const metrics = computeReadabilityMetrics('Pell had a voice like a hinge nobody oiled. She sat down.');
    expect(metrics.ornateHits).toEqual([{ label: 'metaphor for a voice', sentence: 'Pell had a voice like a hinge nobody oiled.' }]);
  });

  it('should catch each ornate construction in invented sentences', () => {
    const cases: [string, string][] = [
      ['His plan had the architecture of his fear.', 'abstract noun doing concrete work'],
      ['She folded the map the way one folds a flag.', 'simile by manner'],
      ["It was the universe's idea of a joke.", 'narrator cleverness'],
      ['The stillness carried a temperature.', 'metaphor for a silence'],
      ['The kitchen held its breath.', 'metaphor for a room'],
    ];
    for (const [sentence, label] of cases) expect(computeReadabilityMetrics(sentence).ornateHits).toEqual([{ label, sentence }]);
  });

  it('should not flag plain sentences', () => {
    const plain = [
      'Her voice was a little hoarse.',
      'Everyone in the room held their breath.',
      'She did not look happy. She looked tired.',
      'He did not feel well. He felt sick.',
      'It was not a problem. It was a relief.',
      'The room was thick with smoke.',
      'The air was heavy with rain.',
      'The house was alive with music.',
      'He paid the fee, which was new this year.',
      'She filed the report under the wrong case number.',
      'The economy of the city was failing.',
      'He looked like a cop, and she dressed like a nurse.',
      'They turned the barn into a new room for the kids.',
      'Something smaller and more useful would do.',
      'It is not a car but a truck.',
      'He made her a new coat.',
      'The rope was frayed at the edges.',
      'I like the way you work.',
      'Her voice was a whisper. His voice was rough.',
      'He played it like a pro, as if nothing happened.',
      'I felt like a fool, as though everyone was watching.',
      'Like a lot of people, he checked his phone as if expecting news.',
      'The fog moved like a tide, as if the harbour were breathing.',
      'The architecture of her house was plain.',
      'The grammar of his letter was poor.',
      'She checked the geometry of their design.',
    ];
    for (const sentence of plain) expect({ sentence, hits: computeReadabilityMetrics(sentence).ornateHits }).toEqual({ sentence, hits: [] });
  });

  it('should report ornate hits per 1,000 words', () => {
    const metrics = computeReadabilityMetrics(`The kitchen held its breath. ${'She walked on. '.repeat(165)}`.trim());
    expect(metrics.words).toBe(500);
    expect(metrics.ornateHitsPer1000Words).toBeCloseTo(2, 5);
  });

  it('should return zeroed metrics for empty text', () => {
    expect(computeReadabilityMetrics('')).toMatchObject({ words: 0, sentenceCount: 0, averageSentenceWords: 0, readingGrade: 0, ornateHits: [] });
  });
});
