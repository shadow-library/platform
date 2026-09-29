import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { answersSettled, currentAnswers, readAnswers, updateAnswers, writeAnswers } from '../src/features/chat/suggestion-store';
import { plannedCommit } from '../src/features/chat/use-suggestion-answering';

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

describe('suggestion answers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('should keep a card’s answers across a remount until they are cleared', () => {
    writeAnswers('p1', { decisions: [[0, 'add']], scopes: [[1, 'never']] });
    expect(readAnswers('p1')).toEqual({ decisions: [[0, 'add']], scopes: [[1, 'never']] });
    expect(readAnswers('p2')).toEqual({ decisions: [], scopes: [] });
    writeAnswers('p1', { decisions: [], scopes: [] });
    expect(readAnswers('p1')).toEqual({ decisions: [], scopes: [] });
  });

  it('should ignore anything stored that is not a card’s answers', () => {
    globalThis.sessionStorage.setItem('nf.chat-answers.p3', '{"decisions":"nope"}');
    expect(readAnswers('p3')).toEqual({ decisions: [], scopes: [] });
    globalThis.sessionStorage.setItem('nf.chat-answers.p4', 'not json');
    expect(readAnswers('p4')).toEqual({ decisions: [], scopes: [] });
  });
});

describe('shared answers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('should load a card’s answers from the tab’s storage once, then hand every reader the same changed answers', () => {
    writeAnswers('shared-1', { decisions: [[0, 'add']], scopes: [] });
    const loaded = currentAnswers('shared-1');
    expect([...loaded.decisions]).toEqual([[0, 'add']]);
    expect(currentAnswers('shared-1')).toBe(loaded);

    updateAnswers('shared-1', current => ({ ...current, decisions: new Map(current.decisions).set(1, 'decline'), committing: true }));
    expect([...currentAnswers('shared-1').decisions]).toEqual([
      [0, 'add'],
      [1, 'decline'],
    ]);
    expect(currentAnswers('shared-1').committing).toBe(true);
  });
});

describe('answersSettled', () => {
  const changeSet = [
    { op: 'entity.upsert', entityKey: 'council' },
    { op: 'entity.upsert', entityKey: 'maren' },
  ];
  const declined = new Map<number, 'add' | 'decline'>([
    [0, 'add'],
    [1, 'decline'],
  ]);

  it('should keep a pending card’s answers', () => {
    expect(answersSettled('pending', changeSet, declined, new Map())).toBe(false);
  });

  it('should keep a committed card’s answers until every decline has its scope', () => {
    expect(answersSettled('applied', changeSet, declined, new Map())).toBe(false);
    expect(answersSettled('applied', changeSet, declined, new Map([[1, 'never']]))).toBe(true);
    expect(answersSettled('discarded', changeSet, new Map([[0, 'add']]), new Map())).toBe(true);
  });

  it('should drop a replaced card’s answers at once', () => {
    expect(answersSettled('superseded', changeSet, declined, new Map())).toBe(true);
    expect(answersSettled('conflicted', changeSet, declined, new Map())).toBe(true);
  });

  it('should settle a declined action without a scope, since it is run or not rather than remembered', () => {
    const actionChangeSet = [{ op: 'action.organise_notes' }];
    expect(answersSettled('applied', actionChangeSet, new Map([[0, 'decline']]), new Map())).toBe(true);
  });
});

describe('plannedCommit', () => {
  const both = new Map<number, 'add' | 'decline'>([
    [0, 'add'],
    [1, 'decline'],
  ]);

  it('should commit a pending card once every suggestion has an answer', () => {
    expect(plannedCommit({ status: 'pending', committing: false, total: 2, decisions: both, force: false })).toEqual({ kind: 'apply', opIndexes: [0] });
    expect(plannedCommit({ status: 'pending', committing: false, total: 3, decisions: both, force: false })).toEqual({ kind: 'wait' });
  });

  it('should wait while another place commits the card, or once the cache says it already settled', () => {
    expect(plannedCommit({ status: 'pending', committing: true, total: 2, decisions: both, force: false })).toEqual({ kind: 'wait' });
    expect(plannedCommit({ status: 'applied', committing: false, total: 2, decisions: both, force: true })).toEqual({ kind: 'wait' });
  });
});
