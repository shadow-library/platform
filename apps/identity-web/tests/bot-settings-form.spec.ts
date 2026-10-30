import { describe, expect, it } from 'bun:test';

import { applyOverrides, type BotSettingsSource, canSaveSettings, hasErrors, settingsBaseline, settingsErrors, settingsPatch } from '../src/features/bots/bot-settings-form';

const BOT: BotSettingsSource = { displayName: 'Ingest', description: 'Pushes chapters', ipAllowlist: ['10.0.0.0/16'], rateLimitPerMinute: 600 };
const baseline = settingsBaseline(BOT);

describe('settingsBaseline', () => {
  it('should mirror the bot with every IP marked valid and a missing description as empty', () => {
    expect(settingsBaseline({ ...BOT, description: undefined })).toEqual({
      displayName: 'Ingest',
      description: '',
      ipAllowlist: [{ value: '10.0.0.0/16', valid: true }],
      rateLimitPerMinute: 600,
    });
  });
});

describe('settingsPatch', () => {
  it('should be empty when nothing was overridden', () => {
    expect(settingsPatch(baseline, applyOverrides(baseline, {}))).toEqual({});
  });

  it('should send only the fields that changed across both sections', () => {
    const draft = applyOverrides(baseline, { displayName: 'Ingest v2', rateLimitPerMinute: 120 });
    expect(settingsPatch(baseline, draft)).toEqual({ displayName: 'Ingest v2', rateLimitPerMinute: 120 });
  });

  it('should treat whitespace-only edits as unchanged', () => {
    const draft = applyOverrides(baseline, { displayName: '  Ingest ', description: 'Pushes chapters  ' });
    expect(settingsPatch(baseline, draft)).toEqual({});
  });

  it('should clear a description with null', () => {
    expect(settingsPatch(baseline, applyOverrides(baseline, { description: '   ' }))).toEqual({ description: null });
  });

  it('should be empty when an edit is typed back to the saved value', () => {
    const draft = applyOverrides(baseline, { rateLimitPerMinute: 600, ipAllowlist: [{ value: '10.0.0.0/16', valid: true }] });
    expect(settingsPatch(baseline, draft)).toEqual({});
  });

  it('should send the full allowlist when a range is added or the list is emptied', () => {
    const added = applyOverrides(baseline, { ipAllowlist: [...baseline.ipAllowlist, { value: '192.168.1.0/24', valid: true }] });
    expect(settingsPatch(baseline, added)).toEqual({ ipAllowlist: ['10.0.0.0/16', '192.168.1.0/24'] });
    expect(settingsPatch(baseline, applyOverrides(baseline, { ipAllowlist: [] }))).toEqual({ ipAllowlist: [] });
  });

  it('should leave out invalid values instead of sending them', () => {
    const draft = applyOverrides(baseline, { displayName: ' ', rateLimitPerMinute: null, ipAllowlist: [...baseline.ipAllowlist, { value: 'nope', valid: false }] });
    expect(settingsPatch(baseline, draft)).toEqual({});
  });
});

describe('settingsErrors', () => {
  it('should report nothing for the saved settings', () => {
    expect(hasErrors(settingsErrors(baseline))).toBe(false);
  });

  it('should report each invalid field inline', () => {
    const errors = settingsErrors(applyOverrides(baseline, { displayName: '', rateLimitPerMinute: 0, ipAllowlist: [{ value: 'nope', valid: false }] }));
    expect(errors.displayName).toBe('Enter a display name.');
    expect(errors.ipAllowlist).toBe('Fix or remove the invalid IP range before continuing.');
    expect(errors.rateLimitPerMinute).toBeDefined();
  });
});

describe('canSaveSettings', () => {
  it('should stay disabled until something changes', () => {
    expect(canSaveSettings(baseline, baseline)).toBe(false);
  });

  it('should enable for a valid change', () => {
    expect(canSaveSettings(baseline, applyOverrides(baseline, { description: 'New' }))).toBe(true);
  });

  it('should stay disabled while any field is invalid, even alongside a valid change', () => {
    expect(canSaveSettings(baseline, applyOverrides(baseline, { description: 'New', rateLimitPerMinute: null }))).toBe(false);
    expect(canSaveSettings(baseline, applyOverrides(baseline, { description: 'New', ipAllowlist: [{ value: 'nope', valid: false }] }))).toBe(false);
  });
});
