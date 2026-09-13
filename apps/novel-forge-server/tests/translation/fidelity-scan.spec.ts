import { describe, expect, it } from 'bun:test';

import { scanFidelity, type TranslationTermLike, ZH_PROFILE } from '@modules/translation';

function issuesOf(input: Parameters<typeof scanFidelity>[0]) {
  return scanFidelity(input).map(issue => issue.type);
}

describe('scanFidelity — source_script_residue', () => {
  it('should flag source-script characters left in the translation', () => {
    const issues = scanFidelity({ original: '叶辰走进大殿。', translation: 'Ye Chen walked into the 大殿.', entries: [], profile: ZH_PROFILE });
    const issue = issues.find(i => i.type === 'source_script_residue');
    expect(issue).toBeDefined();
    expect(issue?.excerpt).toContain('大殿');
  });

  it('should ignore residue that is exactly a preserve-treatment term', () => {
    const entries: TranslationTermLike[] = [{ sourceTerm: '大殿', variants: [], target: 'the Grand Hall', category: 'place', treatment: 'preserve', status: 'approved' }];
    const issues = issuesOf({ original: '叶辰走进大殿。', translation: 'Ye Chen walked into the 大殿.', entries, profile: ZH_PROFILE });
    expect(issues).not.toContain('source_script_residue');
  });
});

describe('scanFidelity — glossary_violation', () => {
  const entries: TranslationTermLike[] = [{ sourceTerm: '叶辰', variants: [], target: 'Ye Chen', category: 'character', treatment: 'translate', status: 'approved' }];

  it('should flag an approved term whose target never appears in the translation', () => {
    const issues = scanFidelity({ original: '叶辰对着长老鞠躬。', translation: 'He bowed to the elder.', entries, profile: ZH_PROFILE });
    const issue = issues.find(i => i.type === 'glossary_violation');
    expect(issue).toBeDefined();
    expect(issue?.excerpt).toContain('叶辰');
  });

  it('should not flag a term whose target is present', () => {
    const issues = issuesOf({ original: '叶辰对着长老鞠躬。', translation: 'Ye Chen bowed to the elder.', entries, profile: ZH_PROFILE });
    expect(issues).not.toContain('glossary_violation');
  });

  it('should never flag a rejected entry', () => {
    const rejected: TranslationTermLike[] = [{ sourceTerm: '叶辰', variants: [], target: 'Ye Chen', category: 'character', treatment: 'translate', status: 'rejected' }];
    const issues = issuesOf({ original: '叶辰对着长老鞠躬。', translation: 'He bowed to the elder.', entries: rejected, profile: ZH_PROFILE });
    expect(issues).not.toContain('glossary_violation');
  });
});

describe('scanFidelity — number_drift', () => {
  it('should normalise full-width digits and flag a missing number', () => {
    const issues = scanFidelity({ original: '他有１２个人马，还有5把剑。', translation: 'He had 12 men.', entries: [], profile: ZH_PROFILE });
    const issue = issues.find(i => i.type === 'number_drift' && i.detail.includes('missing'));
    expect(issue?.detail).toContain('5');
  });

  it('should flag an extra number not present in the original', () => {
    const issues = scanFidelity({ original: '他很强。', translation: 'He was very strong, reaching level 99.', entries: [], profile: ZH_PROFILE });
    const issue = issues.find(i => i.type === 'number_drift' && i.detail.includes('unexpected'));
    expect(issue?.detail).toContain('99');
  });

  it('should not flag matching numbers after full-width normalisation', () => {
    const issues = issuesOf({ original: '他有１２个人马。', translation: 'He had 12 men.', entries: [], profile: ZH_PROFILE });
    expect(issues).not.toContain('number_drift');
  });
});

describe('scanFidelity — paragraph_drift', () => {
  const original = '叶辰走进大殿。\n\n他鞠躬行礼。\n\n长老点了点头。\n\n他转身离开。';

  it('should flag a paragraph count ratio outside the band', () => {
    const issues = issuesOf({ original, translation: 'Ye Chen walked into the hall, bowed, and the elder nodded before he turned to leave.', entries: [], profile: ZH_PROFILE });
    expect(issues).toContain('paragraph_drift');
  });

  it('should not flag a matching paragraph count', () => {
    const translation = 'Ye Chen walked into the hall.\n\nHe bowed.\n\nThe elder nodded.\n\nHe turned to leave.';
    const issues = issuesOf({ original, translation, entries: [], profile: ZH_PROFILE });
    expect(issues).not.toContain('paragraph_drift');
  });

  it('should respect a caller-supplied paragraph ratio band override', () => {
    const translation = 'Ye Chen walked into the hall.\n\nHe bowed.\n\nThe elder nodded.\n\nHe turned to leave.';
    const issues = issuesOf({ original, translation, entries: [], profile: ZH_PROFILE, bands: { paragraphRatio: [2, 3] } });
    expect(issues).toContain('paragraph_drift');
  });
});

describe('scanFidelity — dialogue_drift', () => {
  const original = '「你好」他说道。「你好」她回答道。';

  it('should flag a large drop in quote marks', () => {
    const issues = issuesOf({ original, translation: 'He greeted her. She greeted him back.', entries: [], profile: ZH_PROFILE });
    expect(issues).toContain('dialogue_drift');
  });

  it('should not flag when the quote count is preserved', () => {
    const translation = '"Hello," he said. "Hello," she replied.';
    const issues = issuesOf({ original, translation, entries: [], profile: ZH_PROFILE });
    expect(issues).not.toContain('dialogue_drift');
  });

  it('should not flag dialogue drift when the original has fewer than four quote marks', () => {
    const issues = issuesOf({ original: '「你好」他说道。', translation: 'He greeted her.', entries: [], profile: ZH_PROFILE });
    expect(issues).not.toContain('dialogue_drift');
  });
});

describe('scanFidelity — length_band', () => {
  it('should flag a translation far outside the length band', () => {
    const issues = issuesOf({ original: 'x'.repeat(10), translation: 'y'.repeat(80), entries: [], profile: ZH_PROFILE });
    expect(issues).toContain('length_band');
  });

  it('should not flag a translation within the length band', () => {
    const issues = issuesOf({ original: 'x'.repeat(10), translation: 'y'.repeat(20), entries: [], profile: ZH_PROFILE });
    expect(issues).not.toContain('length_band');
  });

  it('should respect a caller-supplied length band override', () => {
    const issues = issuesOf({ original: 'x'.repeat(10), translation: 'y'.repeat(20), entries: [], profile: ZH_PROFILE, bands: { lengthRatio: [3, 5] } });
    expect(issues).toContain('length_band');
  });
});
