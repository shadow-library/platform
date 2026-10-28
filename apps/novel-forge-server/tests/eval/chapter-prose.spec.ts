import { describe, expect, it } from 'bun:test';

import { proseOnly, splitChapterProse } from '@modules/eval/chapter-prose';
import { countProseWords, countWords } from '@modules/eval/deterministic-metrics';

const STATUS_PANEL = [
  '```system Character Attributes',
  '| Attribute | Value |',
  '| --- | --- |',
  '| Strength | 14 |',
  '',
  '**New skill unlocked:** Basic Mechanics (Lv 1)',
  '```',
].join('\n');

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

describe('splitChapterProse', () => {
  it('should drop a titled system panel and keep the prose around it', () => {
    const result = splitChapterProse(`Kai blinked.\n\n${STATUS_PANEL}\n\nHe read it twice.`);

    expect(words(result.prose)).toEqual(['Kai', 'blinked.', 'He', 'read', 'it', 'twice.']);
    expect(result.unclosedFence).toBeNull();
  });

  it('should drop an untitled system panel and a tilde one', () => {
    expect(words(proseOnly('Before.\n```system\nQuest accepted.\n```\nAfter.'))).toEqual(['Before.', 'After.']);
    expect(words(proseOnly('Before.\n~~~system Quest\nFind the well.\n~~~\nAfter.'))).toEqual(['Before.', 'After.']);
  });

  it('should keep the text of a fence that is not a system panel and drop only its markers', () => {
    expect(words(proseOnly('```markdown\nShe ran.\n\nHe followed.\n```'))).toEqual(['She', 'ran.', 'He', 'followed.']);
    expect(words(proseOnly('```\nA sign read: CLOSED.\n```'))).toEqual(['A', 'sign', 'read:', 'CLOSED.']);
  });

  it('should not close a fence on a shorter or different marker', () => {
    expect(words(proseOnly('````system\n```\nStill inside.\n````\nOutside.'))).toEqual(['Outside.']);
    expect(words(proseOnly('```system\n~~~\nStill inside.\n```\nOutside.'))).toEqual(['Outside.']);
  });

  it('should treat an unclosed system panel as running to the end and report it', () => {
    const result = splitChapterProse('She opened the menu.\n\n```system Inventory\n| Item | Count |\n| --- | --- |\n| Rope | 1 |\n\nShe closed it.');

    expect(words(result.prose)).toEqual(['She', 'opened', 'the', 'menu.']);
    expect(result.unclosedFence).toBe('```system Inventory');
  });

  it('should keep the text of an unclosed plain fence but still report it', () => {
    const result = splitChapterProse('```\nShe ran.');

    expect(words(result.prose)).toEqual(['She', 'ran.']);
    expect(result.unclosedFence).toBe('```');
  });

  it('should drop tables with and without leading pipes', () => {
    expect(words(proseOnly('Stats:\n\n| Skill | Lv |\n| :--- | ---: |\n| Smithing | 2 |\n\nDone.'))).toEqual(['Stats:', 'Done.']);
    expect(words(proseOnly('Stats:\n\nSkill | Lv\n--- | ---\nSmithing | 2\nMining | 1\n\nDone.'))).toEqual(['Stats:', 'Done.']);
  });

  it('should end a table at a blank line or at the start of another block', () => {
    expect(words(proseOnly('| A | B |\n| --- | --- |\n| 1 | 2 |\n# Next\nText.'))).toEqual(['#', 'Next', 'Text.']);
  });

  it('should keep a pipe in ordinary prose that has no divider row under it', () => {
    const text = 'He wrote A | B on the board.\nNobody answered.';

    expect(proseOnly(text)).toBe(text);
  });

  it('should not read a header and divider with different cell counts as a table', () => {
    const text = 'Left | right | centre\n--- | ---';

    expect(proseOnly(text)).toBe(text);
  });

  it('should read CRLF text the same as LF text', () => {
    const lf = `Kai blinked.\n\n${STATUS_PANEL}\n\nHe read it twice.`;

    expect(proseOnly(lf.replace(/\n/g, '\r\n'))).toBe(proseOnly(lf));
  });

  it('should leave a chapter with no panels or tables as it is', () => {
    const text = 'Mara reached the gate.\n\n"Name?" the guard asked.';

    expect(splitChapterProse(text)).toEqual({ prose: text, unclosedFence: null });
  });

  it('should leave no prose in a chapter that is only a table or only a system panel', () => {
    expect(countProseWords('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(0);
    expect(countProseWords(`${STATUS_PANEL}`)).toBe(0);
  });
});

describe('countProseWords', () => {
  it('should count the prose and leave panels and tables out of the total', () => {
    const chapter = `Kai blinked.\n\n${STATUS_PANEL}\n\n| Quest | Reward |\n| --- | --- |\n| Fix the pump | 40 XP |\n\nHe read it twice.`;

    expect(countProseWords(chapter)).toBe(6);
    expect(countWords(chapter)).toBeGreaterThan(6);
  });
});
