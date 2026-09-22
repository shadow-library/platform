import { describe, expect, it } from 'bun:test';

import { validateQuestDuplicateSearch } from '@/features/quests';

describe('validateQuestDuplicateSearch', () => {
  it('should keep well-formed values', () => {
    expect(
      validateQuestDuplicateSearch({
        duplicateName: 'Strength session',
        duplicateStatAffinity: 'body',
        duplicateStrictness: 'anchor',
        duplicateStartTimeMinutes: 1080,
        duplicateDurationMinutes: 50,
        duplicateFrequency: 'weekly',
        duplicateInterval: 1,
        duplicateDays: ['tue', 'thu', 'sat'],
        duplicateThreshold: true,
      }),
    ).toEqual({
      duplicateName: 'Strength session',
      duplicateStatAffinity: 'body',
      duplicateStrictness: 'anchor',
      duplicateStartTimeMinutes: 1080,
      duplicateDurationMinutes: 50,
      duplicateFrequency: 'weekly',
      duplicateInterval: 1,
      duplicateDays: ['tue', 'thu', 'sat'],
      duplicateThreshold: true,
    });
  });

  it('should fall back to undefined for an unrecognised strictness', () => {
    expect(validateQuestDuplicateSearch({ duplicateStrictness: 'bogus' }).duplicateStrictness).toBeUndefined();
  });

  it('should fall back to undefined for a strictness the builder never offers', () => {
    expect(validateQuestDuplicateSearch({ duplicateStrictness: 'recovery' }).duplicateStrictness).toBeUndefined();
  });

  it('should fall back to undefined for a frequency the builder never offers', () => {
    expect(validateQuestDuplicateSearch({ duplicateFrequency: 'monthly' }).duplicateFrequency).toBeUndefined();
    expect(validateQuestDuplicateSearch({ duplicateFrequency: 'yearly' }).duplicateFrequency).toBeUndefined();
  });

  it('should fall back to undefined for an unrecognised stat affinity', () => {
    expect(validateQuestDuplicateSearch({ duplicateStatAffinity: 'luck' }).duplicateStatAffinity).toBeUndefined();
  });

  it('should fall back to undefined for a start time outside 0–1439', () => {
    expect(validateQuestDuplicateSearch({ duplicateStartTimeMinutes: 1440 }).duplicateStartTimeMinutes).toBeUndefined();
    expect(validateQuestDuplicateSearch({ duplicateStartTimeMinutes: -1 }).duplicateStartTimeMinutes).toBeUndefined();
  });

  it('should fall back to undefined for a duration outside the builder’s stepper bounds', () => {
    expect(validateQuestDuplicateSearch({ duplicateDurationMinutes: 99999 }).duplicateDurationMinutes).toBeUndefined();
  });

  it('should fall back to undefined for an interval outside the builder’s stepper bounds', () => {
    expect(validateQuestDuplicateSearch({ duplicateInterval: 0 }).duplicateInterval).toBeUndefined();
    expect(validateQuestDuplicateSearch({ duplicateInterval: 31 }).duplicateInterval).toBeUndefined();
  });

  it('should drop unrecognised weekdays and fall back to undefined when none remain', () => {
    expect(validateQuestDuplicateSearch({ duplicateDays: ['mon', 'nope'] }).duplicateDays).toEqual(['mon']);
    expect(validateQuestDuplicateSearch({ duplicateDays: ['nope'] }).duplicateDays).toBeUndefined();
  });

  it('should cap the name length', () => {
    expect(validateQuestDuplicateSearch({ duplicateName: 'x'.repeat(121) }).duplicateName).toBeUndefined();
    expect(validateQuestDuplicateSearch({ duplicateName: '' }).duplicateName).toBeUndefined();
  });

  it('should ignore a non-numeric or non-string value for every field', () => {
    expect(
      validateQuestDuplicateSearch({
        duplicateName: 42,
        duplicateStartTimeMinutes: '9',
        duplicateThreshold: 'true',
        duplicateDays: 'mon',
      }),
    ).toEqual({});
  });
});
