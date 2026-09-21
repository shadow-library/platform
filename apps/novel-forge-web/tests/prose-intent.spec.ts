import { describe, expect, it } from 'bun:test';

import { looksLikeProseEdit } from '../src/lib/prose-intent';

describe('looksLikeProseEdit', () => {
  it.each([
    'Rewrite the prose of chapter 3 so it moves faster.',
    'The dialogue in the market scene is stiff — fix it.',
    'Tighten the opening paragraphs.',
    'Rewrite chapter 12.',
    'Polish the scene where Orrin meets Pell.',
    "Chapter 2's draft still mentions the almanac — remove it.",
  ])('should suggest Edit prose for "%s"', message => {
    expect(looksLikeProseEdit(message)).toBe(true);
  });

  it.each([
    'Drop the Thornwake terminology, make Orrin a respected apprentice, and remove the symbolic date.',
    'Rewrite the brief for chapter 3 so Pell arrives earlier.',
    'Draft a new brief for chapter 9.',
    'Make the ending hook sharper.',
  ])('should not suggest Edit prose for "%s"', message => {
    expect(looksLikeProseEdit(message)).toBe(false);
  });

  it('should ignore the context line the Forge bar prepends', () => {
    expect(looksLikeProseEdit('[context: chapter:1 — "Chapter 1 draft"]\nRemove the almanac from the plan.')).toBe(false);
  });
});
