import { describe, expect, it } from 'bun:test';

import { countTokens } from '@modules/ai/context/token-budget';
import { DEFAULT_WRITING_INSTRUCTIONS } from '@modules/ai/prompts/authoring-preamble';
import {
  effectiveWritingInstructions,
  LEGACY_DEFAULT_WRITING_INSTRUCTIONS,
  PROJECT_ADDITIONS_HEADING,
  resolveWritingInstructions,
  writingInstructionAdditions,
} from '@modules/ai/prompts/writing-instructions';

describe('writingInstructionAdditions', () => {
  it('should return null for a missing or blank value', () => {
    expect(writingInstructionAdditions(null)).toBeNull();
    expect(writingInstructionAdditions(undefined)).toBeNull();
    expect(writingInstructionAdditions('  \n\n ')).toBeNull();
  });

  it('should keep the author’s own rules trimmed', () => {
    expect(writingInstructionAdditions('  Write in first person.\n')).toBe('Write in first person.');
  });

  it('should treat a stored copy of the current default as no additions', () => {
    expect(writingInstructionAdditions(DEFAULT_WRITING_INSTRUCTIONS)).toBeNull();
  });

  it('should strip an embedded copy of the default and keep what surrounds it', () => {
    const stored = `Keep swearing mild.\n\n${DEFAULT_WRITING_INSTRUCTIONS}\n\nEnd every chapter on a hook.`;
    expect(writingInstructionAdditions(stored)).toBe('Keep swearing mild.\n\nEnd every chapter on a hook.');
  });

  it('should strip a copy saved with Windows line endings and trailing spaces', () => {
    const stored = `${DEFAULT_WRITING_INSTRUCTIONS.replace(/\n/g, '  \r\n')}\r\n\r\nPresent tense.`;
    expect(writingInstructionAdditions(stored)).toBe('Present tense.');
  });

  it('should strip a verbatim copy of every earlier built-in default', () => {
    for (const legacy of LEGACY_DEFAULT_WRITING_INSTRUCTIONS) expect(writingInstructionAdditions(`${legacy}\n\nWrite in first person.`)).toBe('Write in first person.');
  });

  it('should strip the default lines of a lightly edited legacy copy and keep only the author’s own', () => {
    const [legacy = ''] = LEGACY_DEFAULT_WRITING_INSTRUCTIONS.slice(-1);
    const edited = legacy
      .replace('- Keep action and dialogue paragraphs short.', '- Keep  action and dialogue paragraphs VERY short.')
      .replace('- Use common, modern vocabulary.', '-   Use common,   modern vocabulary.   ')
      .replace('Originality\n', 'Originality\n- Never use the word "suddenly".\n');

    expect(resolveWritingInstructions(`Write in first person.\n\n${edited}`)).toEqual({
      additions: 'Write in first person.\n\n- Keep  action and dialogue paragraphs VERY short.\n\n- Never use the word "suddenly".',
      removedDefaultCopy: true,
    });
  });

  it('should leave the author’s own rules alone when they share only a few lines with a default', () => {
    const own = 'Write in first person.\n- Use contractions unless the character is deliberately formal.\n- Keep most turns concise.';
    expect(resolveWritingInstructions(own)).toEqual({ additions: own, removedDefaultCopy: false });
  });

  it('should report that a verbatim copy was removed', () => {
    expect(resolveWritingInstructions(`${DEFAULT_WRITING_INSTRUCTIONS}\n\nPresent tense.`)).toEqual({ additions: 'Present tense.', removedDefaultCopy: true });
    expect(resolveWritingInstructions('Present tense.')).toEqual({ additions: 'Present tense.', removedDefaultCopy: false });
  });
});

describe('effectiveWritingInstructions', () => {
  it('should be the default alone when the project has no additions', () => {
    expect(effectiveWritingInstructions(null)).toEqual({ text: DEFAULT_WRITING_INSTRUCTIONS, truncated: false });
  });

  it('should put the additions after the default under a heading that gives them precedence', () => {
    const { text, truncated } = effectiveWritingInstructions('Write in first person.');
    expect(truncated).toBe(false);
    expect(text).toBe(`${DEFAULT_WRITING_INSTRUCTIONS}\n\n${PROJECT_ADDITIONS_HEADING}\n\nWrite in first person.`);
    expect(PROJECT_ADDITIONS_HEADING).toContain('Where they conflict with the default above, follow these.');
  });

  it('should trim the additions, never the default, to fit the token cap', () => {
    const additions = Array.from({ length: 200 }, (_, i) => `Rule ${i}: the ferry crew speak in short, clipped sentences.`).join('\n\n');
    const { text, truncated } = effectiveWritingInstructions(additions, 1_500);
    expect(truncated).toBe(true);
    expect(text.startsWith(DEFAULT_WRITING_INSTRUCTIONS)).toBe(true);
    expect(text).toContain('Rule 0:');
    expect(text).not.toContain('Rule 199:');
    expect(countTokens(text)).toBeLessThanOrEqual(1_500);
  });

  it('should leave the default well under the writing-style cap', () => {
    expect(countTokens(DEFAULT_WRITING_INSTRUCTIONS)).toBeLessThan(1_500);
  });
});
