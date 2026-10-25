import { describe, expect, it } from 'bun:test';

import {
  aliasName,
  appName,
  capabilityName,
  dataPolicyName,
  effortName,
  modelName,
  providerName,
  scopeName,
  selectorName,
  taskKindName,
  taskName,
  taskTitle,
  windowName,
} from '../src/features/shared/naming';

describe('naming', () => {
  it('should title-case an app key', () => {
    expect(appName('novel-forge')).toBe('Novel Forge');
    expect(appName('memoir')).toBe('Memoir');
  });

  it('should name a task by its label, else by its humanised name', () => {
    expect(taskName({ name: 'chat', label: 'Story chat' })).toBe('Story chat');
    expect(taskName({ name: 'receipt-structuring' })).toBe('Receipt structuring');
    expect(taskName({ name: 'chat', label: '  ' })).toBe('Chat');
    expect(taskTitle({ app: 'novel-forge', name: 'chat' })).toBe('Novel Forge · Chat');
  });

  it('should name models and aliases by label, falling back to the key', () => {
    expect(modelName({ key: 'opus-5.5', label: 'Opus 5.5' })).toBe('Opus 5.5');
    expect(modelName({ key: 'opus-5.5' })).toBe('opus-5.5');
    expect(aliasName({ key: 'opus', label: 'Opus' })).toBe('Opus');
  });

  it('should humanise provider and selector keys', () => {
    expect(providerName('subscription')).toBe('Subscription');
    expect(selectorName('content_mode')).toBe('Content mode');
  });

  it('should word budget windows and scopes, passing unknown ones through', () => {
    expect([windowName('1h'), windowName('1d'), windowName('30d'), windowName('7d')]).toEqual(['per hour', 'per day', 'per 30 days', 'per 7d']);
    expect([scopeName('subject'), scopeName('app')]).toEqual(['each user', 'whole app']);
  });

  it('should word efforts', () => {
    expect([effortName('xhigh'), effortName('max'), effortName('none')]).toEqual(['Extra high', 'Maximum', 'None']);
  });
});

describe('capabilityName', () => {
  it('should call image output by the name the Models screen uses', () => {
    expect(capabilityName('image_output')).toBe('Image output');
  });
});

describe('naming lookups', () => {
  it('should never resolve a prototype key to an inherited value', () => {
    expect(windowName('constructor')).toBe('per constructor');
    expect(scopeName('constructor')).toBe('constructor');
    expect(effortName('toString')).toBe('ToString');
    expect(dataPolicyName('constructor')).toBe('Constructor');
    expect(taskKindName('__proto__')).toBe('Proto');
    expect(capabilityName('hasOwnProperty')).toBe('HasOwnProperty');
  });
});
