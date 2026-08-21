import { describe, expect, it } from 'bun:test';

import {
  computeChapterMetrics,
  computeCrossChapterRepeatedNgrams,
  computeDeterministicMetricsReport,
  computeDialogueContractionRate,
  computeDialogueTagMetrics,
  computeEndingModeDistribution,
  computeSentenceLengthMetrics,
  computeStockPhraseCounts,
  computeWithinChapterRepeatedNgrams,
  computeWordCountDistribution,
  countWords,
  ngrams,
  splitSentences,
  tokenizeWords,
} from '@modules/eval/deterministic-metrics';

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
