import { describe, expect, it } from 'bun:test';

import { modelDisplayName, nameHoldsVersion } from '../src/features/shared/model-options';

describe('modelDisplayName', () => {
  it('should show the label alone when the model has no version', () => {
    expect(modelDisplayName({ key: 'opus', label: 'Opus' })).toBe('Opus');
    expect(modelDisplayName({ key: 'opus', label: 'Opus', version: '  ' })).toBe('Opus');
  });

  it('should append a version the label lacks', () => {
    expect(modelDisplayName({ key: 'opus', label: 'Opus', version: '5.5' })).toBe('Opus 5.5');
    expect(modelDisplayName({ key: 'gpt', label: 'GPT Sol', version: '2' })).toBe('GPT Sol 2');
  });

  it('should not repeat a version the label already carries, whatever its case', () => {
    expect(modelDisplayName({ key: 'opus-5.5', label: 'Opus 5.5', version: '5.5' })).toBe('Opus 5.5');
    expect(modelDisplayName({ key: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', version: 'v4' })).toBe('DeepSeek V4 Pro');
    expect(modelDisplayName({ key: 'kimi-k3', label: 'Kimi K3', version: 'k3' })).toBe('Kimi K3');
    expect(modelDisplayName({ key: 'kimi-k2.6', label: 'Kimi K2.6', version: 'k2.6' })).toBe('Kimi K2.6');
  });

  it('should fall back to the key and apply the same rule to it', () => {
    expect(modelDisplayName({ key: 'deepseek-v4-pro', label: '', version: 'v4' })).toBe('deepseek-v4-pro');
    expect(modelDisplayName({ key: 'opus', label: ' ', version: '5' })).toBe('opus 5');
  });
});

describe('nameHoldsVersion', () => {
  it('should match only a whole token', () => {
    expect(nameHoldsVersion('Opus 5.5', '5')).toBeFalse();
    expect(nameHoldsVersion('GPT-5.2', '2')).toBeFalse();
    expect(nameHoldsVersion('Kimi K2.6', 'k2')).toBeFalse();
    expect(nameHoldsVersion('Sonnet 45', '4')).toBeFalse();
  });

  it('should treat hyphens, spaces and brackets as token edges', () => {
    expect(nameHoldsVersion('GPT-5.4 Mini', '5.4')).toBeTrue();
    expect(nameHoldsVersion('Gemini (2025-06)', '2025-06')).toBeTrue();
  });

  it('should accept a leading "v" on either side', () => {
    expect(nameHoldsVersion('DeepSeek V4 Pro', '4')).toBeTrue();
    expect(nameHoldsVersion('DeepSeek 4 Pro', 'v4')).toBeTrue();
  });

  it('should read a version with pattern characters literally', () => {
    expect(nameHoldsVersion('Model 4+5', '4+5')).toBeTrue();
    expect(nameHoldsVersion('Model 4x5', '4.5')).toBeFalse();
  });
});
