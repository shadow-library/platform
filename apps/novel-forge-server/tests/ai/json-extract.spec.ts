import { describe, expect, it } from 'bun:test';

import { extractJsonCandidates, tryParseJson } from '@modules/ai/json-extract';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { type ValidationOutput, ValidationSchema } from '@modules/ai/schemas/validation.schema';
import { parseSchema } from '@modules/ai/schemas/validate';

const firstCandidate = (text: string): unknown => extractJsonCandidates(text)[0];

describe('the first candidate of extractJsonCandidates', () => {
  it('should recover an object whose string value carries an unbalanced closing brace', () => {
    const raw = 'Here is the verdict:\n{"verdict":"consistent","findings":[{"severity":"soft","text":"the sigil closes with a } glyph"}]}';
    expect(firstCandidate(raw)).toEqual({ verdict: 'consistent', findings: [{ severity: 'soft', text: 'the sigil closes with a } glyph' }] });
  });

  it('should recover an object whose string value carries an unbalanced opening brace', () => {
    expect(firstCandidate('{"reply":"the ward opens with a { and never shuts"}')).toEqual({ reply: 'the ward opens with a { and never shuts' });
  });

  it('should not let an escaped quote inside a string end the string', () => {
    expect(firstCandidate('{"reply":"she said \\"close the } gate\\" and left"}')).toEqual({ reply: 'she said "close the } gate" and left' });
  });

  it('should ignore a stray closing brace in the prose before the object', () => {
    expect(firstCandidate('the previous draft ended } abruptly\n{"verdict":"consistent"}')).toEqual({ verdict: 'consistent' });
  });

  it('should recover an object wrapped in a markdown fence', () => {
    expect(firstCandidate('```json\n{"verdict":"consistent","findings":[]}\n```')).toEqual({ verdict: 'consistent', findings: [] });
  });

  it('should return nothing when no balanced object is present', () => {
    expect(firstCandidate('I cannot help with that request.')).toBeUndefined();
    expect(firstCandidate('{"verdict":"consistent"')).toBeUndefined();
  });

  it('should skip a balanced run that is not JSON and return the object after it', () => {
    expect(firstCandidate('use {placeholder} here\n{"verdict":"consistent"}')).toEqual({ verdict: 'consistent' });
  });
});

describe('extractJsonCandidates', () => {
  it('should return every parseable object in document order', () => {
    const raw = 'Reasoning first: {"note":"thinking out loud"}\n\nFinal answer:\n{"verdict":"consistent","findings":[]}';
    expect(extractJsonCandidates(raw)).toEqual([{ note: 'thinking out loud' }, { verdict: 'consistent', findings: [] }]);
  });

  it('should return an empty list when nothing parses', () => {
    expect(extractJsonCandidates('no json here { at all')).toEqual([]);
  });
});

describe('tryParseJson', () => {
  it('should return a clean payload without extraction', () => {
    expect(tryParseJson('{"verdict":"consistent"}')).toEqual({ verdict: 'consistent' });
  });

  it('should fall back to extraction when the whole text is not JSON', () => {
    expect(tryParseJson('Certainly!\n{"verdict":"consistent"}\nHope that helps.')).toEqual({ verdict: 'consistent' });
  });
});

describe('the one helper shared by the router, the judge and the validation graph', () => {
  it('should recover a prose-wrapped judge payload the chapter-generation graph would have parsed itself', () => {
    const raw = 'Thoughts:\n{"verdict":"contradiction","findings":[{"severity":"hard","text":"the ward glyph } is described twice"}]}';
    const parsed = parseSchema<JudgeOutput>(JudgeSchema, firstCandidate(raw));
    expect(parsed.success).toBe(true);
  });

  it('should recover a prose-wrapped validation payload the novel-validation graph would have parsed itself', () => {
    const raw =
      'Report follows.\n{"issues":[{"severity":"error","category":"continuity","description":"the } marker moves between chapters"}],"summary":"one continuity break, otherwise healthy"}';
    const parsed = parseSchema<ValidationOutput>(ValidationSchema, firstCandidate(raw));
    expect(parsed.success).toBe(true);
  });
});
