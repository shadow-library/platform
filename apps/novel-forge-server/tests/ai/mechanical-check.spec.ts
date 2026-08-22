import { describe, expect, it } from 'bun:test';

import { checkDraftMechanics, DUPLICATE_PARAGRAPH_MIN_WORDS, findDuplicatedParagraphs, WORD_COUNT_HARD_MAX, WORD_COUNT_HARD_MIN } from '@modules/ai/graphs/mechanical-check';
import { WORD_TARGET_MAX, WORD_TARGET_MIN } from '@modules/eval/deterministic-metrics';

const SENTENCE = 'She climbed the ridge and did not look back. ';
const SENTENCE_WORDS = 9;

function bodyOfWords(words: number): string {
  return SENTENCE.repeat(Math.ceil(words / SENTENCE_WORDS)).trim();
}

const CLEAN_BODY = bodyOfWords(WORD_TARGET_MIN + 100);

describe('checkDraftMechanics', () => {
  it('should return no findings for a draft inside the target band with no other issues', () => {
    expect(checkDraftMechanics(CLEAN_BODY, [])).toEqual([]);
  });

  it('should report a hard finding when the draft is below the word floor', () => {
    const findings = checkDraftMechanics(bodyOfWords(WORD_COUNT_HARD_MIN - 200), []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('hard');
    expect(findings[0]?.text).toContain('below');
  });

  it('should report a hard finding when the draft is above the word ceiling', () => {
    const findings = checkDraftMechanics(bodyOfWords(WORD_COUNT_HARD_MAX + 200), []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('hard');
    expect(findings[0]?.text).toContain('above');
  });

  it('should report a soft finding when the draft is outside the target band but inside the hard bounds', () => {
    const short = checkDraftMechanics(bodyOfWords(WORD_TARGET_MIN - 200), []);
    expect(short).toHaveLength(1);
    expect(short[0]?.severity).toBe('soft');
    expect(short[0]?.text).toContain('under');

    const long = checkDraftMechanics(bodyOfWords(WORD_TARGET_MAX + 200), []);
    expect(long).toHaveLength(1);
    expect(long[0]?.severity).toBe('soft');
    expect(long[0]?.text).toContain('over');
  });

  it('should report a hard finding when a paragraph is repeated verbatim', () => {
    const paragraph = bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10);
    const findings = checkDraftMechanics(`${CLEAN_BODY}\n\n${paragraph}\n\n${paragraph}`, []);
    expect(findings.filter(f => f.severity === 'hard')).toHaveLength(1);
    expect(findings[0]?.text).toContain('repeated verbatim');
  });

  it('should report a soft finding when too many phrases repeat from the prior chapters', () => {
    const shared = bodyOfWords(400);
    const findings = checkDraftMechanics(`${shared} ${bodyOfWords(1500).replace(/ridge/g, 'harbour')}`, [shared]);
    const ngramFinding = findings.find(f => f.text.includes('also appear in the previous'));
    expect(ngramFinding?.severity).toBe('soft');
  });

  it('should not compare against prior chapters when none are supplied', () => {
    expect(checkDraftMechanics(CLEAN_BODY, []).some(f => f.text.includes('also appear in the previous'))).toBe(false);
  });

  it('should report a soft finding when the draft leans on stock phrases', () => {
    const cliches = 'Her eyes narrowed. His jaw tightened. Her breath hitched. His eyes widened. Her stomach dropped. His blood ran cold. She raised an eyebrow. ';
    const findings = checkDraftMechanics(`${CLEAN_BODY} ${cliches}`, []);
    const stockFinding = findings.find(f => f.text.includes('stock phrases'));
    expect(stockFinding?.severity).toBe('soft');
  });

  it('should report a soft finding when dialogue tags crowd the prose', () => {
    const chatter = '"Run," Mara shouted. "Now," Elin growled. "Wait," Mara hissed. "Why," Elin demanded. "Go," Mara whispered. '.repeat(12);
    const findings = checkDraftMechanics(`${bodyOfWords(WORD_TARGET_MIN)} ${chatter}`, []);
    expect(findings.find(f => f.text.includes('dialogue tags per 1,000 words'))?.severity).toBe('soft');
    expect(findings.find(f => f.text.includes('avoid "said"'))?.severity).toBe('soft');
  });

  it('should never emit a hard finding for a purely stylistic problem', () => {
    const cliches = 'Her eyes narrowed. His jaw tightened. Her breath hitched. His eyes widened. Her stomach dropped. His blood ran cold. She raised an eyebrow. ';
    expect(checkDraftMechanics(`${CLEAN_BODY} ${cliches}`, []).every(f => f.severity === 'soft')).toBe(true);
  });
});

describe('findDuplicatedParagraphs', () => {
  it('should ignore paragraphs shorter than the minimum word count', () => {
    const short = 'He waited.';
    expect(findDuplicatedParagraphs(`${short}\n\n${short}`)).toEqual([]);
  });

  it('should not flag two long paragraphs that merely start alike', () => {
    const first = `${bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10)} The gate held.`;
    const second = `${bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10)} The gate gave way.`;
    expect(findDuplicatedParagraphs(`${first}\n\n${second}`)).toEqual([]);
  });

  it('should treat whitespace-only differences as the same paragraph', () => {
    const paragraph = bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10);
    expect(findDuplicatedParagraphs(`${paragraph}\n\n${paragraph.replace(/ /g, '  ')}`)).toHaveLength(1);
  });
});
